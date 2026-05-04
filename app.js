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

// Track page views
const VIEWS_FILE = path.join(__dirname, 'database', 'views.json');

// Initialize views file
function initViewsFile() {
    if (!fs.existsSync(VIEWS_FILE)) {
        fs.writeFileSync(VIEWS_FILE, JSON.stringify({
            ips: [],
            count: 0,
            lastUpdated: new Date().toISOString()
        }, null, 2));
    }
}

initViewsFile();

// Get page views
app.get('/api/views', (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        const data = JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
        
        // Check if this IP has visited before
        if (!data.ips.includes(ip)) {
            data.ips.push(ip);
            data.count++;
            data.lastUpdated = new Date().toISOString();
            
            fs.writeFileSync(VIEWS_FILE, JSON.stringify(data, null, 2));
        }
        
        res.json({
            success: true,
            views: data.count,
            uniqueVisitors: data.ips.length
        });
    } catch (err) {
        console.error('Error tracking views:', err);
        res.status(500).json({
            success: false,
            message: 'Error tracking views',
            views: 0
        });
    }
});

// Get views statistics (for analytics dashboard)
app.get('/api/views/stats', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
        
        res.json({
            success: true,
            totalViews: data.count,
            uniqueVisitors: data.ips.length,
            lastUpdated: data.lastUpdated
        });
    } catch (err) {
        console.error('Error getting view stats:', err);
        res.status(500).json({
            success: false,
            message: 'Error getting view statistics'
        });
    }
});


// Ensure required folders exist on startup
const uploadPropertyDir = path.join(__dirname, 'agent-loged', 'upload-property');
if (!fs.existsSync(uploadPropertyDir)) fs.mkdirSync(uploadPropertyDir, { recursive: true });

const databaseDir = path.join(__dirname, 'database');
if (!fs.existsSync(databaseDir)) fs.mkdirSync(databaseDir, { recursive: true });

// Ensure database JSON files exist
const dbFiles = {
    'views.json':        { ips: [], count: 0, lastUpdated: new Date().toISOString() },
    'post-property.json': [],
    'messages.json':     [],
    'bookings.json':     [],
    'HLS.json':          [],
    'admin.json':        [],
    'agents.json':       [],
    'users.json':        []
};
Object.entries(dbFiles).forEach(([file, defaultVal]) => {
    const filePath = path.join(databaseDir, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
    }
});

app.use(express.static('public'));
app.use('/admin', express.static('admin'));
app.use('/agent-loged', express.static('agent-loged'));
app.use('/agent-profiles', express.static('agent-profiles'));
app.use('/property', express.static('public/property'));
app.use('/login-agent', express.static('public/login-agent.html'));
app.use('/signup-agent', express.static('public/signup-agent.html'));
app.use('/agent-profile', express.static('public/agent-profile'));

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

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(process.env.PORT || 9000, '0.0.0.0', () => console.log('http://localhost:9000/', process.env.PORT || 9000))
