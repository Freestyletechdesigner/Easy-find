/**
 * OTP Mailer — replaces Termii SMS
 * Sends OTP codes via your cPanel/SMTP email account.
 * The API surface (sendOTP, generateOTP) stays the same so
 * nothing else in the codebase needs to change.
 */

'use strict';

const nodemailer = require('nodemailer');

// ─── Transporter — created once and reused ────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 465,
    secure: parseInt(process.env.MAIL_PORT) === 465, // true for 465 (SSL), false for 587 (TLS)
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false, // needed for some cPanel certs
    },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send an OTP to the given email address.
 *
 * @param {string} email  Recipient email
 * @param {string} otp    The 6-digit code
 */
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from:    `"Easy Find" <${process.env.MAIL_USERNAME}>`,
        to:      email,
        subject: 'Your Easy Find Password Reset Code',
        text:    `Your Easy Find password reset code is: ${otp}\n\nThis code expires in 10 minutes.\nDo not share this code with anyone, including Easy Find staff.`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
                <div style="text-align:center;margin-bottom:24px;">
                    <h2 style="color:#0d7068;margin:0;">Easy Find</h2>
                    <p style="color:#666;font-size:14px;margin-top:6px;">Password Reset Code</p>
                </div>
                <div style="background:#fff;border-radius:10px;padding:24px;text-align:center;border:1px solid #e0e0e0;">
                    <p style="color:#333;font-size:15px;margin-bottom:16px;">Use the code below to reset your password:</p>
                    <div style="letter-spacing:10px;font-size:36px;font-weight:700;color:#0d7068;padding:16px;background:#e6f7f5;border-radius:8px;display:inline-block;">
                        ${otp}
                    </div>
                    <p style="color:#888;font-size:13px;margin-top:20px;">
                        This code expires in <strong>30 seconds</strong>.<br>
                        Do not share this code with anyone.
                    </p>
                </div>
                <p style="text-align:center;color:#bbb;font-size:12px;margin-top:20px;">
                    If you didn't request this, ignore this email.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Mailer] OTP sent to ${email}`);
        return { success: true };
    } catch (err) {
        console.error('[Mailer] Failed to send OTP email:', err.message);
        return { success: false, message: 'Failed to send email. Please try again.' };
    }
}

/**
 * Generate an OTP and send it to the email linked to this phone number.
 * Kept the same signature as before — route just calls sendOTP(phone).
 *
 * @param {string} phone  Agent phone number (used to look up email)
 * @param {string} email  Agent email (looked up by the caller in agent.js)
 */
async function sendOTP(phone, email) {
    const otp    = generateOTP();
    const result = await sendOTPEmail(email, otp);
    if (result.success) {
        return { success: true, otp };
    }
    return { success: false, message: result.message };
}

module.exports = { sendOTP, generateOTP };
