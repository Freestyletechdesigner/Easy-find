require('dotenv').config();

// Fix 4: Startup check - exit if SESSION_SECRET is not set
if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Only trust proxy in production — on localhost this breaks req.ip and rate limiting
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Set broadcast helper on Express app instance so that route handlers can access it
app.set('broadcastProperty', (property) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'NEW_PROPERTY',
                property
            }));
        }
    });
});


app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
}));

// Compress all responses — reduces payload size by 60-80%
app.use(compression());

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL].filter(Boolean)
    : true;

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

const connectDB = require('./db.js');
connectDB().catch(err => { console.error('Failed to connect to DB:', err); process.exit(1); });
// API END POINT
const signup = require('./routes/signup.js');
const messageAPI = require('./routes/message.js');
const agent = require('./routes/agent.js');
const agentProfileUpload = require('./routes/agent-profile-upload.js');
const profileUpload = require('./routes/profile-upload.js');
const AGENT_POST = require('./routes/agent-upload.js');
const VIEW_POST = require('./routes/view-post.js');
const PAYMENT_FOR_BOOST = require('./routes/payment-for-boost.js');
const FEEDBACK = require('./routes/feedback.js');
const SEARCH_ENGINE = require('./routes/agent-search-engine.js');
const PROPERTY_REPORT = require('./routes/property-report.js');

// Database schema
const PageViews = require('./model/PageViews.js');

app.use('/api/paystack-webhook', express.raw({ type: 'application/json' }));

// Geocode location via Nominatim — server-side to avoid mobile CORS issues
app.get('/api/geocode', async (req, res) => {
    const { location } = req.query;
    if (!location) return res.json({ success: false });

    try {
        const query      = encodeURIComponent(`${location}, Enugu State, Nigeria`);
        const url        = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent':      'EasyFind/1.0',
                'Accept-Language': 'en'
            }
        });
        clearTimeout(timeout);

        const data = await response.json();
        if (data && data.length > 0) {
            res.json({ success: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        res.json({ success: false });
    }
});

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30// a month
    }
}));

function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        // If the request expects JSON or is an API request, return JSON response
        if (req.originalUrl.startsWith('/api/') || 
            req.xhr || 
            (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(403).json({
                success: false,
                message: 'Admin authentication required'
            });
        }
        // Otherwise, for browser navigation requests to admin pages, redirect to the login page
        return res.redirect('/admin/login');
    }
    next();
}

// Get page views — uses $inc for atomic concurrent-safe updates
app.get('/api/views', requireAdmin, async (req, res) => {
    try {
        const ip    = req.ip || req.socket?.remoteAddress;
        const today = new Date().toISOString().slice(0, 10);

        await PageViews.updateOne(
            { date: today },
            {
                $inc: { count: 1 },
                $addToSet: { ips: ip }
            },
            { upsert: true }
        );

        const record = await PageViews.findOneAndUpdate(
            { date: today },
            [
                {$set: { uniqueVisitors: { $size: "$ips" } }}
            ],
            { new: true }
        )

        res.json({
            success: true,
            views: record.count,
            uniqueVisitors: record.ips.length
        });
    } catch (err) {
        console.error('Error tracking views:', err);
        res.status(500).json({ success: false, message: 'Error tracking views', views: 0 });
    }
});

// Get views statistics for analytics dashboard
app.get('/api/views/stats', requireAdmin, async (req, res) => {
    try {
        // fetch last 14 days of records in one query
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const records = await PageViews.find({ date: { $gte: cutoffStr } }).lean();
        const byDate  = {};
        records.forEach(r => { byDate[r.date] = r; });

        // build this week (last 7 days)
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key   = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
            days.push({ label, count: byDate[key]?.count || 0 });
        }

        // previous week (days 8-14)
        const prevDays = [];
        for (let i = 13; i >= 7; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            prevDays.push(byDate[key]?.count || 0);
        }

        const totalViews     = records.reduce((s, r) => s + r.count, 0);
        const uniqueVisitors = new Set(records.flatMap(r => r.ips)).size;

        res.json({
            success: true,
            totalViews,
            uniqueVisitors,
            lastUpdated: new Date(),
            daily:        days,
            previousDaily: prevDays
        });
    } catch (err) {
        console.error('Error getting view stats:', err);
        res.status(500).json({ success: false, message: 'Error getting view statistics' });
    }
});


// Ensure required folders exist on startup
const uploadPropertyDir = path.join(__dirname, 'agent-loged', 'upload-property');
if (!fs.existsSync(uploadPropertyDir)) fs.mkdirSync(uploadPropertyDir, { recursive: true });


//Direct URL — static assets with cache headers
// No cache in development so changes are visible immediately
// Cache in production for performance
const staticOpts = process.env.NODE_ENV === 'production' ? { maxAge: '1h' }  : {};
const assetOpts  = process.env.NODE_ENV === 'production' ? { maxAge: '7d' }  : {};

// Cache busting — every server restart gets a new version token
// HTML files can reference ?v=BUILD_VERSION to force browser refresh
app.locals.v = process.env.NODE_ENV === 'production'
    ? (process.env.APP_VERSION || '1')
    : Date.now().toString();

// In development: send no-cache headers for JS/CSS so browser always fetches fresh
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-store');
        }
        next();
    });
}

app.use(express.static('public', staticOpts));
app.use('/admin', express.static('admin', staticOpts));
app.use('/agent-loged', express.static('agent-loged', staticOpts));
app.use('/agent-profiles', express.static('agent-profiles', assetOpts));
app.use('/property', express.static('public/property', staticOpts));
app.use('/login-agent', express.static('public/login-agent.html', staticOpts));
app.use('/signup-agent', express.static('public/signup-agent.html', staticOpts));
app.use('/agent-profile', express.static('public/agent-profile', staticOpts));
app.use('/agent-loged/upload-profilepicture', express.static('agent-loged/upload-image.html', staticOpts));
app.use('/agent-loged/setting', express.static('agent-loged/setting.html', staticOpts));
app.use('/agent-verification', express.static('agent-verification', staticOpts));
app.use('/appeal', express.static('appeal', staticOpts));
app.use('/boost-account', express.static('boost-account', staticOpts));
app.use('/password-reset', express.static('password-reset', staticOpts));

// ── Clean admin routes (no .html) ─────────────────────
const adminPages = ['dashboard', 'agents', 'analytics', 'inbox', 'projects', 'settings', 'feedback', 'file-uploader', 'login', 'reports'];
adminPages.forEach(page => {
    const file = page === 'dashboard' ? 'index' : page;
    if (page === 'login') {
        // Login page is public
        app.get(`/admin/${page}`, (req, res) => {
            res.sendFile(path.join(__dirname, 'admin', `${file}.html`));
        });
    } else {
        // Fix 15: All other admin pages require admin auth
        app.get(`/admin/${page}`, requireAdmin, (req, res) => {
            res.sendFile(path.join(__dirname, 'admin', `${file}.html`));
        });
    }
});

// ── Clean password-reset routes (no .html) ────────────
app.get('/password-reset/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'password-reset', 'forgot-password.html')));
app.get('/password-reset/verify-reset',    (req, res) => res.sendFile(path.join(__dirname, 'password-reset', 'verify-reset.html')));
app.get('/password-reset/verify-otp',      (req, res) => res.sendFile(path.join(__dirname, 'password-reset', 'verify-otp.html')));
app.get('/password-reset/reset-password',  (req, res) => res.sendFile(path.join(__dirname, 'password-reset', 'reset-password.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/our-agent', (req, res) => res.sendFile(path.join(__dirname, 'public', 'our-agent.html')));

// Terms 
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));

signup(app);
messageAPI(app);
agent(app);
agentProfileUpload(app);
profileUpload(app);
AGENT_POST(app);
VIEW_POST(app);
SEARCH_ENGINE(app);
PAYMENT_FOR_BOOST(app);
FEEDBACK(app);
PROPERTY_REPORT(app);

// Fix 25: Global error handler (must be before 404 handler)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

server.listen(process.env.PORT || 9000, '0.0.0.0', () => console.log('http://localhost:',process.env.PORT||9000))
