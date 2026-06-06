const mongoose = require('mongoose');

const visitorLogSchema = new mongoose.Schema({
    date: { type: String, required: true },
    ip: { type: String, required: true }
});

// This index ensures one IP is saved only once per day
visitorLogSchema.index({ date: 1, ip: 1 }, { unique: true });

const VisitorLog = mongoose.model('VisitorLog', visitorLogSchema);
module.exports = VisitorLog;