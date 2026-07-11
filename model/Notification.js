// model/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
        index: true
    },
    propertyId: {
        type: String,
        required: true
    },
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['comment', 'reply', 'alerts', 'updates'],
        default: 'alerts'
    },
    unread: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to speed up retrieval for specific agents
notificationSchema.index({ agentId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);