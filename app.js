require('dotenv').config();
const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// API
const connectDB = require('./db.js');
connectDB()
const login = require('./routes/login.js');
const sectionImageChanger = require('./routes/section-image-changer.js');
const uploadnewP = require('./routes/upload-property');
const booking = require('./routes/booking.js');
const payment = require('./routes/payment.js');
const signup = require('./routes/signup.js');
const HSLAPI = require('./routes/HLS.js');
const messageAPI = require('./routes/message.js');
const agent = require('./routes/agent.js');
const agentProfileUpload = require('./routes/agent-profile-upload.js');
const profileUpload = require('./routes/profile-upload.js');
const AGENT_POST = require('./routes/agent-upload.js');
const VIEW_POST = require('./routes/view-post.js');
const PAYMENT_FOR_BOOST = require('./routes/payment-for-boost.js');
const FEEDBACK = require('./routes/feedback.js');
const SEARCH_ENGINE = require('./routes/agent-search-engine.js');

// Database schema
const PageViews = require('./model/PageViews.js');

// Raw body for Paystack webhook signature verification
app.use('/api/paystack-webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'fsDGUHArou##$4de',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));


// Get page views
app.get('/api/views', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        let record = await PageViews.findOne();

        if (!record) {
            record = await PageViews.create({ ip: [], count: 0, daily: [] });
        }

        const today = new Date().toISOString().slice(0, 10);
        const dayEntry = record.daily.find(d => d.date === today);

        if (!record.ip.includes(ip)) {
            record.ip.push(ip);
            record.count = (record.count || 0) + 1;
            record.lastUpdated = new Date();
        }

        // increment daily count on every page load
        if (dayEntry) {
            dayEntry.count++;
        } else {
            record.daily.push({ date: today, count: 1 });
        }

        // keep only last 14 days
        if (record.daily.length > 14) record.daily = record.daily.slice(-14);

        await record.save();

        res.json({
            success: true,
            views: record.count,
            uniqueVisitors: record.ip.length
        });
    } catch (err) {
        console.error('Error tracking views:', err);
        res.status(500).json({ success: false, message: 'Error tracking views', views: 0 });
    }
});

// Get views statistics (for analytics dashboard)
app.get('/api/views/stats', async (req, res) => {
    try {
        let record = await PageViews.findOne();
        if (!record) record = { count: 0, ip: [], lastUpdated: new Date(), daily: [] };

        // build last 7 days with labels
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key   = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
            const entry = record.daily.find(x => x.date === key);
            days.push({ label, count: entry ? entry.count : 0 });
        }

        // previous 7 days for comparison
        const prevDays = [];
        for (let i = 13; i >= 7; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key   = d.toISOString().slice(0, 10);
            const entry = record.daily.find(x => x.date === key);
            prevDays.push(entry ? entry.count : 0);
        }

        res.json({
            success: true,
            totalViews:     record.count,
            uniqueVisitors: record.ip.length,
            lastUpdated:    record.lastUpdated,
            daily:          days,
            previousDaily:  prevDays
        });
    } catch (err) {
        console.error('Error getting view stats:', err);
        res.status(500).json({ success: false, message: 'Error getting view statistics' });
    }
});


// Ensure required folders exist on startup
const uploadPropertyDir = path.join(__dirname, 'agent-loged', 'upload-property');
if (!fs.existsSync(uploadPropertyDir)) fs.mkdirSync(uploadPropertyDir, { recursive: true });


//Direct URL
app.use(express.static('public'));
app.use('/admin', express.static('admin'));
app.use('/agent-loged', express.static('agent-loged'));
app.use('/agent-profiles', express.static('agent-profiles'));
app.use('/property', express.static('public/property'));
app.use('/login-agent', express.static('public/login-agent.html'));
app.use('/signup-agent', express.static('public/signup-agent.html'));
app.use('/agent-profile', express.static('public/agent-profile'));
app.use('/agent-loged/upload-profilepicture', express.static('agent-loged/upload-image.html'));
app.use('/agent-loged/setting', express.static('agent-loged/setting.html'));
app.use('/agent-verification', express.static('agent-verification'));
app.use('/appeal', express.static('appeal'));
app.use('/boost-account', express.static('boost-account'));
app.use('/password-reset', express.static('password-reset'));

login(app);
sectionImageChanger(app);
uploadnewP(app);
booking(app);
payment(app);
signup(app);
HSLAPI(app);
messageAPI(app);
agent(app);
agentProfileUpload(app);
profileUpload(app);
AGENT_POST(app);
VIEW_POST(app);
SEARCH_ENGINE(app);
PAYMENT_FOR_BOOST(app);
FEEDBACK(app);

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(process.env.PORT || 9000, '0.0.0.0', () => console.log('http://localhost:',process.env.PORT||9000))
