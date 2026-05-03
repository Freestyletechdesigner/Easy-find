require('dotenv').config();
require('dotenv').config({ path: '/etc/secrets/.env' });
const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/easyfind';
    console.log('Connecting to:', uri.includes('127.0.0.1') ? 'LOCAL (MONGO_URI not set!)' : 'Atlas');
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/easyfind', {
            tlsAllowInvalidCertificates: false,
            serverSelectionTimeoutMS: 10 * 60 * 10000, // Increased to 10 minute 
            socketTimeoutMS: 45000,
            retryWrites: true,
            retryReads: true,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        console.error('Ask Freedom to Add your current IP or use local mongoDB server');
        process.exit(1);
    }
};

module.exports = connectDB;
