const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    passwordResetAt: {
        type: Date,
    },
    number: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    profilePicture: {
        type: String
    },
    status: {
        type: String
    },
    stand: {
        type: String
    },
    bio: {
        type: String
    },
    registrationDate: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    loginCount: {
        type: Number
    },
    ipAddress: {
        type: String,
    },
    boostAccount: {
        type: Boolean,
        default: false
    },
    boostAccountExpiry: {
        type: Date,
        default: null
    },
    // VERIFICATION FIELDS
    isVerified: { 
        type: Boolean, 
        default: false 
    },

    // The data returned from Dojah/NIMC after Face ID & NIN check
    verificationData: {
        firstName: { type: String },
        lastName: { type: String },
        dob: { type: String },
        vNIN: { type: String }, // Virtual NIN provided
        gender: { type: String },
        
        // Photos for scam protection
        nimcPhoto: { type: String },   // The official government photo
        selfiePhoto: { type: String }, // The "moving face" photo from the live session
        
        // Audit trail
        referenceId: { type: String, unique: true, sparse: true },
        livenessScore: { type: Number },
        verifiedAt: { type: Date }
    },

    // Security flags for managing potential scammers
    isBlacklisted: { 
        type: Boolean, 
        default: false 
    }
});

agentSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

agentSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const AgentUser = mongoose.model('AgentUser', agentSchema);

module.exports = AgentUser