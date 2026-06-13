const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const { check, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Strict limiter for Login and OTP
const authLimiter = rateLimit({
    windowMs: 4 * 60 * 1000,
    max: 10,
    message: {
        success: false, 
        message: 'Too many attempts. Please try again after 4 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
});

// Strict limiter for password reset
const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 2,
    message: {
        success: false, 
        message: 'Please try again after an hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development'
});

const upload = multer();

const agent = (app) => {

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

    // Signup (email/password)
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

    // Google sign-up/sign-in for agents
    // When Google is used on the agent login page:
    //   - Existing agent  → logs them in normally
    //   - New Google user → creates a partial agent account and returns
    //     needsProfile: true so the frontend can redirect to the
    //     agent sign-up page with fields pre-filled (phone & bio required)
    app.post('/api/agent/google-auth', authLimiter, async (req, res) => {
        const { googleToken } = req.body;

        if (!googleToken) {
            return res.status(400).json({ success: false, message: 'Google token is required' });
        }

        let payload;
        try {
            const ticket = await client.verifyIdToken({
                idToken: googleToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired Google token' });
        }

        if (!payload.email_verified) {
            return res.status(401).json({ success: false, message: 'Unverified Google accounts are not permitted.' });
        }

        const targetEmail = payload.email.trim().toLowerCase();
        const googleName  = payload.name || payload.email.split('@')[0];
        const googleId    = payload.sub;

        try {
            let agentDoc = await AgentUser.findOne({ email: targetEmail });

            // ── EXISTING AGENT: log them in ──────────────────────────────────────
            if (agentDoc) {
                if (agentDoc.status !== 'active') {
                    return res.status(403).json({
                        success: false,
                        message: 'Your account is inactive. Please contact us through email.',
                        inactive: true
                    });
                }

                // Bind googleId on first Google login
                if (agentDoc.googleId && agentDoc.googleId !== googleId) {
                    return res.status(401).json({ success: false, message: 'Google account mismatch. Please log in with your password.' });
                }
                if (!agentDoc.googleId) {
                    agentDoc.googleId = googleId;
                }

                agentDoc.lastLogin = new Date();
                await agentDoc.save();

                req.session.agent = {
                    id: agentDoc._id,
                    name: agentDoc.name,
                    email: agentDoc.email,
                    role: agentDoc.role,
                    profilePicture: agentDoc.profilePicture || null
                };

                return res.json({
                    success: true,
                    message: 'Login successful',
                    agent: { name: agentDoc.name, email: agentDoc.email, role: agentDoc.role }
                });
            }

            // ── NEW AGENT: they need to complete their profile ───────────────────
            // We do NOT create the account yet — we return the Google profile data
            // so the frontend can pre-fill the sign-up form (phone & bio still needed).
            return res.json({
                success: true,
                needsProfile: true,
                message: 'Google account verified. Please complete your agent profile.',
                profile: {
                    name:        googleName,
                    email:       targetEmail,
                    googleToken  // pass token back so the complete-profile step can use it
                }
            });

        } catch (err) {
            console.error('Agent Google auth error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Complete agent profile after Google sign-up
    // Called from the sign-up form when needsProfile === true
    app.post('/api/agent/google-signup-complete', authLimiter, upload.none(), [
        check('phone').matches(/^0\d{10}$/).withMessage('Phone must be 11 digits starting with 0'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: errors.array()[0].msg });
        }

        const { googleToken, phone, bio } = req.body;

        if (!googleToken || !phone) {
            return res.status(400).json({ success: false, message: 'Google token and phone number are required' });
        }

        // Re-verify the token (never trust client-provided email)
        let payload;
        try {
            const ticket = await client.verifyIdToken({
                idToken: googleToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Google token expired. Please sign in with Google again.' });
        }

        const targetEmail = payload.email.trim().toLowerCase();
        const googleName  = payload.name || payload.email.split('@')[0];
        const googleId    = payload.sub;

        try {
            // Guard against race conditions — check again in case account now exists
            const existing = await AgentUser.findOne({ email: targetEmail });
            if (existing) {
                // Just log them in
                req.session.agent = {
                    id: existing._id,
                    name: existing.name,
                    email: existing.email,
                    role: existing.role,
                    profilePicture: existing.profilePicture || null
                };
                return res.json({ success: true, message: 'Account already exists. Logged in successfully.' });
            }

            const newAgent = new AgentUser({
                name:             googleName,
                email:            targetEmail,
                password:         null,   // Google-only account
                number:           phone,
                googleId,
                role:             'agent',
                status:           'active',
                stand:            'Not verified',
                bio:              bio || '',
                registrationDate: new Date(),
                ipAddress:        req.ip || req.socket?.remoteAddress
            });

            await newAgent.save();

            req.session.agent = {
                id:    newAgent._id,
                name:  newAgent.name,
                email: newAgent.email,
                role:  'agent'
            };

            return res.status(201).json({
                success: true,
                message: 'Agent account created successfully! Welcome to Easy Find.',
                agentId: newAgent._id
            });

        } catch (err) {
            console.error('Agent Google sign-up complete error:', err);
            if (err.code === 11000) {
                return res.status(409).json({ success: false, message: 'Email or phone already registered' });
            }
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Login (Handles Password & Google Auth — kept for backward compat, now delegates to google-auth)
    app.post('/api/agent/login', authLimiter, [
        check('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Invalid email'),
    ], async (req, res) => {
        
        const { email, password, googleToken } = req.body;

        // If a Google token is present, forward to the unified google-auth handler logic
        if (googleToken) {
            // Inline the same logic to avoid a double HTTP request
            let payload;
            try {
                const ticket = await client.verifyIdToken({
                    idToken: googleToken,
                    audience: process.env.GOOGLE_CLIENT_ID,
                });
                payload = ticket.getPayload();
            } catch (err) {
                return res.status(401).json({ success: false, message: 'Invalid or expired Google token' });
            }

            if (!payload.email_verified) {
                return res.status(401).json({ success: false, message: 'Unverified Google accounts are not permitted.' });
            }

            const targetEmail = payload.email.trim().toLowerCase();
            const googleName  = payload.name || payload.email.split('@')[0];
            const googleId    = payload.sub;

            try {
                let agentDoc = await AgentUser.findOne({ email: targetEmail });

                if (agentDoc) {
                    if (agentDoc.status !== 'active') {
                        return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact us through email.', inactive: true });
                    }
                    if (agentDoc.googleId && agentDoc.googleId !== googleId) {
                        return res.status(401).json({ success: false, message: 'Google account mismatch. Please log in with your password.' });
                    }
                    if (!agentDoc.googleId) agentDoc.googleId = googleId;
                    agentDoc.lastLogin = new Date();
                    await agentDoc.save();

                    req.session.agent = {
                        id: agentDoc._id,
                        name: agentDoc.name,
                        email: agentDoc.email,
                        role: agentDoc.role,
                        profilePicture: agentDoc.profilePicture || null
                    };

                    return res.json({
                        success: true,
                        message: 'Login successful',
                        agent: { name: agentDoc.name, email: agentDoc.email, role: agentDoc.role }
                    });
                }

                // New agent — needs profile completion
                return res.json({
                    success: true,
                    needsProfile: true,
                    message: 'Google account verified. Please complete your agent profile.',
                    profile: { name: googleName, email: targetEmail, googleToken }
                });

            } catch (err) {
                console.error('Agent login (Google) error:', err);
                return res.status(500).json({ success: false, message: 'Server error' });
            }
        }

        // Standard password login
        let targetEmail = email;
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty() || !password) {
                return res.status(422).json({ success: false, message: 'Email and password are required', errors: errors.array() });
            }

            if (targetEmail) targetEmail = targetEmail.trim().toLowerCase();

            const agentDoc = await AgentUser.findOne({ email: targetEmail });

            if (!agentDoc) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }

            if (agentDoc.status !== 'active') {
                return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact us through email.', inactive: true });
            }

            // Check if this is a Google-only account
            if (!agentDoc.password) {
                return res.status(401).json({ success: false, message: 'This account was created with Google. Please sign in with Google.' });
            }

            const isPasswordValid = await agentDoc.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            agentDoc.lastLogin = new Date();
            await agentDoc.save();

            req.session.agent = {
                id: agentDoc._id,
                name: agentDoc.name,
                email: agentDoc.email,
                role: agentDoc.role,
                profilePicture: agentDoc.profilePicture || null
            };

            return res.status(200).json({
                success: true,
                message: 'Login successful',
                agent: { name: agentDoc.name, email: agentDoc.email, role: agentDoc.role }
            });

        } catch (err) {
            console.error('Agent login error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Public profile by ID
    app.get('/api/agent/profile/:id', async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.params.id)
                .select('name email profilePicture stand bio')
                .lean();
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
            res.json({ success: true, agent });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
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

    // Get all agents (admin only)
    app.get('/api/admin/agents', requireAdmin, async (req, res) => {
        try {
            const AgentPost = require('../model/AgentPost.js');
            
            const agents = await AgentUser.find()
                .select('name email number profilePicture status stand registrationDate lastLogin loginCount')
                .lean()
                .sort({ registrationDate: -1 });

            const agentIds = agents.map(a => a._id.toString());
            const propertyCounts = await AgentPost.aggregate([
                { $match: { agentId: { $in: agentIds } } },
                { $group: { _id: '$agentId', count: { $sum: 1 } } }
            ]);

            const propertyCountMap = {};
            propertyCounts.forEach(pc => {
                propertyCountMap[pc._id] = pc.count;
            });

            agents.forEach(agent => {
                agent.propertyCount = propertyCountMap[agent._id.toString()] || 0;
            });

            const totalProperties = await AgentPost.countDocuments();

            res.json({ success: true, agents, totalProperties });

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
                return res.status(404).json({ success: false, message: 'No verified agent yet' });
            }
            res.json({ success: true, VerifiedAgent: agents.length });
        } catch (error) {
            console.error('Error on count verified agent:', error);
            res.json({ success: false, message: 'Error loading verified agent' });
        }
    });

    // Update agent name (settings)
    app.patch('/api/agent/settings/name', requireAgent, authLimiter, async (req, res) => {
        const { name } = req.body;
        if (!name || name.trim().length < 2)
            return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
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
            const agentDoc = await AgentUser.findById(req.session.agent.id);
            if (!agentDoc.password) {
                return res.status(400).json({ success: false, message: 'This account uses Google sign-in. You can set a password by using the forgot-password flow.' });
            }
            const isMatch = await agentDoc.comparePassword(currentPassword);
            if (!isMatch)
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            agentDoc.password = newPassword;
            await agentDoc.save();
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
                return res.status(400).json({ success: false, message: 'Invalid status. Must be: active, inactive, or suspended' });
            }

            const validStands = ['Not verified', 'Verified Agent'];
            if (stand !== undefined && !validStands.includes(stand)) {
                return res.status(400).json({ success: false, message: 'Invalid stand value' });
            }

            const updateData = {};
            if (stand !== undefined) updateData.stand = stand;
            if (status) updateData.status = status;

            const agentDoc = await AgentUser.findByIdAndUpdate(id, updateData, { new: true });

            if (!agentDoc) {
                return res.status(404).json({ success: false, message: 'Agent not found' });
            }

            res.json({
                success: true,
                message: 'Agent updated successfully',
                agent: { id: agentDoc._id, name: agentDoc.name, stand: agentDoc.stand, status: agentDoc.status }
            });

        } catch (err) {
            console.error('Error updating agent:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

};

module.exports = agent;