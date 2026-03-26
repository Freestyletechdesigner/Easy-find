const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { check, validationResult } = require('express-validator');

const upload = multer();

const agent = (app) => {
    const AGENTS_FILE = path.join(__dirname, '..', 'database', 'agents.json');

    // Initialize agents file
    async function initAgentsFile() {
        try {
            await fs.access(AGENTS_FILE);
        } catch {
            // Create default agent for testing
            const defaultAgent = [{
                id: 'AGENT_001',
                name: 'John Doe',
                email: 'agent@easyfind.com',
                password: await bcrypt.hash('agent123', 12),
                phone: '08012345678',
                role: 'agent',
                status: 'active',
                properties: [],
                createdAt: new Date().toISOString(),
                lastLogin: null
            }];
            await fs.writeFile(AGENTS_FILE, JSON.stringify(defaultAgent, null, 2));
        }
    }

    initAgentsFile();

    // Agent signup endpoint
    app.post('/api/agent/signup',
        upload.none(),
        [
            check('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
            check('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
            check('email').isEmail().normalizeEmail().withMessage('Invalid email'),
            check('phone').matches(/^0\d{10}$/).withMessage('Phone must be 11 digits starting with 0'),
            check('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
                .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number')
        ],
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { firstName, lastName, email, phone, password, bio } = req.body;

            try {
                // Check if email already exists
                const existingAgent = await getAgentByEmail(email);
                if (existingAgent) {
                    return res.status(409).json({
                        success: false,
                        message: 'Email already registered'
                    });
                }

                // Read existing agents
                const data = await fs.readFile(AGENTS_FILE, 'utf8');
                const agents = JSON.parse(data);

                // Generate agent ID
                const agentId = `AGENT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 12);

                // Create new agent
                const newAgent = {
                    id: agentId,
                    name: `${firstName} ${lastName}`,
                    email: email.toLowerCase(),
                    password: hashedPassword,
                    phone: phone,
                    role: 'agent',
                    status: 'active', // Can be 'pending' if you want admin approval
                    properties: [],
                    bio: bio || '',
                    createdAt: new Date().toISOString(),
                    lastLogin: null
                };

                // Add to agents array
                agents.push(newAgent);

                // Save to file
                await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));

                res.status(201).json({
                    success: true,
                    message: 'Agent account created successfully',
                    agentId: agentId
                });
            } catch (err) {
                console.error('Agent signup error:', err);
                res.status(500).json({
                    success: false,
                    message: 'Server error'
                });
            }
        }
    );

    // Helper function to get agent by email
    async function getAgentByEmail(email) {
        try {
            const data = await fs.readFile(AGENTS_FILE, 'utf8');
            const agents = JSON.parse(data);
            return agents.find(agent => agent.email.toLowerCase() === email.toLowerCase());
        } catch (error) {
            console.error('Error reading agents file:', error);
            return null;
        }
    }

    // Helper function to update agent login info
    async function updateAgentLogin(email) {
        try {
            const data = await fs.readFile(AGENTS_FILE, 'utf8');
            const agents = JSON.parse(data);
            const agentIndex = agents.findIndex(agent => agent.email.toLowerCase() === email.toLowerCase());
            
            if (agentIndex !== -1) {
                agents[agentIndex].lastLogin = new Date().toISOString();
                await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
            }
        } catch (error) {
            console.error('Error updating agent login:', error);
        }
    }

    // Agent login endpoint
    app.post('/api/agent/login',
        upload.none(),
        [
            check('email').isEmail().normalizeEmail().withMessage('Invalid email'),
            check('password').notEmpty().withMessage('Password is required')
        ],
        async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { email, password } = req.body;

            try {
                // Get agent from file
                const agent = await getAgentByEmail(email);

                if (!agent) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Check if agent is active
                if (agent.status !== 'active') {
                    return res.status(403).json({
                        success: false,
                        message: 'Your account is inactive. Please contact admin.'
                    });
                }

                // Verify password
                const isMatch = await bcrypt.compare(password, agent.password);

                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Update last login
                await updateAgentLogin(email);

                // Create agent session
                req.session.regenerate(err => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Server error'
                        });
                    }

                    req.session.agent = {
                        id: agent.id,
                        name: agent.name,
                        email: agent.email,
                        role: agent.role
                    };

                    res.status(200).json({
                        success: true,
                        message: 'Login successful',
                        agent: {
                            name: agent.name,
                            email: agent.email,
                            role: agent.role
                        }
                    });
                });
            } catch (err) {
                console.error('Agent login error:', err);
                res.status(500).json({
                    success: false,
                    message: 'Server error'
                });
            }
        }
    );

    // Check agent session status
    app.get('/api/agent/status', (req, res) => {
        if (req.session.agent) {
            res.json({
                success: true,
                isAgent: true,
                agent: {
                    name: req.session.agent.name,
                    email: req.session.agent.email,
                    role: req.session.agent.role
                }
            });
        } else {
            res.json({
                success: true,
                isAgent: false
            });
        }
    });

    // Public: get a single agent's public profile by ID
    app.get('/api/agent/public/:id', async (req, res) => {
        try {
            const data   = await fs.readFile(AGENTS_FILE, 'utf8');
            const agents = JSON.parse(data);
            const agent  = agents.find(a => a.id === req.params.id);
            if (!agent) return res.status(403).json({ success: false, message: 'Agent not found' });
            res.json({
                success: true,
                agent: {
                    name: agent.name,
                    profilePicture: agent.profilePicture || null
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Agent logout
    app.post('/api/agent/logout', (req, res) => {
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

    // Get agent profile (protected)
    app.get('/api/agent/profile', requireAgent, async (req, res) => {
        try {
            const agent = await getAgentByEmail(req.session.agent.email);
            
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            // Remove sensitive data
            const { password, ...agentData } = agent;

            res.json({
                success: true,
                agent: agentData
            });
        } catch (error) {
            console.error('Error fetching agent profile:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching profile'
            });
        }
    });

    // Get all agents (admin only)
    app.get('/api/agents', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(AGENTS_FILE, 'utf8');
            const agents = JSON.parse(data);

            // Remove sensitive data
            const safeAgents = agents.map(agent => {
                const { password, ...agentData } = agent;
                return agentData;
            });

            res.json({
                success: true,
                agents: safeAgents
            });
        } catch (error) {
            console.error('Error fetching agents:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching agents'
            });
        }
    });

    // Middleware to require agent authentication
    function requireAgent(req, res, next) {
        if (!req.session.agent) {
            return res.status(403).json({
                success: false,
                message: 'Agent authentication required'
            });
        }
        next();
    }

    // Middleware to require admin authentication
    function requireAdmin(req, res, next) {
        if (!req.session.admin) {
            return res.status(403).json({
                success: false,
                message: 'Admin authentication required'
            });
        }
        next();
    }
};

module.exports = agent;
