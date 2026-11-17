const mongoose = require('mongoose');

const viewsSchema = new mongoose.Schema({
    date: {
        type: String, 
        required: true, 
        unique: true 
    },
    count: { 
        type: Number, 
        default: 0 
    },
    uniqueVisitors: { 
        type: Number, 
        default: 0 
    }
});

viewsSchema.index({ date: 1 });

const PageViews = mongoose.model('PageViews', viewsSchema);
module.exports = PageViews;