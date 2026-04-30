# Admin Login Credentials

## Admin Account Details

**Email:** freedom@email.com  
**Password:** freeman419  
**Name:** Chiazagom Freedom  
**Role:** admin

## How to Login

### Method 1: Through Homepage Login Form
1. Go to homepage (http://localhost:9000)
2. Click "Login" button
3. Enter credentials:
   - Name: Chiazagom Freedom
   - Email: freedom@email.com
   - Password: freeman419
4. Click "Sign In"
5. You will be automatically redirected to /admin dashboard

### Method 2: Direct API Call
```bash
curl -X POST http://localhost:9000/submit-form \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Chiazagom Freedom&email=freedom@email.com&password=freeman419"
```

### Method 3: Using /api/login/admin
```bash
curl -X POST http://localhost:9000/api/login/admin \
  -H "Content-Type: application/json" \
  -d '{"email":"freedom@email.com","password":"freeman419"}'
```

## Login Flow

1. **User enters credentials** in login form
2. **Frontend checks** if email is admin email (freedom@email.com)
3. **If admin email:**
   - Sends request to `/submit-form` endpoint
   - Backend validates credentials
   - Creates admin session
   - Redirects to `/admin` dashboard
4. **If regular user email:**
   - Sends request to `/api/login` endpoint
   - Backend validates against users.json
   - Creates user session
   - Shows welcome message on homepage

## Password Hash

The password `freeman419` is hashed using bcrypt:
```
$2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa
```

## Changing Admin Password

If you want to change the admin password:

1. **Generate new hash:**
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YourNewPassword', 10).then(hash => console.log(hash));"
```

2. **Update login.js:**
```javascript
const admin = {
    userName: 'Chiazagom Freedom',
    userEmail: 'freedom@email.com',
    userPassword: 'YOUR_NEW_HASH_HERE',
    role: 'admin'
};
```

3. **Restart server**

## Troubleshooting

### Can't login?
1. Make sure you're using the correct email: `freedom@email.com`
2. Make sure you're using the correct password: `freeman419`
3. Check browser console for errors (F12)
4. Check server logs for error messages

### Getting "Invalid credentials"?
- Double-check the email and password
- Make sure there are no extra spaces
- Password is case-sensitive

### Not redirecting to admin dashboard?
- Check browser console for JavaScript errors
- Make sure the server is running
- Try clearing browser cache and cookies

## Security Notes

⚠️ **Important Security Recommendations:**

1. **Change the default password** immediately in production
2. **Use environment variables** for credentials instead of hardcoding
3. **Enable HTTPS** in production
4. **Add rate limiting** to prevent brute force attacks
5. **Implement 2FA** for additional security
6. **Use strong passwords** (minimum 12 characters, mixed case, numbers, symbols)

## Files Involved

- `login.js` - Admin authentication logic
- `public/logic.js` - Frontend login form handler
- `password.js` - Password hash generator (for reference)
- `admin/index.html` - Admin dashboard

## Testing

You can test the admin login with this simple HTML form:

```html
<!DOCTYPE html>
<html>
<body>
    <form id="test-form">
        <input type="text" name="name" value="Chiazagom Freedom" placeholder="Name">
        <input type="email" name="email" value="freedom@email.com" placeholder="Email">
        <input type="password" name="password" value="freeman419" placeholder="Password">
        <button type="submit">Login</button>
    </form>
    
    <script>
        document.getElementById('test-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const res = await fetch('/submit-form', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            console.log(data);
            
            if (data.success) {
                window.location.href = '/admin';
            }
        });
    </script>
</body>
</html>
```

## Quick Reference

| Field | Value |
|-------|-------|
| Email | freedom@email.com |
| Password | freeman419 |
| Name | Chiazagom Freedom |
| Role | admin |
| Dashboard URL | http://localhost:9000/admin |
| Login Endpoint | /submit-form or /api/login/admin |
