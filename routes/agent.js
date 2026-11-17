const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const { check, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Strict limiter for Login and OTP
const authLimiter = rateLimit({
    windowMs: 4 * 60 * 1000,
    max: 10, // 
    message: {
        success: false, 
        message: 'Too many attempts. Please try again after 4 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'development' // skip in dev
});

// Strict limiter for password reset
const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
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

            // ── Referral code tracking ─────────────────────────────────
            // If agent signed up via a partner's referral link, record who referred them
            let referredBy = null;
            const refCode = (req.body.refCode || '').trim().toUpperCase();
            if (refCode) {
                const partner = await AgentUser.findOne({ referralCode: refCode, partnerBadge: true }).select('_id').lean();
                if (partner) {
                    referredBy = partner._id.toString();
                }
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
                ipAddress: req.ip || req.socket?.remoteAddress,
                referredBy   // null if no valid code
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

    // Login (Handles Password & Google Auth)
    app.post('/api/agent/login', authLimiter, [
        check('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Invalid email'),
    ], async (req, res) => {
        
        const { email, password, googleToken } = req.body;
        let targetEmail = email;
        let googleId = null;
    
        try {
            if (googleToken) {
                try {
                    const ticket = await client.verifyIdToken({
                        idToken: googleToken,
                        audience: process.env.GOOGLE_CLIENT_ID, 
                    });
                    const payload = ticket.getPayload();
                    
                    if (!payload.email_verified) {
                        return res.status(401).json({ success: false, message: 'Unverified Google accounts are not permitted.' });
                    }
    
                    targetEmail = payload.email;
                    googleId = payload.sub;
                } catch (jwtError) {
                    return res.status(401).json({ success: false, message: 'Invalid or expired Google token' });
                }
            } else {
                const errors = validationResult(req);
                if (!errors.isEmpty() || !password) {
                    return res.status(422).json({ success: false, message: 'Email and password are required', errors: errors.array() });
                }
            }
    
            if (targetEmail) {
                targetEmail = targetEmail.trim().toLowerCase();
            }
    
            const agent = await AgentUser.findOne({ email: targetEmail });
            
            if (!agent) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }
    
            // 3. STATUS CHECK: Make sure the account isn't banned or suspended
            if (agent.status !== 'active') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account is inactive. Please contact us through email.',
                    inactive: true 
                });
            }
    
            // 4. SECURITY CHECK: Verify Password OR bind/verify Google link mapping
            if (!googleToken) {
                const isPasswordValid = await agent.comparePassword(password);
                if (!isPasswordValid) {
                    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
                }
            } else {
                // SECURITY PATCH: If they already linked a Google ID before, make sure it matches the current one!
                if (agent.googleId && agent.googleId !== googleId) {
                    return res.status(401).json({ success: false, message: 'Google account mismatch. Please log in with your password.' });
                }
    
                // Safe to link the identity if it's their first time logging in via Google
                if (!agent.googleId) {
                    agent.googleId = googleId;
                }
            }
    
            // 5. UPDATE METRICS & SAVE
            agent.lastLogin = new Date();
            await agent.save();
    
            // 6. ESTABLISH SESSION
            req.session.agent = {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                role: agent.role,
                profilePicture: agent.profilePicture || null
            };
    
            return res.status(200).json({
                success: true,
                message: 'Login successful',
                agent: { name: agent.name, email: agent.email, role: agent.role }
            });
    
        } catch (err) {
            console.error('Agent login error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Public profile by ID
    app.get('/api/agent/public/:id', async (req, res) => {
        try {
            const agent = await AgentUser.findById(req.params.id)
                .select('name profilePicture bio stand registrationDate number boostAccount boostAccountExpiry boostPlan')
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
                    joinedAt: agent.registrationDate || null,
                    boostAccount: agent.boostAccount || false,
                    boostAccountExpiry: agent.boostAccountExpiry || null,
                    boostPlan: agent.boostPlan || null
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
            const email = (req.body.email || '').trim().toLowerCase();

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ success: false, message: 'A valid email address is required' });
            }

            const user = await AgentUser.findOne({ email });
            if (!user) return res.status(404).json({ success: false, message: 'No account found with that email address' });

            const { sendOTP } = require('../utils/sms.js');
            const result = await sendOTP(user.number, user.email);

            if (!result.success) {
                return res.status(500).json({ success: false, message: result.message });
            }

            req.session.otp = {
                code:    result.otp,
                email:   user.email,
                phone:   user.number,
                expires: Date.now() + 10 * 60 * 1000  // 10 minutes
            };

            res.json({ success: true, message: 'Reset code sent to your email' });

        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
        }
    });

    //Password reset
    app.post('/api/agent/reset-password', async (req, res) => {
        const { newPassword } = req.body;
        const email = req.session.emailVerified;

        if (!email)
            return res.status(403).json({ success: false, message: 'Not verified. Start over.' });
        if (!newPassword || newPassword.length < 8)
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword))
            return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, and number' });

        try {
            const agent = await AgentUser.findOne({ email });
            if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

            agent.password = newPassword;
            agent.passwordResetAt = new Date();
            await agent.save();

            req.session.emailVerified = null;
            res.json({ success: true, message: 'Password reset successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Verify OTP 
    app.post('/api/agent/verify-otp', authLimiter, (req, res) => {
        const otp = req.body.otp;
        const stored = req.session.otp;

        if (!stored) return res.status(400).json({ success: false, message: 'No OTP requested' });
        if (Date.now() > stored.expires) return res.status(400).json({ success: false, message: 'OTP expired' });
        if (otp !== stored.code) return res.status(400).json({ success: false, message: 'Invalid OTP' });

        req.session.otp = null;
        req.session.emailVerified = stored.email; // track by email now

        res.json({ success: true, message: 'Email verified successfully' });
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

    // Get all agents (admin only)
    app.get('/api/admin/agents', requireAdmin, async (req, res) => {
        try {
            const AgentPost = require('../model/AgentPost.js');
            
            // Get all agents with property count
            const agents = await AgentUser.find()
                .select('name email number profilePicture status stand registrationDate lastLogin loginCount partnerBadge')
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

    // ── Fred: post property with images/video from AI chat ───────────────
    // Uses the same sharp watermark pipeline as the main agent upload endpoint.
    // Latitude/longitude default to central Enugu — agent can update from dashboard.
    {
        const path   = require('path');
        const fs     = require('fs');
        const sharp  = require('sharp');
        const multer = require('multer');

        const UPLOAD_DIR = path.join(__dirname, '..', 'agent-loged', 'upload-property');
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

        const fredUpload = multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => cb(null, UPLOAD_DIR),
                filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
            }),
            fileFilter: (req, file, cb) => {
                const ext  = path.extname(file.originalname).toLowerCase();
                const imgX  = ['.jpg','.jpeg','.png','.gif','.webp'];
                const vidX  = ['.mp4','.mov','.webm','.avi'];
                const ok    = imgX.includes(ext) || vidX.includes(ext);
                cb(ok ? null : new Error('Only image or video files allowed'), ok);
            },
            limits: { fileSize: 200 * 1024 * 1024, files: 20 },
        });

        async function _processImages(files, agentId, agentName) {
            const saved = [];
            for (const file of files) {
                if (!file?.path) continue;
                const fname = `${agentId}_${Date.now()}_${Math.floor(Math.random()*1000)}.webp`;
                const out   = path.join(UPLOAD_DIR, fname);
                try {
                    const meta = await sharp(file.path).metadata();
                    const w    = Math.min(meta.width || 1200, 1200);
                    const h    = Math.round((w / (meta.width || 1200)) * (meta.height || 800));
                    const safe = (agentName || 'Easy Find').replace(/[<>&"]/g, '');
                    const fs_  = Math.max(16, Math.round(w * 0.024));
                    const pad  = Math.round(fs_ * 0.8);
                    const lh   = Math.round(fs_ * 1.4);
                    const bh   = lh * 2 + pad * 2;
                    const bw   = Math.round(w * 0.45);
                    const bx   = (w - bw) / 2;
                    const by_  = (h - bh) / 2;
                    const svg  = Buffer.from(
                        `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
                        `<rect x="${bx}" y="${by_}" width="${bw}" height="${bh}" rx="8" fill="rgba(0,0,0,0.45)"/>` +
                        `<text x="${w/2}" y="${by_+pad+fs_}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs_}" font-weight="bold" fill="white" opacity="0.95">@${safe}</text>` +
                        `<text x="${w/2}" y="${by_+pad+fs_+lh}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(fs_*0.85)}" fill="#66eae3" opacity="0.9">easyfind.com.ng</text>` +
                        `</svg>`
                    );
                    await sharp(file.path)
                        .resize({ width: 1200, withoutEnlargement: true })
                        .composite([{ input: svg, blend: 'over' }])
                        .webp({ quality: 65, effort: 6 })
                        .toFile(out);
                    saved.push(fname);
                } catch (e) { console.error('[Fred upload] sharp error:', e.message); }
            }
            return saved;
        }

        app.post(
            '/api/fred/post-property',
            requireAgent,
            fredUpload.fields([{ name: 'images', maxCount: 19 }, { name: 'video', maxCount: 1 }]),
            async (req, res) => {
                try {
                    const AgentPost = require('../model/AgentPost.js');
                    const agentId   = req.session.agent.id;
                    const agentName = req.session.agent.name || '';

                    const { title, type, category, price, location, beds, baths, description } = req.body;

                    if (!title || !type || !category || !price || !location) {
                        return res.status(400).json({ success: false, message: 'Missing required fields: title, type, category, price, location' });
                    }
                    const validTypes = ['house', 'apartment', 'land', 'villa', 'commercial'];
                    const validCats  = ['rent', 'sale', 'shortlet'];
                    if (!validTypes.includes(type))    return res.status(400).json({ success: false, message: 'Invalid property type' });
                    if (!validCats.includes(category)) return res.status(400).json({ success: false, message: 'Invalid category' });

                    const cleanPrice = parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0;

                    const agentUser  = await AgentUser.findById(agentId).select('stand number name').lean();
                    const isVerified = agentUser?.stand === 'Verified Agent';

                    if (!isVerified) {
                        const now        = new Date();
                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                        const count      = await AgentPost.countDocuments({ agentId: agentId.toString(), date: { $gte: monthStart, $lt: monthEnd } });
                        if (count >= 5)            return res.status(403).json({ success: false, limitReached: true, message: 'Unverified agents can only post 5 properties per month.' });
                        if (cleanPrice >= 1000000) return res.status(403).json({ success: false, message: 'Verification required for listings ₦1,000,000 or above.' });
                    }

                    // Process images with watermark
                    const imageFiles = req.files?.images || [];
                    const videoFiles = req.files?.video  || [];
                    const imageNames = imageFiles.length ? await _processImages(imageFiles, agentId, agentName) : [];

                    let videoName = null;
                    if (videoFiles.length) {
                        const vf  = videoFiles[0];
                        const ext = path.extname(vf.originalname).toLowerCase() || '.mp4';
                        const vn  = `${agentId}_${Date.now()}_video${ext}`;
                        fs.renameSync(vf.path, path.join(UPLOAD_DIR, vn));
                        videoName = vn;
                    }

                    const newPost = new AgentPost({
                        agentId:     agentId.toString(),
                        title:       title.trim(),
                        type,
                        category,
                        price:       cleanPrice,
                        location:    location.trim(),
                        beds:        type === 'land' ? null : (parseInt(beds) || 0),
                        baths:       type === 'land' ? null : (parseInt(baths) || 0),
                        description: (description || '').trim().slice(0, 5000),
                        imageNames,
                        videoName,
                        date:        new Date(),
                        // Default to central Enugu — agent can pin location from dashboard
                        latitude:  6.4584,
                        longitude: 7.5464,
                        agentNumber: agentUser?.number || 'N/A',
                        agentName:   agentUser?.name   || agentName,
                        agentType:   'agent',
                        platform:    'Easyfind',
                    });

                    await newPost.save();

                    const appBase = (process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0].trim();
                    newPost.postUrl = `${appBase}/property?id=${newPost._id}`;
                    await newPost.save();

                    // Index in Fred's ChromaDB (non-blocking)
                    const FRED_URL = (process.env.FRED_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
                    setImmediate(async () => {
                        try {
                            await fetch(`${FRED_URL}/internal/index-property`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    id: newPost._id.toString(), title: newPost.title,
                                    type: newPost.type, category: newPost.category,
                                    price: newPost.price, price_raw: `₦${newPost.price.toLocaleString('en-NG')}`,
                                    location: newPost.location, beds: newPost.beds, baths: newPost.baths,
                                    description: newPost.description, features: [],
                                    agentName: agentUser?.name || agentName, agentNumber: agentUser?.number || 'N/A',
                                    platform: 'Easyfind', postUrl: newPost.postUrl,
                                }),
                                signal: AbortSignal.timeout(8000),
                            });
                        } catch (_) {}
                    });

                    res.status(201).json({ success: true, postId: newPost._id, postUrl: newPost.postUrl });

                } catch (err) {
                    console.error('[Fred post-property] Error:', err.message);
                    res.status(500).json({ success: false, message: 'Server error' });
                }
            }
        );
    }

    // ── Fred: Public agent listing + search ──────────────────────────────
    app.get('/api/fred/agents', async (req, res) => {
        try {
            const { q, limit = 5 } = req.query;
            const cap = Math.min(parseInt(limit) || 5, 10);

            const filter = { status: 'active' };
            if (q && q.trim().length > 0) {
                filter.name = { $regex: q.trim().slice(0, 50), $options: 'i' };
            }

            const agents = await AgentUser.find(filter)
                .select('name profilePicture stand bio number boostAccount boostAccountExpiry')
                .lean();

            // Sort: boosted+verified → verified → boosted → rest
            agents.sort((a, b) => {
                const rankA = (a.boostAccount ? 2 : 0) + (a.stand === 'Verified Agent' ? 1 : 0);
                const rankB = (b.boostAccount ? 2 : 0) + (b.stand === 'Verified Agent' ? 1 : 0);
                return rankB - rankA;
            });

            const top = agents.slice(0, cap).map(a => ({
                id:             a._id,
                name:           a.name,
                verified:       a.stand === 'Verified Agent',
                boosted:        a.boostAccount && (!a.boostAccountExpiry || new Date(a.boostAccountExpiry) > new Date()),
                bio:            a.bio || null,
                phone:          a.number || null,
                profilePicture: a.profilePicture || null,
            }));

            res.json({ success: true, agents: top, total: agents.length });
        } catch (err) {
            console.error('[Fred agents] Error:', err.message);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── Convert user account to agent ─────────────────────────────────────
    app.post('/api/user/upgrade-to-agent', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'You must be logged in as a user' });
        }
        try {
            const User = require('../model/User.js');
            const user = await User.findById(req.session.userId).lean();
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });

            const { phone } = req.body;
            if (!phone || !/^0\d{10}$/.test(phone)) {
                return res.status(400).json({ success: false, message: 'Valid 11-digit phone number required (starting with 0)' });
            }

            const phoneExists = await AgentUser.findOne({ number: phone });
            if (phoneExists) return res.status(409).json({ success: false, message: 'Phone number already in use by another agent' });

            const emailExists = await AgentUser.findOne({ email: user.email });
            if (emailExists) return res.status(409).json({ success: false, message: 'Email already linked to an agent account' });

            const crypto = require('crypto');
            const newAgent = new AgentUser({
                name:             user.name,
                email:            user.email,
                password:         crypto.randomBytes(20).toString('hex') + 'Aa1!',
                googleId:         user.googleId || undefined,
                number:           phone,
                profilePicture:   user.profilePicture || null,
                status:           'active',
                stand:            'Not verified',
                bio:              '',
                registrationDate: new Date(),
                ipAddress:        req.ip || req.socket?.remoteAddress,
            });
            await newAgent.save();

            // Swap session from user → agent
            req.session.userId = undefined;
            req.session.agent  = {
                id:             newAgent._id,
                name:           newAgent.name,
                email:          newAgent.email,
                role:           'agent',
                profilePicture: newAgent.profilePicture || null,
            };

            res.status(201).json({
                success: true,
                message: 'Account upgraded to agent successfully',
                agent:   { id: newAgent._id, name: newAgent.name, email: newAgent.email }
            });
        } catch (err) {
            console.error('[Upgrade] Error:', err.message);
            if (err.code === 11000) return res.status(409).json({ success: false, message: 'Phone or email already registered' });
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── Fred session check — detects both user and agent sessions ─────────
    app.get('/api/fred/agent-session', (req, res) => {
        if (req.session.agent) {
            return res.json({
                loggedIn: true,
                type:           'agent',
                id:             req.session.agent.id,
                name:           req.session.agent.name,
                email:          req.session.agent.email,
                profilePicture: req.session.agent.profilePicture || null,
            });
        }
        if (req.session.userId) {
            return res.json({ loggedIn: true, type: 'user' });
        }
        res.json({ loggedIn: false });
    });

    // Get notifications for logged-in agent
    app.get('/api/agent/notifications', requireAgent, async (req, res) => {
        try {
            const Notification = require('../model/Notification.js');
            const notifications = await Notification.find({ agentId: req.session.agent.id })
                .sort({ createdAt: -1 })
                .lean();

            res.json({ success: true, notifications });
        } catch (err) {
            console.error('Error fetching notifications:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Delete specific notification
    app.delete('/api/agent/notifications/:id', requireAgent, async (req, res) => {
        try {
            const Notification = require('../model/Notification.js');
            const result = await Notification.findOneAndDelete({
                _id: req.params.id,
                agentId: req.session.agent.id
            });

            if (!result) {
                return res.status(404).json({ success: false, message: 'Notification not found' });
            }

            res.json({ success: true, message: 'Notification deleted successfully' });
        } catch (err) {
            console.error('Error deleting notification:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

};

module.exports = agent;
