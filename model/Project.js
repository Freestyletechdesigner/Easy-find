const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['todo', 'inprogress', 'review', 'done'],
        default: 'todo'
    },
    tag: {
        type: String,
        trim: true,
        maxlength: 30,
        default: 'General'
    },
    tagColor: {
        type: String,
        enum: ['blue', 'green', 'orange', 'red', 'purple'],
        default: 'blue'
    },
    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    initials: {
        type: String,
        trim: true,
        maxlength: 3,
        default: 'AD'
    },
    avatarColor: {
        type: String,
        enum: ['blue', 'green', 'orange', 'purple', 'red'],
        default: 'blue'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

projectSchema.pre('save', function() {
    this.updatedAt = new Date();
});

const Project = mongoose.model('Project', projectSchema);
module.exports = Project;
