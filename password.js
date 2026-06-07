const bcrypt = require('bcryptjs');

async function generateHash() {
    const plainPassword = 'Freestyle@042'; // <-- Put your password here
    const saltRounds = 10; // Standard security level

    try {
        console.log('Hashing password...');
        const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
        
        console.log('\n--- SUCCESS ---');
        console.log('Plain Text: ', plainPassword);
        console.log('Hashed Password:', hashedPassword);
        console.log('----------------\n');
    } catch (error) {
        console.error('Error hashing password:', error.message);
    }
}

generateHash();