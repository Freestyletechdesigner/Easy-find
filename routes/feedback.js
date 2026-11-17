const Feedback = require('../model/Feedback.js');
const { check, validationResult } = require('express-validator');

function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}

function FEEDBACK(app) {

    // submit feedback (public)
    app.post('/api/feedback', [
        check('message').notEmpty().trim().escape().isLength({ max: 300 }),
        check('name').optional({ checkFalsy: true }).trim().escape().isLength({ max: 50 }),
        check('rating').optional().isInt({ min: 1, max: 5 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(422).json({ success: false, message: 'Invalid input' });

        const { name, message, rating } = req.body;
        try {
            await Feedback.create({ name: name || 'Anonymous', message, rating: rating || 5 });
            res.json({ success: true, message: 'Thank you for your feedback!' });
        } catch (err) {
            console.error('Feedback error:', err);
            res.status(500).json({ success: false, message: 'Could not save feedback' });
        }
    });

    // get latest 20 feedbacks (public)
    app.get('/api/feedback', async (req, res) => {
        try {
            const feedbacks = await Feedback.find().sort({ date: -1 }).limit(20).lean();
            res.json({ success: true, feedbacks });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Could not load feedback' });
        }
    });

    // get all feedbacks (admin only)
    app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
        try {
            const feedbacks = await Feedback.find().sort({ date: -1 }).lean();
            res.json({ success: true, feedbacks });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Could not load feedback' });
        }
    });

    // delete feedback (admin only)
    app.delete('/api/admin/feedback/:id', requireAdmin, async (req, res) => {
        try {
            await Feedback.findByIdAndDelete(req.params.id);
            res.json({ success: true, message: 'Feedback deleted' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Could not delete feedback' });
        }
    });
}

module.exports = FEEDBACK;
