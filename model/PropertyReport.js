const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AgentPost',
        required: true,
        index: true
    },
    propertyTitle: {
        type: String,
        required: true
    },
    reporterName: {
        type: String,
        default: 'Anonymous'
    },
    reporterEmail: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ['spam', 'incorrect_details', 'fraudulent', 'offensive', 'other']
    },
    description: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const PropertyReport = mongoose.model('PropertyReport', reportSchema);
module.exports = PropertyReport;
