# Admin Access Guide

## Issue Fixed
The inbox and analytics pages were trying to load data without authentication. Now they check if you're logged in first and redirect to login if needed.

## How to Access Admin Pages

### Step 1: Login
1. Go to `http://localhost:9000/admin/login.html`
2. Enter your admin credentials:
   - **Email**: `freedom@email.com`
   - **Password**: `freeman419`
3. Click "Login"

### Step 2: Access Admin Pages
After successful login, you can access:
- **Dashboard**: `http://localhost:9000/admin/` or `http://localhost:9000/admin/index.html`
- **Inbox**: `http://localhost:9000/admin/inbox.html`
- **Analytics**: `http://localhost:9000/admin/analytics.html`
- **Projects**: `http://localhost:9000/admin/projects.html`
- **Settings**: `http://localhost:9000/admin/settings.html`

## What Was Fixed

### 1. Inbox Page (`admin/inbox-logic.js`)
- Added `checkAuth()` function that verifies admin session
- Redirects to login page if not authenticated
- Only loads messages after authentication is confirmed

### 2. Analytics Page (`admin/analytics.html`)
- Added `checkAuth()` function
- Redirects to login page if not authenticated
- Only loads statistics after authentication is confirmed

### 3. API Endpoints
All admin endpoints require authentication:
- `/api/messages` - Get all messages
- `/api/messages/:id` - Get single message
- `/api/messages/:id/read` - Mark as read
- `/api/messages/:id/delete` - Delete message
- `/api/bookings` - Get all bookings
- `/api/users` - Get all users

## Testing Steps

1. **Test Without Login**:
   - Go directly to `http://localhost:9000/admin/inbox.html`
   - You should be redirected to login page

2. **Test With Login**:
   - Login at `http://localhost:9000/admin/login.html`
   - Go to `http://localhost:9000/admin/inbox.html`
   - You should see your messages

3. **Test Analytics**:
   - After login, go to `http://localhost:9000/admin/analytics.html`
   - You should see views, users, and bookings statistics

## Browser Console Logs

Open browser console (F12) to see detailed logs:
- Authentication check results
- API response status codes
- Data loading progress
- Any errors

## Troubleshooting

### "Admin authentication required" error
- **Cause**: Not logged in or session expired
- **Solution**: Login again at `/admin/login.html`

### Redirected to login page immediately
- **Cause**: No active admin session
- **Solution**: This is correct behavior - login first

### Messages still not showing after login
1. Open browser console (F12)
2. Check for error messages
3. Verify you're logged in: Go to `/api/admin/status` - should show `isAdmin: true`
4. Check if messages exist: Look at `messages.json` file

### Analytics showing "Error"
1. Check browser console for specific error
2. Verify authentication
3. Check if data files exist:
   - `views.json`
   - `users.json`
   - `bookings.json`

## Session Management

- Sessions last for 1 hour (configured in `app.js`)
- After 1 hour, you'll need to login again
- Closing browser may end session (depends on browser settings)

## Security Notes

- All admin pages now check authentication
- API endpoints are protected with session middleware
- Unauthorized access attempts are logged
- Sessions use secure cookies in production

## Next Steps

1. Login to admin panel
2. Navigate to inbox to see contact messages
3. Navigate to analytics to see statistics
4. All data should now load properly!
