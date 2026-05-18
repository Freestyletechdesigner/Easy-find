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
            const searchRegex = new RegExp(q, 'i')

            const agents = await AgentUser.find({ status: 'active', name: searchRegex })
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