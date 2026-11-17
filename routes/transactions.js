'use strict';

const Transaction = require('../model/Transaction.js');

function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(403).json({ success: false, message: 'Admin only' });
    next();
}

function TRANSACTIONS(app) {

    // ── GET all transactions (paginated, filterable, searchable) ──────────────
    app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
        try {
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, parseInt(req.query.limit) || 20);
            const skip   = (page - 1) * limit;
            const type   = req.query.type   || null; // boost_post | boost_profile | verification
            const status = req.query.status || null; // success | failed | pending
            const search = req.query.search || null;

            const filter = {};
            if (type)   filter.type   = type;
            if (status) filter.status = status;

            if (search) {
                const searchRegex = new RegExp(search, 'i');
                filter.$or = [
                    { reference: searchRegex },
                    { type: searchRegex }
                ];
                // If query is a valid 24-character hexadecimal ObjectId
                if (search.match(/^[0-9a-fA-F]{24}$/)) {
                    filter.$or.push({ _id: search });
                }
            }

            // Fetch transactions and populate user properties if configured
            const [transactions, total] = await Promise.all([
                Transaction.find(filter)
                    .populate('user', 'name email')
                    .populate('userId', 'name email')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Transaction.countDocuments(filter)
            ]);

            res.json({
                success:      true,
                transactions,
                total,
                page,
                hasMore: skip + transactions.length < total
            });
        } catch (err) {
            console.error('Transactions fetch error:', err);
            res.status(500).json({ success: false, message: 'Error fetching transactions' });
        }
    });

    // ── GET transaction stats (totals by type + daily revenue) ───────────────
    app.get('/api/admin/transactions/stats', requireAdmin, async (req, res) => {
        try {
            // Totals by type
            const byType = await Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: {
                    _id:   '$type',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }}
            ]);

            // Last 30 days daily revenue
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

            const daily = await Transaction.aggregate([
                { $match: { status: 'success', createdAt: { $gte: thirtyDaysAgo } } },
                { $group: {
                    _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    revenue: { $sum: '$amount' },
                    count:   { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ]);

            // Grand total
            const grandTotal = await Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]);

            res.json({
                success:    true,
                byType,
                daily,
                grandTotal: grandTotal[0]?.total || 0,
                totalCount: grandTotal[0]?.count || 0
            });
        } catch (err) {
            console.error('Transaction stats error:', err);
            res.status(500).json({ success: false, message: 'Error fetching stats' });
        }
    });
}

module.exports = TRANSACTIONS;