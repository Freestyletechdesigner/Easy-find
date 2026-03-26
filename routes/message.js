const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { check, validationResult } = require('express-validator');

const upload = multer();

const message = (app) => {
    const MESSAGES_FILE = path.join(__dirname, '..', 'database', 'messages.json');

    // Initialize messages file
    async function initMessagesFile() {
        try {
            await fs.access(MESSAGES_FILE);
        } catch {
            await fs.writeFile(MESSAGES_FILE, JSON.stringify([], null, 2));
        }
    }

    initMessagesFile();

    // Submit contact form message
    app.post('/api/contact/submit',
        upload.none(),
        [
            check('name').trim().isLength({ min: 4 }).withMessage('Name must be at least 4 characters'),
            check('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
            check('phoneNumber').isLength({ min: 11, max: 11 }).withMessage('Phone number must be 11 digits'),
            check('text').isLength({ min: 10 }).withMessage('Message must be at least 10 characters')
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

            const { name, email, subjet, phoneNumber, text } = req.body;

            try {
                // Read existing messages
                const data = await fs.readFile(MESSAGES_FILE, 'utf8');
                const messages = JSON.parse(data);

                // Create new message
                const newMessage = {
                    id: `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name,
                    email,
                    subject: subjet || 'No Subject',
                    phoneNumber,
                    message: text,
                    status: 'unread',
                    createdAt: new Date().toISOString(),
                    readAt: null
                };

                // Add to messages array
                messages.unshift(newMessage); // Add to beginning

                // Save to file
                await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

                res.status(200).json({
                    success: true,
                    message: 'Message sent successfully',
                    messageId: newMessage.id
                });
            } catch (err) {
                console.error('Error saving message:', err);
                res.status(500).json({
                    success: false,
                    message: 'Error sending message'
                });
            }
        }
    );

    // Get all messages (admin only)
    app.get('/api/messages', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(MESSAGES_FILE, 'utf8');
            const messages = JSON.parse(data);

            // Count unread messages
            const unreadCount = messages.filter(msg => msg.status === 'unread').length;

            res.json({
                success: true,
                messages,
                unreadCount,
                totalCount: messages.length
            });
        } catch (err) {
            console.error('Error fetching messages:', err);
            res.status(500).json({
                success: false,
                message: 'Error fetching messages'
            });
        }
    });

    // Get single message by ID (admin only)
    app.get('/api/messages/:id', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(MESSAGES_FILE, 'utf8');
            const messages = JSON.parse(data);

            const message = messages.find(msg => msg.id === req.params.id);

            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            res.json({
                success: true,
                message
            });
        } catch (err) {
            console.error('Error fetching message:', err);
            res.status(500).json({
                success: false,
                message: 'Error fetching message'
            });
        }
    });

    // Mark message as read (admin only)
    app.patch('/api/messages/:id/read', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(MESSAGES_FILE, 'utf8');
            const messages = JSON.parse(data);

            const messageIndex = messages.findIndex(msg => msg.id === req.params.id);

            if (messageIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Update message status
            messages[messageIndex].status = 'read';
            messages[messageIndex].readAt = new Date().toISOString();

            await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

            res.json({
                success: true,
                message: 'Message marked as read'
            });
        } catch (err) {
            console.error('Error updating message:', err);
            res.status(500).json({
                success: false,
                message: 'Error updating message'
            });
        }
    });

    // Delete message (admin only)
    app.delete('/api/messages/:id', requireAdmin, async (req, res) => {
        try {
            const data = await fs.readFile(MESSAGES_FILE, 'utf8');
            let messages = JSON.parse(data);

            const messageIndex = messages.findIndex(msg => msg.id === req.params.id);

            if (messageIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Remove message
            messages.splice(messageIndex, 1);

            await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });
        } catch (err) {
            console.error('Error deleting message:', err);
            res.status(500).json({
                success: false,
                message: 'Error deleting message'
            });
        }
    });

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

module.exports = message;
