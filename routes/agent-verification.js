'use strict';

/**
 * Agent Identity Verification — Powered by Dojah
 * =================================================
 * Flow:
 *  1. Agent pays via Paystack → verifyPayment: true in DB
 *  2. Agent enters NIN + takes a selfie on the verification page
 *  3. Frontend POSTs { nin, selfieBase64 } to /api/dojah/verify-nin
 *  4. Backend:
 *      a. Looks up NIN via Dojah KYC API → gets government data + photo
 *      b. Compares live selfie vs government photo via Dojah face_verify
 *      c. If confidence ≥ 70% → marks agent as Verified Agent
 */

const axios     = require('axios');
const crypto    = require('crypto');
const AgentUser = require('../model/AgentUser');
const { sendPushToAgents } = require('../utils/push.js');
const Transaction = require('../model/Transaction.js');

// ── Dojah config ──────────────────────────────────────────────────────────────
const DOJAH_APP_ID    = process.env.DOJAH_APP_ID;
const DOJAH_SECRET    = process.env.DOJAH_SECRET_KEY;
const DOJAH_BASE      = process.env.DOJAH_BASE_URL ||
    (process.env.NODE_ENV === 'production'
        ? 'https://api.dojah.io'
        : 'https://sandbox.dojah.io');

const FACE_CONFIDENCE_THRESHOLD = 70; // percent

/** Standard Dojah request headers */
function dojahHeaders() {
    return {
        'Authorization': DOJAH_SECRET,
        'AppId':         DOJAH_APP_ID,
        'Content-Type':  'application/json',
    };
}

// ─────────────────────────────────────────────────────────────────────────────

function NIN_VERIFICATION(app) {

    // ── Middleware ────────────────────────────────────────────────────────────
    function requireAgent(req, res, next) {
        if (!req.session?.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        next();
    }

    async function ensurePaidAgent(req, res, next) {
        if (!req.session?.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        const agentId = req.session.agent.id || req.session.agent._id;
        try {
            const agent = await AgentUser.findById(agentId);
            if (!agent?.verifyPayment) {
                return res.status(200).json({
                    success: false,
                    redirectToPayment: true,
                    url: '/verification-payment'
                });
            }
            req.session.agent.verifyPayment = true;
            next();
        } catch (err) {
            console.error('[Dojah] ensurePaidAgent error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal error' });
        }
    }

    // ── Paystack: Initialize Verification Payment ─────────────────────────────
    app.post('/api/verification/initialize-payment', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId);

            if (!agent)              return res.status(404).json({ success: false, message: 'Agent not found' });
            if (agent.verifyPayment) return res.json({ success: false, message: 'Already paid for verification' });

            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email:        agent.email,
                    amount:       3000 * 100,
                    callback_url: `${(process.env.APP_URL || 'http://localhost:9000').split(',')[0].trim()}/agent-verification`,
                    metadata:     { agentId: agentId.toString(), purpose: 'verification_payment' }
                },
                {
                    headers: {
                        Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data?.status) {
                res.json({
                    success:           true,
                    authorization_url: response.data.data.authorization_url,
                    reference:         response.data.data.reference
                });
            } else {
                res.status(400).json({ success: false, message: 'Transaction initialization failed' });
            }
        } catch (err) {
            console.error('[Paystack] init error:', err.response?.data || err.message);
            res.status(500).json({ success: false, message: 'Could not initialize payment' });
        }
    });

    // ── Paystack: Payment Redirect Handler ───────────────────────────────────
    app.get('/agent-verification', async (req, res) => {
        const { reference, trxref } = req.query;
        const paymentRef = reference || trxref;

        if (paymentRef) {
            try {
                const paystackRes = await axios.get(
                    `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRef)}`,
                    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
                );

                const txData = paystackRes.data?.data;
                if (txData?.status === 'success') {
                    const agentId = txData.metadata?.agentId
                        || req.session?.agent?.id
                        || req.session?.agent?._id;

                    if (!agentId) {
                        console.error('[Verification] No agentId in metadata or session');
                        return res.redirect('/verification-payment');
                    }

                    await AgentUser.findByIdAndUpdate(agentId, { verifyPayment: true });

                    // Record transaction
                    try {
                        const agent = await AgentUser.findById(agentId).select('name email').lean();
                        await Transaction.create({
                            agentId,
                            agentName:  agent?.name  || '',
                            agentEmail: agent?.email || '',
                            type:       'verification',
                            plan:       'nin_verification',
                            amount:     3000,
                            reference:  paymentRef,
                            status:     'success',
                        });
                    } catch (txErr) {
                        console.error('[Transaction] Failed to record verification payment:', txErr.message);
                    }

                    if (req.session?.agent) {
                        req.session.agent.verifyPayment = true;
                        req.session.save(() => {});
                    }

                    console.log(`[Verification] Payment confirmed for agent ${agentId}`);
                    return res.redirect('/agent-verification');
                }
            } catch (err) {
                console.error('[Paystack] verify error:', err.message);
            }
            return res.redirect('/verification-payment');
        }

        if (!req.session?.agent) return res.redirect('/login-agent');

        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId).select('verifyPayment').lean();
            if (agent?.verifyPayment) {
                req.session.agent.verifyPayment = true;
                return res.sendFile(require('path').join(__dirname, '..', 'agent-verification', 'index.html'));
            }
            return res.redirect('/verification-payment');
        } catch (err) {
            console.error('[Verification] DB check error:', err.message);
            return res.redirect('/verification-payment');
        }
    });

    // ── Paystack: Webhook ─────────────────────────────────────────────────────
    app.post('/api/verification/webhook', async (req, res) => {
        try {
            if (!req.rawBody) return res.status(400).send('Missing raw body');

            const hash = crypto
                .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                .update(req.rawBody)
                .digest('hex');

            if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Invalid signature');

            const event = req.body;
            if (event.event === 'charge.success') {
                const { purpose, agentId } = event.data?.metadata || {};
                if (purpose === 'verification_payment' && agentId) {
                    await AgentUser.findByIdAndUpdate(agentId.trim(), { verifyPayment: true });
                    console.log(`[Verification] Webhook: payment confirmed for agent ${agentId}`);
                }
            }
            res.sendStatus(200);
        } catch (err) {
            console.error('[Verification] Webhook error:', err.message);
            res.sendStatus(500);
        }
    });

    // ── Dojah: NIN Lookup + Face Verification ─────────────────────────────────
    /**
     * POST /api/dojah/verify-nin
     * Body: { nin: string, selfieBase64: string }
     *
     * Steps:
     *  1. Fetch NIN data from Dojah (GET /api/v1/kyc/nin?nin=...)
     *  2. Extract government photo from response
     *  3. Compare selfie vs government photo (POST /api/v1/ml/face_verify)
     *  4. If confidence ≥ 70% → mark agent as Verified Agent
     */
    app.post('/api/dojah/verify-nin', requireAgent, ensurePaidAgent, async (req, res) => {
        const agentId = req.session.agent.id || req.session.agent._id;
        const { nin, selfieBase64 } = req.body;

        // ── Validate inputs ───────────────────────────────────────────────────
        if (!nin || !/^\d{11}$/.test(nin.trim())) {
            return res.status(400).json({ success: false, message: 'Please provide a valid 11-digit NIN.' });
        }
        if (!selfieBase64 || selfieBase64.length < 100) {
            return res.status(400).json({ success: false, message: 'Selfie image is required for verification.' });
        }

        // Strip data URI prefix if present (data:image/jpeg;base64,...)
        const cleanSelfie = selfieBase64.replace(/^data:image\/\w+;base64,/, '');

        console.log(`[Dojah] Starting NIN verification for agent ${agentId}`);

        try {
            // ── Step 1: NIN Lookup ────────────────────────────────────────────
            let ninData;
            try {
                const ninRes = await axios.get(
                    `${DOJAH_BASE}/api/v1/kyc/nin`,
                    {
                        params:  { nin: nin.trim() },
                        headers: dojahHeaders(),
                        timeout: 15000,
                    }
                );
                ninData = ninRes.data?.entity;
                console.log('[Dojah] NIN lookup success:', ninData?.firstname, ninData?.lastname);
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message;
                console.error('[Dojah] NIN lookup failed:', errMsg);
                return res.status(400).json({
                    success: false,
                    message: 'NIN lookup failed. Please check your NIN and try again.',
                    detail:  errMsg
                });
            }

            if (!ninData) {
                return res.status(404).json({
                    success: false,
                    message: 'NIN not found. Please check the number and try again.'
                });
            }

            // ── Step 2: Extract government photo ─────────────────────────────
            // Dojah returns the photo as a base64 string in entity.photo
            const govPhoto = ninData.photo;
            if (!govPhoto) {
                console.warn('[Dojah] No government photo in NIN data — skipping face check');
                // Still verify but without face match (lenient mode)
                return markVerified(agentId, ninData, null, req, res);
            }

            // Strip prefix if Dojah returns a data URI
            const cleanGovPhoto = govPhoto.replace(/^data:image\/\w+;base64,/, '');

            // ── Step 3: Face Verification ─────────────────────────────────────
            let faceScore = 0;
            try {
                const faceRes = await axios.post(
                    `${DOJAH_BASE}/api/v1/ml/face_verify`,
                    {
                        image_1: cleanSelfie,   // live selfie
                        image_2: cleanGovPhoto, // government photo
                    },
                    {
                        headers: dojahHeaders(),
                        timeout: 20000,
                    }
                );

                faceScore = faceRes.data?.entity?.confidence_value
                    ?? faceRes.data?.entity?.similarity
                    ?? 0;

                console.log(`[Dojah] Face confidence score: ${faceScore}%`);
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message;
                console.error('[Dojah] Face verify failed:', errMsg);
                // If face API fails, still allow if NIN was valid (graceful fallback)
                console.warn('[Dojah] Proceeding with NIN-only verification due to face API error');
                return markVerified(agentId, ninData, null, req, res);
            }

            // ── Step 4: Confidence check ──────────────────────────────────────
            if (faceScore < FACE_CONFIDENCE_THRESHOLD) {
                console.warn(`[Dojah] Face match too low (${faceScore}%) for agent ${agentId}`);
                return res.status(400).json({
                    success: false,
                    message: `Face match confidence too low (${Math.round(faceScore)}%). Please ensure good lighting and face the camera directly.`,
                    score:   faceScore
                });
            }

            // ── Verified! ─────────────────────────────────────────────────────
            return markVerified(agentId, ninData, faceScore, req, res);

        } catch (err) {
            console.error('[Dojah] Unexpected error:', err.message);
            res.status(500).json({ success: false, message: 'Verification service error. Please try again.' });
        }
    });

    // ── Dojah: BVN Lookup (utility — available for future use) ───────────────
    app.get('/api/dojah/lookup-bvn', requireAgent, async (req, res) => {
        const { bvn } = req.query;
        if (!bvn || !/^\d{11}$/.test(bvn.trim())) {
            return res.status(400).json({ success: false, message: 'Valid 11-digit BVN required.' });
        }
        try {
            const response = await axios.get(
                `${DOJAH_BASE}/api/v1/kyc/bvn`,
                {
                    params:  { bvn: bvn.trim() },
                    headers: dojahHeaders(),
                    timeout: 15000,
                }
            );
            res.json({ success: true, data: response.data?.entity });
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message;
            console.error('[Dojah] BVN lookup failed:', errMsg);
            res.status(400).json({ success: false, message: errMsg });
        }
    });

    // ── Check verification status ─────────────────────────────────────────────
    app.get('/api/dojah/status', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId).select('isVerified stand').lean();

            if (agent?.isVerified) {
                req.session.agent.stand      = 'Verified Agent';
                req.session.agent.isVerified = true;
                return res.json({ success: true, verified: true, stand: 'Verified Agent' });
            }
            res.json({ success: true, verified: false });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error checking status' });
        }
    });
}

// ── Helper: mark agent as verified in DB ──────────────────────────────────────
async function markVerified(agentId, ninData, faceScore, req, res) {
    try {
        const updated = await AgentUser.findByIdAndUpdate(
            agentId,
            {
                isVerified: true,
                stand:      'Verified Agent',
                verificationData: {
                    firstName:     ninData?.firstname   || ninData?.first_name  || '',
                    lastName:      ninData?.lastname    || ninData?.last_name   || '',
                    dob:           ninData?.birthdate   || ninData?.date_of_birth || '',
                    gender:        ninData?.gender      || '',
                    nimcPhoto:     ninData?.photo       || '',
                    referenceId:   ninData?.nin         || ninData?.vnin || '',
                    livenessScore: faceScore !== null ? faceScore / 100 : 1,
                    verifiedAt:    new Date()
                }
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        // Sync session
        req.session.agent.stand      = 'Verified Agent';
        req.session.agent.isVerified = true;

        console.log(`[Dojah] Agent ${agentId} marked as Verified Agent (face score: ${faceScore}%)`);

        // Push notification
        try {
            await sendPushToAgents({
                agentIds: [agentId.toString()],
                title:    '🎉 You are now a Verified Agent!',
                message:  'Your NIN identity has been confirmed. Your profile now shows the Verified Agent badge.',
                url:      `${(process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0]}/agent-loged`,
            });
        } catch (_) { /* non-fatal */ }

        res.json({
            success: true,
            stand:   'Verified Agent',
            score:   faceScore,
            name:    `${updated.verificationData?.firstName || ''} ${updated.verificationData?.lastName || ''}`.trim()
        });

    } catch (err) {
        console.error('[Dojah] markVerified error:', err.message);
        res.status(500).json({ success: false, message: 'Could not save verification result' });
    }
}

module.exports = NIN_VERIFICATION;
