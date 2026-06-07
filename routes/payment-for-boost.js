const axios = require('axios');
const crypto = require('crypto');
const cron = require('node-cron');
const { check, validationResult } = require('express-validator');
const AgentUser = require('../model/AgentUser.js');
const AgentPost = require('../model/AgentPost.js');

function requireAgentAuth(req, res, next) {
    if (!req.session.agent) {
        return res.status(403).json({ success: false, message: 'Login required' });
    }
    next();
}

const BOOST_PACKAGES = {
    post:    950,
    profile: 3500
};

function PAYMENT_FOR_BOOST(app) {

    // ── Initialize payment ────────────────────────────────
    app.post('/api/payment-boost', requireAgentAuth, [
        check('email').isEmail().normalizeEmail(),
        check('plan').isIn(['post', 'profile']).trim().escape(),
        check('postId').optional({ checkFalsy: true }).trim().escape()
    ], async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }

        const { email, plan, postId } = req.body;
        const amount = BOOST_PACKAGES[plan];

        try {
            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email,
                    amount: amount * 100, // kobo
                    metadata: {
                        plan_type: plan,
                        agent_id:  req.session.agent.id,
                        post_id:   postId || null
                    },
                    callback_url: `${process.env.APP_URL || 'http://localhost:9000'}/boost-account`
                },
                {
                    headers: {
                        Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            res.json({ success: true, data: response.data.data });

        } catch (error) {
            const msg = error.response ? error.response.data.message : error.message;
            console.error('Paystack init error:', msg);
            res.status(500).json({ success: false, message: 'Could not initialize payment' });
        }
    });

    // ── Verify payment after redirect ────────────────────
    app.get('/api/payment-boost/verify', requireAgentAuth, async (req, res) => {
        const { reference } = req.query;
        if (!reference) return res.status(400).json({ success: false, message: 'No reference provided' });

        try {
            const response = await axios.get(
                `https://api.paystack.co/transaction/verify/${reference}`,
                { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
            );

            const txn = response.data.data;

            // must be successful and amount must match a valid plan
            if (txn.status !== 'success') {
                return res.json({ success: false, message: 'Payment not successful' });
            }

            const { plan_type, agent_id, post_id } = txn.metadata;

            // Fix 11: Validate agent_id matches session to prevent IDOR
            if (agent_id !== req.session.agent.id.toString()) {
                return res.status(403).json({ success: false, message: 'Unauthorized' });
            }

            const durationDays = plan_type === 'profile' ? 30 : 3;
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + durationDays);

            if (plan_type === 'profile') {
                await AgentUser.findByIdAndUpdate(agent_id, {
                    boostAccount:       true,
                    boostAccountExpiry: expiry
                });
            } else if (plan_type === 'post' && post_id) {
                await AgentPost.findByIdAndUpdate(post_id, {
                    boostPost:       true,
                    boostPostExpiry: expiry
                });
            }

            res.json({ success: true, plan_type });

        } catch (err) {
            const msg = err.response ? err.response.data.message : err.message;
            console.error('Verify error:', msg);
            res.status(500).json({ success: false, message: 'Verification failed' });
        }
    });
    app.post('/api/paystack-webhook', async (req, res) => {
        // verify signature — body is raw Buffer when using express.raw()
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
        const hash = crypto
            .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
            .update(rawBody)
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).send('Invalid signature');
        }

        const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;

        if (event.event === 'charge.success') {
            const { plan_type, agent_id, post_id } = event.data.metadata;

            try {
                const durationDays = plan_type === 'profile' ? 30 : 3;
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + durationDays);

                if (plan_type === 'profile') {
                    // boost the whole account
                    await AgentUser.findByIdAndUpdate(agent_id, {
                        boostAccount:       true,
                        boostAccountExpiry: expiry
                    });
                    console.log(`Account boost activated for agent ${agent_id}`);

                } else if (plan_type === 'post' && post_id) {
                    // boost a single post
                    await AgentPost.findByIdAndUpdate(post_id, {
                        boostPost:       true,
                        boostPostExpiry: expiry
                    });
                    console.log(`Post boost activated for post ${post_id}`);
                }

            } catch (err) {
                console.error('DB update failed in webhook:', err);
                return res.status(500).send('Database Error');
            }
        }

        res.sendStatus(200);
    });
}

module.exports = PAYMENT_FOR_BOOST;

// Runs every day at midnight: '0 0 * * *'
// Or for testing, use '* * * * *' to run every minute
cron.schedule('0 0 * * *', async () => {
    try {
        const now = new Date();

        // 1. Expire Agent Accounts
        const expiredAgents = await AgentUser.updateMany(
            { boostAccount: true, boostAccountExpiry: { $lt: now } },
            { $set: { boostAccount: false, boostAccountExpiry: null } }
        );
        if (expiredAgents.modifiedCount > 0) {
            console.log(`Cleaned up ${expiredAgents.modifiedCount} expired agent boosts.`);
        }

        // 2. Expire Individual Post Boosts
        const expiredPosts = await AgentPost.updateMany(
            { boostPost: true, boostPostExpiry: { $lt: now } },
            { $set: { boostPost: false, boostPostExpiry: null } }
        );
        if (expiredPosts.modifiedCount > 0) {
            console.log(`Cleaned up ${expiredPosts.modifiedCount} expired post boosts.`);
        }

    } catch (err) {
        console.error('CRON JOB ERROR: Failed to expire boosts', err);
    }
});