const mongoose = require('mongoose');

const viewsSchema = new mongoose.Schema({
    ip: {
        type: [String],
        default: []
    },
    count: {
        type: Number,
        trim: true,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const PageViews = mongoose.model('PageViews', viewsSchema);

module.exports = PageViews;