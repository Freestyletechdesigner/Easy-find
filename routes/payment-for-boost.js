const axios = require('axios');
const crypto = require('crypto');
const cron = require('node-cron');
const { check, validationResult } = require('express-validator');
const AgentUser = require('../model/AgentUser.js');
const AgentPost = require('../model/AgentPost.js');
const { sendPushToAgents } = require('../utils/push.js');

function requireAgentAuth(req, res, next) {
    if (!req.session.agent) {
        return res.status(403).json({ success: false, message: 'Login required' });
    }
    next();
}

const BOOST_PACKAGES = {
    post_starter:  { price: 300,   days: 1,  type: 'post',    label: 'Starter Post Boost'   },
    post_standard: { price: 700,   days: 3,  type: 'post',    label: 'Standard Post Boost'  },
    post_pro:      { price: 1500,  days: 7,  type: 'post',    label: 'Pro Post Boost'       },
    profile_basic: { price: 2000,  days: 14, type: 'profile', label: 'Profile Basic'        },
    profile_premium:{ price: 5000, days: 30, type: 'profile', label: 'Profile Premium'      },
};

// ── Shared helper: apply boost based on plan key ─────────
async function applyBoost(planKey, agentId, postId) {
    const pkg = BOOST_PACKAGES[planKey];
    if (!pkg) { console.error('Unknown plan key:', planKey); return; }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + pkg.days);

    if (pkg.type === 'profile') {
        await AgentUser.findByIdAndUpdate(agentId, {
            boostAccount:       true,
            boostAccountExpiry: expiry
        });
        console.log(`[Boost] Profile boost (${planKey}, ${pkg.days}d) for agent ${agentId}`);
        // Push notification to agent
        await sendPushToAgents({
            agentIds: [agentId.toString()],
            title:    '🚀 Your profile boost is active!',
            message:  `Your profile is now featured for ${pkg.days} day${pkg.days > 1 ? 's' : ''}. You'll appear at the top of agent searches.`,
            url:      `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/agent-loged`,
        });
    } else if (pkg.type === 'post' && postId) {
        await AgentPost.findByIdAndUpdate(postId, {
            boostPost:       true,
            boostPostExpiry: expiry
        });
        console.log(`[Boost] Post boost (${planKey}, ${pkg.days}d) for post ${postId}`);
        // Push notification to agent
        await sendPushToAgents({
            agentIds: [agentId.toString()],
            title:    '⚡ Your post boost is live!',
            message:  `Your listing is now boosted for ${pkg.days} day${pkg.days > 1 ? 's' : ''}. It will appear at the top of search results.`,
            url:      `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/property?id=${postId}`,
        });
    }
}

function PAYMENT_FOR_BOOST(app) {

    // ── Initialize payment ────────────────────────────────
    app.post('/api/payment-boost', requireAgentAuth, [
        check('email').isEmail().normalizeEmail(),
        check('plan').isIn(['post_starter','post_standard','post_pro','profile_basic','profile_premium']).trim().escape(),
        check('postId').optional({ checkFalsy: true }).trim().escape()
    ], async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }

        const { email, plan, postId } = req.body;
        const pkg = BOOST_PACKAGES[plan];
        if (!pkg) return res.status(400).json({ success: false, message: 'Invalid plan' });
        const amount = pkg.price;

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
                    callback_url: `${(process.env.APP_URL || 'http://localhost:9000').split(',')[0].trim()}/boost-account`,
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
            if (txn.status !== 'success') {
                return res.json({ success: false, message: 'Payment not successful' });
            }

            const { plan_type, agent_id, post_id } = txn.metadata;

            if (agent_id !== req.session.agent.id.toString()) {
                return res.status(403).json({ success: false, message: 'Unauthorized' });
            }

            await applyBoost(plan_type, agent_id, post_id);
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
                await applyBoost(plan_type, agent_id, post_id);
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

        // ── 1. Warn agents whose boost expires TOMORROW ───────
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const expiringAgents = await AgentUser.find({
            boostAccount: true,
            boostAccountExpiry: { $gte: tomorrow, $lt: dayAfter }
        }).select('_id name').lean();

        for (const agent of expiringAgents) {
            await sendPushToAgents({
                agentIds: [agent._id.toString()],
                title:    '⏰ Your profile boost expires tomorrow',
                message:  'Renew your boost to keep appearing at the top of search results.',
                url:      `${process.env.APP_URL?.split(',')[0] || 'https://easyfind.com.ng'}/boost-account`,
            });
        }

        // ── 2. Expire Agent Accounts ──────────────────────────
        const expiredAgents = await AgentUser.updateMany(
            { boostAccount: true, boostAccountExpiry: { $lt: now } },
            { $set: { boostAccount: false, boostAccountExpiry: null } }
        );
        if (expiredAgents.modifiedCount > 0) {
            console.log(`Cleaned up ${expiredAgents.modifiedCount} expired agent boosts.`);
        }

        // ── 3. Expire Individual Post Boosts ──────────────────
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