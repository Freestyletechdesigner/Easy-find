# Debug Admin Login Issue

## Steps to Debug

### 1. Test with Debug Page
1. Start your server: `node app.js`
2. Open browser to: `http://localhost:9000/test-admin-login.html`
3. Click "Test Login" button
4. Open browser console (F12) to see detailed logs

### 2. Check Server Logs
Look for these messages in your terminal:
```
=== ADMIN LOGIN ATTEMPT ===
Request body: { name: '...', email: '...', password: '...' }
Parsed data: { name: '...', email: '...', password: '***' }
Admin found: Yes/No
Name check: { provided: '...', expected: '...', match: true/false }
Verifying password...
Password match: true/false
```

### 3. Check Browser Console
Look for these messages in browser console (F12):
```
=== LOGIN FORM SUBMISSION ===
Name: ...
Email: ...
Password: ***
Attempting admin login...
Admin login response: {...}
```

## Common Issues & Solutions

### Issue 1: "Admin not found"
**Problem:** Email doesn't match
**Solution:** 
- Check `admin.json` file exists
- Verify email is exactly: `freedom@email.com`
- Check for extra spaces or typos

### Issue 2: "Name mismatch"
**Problem:** Name doesn't match exactly
**Solution:**
- Name must be exactly: `Chiazagom Freedom`
- Check for extra spaces
- Case-sensitive match required

### Issue 3: "Password mismatch"
**Problem:** Password hash doesn't match
**Solution:**
1. Verify password is: `freeman419`
2. Check hash in admin.json matches:
   ```
   $2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa
   ```
3. If not, regenerate hash:
   ```bash
   node password.js
   ```
4. Copy new hash to admin.json
5. Restart server

### Issue 4: "Validation failed"
**Problem:** Form data not being sent correctly
**Solution:**
- Check all three fields are filled: name, email, password
- Verify form has correct input names
- Check browser console for form data

### Issue 5: Session not created
**Problem:** Login succeeds but can't access /admin
**Solution:**
- Check session middleware is configured in app.js
- Verify cookie settings
- Clear browser cookies and try again

## Manual Test with cURL

Test admin login from command line:

```bash
curl -X POST http://localhost:9000/submit-form \
  -F "name=Chiazagom Freedom" \
  -F "email=freedom@email.com" \
  -F "password=freeman419" \
  -v
```

Expected response:
```json
{"success":true}
```

## Check Files

### 1. Verify admin.json
```bash
cat admin.json
```

Should show:
```json
[
  {
    "id": "ADMIN_001",
    "userName": "Chiazagom Freedom",
    "userEmail": "freedom@email.com",
    "userPassword": "$2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa",
    "role": "admin",
    "status": "active"
  }
]
```

### 2. Check Server is Running
```bash
# Should see: "server running"
node app.js
```

### 3. Test Password Hash
```bash
node test-admin-password.js
```

## Frontend Form Check

Make sure your login form in `public/index.html` has:

```html
<form id="login-form">
    <input type="text" name="name" placeholder="Full Name" required>
    <input type="email" name="email" placeholder="Email Address" required>
    <input type="password" name="password" placeholder="Password" required>
    <input type="submit" value="Sign In">
</form>
```

**Important:** All three fields (name, email, password) must have correct `name` attributes!

## Quick Fix Checklist

- [ ] Server is running (`node app.js`)
- [ ] admin.json file exists in project root
- [ ] admin.json has correct data (see above)
- [ ] Password hash matches freeman419
- [ ] Login form has all three fields with correct names
- [ ] Browser console shows no JavaScript errors
- [ ] Server logs show login attempt
- [ ] Tried test page: http://localhost:9000/test-admin-login.html

## Still Not Working?

1. **Stop the server** (Ctrl+C)
2. **Delete admin.json** (it will be recreated)
3. **Restart server** (`node app.js`)
4. **Try test page** (http://localhost:9000/test-admin-login.html)
5. **Check server logs** for detailed error messages
6. **Check browser console** (F12) for frontend errors

## Get Help

If still not working, provide:
1. Server console output (copy all logs)
2. Browser console output (F12 → Console tab)
3. Network tab response (F12 → Network tab → click on submit-form request)
4. Contents of admin.json file
