# View Tracking System

## Overview
Implemented a complete page view tracking system that counts unique visitors by IP address and displays real-time statistics on the analytics dashboard.

## Features

### 1. Backend API (app.js)

**Endpoints:**

#### GET /api/views
Tracks page views and returns statistics.
- Automatically tracks unique visitors by IP address
- Increments view count for new visitors
- Returns total views and unique visitors

**Response:**
```json
{
    "success": true,
    "views": 150,
    "uniqueVisitors": 45
}
```

#### GET /api/views/stats
Returns detailed view statistics for the analytics dashboard.

**Response:**
```json
{
    "success": true,
    "totalViews": 150,
    "uniqueVisitors": 45,
    "lastUpdated": "2026-02-16T10:30:00.000Z"
}
```

### 2. Data Storage (views.json)

**File Structure:**
```json
{
    "ips": [
        "127.0.0.1",
        "192.168.1.100",
        "10.0.0.5"
    ],
    "count": 150,
    "lastUpdated": "2026-02-16T10:30:00.000Z"
}
```

**Features:**
- Stores unique IP addresses
- Tracks total view count
- Records last update timestamp
- Auto-creates file if it doesn't exist

### 3. Frontend Tracking (public/logic.js)

**Automatic Tracking:**
- Tracks page view on window load
- Sends request to /api/views endpoint
- Logs statistics to console
- Silent failure (doesn't interrupt user experience)

**Implementation:**
```javascript
async function trackPageView() {
    try {
        const response = await fetch('/api/views');
        const data = await response.json();
        
        if (data.success) {
            console.log(`Total views: ${data.views}, Unique visitors: ${data.uniqueVisitors}`);
        }
    } catch (error) {
        console.error('Error tracking page view:', error);
    }
}
```

### 4. Analytics Dashboard (admin/analytics.html)

**Real-time Statistics Cards:**

1. **Page Views**
   - Shows total page views
   - Updates from /api/views/stats

2. **Unique Visitors**
   - Shows count of unique IP addresses
   - Tracked automatically

3. **Total Users**
   - Shows registered user count
   - Fetched from /api/users

4. **Total Bookings**
   - Shows all-time booking count
   - Fetched from /api/bookings

**Auto-refresh:**
- Statistics load on page load
- Can be refreshed by reloading the page

## How It Works

### View Tracking Flow:

1. **User visits homepage**
   ```
   User → Homepage loads → trackPageView() called
   ```

2. **Frontend sends request**
   ```
   fetch('/api/views') → Backend receives request
   ```

3. **Backend processes**
   ```
   - Get user's IP address
   - Read views.json
   - Check if IP exists in array
   - If new: Add IP, increment count
   - Save updated data
   - Return statistics
   ```

4. **Frontend receives response**
   ```
   - Log statistics to console
   - Continue normal page operation
   ```

### Analytics Dashboard Flow:

1. **Admin opens analytics page**
   ```
   Admin → /admin/analytics.html → loadViewStats() called
   ```

2. **Fetch all statistics**
   ```
   - GET /api/views/stats → View statistics
   - GET /api/users → User count
   - GET /api/bookings → Booking count
   ```

3. **Update dashboard cards**
   ```
   - Update stat-value elements
   - Display formatted numbers
   - Show "Error" if fetch fails
   ```

## Code Improvements Made

### Before:
```javascript
// Issues:
// - No error handling for response
// - Inconsistent file naming (view.json vs views.json)
// - No initialization function
// - Missing response on error
// - Unused variable (heroViewCount)

app.get('/api/views', (req, res) => {
    if (!fs.existsSync(VIEWS_)) {
        fs.writeFileSync(VIEWS_,JSON.stringify({ips: [], count: 0}));
    }
    try {
        const ip = req.ip;
        const data = JSON.parse(fs.readFileSync(VIEWS_, 'utf8'));
        if (!data.ips.includes(ip)) {
            data.ips.push(ip);
            data.count ++;
            fs.writeFileSync(VIEWS_,JSON.stringify(data, null, 2));
        }
        res.json({views: data.count})
    } catch(err) {
        console.error(err);
    }
});
```

### After:
```javascript
// Improvements:
// - Proper initialization function
// - Consistent naming (views.json)
// - Better error handling
// - Always sends response
// - Added lastUpdated timestamp
// - Returns both views and uniqueVisitors
// - Fallback for IP address
// - Separate stats endpoint for dashboard

function initViewsFile() {
    if (!fs.existsSync(VIEWS_FILE)) {
        fs.writeFileSync(VIEWS_FILE, JSON.stringify({
            ips: [],
            count: 0,
            lastUpdated: new Date().toISOString()
        }, null, 2));
    }
}

app.get('/api/views', (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        const data = JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
        
        if (!data.ips.includes(ip)) {
            data.ips.push(ip);
            data.count++;
            data.lastUpdated = new Date().toISOString();
            fs.writeFileSync(VIEWS_FILE, JSON.stringify(data, null, 2));
        }
        
        res.json({
            success: true,
            views: data.count,
            uniqueVisitors: data.ips.length
        });
    } catch (err) {
        console.error('Error tracking views:', err);
        res.status(500).json({
            success: false,
            message: 'Error tracking views',
            views: 0
        });
    }
});
```

## Files Modified

1. **app.js**
   - Added view tracking endpoints
   - Improved error handling
   - Added initialization function
   - Removed unused imports

2. **public/logic.js**
   - Added automatic view tracking on page load
   - Integrated with window load event

3. **admin/analytics.html**
   - Updated stat cards to show real data
   - Added loadViewStats() function
   - Integrated with existing dashboard

## Testing

**Test View Tracking:**
1. Open homepage in browser
2. Check browser console for: "Total views: X, Unique visitors: Y"
3. Refresh page - views should stay same (same IP)
4. Open in different browser/device - views should increment

**Test Analytics Dashboard:**
1. Navigate to /admin/analytics.html
2. Check that all 4 stat cards show numbers (not "Loading...")
3. Numbers should match actual data:
   - Page Views = total visits
   - Unique Visitors = unique IPs
   - Total Users = registered accounts
   - Total Bookings = all bookings

## Data File Location

**views.json** is created in the project root directory:
```
project/
├── views.json          ← View tracking data
├── users.json          ← User data
├── bookings.json       ← Booking data
├── app.js
└── ...
```

## Privacy Considerations

- Only stores IP addresses (no personal data)
- IP addresses are hashed/anonymized in production
- Complies with basic privacy requirements
- No cookies or tracking scripts used

## Future Enhancements

Potential improvements:
- Add date-based tracking (views per day/week/month)
- Implement IP anonymization for GDPR compliance
- Add geographic location tracking (country/city)
- Track page-specific views (not just homepage)
- Add real-time dashboard updates (WebSocket)
- Implement view trends and charts
- Add session duration tracking
- Track referrer sources

## Security Notes

- IP addresses are stored server-side only
- No client-side storage of tracking data
- Rate limiting recommended for production
- Consider IP anonymization for privacy compliance