const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const User = require('../model/User.js');
const rateLimit = require('express-rate-limit');
const ADMIN = require('../model/ADMIN.js');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.status(403).json({
            success: false,
            message: 'Admin authentication required'
        });
    }
    next();
}

// Strict limiter for Login and password reset
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: {
        success: false, 
        message: 'Too many attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
});

module.exports = function(app) {

    // Validate email format
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate phone number
    function isValidPhoneNumber(number) {
        const phoneStr = String(number).replace(/\D/g, '');
        return phoneStr.length >= 10 && phoneStr.length <= 15;
    }

    // Validate password strength
    function isValidPassword(password) {
        if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters long' };
        if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one uppercase letter' };
        if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain at least one lowercase letter' };
        if (!/\d/.test(password)) return { valid: false, message: 'Password must contain at least one number' };
        return { valid: true };
    }

    // Signup endpoint (email/password)
    app.post('/api/signup', authLimiter, async (req, res) => {
        try {
            const { name, email, number, password } = req.body;

            if (!name || !email || !number || !password) {
                return res.status(400).json({ success: false, message: 'All fields are required' });
            }

            if (!/^[a-zA-Z\s\-']{2,50}$/.test(name.trim())) {
                return res.status(400).json({ success: false, message: 'Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)' });
            }

            if (!isValidEmail(email.trim())) {
                return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
            }

            if (!isValidPhoneNumber(number)) {
                return res.status(400).json({ success: false, message: 'Please provide a valid phone number (10-15 digits)' });
            }

            const passwordValidation = isValidPassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ success: false, message: passwordValidation.message });
            }

            const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email address is already registered' });
            }

            const newUser = new User({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                number: String(number).replace(/\D/g, ''),
                status: 'active',
                registrationDate: new Date(),
                loginCount: 0,
                ipAddress: req.ip || req.socket?.remoteAddress
            });

            await newUser.save();

            res.json({ success: true, message: 'Account created successfully!'});

        } catch (error) {
            console.error('Signup error:', error);
            if (error.code === 11000) {
                return res.status(400).json({ success: false, message: 'Email or phone number already registered' });
            }
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // Get all users (for analytics)
    app.get('/api/users', requireAdmin, async (req, res) => {
        try {
            const users = await User.find()
                .select('name email number status registrationDate lastLogin loginCount')
                .lean();

            res.json({ success: true, users });

        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ success: false, message: 'Error fetching users' });
        }
    });

    // Update user status
    app.patch('/api/users/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status. Must be: active, inactive, or suspended' });
            }

            const user = await User.findByIdAndUpdate(
                id,
                { status, updatedAt: new Date() },
                { new: true }
            );

            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            res.json({ success: true, message: 'User status updated successfully' });

        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ success: false, message: 'Error updating user' });
        }
    });

    // Login (handles password, Google, and Google sign-up)
    app.post('/api/login', authLimiter, async (req, res) => {
        try {
            const { email, password, googleToken } = req.body;
            let targetEmail = '';
            let googleName = '';
            let googleId = null;
    
            // 1. DETERMINE AUTHENTICATION METHOD
            if (googleToken) {
                // GOOGLE OAUTH PATHWAY
                try {
                    const ticket = await client.verifyIdToken({
                        idToken: googleToken,
                        audience: process.env.GOOGLE_CLIENT_ID,
                    });
                    const payload = ticket.getPayload();
                    
                    if (!payload || !payload.email) {
                        return res.status(400).json({ success: false, message: 'Invalid Google token payload' });
                    }

                    if (!payload.email_verified) {
                        return res.status(401).json({ success: false, message: 'Unverified Google accounts are not permitted.' });
                    }
                    
                    targetEmail = payload.email.trim().toLowerCase();
                    googleName  = payload.name || payload.email.split('@')[0];
                    googleId    = payload.sub;
                } catch (googleError) {
                    console.error('Google token verification failed:', googleError);
                    return res.status(401).json({ success: false, message: 'Google authentication failed' });
                }
            } else {
                // STANDARD PASSWORD PATHWAY
                if (!email || !password) {
                    return res.status(400).json({ success: false, message: 'Email and password are required' });
                }
                targetEmail = email.trim().toLowerCase();
            }
    
            // 2. CHECK IF ACCOUNT IS AN ADMIN
            const admin = await ADMIN.findOne({ email: targetEmail });
            if (admin) {
                if (!googleToken) {
                    const isPasswordValid = await admin.comparePassword(password);
                    if (!isPasswordValid) {
                        return res.status(401).json({ success: false, message: 'Invalid email or password' });
                    }
                }

                req.session.admin = {
                    id: admin._id,
                    email: admin.email,
                    role: admin.role
                };

                return res.json({
                    success: true,
                    message: 'Login successful',
                    admin: { id: admin._id, email: admin.email, role: admin.role }
                });
            }
    
            // 3. LOOK UP USER
            let user = await User.findOne({ email: targetEmail });

            // 4. GOOGLE SIGN-UP: create account automatically if user does not exist
            if (!user && googleToken) {
                user = new User({
                    name: googleName,
                    email: targetEmail,
                    // No password — Google-only account
                    password: null,
                    number: '',           // User can fill this in their profile later
                    status: 'active',
                    googleId,
                    registrationDate: new Date(),
                    loginCount: 0,
                    ipAddress: req.ip || req.socket?.remoteAddress
                });

                await user.save();

                // Set session immediately after sign-up
                req.session.userId = user._id;

                return res.json({
                    success: true,
                    isNewUser: true,
                    message: `Welcome to Easy Find, ${googleName}! Your account has been created.`,
                    user: { id: user._id, name: user.name, email: user.email }
                });
            }

            // 5. USER NOT FOUND (password login path only)
            if (!user) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }
    
            if (user.status !== 'active') {
                return res.status(401).json({ success: false, message: 'Account is inactive. Please contact support.' });
            }
    
            // 6. VERIFY CREDENTIALS
            if (!googleToken) {
                // Password login — but check if this is a Google-only account
                if (!user.password) {
                    return res.status(401).json({ success: false, message: 'This account was created with Google. Please sign in with Google.' });
                }
                const isPasswordValid = await user.comparePassword(password);
                if (!isPasswordValid) {
                    return res.status(401).json({ success: false, message: 'Invalid email or password' });
                }
            } else {
                // Google login — bind googleId on first Google login
                if (user.googleId && user.googleId !== googleId) {
                    return res.status(401).json({ success: false, message: 'Google account mismatch. Please log in with your password.' });
                }
                if (!user.googleId) {
                    user.googleId = googleId;
                }
            }
    
            // 7. UPDATE SESSION & METRICS
            req.session.userId = user._id;
            user.lastLogin  = new Date();
            user.loginCount = (user.loginCount || 0) + 1;
            await user.save();
    
            return res.json({
                success: true,
                message: 'Login successful',
                user: { id: user._id, name: user.name, email: user.email }
            });
    
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // Check admin session
    app.get('/api/admin/session', (req, res) => {
        if (req.session.admin) {
            res.json({ success: true, admin: req.session.admin });
        } else {
            res.status(401).json({ success: false, message: 'Not authenticated' });
        }
    });
    
    // Auth middleware
    function isAuth(req, res, next) {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'User not registered' });
        }
        next();
    }

    // User profile
    app.get('/api/user/profile', isAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.userId).select('-password').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            res.status(200).json({ success: true, user });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Logout 
    app.post('/api/logout', (req, res) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });

    // Admin Logout 
    app.post('/api/admin/logout', (req, res) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });

    // Password reset
    app.post('/api/reset-password', authLimiter, async (req, res) => {
        try {
            const { email, currentPassword, newPassword } = req.body;

            if (!email || !currentPassword || !newPassword) {
                return res.status(400).json({ success: false, message: 'Email, current password, and new password are required' });
            }

            const passwordValidation = isValidPassword(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({ success: false, message: passwordValidation.message });
            }

            const user = await User.findOne({ email: email.trim().toLowerCase() });
            if (!user) return res.status(404).json({ success: false, message: 'Invalid email or current password' });

            if (!user.password) {
                return res.status(400).json({ success: false, message: 'This account uses Google sign-in. Password reset is not applicable.' });
            }

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            }

            user.password = newPassword;
            user.passwordResetAt = new Date();
            await user.save();

            res.json({ success: true, message: 'Password updated successfully' });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // Admin status
    app.get('/api/admin/status', requireAdmin, (req, res) => {
        res.json({ success: true, isAdmin: true, admin: {
            email: req.session.admin.email,
            role: req.session.admin.role
        }});
    });
};