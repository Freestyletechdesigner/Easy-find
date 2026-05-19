const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const AgentUser = require('../model/AgentUser.js');
const ROOT = path.join(__dirname, '..');

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(ROOT, 'agent-profiles');
        
        // Create directory if it doesn't exist
        try {
            await fs.mkdir(uploadDir, { recursive: true });
        } catch (error) {
            console.error('Error creating upload directory:', error);
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: agentId_timestamp.ext
        const agentId = req.session.agent.id;
        const ext = path.extname(file.originalname);
        const filename = `${agentId}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

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
        fileSize: 20 * 1024 * 1024 // 20MB max file size
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
            const profilePicturePath = `/agent-profiles/${req.file.filename}`;
           

            // Find agent and update profile picture
            const agent = await AgentUser.findById(agentId)
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            
            // Delete old profile picture if exists
            if (agent.profilePicture) {
                const oldPicturePath = path.join(ROOT, agent.profilePicture);
                try {
                    await fs.unlink(oldPicturePath);
                } catch (error) {
                    console.log('Old profile picture not found or already deleted');
                }
            }

            // Update agent profile picture
            agent.profilePicture = profilePicturePath;
            await agent.save();

            res.json({
                success: true,
                message: 'Profile picture uploaded successfully',
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

            // Find agent
            const agent = await AgentUser.findById(agentId)

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

            // Find agent
            const agent = await AgentUser.findById(agentId);

            if (!agent) {
                return res.status(404).json({
                    success: false,
                    message: 'Agent not found'
                });
            }

            // Delete profile picture file
            if (agent.profilePicture) {
                const picturePath = path.join(ROOT, agent.profilePicture);
                try {
                    await fs.unlink(picturePath);
                } catch (error) {
                    console.log('Profile picture file not found');
                }
            }

            // Remove profile picture from agent data
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
};

module.exports = agentProfileUpload;
