'use strict';

const mongoose = require('mongoose');

const ScrapedAgentSchema = new mongoose.Schema({
    // ── Contact Details ──
    agentNumber: {
        type: String,
        default: 'N/A',
        trim: true
    },
    agentName: {
        type: String,
        default: 'Unknown Agent',
        trim: true
    },
    agentType: {
        type: String,
        enum: ['agent', 'landlord', 'developer', 'unknown'],
        default: 'unknown'
    },
    contactPreference: {
        type: String,
        enum: ['whatsapp', 'call', 'any', 'unknown'],
        default: 'unknown'
    },

    // ── Property Listing Details ──
    title: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['house', 'apartment', 'land', 'villa', 'commercial']
    },
    category: {
        type: String,
        enum: ['sale', 'rent', 'shortlet']
    },
    price: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        default: 'Enugu',
        trim: true
    },
    beds: {
        type: Number,
        default: 0
    },
    baths: {
        type: Number,
        default: 0
    },
    area: {
        type: String,
        default: '0'
    },
    description: {
        type: String,
        trim: true
    },
    features: {
        type: [String],
        default: []
    },
    imageNames: {
        type: [String],
        default: []
    },

    // ── Platform & Trust Verification ──
    postUrl: {
        type: String,
        required: true,
        unique: true // Speeds up check and prevents duplicates
    },
    platform: {
        type: String,
        enum: ['Facebook', 'Instagram'],
        required: true
    },
    trustScore: {
        type: Number,
        default: 100
    },
    riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
    },
    scrapedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ScrapedAgent', ScrapedAgentSchema);