const { check, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const upload = multer();

const login = (app) => {
    const adminFile = path.join(__dirname, '..', 'database', 'admin.json');
    
    // Initialize admin file if it doesn't exist
    async function initAdminFile() {
        try {
            await fs.access(adminFile);
        } catch {
            const defaultAdmin = [{
                id: 'ADMIN_001',
                userName: 'Chiazagom Freedom',
                userEmail: 'freedom@email.com',
                userPassword: '$2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa',
                role: 'admin',
                createdAt: new Date().toISOString(),
                lastLogin: null,
                status: 'active'
            }];
            await fs.writeFile(adminFile, JSON.stringify(defaultAdmin, null, 2));
        }
    }

    initAdminFile();

    // Helper function to get admin by email
    async function getAdminByEmail(email) {
        try {
            const data = await fs.readFile(adminFile, 'utf8');
            const admins = JSON.parse(data);
            return admins.find(admin => admin.userEmail.toLowerCase() === email.toLowerCase());
        } catch (error) {
            console.error('Error reading admin file:', error);
            return null;
        }
    }

    // Helper function to update admin login info
    async function updateAdminLogin(email) {
        try {
            const data = await fs.readFile(adminFile, 'utf8');
            const admins = JSON.parse(data);
            const adminIndex = admins.findIndex(admin => admin.userEmail.toLowerCase() === email.toLowerCase());
            
            if (adminIndex !== -1) {
                admins[adminIndex].lastLogin = new Date().toISOString();
                await fs.writeFile(adminFile, JSON.stringify(admins, null, 2));
            }
        } catch (error) {
            console.error('Error updating admin login:', error);
        }
    }

    // Unified login endpoint - handles both admin and regular users
    app.post('/submit-form',
        upload.none(), [
            check('email').isEmail().normalizeEmail(),
            check('password').notEmpty()
        ], async(req, res) => {

            console.log('=== LOGIN ATTEMPT ===');
            console.log('Email:', req.body.email);

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('Validation errors:', errors.array());
                return res.status(422).json({ 
                    success: false,
                    message: "Validation failed" 
                });
            }

            const { email, password } = req.body;

            try {
                // First, try admin login (email + password only)
                console.log('Checking if admin...');
                const admin = await getAdminByEmail(email);
                
                if (admin) {
                    console.log('Admin found, verifying password...');
                    
                    // Check if admin is active
                    if (admin.status !== 'active') {
                        console.log('Admin account is inactive');
                        return res.status(403).json({ 
                            success: false,
                            message: 'Account is inactive' 
                        });
                    }

                    // Verify password
                    const isMatch = await bcrypt.compare(password, admin.userPassword);
                    console.log('Admin password match:', isMatch);
                    
                    if (isMatch) {
                        // Update last login
                        await updateAdminLogin(email);
                        console.log('Admin login successful!');

                        req.session.regenerate(err => {
                            if (err) {
                                console.error('Session error:', err);
                                return res.status(500).json({ 
                                    success: false,
                                    message: 'Server error' 
                                });
                            }
                            req.session.admin = {
                                id: admin.id,
                                username: admin.userName,
                                email: admin.userEmail,
                                role: 'admin'
                            };
                            console.log('Admin session created');
                            return res.status(200).json({ 
                                success: true,
                                role: 'admin',
                                redirect: '/admin'
                            });
                        });
                        return;
                    }
                }

                // If not admin or admin password wrong, try regular user login
                console.log('Not admin or wrong password, trying regular user...');
                
                // Read users file
                const usersFile = path.join(__dirname, '..', 'database', 'users.json');
                let users = [];
                try {
                    const userData = await fs.readFile(usersFile, 'utf8');
                    users = JSON.parse(userData);
                } catch (error) {
                    console.log('No users file or empty');
                }

                const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
                
                if (!user) {
                    console.log('User not found');
                    return res.status(401).json({ 
                        success: false,
                        message: 'Invalid email or password' 
                    });
                }

                // Check if user is active
                if (user.status !== 'active') {
                    console.log('User account is inactive');
                    return res.status(403).json({ 
                        success: false,
                        message: 'Account is inactive' 
                    });
                }

                // Verify password
                const isMatch = await bcrypt.compare(password, user.password);
                console.log('User password match:', isMatch);
                
                if (!isMatch) {
                    console.log('User password mismatch');
                    return res.status(401).json({ 
                        success: false,
                        message: 'Invalid email or password' 
                    });
                }

                // Update user login tracking
                const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
                if (userIndex !== -1) {
                    users[userIndex].lastLogin = new Date().toISOString();
                    users[userIndex].loginCount = (users[userIndex].loginCount || 0) + 1;
                    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
                }

                console.log('User login successful!');
                return res.status(200).json({ 
                    success: true,
                    role: 'user',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email
                    }
                });

            } catch (err) {
                console.error('Login error:', err);
                return res.status(500).json({ 
                    success: false,
                    message: 'Server error' 
                });
            }
        });

    // New unified login endpoint for admin
    app.post('/api/login/admin',
        upload.none(), [
            check('email').isEmail().normalizeEmail(),
            check('password').notEmpty()
        ], async(req, res) => {

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({ 
                    success: false,
                    message: "Validation failed" 
                });
            }

            const { email, password } = req.body;

            try {
                // Get admin from file
                const admin = await getAdminByEmail(email);
                
                if (!admin) {
                    return res.status(401).json({ 
                        success: false,
                        message: 'Invalid email or password' 
                    });
                }

                // Check if admin is active
                if (admin.status !== 'active') {
                    return res.status(403).json({ 
                        success: false,
                        message: 'Account is inactive' 
                    });
                }

                // Verify password
                const isMatch = await bcrypt.compare(password, admin.userPassword);
                if (!isMatch) {
                    return res.status(401).json({ 
                        success: false,
                        message: 'Invalid email or password' 
                    });
                }

                // Update last login
                await updateAdminLogin(email);

                // Create admin session
                req.session.regenerate(err => {
                    if (err) {
                        return res.status(500).json({ 
                            success: false,
                            error: 'Server error' 
                        });
                    }
                    
                    req.session.admin = {
                        id: admin.id,
                        username: admin.userName,
                        email: admin.userEmail,
                        role: admin.role
                    };
                    
                    res.status(200).json({ 
                        success: true,
                        message: 'Admin login successful',
                        user: {
                            name: admin.userName,
                            email: admin.userEmail,
                            role: admin.role
                        }
                    });
                });
            } catch (err) {
                console.error('Admin login error:', err);
                res.status(500).json({ 
                    success: false,
                    error: 'Server error' 
                });
            }
        });

    // Middleware to require admin authentication
    function requireAdmin(req, res, next) {
        if (!req.session.admin) {
            return res.status(403).redirect('/');
        }
        next();
    }

    // Admin dashboard route
    app.get('/admin', requireAdmin, (req, res) => {
        res.status(200).sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
    });

    // Check admin session status
    app.get('/api/admin/status', (req, res) => {
        if (req.session.admin) {
            res.json({
                success: true,
                isAdmin: true,
                user: {
                    username: req.session.admin.username,
                    role: req.session.admin.role
                }
            });
        } else {
            res.json({
                success: true,
                isAdmin: false
            });
        }
    });

    // Admin logout
    app.post('/api/admin/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).json({ 
                    success: false,
                    message: 'Error logging out' 
                });
            }
            res.json({ 
                success: true,
                message: 'Logged out successfully' 
            });
        });
    });

    // Get all admins (protected route)
    app.get('/api/admins', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(adminFile, 'utf8');
            const admins = JSON.parse(data);
            
            // Remove sensitive data
            const safeAdmins = admins.map(admin => ({
                id: admin.id,
                userName: admin.userName,
                userEmail: admin.userEmail,
                role: admin.role,
                status: admin.status,
                createdAt: admin.createdAt,
                lastLogin: admin.lastLogin
            }));
            
            res.json({
                success: true,
                admins: safeAdmins
            });
        } catch (error) {
            console.error('Error fetching admins:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching admins'
            });
        }
    });
}

module.exports = login;
