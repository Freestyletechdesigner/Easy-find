const AgentPost = require('../model/AgentPost.js');

const VIEW_POST = (app) => {

    app.post('/api/view/post/:id/view',async (req, res) => {
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