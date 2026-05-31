const multer = require('multer'); 
const {check, validationResult} = require('express-validator');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const AgentPost = require('../model/AgentPost.js');
const AgentUser = require('../model/AgentUser.js');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'agent-loged', 'upload-property');

// Ensure upload directory exists safely
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Store in memory buffer so sharp can optimize pixel payloads before writing to disk
const storage = multer.memoryStorage();

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Only image files are allowed (.jpg, .jpeg, .png, .gif, .webp)'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max per raw incoming file
        files: 10                  // Max 10 files per request
    }
});

const AGENT_POST = (app) => {

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

    // Helper function to handle async sharp compression across multiple files
    async function processAndSaveImages(files, agentId, agentName = '') {
        const savedFilenames = [];

        for (const file of files) {
            const fileName = `${agentId}_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`;
            const finalPath = path.join(UPLOAD_DIR, fileName);

            // Get image dimensions first so watermark scales correctly
            const meta = await sharp(file.buffer).metadata();
            const imgWidth  = meta.width  || 1200;
            const imgHeight = meta.height || 800;

            // Build SVG watermark — agent name + domain, centered
            const safeName   = (agentName || 'Easy Find').replace(/[<>&"]/g, '');
            const fontSize   = Math.max(18, Math.round(imgWidth * 0.024));
            const padding    = Math.round(fontSize * 0.8);
            const lineHeight = Math.round(fontSize * 1.4);
            const boxH       = lineHeight * 2 + padding * 2;
            const boxW       = Math.round(imgWidth * 0.45);
            const boxX       = (imgWidth - boxW) / 2;
            const boxY       = (imgHeight - boxH) / 2;
            const textCenterX = boxX + (boxW / 2); 
            const text1Y     = boxY + padding + fontSize;
            const text2Y     = text1Y + lineHeight;

            const svgWatermark = Buffer.from(`
                <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}"
                          rx="8" ry="8" fill="rgba(0, 0, 0, 0.45)"/> <text x="${textCenterX}" y="${text1Y}"
                          text-anchor="middle"
                          font-family="Arial, sans-serif" font-size="${fontSize}"
                          font-weight="bold" fill="white" opacity="0.95">${safeName}</text>
                    
                    <text x="${textCenterX}" y="${text2Y}"
                          text-anchor="middle"
                          font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.85)}"
                          fill="#66eae3" opacity="0.9">easyfind.com.ng</text>
                </svg>
            `);

            await sharp(file.buffer)
                .resize({ width: 1200, withoutEnlargement: true })
                .composite([{ input: svgWatermark, blend: 'over' }])
                .webp({
                    quality: 65,
                    effort: 6
                })
                .toFile(finalPath);

            savedFilenames.push(fileName);
        }
        return savedFilenames;
    }

    // Post request
    app.post('/api/agent/post', requireAgent, upload.array('file'), [
        check('title').notEmpty().trim().escape(),
        check('type').notEmpty().trim().escape(),
        check('category').notEmpty().isIn(['sale', 'rent', 'shortlet']).withMessage('Invalid category'),
        check('price').notEmpty().isNumeric().isFloat({ min: 0 }),
        check('location').notEmpty().trim().escape(),
        check('beds').optional({ checkFalsy: true }).isNumeric().trim().escape(),
        check('baths').optional({ checkFalsy: true }).isNumeric().trim().escape(),
        check('area').optional({ checkFalsy: true }).trim(),
        check('description').trim().escape().isLength({ max: 5000 }),
        check('features').trim().escape().isLength({ max: 1000 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(422).json({ 
                success: false,
                message: "Validation failed" 
            });
        }

        const { title, type, category, price, location, beds, baths, area, description, features } = req.body;
        const isLand = type === 'land';
        const agentId   = req.session.agent.id;
        const agentName = req.session.agent.name || '';

        try {
            // Process and compress files through memory buffer loop pipeline
            const imageNames = req.files && req.files.length ? await processAndSaveImages(req.files, agentId, agentName) : [];

            const newPost = new AgentPost({
                agentId,
                title,
                type,
                category,
                price,
                location,
                beds:  isLand ? null : (beds  || null),
                baths: isLand ? null : (baths || null),
                area,
                description,
                features,
                imageNames: imageNames,
                date: Date.now(),
                view: 0
            }); 
            
            await newPost.save();
    
            res.json({
                success: true,
                postID: newPost
            });

            // Broadcast via WebSockets
            setImmediate(() => {
                const broadcastProperty = req.app.get('broadcastProperty');
                if (broadcastProperty) {
                    broadcastProperty(newPost);
                }
            });
        } catch (error) {
            console.error('Error uploading property:', error);
            res.status(500).json({
                success: false,
                message: 'Server Error'
            });
        }
    });

    // Get request for agent only
    app.get('/api/agent/property', requireAgent, async (req, res) => {
        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit;

        try {
            const agentId = req.session.agent.id;

            const [agentPost, agentUser] = await Promise.all([
                AgentPost.find({ agentId }).sort({ date: -1 }).skip(skip).limit(limit).lean(),
                AgentUser.findById(agentId).select('stand').lean()
            ]);

            const stand = agentUser?.stand || '';
            const posts = agentPost.map(p => ({ ...p, stand }));

            res.json({ success: true, property: posts });
        } catch(err) {
            res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    // GET Request for all properties
    app.get('/api/post/property', async (req, res) => {
        try {
            const now = new Date();
            const limit = 20;
    
            const pipeline = [
                { $addFields: { agentObjId: { $toObjectId: '$agentId' } } },
                { 
                    $lookup: { 
                        from: 'agentusers', 
                        localField: 'agentObjId', 
                        foreignField: '_id', 
                        as: 'agent' 
                    } 
                },
                { $unwind: '$agent' },
                { $match: { 'agent.status': 'active' } },
                {
                    $addFields: {
                        isVerified: { $eq: ['$agent.stand', 'Verified Agent'] },
                        priority: {
                            $cond: [
                                { $and: [{ $eq: ['$boostPost', true] }, { $gt: ['$boostPostExpiry', now] }] }, 
                                1, 
                                { 
                                    $cond: [
                                        { $and: [{ $eq: ['$agent.boostAccount', true] }, { $gt: ['$agent.boostAccountExpiry', now] }] }, 
                                        2, 
                                        3  
                                    ]
                                }
                            ]
                        }
                    }
                },
                { $sort: { priority: 1, _id: -1 } },
                { $limit: limit },
                { $addFields: { stand: '$agent.stand' } },
                { $project: { agent: 0, agentObjId: 0 } }
            ];
    
            const properties = await AgentPost.aggregate(pipeline);
            return res.json({ success: true, property: properties });
    
        } catch (err) {
            console.error('[POST/PROPERTY] error:', err);
            return res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    // Get request for agent public profile
    app.get('/api/get/postForPublicAgentProfile/:id', async (req, res) => {
        const id = req.params.id;
        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit;
        
        try {
            const [property, agentUser] = await Promise.all([
                AgentPost.find({ agentId: id }).sort({ date: -1 }).skip(skip).limit(limit).lean(),
                AgentUser.findById(id).select('stand').lean()
            ]);

            if (!property) return res.json({ success: false, message: 'No property listed' });

            const stand = agentUser?.stand || '';
            const posts = property.map(p => ({ ...p, stand }));

            res.json({ success: true, property: posts });
        } catch (error) {
            console.error('Error Loading public agent post:', error);
            res.json({ success: false, message: 'Error loading property' });
        }
    });

    // Delete post by agent only 
    app.delete('/api/agent/property/:id', requireAgent, async (req, res) => {
        try {
            const agentId    = req.session.agent.id;
            const propertyId = req.params.id;

            const agentPost = await AgentPost.findById(propertyId);

            if (!agentPost) {
                return res.status(404).json({ success: false, message: 'Property not found' });
            }

            if (agentPost.agentId.toString() !== agentId.toString()) {
                return res.status(403).json({ success: false, message: 'Not authorized to delete this property' });
            }

            if (agentPost.imageNames && agentPost.imageNames.length) {
                agentPost.imageNames.forEach(img => {
                    const imgPath = path.join(UPLOAD_DIR, img);
                    try { fs.unlinkSync(imgPath); } catch (_) {}
                });
            }
            await AgentPost.findByIdAndDelete(propertyId);
            res.json({ success: true, message: 'Property deleted' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error deleting property' });
        }
    });

    // Total view for post
    app.get('/api/agent/views', requireAgent, async (req, res) => {
        const agentId = req.session.agent.id;
        try {
            const result = await AgentPost.aggregate([
                { $match: { agentId: agentId.toString() } },
                { $group: { _id: null, totalViews: { $sum: '$view' } } }
            ]);
            res.json({ success: true, totalViews: result[0]?.totalViews || 0 });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error fetching views' });
        }
    });

    // Find each property by id params
    app.get('/api/view/property/:id', async (req, res) => {
        const id = req.params.id;
        
        try {
            const agentPost = await AgentPost.findById(id).lean();
            
            if (!agentPost) {
                return res.status(404).json({
                    success: false,
                    message: 'Property not found'
                });
            }

            const agentUser = await AgentUser.findById(agentPost.agentId).select('stand').lean();
            agentPost.stand = agentUser?.stand || '';
            
            res.json({ success: true, property: agentPost });
        } catch (error) {
            console.error('Error fetching property:', error.message);
            res.status(500).json({
                success: false,
                message: 'Error on loading post by id'
            });
        }
    });

    // Edit property post
    app.patch('/api/edit/post/:id', requireAgent, upload.array('file'), [
        check('title').notEmpty().withMessage('Title is required').trim().escape(),
        check('type').notEmpty().withMessage('Property type is required').trim().escape(),
        check('category').notEmpty().isIn(['sale', 'rent', 'shortlet']).withMessage('Invalid category'),
        check('price').notEmpty().isNumeric().isFloat({ min: 0 }).withMessage('Price must be a valid number'),
        check('location').notEmpty().withMessage('Location is required').trim().escape(),
        check('beds').optional({ checkFalsy: true }).isNumeric().withMessage('Beds must be a number'),
        check('baths').optional({ checkFalsy: true }).isNumeric().withMessage('Baths must be a number'),
        check('area').optional({ checkFalsy: true }).trim().escape(),
        check('description').trim().escape().isLength({ max: 5000 }),
        check('features').trim().escape().isLength({ max: 1000 })
    ], async (req, res) => {
        
        const error = validationResult(req);
        if (!error.isEmpty()) {
            console.error('Validation errors:', error.array());
            return res.status(422).json({
                success: false,
                message: 'Validation failed',
                errors: error.array()
            });
        }
    
        const { title, type, category, price, location, beds, baths, area, description, features } = req.body;
        const isLand = type === 'land';
        
        const agentId = req.session.agent.id;
        if (!agentId) {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        }
        
        // Ensure keepImages handles multi-input text blocks or arrays correctly
        const keepImages = req.body.keepImages
            ? (Array.isArray(req.body.keepImages) ? req.body.keepImages : [req.body.keepImages])
            : [];
    
        try {
            const id = req.params.id;
            const agentPost = await AgentPost.findById(id);
    
            if (!agentPost) {
                return res.status(404).json({ success: false, message: 'Property not found' });
            }
            
            if (agentPost.agentId.toString() !== agentId.toString()) {
                return res.status(403).json({ success: false, message: 'Not authorized to edit this listing' });
            }
    
            // Cleanly compress new image files if uploaded during patch update edit requests
            const newImageNames = req.files && req.files.length 
                ? await processAndSaveImages(req.files, agentId, req.session.agent.name || 'Easy Find Agent') 
                : [];
                
            const combinedImages = [...keepImages, ...newImageNames];
    
            // Update fields safely
            agentPost.title = title;
            agentPost.type = type;
            agentPost.category = category;
            agentPost.price = Number(price);
            agentPost.location = location;
            
            // Handle numbers vs land listings safely
            agentPost.beds = isLand ? null : (beds ? Number(beds) : null);
            agentPost.baths = isLand ? null : (baths ? Number(baths) : null);
            
            agentPost.area = area || null;
            agentPost.description = description;
            agentPost.features = features;
            
            // Fix: Assign to the correct collection model schema reference field array name
            // (If your MongoDB model property schema says imageName, use agentPost.imageName instead)
            if (typeof agentPost.imageName !== 'undefined') {
                agentPost.imageName = combinedImages;
            } else {
                agentPost.imageNames = combinedImages;
            }
            
            agentPost.date = Date.now();
            
            await agentPost.save();
    
            return res.status(200).json({
                success: true,
                message: 'Listing updated successfully!',
                property: agentPost
            });
            
        } catch (error) {
            console.error('Property edit Error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error processing edits.'
            });
        }
    });

    // Find related property
    app.get('/api/property/related/:id', async (req, res) => {
        const id = req.params.id;
        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit;
        try {
            const post = await AgentPost.findById(id);
            if (!post) return res.json({ success: false, message: 'Property did not exist' });

            const related = await AgentPost.find({
                _id: { $ne: post._id },
                $or: [
                    { type: post.type },
                    { location: post.location },
                    { price: post.price },
                    { category: post.category },
                    { beds: post.beds },
                    { baths: post.baths },
                    { area: post.area },
                    { title: post.title }
                ]
            }).skip(skip).limit(limit).lean();

            const agentIds = [...new Set(related.map(p => p.agentId))];
            const agents = await AgentUser.find({ _id: { $in: agentIds } }).select('_id stand').lean();
            const standMap = {};
            agents.forEach(a => { standMap[a._id.toString()] = a.stand || ''; });

            const posts = related.map(p => ({ ...p, stand: standMap[p.agentId] || '' }));

            res.json({ success: true, related: posts });
        } catch (error) {
            console.error('Error on related property:', error);
            res.json({ success: false, message: 'Error loading related' });
        }
    });
};

module.exports = AGENT_POST;