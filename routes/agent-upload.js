const multer = require('multer'); 
const {check, validationResult} = require('express-validator');
const path = require('path');
const fs = require('fs');
const AgentUser = require('../model/AgentUser.js');
const AgentPost = require('../model/AgentPost.js');

const ROOT = path.join(__dirname, '..');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadFolder = path.join(ROOT, 'agent-loged', 'upload-property');
        cb(null, uploadFolder)
    }, filename: (req, file, cb) => {
        const agentId = req.session.agent.id;
        const ext = path.extname(file.originalname);
        const fileName = `${agentId}_${Date.now()}${ext}`

        cb(null, fileName)
    }
});

const forbidden = ['.exe', '.bat', '.cmd'];
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {

        const ext = path.extname(file.originalname).toLowerCase();

        if (forbidden.includes(ext)) {
            return cb(new Error('File forbidden'));
        }

        cb(null, true)
    },
    limits: {
        fileSize: 20 * 1024 * 1024
    }
})

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
// post request
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
    ],async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(422).json({ 
                success: false,
                message: "Validation failed" 
            });
        };

        const { title, type, category, price, location, beds, baths, area, description, features } = req.body;
        const isLand = type === 'land';
        const imageName = req.files.map(file => file.filename);
        const agentId = req.session.agent.id;

        try {
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
                imageNames: imageName,
                date: Date.now(),
                view: 0
            }); 
            //save data
            await newPost.save()
    
            //send a res to user
            res.json({
                success: true,
                postID: newPost._id
            })
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                message: 'Server Error'
            })
        }

    });

    //get request for agent only
    app.get('/api/agent/property', requireAgent, async (req, res) => {

        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit; // Calculate how many items to skip

        try {
            const agentId = req.session.agent.id;
            const agentPost = await AgentPost.find({agentId})
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

            res.json({
                success: true,
                property: agentPost
            });
        } catch(err) {
            res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    //get request for all user
    app.get('/api/post/property', async (req, res) => {
        try {
            const now   = new Date();
            const limit = 20;

            const pipeline = [
                { $addFields: { agentObjId: { $toObjectId: '$agentId' } } },
                { $lookup: { from: 'agentusers', localField: 'agentObjId', foreignField: '_id', as: 'agent' } },
                { $unwind: '$agent' },
                { $match: { 'agent.status': 'active' } },
                {
                    $addFields: {
                        priority: {
                            $cond: [
                                { $and: [{ $eq: ['$boostPost', true] }, { $gt: ['$boostPostExpiry', now] }] }, 1,
                                { $cond: [
                                    { $and: [{ $eq: ['$agent.boostAccount', true] }, { $gt: ['$agent.boostAccountExpiry', now] }] }, 2, 3
                                ]}
                            ]
                        }
                    }
                },
                { $sort: { priority: 1, _id: -1 } },
                { $limit: limit },
                { $project: { agent: 0, agentObjId: 0 } }
            ];

            const properties = await AgentPost.aggregate(pipeline);
            res.json({ success: true, property: properties });
        } catch (err) {
            console.error('[POST/PROPERTY] error:', err);
            res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    // Get request for agent public profile
    app.get('/api/get/postForPublicAgentProfile/:id', async (req, res) => {
        const id = req.params.id;
        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit; // Calculate how many items to skip
        
        try {
            const property = await AgentPost.find({agentId: id})
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            if (!property) {
                return res.json({
                    success: false,
                    message: 'No property listed'
                });
            } 
            res.json({
                success: true,
                property
            })
        } catch (error) {
            console.error('Error Loading public agent post:', error);
            res.json({
                success: false,
                message: 'Error loading property'
            })
        }
    });

    //delete post by agent only 
    app.delete('/api/agent/property/:id', requireAgent, async (req, res) => {
        try {
            const agentId    = req.session.agent.id;
            const propertyId = req.params.id;

            const agentPost = await AgentPost.findById(propertyId);
            const agentUser = await AgentUser.findById(agentId);

            if (!agentPost) {
                return res.status(404).json({ success: false, message: 'Property not found' });
            }

            if (!agentUser) {
                return res.status(403).json({ success: false, message: 'Not authorised to delete this property' });
            }

            // delete image files
            if (agentPost.imageNames && agentPost.imageNames.length) {
                agentPost.imageNames.forEach(img => {
                    const imgPath = path.join(ROOT, 'agent-loged', 'upload-property', img);
                    try { fs.unlinkSync(imgPath); } catch (_) {}
                });
            }
            await AgentPost.findByIdAndDelete(propertyId);
            res.json({ success: true, message: 'Property deleted' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error deleting property' });
        }
    });

    //total view for post
    app.get('/api/agent/views', requireAgent, async (req, res) => {
        const agentId = req.session.agent.id;
        const agentPost = await AgentPost.find({ agentId })

        const totalViews = agentPost.reduce((sum, p) => sum + (p.view || 0), 0);
        res.json({ success: true, totalViews });
    });

    //find each property by id param
    app.get('/api/view/property/:id', async (req, res) => {
        const id = req.params.id;
        
        try {
            const agentPost = await AgentPost.findById(id);
            
            if (!agentPost) {
                return res.status(404).json({
                    success: false,
                    message: 'Property not found'
                });
            }
            
            res.json({ success: true, property: agentPost });
        } catch (error) {
            console.error('Error fetching property:', error.message);
            res.status(500).json({
                success: false,
                message: 'Server error: ' + error.message
            });
        }
    });

    //Edit property post
    app.patch('/api/edit/post/:id', requireAgent, upload.array('file'), [
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
        //validation 
        const error = validationResult(req);
        if (!error.isEmpty()) {
            console.error('Validation errors:', error.array());
            return res.status(403).json({
                success: false,
                message: 'Validation failed'
            });
        }

        const { title, type, category, price, location, beds, baths, area, description, features } = req.body;
        const isLand = type === 'land';
        const newImageNames = req.files.map(file => file.filename);
        const keepImages    = req.body.keepImages
            ? (Array.isArray(req.body.keepImages) ? req.body.keepImages : [req.body.keepImages])
            : [];
        const imageName = [...keepImages, ...newImageNames];
        try {
            const id = req.params.id;
            const agentPost = await AgentPost.findById(id);

            //make the changes 
            agentPost.title = title ;
            agentPost.type = type;
            agentPost.category = category;
            agentPost.price = price;
            agentPost.location = location;
            agentPost.beds = isLand ? null : (beds  || null);
            agentPost.baths = isLand ? null : (baths || null);
            agentPost.area = area;
            agentPost.description = description;
            agentPost.features = features;
            agentPost.imageNames = imageName;
            agentPost.date = Date.now();
            
            //save change
            await agentPost.save();

            res.json({
                success: true,
                property: agentPost
            })
        } catch (error) {
            console.error('Property edit Error', error)
            res.status(500).json({
                success: false,
                message: 'Error editing post'
            })
        }
    });

    // Find related property
    app.get('/api/property/related/:id', async (req, res) => {
        const id = req.params.id;

        const page = parseInt(req.query.page) || 1; 
        const limit = 8;
        const skip = (page - 1) * limit; // Calculate how many items to skip
        try {
            const post = await AgentPost.findById(id)
            if (!post) {
                return res.json({
                    success: false,
                    message: 'Property did not exist'
                });
            }
            const related = await AgentPost.find({
                _id: {$ne: post._id}, // exclude the current post
                $or: [
                    {type: post.type},
                    {location: post.location},
                    {price: post.price},
                    {category: post.category},
                    {beds: post.beds},
                    {baths: post.baths},
                    {area: post.area},
                    {title: post.title}
                ]
            })
            .skip(skip)
            .limit(limit)
            .lean();

            res.json({
                success: true,
                related
            })
        } catch (error) {
            console.error('Error on related propery:', error);
            res.json({
                success: false,
                message: 'Error loading related'
            })
        }
    });

}

module.exports = AGENT_POST;
