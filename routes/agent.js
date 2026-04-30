const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const { check, validationResult } = require('express-validator');

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
    app.post('/api/agent/login', upload.none(), [
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
                .select('name profilePicture bio registrationDate')
                .lean();
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            res.json({
                success: true,
                agent: {
                    id: agent._id,
                    name: agent.name,
                    profilePicture: agent.profilePicture || null,
                    bio: agent.bio || null,
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
    app.post('/api/update/bio', requireAgent, async (req, res) => {
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

};

module.exports = agent;
