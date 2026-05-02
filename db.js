require('dotenv').config();
require('dotenv').config({ path: '/etc/secrets/.env' });
const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/easyfind';
    console.log('Connecting to:', uri.includes('127.0.0.1') ? 'LOCAL (MONGO_URI not set!)' : 'Atlas');
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/easyfind', {
            tlsAllowInvalidCertificates: false,
            serverSelectionTimeoutMS: 10000
        });
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
