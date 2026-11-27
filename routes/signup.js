'use strict';

const path   = require('path');
const fs     = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp  = require('sharp');
const User   = require('../model/User.js');
const rateLimit = require('express-rate-limit');
const ADMIN  = require('../model/ADMIN.js');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ROOT           = path.join(__dirname, '..');
const USER_PFP_DIR   = path.join(ROOT, 'user-profiles');
if (!fsSync.existsSync(USER_PFP_DIR)) fsSync.mkdirSync(USER_PFP_DIR, { recursive: true });

// ── Rate limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
});

// ── Multer for user profile picture ───────────────────────────────────────
const pfpStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, USER_PFP_DIR),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const pfpUpload = multer({
    storage: pfpStorage,
    fileFilter: (req, file, cb) => {
        const ok = ['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype);
        cb(ok ? null : new Error('Only JPEG, PNG and WebP allowed'), ok);
    },
    limits: { fileSize: 6 * 1024 * 1024 }
});

// ── Helpers ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(403).json({ success: false, message: 'Admin authentication required' });
    next();
}

function isAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    next();
}

// ── Verify a Google token and return { email, name, googleId, picture } ───
async function verifyGoogleToken(token) {
    const ticket  = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Invalid Google token payload');
    return {
        email:    payload.email.trim().toLowerCase(),
        name:     (payload.name || '').trim(),
        googleId: payload.sub,
        picture:  payload.picture || null
    };
}

// ── Module export ──────────────────────────────────────────────────────────
module.exports = function(app) {

    // ── Signup (Google-only) ─────────────────────────────────────────────
    // If the user already exists → sign them straight in (upsert behaviour)
    app.post('/api/signup', authLimiter, async (req, res) => {
        try {
            const { googleToken } = req.body;
            if (!googleToken) return res.status(400).json({ success: false, message: 'Google token required' });

            let googleData;
            try { googleData = await verifyGoogleToken(googleToken); }
            catch (e) { return res.status(401).json({ success: false, message: 'Google authentication failed' }); }

            const { email, name, googleId, picture } = googleData;

            // Upsert: find existing or create new
            let user = await User.findOne({ email });

            if (user) {
                // Existing user — update googleId if first Google login
                if (!user.googleId) { user.googleId = googleId; await user.save(); }
            } else {
                // New user — create with random password (Google-only, password not used)
                const randomPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
                user = new User({
                    name,
                    email,
                    password: randomPassword,
                    googleId,
                    // Use Google profile picture as default if no picture uploaded yet
                    profilePicture: picture || null,
                    status: 'active',
                    registrationDate: new Date(),
                    loginCount: 0,
                    ipAddress: req.ip || req.socket?.remoteAddress
                });
                await user.save();
            }

            // Establish session
            req.session.userId = user._id;
            user.lastLogin  = new Date();
            user.loginCount = (user.loginCount || 0) + 1;
            await user.save();

            return res.json({
                success: true,
                message: user ? 'Welcome back!' : 'Account created!',
                user: { id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture }
            });

        } catch (error) {
            console.error('Signup error:', error);
            if (error.code === 11000) {
                // Duplicate key — user already exists, just log them in
                try {
                    const existing = await User.findOne({ email: googleData?.email });
                    if (existing) {
                        req.session.userId = existing._id;
                        existing.lastLogin  = new Date();
                        existing.loginCount = (existing.loginCount || 0) + 1;
                        await existing.save();
                        return res.json({
                            success: true,
                            message: 'Welcome back!',
                            user: { id: existing._id, name: existing.name, email: existing.email, profilePicture: existing.profilePicture }
                        });
                    }
                } catch (_) {}
            }
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // ── Login ────────────────────────────────────────────────────────────
    app.post('/api/login', authLimiter, async (req, res) => {
        try {
            const { email, password, googleToken, accessToken, googleUserInfo } = req.body;
            let targetEmail = '';

            // ── OAuth2 access token path (mobile popup flow) ──────────────
            if (accessToken && googleUserInfo) {
                try {
                    // Verify the access token is valid by calling Google's tokeninfo endpoint
                    const axios = require('axios');
                    const tokenInfoRes = await axios.get(
                        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`
                    );
                    const tokenInfo = tokenInfoRes.data;
                    if (!tokenInfo.sub || tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
                        return res.status(401).json({ success: false, message: 'Invalid Google token' });
                    }
                    targetEmail = (googleUserInfo.email || '').trim().toLowerCase();
                    if (!targetEmail) return res.status(400).json({ success: false, message: 'No email from Google' });

                    let user = await User.findOne({ email: targetEmail });
                    if (!user) {
                        const randomPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
                        user = new User({
                            name:            (googleUserInfo.name || '').trim(),
                            email:           targetEmail,
                            password:        randomPassword,
                            googleId:        googleUserInfo.sub,
                            profilePicture:  googleUserInfo.picture || null,
                            status:          'active',
                            registrationDate: new Date(),
                            loginCount:      0,
                            ipAddress:       req.ip || req.socket?.remoteAddress
                        });
                        await user.save();
                    } else if (!user.googleId) {
                        user.googleId = googleUserInfo.sub;
                        await user.save();
                    }

                    req.session.userId = user._id;
                    user.lastLogin  = new Date();
                    user.loginCount = (user.loginCount || 0) + 1;
                    await user.save();

                    return res.json({
                        success: true,
                        message: 'Welcome back!',
                        user: { id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture }
                    });
                } catch (e) {
                    console.error('Access token login error:', e.message);
                    return res.status(401).json({ success: false, message: 'Google authentication failed' });
                }
            }

            if (googleToken) {
                try {
                    const g = await verifyGoogleToken(googleToken);
                    targetEmail = g.email;

                    // Auto-create account if this Google user has never signed up
                    let user = await User.findOne({ email: targetEmail });
                    if (!user) {
                        const randomPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
                        user = new User({
                            name:     g.name,
                            email:    targetEmail,
                            password: randomPassword,
                            googleId: g.googleId,
                            profilePicture: g.picture || null,
                            status:   'active',
                            registrationDate: new Date(),
                            loginCount: 0,
                            ipAddress: req.ip || req.socket?.remoteAddress
                        });
                        await user.save();
                    } else if (!user.googleId) {
                        user.googleId = g.googleId;
                        await user.save();
                    }
                } catch (e) {
                    return res.status(401).json({ success: false, message: 'Google authentication failed' });
                }
            } else {
                if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
                targetEmail = email.trim().toLowerCase();
            }

            // Check admin first
            const admin = await ADMIN.findOne({ email: targetEmail });
            if (admin) {
                if (!googleToken) {
                    const ok = await admin.comparePassword(password);
                    if (!ok) return res.status(401).json({ success: false, message: 'Invalid email or password' });
                }
                req.session.admin = { id: admin._id, email: admin.email, role: admin.role };
                return res.json({ success: true, message: 'Login successful', admin: { id: admin._id, email: admin.email, role: admin.role } });
            }

            // Standard users must use Google
            if (!googleToken) return res.status(401).json({ success: false, message: 'Please sign in with Google' });

            const user = await User.findOne({ email: targetEmail });
            if (!user) return res.status(401).json({ success: false, message: 'Account not found' });
            if (user.status !== 'active') return res.status(401).json({ success: false, message: 'Account inactive. Contact support.' });

            req.session.userId = user._id;
            user.lastLogin  = new Date();
            user.loginCount = (user.loginCount || 0) + 1;
            await user.save();

            return res.json({
                success: true,
                message: 'Login successful',
                user: { id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // ── User profile (GET) ───────────────────────────────────────────────
    app.get('/api/user/profile', isAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.userId).select('-password').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            res.json({ success: true, ...user });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── User profile (PATCH — update name) ──────────────────────────────
    app.patch('/api/user/profile', isAuth, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name || name.trim().length < 2) return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
            if (name.trim().length > 60)          return res.status(400).json({ success: false, message: 'Name too long' });
            const user = await User.findByIdAndUpdate(req.session.userId, { name: name.trim() }, { new: true }).select('-password').lean();
            res.json({ success: true, message: 'Name updated', user });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── User profile picture (POST) ──────────────────────────────────────
    app.post('/api/user/profile/picture', isAuth, pfpUpload.single('profilePicture'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

            const userId   = req.session.userId.toString();
            const filename = `${userId}_${Date.now()}.webp`;
            const finalPath = path.join(USER_PFP_DIR, filename);
            const publicPath = `/user-profiles/${filename}`;

            // Convert to compressed webp
            await sharp(req.file.path).webp({ quality: 70, effort: 5 }).toFile(finalPath);

            // Delete temp upload
            try { await fs.unlink(req.file.path); } catch (_) {}

            // Delete old picture from disk
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            if (user.profilePicture && user.profilePicture.startsWith('/user-profiles/')) {
                try { await fs.unlink(path.join(ROOT, user.profilePicture)); } catch (_) {}
            }

            user.profilePicture = publicPath;
            await user.save();

            res.json({ success: true, message: 'Profile picture updated', profilePicture: publicPath });
        } catch (err) {
            console.error('Profile picture upload error:', err);
            res.status(500).json({ success: false, message: 'Upload failed' });
        }
    });

    // ── User profile picture (DELETE) ────────────────────────────────────
    app.delete('/api/user/profile/picture', isAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.userId);
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            if (user.profilePicture && user.profilePicture.startsWith('/user-profiles/')) {
                try { await fs.unlink(path.join(ROOT, user.profilePicture)); } catch (_) {}
            }
            user.profilePicture = null;
            await user.save();
            res.json({ success: true, message: 'Profile picture removed' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── Session check ────────────────────────────────────────────────────
    app.get('/api/user/session', (req, res) => {
        if (req.session.userId) return res.json({ success: true, loggedIn: true });
        res.json({ success: true, loggedIn: false });
    });

    // ── Logout ───────────────────────────────────────────────────────────
    app.post('/api/logout', (req, res) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ success: true }); });
    });

    // ── Admin logout ─────────────────────────────────────────────────────
    app.post('/api/admin/logout', (req, res) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ success: true }); });
    });

    // ── Admin session check ──────────────────────────────────────────────
    app.get('/api/admin/session', (req, res) => {
        if (req.session.admin) return res.json({ success: true, admin: req.session.admin });
        res.status(401).json({ success: false, message: 'Not authenticated' });
    });

    app.get('/api/admin/status', requireAdmin, (req, res) => {
        res.json({ success: true, isAdmin: true, admin: { email: req.session.admin.email, role: req.session.admin.role } });
    });

    // ── Admin: get all users ─────────────────────────────────────────────
    app.get('/api/users', requireAdmin, async (req, res) => {
        try {
            const users = await User.find().select('name email number status registrationDate lastLogin loginCount').lean();
            res.json({ success: true, users });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error fetching users' });
        }
    });

    // ── Admin: update user status ────────────────────────────────────────
    app.patch('/api/users/:id', requireAdmin, async (req, res) => {
        try {
            const { status } = req.body;
            if (!['active','inactive','suspended'].includes(status))
                return res.status(400).json({ success: false, message: 'Invalid status' });
            const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            res.json({ success: true, message: 'Status updated' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error updating user' });
        }
    });
};
