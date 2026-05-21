const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const { check, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Strict limiter for Login and OTP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 min (generous for dev/testing)
    message: {
        success: false, 
        message: 'Too many attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development' // skip in dev
});

// Strict limiter for password reset
const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: {
        success: false, 
        message: 'Too many attempts. Please try again after an hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
});

// General limiter for public profiles/status - Fix 31: removed unused apiLimiter

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

    // Signup - Fix 9: Apply authLimiter
    app.post('/api/agent/signup', authLimiter, upload.none(), [
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
                ipAddress: req.ip || req.socket?.remoteAddress
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
    app.post('/api/agent/login', authLimiter, [
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
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account is inactive. Please contact us through email.',
                    inactive: true 
                });
            }

            const isPasswordValid = await agent.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            agent.lastLogin = new Date();
            await agent.save();

            req.session.agent = {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                role: agent.role,
                profilePicture: agent.profilePicture || null
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

    // Public profile by ID
    app.get('/api/agent/public/:id', async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.params.id)
                .select('name profilePicture bio stand registrationDate number')
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
                    phone: agent.number || null,
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

    // Verify OTP - Fix 8: Apply authLimiter
    app.post('/api/agent/verify-otp', authLimiter, (req, res) => {
        const otp = req.body.otp;
        const stored = req.session.otp;

        if (!stored) return res.status(400).json({ success: false, message: 'No OTP requested' });
        if (Date.now() > stored.expires) return res.status(400).json({ success: false, message: 'OTP expired' });
        if (otp !== stored.code) return res.status(400).json({ success: false, message: 'Invalid OTP' });

        req.session.otp = null;
        req.session.phoneVerified = stored.phone;

        res.json({ success: true, message: 'Phone number verified successfully' });
    });

    // Get verified agents (public)
    app.get('/api/agents/verified', async (req, res) => {
        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit;
    
        try {
            
            const [agents, totalCount] = await Promise.all([
                AgentUser.find({ stand: 'Verified Agent', status: 'active' })
                    .select('name profilePicture stand bio')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                AgentUser.countDocuments({ stand: 'Verified Agent', status: 'active' })
            ]);
    
            res.json({
                success: true,
                totalCount,
                // Clean up mappings inline inside the response loop
                agents: agents.map(agent => ({
                    id: agent._id,
                    name: agent.name,
                    profilePicture: agent.profilePicture || null,
                    stand: agent.stand || 'Agent'
                }))
            });
        } catch (err) {
            console.error('Error fetching verified agents:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ADMIN ROUTES - Agent Management
    // Get all agents (admin only)
    app.get('/api/admin/agents', requireAdmin, async (req, res) => {
        try {
            const AgentPost = require('../model/AgentPost.js');
            
            // Get all agents with property count
            const agents = await AgentUser.find()
                .select('name email number profilePicture status stand registrationDate lastLogin loginCount')
                .lean()
                .sort({ registrationDate: -1 });

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

    // Get verified for admin
    app.get('/api/get-verified-agent/admin', requireAdmin, async (req, res) => {
        try {
            const agents = await AgentUser.find({ stand: 'Verified Agent' });
            if (!agents) {
                return res.status(404).json({
                    success: false,
                    message: 'No verified agent yet'
                })
            }

            res.json({
                success: true,
                VerifiedAgent: agents.length
            })
        } catch (error) {
            console.error('Error on count verified agent:', error);
            res.json({
                success: false,
                message: 'Error loading verified agent'
            })
        }
    });

    // Update agent name (settings)
    app.patch('/api/agent/settings/name', requireAgent, authLimiter, async (req, res) => {
        const { name } = req.body;
        if (!name || name.trim().length < 2)
            return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
        // Fix 24: Add max length validation
        if (name.trim().length > 50)
            return res.status(400).json({ success: false, message: 'Name too long' });
        try {
            await AgentUser.findByIdAndUpdate(req.session.agent.id, { name: name.trim() });
            req.session.agent.name = name.trim();
            res.json({ success: true, message: 'Name updated successfully' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Change agent password (settings)
    app.patch('/api/agent/settings/password', requireAgent, resetLimiter, async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ success: false, message: 'All fields are required' });
        if (newPassword.length < 8)
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword))
            return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, and number' });
        try {
            const agent = await AgentUser.findById(req.session.agent.id);
            const isMatch = await agent.comparePassword(currentPassword);
            if (!isMatch)
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            agent.password = newPassword;
            await agent.save();
            res.json({ success: true, message: 'Password changed successfully' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Delete agent account (settings)
    app.delete('/api/agent/settings/delete', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id;
            const AgentPost = require('../model/AgentPost.js');
            await AgentPost.deleteMany({ agentId: agentId.toString() });
            await AgentUser.findByIdAndDelete(agentId);
            req.session.destroy();
            res.json({ success: true, message: 'Account deleted successfully' });
        } catch (err) {
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

            // Fix 23: Whitelist validation for stand field
            const validStands = ['Not verified', 'Verified Agent'];
            if (stand !== undefined && !validStands.includes(stand)) {
                return res.status(400).json({ success: false, message: 'Invalid stand value' });
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
