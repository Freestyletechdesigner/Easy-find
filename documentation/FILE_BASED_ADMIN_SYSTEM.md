# File-Based Admin System

## Overview
Implemented a secure file-based admin authentication system using `admin.json` for storing admin credentials. The admin email is no longer hardcoded in the frontend for enhanced security.

## Security Improvements

### 1. Removed Hardcoded Admin Email from Frontend
**Before:**
```javascript
// INSECURE - Admin email exposed in frontend
const isAdminEmail = loginData.email === 'freedom@email.com';
```

**After:**
```javascript
// SECURE - No admin email in frontend
// Backend determines if user is admin
let res = await fetch("/submit-form", {
    method: "POST",
    body: formData
});
```

### 2. File-Based Admin Storage
Admin credentials are now stored in `admin.json` instead of being hardcoded in the backend.

## File Structure

### admin.json
```json
[
  {
    "id": "ADMIN_001",
    "userName": "Chiazagom Freedom",
    "userEmail": "freedom@email.com",
    "userPassword": "$2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa",
    "role": "admin",
    "createdAt": "2026-02-18T00:00:00.000Z",
    "lastLogin": null,
    "status": "active"
  }
]
```

**Fields:**
- `id`: Unique admin identifier
- `userName`: Full name of admin
- `userEmail`: Admin email address
- `userPassword`: Bcrypt hashed password
- `role`: User role (always "admin")
- `createdAt`: Account creation timestamp
- `lastLogin`: Last login timestamp (updated on each login)
- `status`: Account status (active/inactive)

## Features

### 1. Automatic File Initialization
If `admin.json` doesn't exist, it's automatically created with default admin account.

```javascript
async function initAdminFile() {
    try {
        await fs.access(adminFile);
    } catch {
        // Create default admin if file doesn't exist
        const defaultAdmin = [{
            id: 'ADMIN_001',
            userName: 'Chiazagom Freedom',
            userEmail: 'freedom@email.com',
            userPassword: '$2b$10$pZQ7mlEUmyWum3.GXj2pVuL6spQpszqNSElgxlJxUoqRsUcJpGsAa',
            role: 'admin',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            status: 'active'
        }];
        await fs.writeFile(adminFile, JSON.stringify(defaultAdmin, null, 2));
    }
}
```

### 2. Login Tracking
Every successful admin login updates the `lastLogin` timestamp.

```javascript
async function updateAdminLogin(email) {
    const data = await fs.readFile(adminFile, 'utf8');
    const admins = JSON.parse(data);
    const adminIndex = admins.findIndex(admin => 
        admin.userEmail.toLowerCase() === email.toLowerCase()
    );
    
    if (adminIndex !== -1) {
        admins[adminIndex].lastLogin = new Date().toISOString();
        await fs.writeFile(adminFile, JSON.stringify(admins, null, 2));
    }
}
```

### 3. Status Management
Admins can be set to `active` or `inactive` status. Inactive admins cannot login.

```javascript
// Check if admin is active
if (admin.status !== 'active') {
    return res.status(403).json({ 
        success: false,
        message: 'Account is inactive' 
    });
}
```

### 4. Multiple Admin Support
The system supports multiple admin accounts in the same file.

```json
[
  {
    "id": "ADMIN_001",
    "userName": "Chiazagom Freedom",
    "userEmail": "freedom@email.com",
    ...
  },
  {
    "id": "ADMIN_002",
    "userName": "Another Admin",
    "userEmail": "admin2@email.com",
    ...
  }
]
```

## API Endpoints

### GET /api/admins (Protected)
Get list of all admins (requires admin authentication).

**Response:**
```json
{
    "success": true,
    "admins": [
        {
            "id": "ADMIN_001",
            "userName": "Chiazagom Freedom",
            "userEmail": "freedom@email.com",
            "role": "admin",
            "status": "active",
            "createdAt": "2026-02-18T00:00:00.000Z",
            "lastLogin": "2026-02-18T10:30:00.000Z"
        }
    ]
}
```

**Note:** Passwords are never returned in API responses.

## Login Flow

### Frontend (Secure)
1. User enters credentials in login form
2. Frontend sends request to `/submit-form` (tries admin login first)
3. If admin login succeeds → Redirect to `/admin`
4. If admin login fails → Try regular user login at `/api/login`
5. If user login succeeds → Show welcome message
6. If both fail → Show error message

**No admin email is exposed in frontend code!**

### Backend
1. Receive login request
2. Read `admin.json` file
3. Find admin by email (case-insensitive)
4. Check if admin status is active
5. Verify password with bcrypt
6. Update last login timestamp
7. Create admin session
8. Return success response

## Adding New Admin

### Method 1: Manually Edit admin.json
1. Generate password hash:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('NewPassword123', 10).then(hash => console.log(hash));"
```

2. Add new admin to `admin.json`:
```json
{
    "id": "ADMIN_002",
    "userName": "New Admin Name",
    "userEmail": "newadmin@email.com",
    "userPassword": "GENERATED_HASH_HERE",
    "role": "admin",
    "createdAt": "2026-02-18T00:00:00.000Z",
    "lastLogin": null,
    "status": "active"
}
```

3. Restart server

### Method 2: Create Admin Management API (Future Enhancement)
```javascript
// POST /api/admins/create (requires super admin)
app.post('/api/admins/create', requireSuperAdmin, async (req, res) => {
    const { userName, userEmail, password } = req.body;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new admin
    const newAdmin = {
        id: generateAdminId(),
        userName,
        userEmail,
        userPassword: hashedPassword,
        role: 'admin',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        status: 'active'
    };
    
    // Add to file
    // ...
});
```

## Security Benefits

### 1. No Frontend Exposure
- Admin email not visible in client-side code
- Attackers can't identify admin accounts
- Reduces targeted attacks

### 2. Centralized Admin Management
- All admin data in one file
- Easy to backup and restore
- Simple to audit

### 3. Status Control
- Quickly disable admin accounts
- No code changes needed
- Immediate effect

### 4. Login Tracking
- Monitor admin activity
- Detect suspicious logins
- Audit trail

## File Location

```
project/
├── admin.json          ← Admin credentials (KEEP SECURE!)
├── users.json          ← Regular user data
├── bookings.json       ← Booking data
├── views.json          ← View tracking
├── login.js            ← Admin authentication logic
└── ...
```

## Security Best Practices

### 1. File Permissions
```bash
# Linux/Mac - Restrict access to admin.json
chmod 600 admin.json
chown www-data:www-data admin.json
```

### 2. Gitignore
Add to `.gitignore`:
```
admin.json
*.json
!package.json
!package-lock.json
```

### 3. Backup
```bash
# Regular backups
cp admin.json admin.json.backup
```

### 4. Environment Variables
For production, consider using environment variables:
```javascript
const defaultAdmin = [{
    userName: process.env.ADMIN_NAME,
    userEmail: process.env.ADMIN_EMAIL,
    userPassword: process.env.ADMIN_PASSWORD_HASH,
    ...
}];
```

## Troubleshooting

### Admin can't login?
1. Check `admin.json` exists
2. Verify email is correct (case-insensitive)
3. Check password hash is correct
4. Verify status is "active"
5. Check server logs for errors

### File not found error?
- Server will auto-create `admin.json` on startup
- Check file permissions
- Verify server has write access to directory

### Password doesn't work?
1. Generate new hash:
```bash
node password.js
```
2. Copy hash to `admin.json`
3. Restart server

## Migration from Hardcoded Admin

**Old System (login.js):**
```javascript
const admin = {
    userName: 'Chiazagom Freedom',
    userEmail: 'freedom@email.com',
    userPassword: '$2b$10$...',
    role: 'admin'
};
```

**New System (admin.json):**
```json
[{
    "id": "ADMIN_001",
    "userName": "Chiazagom Freedom",
    "userEmail": "freedom@email.com",
    "userPassword": "$2b$10$...",
    "role": "admin",
    "createdAt": "2026-02-18T00:00:00.000Z",
    "lastLogin": null,
    "status": "active"
}]
```

## Files Modified

1. **login.js** - Complete rewrite to use file-based system
2. **public/logic.js** - Removed hardcoded admin email check
3. **admin.json** - New file for admin storage

## Testing

Test admin login:
```bash
curl -X POST http://localhost:9000/submit-form \
  -F "name=Chiazagom Freedom" \
  -F "email=freedom@email.com" \
  -F "password=freeman419"
```

Expected response:
```json
{"success": true}
```

## Future Enhancements

- Admin management UI in dashboard
- Role-based permissions (super admin, moderator)
- Admin activity logs
- Password reset functionality
- Two-factor authentication
- Email notifications for admin logins
- IP whitelist for admin access