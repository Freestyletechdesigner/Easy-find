const mongoose = require('mongoose');

const viewsSchema = new mongoose.Schema({
    ip: { type: [String], default: [] },
    count: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
    // daily breakdown: [{ date: 'YYYY-MM-DD', count: N }]
    daily: [{
        date:  { type: String },  // 'YYYY-MM-DD'
        count: { type: Number, default: 0 }
    }]
});

const PageViews = mongoose.model('PageViews', viewsSchema);
module.exports = PageViews;
