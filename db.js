require('dotenv').config();
require('dotenv').config({ path: '/etc/secrets/.env' });
const mongoose = require('mongoose');

const connectDB = async () => {
    const atlasUri = process.env.MONGO_URI;
    const localUri = 'mongodb://127.0.0.1:27017/easyfind';
    
    // Try Atlas first if MONGO_URI is set
    if (atlasUri && !atlasUri.includes('127.0.0.1')) {
        console.log('🌐 Attempting to connect to MongoDB Atlas...');
        try {
            await mongoose.connect(atlasUri, {
                tlsAllowInvalidCertificates: false,
                serverSelectionTimeoutMS: 10000, // 10 seconds
                socketTimeoutMS: 45000,
                retryWrites: true,
                retryReads: true,
                maxPoolSize: 10,
                minPoolSize: 2
            });
            console.log('✅ MongoDB Atlas Connected');
            return;
        } catch (err) {
            console.warn('Atlas connection failed:', err.message);
            console.log('Falling back to local MongoDB...');
        }
    }
    
    // Fallback to local MongoDB
    try {
        console.log('Connecting to local MongoDB...');
        await mongoose.connect(localUri, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('Local MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
