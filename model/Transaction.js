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
        enum: ['boost_post', 'boost_profile', 'verification', 'partner_earning', 'partner_withdrawal'],
        required: true
    },

    plan:        { type: String, default: '' },   // e.g. post_starter, profile_premium
    amount:      { type: Number, required: true }, // in Naira (not kobo)
    reference:   { type: String, unique: true, sparse: true },
    status:      { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },

    // For boost transactions
    postId:      { type: String, default: null },
    expiresAt:   { type: Date,   default: null },

    // For partner_earning: ID of the referred agent who triggered the payment
    referredAgentId:   { type: String, default: null },
    referredAgentName: { type: String, default: null },

    // For partner_withdrawal: Opay account details
    opayAccountNumber: { type: String, default: null },
    opayAccountName:   { type: String, default: null },
    withdrawalStatus:  { type: String, enum: ['pending', 'processing', 'paid', 'failed', null], default: null },

    createdAt:   { type: Date, default: Date.now }
});

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
