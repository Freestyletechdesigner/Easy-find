// Run this to create an admin account
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function createAdmin() {
    const email = 'admin@easyfind.com';
    const password = 'Freeman419'; 
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const admin = {
        id: 'admin_' + Date.now(),
        email: email,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'super_admin',
        createdAt: new Date().toISOString()
    };
    
    const adminFile = path.join(__dirname, 'database', 'admin.json');
    const admins = [admin];
    
    fs.writeFileSync(adminFile, JSON.stringify(admins, null, 2));
    
    console.log('Admin created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Change the password after first login!');
}

createAdmin();
