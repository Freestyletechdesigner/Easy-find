'use strict';

/**
 * Partnership Badge Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only:
 *   POST   /api/admin/partner/grant/:agentId     — grant badge + create referral code
 *   POST   /api/admin/partner/revoke/:agentId    — revoke badge
 *
 * Partner (authenticated agent with partnerBadge):
 *   GET    /api/partner/dashboard                — summary stats
 *   GET    /api/partner/referrals                — list of referred agents
 *   GET    /api/partner/earnings                 — paginated earning transactions
 *   POST   /api/partner/withdraw                 — request withdrawal to Opay
 *
 * Public / Signup hook:
 *   GET    /api/partner/ref/:code                — validate referral code (used on signup page)
 */

const crypto      = require('crypto');
const AgentUser   = require('../model/AgentUser.js');
const Transaction = require('../model/Transaction.js');
const { sendPushToAgents } = require('../utils/push.js');

// ── Helpers ───────────────────────────────────────────────────────────────
function generateReferralCode(name) {
    // e.g.  JOHN-A3F9
    const slug = (name || 'AGENT').replace(/\s+/g, '').toUpperCase().slice(0, 6);
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${slug}-${rand}`;
}

function requireAdmin(req, res, next) {
    if (!req.session.admin)
        return res.status(403).json({ success: false, message: 'Admin authentication required' });
    next();
}

function requireAgent(req, res, next) {
    if (!req.session.agent)
        return res.status(403).json({ success: false, message: 'Agent authentication required' });
    next();
}

function requirePartner(req, res, next) {
    if (!req.session.agent)
        return res.status(403).json({ success: false, message: 'Agent authentication required' });
    // We re-check from DB in the route itself to stay accurate after revocation
    next();
}

// ── Module ────────────────────────────────────────────────────────────────
module.exports = function PARTNERSHIP(app) {

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Grant partnership badge
    // ══════════════════════════════════════════════════════════════════════
    app.post('/api/admin/partner/grant/:agentId', requireAdmin, async (req, res) => {
        try {
            const { agentId } = req.params;
            const note = (req.body.note || '').trim().slice(0, 200);

            const agent = await AgentUser.findById(agentId);
            if (!agent)
                return res.status(404).json({ success: false, message: 'Agent not found' });

            if (agent.partnerBadge)
                return res.status(409).json({ success: false, message: 'Agent already has a partnership badge' });

            // Generate a unique referral code (retry once on rare collision)
            let code = generateReferralCode(agent.name);
            const collision = await AgentUser.findOne({ referralCode: code }).lean();
            if (collision) code = generateReferralCode(agent.name + Date.now());

            agent.partnerBadge          = true;
            agent.partnerBadgeGrantedAt = new Date();
            agent.partnerBadgeNote      = note;
            agent.referralCode          = code;
            await agent.save();

            // Notify the agent
            try {
                await sendPushToAgents({
                    agentIds: [agentId.toString()],
                    title:    '🤝 You have been awarded a Partnership Badge!',
                    message:  'You can now share your referral link, verify referred agents, and earn 30% from their boost payments.',
                    url:      `${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged/partner`,
                });
            } catch (_) { /* non-fatal */ }

            res.json({
                success:      true,
                message:      'Partnership badge granted',
                referralCode: code
            });

        } catch (err) {
            console.error('[Partnership] Grant error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Revoke partnership badge
    // ══════════════════════════════════════════════════════════════════════
    app.post('/api/admin/partner/revoke/:agentId', requireAdmin, async (req, res) => {
        try {
            const { agentId } = req.params;

            const agent = await AgentUser.findById(agentId);
            if (!agent)
                return res.status(404).json({ success: false, message: 'Agent not found' });

            if (!agent.partnerBadge)
                return res.status(409).json({ success: false, message: 'Agent does not have a partnership badge' });

            agent.partnerBadge          = false;
            agent.partnerBadgeGrantedAt = null;
            agent.partnerBadgeNote      = '';
            agent.referralCode          = null;
            await agent.save();

            // Notify the agent
            try {
                await sendPushToAgents({
                    agentIds: [agentId.toString()],
                    title:    'Partnership Badge Removed',
                    message:  'Your partnership badge has been revoked. Contact support for more information.',
                    url:      `${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged`,
                });
            } catch (_) { /* non-fatal */ }

            res.json({ success: true, message: 'Partnership badge revoked' });

        } catch (err) {
            console.error('[Partnership] Revoke error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Verify a referred agent (partner can also call this)
    // Partners can verify agents who signed up through their referral link.
    // This sets stand = 'Verified Agent' on the referred agent.
    // ══════════════════════════════════════════════════════════════════════
    app.post('/api/partner/verify-referred/:referredAgentId', requirePartner, async (req, res) => {
        try {
            const partnerId = req.session.agent.id;

            // Confirm caller is a genuine partner
            const partner = await AgentUser.findById(partnerId).select('partnerBadge name').lean();
            if (!partner || !partner.partnerBadge)
                return res.status(403).json({ success: false, message: 'Partnership badge required' });

            const { referredAgentId } = req.params;

            const referred = await AgentUser.findById(referredAgentId);
            if (!referred)
                return res.status(404).json({ success: false, message: 'Agent not found' });

            // Must have been referred by this partner
            if (referred.referredBy !== partnerId.toString())
                return res.status(403).json({ success: false, message: 'This agent was not referred by you' });

            // Already verified — idempotent
            if (referred.stand === 'Verified Agent')
                return res.json({ success: true, message: 'Agent is already verified' });

            referred.stand = 'Verified Agent';
            await referred.save();

            // Notify the referred agent
            try {
                await sendPushToAgents({
                    agentIds: [referredAgentId.toString()],
                    title:    '✅ Your account has been verified!',
                    message:  `Your account was verified by your partner ${partner.name}. You can now post unlimited properties.`,
                    url:      `${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged`,
                });
            } catch (_) { /* non-fatal */ }

            res.json({ success: true, message: `${referred.name} has been verified` });

        } catch (err) {
            console.error('[Partnership] Verify referred error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // PUBLIC — Validate a referral code (used on signup page query param)
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/partner/ref/:code', async (req, res) => {
        try {
            const code = (req.params.code || '').trim().toUpperCase();
            if (!code)
                return res.status(400).json({ success: false, message: 'Code required' });

            const partner = await AgentUser.findOne({ referralCode: code, partnerBadge: true })
                .select('name profilePicture referralCode')
                .lean();

            if (!partner)
                return res.status(404).json({ success: false, message: 'Invalid or expired referral code' });

            res.json({
                success: true,
                partner: {
                    name:           partner.name,
                    profilePicture: partner.profilePicture || null,
                    referralCode:   partner.referralCode
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // PARTNER — Dashboard summary
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/partner/dashboard', requirePartner, async (req, res) => {
        try {
            const partnerId = req.session.agent.id;

            const partner = await AgentUser.findById(partnerId)
                .select('name partnerBadge partnerBadgeGrantedAt referralCode partnerEarnings partnerWithdrawn')
                .lean();

            if (!partner || !partner.partnerBadge)
                return res.status(403).json({ success: false, message: 'Partnership badge required' });

            // Count referred agents
            const totalReferred = await AgentUser.countDocuments({ referredBy: partnerId.toString() });
            const verifiedReferred = await AgentUser.countDocuments({
                referredBy: partnerId.toString(),
                stand: 'Verified Agent'
            });

            // Pending withdrawal balance
            const available = (partner.partnerEarnings || 0) - (partner.partnerWithdrawn || 0);

            // Pending withdrawals
            const pendingWithdrawal = await Transaction.findOne({
                agentId: partnerId.toString(),
                type: 'partner_withdrawal',
                withdrawalStatus: { $in: ['pending', 'processing'] }
            }).lean();

            // Referral link
            const baseUrl = (process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0].trim();
            const referralLink = `${baseUrl}/signup-agent?ref=${partner.referralCode}`;

            res.json({
                success: true,
                dashboard: {
                    referralCode:      partner.referralCode,
                    referralLink,
                    totalReferred,
                    verifiedReferred,
                    totalEarnings:     partner.partnerEarnings  || 0,
                    totalWithdrawn:    partner.partnerWithdrawn || 0,
                    availableBalance:  available > 0 ? available : 0,
                    hasPendingPayout:  !!pendingWithdrawal,
                    badgeGrantedAt:    partner.partnerBadgeGrantedAt
                }
            });

        } catch (err) {
            console.error('[Partnership] Dashboard error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // PARTNER — List referred agents
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/partner/referrals', requirePartner, async (req, res) => {
        try {
            const partnerId = req.session.agent.id;

            // Confirm badge
            const partner = await AgentUser.findById(partnerId).select('partnerBadge').lean();
            if (!partner || !partner.partnerBadge)
                return res.status(403).json({ success: false, message: 'Partnership badge required' });

            const page  = Math.max(1, parseInt(req.query.page)  || 1);
            const limit = Math.min(20, parseInt(req.query.limit) || 10);
            const skip  = (page - 1) * limit;

            const [agents, total] = await Promise.all([
                AgentUser.find({ referredBy: partnerId.toString() })
                    .select('name email number stand status registrationDate profilePicture')
                    .sort({ registrationDate: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                AgentUser.countDocuments({ referredBy: partnerId.toString() })
            ]);

            res.json({ success: true, total, page, agents });

        } catch (err) {
            console.error('[Partnership] Referrals error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // PARTNER — Earning history
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/partner/earnings', requirePartner, async (req, res) => {
        try {
            const partnerId = req.session.agent.id;

            const partner = await AgentUser.findById(partnerId).select('partnerBadge').lean();
            if (!partner || !partner.partnerBadge)
                return res.status(403).json({ success: false, message: 'Partnership badge required' });

            const page  = Math.max(1, parseInt(req.query.page)  || 1);
            const limit = Math.min(20, parseInt(req.query.limit) || 10);
            const skip  = (page - 1) * limit;

            const [txns, total] = await Promise.all([
                Transaction.find({
                    agentId: partnerId.toString(),
                    type:    { $in: ['partner_earning', 'partner_withdrawal'] },
                    status:  'success'
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
                Transaction.countDocuments({
                    agentId: partnerId.toString(),
                    type:    { $in: ['partner_earning', 'partner_withdrawal'] },
                    status:  'success'
                })
            ]);

            res.json({ success: true, total, page, transactions: txns });

        } catch (err) {
            console.error('[Partnership] Earnings error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // PARTNER — Request withdrawal to Opay
    // ══════════════════════════════════════════════════════════════════════
    app.post('/api/partner/withdraw', requirePartner, async (req, res) => {
        try {
            const partnerId = req.session.agent.id;

            const partner = await AgentUser.findById(partnerId)
                .select('name email partnerBadge partnerEarnings partnerWithdrawn')
                .lean();

            if (!partner || !partner.partnerBadge)
                return res.status(403).json({ success: false, message: 'Partnership badge required' });

            const available = (partner.partnerEarnings || 0) - (partner.partnerWithdrawn || 0);
            if (available < 500)
                return res.status(400).json({
                    success: false,
                    message: `Minimum withdrawal is ₦500. Your available balance is ₦${available.toLocaleString('en-NG')}`
                });

            // Validate Opay details
            const accountNumber = (req.body.accountNumber || '').trim();
            const accountName   = (req.body.accountName   || '').trim();
            const amount        = parseFloat(req.body.amount) || 0;

            if (!accountNumber || !/^\d{10,11}$/.test(accountNumber))
                return res.status(400).json({ success: false, message: 'Valid 10 or 11-digit Opay account number is required' });

            if (!accountName || accountName.length < 3)
                return res.status(400).json({ success: false, message: 'Account name is required' });

            if (!amount || amount < 500)
                return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is ₦500' });

            if (amount > available)
                return res.status(400).json({
                    success: false,
                    message: `Amount exceeds available balance of ₦${available.toLocaleString('en-NG')}`
                });

            // Block double-withdraw: ensure no pending withdrawal exists
            const existingPending = await Transaction.findOne({
                agentId:          partnerId.toString(),
                type:             'partner_withdrawal',
                withdrawalStatus: { $in: ['pending', 'processing'] }
            }).lean();

            if (existingPending)
                return res.status(409).json({
                    success: false,
                    message: 'You already have a pending withdrawal. Please wait for it to be processed.'
                });

            // Create a pending withdrawal transaction
            const txn = await Transaction.create({
                agentId:           partnerId.toString(),
                agentName:         partner.name,
                agentEmail:        partner.email,
                type:              'partner_withdrawal',
                amount:            amount,
                status:            'pending',
                withdrawalStatus:  'pending',
                opayAccountNumber: accountNumber,
                opayAccountName:   accountName,
            });

            // Reserve the amount so balance reflects immediately
            await AgentUser.findByIdAndUpdate(partnerId, {
                $inc: { partnerWithdrawn: amount }
            });

            // Notify admin via push (to all admins — broadcast)
            try {
                const { sendPushToAllAgents } = require('../utils/push.js');
                // We re-use sendPushToAllAgents as a broadcast — admins don't subscribe
                // but this will be visible in the admin transactions panel
            } catch (_) { /* non-fatal */ }

            res.json({
                success: true,
                message: 'Withdrawal request submitted. Admin will process it within 24 hours.',
                withdrawal: {
                    id:            txn._id,
                    amount,
                    accountNumber,
                    accountName,
                    status:        'pending'
                }
            });

        } catch (err) {
            console.error('[Partnership] Withdraw error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Get all pending withdrawals
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/admin/partner/withdrawals', requireAdmin, async (req, res) => {
        try {
            const status = req.query.status || 'pending';
            const validStatuses = ['pending', 'processing', 'paid', 'failed'];
            const filter = validStatuses.includes(status) ? status : 'pending';

            const withdrawals = await Transaction.find({
                type:            'partner_withdrawal',
                withdrawalStatus: filter
            })
            .sort({ createdAt: -1 })
            .lean();

            res.json({ success: true, withdrawals });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Mark withdrawal as paid / failed
    // ══════════════════════════════════════════════════════════════════════
    app.patch('/api/admin/partner/withdrawals/:txnId', requireAdmin, async (req, res) => {
        try {
            const { txnId } = req.params;
            const { withdrawalStatus } = req.body;

            if (!['processing', 'paid', 'failed'].includes(withdrawalStatus))
                return res.status(400).json({ success: false, message: 'Invalid status' });

            const txn = await Transaction.findById(txnId);
            if (!txn || txn.type !== 'partner_withdrawal')
                return res.status(404).json({ success: false, message: 'Withdrawal not found' });

            const prevStatus = txn.withdrawalStatus;
            txn.withdrawalStatus = withdrawalStatus;
            txn.status           = withdrawalStatus === 'paid' ? 'success' : (withdrawalStatus === 'failed' ? 'failed' : 'pending');
            await txn.save();

            // If failed — refund the reserved amount back to available balance
            if (withdrawalStatus === 'failed' && prevStatus !== 'failed') {
                await AgentUser.findByIdAndUpdate(txn.agentId, {
                    $inc: { partnerWithdrawn: -txn.amount }
                });
            }

            // Notify the agent
            try {
                const msgMap = {
                    processing: 'Your withdrawal is being processed. Funds will arrive in your Opay account soon.',
                    paid:       `Your withdrawal of ₦${txn.amount.toLocaleString('en-NG')} has been sent to your Opay account.`,
                    failed:     `Your withdrawal of ₦${txn.amount.toLocaleString('en-NG')} failed. The amount has been returned to your balance.`
                };
                await sendPushToAgents({
                    agentIds: [txn.agentId.toString()],
                    title:    withdrawalStatus === 'paid' ? '💸 Withdrawal Successful' : withdrawalStatus === 'failed' ? '⚠️ Withdrawal Failed' : '🔄 Withdrawal Processing',
                    message:  msgMap[withdrawalStatus] || '',
                    url:      `${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged/partner`,
                });
            } catch (_) { /* non-fatal */ }

            res.json({ success: true, message: `Withdrawal marked as ${withdrawalStatus}` });

        } catch (err) {
            console.error('[Partnership] Update withdrawal error:', err);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN — Get all partners (for admin panel)
    // ══════════════════════════════════════════════════════════════════════
    app.get('/api/admin/partners', requireAdmin, async (req, res) => {
        try {
            const partners = await AgentUser.find({ partnerBadge: true })
                .select('name email number profilePicture referralCode partnerBadgeGrantedAt partnerEarnings partnerWithdrawn status')
                .sort({ partnerBadgeGrantedAt: -1 })
                .lean();

            // Enrich with referral counts
            const enriched = await Promise.all(partners.map(async (p) => {
                const referralCount = await AgentUser.countDocuments({ referredBy: p._id.toString() });
                return {
                    ...p,
                    referralCount,
                    availableBalance: (p.partnerEarnings || 0) - (p.partnerWithdrawn || 0)
                };
            }));

            res.json({ success: true, partners: enriched });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });
};
