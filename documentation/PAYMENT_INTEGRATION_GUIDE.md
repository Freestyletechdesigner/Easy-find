# Payment Integration Guide

## Overview
This hotel booking system now includes a complete payment integration with Nigerian payment methods and a custom alert box system.

## Features Implemented

### 1. Custom Alert Box System
- **File**: `public/alert-box.js`
- **Features**:
  - Success, Error, Warning, and Info alerts
  - Confirm dialogs with custom buttons
  - Smooth animations and modern UI
  - No more native browser alerts
  - Fully customizable

**Usage Examples**:
```javascript
// Success alert
alertBox.success('Title', 'Message');

// Error alert
alertBox.error('Title', 'Message');

// Warning alert
alertBox.warning('Title', 'Message');

// Confirm dialog
alertBox.confirm('Title', 'Message', onConfirm, onCancel);

// Custom buttons
alertBox.show({
    title: 'Custom Alert',
    message: 'Your message',
    type: 'info',
    buttons: [
        { text: 'Cancel', type: 'secondary', onClick: () => {} },
        { text: 'OK', type: 'primary', onClick: () => {} }
    ]
});
```

### 2. Payment Integration
- **Files**: 
  - `payment.js` - Backend payment processing
  - `public/payment.html` - Payment selection page
  - `public/payment-success.html` - Success confirmation page

**Supported Payment Methods**:
1. **Digital Banks**:
   - Opay
   - PalmPay
   - Kuda Bank
   - Carbon

2. **Traditional Methods**:
   - Debit/Credit Cards (via Paystack)
   - Bank Transfer
   - USSD Codes (*737#, *901#, etc.)

### 3. Payment Flow

```
User Books Room → Booking Created → Redirect to Payment Page
                                           ↓
                              User Selects Payment Method
                                           ↓
                    ┌──────────────────────┴──────────────────────┐
                    ↓                                              ↓
            Card Payment (Paystack)                    Manual Payment
                    ↓                                              ↓
        Redirect to Gateway                    Show Instructions
                    ↓                                              ↓
        Payment Completed                      User Completes Payment
                    ↓                                              ↓
                    └──────────────────────┬──────────────────────┘
                                           ↓
                              Payment Success Page
                                           ↓
                              Return to Hero Page
                                           ↓
                              Show Success Alert
```

### 4. Alert Box Integration

**Pages with Alert Box**:
- ✅ `public/index.html` (Hero page)
- ✅ `public/property.html`
- ✅ `public/payment.html`
- ✅ `public/payment-success.html`
- ✅ `public/logic.js` (Booking logic)

**Replaced Alerts**:
- Booking success → Custom success alert with auto-redirect
- Booking errors → Custom error alerts
- Payment errors → Custom error alerts
- Payment success → Custom success alert on hero page
- Copy to clipboard → Custom success alerts

### 5. Payment Success Flow on Hero Page

When users complete payment and return to the hero page:
1. URL contains `?payment=success&booking=BOOKING_ID`
2. Custom alert box shows success message
3. Booking details displayed in alert
4. URL cleaned up automatically
5. localStorage cleared

## Setup Instructions

### 1. Install Required Packages
```bash
npm install
```

### 2. Configure Paystack
1. Sign up at https://paystack.com
2. Get your API keys (test/live)
3. Set environment variables:
```bash
PAYSTACK_SECRET_KEY=sk_test_your_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_public_key
BASE_URL=http://localhost:9000
```

### 3. Update Bank Details
Edit `payment.js` and update:
- Bank account numbers
- Opay/PalmPay account details
- USSD codes
- Transfer instructions

### 4. Configure Webhook (Production)
1. Go to Paystack Dashboard → Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/payment/webhook/paystack`
3. Copy webhook secret
4. Update in environment variables

## Testing

### Test Payment Flow
1. Start server: `node app.js`
2. Go to `http://localhost:9000`
3. Book a room
4. Select payment method
5. Complete payment
6. Verify success alert on hero page

### Test Paystack (Test Cards)
```
Card Number: 4084084084084081
CVV: 408
Expiry: Any future date
PIN: 0000
OTP: 123456
```

## API Endpoints

### Payment Endpoints
- `GET /api/payment-methods` - Get available payment methods
- `POST /api/payment/initialize` - Initialize payment
- `POST /api/payment/webhook/paystack` - Paystack webhook
- `GET /api/payment/verify/:reference` - Verify payment

### Booking Endpoints
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get all bookings (admin)
- `PATCH /api/bookings/:id` - Update booking status (admin)

## Security Features

### Payment Security
- ✅ Secure payment references (crypto.randomBytes)
- ✅ Webhook signature verification
- ✅ Rate limiting on payment endpoints
- ✅ Input validation and sanitization
- ✅ HTTPS required in production

### Alert Box Security
- ✅ XSS prevention (textContent instead of innerHTML)
- ✅ No eval() or dangerous code execution
- ✅ Sanitized user inputs

## Customization

### Alert Box Styling
Edit `public/alert-box.js` styles section to customize:
- Colors
- Animations
- Border radius
- Shadows
- Button styles

### Payment Methods
Add/remove payment methods in `payment.js`:
```javascript
const PAYMENT_METHODS = {
    digital: [
        { code: 'newbank', name: 'New Bank', logo: '/icon/newbank.png' }
    ]
};
```

## Troubleshooting

### Alert Box Not Showing
1. Check if `alert-box.js` is loaded before other scripts
2. Check browser console for errors
3. Verify `alertBox` is defined globally

### Payment Not Processing
1. Check Paystack API keys
2. Verify webhook URL is accessible
3. Check server logs for errors
4. Test with Paystack test cards

### Redirect Issues
1. Check BASE_URL environment variable
2. Verify callback URLs in payment initialization
3. Check browser console for redirect errors

## Production Checklist

- [ ] Replace test Paystack keys with live keys
- [ ] Update bank account details
- [ ] Configure webhook URL
- [ ] Enable HTTPS
- [ ] Set up proper database (replace JSON file)
- [ ] Add email notifications
- [ ] Set up monitoring and logging
- [ ] Test all payment methods
- [ ] Add payment receipt generation
- [ ] Configure backup system

## Support

For issues or questions:
1. Check server logs
2. Check browser console
3. Verify API responses
4. Test with different payment methods
5. Contact Paystack support for gateway issues
