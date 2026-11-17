require('dotenv').config();
require('dotenv').config({ path: '/etc/secrets/.env' });
const mongoose = require('mongoose');

const connectDB = async () => {
    const atlasUri = process.env.MONGO_URI;
    const localUri = 'mongodb://127.0.0.1:27017/easyfind';
    
    // Try Atlas first if MONGO_URI is set
    if (atlasUri && !atlasUri.includes('127.0.0.1')) {
        console.log('Attempting to connect to MongoDB Atlas...');
        try {
            await mongoose.connect(atlasUri, {
                tlsAllowInvalidCertificates: false,
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                retryWrites: true,
                retryReads: true,
                maxPoolSize: 50,   // handle more concurrent requests
                minPoolSize: 5,    // keep connections warm
                waitQueueTimeoutMS: 10000 // fail fast if pool is exhausted
            });
            console.log('✅ MongoDB Atlas Connected');
            return;
        } catch (err) {
            // Fix 14: Only fall back to local in development; otherwise exit
            if (process.env.NODE_ENV === 'development') {
                console.warn('Atlas connection failed:', err.message);
                console.log('Falling back to local MongoDB (development only)...');
            } else {
                console.error('MongoDB Atlas connection failed:', err.message);
                process.exit(1);
            }
        }
    }
    
    // Fallback to local MongoDB (development only)
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
