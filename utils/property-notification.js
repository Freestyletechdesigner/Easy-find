'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 465,
    secure: parseInt(process.env.MAIL_PORT) === 465,
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
});

/**
 * Send a property listing confirmation email to the agent.
 *
 * @param {object} options
 * @param {string} options.agentEmail  - Agent's email address
 * @param {string} options.agentName   - Agent's full name
 * @param {string} options.title       - Property title
 * @param {string} options.type        - Property type (house, land, etc.)
 * @param {string} options.category    - sale / rent / shortlet
 * @param {number} options.price       - Price in Naira
 * @param {string} options.location    - Property location
 * @param {string} options.propertyId  - MongoDB _id of the new post
 */
async function sendPropertyListingNotification({
    agentEmail, agentName, title, type, category, price, location, propertyId
}) {
    if (!agentEmail) return;

    const categoryLabel = category === 'shortlet' ? 'Short-let'
                        : category === 'rent'      ? 'For Rent'
                        : 'For Sale';

    const priceFormatted = `₦${Number(price).toLocaleString('en-NG')}`;
    const propertyUrl    = `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/property?id=${propertyId}`;
    const dashboardUrl   = `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/agent-loged`;

    const mailOptions = {
        from:    `"Easy Find" <${process.env.MAIL_USERNAME}>`,
        to:      agentEmail,
        subject: `✅ Your property "${title}" is now live on Easy Find`,
        text: `Hi ${agentName},\n\nYour property listing is now live!\n\nTitle: ${title}\nType: ${type}\nCategory: ${categoryLabel}\nPrice: ${priceFormatted}\nLocation: ${location}\n\nView your listing: ${propertyUrl}\nManage your listings: ${dashboardUrl}\n\n— Easy Find Team`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:0;border-radius:12px;overflow:hidden;">

                <!-- Header -->
                <div style="background:linear-gradient(135deg,#02473b,#012b24);padding:28px 32px;text-align:center;">
                    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">
                        <span style="color:#66eaea;">E</span>asy Find
                    </h1>
                    <p style="color:#9fcfc5;margin:6px 0 0;font-size:13px;">Property Listing Platform</p>
                </div>

                <!-- Body -->
                <div style="background:#fff;padding:32px;">
                    <div style="background:#ecfdf5;border-left:4px solid #27a594;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;">
                        <p style="margin:0;color:#065f46;font-weight:700;font-size:15px;">
                            ✅ Your property is now live!
                        </p>
                    </div>

                    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
                        Hi <strong>${agentName}</strong>, your listing has been published successfully and is now visible to property seekers on Easy Find.
                    </p>

                    <!-- Property details card -->
                    <div style="background:#f0faf9;border:1px solid #d1fae5;border-radius:10px;padding:20px;margin-bottom:24px;">
                        <h3 style="margin:0 0 14px;color:#02473b;font-size:16px;">${title}</h3>
                        <table style="width:100%;border-collapse:collapse;font-size:14px;">
                            <tr>
                                <td style="color:#6b7280;padding:5px 0;width:100px;">Type</td>
                                <td style="color:#111827;font-weight:600;padding:5px 0;text-transform:capitalize;">${type}</td>
                            </tr>
                            <tr>
                                <td style="color:#6b7280;padding:5px 0;">Category</td>
                                <td style="color:#111827;font-weight:600;padding:5px 0;">${categoryLabel}</td>
                            </tr>
                            <tr>
                                <td style="color:#6b7280;padding:5px 0;">Price</td>
                                <td style="color:#02473b;font-weight:800;font-size:16px;padding:5px 0;">${priceFormatted}</td>
                            </tr>
                            <tr>
                                <td style="color:#6b7280;padding:5px 0;">Location</td>
                                <td style="color:#111827;font-weight:600;padding:5px 0;">${location}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- CTA buttons -->
                    <div style="text-align:center;margin-bottom:24px;">
                        <a href="${propertyUrl}"
                           style="display:inline-block;background:linear-gradient(135deg,#27a594,#05594a);color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:15px;margin:0 8px 10px;">
                            View Listing
                        </a>
                        <a href="${dashboardUrl}"
                           style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:15px;margin:0 8px 10px;">
                            My Dashboard
                        </a>
                    </div>

                    <p style="color:#9ca3af;font-size:13px;margin:0;text-align:center;">
                        Share your listing link with potential clients to get enquiries faster.
                    </p>
                </div>

                <!-- Footer -->
                <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
                    <p style="color:#9ca3af;font-size:12px;margin:0;">
                        &copy; 2026 Easy Find &nbsp;|&nbsp;
                        <a href="https://easyfind.com.ng" style="color:#27a594;text-decoration:none;">easyfind.com.ng</a>
                    </p>
                </div>

            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Mailer] Property listing notification sent to ${agentEmail}`);
    } catch (err) {
        // Non-fatal — don't crash the post if email fails
        console.error('[Mailer] Property notification failed:', err.message);
    }
}

module.exports = { sendPropertyListingNotification };
