const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

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

const ADMIN_AUTH = (app) => {

    // Admin login
    app.post('/api/admin/login', async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password required'
            });
        }

        try {
            const admins = getAdmins();
            const admin = admins.find(a => a.email.toLowerCase() === email.toLowerCase());

            if (!admin) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

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

        } catch (err) {
            console.error('Admin login error:', err);
            res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    });

    // Admin logout
    app.post('/api/admin/logout', (req, res) => {
        req.session.destroy();
        res.json({ success: true, message: 'Logged out' });
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

};

module.exports = { ADMIN_AUTH, requireAdmin };
