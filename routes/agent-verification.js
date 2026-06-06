const axios = require('axios');
const AgentUser = require('../model/AgentUser');
const crypto = require('crypto');

function NIN_VERIFICATION(app) {
    
    // Middleware: Verifies if the agent is actively authenticated via session cookies
    function requireAgent(req, res, next) {
        if (!req.session || !req.session.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        next();
    }

    // Middleware: Checks if payment status is valid directly from the database
    async function ensurePaidAgent(req, res, next) {
        if (!req.session || !req.session.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }

        const agentId = req.session.agent.id || req.session.agent._id;

        try {
            const agent = await AgentUser.findById(agentId);
            
            if (!agent || !agent.verifyPayment) {
                return res.status(200).json({ 
                    success: false, 
                    redirectToPayment: true, 
                    url: '/verification-payment' 
                });
            }

            // Sync session so future requests skip the DB hit
            req.session.agent.verifyPayment = true;
            next();
        } catch (err) {
            console.error("Middleware verification state extraction error:", err);
            return res.status(500).json({ success: false, message: "Internal verification lookup failure" });
        }
    }

    // ── BUG FIX: This is the callback URL Paystack redirects to after payment.
    // We CANNOT rely on the webhook having already fired (especially on localhost).
    // Instead, we verify the payment reference directly with Paystack's API here.
    // This is the correct pattern: webhook = background update, redirect = immediate confirmation.
    app.get('/agent-verification', requireAgent, async (req, res) => {
        const { reference, trxref } = req.query;
        const paymentRef = reference || trxref;

        // If no reference in query string — user navigated here directly, just check DB state
        if (!paymentRef) {
            const agentId = req.session.agent.id || req.session.agent._id;
            try {
                const agent = await AgentUser.findById(agentId);
                if (agent && agent.verifyPayment) {
                    req.session.agent.verifyPayment = true;
                    return res.json({ success: true });
                }
                return res.json({ success: false, redirectToPayment: true, url: '/verification-payment' });
            } catch (err) {
                return res.status(500).json({ success: false, message: "DB lookup failed" });
            }
        }

        // Reference exists — verify it directly with Paystack so we don't rely on webhook
        try {
            const paystackResponse = await axios.get(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRef)}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                    }
                }
            );

            const txData = paystackResponse.data?.data;

            if (!txData || txData.status !== 'success') {
                console.warn(`Payment verification failed for reference: ${paymentRef}`, txData?.status);
                return res.json({ success: false, redirectToPayment: true, url: '/verification-payment' });
            }

            // Confirm the metadata matches this agent — prevents one agent using another's reference
            const agentId = req.session.agent.id || req.session.agent._id;
            const metaAgentId = txData.metadata?.agentId;

            if (metaAgentId && metaAgentId.toString() !== agentId.toString()) {
                console.error(`Security: agentId mismatch. Session: ${agentId}, Metadata: ${metaAgentId}`);
                return res.status(403).json({ success: false, message: "Payment reference does not belong to this account" });
            }

            // Payment confirmed — update DB (idempotent: safe to call even if webhook already fired)
            const updatedAgent = await AgentUser.findByIdAndUpdate(
                agentId,
                { verifyPayment: true },
                { new: true }
            );

            if (!updatedAgent) {
                return res.status(404).json({ success: false, message: "Agent not found" });
            }

            // Sync session immediately
            req.session.agent.verifyPayment = true;

            console.log(`Payment confirmed via redirect verification for agent: ${updatedAgent.email}`);
            return res.json({ success: true });

        } catch (err) {
            console.error("Paystack redirect verification error:", err.response?.data || err.message);
            return res.status(500).json({ success: false, message: "Could not verify payment with Paystack" });
        }
    });

    // ── Paystack: Initialize Payment Endpoint ───────────────────
    app.post('/api/verification/initialize-payment', requireAgent, async (req, res) => {
        try {
            const agentId = req.session.agent.id || req.session.agent._id;
            
            const agent = await AgentUser.findById(agentId);
            if (!agent) {
                return res.status(404).json({ success: false, message: "Agent profile not found" });
            }

            // Guard: don't charge an agent who already paid
            if (agent.verifyPayment) {
                return res.json({ success: false, message: "Your account is already verified." });
            }

            const amountInKobo = 3000 * 100;

            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                {
                    email: agent.email,
                    amount: amountInKobo,
                    callback_url: `${req.protocol}://${req.get('host')}/agent-verification`,
                    metadata: {
                        agentId: agentId.toString(),
                        purpose: "verification_payment"
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.status) {
                res.json({
                    success: true,
                    authorization_url: response.data.data.authorization_url,
                    reference: response.data.data.reference
                });
            } else {
                res.status(400).json({ success: false, message: "Transaction failed, please try again later" });
            }

        } catch (error) {
            console.error("Paystack Initialization Error:", error.response?.data || error.message);
            res.status(500).json({ success: false, message: "Network connection error, please try again later" });
        }
    });

    // ── Paystack: Webhook Verification Receiver ───────────────────
    // NOTE: This is a background safety net. The primary update now happens
    // in GET /agent-verification above via direct Paystack API verification.
    // The webhook handles cases where the user closes the browser before redirect.
    app.post('/api/verification/webhook', async (req, res) => {
        try {
            if (!req.rawBody) {
                console.error("Webhook Error: Raw body buffer was not captured.");
                return res.status(400).json({ message: "Payload missing raw body context" });
            }

            const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                               .update(req.rawBody)
                               .digest('hex');
                               
            if (hash !== req.headers['x-paystack-signature']) {
                console.error("Webhook Error: Signature verification failed.");
                return res.status(401).json({ message: "Invalid transaction token signature header" });
            }

            const event = req.body;
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);

            if (event.event === 'charge.success') {
                const metadata = event.data?.metadata;
                
                if (metadata && metadata.purpose === 'verification_payment' && metadata.agentId) {
                    const cleanAgentId = String(metadata.agentId).trim();
                    
                    console.log(`Webhook: Updating verifyPayment for Agent ID: ${cleanAgentId}`);
                    
                    const updatedAgent = await AgentUser.findByIdAndUpdate(
                        cleanAgentId, 
                        {
                            verifyPayment: true,
                            boostAccount: true,
                            boostAccountExpiry: expiry
                        },
                        { new: true }
                    );

                    if (!updatedAgent) {
                        console.error(`Webhook DB Error: No agent found for ID: ${cleanAgentId}`);
                    } else {
                        console.log(`Webhook DB Success: verifyPayment=true for ${updatedAgent.email}`);
                    }
                }
            }

            return res.sendStatus(200);

        } catch (error) {
            console.error("Paystack Webhook Error:", error.message);
            return res.sendStatus(500);
        }
    });

    // Enforced payment verification on the POST handler for NIN completion
    app.post('/complete-verification', requireAgent, ensurePaidAgent, async (req, res) => {
        try {
            const { referenceId } = req.body;
            const userId = req.session.agent.id || req.session.agent._id;
    
            if (!referenceId || !userId) {
                return res.status(400).json({ message: "Missing Reference ID or User ID" });
            }
    
            const response = await axios.get(`https://api.dojah.io/api/v1/kyc/result?reference=${referenceId}`, {
                headers: {
                    'AppId': process.env.DOJAH_APP_ID,
                    'Authorization': process.env.DOJAH_SECRET_KEY
                }
            });
    
            const verification = response.data.entity;
    
            if (!verification || (verification.status !== 'Approved' && verification.status !== 'success')) {
                 return res.status(400).json({ message: "Verification failed or is still pending." });
            }
    
            const updatedUser = await AgentUser.findByIdAndUpdate(
                userId,
                {
                    isVerified: true,
                    stand: "Verified Agent",
                    verificationData: {
                        firstName: verification.first_name,
                        lastName: verification.last_name,
                        dob: verification.dob,
                        vNIN: verification.vNIN || verification.nin,
                        gender: verification.gender,
                        nimcPhoto: verification.image,
                        selfiePhoto: verification.selfie,
                        referenceId: referenceId,
                        livenessScore: verification.liveness_score,
                        verifiedAt: new Date()
                    }
                },
                { new: true }
            );
    
            req.session.agent.stand = "Verified Agent";
            req.session.agent.isVerified = true;
    
            res.status(200).json({
                success: true,
                message: "NIN and Face Verified Successfully",
                user: updatedUser
            });
    
        } catch (error) {
            console.error("Dojah Verification Error:", error.response?.data || error.message);
            res.status(500).json({ message: "Internal Server Error during verification" });
        }
    });

}

module.exports = NIN_VERIFICATION;