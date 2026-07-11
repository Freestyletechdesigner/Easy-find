const { check, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const Comment      = require('../model/Comment.js');
const AgentPost    = require('../model/AgentPost.js');
const Notification = require('../model/Notification.js');
const { sendPushToAgents } = require('../utils/push.js');

const commentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 comments per window
    message: { success: false, message: "Too many comments submitted. Please try again later." }
});

// ── COMMENT SECTION FOR POST ───────────────────────────────────────────
function COMMENT(app) {
    app.post('/api/property/:id/comment', commentLimiter, [
        check('name').optional({ checkFalsy: true }).trim().escape().isLength({ max: 50 }),
        check('text').notEmpty().withMessage('Comment text is required').trim().escape().isLength({ max: 500 }).withMessage('Comment must not exceed 500 characters'),
        check('parentId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid parent comment ID') // Validate optional parent ID
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, errors: errors.array() });
        }
    
        try {
            const propertyId = req.params.id;
    
            // Verify that the property exists in the collection before saving a comment
            const post = await AgentPost.findById(propertyId).lean();
            if (!post) {
                return res.status(404).json({ success: false, message: 'Property listing not found' });
            }
    
            const { name, text, parentId } = req.body;

            // Verify parent comment exists if this is a reply
            if (parentId) {
                const parentExists = await Comment.exists({ _id: parentId });
                if (!parentExists) {
                    return res.status(404).json({ success: false, message: 'Parent comment not found' });
                }
            }
    
            const newComment = new Comment({
                propertyId,
                name: name || 'Anonymous',
                text,
                parentId: parentId || null
            });
    
            await newComment.save();

            // Create notification for the listing's agent (if the commenter is not the agent themselves)
            try {
                const currentAgentId = req.session?.agent?.id;
                if (currentAgentId !== post.agentId) {
                    const commenterName = name || 'Anonymous';
                    const actionText = parentId ? 'replied to a comment' : 'commented';
                    const shortText = text.length > 40 ? text.substring(0, 40) + '...' : text;
                    const message = `${commenterName} ${actionText} on your listing "${post.title || 'Untitled'}": "${shortText}"`;

                    const newNotification = new Notification({
                        agentId: post.agentId,
                        propertyId: post._id,
                        commentId: newComment._id,
                        message,
                        type: parentId ? 'updates' : 'alerts'
                    });

                    await newNotification.save();

                    // Push notification to agent — delivered even when site is closed
                    await sendPushToAgents({
                        agentIds: [post.agentId.toString()],
                        title:    parentId ? '💬 New reply on your listing' : '💬 New comment on your listing',
                        message:  `${commenterName}: "${shortText}"`,
                        url:      `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/property?id=${post._id}`,
                    });
                }
            } catch (notiError) {
                console.error('[COMMENT_NOTIFICATION_ERROR] Failed to save notification:', notiError);
            }
    
            res.status(201).json({
                success: true,
                message: 'Comment added successfully',
                comment: newComment
            });
        } catch (error) {
            console.error('[COMMENT_POST] Error:', error);
            res.status(500).json({ success: false, message: 'Error saving comment' });
        }
    });
    
    // ── GET PAGINATED COMMENTS FOR A PROPERTY ─────────────────────────
    app.get('/api/property/:id/comments', async (req, res) => {
        const propertyId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Fixed page size to limit payloads
        const skip = (page - 1) * limit;
    
        try {
            // Retrieve top-level comments (where parentId is null), total top-level threads, and absolute total comments
            const [topComments, totalTopCount, totalCommentsCount] = await Promise.all([
                Comment.find({ propertyId, parentId: null })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Comment.countDocuments({ propertyId, parentId: null }),
                Comment.countDocuments({ propertyId }) // Display the combined count of comments + replies
            ]);

            // Retrieve replies for the queried top-level comments
            const parentIds = topComments.map(c => c._id);
            const replies = parentIds.length > 0
                ? await Comment.find({ parentId: { $in: parentIds } }).sort({ createdAt: 1 }).lean()
                : [];

            // Group replies by parentId
            const repliesMap = {};
            replies.forEach(r => {
                const pId = r.parentId.toString();
                if (!repliesMap[pId]) {
                    repliesMap[pId] = [];
                }
                repliesMap[pId].push(r);
            });

            // Map replies back to their corresponding parents
            const commentsWithReplies = topComments.map(c => ({
                ...c,
                replies: repliesMap[c._id.toString()] || []
            }));
    
            const hasMore = skip + topComments.length < totalTopCount;
    
            res.json({
                success: true,
                comments: commentsWithReplies,
                totalComments: totalCommentsCount,
                hasMore
            });
        } catch (error) {
            console.error('[COMMENT_GET] Error:', error);
            res.status(500).json({ success: false, message: 'Error loading comments' });
        }
    });
}
module.exports = COMMENT;