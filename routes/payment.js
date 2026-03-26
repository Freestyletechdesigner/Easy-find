const crypto = require('crypto');
const https = require('https');

module.exports = function(app) {
    // Payment configuration (move to environment variables in production)
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_paystack_secret_key';
    const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_your_paystack_public_key';
    
    // Nigerian banks and payment methods
    const PAYMENT_METHODS = {
        banks: [
            { code: 'access', name: 'Access Bank', logo: '/icon/access-bank.png' },
            { code: 'gtbank', name: 'GTBank', logo: '/icon/gtbank.png' },
            { code: 'zenith', name: 'Zenith Bank', logo: '/icon/zenith.png' },
            { code: 'uba', name: 'UBA', logo: '/icon/uba.png' },
            { code: 'firstbank', name: 'First Bank', logo: '/icon/firstbank.png' },
            { code: 'fcmb', name: 'FCMB', logo: '/icon/fcmb.png' },
            { code: 'union', name: 'Union Bank', logo: '/icon/union.png' },
            { code: 'sterling', name: 'Sterling Bank', logo: '/icon/sterling.png' }
        ],
        digital: [
            { code: 'opay', name: 'Opay', logo: '/icon/opay.png', color: '#00C896' },
            { code: 'palmpay', name: 'PalmPay', logo: '/icon/palmpay.png', color: '#7B68EE' },
            { code: 'kuda', name: 'Kuda Bank', logo: '/icon/kuda.png', color: '#40196D' },
            { code: 'carbon', name: 'Carbon', logo: '/icon/carbon.png', color: '#000000' },
            { code: 'cowrywise', name: 'Cowrywise', logo: '/icon/cowrywise.png', color: '#0066FF' }
        ],
        wallets: [
            { code: 'paystack', name: 'Card Payment', logo: '/icon/card.png', color: '#00C3F7' },
            { code: 'ussd', name: 'USSD (*737#)', logo: '/icon/ussd.png', color: '#FF6B35' },
            { code: 'transfer', name: 'Bank Transfer', logo: '/icon/transfer.png', color: '#28A745' }
        ]
    };

    // Get available payment methods
    app.get('/api/payment-methods', (req, res) => {
        res.json({
            success: true,
            methods: PAYMENT_METHODS
        });
    });

    // Initialize payment
    app.post('/api/payment/initialize', async (req, res) => {
        try {
            const { bookingId, email, amount, paymentMethod } = req.body;

            // Validate input
            if (!bookingId || !email || !amount || !paymentMethod) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required payment information'
                });
            }

            // Validate email
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email address'
                });
            }

            // Validate amount (convert to kobo for Paystack)
            const amountInKobo = Math.round(parseFloat(amount) * 100);
            if (isNaN(amountInKobo) || amountInKobo < 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment amount'
                });
            }

            // Generate payment reference
            const reference = `booking_${bookingId}_${Date.now()}`;

            // Handle different payment methods
            switch (paymentMethod) {
                case 'paystack':
                case 'card':
                    const paystackResponse = await initializePaystackPayment({
                        email,
                        amount: amountInKobo,
                        reference,
                        bookingId
                    });
                    return res.json(paystackResponse);

                case 'opay':
                    return res.json(await initializeOpayPayment({
                        email,
                        amount,
                        reference,
                        bookingId
                    }));

                case 'transfer':
                    return res.json(await initializeBankTransfer({
                        amount,
                        reference,
                        bookingId
                    }));

                case 'ussd':
                    return res.json(await initializeUSSDPayment({
                        amount,
                        reference,
                        bookingId
                    }));

                default:
                    return res.status(400).json({
                        success: false,
                        message: 'Unsupported payment method'
                    });
            }

        } catch (error) {
            console.error('Payment initialization error:', error);
            res.status(500).json({
                success: false,
                message: 'Payment initialization failed'
            });
        }
    });

    // Paystack webhook for payment verification
    app.post('/api/payment/webhook/paystack', (req, res) => {
        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash === req.headers['x-paystack-signature']) {
            const event = req.body;
            
            if (event.event === 'charge.success') {
                // Update booking payment status
                updateBookingPaymentStatus(event.data.reference, 'paid', event.data);
            }
        }
        
        res.status(200).send('OK');
    });

    // Verify payment status
    app.get('/api/payment/verify/:reference', async (req, res) => {
        try {
            const { reference } = req.params;
            
            const verification = await verifyPaystackPayment(reference);
            
            if (verification.success && verification.data.status === 'success') {
                // Update booking status
                await updateBookingPaymentStatus(reference, 'paid', verification.data);
                
                res.json({
                    success: true,
                    message: 'Payment verified successfully',
                    data: verification.data
                });
            } else {
                res.json({
                    success: false,
                    message: 'Payment verification failed'
                });
            }
        } catch (error) {
            console.error('Payment verification error:', error);
            res.status(500).json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    });

    // Helper functions
    async function initializePaystackPayment({ email, amount, reference, bookingId }) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                email,
                amount,
                reference,
                callback_url: `${process.env.BASE_URL || 'http://localhost:9000'}/payment-success`,
                metadata: {
                    booking_id: bookingId,
                    custom_fields: [
                        {
                            display_name: "Booking ID",
                            variable_name: "booking_id",
                            value: bookingId
                        }
                    ]
                }
            });

            const options = {
                hostname: 'api.paystack.co',
                port: 443,
                path: '/transaction/initialize',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const response = JSON.parse(data);
                    if (response.status) {
                        resolve({
                            success: true,
                            paymentUrl: response.data.authorization_url,
                            reference: response.data.reference,
                            accessCode: response.data.access_code
                        });
                    } else {
                        resolve({
                            success: false,
                            message: response.message || 'Payment initialization failed'
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    async function initializeOpayPayment({ email, amount, reference, bookingId }) {
        // Opay integration (you'll need Opay API credentials)
        return {
            success: true,
            paymentMethod: 'opay',
            instructions: {
                title: 'Pay with Opay',
                steps: [
                    'Open your Opay app',
                    'Go to Transfer/Send Money',
                    `Send ₦${amount.toLocaleString()} to: 7012345678`,
                    'Use reference: ' + reference,
                    'Screenshot the transaction receipt',
                    'Upload receipt or contact support'
                ],
                accountNumber: '7012345678',
                accountName: 'Hotel Bookings',
                amount: amount,
                reference: reference
            }
        };
    }

    async function initializeBankTransfer({ amount, reference, bookingId }) {
        return {
            success: true,
            paymentMethod: 'transfer',
            instructions: {
                title: 'Bank Transfer Payment',
                bankDetails: {
                    accountName: 'Hotel Bookings Limited',
                    accountNumber: '0123456789',
                    bankName: 'Access Bank',
                    sortCode: '044'
                },
                amount: amount,
                reference: reference,
                steps: [
                    'Transfer the exact amount to the account above',
                    'Use the reference code in your transfer description',
                    'Keep your transfer receipt',
                    'Payment will be confirmed within 10 minutes'
                ]
            }
        };
    }

    async function initializeUSSDPayment({ amount, reference, bookingId }) {
        return {
            success: true,
            paymentMethod: 'ussd',
            instructions: {
                title: 'USSD Payment',
                codes: [
                    { bank: 'GTBank', code: '*737*1*Amount*ACCT#', example: `*737*1*${amount}*0123456789#` },
                    { bank: 'Access Bank', code: '*901*1*Amount*ACCT#', example: `*901*1*${amount}*0123456789#` },
                    { bank: 'Zenith Bank', code: '*966*1*Amount*ACCT#', example: `*966*1*${amount}*0123456789#` },
                    { bank: 'UBA', code: '*919*1*Amount*ACCT#', example: `*919*1*${amount}*0123456789#` }
                ],
                accountNumber: '0123456789',
                amount: amount,
                reference: reference,
                steps: [
                    'Dial the USSD code for your bank',
                    'Follow the prompts to complete payment',
                    'Use reference: ' + reference,
                    'Payment confirmation is instant'
                ]
            }
        };
    }

    async function verifyPaystackPayment(reference) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.paystack.co',
                port: 443,
                path: `/transaction/verify/${reference}`,
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    const response = JSON.parse(data);
                    resolve(response);
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    async function updateBookingPaymentStatus(reference, status, paymentData) {
        try {
            // Extract booking ID from reference
            const bookingId = reference.split('_')[1];
            
            // Update booking in your database/file
            // This is a placeholder - implement based on your storage system
            console.log(`Updating booking ${bookingId} payment status to ${status}`);
            
            // You would update the booking.json file here
            // Add payment information to the booking record
            
        } catch (error) {
            console.error('Error updating booking payment status:', error);
        }
    }
};