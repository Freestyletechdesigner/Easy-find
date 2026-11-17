require('dotenv').config();
const mongoose = require('mongoose');

async function fixIndexes() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/easyfind');
        console.log('Connected to local MongoDB');

        const collection = mongoose.connection.db.collection('agentusers');

        // Drop profilePicture unique index
        try {
            await collection.dropIndex('profilePicture_1');
            console.log('✅ Dropped profilePicture_1 index');
        } catch (e) {
            console.log('⚠️  profilePicture_1 index not found (already dropped)');
        }

        // Drop number unique index (phone numbers can be reused across Atlas/local)
        try {
            await collection.dropIndex('number_1');
            console.log('Dropped number_1 index');
        } catch (e) {
            console.log('number_1 index not found (already dropped)');
        }

        console.log('Done! Restart your server now.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

fixIndexes();
