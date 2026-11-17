const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    name:    { type: String, trim: true, default: 'Anonymous' },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    rating:  { type: Number, min: 1, max: 5, default: 5 },
    date:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
