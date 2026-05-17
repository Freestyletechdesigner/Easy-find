const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const User = require('../model/User.js');
const rateLimit = require('express-rate-limit');

//Admin file
const ADMIN_FILE = path.join(__dirname, '..', 'database', 'admin.json');
// Helper to read admins
function getAdmins() {
    try {
        const data = fs.readFileSync(ADMIN_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading admin.json:', err);
        return [];
    }
}

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
    windowMs: 60 * 1000, 
    max: 4, // Limit each IP to 4 requests per windowMs
    message: {
        success: false, 
        message: 'Too many attempts. Please try again after 20 seconds.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// General limiter for public profiles/status
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60, // 60 requests per minute
    message: { success: false, message: 'Too many requests.' }
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

    // Signup endpoint
    app.post('/api/signup', async (req, res) => {
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

            // Check if email already exists
            const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email address is already registered' });
            }

            // Create and save new user (password hashed by pre-save hook)
            const newUser = new User({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                number: String(number).replace(/\D/g, ''),
                status: 'active',
                registrationDate: new Date(),
                loginCount: 0,
                ipAddress: req.ip || req.connection.remoteAddress
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
    app.get('/api/users', async (req, res) => {
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
    app.patch('/api/users/:id', async (req, res) => {
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
            console.error('Error updating user hi:', error);
            res.status(500).json({ success: false, message: 'Error updating user' });
        }
    });

    // Login
    app.post('/api/login', authLimiter, async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ success: false, message: 'Email and password are required' });
            }
            
            //check if user is admin
            const admins = getAdmins();
            const admin = admins.find(a => a.email.toLowerCase() === email.toLowerCase());

            if (admin) {

                // Compare password
                const isMatch = await bcrypt.compare(password, admin.password);

                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid credentials'
                    });
                }

                // Set session
                req.session.admin = {
                    id: admin.id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role
                };
    
                res.json({
                    success: true,
                    message: 'Login successful',
                    admin: {
                        id: admin.id,
                        email: admin.email,
                        name: admin.name,
                        role: admin.role
                    }
                });
            } else {
                 //check if user exists
                 const user = await User.findOne({ email: email.trim().toLowerCase() });

                 if (!user) {
                     return res.status(401).json({ success: false, message: 'Invalid email or password' });
                 }

                 if (user.status !== 'active') {
                     return res.status(401).json({ success: false, message: 'Account is inactive. Please contact support.' });
                 }

                 const isPasswordValid = await user.comparePassword(password);
                 if (!isPasswordValid) {
                     return res.status(401).json({ success: false, message: 'Invalid email or password' });
                 }

                 //Add Session cookies
                 req.session.userId = user._id

                 // Update login tracking
                 user.lastLogin = new Date();
                 user.loginCount = (user.loginCount || 0) + 1;
                 await user.save();

                 res.json({
                     success: true,
                     message: 'Login successful',
                     user: { id: user._id, name: user.name, email: user.email }
                 });
            }
            

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    // Check admin session
    app.get('/api/admin/session', (req, res) => {
        if (req.session.admin) {
            res.json({
                success: true,
                admin: req.session.admin
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }
    });
    
    //Middleware
    function isAuth(req, res, next) {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'User not registerd'
            });
        }
        next()
    }
    

    //User profile
    app.get('/api/user/profile', isAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.userId).select('-password').lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            res.status(200).json({ success: true, user });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    //Logout 
    app.post('/api/logout', (req, res) => {

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
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            }

            user.password = newPassword; // pre-save hook hashes it
            user.passwordResetAt = new Date();
            await user.save();

            res.json({ success: true, message: 'Password updated successfully' });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });
};
