const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const { check, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Strict limiter for Login and OTP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 4, // Limit each IP to 4 requests per windowMs
    message: {
        success: false, 
        message: 'Too many attempts. Please try again after 15 minutes.'
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

const upload = multer();

const agent = (app) => {

    // Middleware
    function requireAgent(req, res, next) {
        if (!req.session.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        next();
    }

    function requireAdmin(req, res, next) {
        if (!req.session.admin) {
            return res.status(403).json({ success: false, message: 'Admin authentication required' });
        }
        next();
    }

    // Signup
    app.post('/api/agent/signup', upload.none(), [
        check('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
        check('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
        check('email').isEmail().normalizeEmail().withMessage('Invalid email'),
        check('phone').matches(/^0\d{10}$/).withMessage('Phone must be 11 digits starting with 0'),
        check('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }

        const { firstName, lastName, email, phone, password, bio } = req.body;

        try {
            const existing = await AgentUser.findOne({ email });
            if (existing) {
                return res.status(409).json({ success: false, message: 'Email already registered' });
            }

            const newAgent = new AgentUser({
                name: `${firstName} ${lastName}`,
                email: email.toLowerCase(),
                password,
                number: phone,
                role: 'agent',
                status: 'active',
                stand: 'Not verified',
                bio: bio || '',
                registrationDate: new Date(),
                ipAddress: req.ip || req.connection.remoteAddress
            });

            await newAgent.save();

            req.session.agent = {
                id:    newAgent._id,
                name:  newAgent.name,
                email: newAgent.email,
                role:  'agent'
            };

            res.status(201).json({
                success: true,
                message: 'Agent account created successfully',
                agentId: newAgent._id
            });
        } catch (err) {
            console.error('Agent signup error:', err);
            if (err.code === 11000) {
                return res.status(409).json({ success: false, message: 'Email or phone already registered' });
            }
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Login
    app.post('/api/agent/login', authLimiter, upload.none(), [
        check('email').isEmail().normalizeEmail().withMessage('Invalid email'),
        check('password').notEmpty().withMessage('Password is required')
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }

        const { email, password } = req.body;

        try {
            const agent = await AgentUser.findOne({ email });
            if (!agent) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            if (agent.status !== 'active') {
                return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact admin.' });
            }

            const isPasswordValid = await agent.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            agent.lastLogin = new Date();
            await agent.save();

            req.session.agent = {
                id:    agent._id,
                name:  agent.name,
                email: agent.email,
                role:  agent.role
            };

            res.status(200).json({
                success: true,
                message: 'Login successful',
                agent: { name: agent.name, email: agent.email, role: agent.role }
            });
        } catch (err) {
            console.error('Agent login error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Status
    app.get('/api/agent/status', (req, res) => {
        if (req.session.agent) {
            res.json({ success: true, isAgent: true, agent: {
                name:  req.session.agent.name,
                email: req.session.agent.email,
                role:  req.session.agent.role
            }});
        } else {
            res.json({ success: true, isAgent: false });
        }
    });

    // Public profile by ID
    app.get('/api/agent/public/:id', async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.params.id)
                .select('name profilePicture bio stand registrationDate')
                .lean();
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            res.json({
                success: true,
                agent: {
                    id: agent._id,
                    name: agent.name,
                    profilePicture: agent.profilePicture || null,
                    bio: agent.bio || null,
                    stand: agent.stand || null,
                    joinedAt: agent.registrationDate || null
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Logout
    app.post('/api/agent/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) return res.status(500).json({ success: false, message: 'Error logging out' });
            res.json({ success: true, message: 'Logged out successfully' });
        });
    });

    // Agent profile (protected)
    app.get('/api/agent/profile', requireAgent, async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.session.agent.id).select('-password').lean();
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            res.json({ success: true, agent });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error fetching profile' });
        }
    });

    // Update agent status
    app.patch('/api/users/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status. Must be: active, inactive, or suspended' });
            }

            const agent = await AgentUser.findByIdAndUpdate(
                id,
                { status, updatedAt: new Date() },
                { new: true }
            );

            if (!agent) return res.status(404).json({ success: false, message: 'User not found' });

            res.json({ success: true, message: 'User status updated successfully' });

        } catch (error) {
            console.error('Error updating user hi:', error);
            res.status(500).json({ success: false, message: 'Error updating user' });
        }
    });

    // Update Bio
    app.post('/api/update/bio', requireAgent,[
        check('bio')
             .optional()
             .trim()
             .isLength({ max: 300 })
             .trim()
    ], async (req, res) => {
        const bio = (req.body.bio || '').trim().slice(0, 300);
        try {
            const agent = await AgentUser.findById(req.session.agent.id);
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            agent.bio = bio;
            await agent.save();
            res.json({ success: true, bio: agent.bio });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to save bio' });
        }
    });

    // Get Bio
    app.get('/api/get/bio', requireAgent, async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.session.agent.id).select('bio').lean();
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            res.json({ success: true, bio: agent.bio || '' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error fetching bio' });
        }
    });  

    // Get all agents (admin only)
    app.get('/api/agents', requireAdmin, async (req, res) => {
        try {
            const agents = await AgentUser.find().select('-password').lean();
            res.json({ success: true, agents });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error fetching agents' });
        }
    });

    // Send code for verification
    app.post('/api/agent/send-code', authLimiter, async (req, res) => {
        try {
            const number = req.body.number;

            if (!number) {
                return res.status(400).json({ success: false, message: 'Phone number are required' });
            }

            const user = await AgentUser.findOne({ number });
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            //send code to SMS
            const phone = user.number;
            const { sendOTP } = require('../utils/sms.js');
            const result = await sendOTP(phone);

            if (!result.success) {
                return res.status(500).json({ success: false, message: result.message });
            }

            req.session.otp = {
                code:    result.otp,
                phone,
                expires: Date.now() + 10 * 60 * 1000
            };

            res.json({ success: true, message: 'Code has been sent to your SMS' });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    //Password reset
    app.post('/api/agent/reset-password', async (req, res) => {
        const { newPassword } = req.body;
        const phone = req.session.phoneVerified;

        if (!phone) 
            return res.status(403).json({ success: false, message: 'Not verified. Start over.' });
        if (!newPassword || newPassword.length < 8)
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword))
            return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, and number' });

        try {
            const agent = await AgentUser.findOne({ number: phone });
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

            agent.password = newPassword;
            agent.passwordResetAt = new Date();
            await agent.save();

            req.session.phoneVerified = null;
            res.json({ success: true, message: 'Password reset successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Verify OTP 
    app.post('/api/agent/verify-otp', (req, res) => {
        const otp = req.body.otp;
        const stored = req.session.otp;

        if (!stored) return res.status(400).json({ success: false, message: 'No OTP requested' });
        if (Date.now() > stored.expires) return res.status(400).json({ success: false, message: 'OTP expired' });
        if (otp !== stored.code) return res.status(400).json({ success: false, message: 'Invalid OTP' });

        req.session.otp = null;
        req.session.phoneVerified = stored.phone;

        res.json({ success: true, message: 'Phone number verified successfully' });
    });

    // ADMIN ROUTES - Agent Management
    // Get all agents (admin only)
    app.get('/api/admin/agents', requireAdmin, async (req, res) => {
        try {
            const AgentPost = require('../model/AgentPost.js');
            
            // Get all agents with property count
            const agents = await AgentUser.find()
                .select('name email number profilePicture status stand registrationDate lastLogin loginCount')
                .lean();

            // Get property counts for each agent
            const agentIds = agents.map(a => a._id.toString());
            const propertyCounts = await AgentPost.aggregate([
                { $match: { agentId: { $in: agentIds } } },
                { $group: { _id: '$agentId', count: { $sum: 1 } } }
            ]);

            // Map property counts to agents
            const propertyCountMap = {};
            propertyCounts.forEach(pc => {
                propertyCountMap[pc._id] = pc.count;
            });

            agents.forEach(agent => {
                agent.propertyCount = propertyCountMap[agent._id.toString()] || 0;
            });

            // Get total properties
            const totalProperties = await AgentPost.countDocuments();

            res.json({
                success: true,
                agents,
                totalProperties
            });

        } catch (err) {
            console.error('Error fetching agents:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Update agent stand and status (admin only)
    app.patch('/api/admin/agents/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { stand, status } = req.body;

            if (status && !['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be: active, inactive, or suspended'
                });
            }

            const updateData = {};
            if (stand !== undefined) updateData.stand = stand;
            if (status) updateData.status = status;

            const agent = await AgentUser.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );

            if (!agent) {
                return res.status(404).json({ success: false, message: 'Agent not found' });
            }

            res.json({
                success: true,
                message: 'Agent updated successfully',
                agent: {
                    id: agent._id,
                    name: agent.name,
                    stand: agent.stand,
                    status: agent.status
                }
            });

        } catch (err) {
            console.error('Error updating agent:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

};

module.exports = agent;
