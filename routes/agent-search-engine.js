'use strict';

const AgentUser = require('../model/AgentUser.js');

function SEARCH_ENGINE(app) {

    // Agent name search — simple partial match, case insensitive
    app.get('/api/search/agent', async (req, res) => {
        try {
            const { q } = req.query;

            if (!q || !q.trim()) {
                return res.json({ success: true, agents: [] });
            }

            const agents = await AgentUser.find({
                status: 'active',
                name: { $regex: q.trim(), $options: 'i' }
            })
            .select('name profilePicture stand')
            .limit(10)
            .lean();

            res.json({ success: true, agents });

        } catch (err) {
            console.error('[Agent Search] Error:', err.message);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Status check
    app.get('/api/search/status', (req, res) => {
        res.json({ success: true, message: 'Search is running' });
    });

    // Admin — force property search index rebuild
    app.post('/api/search/rebuild-index', async (req, res) => {
        if (!req.session.admin) {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        res.json({ success: true, message: 'No index to rebuild — agent search uses live DB queries' });
    });
}

module.exports = SEARCH_ENGINE;
