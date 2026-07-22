const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
        index: true
    },
    agentName:  { type: String, default: '' },
    agentEmail: { type: String, default: '' },

    type: {
        type: String,
        enum: ['boost_post', 'boost_profile', 'verification'],
        required: true
    },

    plan:        { type: String, default: '' },   // e.g. post_starter, profile_premium
    amount:      { type: Number, required: true }, // in Naira (not kobo)
    reference:   { type: String, unique: true, sparse: true },
    status:      { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },

    // For boost transactions
    postId:      { type: String, default: null },
    expiresAt:   { type: Date,   default: null },

    createdAt:   { type: Date, default: Date.now }
});

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
