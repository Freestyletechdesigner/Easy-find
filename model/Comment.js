// model/Comment.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AgentPost',
        required: true,
        index: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null,
        index: true // Indexed for faster lookups when fetching replies
    },
    name: {
        type: String,
        trim: true,
        maxlength: 50,
        default: 'Anonymous'
    },
    text: {
        type: String,
        required: true,
        maxlength: 500,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index updated to optimize queries filtering by propertyId and parentId (null), sorted by newest
commentSchema.index({ propertyId: 1, parentId: 1, createdAt: -1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;