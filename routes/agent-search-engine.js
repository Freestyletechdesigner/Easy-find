const AgentUser = require('../model/AgentUser.js');

function SEARCH_ENGINE(app) {
    app.get('/api/search/agent', async (req, res) => {
        try {
            const agents = await AgentUser.find()
                .select('name profilePicture stand')
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