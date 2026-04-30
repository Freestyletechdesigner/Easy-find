const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ROOT = path.join(__dirname, '..');

const POST_PROPERTY = path.join(ROOT, 'database', 'post-property.json');

const VIEW_POST = (app) => {

    app.post('/api/view/post/:id/view', (req, res) => {
        const data = JSON.parse(fs.readFileSync(POST_PROPERTY, 'utf8'));
        const post = data.find(p => p.id === req.params.id);
        if (!post) {
            return res.status(404).json({success: false, message: 'post not found'})
        }
        post.view = (post.view || 0) + 1
        fs.writeFileSync(POST_PROPERTY, JSON.stringify(data, null, 2))
        res.json({
            success: true,
            views: post.view
        })
    });

}
module.exports = VIEW_POST 