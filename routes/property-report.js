const PropertyReport = require('../model/PropertyReport.js');
const AgentPost = require('../model/AgentPost.js');
const { check, validationResult } = require('express-validator');

function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}

function PROPERTY_REPORT(app) {
    // Submit a report for a property (public)
    app.post('/api/properties/:id/report', [
        check('reporterEmail').isEmail().withMessage('Please provide a valid email address'),
        check('reason').isIn(['spam', 'incorrect_details', 'fraudulent', 'offensive', 'other']).withMessage('Invalid reason'),
        check('description').optional({ checkFalsy: true }).trim().escape().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
        check('reporterName').optional({ checkFalsy: true }).trim().escape().isLength({ max: 50 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: errors.array()[0].msg });
        }

        const propertyId = req.params.id;
        const { reporterEmail, reason, description, reporterName } = req.body;

        try {
            // Verify the property exists
            const property = await AgentPost.findById(propertyId);
            if (!property) {
                return res.status(404).json({ success: false, message: 'Property post not found' });
            }

            await PropertyReport.create({
                propertyId,
                propertyTitle: property.title || 'Untitled Property',
                reporterName: reporterName || 'Anonymous',
                reporterEmail,
                reason,
                description
            });

            res.json({ success: true, message: 'Thank you. The report has been submitted to the admin for review.' });
        } catch (err) {
            console.error('Error submitting report:', err);
            res.status(500).json({ success: false, message: 'Could not submit report. Please try again.' });
        }
    });

    // Get all reports (admin only)
    app.get('/api/admin/reports', requireAdmin, async (req, res) => {
        try {
            const reports = await PropertyReport.find()
                .sort({ date: -1 })
                .lean();
            res.json({ success: true, reports });
        } catch (err) {
            console.error('Error fetching reports:', err);
            res.status(500).json({ success: false, message: 'Could not load reports' });
        }
    });

    // Dismiss a report (admin only - delete report)
    app.delete('/api/admin/reports/:id', requireAdmin, async (req, res) => {
        try {
            await PropertyReport.findByIdAndDelete(req.params.id);
            res.json({ success: true, message: 'Report dismissed successfully' });
        } catch (err) {
            console.error('Error deleting report:', err);
            res.status(500).json({ success: false, message: 'Could not dismiss report' });
        }
    });

    // Delete the reported property and all its reports (admin only)
    app.delete('/api/admin/properties/:id', requireAdmin, async (req, res) => {
        const propertyId = req.params.id;
        try {
            // Delete property
            const result = await AgentPost.findByIdAndDelete(propertyId);
            if (!result) {
                return res.status(404).json({ success: false, message: 'Property post not found or already deleted' });
            }
            // Delete all reports associated with this property
            await PropertyReport.deleteMany({ propertyId });
            res.json({ success: true, message: 'Property post and all associated reports have been deleted.' });
        } catch (err) {
            console.error('Error deleting property and reports:', err);
            res.status(500).json({ success: false, message: 'Could not delete property post' });
        }
    });
}

module.exports = PROPERTY_REPORT;
