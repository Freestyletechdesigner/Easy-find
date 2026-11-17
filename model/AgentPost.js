const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({

    // ── Agent reference ───────────────────────────────────────────────────
    // For real agent posts: agentId = the agent's MongoDB _id (String)
    // For scraped posts: agentId = 'scraped' (so the feed pipeline knows)
    agentId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    // ── Core property details ─────────────────────────────────────────────
    title: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        trim: true,
        enum: ['house', 'apartment', 'land', 'villa', 'commercial']
    },
    category: {
        type: String,
        trim: true,
        enum: ['sale', 'rent', 'shortlet']
    },
    price: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        trim: true,
        default: 'Enugu'
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
    videoName: {
        type: String,
        default: null
    },

    // ── Map coordinates (agent uploads only — null for scraped posts) ─────
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },

    // ── Agent contact info (scraped posts) ────────────────────────────────
    agentNumber: {
        type: String,
        default: 'N/A',
        trim: true
    },
    agentName: {
        type: String,
        default: '',
        trim: true
    },
    agentType: {
        type: String,
        enum: ['agent', 'landlord', 'developer', 'unknown', ''],
        default: ''
    },
    contactPreference: {
        type: String,
        enum: ['whatsapp', 'call', 'any', 'unknown', ''],
        default: ''
    },

    // ── Scrape metadata (null for real agent posts) ───────────────────────
    postUrl: {
        type: String,
        default: null,
        sparse: true  // allow multiple nulls in unique index
    },
    platform: {
        type: String,
        enum: ['Facebook', 'Jiji', 'Instagram', 'Easyfind', null, ''],
        default: null
    },
    trustScore: {
        type: Number,
        default: null
    },
    riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high', null, ''],
        default: null
    },
    scrapedAt: {
        type: Date,
        default: null
    },

    // ── Feed control ──────────────────────────────────────────────────────
    view: {
        type: Number,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    isClosed: {
        type: Boolean,
        default: false
    },
    closedAt: {
        type: Date,
        default: null
    },

    // ── Boost system ──────────────────────────────────────────────────────
    boostPost: {
        type: Boolean,
        default: false
    },
    boostPostExpiry: {
        type: Date,
        default: null
    }
});

// ── Indexes ───────────────────────────────────────────────────────────────
postSchema.index({ agentId: 1, date: -1 });
postSchema.index({ category: 1, type: 1 });
postSchema.index({ boostPost: 1, boostPostExpiry: 1 });
postSchema.index({ postUrl: 1 }, { unique: true, sparse: true }); // dedup scraped posts

const AgentPost = mongoose.model('AgentPost', postSchema);

module.exports = AgentPost;
