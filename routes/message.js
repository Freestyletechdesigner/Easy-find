const { check, validationResult } = require('express-validator');
const message = require('../model/message.js');


const messageAPI = (app) => {

    // Submit contact form message
    app.post('/api/contact/submit',
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

                // Create new message
                const newMessage = new message({
                    name,
                    email,
                    subject: subjet || 'No Subject',
                    phoneNumber,
                    message: text,
                    status: 'unread',
                    createdAt: new Date().toISOString(),
                    readAt: null
                });

                // Save to file
                await newMessage.save()

                res.status(200).json({
                    success: true,
                    message: 'Message sent successfully',
                    messageId: newMessage._id
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
            const messageDB = await message.find().sort({ createdAt: -1 }).lean();
            const unreadCount = messageDB.filter(m => m.status === 'unread').length;

            res.json({
                success: true,
                messages: messageDB,
                unreadCount,
                totalCount: messageDB.length
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
            const id = req.params.id
            const messageDB = await message.findById(id)

            if (!messageDB) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            res.json({
                success: true,
                message: messageDB
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
            const id = req.params.id;
            const messageDB = await message.findByIdAndUpdate(
                id,
                {status: 'read'},
                {new: true}
            );

            if (!messageDB) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            await messageDB.save()

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
            const id = req.params.id;

            const messageDB = await message.findByIdAndDelete(id)

            if (!messageDB) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

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

module.exports = messageAPI;
