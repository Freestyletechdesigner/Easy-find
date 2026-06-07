const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
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
        type: Number
    },
    location: {
        type: String,
        trim: true
    },
    beds: {
        type: Number,
        default: 0
    },
    baths: {
        type: Number,
        trim: true
    },
    area: {
        type: String,
        default: 0
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
    view: {
        type: Number,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    boostPost: {
        type: Boolean,
        default: false
    },
    boostPostExpiry: {
        type: Date,
        default: null
    }
});

// Indexes — defined before model creation so Mongoose applies them on sync
postSchema.index({ agentId: 1, date: -1 });          // agent's own listings sorted by newest
postSchema.index({ category: 1, type: 1 });           // public property feed filters
postSchema.index({ boostPost: 1, boostPostExpiry: 1 }); // boost priority sort

const AgentPost = mongoose.model('AgentPost', postSchema);

module.exports = AgentPost;
