const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    email: {
        type: String,
        trim: true,
        index: true
    },
    subject: {
        type: String,
        trim: true
    },
    phoneNumber: {
        type: Number,
        trim: true
    },
    message: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    readAt: {
        type: Date,
        default: Date.now
    }
});

const message = mongoose.model('message', messageSchema);

module.exports = message;