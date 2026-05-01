const axios = require('axios');

// Generate a 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send SMS via Termii
async function sendSMS(phone, message) {
    try {
        const res = await axios.post('https://v3.api.termii.com/api/sms/send', {
            to:        phone,
            from:      process.env.TERMII_SENDER_ID || 'Easy Find',
            sms:       message,
            type:      'plain',
            channel:   'generic',
            api_key:   process.env.TERMII_API_KEY
        });
        return { success: true, data: res.data };
    } catch (err) {
        console.error('SMS error:', err.response?.data || err.message);
        return { success: false, message: 'Failed to send SMS' };
    }
}

// Send OTP to phone number
async function sendOTP(phone) {
    const otp = generateOTP();
    const message = `Your Easy Find verification code is: ${otp}. Valid for 10 minutes.`;
    const result = await sendSMS(phone, message);
    if (result.success) {
        return { success: true, otp }; // store otp in session to verify later
    }
    return { success: false, message: result.message };
}

module.exports = { sendOTP, sendSMS, generateOTP };
