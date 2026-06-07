const axios = require('axios');

// Set to true for testing without real SMS
const TEST_MODE = true;

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSMS(phone, message) {
    // TEST MODE: Just log and return success
    if (TEST_MODE) {
        console.log(' [TEST MODE] SMS would be sent to:', phone);
        console.log(' Message:', message);
        return { success: true, data: { message: 'Test mode - SMS not actually sent' } };
    }

    const apiKey = process.env.TERMII_API_KEY;
    const sender = process.env.TERMII_SENDER || 'Termii';

    // convert 08012345678 → 2348012345678
    const mobile = phone.startsWith('0') ? '234' + phone.slice(1) : phone;

    try {
        const res = await axios.post('https://v3.api.termii.com/api/sms/send', {
            to:      mobile,
            from:    sender,
            sms:     message,
            type:    'plain',
            channel: 'generic',
            api_key: apiKey
        });
        console.log('Termii response:', res.data);
        if (res.data?.code === 'ok') {
            return { success: true, data: res.data };
        }
        return { success: false, message: res.data?.message || 'SMS failed' };
    } catch (err) {
        console.error('SMS error:', err.response?.data || err.message);
        return { success: false, message: 'Failed to send SMS' };
    }
}

async function sendOTP(phone) {
    const otp     = generateOTP();
    const message = `Your Easy Find login pin is ${otp}. Expires in 10 minutes. Do not share this code to any body that claim to be a member of Easy Find.`;
    const result  = await sendSMS(phone, message);
    if (result.success) {
        console.log(' [OTP GENERATED]:', otp, '- Use this to test!');
        return { success: true, otp };
    }
    return { success: false, message: result.message };
}

module.exports = { sendOTP, sendSMS, generateOTP };
