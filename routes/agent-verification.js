'use strict';

/**
 * Agent Live Face Verification
 * ==============================
 * Face comparison runs CLIENT-SIDE using face-api.js in the browser.
 * Browser computes descriptors from selfie + profile photo, sends distance.
 * Server validates distance <= threshold → marks Verified Agent.
 */

const path    = require('path');
const fs      = require('fs').promises;
const crypto  = require('crypto');
const sharp   = require('sharp');
const axios   = require('axios');

const AgentUser   = require('../model/AgentUser');
const Transaction = require('../model/Transaction.js');
const { sendPushToAgents } = require('../utils/push.js');

const ROOT    = path.join(__dirname, '..');
const APP_URL = (process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0].trim();

const MATCH_THRESHOLD = 0.50;

function LIVE_FACE_VERIFICATION(app) {

    function requireAgent(req, res, next) {
        if (!req.session?.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        next();
    }

    async function ensurePaidAgent(req, res, next) {
        const agentId = req.session.agent.id || req.session.agent._id;
        try {
            const agent = await AgentUser.findById(agentId).select('verifyPayment').lean();
            if (!agent?.verifyPayment) {
                return res.status(200).json({ success: false, redirectToPayment: true, url: '/verification-payment' });
            }
            next();
        } catch (err) {
            console.error('[FaceVerify] ensurePaidAgent:', err.message);
            return res.status(500).json({ success: false, message: 'Internal error' });
        }
    }

    // ── Paystack: init payment ────────────────────────────────────────────────
    app.post('/api/verification/initialize-payment', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId);
            if (!agent)              return res.status(404).json({ success: false, message: 'Agent not found' });
            if (agent.verifyPayment) return res.json({ success: false, message: 'Already paid for verification' });

            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                { email: agent.email, amount: 3000 * 100, callback_url: `${APP_URL}/agent-verification`,
                  metadata: { agentId: agentId.toString(), purpose: 'verification_payment' } },
                { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' } }
            );
            if (response.data?.status) {
                return res.json({ success: true, authorization_url: response.data.data.authorization_url, reference: response.data.data.reference });
            }
            res.status(400).json({ success: false, message: 'Transaction initialization failed' });
        } catch (err) {
            console.error('[Paystack] init error:', err.response?.data || err.message);
            res.status(500).json({ success: false, message: 'Could not initialize payment' });
        }
    });

    // ── Paystack: webhook ─────────────────────────────────────────────────────
    app.post('/api/verification/webhook', async (req, res) => {
        try {
            if (!req.rawBody) return res.status(400).send('Missing raw body');
            const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.rawBody).digest('hex');
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

    // ── GET /api/face/status ──────────────────────────────────────────────────
    app.get('/api/face/status', requireAgent, async (req, res) => {
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

    // ── GET /api/face/profile-photo ───────────────────────────────────────────
    // Returns profile photo as base64 so browser can do face-api comparison.
    app.get('/api/face/profile-photo', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            const agent   = await AgentUser.findById(agentId).select('profilePicture').lean();

            if (!agent?.profilePicture) {
                return res.status(404).json({ success: false, message: 'No profile photo found. Please upload a clear profile picture first.' });
            }

            let imgBuf;
            try {
                imgBuf = await fs.readFile(path.join(ROOT, agent.profilePicture));
            } catch (_) {
                return res.status(404).json({ success: false, message: 'Profile photo file not found. Please re-upload your profile picture.' });
            }

            const resized = await sharp(imgBuf)
                .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();

            res.json({ success: true, photoBase64: `data:image/jpeg;base64,${resized.toString('base64')}` });
        } catch (err) {
            console.error('[FaceVerify] profile-photo:', err.message);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // ── POST /api/face/verify-live ────────────────────────────────────────────
    // Receives { selfieBase64, distance, faceDetected } from the browser.
    app.post('/api/face/verify-live', requireAgent, ensurePaidAgent, async (req, res) => {
        const agentId = req.session.agent.id || req.session.agent._id;
        const { selfieBase64, distance, faceDetected } = req.body;

        if (!selfieBase64 || selfieBase64.length < 500) {
            return res.status(400).json({ success: false, message: 'Live selfie image is required.' });
        }
        const dist = parseFloat(distance);
        if (isNaN(dist) || dist < 0 || dist > 2) {
            return res.status(400).json({ success: false, message: 'Invalid face comparison result. Please try again.' });
        }
        if (faceDetected === false) {
            return res.status(400).json({ success: false, message: 'No face detected. Please ensure your face is clearly visible and well-lit.' });
        }
        if (dist > MATCH_THRESHOLD) {
            const similarity = Math.round(Math.max(0, (1 - dist) * 100));
            return res.status(400).json({
                success: false, score: similarity,
                message: `Face match failed (${similarity}% similarity). Make sure your profile photo clearly shows your face and try again.`
            });
        }

        let agent;
        try {
            agent = await AgentUser.findById(agentId).select('name email isVerified').lean();
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
        }

        if (!agent)          return res.status(404).json({ success: false, message: 'Agent not found.' });
        if (agent.isVerified) return res.json({ success: true, stand: 'Verified Agent', score: 100, alreadyVerified: true });

        const similarity = Math.round(Math.max(0, (1 - dist) * 100));
        console.log(`[FaceVerify] agent=${agentId} distance=${dist.toFixed(4)} similarity=${similarity}% → PASS`);
        return markVerified(agentId, similarity, req, res);
    });
}

// ── Mark agent as Verified Agent ──────────────────────────────────────────────
async function markVerified(agentId, score, req, res) {
    try {
        const updated = await AgentUser.findByIdAndUpdate(
            agentId,
            { isVerified: true, stand: 'Verified Agent', verificationData: { livenessScore: score / 100, verifiedAt: new Date() } },
            { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Agent not found.' });

        req.session.agent.stand      = 'Verified Agent';
        req.session.agent.isVerified = true;
        console.log(`[FaceVerify] Agent ${agentId} → Verified Agent (score: ${score}%)`);

        try {
            await Transaction.create({
                agentId, agentName: updated.name || '', agentEmail: updated.email || '',
                type: 'verification', plan: 'live_face_verification', amount: 0,
                reference: `face_${agentId}_${Date.now()}`, status: 'success',
            });
        } catch (e) { console.error('[Transaction] verification record error:', e.message); }

        try {
            await sendPushToAgents({
                agentIds: [agentId.toString()],
                title:   '🎉 You are now a Verified Agent!',
                message: 'Your live face verification was successful. Your profile now shows the Verified Agent badge.',
                url:     `${APP_URL}/agent-loged`,
            });
        } catch (_) {}

        res.json({ success: true, stand: 'Verified Agent', score });
    } catch (err) {
        console.error('[FaceVerify] markVerified:', err.message);
        res.status(500).json({ success: false, message: 'Could not save verification result. Please try again.' });
    }
}

module.exports = LIVE_FACE_VERIFICATION;
