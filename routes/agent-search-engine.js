const AgentUser = require('../model/AgentUser.js');

function SEARCH_ENGINE(app) {
    app.get('/api/search/agent', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) {
                return res.json({
                    success: true,
                    agents: []
                })
            }
            // Escape user input to prevent ReDoS
            function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
            const searchRegex = new RegExp(escapeRegex(q), 'i')

            const agents = await AgentUser.find({ status: 'active', $or: [
                { name: searchRegex },
                { stand: searchRegex }
            ]  })
                .select('name profilePicture stand')
                .limit(25)
                .lean();
            res.json({
                success: true,
                agents
            });
        } catch (error) {
            console.error("Search engine error", error);
            res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    });
}
module.exports = SEARCH_ENGINE