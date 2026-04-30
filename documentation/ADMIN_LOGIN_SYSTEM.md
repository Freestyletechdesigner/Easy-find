# Admin Login System

## Overview
Enhanced the login system to support admin authentication through the `/api/login/admin` endpoint while maintaining backward compatibility with the existing `/submit-form` endpoint.

## Admin Credentials

**Default Admin Account:**
- Name: Chiazagom Freedom
- Email: freedom@email.com
- Password: (hashed with bcrypt)
- Role: admin

## API Endpoints

### 1. POST /api/login/admin
New unified admin login endpoint.

**Request:**
```json
{
    "email": "freedom@email.com",
    "password": "your_password"
}
```

**Success Response (200):**
```json
{
    "success": true,
    "message": "Admin login successful",
    "user": {
        "name": "Chiazagom Freedom",
        "email": "freedom@email.com",
        "role": "admin"
    }
}
```

**Error Response (401):**
```json
{
    "success": false,
    "message": "Invalid email or password"
}
```

### 2. POST /submit-form (Legacy)
Original admin login endpoint - kept for backward compatibility.

**Request:**
```json
{
    "name": "Chiazagom Freedom",
    "email": "freedom@email.com",
    "password": "your_password"
}
```

**Success Response (200):**
```json
{
    "success": true
}
```

### 3. GET /api/admin/status
Check if user is logged in as admin.

**Response:**
```json
{
    "success": true,
    "isAdmin": true,
    "user": {
        "username": "Chiazagom Freedom",
        "role": "admin"
    }
}
```

### 4. POST /api/admin/logout
Logout admin user and destroy session.

**Response:**
```json
{
    "success": true,
    "message": "Logged out successfully"
}
```

### 5. GET /admin
Admin dashboard route (requires authentication).
- Redirects to homepage if not authenticated
- Serves admin/index.html if authenticated

## Session Management

**Admin Session Structure:**
```javascript
req.session.admin = {
    username: "Chiazagom Freedom",
    email: "freedom@email.com",
    role: "admin"
}
```

**Session Features:**
- Automatic session regeneration on login
- Secure session cookies
- Session destruction on logout
- Session validation middleware

## Security Features

1. **Password Hashing**
   - Bcrypt with salt rounds
   - Passwords never stored in plain text

2. **Input Validation**
   - Email format validation
   - Password presence check
   - Express-validator integration

3. **Session Security**
   - HTTP-only cookies
   - Secure flag in production
   - Session regeneration on login

4. **Authentication Middleware**
   - `requireAdmin()` middleware protects admin routes
   - Automatic redirect for unauthorized access

## Usage Examples

### Frontend Login (JavaScript)

**Admin Login:**
```javascript
async function adminLogin(email, password) {
    try {
        const response = await fetch('/api/login/admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Admin logged in:', data.user);
            // Redirect to admin dashboard
            window.location.href = '/admin';
        } else {
            console.error('Login failed:', data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
    }
}

// Usage
adminLogin('freedom@email.com', 'your_password');
```

**Check Admin Status:**
```javascript
async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();
        
        if (data.isAdmin) {
            console.log('User is admin:', data.user);
        } else {
            console.log('User is not admin');
        }
    } catch (error) {
        console.error('Status check error:', error);
    }
}
```

**Admin Logout:**
```javascript
async function adminLogout() {
    try {
        const response = await fetch('/api/admin/logout', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Logged out successfully');
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}
```

## Differences Between Endpoints

### /api/login (Regular Users)
- Defined in `signup.js`
- Authenticates against `users.json`
- For regular website users
- Updates login tracking

### /api/login/admin (Admin)
- Defined in `login.js`
- Authenticates against hardcoded admin credentials
- For admin dashboard access
- Creates admin session

### /submit-form (Legacy Admin)
- Original admin login endpoint
- Requires name, email, and password
- Kept for backward compatibility
- Will be deprecated in future

## Protected Routes

Routes that require admin authentication:
- `/admin` - Admin dashboard
- `/admin/*` - All admin pages (analytics, settings, etc.)

**Middleware Protection:**
```javascript
app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
```

## Integration with Existing System

**Regular User Login Flow:**
1. User submits login form
2. Request goes to `/api/login` (in signup.js)
3. Validates against users.json
4. Creates user session
5. Returns user data

**Admin Login Flow:**
1. Admin submits login form
2. Request goes to `/api/login/admin` (in login.js)
3. Validates against admin credentials
4. Creates admin session
5. Returns admin data
6. Redirects to /admin dashboard

## Testing

**Test Admin Login:**
```bash
curl -X POST http://localhost:9000/api/login/admin \
  -H "Content-Type: application/json" \
  -d '{"email":"freedom@email.com","password":"your_password"}'
```

**Test Admin Status:**
```bash
curl http://localhost:9000/api/admin/status \
  --cookie "connect.sid=your_session_cookie"
```

**Test Admin Logout:**
```bash
curl -X POST http://localhost:9000/api/admin/logout \
  --cookie "connect.sid=your_session_cookie"
```

## Files Modified

1. **login.js**
   - Added `/api/login/admin` endpoint
   - Added `/api/admin/status` endpoint
   - Added `/api/admin/logout` endpoint
   - Enhanced session management
   - Added role-based authentication

## Security Recommendations

1. **Change Default Password**
   - Generate new bcrypt hash
   - Update admin.userPassword

2. **Environment Variables**
   - Move admin credentials to .env file
   - Use process.env for sensitive data

3. **Rate Limiting**
   - Add rate limiting to login endpoints
   - Prevent brute force attacks

4. **Two-Factor Authentication**
   - Consider adding 2FA for admin accounts
   - Use authenticator apps or SMS

5. **Session Timeout**
   - Implement automatic session expiration
   - Force re-authentication after inactivity

## Future Enhancements

- Multiple admin accounts support
- Role-based permissions (super admin, moderator, etc.)
- Admin activity logging
- Password reset functionality
- Email verification for admin accounts
- IP whitelist for admin access
- Admin invitation system