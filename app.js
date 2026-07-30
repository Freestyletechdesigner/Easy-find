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
const cron = require('node-cron');

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


app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", 
          "https://cdn.jsdelivr.net", 
          "https://accounts.google.com", 
          "https://unpkg.com", 
          "https://cdn.emailjs.com",
          "https://cdn.smileidentity.com",
          "'unsafe-inline'" 
        ],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"], 
        frameSrc: [
            "'self'", 
            "https://www.google.com", 
            "https://accounts.google.com",
            "https://cdn.smileidentity.com",
            "https://googleusercontent.com",
            "https://maps.google.com",
            "https://googleusercontent.com"
        ],
        connectSrc: [
          "'self'", 
          "https://easyfind.com.ng", 
          "https://api.paystack.co", 
          "https://nominatim.openstreetmap.org",
          "https://api.emailjs.com",
          "https://cdn.smileidentity.com",
          "https://unpkg.com",
          "https://accounts.google.com",
          "https://*.tile.openstreetmap.org"
        ], 
        imgSrc: [
          "'self'", 
          "data:", 
          "https:", 
          "https://*.tile.openstreetmap.org"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      },
    },
  })
);

// Add these explicit headers or update your existing Helmet configuration
app.use((req, res, next) => {
    // Allows Google to communicate with your localhost environment smoothly
    res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    next();
});

// Compress all responses — reduces payload size by 60-80%
app.use(compression());

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.APP_URL ? process.env.APP_URL.split(',') : [])
    : true;

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Add this near your other app.use statements
app.use((req, res, next) => {
  if (req.url.endsWith('.webp')) {
    res.setHeader('Content-Type', 'image/webp');
  } else if (req.url.endsWith('.jpg') || req.url.endsWith('.jpeg')) {
    res.setHeader('Content-Type', 'image/jpeg');
  }
  next();
});

const connectDB = require('./db.js');
connectDB().catch(err => { console.error('Failed to connect to DB:', err); process.exit(1); });
// API END POINT
const signup = require('./routes/signup.js');
const messageAPI = require('./routes/message.js');
const agent = require('./routes/agent.js');
const agentProfileUpload = require('./routes/agent-profile-upload.js');
const AGENT_POST = require('./routes/agent-upload.js');
const VIEW_POST = require('./routes/view-post.js');
const PAYMENT_FOR_BOOST = require('./routes/payment-for-boost.js');
const FEEDBACK = require('./routes/feedback.js');
const SEARCH_ENGINE     = require('./routes/agent-search-engine.js');
const PROPERTY_SEARCH   = require('./routes/property-search.js');
const PROPERTY_REPORT = require('./routes/property-report.js');
const NIN_VERIFICATION = require('./routes/agent-verification.js');
const PROJECTS = require('./routes/projects.js');
const COMMENT = require('./routes/comment.js');
const TRANSACTIONS = require('./routes/transactions.js');
const { runPipeline } = require('./routes/runPipeline.js');
// Database schema
const PageViews = require('./model/PageViews.js');
const VisitorLog = require('./model/VisitorLog.js');

// Add or update this in app.js
app.use(express.json({
    verify: (req, res, buf) => {
        // Capture raw bytes if the route is for verification OR boost webhooks
        if (req.originalUrl.startsWith('/api/verification/webhook') || 
            req.originalUrl.startsWith('/api/payment-boost/webhook')) { // Adjust this path to match your exact boost webhook path
            req.rawBody = buf;
        }
    }
}));


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
    proxy: true,
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
app.get('/api/views', async (req, res) => {
    try {
        // Use 'x-forwarded-for' if behind a proxy like Nginx or Cloudflare
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket?.remoteAddress;
        const today = new Date().toISOString().slice(0, 10);

        // 1. Try to record unique IP. 
        // The 'unique' index in VisitorLog prevents duplicate entries per day.
        const isNewVisitor = await VisitorLog.updateOne(
            { date: today, ip: ip },
            { $setOnInsert: { date: today, ip: ip } },
            { upsert: true }
        );

        // 2. Increment stats in PageViews
        const record = await PageViews.findOneAndUpdate(
            { date: today },
            { 
                $inc: { 
                    count: 1, 
                    uniqueVisitors: isNewVisitor.upsertedCount > 0 ? 1 : 0 
                } 
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            views: record.count,
            uniqueVisitors: record.uniqueVisitors
        });
    } catch (err) {
        console.error('Error tracking views:', err);
        res.status(500).json({ success: false, message: 'Error tracking views' });
    }
});

// Get views statistics for analytics dashboard
app.get('/api/views/stats', requireAdmin, async (req, res) => {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const records = await PageViews.find({ date: { $gte: cutoffStr } }).lean();
        const byDate = {};
        records.forEach(r => { byDate[r.date] = r; });

        // Build data using the pre-calculated 'uniqueVisitors' field
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push({ 
                label: d.toLocaleDateString('en-GB', { weekday: 'short' }), 
                count: byDate[key]?.count || 0 
            });
        }

        const totalViews = records.reduce((s, r) => s + r.count, 0);
        const totalUnique = records.reduce((s, r) => s + r.uniqueVisitors, 0);

        res.json({
            success: true,
            totalViews,
            uniqueVisitors: totalUnique,
            daily: days
        });
    } catch (err) {
        console.error('Error getting view stats:', err);
        res.status(500).json({ success: false, message: 'Error' });
    }
});

// Serve term and service to the user as first visit
app.get('/api/first-visit', async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket.remoteAddress;
    try {
        // Look for ANY entry with this IP in the logs
        const exists = await VisitorLog.findOne({ ip: ip });
        res.json({ firstVisit: !exists });
    } catch (error) {
        console.error('First visitor error:', error)
        res.status(500).json({ message: 'Error' });
    }
});


// Ensure required folders exist on startup
const uploadPropertyDir = path.join(__dirname, 'agent-loged', 'upload-property');
if (!fs.existsSync(uploadPropertyDir)) fs.mkdirSync(uploadPropertyDir, { recursive: true });


//Direct URL — static assets with cache headers
// No cache in development so changes are visible immediately
// Cache in production for performance
const staticOpts = process.env.NODE_ENV === 'production' ? { maxAge: '1h' }  : {};
const assetOpts  = process.env.NODE_ENV === 'production' ? { maxAge: '2d' }  : {};

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

// Function to force no-cache for HTML files
const noCacheHtml = (res, path) => {
    if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
};


app.use(express.static('public', { ...staticOpts, setHeaders: noCacheHtml }));
app.use('/admin', express.static('admin', { ...staticOpts, setHeaders: noCacheHtml }));
app.use('/agent-loged', express.static('agent-loged', staticOpts));
app.use('/agent-profiles', express.static('agent-profiles', assetOpts));
app.use('/property', express.static('public/property', staticOpts));
app.use('/login-agent', express.static('public/login-agent.html', staticOpts));
app.use('/signup-agent', express.static('public/signup-agent.html', staticOpts));
app.use('/agent-profile', express.static('public/agent-profile', staticOpts));
app.use('/agent-loged/upload-profilepicture', express.static('agent-loged/upload-image.html', staticOpts));
app.use('/agent-loged/setting', express.static('agent-loged/setting.html', staticOpts));
app.use('/appeal', express.static('appeal', staticOpts));
app.use('/boost-account', express.static('boost-account', staticOpts));
app.use('/password-reset', express.static('password-reset', staticOpts));
app.use('/verification-payment', express.static('verification-payment', staticOpts));
// Terms 
app.use('/terms', express.static('public/terms.html'));
app.use('/private-policy', express.static('public/private-policy.html'));

// ── Agent Verification page — gate by payment ─────────
// Session-independent: reads agentId from Paystack metadata so it works
// even if the session expired while the agent was on Paystack's payment page.
app.get('/agent-verification', async (req, res, next) => {
    const { reference, trxref } = req.query;
    const paymentRef = reference || trxref;

    const AgentUser = require('./model/AgentUser.js');
    const axios = require('axios');

    // Case 1: Paystack redirected back with a reference
    if (paymentRef) {
        try {
            const paystackRes = await axios.get(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRef)}`,
                { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
            );
            const txData = paystackRes.data?.data;

            if (txData && txData.status === 'success') {
                // Read agentId from metadata — works even without a session
                const agentId = txData.metadata?.agentId
                    || req.session?.agent?.id
                    || req.session?.agent?._id;

                if (!agentId) {
                    console.error('[Verification] No agentId found in metadata or session');
                    return res.redirect('/verification-payment');
                }

                // Update DB
                await AgentUser.findByIdAndUpdate(agentId, { verifyPayment: true });

                // Sync session if still alive
                if (req.session?.agent) {
                    req.session.agent.verifyPayment = true;
                    req.session.save(() => {});
                }

                console.log(`[Verification] Payment confirmed for agent ${agentId}`);
                // Redirect to clean URL
                return res.redirect('/agent-verification');
            }
        } catch (err) {
            console.error('Paystack verify error:', err.message);
        }
        return res.redirect('/verification-payment');
    }

    // Case 2: Direct visit — must be logged in
    if (!req.session?.agent) {
        return res.redirect('/login-agent');
    }

    const agentId = req.session.agent.id || req.session.agent._id;

    try {
        const agent = await AgentUser.findById(agentId).select('verifyPayment').lean();
        if (agent && agent.verifyPayment) {
            return res.sendFile(path.join(__dirname, 'agent-verification', 'index.html'));
        }
        return res.redirect('/verification-payment');
    } catch (err) {
        console.error('Agent verification check error:', err.message);
        return res.redirect('/verification-payment');
    }
});

// ── Clean admin routes (no .html) ─────────────────────
const adminPages = ['dashboard', 'agents', 'analytics', 'inbox', 'projects', 'settings', 'feedback', 'transactions', 'reports'];
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
app.get('/contact',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/our-agent',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'our-agent.html')));
app.get('/properties', (req, res) => res.sendFile(path.join(__dirname, 'public', 'properties.html')));
app.get('/private-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'private-policy.html')));


signup(app);
messageAPI(app);
agent(app);
agentProfileUpload(app);
AGENT_POST(app);
VIEW_POST(app);
SEARCH_ENGINE(app);
PROPERTY_SEARCH(app);
PAYMENT_FOR_BOOST(app);
FEEDBACK(app);
PROPERTY_REPORT(app);
NIN_VERIFICATION(app);
PROJECTS(app);
TRANSACTIONS(app);

// ── Admin: Send push notification to agents ───────────────
const { sendPushToAgents, sendPushToAllAgents } = require('./utils/push.js');

app.post('/api/admin/push', async (req, res) => {
    if (!req.session.admin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { title, message, url, agentIds, sendToAll } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: 'Title and message are required' });

    try {
        if (sendToAll) {
            await sendPushToAllAgents({ title, message, url });
            res.json({ success: true, message: 'Push sent to all subscribers' });
        } else if (agentIds && agentIds.length) {
            await sendPushToAgents({ agentIds, title, message, url });
            res.json({ success: true, message: `Push sent to ${agentIds.length} agent(s)` });
        } else {
            res.status(400).json({ success: false, message: 'Provide agentIds or set sendToAll: true' });
        }
    } catch (err) {
        console.error('Admin push error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send push' });
    }
});
COMMENT(app);

// Global error handler (must be before 404 handler)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});
//  Schedule to run every hour (at the start of every hour)
cron.schedule('0 * * * *', () => {
  console.log('Running automated background scraper pipeline...');
  runPipeline();
});

server.listen(process.env.PORT || 9000, '0.0.0.0', () => console.log(process.env.APP_URL || 'http://localhost:9000'))
