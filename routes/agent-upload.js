const multer = require('multer'); 
const {check, validationResult} = require('express-validator');
const path = require('path');
const fs = require('fs');

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
        fileSize: 10 * 1024 * 1024
    }
})

const POST_PROPERTY = path.join(ROOT, 'database', 'post-property.json');

const AGENT_POST = (app) => {

    const AGENTS_FILE = path.join(ROOT, 'database', 'agents.json');

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
        check('price'),
        check('location').notEmpty().trim().escape(),
        check('beds').isNumeric().trim().escape(),
        check('baths').isNumeric().trim().escape(),
        check('area'),
        check('description'),
        check('features')
    ],(req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(422).json({ 
                success: false,
                message: "Validation failed" 
            });
        };

        const {title, type, category, price, location, beds, baths, area, description, features} = req.body;
        //image name 
        const imageName = req.files.map(file => file.filename);

        //agent id
        const agentId = req.session.agent.id;
        
        //read json file
        const data = JSON.parse(fs.readFileSync(POST_PROPERTY, 'utf8'));

        //put post in order
        const newPost = {
            agentId,
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title,
            type,
            category,
            price,
            location,
            beds,
            baths,
            area,
            description,
            features,
            imageNames: imageName,
            date: Date.now()
        }
        //add to array
        data.unshift(newPost);
        //save data
        fs.writeFileSync(POST_PROPERTY, JSON.stringify(data, null, 2));

        //send a res to user
        res.json({
            success: true,
            postID: newPost.id
        })

    });

    //get request for agent only
    app.get('/api/agent/property', requireAgent, (req, res) => {
        try {
            const agentId = req.session.agent.id;
            const data = JSON.parse(fs.readFileSync(POST_PROPERTY, 'utf8'));
            const agentPost = data.filter(post => post.agentId === agentId);

            res.json({
                success: true,
                property: agentPost
            });
        } catch(err) {
            res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    //get request for all user
    app.get('/api/post/property', (req, res) => {
        try {
            const data = JSON.parse(fs.readFileSync(POST_PROPERTY, 'utf8'));

            res.json({
                success: true,
                property: data
            });
        } catch(err) {
            res.status(500).json({ success: false, message: 'Error loading properties' });
        }
    });

    //delete post by agent only 
    app.delete('/api/agent/property/:id', requireAgent, (req, res) => {
        try {
            const agentId    = req.session.agent.id;
            const propertyId = req.params.id;

            console.log('[DELETE] propertyId:', propertyId, '| sessionAgentId:', agentId);

            const data    = JSON.parse(fs.readFileSync(POST_PROPERTY, 'utf8'));
            const post    = data.find(p => p.id === propertyId);

            console.log('[DELETE] post found:', post ? `agentId=${post.agentId}` : 'NOT FOUND');

            if (!post) {
                return res.status(404).json({ success: false, message: 'Property not found' });
            }

            if (post.agentId !== agentId) {
                console.log('[DELETE] agentId mismatch — post.agentId:', post.agentId, '!== session:', agentId);
                return res.status(403).json({ success: false, message: 'Not authorised to delete this property' });
            }

            // delete image files
            if (post.imageNames && post.imageNames.length) {
                post.imageNames.forEach(img => {
                    const imgPath = path.join(ROOT, 'agent-loged', 'upload-property', img);
                    try { fs.unlinkSync(imgPath); } catch (_) {}
                });
            }

            const updated = data.filter(p => p.id !== propertyId);
            fs.writeFileSync(POST_PROPERTY, JSON.stringify(updated, null, 2));

            res.json({ success: true, message: 'Property deleted' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error deleting property' });
        }
    });

    //view for more details
}

module.exports = AGENT_POST;