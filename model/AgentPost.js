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
    }
});

const AgentPost = mongoose.model('AgentPost', postSchema);

module.exports = AgentPost;
