'use strict';

const axios     = require('axios');
const crypto    = require('crypto');
const AgentUser = require('../model/AgentUser');

// ── Smile ID SDK ──────────────────────────────────────────────────────────────
const smileIdentityCore = require('smile-identity-core');
const Signature         = smileIdentityCore.Signature;

// ── Smile ID config ───────────────────────────────────────────────────────────
const SMILE_PARTNER_ID = process.env.SMILE_ID_PARTNER_ID;
const SMILE_API_KEY    = process.env.SMILE_ID_API_KEY;
const SMILE_ENV        = (process.env.SMILE_ID_ENVIRONMENT || 'sandbox').toLowerCase();
const SMILE_SID_SERVER = SMILE_ENV === 'production' ? '1' : '0';
const SMILE_BASE       = SMILE_ENV === 'production'
    ? 'https://api.smileidentity.com/v1'
    : 'https://testapi.smileidentity.com/v1';

// Instantiate the SDK signature provider exactly as documented
const signatureProvider = new Signature(SMILE_PARTNER_ID, SMILE_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────

function NIN_VERIFICATION(app) {

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
            console.error('ensurePaidAgent error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal error' });
        }
    }

    // ── Paystack: Initialize Verification Payment ─────────────────────────────
    app.post('/api/verification/initialize-payment', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId);

            if (!agent)               return res.status(404).json({ success: false, message: 'Agent not found' });
            if (agent.verifyPayment)  return res.json({ success: false, message: 'Already paid for verification' });

            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email:        agent.email,
                    amount:       3000 * 100,
                    callback_url: `${req.protocol}://${req.get('host')}/agent-verification`,
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
            console.error('Paystack init error:', err.response?.data || err.message);
            res.status(500).json({ success: false, message: 'Could not initialize payment' });
        }
    });

    // ── Paystack: Payment Redirect Handler ───────────────────────────────────
    app.get('/agent-verification', requireAgent, async (req, res) => {
        const { reference, trxref } = req.query;
        const paymentRef = reference || trxref;
        const agentId    = req.session.agent.id || req.session.agent._id;

        if (!paymentRef) {
            try {
                const agent = await AgentUser.findById(agentId);
                if (agent?.verifyPayment) {
                    req.session.agent.verifyPayment = true;
                    return res.sendFile(require('path').join(__dirname, '..', 'agent-verification', 'index.html'));
                }
                return res.redirect('/verification-payment');
            } catch (err) {
                return res.redirect('/verification-payment');
            }
        }

        // Inside your Paystack callback route handler
        try {
            const paystackRes = await axios.get(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRef)}`,
                { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
            );
        
            const txData = paystackRes.data?.data;
            if (!txData || txData.status !== 'success') return res.redirect('/verification-payment');
        
            // 1. Await the DB update
            await AgentUser.findByIdAndUpdate(agentId, { verifyPayment: true });
            
            // 2. Update the session
            req.session.agent.verifyPayment = true;
            
            // 3. Force save
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).send('Session save error');
                }
                // 4. Finally serve the page
                return res.redirect('/agent-verification');
            });
        } catch (err) {
            console.error('Paystack verify error:', err.message);
            return res.redirect('/verification-payment');
        }
    });

    // ── Paystack: Webhook ────────────────────────────────────────────────────
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
                    console.log(`[Verification] Payment confirmed for agent ${agentId}`);
                }
            }
            res.sendStatus(200);
        } catch (err) {
            console.error('Verification webhook error:', err.message);
            res.sendStatus(500);
        }
    });

    // ── Smile ID: Generate Web Token ─────────────────────────────────────────
    app.post('/api/smile/token', requireAgent, ensurePaidAgent, async (req, res) => {
        try {
            const agentId   = req.session.agent.id || req.session.agent._id;
            const timestamp = new Date().toISOString();
            const jobId     = `easyfind_${agentId}_${Date.now()}`;

            // SDK returns { signature: '...', timestamp: '...' } — extract both
            const sigData = signatureProvider.generate_signature(timestamp);

            const payload = {
                partner_id:     SMILE_PARTNER_ID,
                signature:      sigData.signature,
                timestamp:      sigData.timestamp,
                authorization:  sigData.signature,
                user_id:        agentId.toString(),
                job_id:         jobId,
                job_type:       1,
                product:        'biometric_kyc',
                callback_url:   `${process.env.APP_URL?.split(',')[0] || 'http://localhost:9000'}/api/smile/callback`,
                country:        'NG',
                id_type:        'NIN',
                sid_server:     SMILE_SID_SERVER,
                partner_params: {
                    job_id:  jobId,
                    user_id: agentId.toString()
                }
            };

            console.log('[Smile ID] Token request → URL:', `${SMILE_BASE}/token`);
            console.log('[Smile ID] partner_id:', SMILE_PARTNER_ID, '| sid_server:', SMILE_SID_SERVER);
            console.log('[Smile ID] timestamp:', sigData.timestamp);
            console.log('[Smile ID] signature:', sigData.signature);

            const response = await axios.post(`${SMILE_BASE}/token`, payload);

            console.log('[Smile ID] Response status:', response.status);
            console.log('[Smile ID] Response data:', JSON.stringify(response.data));

            if (!response.data?.token) {
                console.error('[Smile ID] Unexpected token response:', response.data);
                return res.status(500).json({ success: false, message: 'Could not generate verification token' });
            }

            res.json({
                success:    true,
                token:      response.data.token,
                partner_id: SMILE_PARTNER_ID,
                sid_server: SMILE_SID_SERVER
            });

        } catch (err) {
            console.error('[Smile ID] Token error:', err.response?.data || err.message);
            res.status(500).json({ success: false, message: 'Verification service error. Please try again.' });
        }
    });

    // ── Smile ID: Callback (Smile ID calls this after job completes) ──────────
    app.post('/api/smile/callback', async (req, res) => {
        try {
            const { partner_params, Actions, ResultCode, ResultText, FullData } = req.body;
            const agentId = partner_params?.user_id;

            console.log(`[Smile ID] Callback for agent ${agentId}: ${ResultCode} — ${ResultText}`);

            if (ResultCode === '0' && agentId) {
                await AgentUser.findByIdAndUpdate(agentId, {
                    isVerified: true,
                    stand:      'Verified Agent',
                    verificationData: {
                        firstName:     FullData?.FullName?.split(' ')[0] || '',
                        lastName:      FullData?.FullName?.split(' ').slice(1).join(' ') || '',
                        dob:           FullData?.DOB || '',
                        gender:        FullData?.Gender || '',
                        nimcPhoto:     FullData?.Photo || '',
                        referenceId:   partner_params?.job_id || '',
                        livenessScore: Actions?.Liveness_Check === 'Passed' ? 1 : 0,
                        verifiedAt:    new Date()
                    }
                });
                console.log(`[Smile ID] Agent ${agentId} verified ✓`);
            } else {
                console.warn(`[Smile ID] Verification failed for ${agentId}: ${ResultText}`);
            }

            res.sendStatus(200);
        } catch (err) {
            console.error('[Smile ID] Callback error:', err.message);
            res.sendStatus(500);
        }
    });

    // ── Smile ID: Mark agent verified after successful widget completion ─────────
    // Called directly from the frontend onSuccess — doesn't rely on Smile ID webhook
    app.post('/api/smile/verify-complete', requireAgent, ensurePaidAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;

            const updated = await AgentUser.findByIdAndUpdate(
                agentId,
                {
                    isVerified: true,
                    stand:      'Verified Agent',
                    'verificationData.verifiedAt': new Date()
                },
                { new: true }
            );

            if (!updated) {
                return res.status(404).json({ success: false, message: 'Agent not found' });
            }

            // Sync session
            req.session.agent.stand      = 'Verified Agent';
            req.session.agent.isVerified = true;

            console.log(`[Smile ID] Agent ${agentId} marked as Verified Agent`);

            res.json({ success: true, stand: 'Verified Agent' });
        } catch (err) {
            console.error('[Smile ID] verify-complete error:', err.message);
            res.status(500).json({ success: false, message: 'Could not complete verification' });
        }
    });

    // ── Smile ID: Poll result ─────────────────────────────────────────────────
    app.get('/api/smile/result', requireAgent, async (req, res) => {
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
            res.status(500).json({ success: false, message: 'Error checking verification status' });
        }
    });
}

module.exports = NIN_VERIFICATION;
