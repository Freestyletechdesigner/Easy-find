const axios = require('axios');
const AgentUser = require('../model/AgentUser');

function NIN_VERIFICATION(app) {
    
    // Middleware 
    function requireAgent(req, res, next) {
        if (!req.session.agent) {
            return res.status(403).json({ success: false, message: 'Agent authentication required' });
        }
        next();
    }

    app.post('/complete-verification', requireAgent, async (req, res) => {
        try {
            const { referenceId } = req.body;
            const userId = req.session.agent.id;
    
            if (!referenceId || !userId) {
                return res.status(400).json({ message: "Missing Reference ID or User ID" });
            }
    
            // 1. Call Dojah API to get the verification details
            // Note: Use your Secret Key here, NEVER in the frontend
            const response = await axios.get(`https://api.dojah.io/api/v1/kyc/result?reference=${referenceId}`, {
                headers: {
                    'AppId': process.env.DOJAH_APP_ID,
                    'Authorization': process.env.DOJAH_SECRET_KEY
                }
            });
    
            const verification = response.data.entity;
    
            // 2. Security Check: Ensure verification was successful
            if (response.data.entity.status !== 'Approved' && response.data.entity.status !== 'success') {
                 return res.status(400).json({ message: "Verification failed or is still pending." });
            }
    
            // 3. Update the AgentUser in MongoDB
            const updatedUser = await AgentUser.findByIdAndUpdate(
                userId,
                {
                    isVerified: true,
                    stand: "Verified Agent", // Update their status to active
                    verificationData: {
                        firstName: verification.first_name,
                        lastName: verification.last_name,
                        dob: verification.dob,
                        vNIN: verification.vNIN || verification.nin,
                        gender: verification.gender,
                        nimcPhoto: verification.image, // Government record photo
                        selfiePhoto: verification.selfie, // The "moving" live photo
                        referenceId: referenceId,
                        livenessScore: verification.liveness_score,
                        verifiedAt: new Date()
                    }
                },
                { new: true }
            );
    
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

module.exports = NIN_VERIFICATION