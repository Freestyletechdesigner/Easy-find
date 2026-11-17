'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 587,
    secure: parseInt(process.env.MAIL_PORT) === 465,
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
});

/**
 * Send a payment receipt email after a successful boost purchase.
 *
 * @param {object} opts
 * @param {string} opts.email       Recipient email
 * @param {string} opts.name        Agent name
 * @param {string} opts.plan        Plan key e.g. 'profile_premium'
 * @param {string} opts.planLabel   Human-readable plan label
 * @param {number} opts.amount      Amount paid in Naira
 * @param {number} opts.days        Boost duration in days
 * @param {string} opts.type        'profile' | 'post'
 * @param {Date}   opts.expiresAt   Boost expiry date
 */
async function sendPaymentReceipt({ email, name, plan, planLabel, amount, days, type, expiresAt }) {
    const boostTarget = type === 'profile' ? 'Profile Boost' : 'Post Boost';
    const expiry = new Date(expiresAt).toLocaleDateString('en-NG', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const date = new Date().toLocaleDateString('en-NG', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    const mailOptions = {
        from:    `"Easy Find" <${process.env.MAIL_FROM || process.env.MAIL_USERNAME}>`,
        to:      email,
        subject: `🎉 Payment Confirmed — ${planLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f7f6;padding:32px 20px;border-radius:12px;">

            <!-- Header -->
            <div style="text-align:center;margin-bottom:28px;">
                <h2 style="color:#0d7068;margin:0;font-size:26px;">Easy Find</h2>
                <p style="color:#666;font-size:13px;margin-top:4px;">Real Estate Simplified</p>
            </div>

            <!-- Congrats Banner -->
            <div style="background:linear-gradient(135deg,#0d7068,#14a89e);border-radius:10px;padding:28px 24px;text-align:center;color:#fff;margin-bottom:24px;">
                <div style="font-size:40px;margin-bottom:8px;">🎉</div>
                <h3 style="margin:0;font-size:22px;">Congratulations, ${name}!</h3>
                <p style="margin:10px 0 0;font-size:15px;opacity:0.92;">
                    Your payment was successful and your <strong>${boostTarget}</strong> is now active.
                </p>
            </div>

            <!-- Receipt -->
            <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e0e0e0;margin-bottom:24px;">
                <h4 style="color:#0d7068;margin:0 0 16px;font-size:16px;border-bottom:1px solid #eee;padding-bottom:10px;">
                    Payment Receipt
                </h4>
                <table style="width:100%;border-collapse:collapse;font-size:14px;color:#444;">
                    <tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:9px 0;color:#888;">Date</td>
                        <td style="padding:9px 0;text-align:right;font-weight:600;">${date}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:9px 0;color:#888;">Plan</td>
                        <td style="padding:9px 0;text-align:right;font-weight:600;">${planLabel}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:9px 0;color:#888;">Duration</td>
                        <td style="padding:9px 0;text-align:right;font-weight:600;">${days} day${days > 1 ? 's' : ''}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:9px 0;color:#888;">Expires</td>
                        <td style="padding:9px 0;text-align:right;font-weight:600;">${expiry}</td>
                    </tr>
                    <tr>
                        <td style="padding:12px 0 0;color:#333;font-weight:700;font-size:16px;">Amount Paid</td>
                        <td style="padding:12px 0 0;text-align:right;font-weight:700;font-size:18px;color:#0d7068;">
                            ₦${amount.toLocaleString('en-NG')}
                        </td>
                    </tr>
                </table>
            </div>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:24px;">
                <a href="${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged"
                   style="display:inline-block;background:#0d7068;color:#fff;text-decoration:none;
                          padding:13px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                    Go to Your Dashboard →
                </a>
            </div>

            <!-- Footer -->
            <p style="text-align:center;color:#bbb;font-size:12px;margin:0;">
                Thank you for choosing Easy Find. If you have any questions, contact us at
                <a href="mailto:${process.env.MAIL_FROM}" style="color:#0d7068;">
                    ${process.env.MAIL_FROM}
                </a>
            </p>
        </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Mailer] Receipt sent to ${email} for plan ${plan}`);
    } catch (err) {
        console.error('[Mailer] Failed to send receipt:', err.message);
        // Non-fatal — don't throw, boost is already applied
    }
}

module.exports = { sendPaymentReceipt };
