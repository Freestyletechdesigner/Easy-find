// Run once to create the admin account: node create-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const ADMIN    = require('./model/ADMIN.js');

async function createAdmin() {
    try {
        // 1. connect to the database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('DB connected');

        const email    = 'admin@easyfind.com';
        const password = 'Freeman419';

        // 2. check if admin already exists
        const existing = await ADMIN.findOne({ email });
        if (existing) {
            console.log('Admin already exists:', email);
            return;
        }

        // 3. create and save — password is auto-hashed by the pre-save hook
        const admin = new ADMIN({ email, password });
        await admin.save();
        console.log('Admin created successfully:', email);

    } catch (error) {
        console.error('Error creating admin:', error.message);
    } finally {
        // 4. always close the connection so the process exits
        await mongoose.disconnect();
        console.log('DB disconnected');
    }
}

createAdmin();
