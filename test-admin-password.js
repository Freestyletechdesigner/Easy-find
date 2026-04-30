// Test script to verify admin password
const bcrypt = require('bcrypt');

const storedHash = '$2b$10$EN1N3ikc68EPtG80FD0FI./8SJT3RTgCfMhclL5fVfRAkXxk.AHYK';

// Test common passwords
const passwordsToTest = [
    'admin',
    'password',
    'admin123',
    'Admin123',
    'freedom',
    'Freedom123',
    '12345678',
    'Chiazagom',
    'Freedom@123'
];

console.log('Testing admin password hash...\n');
console.log('Stored hash:', storedHash);
console.log('\nTesting passwords:\n');

async function runTests() {
    for (const password of passwordsToTest) {
        const isMatch = await bcrypt.compare(password, storedHash);
        console.log(`"${password}" -> ${isMatch ? '✓ MATCH!' : '✗ No match'}`);
    }
    
    console.log('\n---\nIf none match, you need to generate a new hash.');
    console.log('Run this to create a new hash:');
    console.log('node -e "const bcrypt = require(\'bcrypt\'); bcrypt.hash(\'YourPassword\', 10).then(hash => console.log(hash));"');
}

runTests();
