# Unified Login System

## Overview
Simplified login system where both admin and regular users use the same form with only email and password.

## How It Works

### Single Login Form
```html
<form id="login-form">
    <input type="email" name="email" placeholder="Email Address" required>
    <input type="password" name="password" placeholder="Password" required>
    <input type="submit" value="Login">
</form>
```

**No name field required!** Just email and password for everyone.

### Backend Logic Flow

1. **User submits email + password**
2. **Backend checks admin first:**
   - Look for email in `admin.json`
   - If found and password matches → Admin login
   - Create admin session → Redirect to `/admin`
3. **If not admin, check regular users:**
   - Look for email in `users.json`
   - If found and password matches → User login
   - Return user data → Show welcome message
4. **If neither found:**
   - Return error: "Invalid email or password"

## Login Credentials

### Admin Login
- **Email:** freedom@email.com
- **Password:** freeman419
- **Result:** Redirects to `/admin` dashboard

### Regular User Login
- **Email:** Any registered user email
- **Password:** User's password
- **Result:** Shows welcome message on homepage

## API Endpoint

### POST /submit-form
Unified endpoint for both admin and user login.

**Request:**
```
Content-Type: multipart/form-data

email=freedom@email.com
password=freeman419
```

**Admin Response:**
```json
{
    "success": true,
    "role": "admin",
    "redirect": "/admin"
}
```

**User Response:**
```json
{
    "success": true,
    "role": "user",
    "user": {
        "id": "USER_123",
        "name": "John Doe",
        "email": "john@email.com"
    }
}
```

**Error Response:**
```json
{
    "success": false,
    "message": "Invalid email or password"
}
```

## Security Benefits

1. **No Admin Email Exposure**
   - Admin email not hardcoded in frontend
   - Attackers can't identify admin accounts
   - Same form for everyone

2. **Priority Check**
   - Admin checked first (faster for admins)
   - Falls back to users automatically
   - Single point of authentication

3. **Simplified UX**
   - One form for everyone
   - No confusion about which form to use
   - Cleaner interface

## Frontend Behavior

### Admin Login
```javascript
// User enters: freedom@email.com + freeman419
// Response: { success: true, role: "admin", redirect: "/admin" }
// Action: Redirect to admin dashboard
window.location.href = '/admin';
```

### User Login
```javascript
// User enters: user@email.com + password
// Response: { success: true, role: "user", user: {...} }
// Action: Show welcome message, update UI
userLog.textContent = `Welcome, ${data.user.name}`;
```

## Testing

### Test Admin Login
```bash
curl -X POST http://localhost:9000/submit-form \
  -F "email=freedom@email.com" \
  -F "password=freeman419"
```

Expected: `{"success":true,"role":"admin","redirect":"/admin"}`

### Test User Login
```bash
curl -X POST http://localhost:9000/submit-form \
  -F "email=user@email.com" \
  -F "password=userpassword"
```

Expected: `{"success":true,"role":"user","user":{...}}`

## Files Modified

1. **login.js**
   - Removed name field requirement
   - Unified admin and user login
   - Priority check: admin first, then users
   - Returns role in response

2. **public/logic.js**
   - Simplified login handler
   - Single fetch request
   - Handles response based on role
   - No more dual login attempts

3. **public/index.html**
   - Already had email + password only
   - No changes needed!

## Advantages

✅ **Simpler** - One form, one endpoint
✅ **Faster** - Single request instead of two
✅ **Secure** - No admin email in frontend
✅ **Clean** - Less code, easier to maintain
✅ **User-friendly** - Same experience for everyone

## Migration from Old System

### Old System
- Admin needed: name + email + password
- Users needed: email + password
- Two separate login attempts
- Admin email hardcoded in frontend

### New System
- Everyone needs: email + password only
- Single login attempt
- Backend determines role
- No hardcoded admin info

## Troubleshooting

### Can't login as admin?
1. Check email is exactly: `freedom@email.com`
2. Check password is exactly: `freeman419`
3. Verify `admin.json` exists and has correct data
4. Check server logs for detailed error messages

### Can't login as user?
1. Make sure user account exists in `users.json`
2. Verify password is correct
3. Check user status is "active"
4. Look at server logs for errors

### Getting "Invalid email or password"?
- Email or password is wrong
- Account doesn't exist
- Check for typos or extra spaces

## Debug Mode

Server logs show detailed information:
```
=== LOGIN ATTEMPT ===
Email: freedom@email.com
Checking if admin...
Admin found, verifying password...
Admin password match: true
Admin login successful!
Admin session created
```

Browser console also shows:
```
=== LOGIN FORM SUBMISSION ===
Email: freedom@email.com
Password: ***
Sending login request...
Login response: {success: true, role: "admin", ...}
Admin login - redirecting to dashboard...
```

## Quick Reference

| User Type | Email | Password | Result |
|-----------|-------|----------|--------|
| Admin | freedom@email.com | freeman419 | Redirect to /admin |
| User | user@email.com | user's password | Welcome message |
| Invalid | any | any | Error message |
