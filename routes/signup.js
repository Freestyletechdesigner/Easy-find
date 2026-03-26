const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

module.exports = function(app) {
    const usersFile = path.join(__dirname, '..', 'database', 'users.json');

    // Initialize users file if it doesn't exist
    async function initUsersFile() {
        try {
            await fs.access(usersFile);
            // Check if existing users need password migration
            await migrateExistingUsers();
        } catch {
            await fs.writeFile(usersFile, JSON.stringify([], null, 2));
        }
    }

    // Migrate existing users to add password field
    async function migrateExistingUsers() {
        try {
            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);
            let needsUpdate = false;

            for (let user of users) {
                if (!user.password) {
                    // Add a temporary password that forces password reset
                    user.password = await hashPassword('TempPassword123!');
                    user.requiresPasswordReset = true;
                    user.migrated = true;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                // Direct write instead of rename for Windows compatibility
                await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
                console.log('Migrated existing users to include password hashing');
            }
        } catch (error) {
            console.error('Error migrating users:', error);
        }
    }

    initUsersFile();

    // Generate unique user ID
    function generateUserId() {
        return 'USER_' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Validate email format
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate phone number
    function isValidPhoneNumber(number) {
        // Convert to string and remove any non-digit characters
        const phoneStr = String(number).replace(/\D/g, '');
        // Check if it's a valid length (typically 10-15 digits)
        return phoneStr.length >= 10 && phoneStr.length <= 15;
    }

    // Validate password strength
    function isValidPassword(password) {
        // Password must be at least 8 characters long
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters long' };
        }
        
        // Password must contain at least one uppercase letter
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        
        // Password must contain at least one lowercase letter
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        
        // Password must contain at least one number
        if (!/\d/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        
        return { valid: true };
    }

    // Hash password with bcrypt
    async function hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    // Verify password against hash
    async function verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Signup endpoint
    app.post('/api/signup', async (req, res) => {
        try {
            const { name, email, number, password } = req.body;

            // Validation
            if (!name || !email || !number || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required'
                });
            }

            // Validate name (letters, spaces, hyphens, apostrophes only)
            if (!/^[a-zA-Z\s\-']{2,50}$/.test(name.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)'
                });
            }

            // Validate email
            if (!isValidEmail(email.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address'
                });
            }

            // Validate phone number
            if (!isValidPhoneNumber(number)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid phone number (10-15 digits)'
                });
            }

            // Validate password
            const passwordValidation = isValidPassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: passwordValidation.message
                });
            }

            // Hash password
            const hashedPassword = await hashPassword(password);

            // Read existing users
            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);

            // Check if email already exists
            const existingUser = users.find(user => user.email.toLowerCase() === email.trim().toLowerCase());
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email address is already registered'
                });
            }

            // Create new user
            const newUser = {
                id: generateUserId(),
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password: hashedPassword,
                number: String(number).replace(/\D/g, ''), // Store as string without non-digits
                status: 'active',
                registrationDate: new Date().toISOString(),
                lastLogin: null,
                loginCount: 0,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent') || 'Unknown'
            };

            // Add user to array
            users.push(newUser);

            // Save to file
            await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
            app.get('/api/count-user', (req, res) => {
                logersCount++;
                res.json({ loginUser: logersCount });
            });

            // Return success (don't include sensitive data)
            res.json({
                success: true,
                message: 'Account created successfully!',
                userId: newUser.id
            });

        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error. Please try again later.'
            });
        }
    });

    // Get all users (for analytics)
    app.get('/api/users', async (req, res) => {
        try {
            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);

            // Remove sensitive data for analytics
            const analyticsUsers = users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                number: user.number,
                status: user.status,
                registrationDate: user.registrationDate,
                lastLogin: user.lastLogin,
                loginCount: user.loginCount
            }));

            res.json({
                success: true,
                users: analyticsUsers
            });

        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching users'
            });
        }
    });

    // Update user status
    app.patch('/api/users/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be: active, inactive, or suspended'
                });
            }

            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);

            const userIndex = users.findIndex(user => user.id === id);
            if (userIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            users[userIndex].status = status;
            users[userIndex].updatedAt = new Date().toISOString();

            // Save updated data
            await fs.writeFile(usersFile, JSON.stringify(users, null, 2));

            res.json({
                success: true,
                message: 'User status updated successfully'
            });

        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating user'
            });
        }
    });

    // Login tracking (update existing login endpoint)
    app.post('/api/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and password are required'
                });
            }

            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);

            const userIndex = users.findIndex(user => user.email.toLowerCase() === email.trim().toLowerCase());
            
            if (userIndex !== -1) {
                const user = users[userIndex];
                
                // Check if user is active
                if (user.status !== 'active') {
                    return res.status(401).json({
                        success: false,
                        message: 'Account is inactive. Please contact support.'
                    });
                }

                // Check if user needs password reset (migrated users)
                if (user.requiresPasswordReset) {
                    return res.status(401).json({
                        success: false,
                        message: 'Password reset required. Please use temporary password: TempPassword123!',
                        requiresPasswordReset: true
                    });
                }

                // Verify password
                const isPasswordValid = await verifyPassword(password, user.password);
                
                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Update login tracking
                users[userIndex].lastLogin = new Date().toISOString();
                users[userIndex].loginCount = (users[userIndex].loginCount || 0) + 1;

                // Save updated data
                await fs.writeFile(usersFile, JSON.stringify(users, null, 2));

                res.json({
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: users[userIndex].id,
                        name: users[userIndex].name,
                        email: users[userIndex].email
                    }
                });
            } else {
                res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error. Please try again later.'
            });
        }
    });

    // Password reset endpoint for migrated users
    app.post('/api/reset-password', async (req, res) => {
        try {
            const { email, currentPassword, newPassword } = req.body;

            if (!email || !currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Email, current password, and new password are required'
                });
            }

            // Validate new password strength
            const passwordValidation = isValidPassword(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: passwordValidation.message
                });
            }

            const data = await fs.readFile(usersFile, 'utf8');
            const users = JSON.parse(data);

            const userIndex = users.findIndex(user => user.email.toLowerCase() === email.trim().toLowerCase());
            
            if (userIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const user = users[userIndex];

            // Verify current password
            const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
            if (!isCurrentPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Hash new password
            const hashedNewPassword = await hashPassword(newPassword);

            // Update user
            users[userIndex].password = hashedNewPassword;
            users[userIndex].requiresPasswordReset = false;
            users[userIndex].passwordResetAt = new Date().toISOString();

            // Save updated data
            await fs.writeFile(usersFile, JSON.stringify(users, null, 2));

            res.json({
                success: true,
                message: 'Password updated successfully'
            });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error. Please try again later.'
            });
        }
    });
};