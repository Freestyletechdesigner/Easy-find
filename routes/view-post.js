const AgentPost = require('../model/AgentPost.js');
const rateLimit = require('express-rate-limit');

// Fix 21: Rate limit view counter to 10 req/min per IP
const viewLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests.' },
    standardHeaders: true,
    legacyHeaders: false
});

const VIEW_POST = (app) => {

    app.post('/api/view/post/:id/view', viewLimiter, async (req, res) => {
        const id = req.params.id
        try {
            //check if post exist
            const post = await AgentPost.findById(id);
            if (!post) {
                return res.status(404).json({success: false, message: 'post not found'})
            }
             
            //save change
            post.view = (post.view || 0) + 1
            await post.save()
            res.json({
                success: true,
                views: post.view
            })
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                message: 'Server error'
            })
        }
    });

}
module.exports = VIEW_POST 