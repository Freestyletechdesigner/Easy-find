// Run this once to fix the MongoDB index issue
require('dotenv').config();
const mongoose = require('mongoose');

async function fixIndex() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const db = mongoose.connection.db;
        const collection = db.collection('agentusers');
        
        // Drop the problematic index
        await collection.dropIndex('profilePicture_1');
        console.log('✅ Dropped profilePicture_1 index successfully');
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

fixIndex();
