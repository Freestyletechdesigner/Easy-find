const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

// Configure multer for profile picture uploads
const storage = multer.memoryStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
        
        // Create directory if it doesn't exist
        try {
            await fs.mkdir(uploadDir, { recursive: true });
        } catch (error) {
            console.error('Error creating upload directory:', error);
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'profile-' + uniqueSuffix + ext);
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

const profileUpload = (app) => {
    const AGENTS_FILE = path.join(__dirname, '..', 'database', 'agents.json');
    const USERS_FILE = path.join(__dirname, '..', 'database', 'users.json');

    // Helper function to update agent profile picture
    async function updateAgentProfilePicture(email, profilePicture) {
        try {
            const data = await fs.readFile(AGENTS_FILE, 'utf8');
            const agents = JSON.parse(data);
            
            const agentIndex = agents.findIndex(agent => agent.email.toLowerCase() === email.toLowerCase());
            
            if (agentIndex !== -1) {
                // Delete old profile picture if exists
                if (agents[agentIndex].profilePicture) {
                    const oldPath = path.join(__dirname, '..', 'public', agents[agentIndex].profilePicture);
                    try {
                        await fs.unlink(oldPath);
                    } catch (err) {
                        console.log('Old profile picture not found or already deleted');
                    }
                }
                
                agents[agentIndex].profilePicture = profilePicture;
                agents[agentIndex].updatedAt = new Date().toISOString();
                
                await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating agent profile picture:', error);
            return false;
        }
    }

    // Helper function to update user profile picture
    async function updateUserProfilePicture(email, profilePicture) {
        try {
            const data = await fs.readFile(USERS_FILE, 'utf8');
            const users = JSON.parse(data);
            
            const userIndex = users.findIndex(user => user.userEmail.toLowerCase() === email.toLowerCase());
            
            if (userIndex !== -1) {
                // Delete old profile picture if exists
                if (users[userIndex].profilePicture) {
                    const oldPath = path.join(__dirname, '..', 'public', users[userIndex].profilePicture);
                    try {
                        await fs.unlink(oldPath);
                    } catch (err) {
                        console.log('Old profile picture not found or already deleted');
                    }
                }
                
                users[userIndex].profilePicture = profilePicture;
                users[userIndex].updatedAt = new Date().toISOString();
                
                await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating user profile picture:', error);
            return false;
        }
    }

    // Upload profile picture endpoint (for agents)
    app.post('/api/agent/upload-profile', 
        requireAgent,
        upload.single('profile-image'),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'No file uploaded'
                    });
                }

                // Get relative path for storing in database
                const relativePath = `/uploads/profiles/${req.file.filename}`;

                // Update agent profile in database
                const updated = await updateAgentProfilePicture(req.session.agent.email, relativePath);

                if (updated) {
                    res.json({
                        success: true,
                        message: 'Profile picture uploaded successfully',
                        profilePicture: relativePath
                    });
                } else {
                    // Delete uploaded file if database update failed
                    await fs.unlink(req.file.path);
                    res.status(500).json({
                        success: false,
                        message: 'Failed to update profile picture'
                    });
                }
            } catch (error) {
                console.error('Upload error:', error);
                
                // Delete uploaded file if error occurred
                if (req.file) {
                    try {
                        await fs.unlink(req.file.path);
                    } catch (err) {
                        console.error('Error deleting file:', err);
                    }
                }
                
                res.status(500).json({
                    success: false,
                    message: error.message || 'Error uploading profile picture'
                });
            }
        }
    );

    // Upload profile picture endpoint (for regular users)
    app.post('/api/user/upload-profile',
        requireUser,
        upload.single('profile-image'),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'No file uploaded'
                    });
                }

                // Get relative path for storing in database
                const relativePath = `/uploads/profiles/${req.file.filename}`;

                // Update user profile in database
                const updated = await updateUserProfilePicture(req.session.user.email, relativePath);

                if (updated) {
                    res.json({
                        success: true,
                        message: 'Profile picture uploaded successfully',
                        profilePicture: relativePath
                    });
                } else {
                    // Delete uploaded file if database update failed
                    await fs.unlink(req.file.path);
                    res.status(500).json({
                        success: false,
                        message: 'Failed to update profile picture'
                    });
                }
            } catch (error) {
                console.error('Upload error:', error);
                
                // Delete uploaded file if error occurred
                if (req.file) {
                    try {
                        await fs.unlink(req.file.path);
                    } catch (err) {
                        console.error('Error deleting file:', err);
                    }
                }
                
                res.status(500).json({
                    success: false,
                    message: error.message || 'Error uploading profile picture'
                });
            }
        }
    );

    // Get current profile picture
    app.get('/api/profile/picture', (req, res) => {
        if (req.session.agent) {
            // Agent session
            res.json({
                success: true,
                profilePicture: req.session.agent.profilePicture || null,
                userType: 'agent'
            });
        } else if (req.session.user) {
            // User session
            res.json({
                success: true,
                profilePicture: req.session.user.profilePicture || null,
                userType: 'user'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }
    });

    // Delete profile picture
    app.delete('/api/profile/picture', async (req, res) => {
        try {
            let email, userType;

            if (req.session.agent) {
                email = req.session.agent.email;
                userType = 'agent';
            } else if (req.session.user) {
                email = req.session.user.email;
                userType = 'user';
            } else {
                return res.status(401).json({
                    success: false,
                    message: 'Not authenticated'
                });
            }

            // Update database to remove profile picture
            let updated;
            if (userType === 'agent') {
                updated = await updateAgentProfilePicture(email, null);
            } else {
                updated = await updateUserProfilePicture(email, null);
            }

            if (updated) {
                res.json({
                    success: true,
                    message: 'Profile picture deleted successfully'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to delete profile picture'
                });
            }
        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting profile picture'
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

    // Middleware to require user authentication
    function requireUser(req, res, next) {
        if (!req.session.user) {
            return res.status(403).json({
                success: false,
                message: 'User authentication required'
            });
        }
        next();
    }
};

module.exports = profileUpload;
