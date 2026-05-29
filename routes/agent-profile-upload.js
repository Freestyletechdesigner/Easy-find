const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const AgentUser = require('../model/AgentUser.js');
const ROOT = path.join(__dirname, '..');

// Switch from diskStorage to memoryStorage to process image in RAM
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
});

const agentProfileUpload = (app) => {

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

    // Upload profile picture
    app.post('/api/agent/profile/picture', requireAgent, upload.single('profilePicture'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const agentId = req.session.agent.id;
            const uploadDir = path.join(ROOT, 'agent-profiles');
            
            // Forces all saved files to have a hardcoded .webp extension
            const filename = `${agentId}_${Date.now()}.webp`;
            const finalPath = path.join(uploadDir, filename);
            const profilePicturePath = `/agent-profiles/${filename}`;

            // Create directory if it doesn't exist
            await fs.mkdir(uploadDir, { recursive: true });

            // Find agent first to handle verification and cleanup safely
            const agent = await AgentUser.findById(agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            // UNIFIED WEBP CONVERSION ENGINE
            // pixel data is optimized
            await sharp(req.file.buffer)
                .webp({ 
                    quality: 65, // Drops image file size down aggressively while looking great
                    effort: 6    // Maximum CPU compression pass to save server disk space
                })
                .toFile(finalPath);
            
            // Delete old profile picture file if it exists
            if (agent.profilePicture) {
                const oldPicturePath = path.join(ROOT, agent.profilePicture);
                try {
                    await fs.unlink(oldPicturePath);
                } catch (error) {
                    console.log('Old profile picture not found or already deleted');
                }
            }

            // Update agent profile picture path in MongoDB
            agent.profilePicture = profilePicturePath;
            await agent.save();

            res.json({
                success: true,
                message: 'Profile picture converted to WebP and optimized successfully',
                profilePicture: profilePicturePath
            });
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred'
            });
        }
    });

    // Get agent profile with picture
    app.get('/api/agent/profile/picture', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id;
            const agent = await AgentUser.findById(agentId);

            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            res.json({
                success: true,
                profilePicture: agent.profilePicture || null
            });
        } catch (error) {
            console.error('Error getting profile picture:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting profile picture'
            });
        }
    });

    // Delete profile picture
    app.delete('/api/agent/profile/picture', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id;
            const agent = await AgentUser.findById(agentId);

            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            if (agent.profilePicture) {
                const picturePath = path.join(ROOT, agent.profilePicture);
                try {
                    await fs.unlink(picturePath);
                } catch (error) {
                    console.log('Profile picture file not found');
                }
            }

            agent.profilePicture = null;
            await agent.save();

            res.json({
                success: true,
                message: 'Profile picture deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting profile picture:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting profile picture'
            });
        }
    });

    app.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File is too large. Maximum size allowed is 5MB.'
                });
            }
        }
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next();
    });
};

module.exports = agentProfileUpload;