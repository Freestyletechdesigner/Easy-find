# Agent Property Upload API Documentation

## Overview
This document provides a complete guide to implementing and debugging the Agent Property Upload API endpoint. This API allows authenticated agents to post property listings with images, details, and features.

---

## API Endpoint

**URL:** `/api/agent/post`  
**Method:** `POST`  
**Content-Type:** `multipart/form-data`  
**Authentication:** Required (Session-based)

---

## Request Parameters

### Form Data Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `file` | File[] | Yes | Multiple images allowed | Property images (PNG, JPG, GIF) |
| `title` | String | Yes | Not empty, trimmed, escaped | Property title |
| `price` | Number | Yes | Numeric | Property price in dollars |
| `location` | String | Yes | Not empty, trimmed, escaped | City, State format |
| `beds` | Number | Yes | Numeric | Number of bedrooms |
| `baths` | Number | Yes | Numeric | Number of bathrooms |
| `area` | Number | No | - | Property area in square feet |
| `description` | String | No | - | Detailed property description |
| `features` | String | No | - | Comma-separated features list |
| `type` | String | No | - | Property type (house, apartment, villa, commercial) |

---

## Current Code Issues & Fixes Needed

### 🔴 Critical Issues

1. **Typo in Variable Name**
   - **Line:** `prince,` should be `price,`
   - **Impact:** Property price won't be saved correctly
   - **Location:** Line in destructuring assignment

2. **Wrong File Access Method**
   - **Issue:** Using `req.file.filename` instead of `req.files`
   - **Impact:** Only saves one image instead of multiple
   - **Current:** `const imageName = path.join(__dirname, 'agent-loged', 'upload-property', req.file.filename);`
   - **Should be:** Loop through `req.files` array since `upload.array('file')` is used

3. **Validation Error Check Logic**
   - **Issue:** `if (!errors.notEmpty())` is incorrect
   - **Impact:** Validation errors are not properly caught
   - **Should be:** `if (!errors.isEmpty())`

4. **Response Data References Wrong Object**
   - **Issue:** Response uses `data.title`, `data.price`, etc. instead of `newPost`
   - **Impact:** Returns undefined values or wrong data
   - **Location:** Final `res.json()` block

5. **Typo in Response Field**
   - **Issue:** `postLocation: data.loction` (missing 'a')
   - **Impact:** Location data won't be returned correctly

6. **Deprecated Method Usage**
   - **Issue:** `.substr()` is deprecated
   - **Should use:** `.substring()` or `.slice()`
   - **Location:** `Math.random().toString(24).substr(2, 9)`

7. **Missing Authentication Check**
   - **Issue:** No check if `req.session.agent` exists before accessing `req.session.agent.id`
   - **Impact:** Will crash if user is not authenticated
   - **Location:** `filename` callback in multer storage

8. **Image Path Storage Issue**
   - **Issue:** Storing full server path instead of relative web path
   - **Impact:** Images won't be accessible from frontend
   - **Should store:** Relative path like `/agent-loged/upload-property/filename.jpg`

---

## File Upload Configuration

### Storage Configuration
- **Destination:** `agent-loged/upload-property/`
- **Filename Format:** `{agentId}_{timestamp}{extension}`
- **Example:** `AGENT_123_1234567890.jpg`

### File Filtering
- **Forbidden Extensions:** `.exe`, `.bat`, `.cmd`
- **Allowed:** All other file types (should be restricted to images only)
- **Recommendation:** Add explicit image type validation

### Multer Setup
```
upload.array('file') - Accepts multiple files with field name 'file'
```

---

## Data Storage

### JSON File Location
- **Path:** `post-property.json` (root directory)
- **Structure:** Array of property objects

### Property Object Schema
```json
{
  "id": "timestamp_randomstring",
  "title": "Property title",
  "price": "numeric value",
  "location": "City, State",
  "beds": "number",
  "baths": "number",
  "area": "number",
  "description": "text",
  "features": "comma-separated string",
  "imageNames": "file path or array",
  "date": "timestamp"
}
```

---

## Validation Rules

### Express-Validator Checks
1. **title:** Not empty, trimmed, escaped
2. **price:** Must be numeric
3. **location:** Not empty, trimmed, escaped
4. **beds:** Must be numeric, trimmed, escaped
5. **baths:** Must be numeric, trimmed, escaped
6. **area:** No validation (optional)
7. **description:** No validation (optional)
8. **features:** No validation (optional)

### Issues with Current Validation
- `beds` and `baths` shouldn't use `.trim().escape()` on numeric values
- Missing file upload validation
- No max/min value checks for numeric fields
- No string length limits

---

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "postTitle": "property title",
  "postPrice": "price value",
  "postBeds": "beds count",
  "postBaths": "baths count",
  "postArea": "area value",
  "postDescription": "description text",
  "postLocation": "location string",
  "postFeatures": "features list",
  "postImages": "image paths",
  "postTime": "timestamp"
}
```

### Error Response (422)
```json
{
  "success": false,
  "message": "Validation failed"
}
```

---

## Security Considerations

### Current Issues
1. **No file size limit** - Could allow very large uploads
2. **Weak file type validation** - Only blocks executables, not restricting to images
3. **No authentication middleware** - Relies on session check in filename callback
4. **Path traversal risk** - No validation of file paths
5. **No rate limiting** - Could be abused for spam

### Recommendations
1. Add explicit authentication middleware before route handler
2. Restrict file types to images only: `['image/jpeg', 'image/png', 'image/gif', 'image/webp']`
3. Add file size limit: `limits: { fileSize: 5 * 1024 * 1024 }` (5MB)
4. Validate all numeric inputs have reasonable ranges
5. Sanitize file names to prevent path traversal
6. Add rate limiting per agent

---

## Frontend Integration

### Form Submission
- **Form ID:** `propertyForm`
- **Enctype:** `multipart/form-data`
- **File Input:** Multiple file selection enabled
- **Submit Handler:** `submitProperty()` function

### Expected Frontend Behavior
1. Collect form data including multiple images
2. Create FormData object
3. Append all fields and files
4. Send POST request to `/api/agent/post`
5. Handle success/error responses
6. Display confirmation or error messages

---

## Testing Checklist

### Functional Tests
- [ ] Upload property with all required fields
- [ ] Upload property with multiple images
- [ ] Upload property with optional fields empty
- [ ] Verify validation errors for missing required fields
- [ ] Verify validation errors for invalid data types
- [ ] Test with unauthenticated user
- [ ] Test with forbidden file types
- [ ] Verify data is saved to JSON file correctly
- [ ] Verify images are saved to correct folder
- [ ] Verify response contains correct data

### Edge Cases
- [ ] Upload with no images
- [ ] Upload with very large images
- [ ] Upload with special characters in title/description
- [ ] Upload with negative numbers for beds/baths
- [ ] Upload with extremely long strings
- [ ] Concurrent uploads from same agent
- [ ] Upload when JSON file doesn't exist

---

## Debugging Guide

### Common Errors

**Error: "Cannot read property 'filename' of undefined"**
- **Cause:** Using `req.file` instead of `req.files` for multiple uploads
- **Fix:** Change to `req.files` and loop through array

**Error: "Validation failed" but no specific errors shown**
- **Cause:** Validation check logic is inverted
- **Fix:** Change `!errors.notEmpty()` to `!errors.isEmpty()`

**Error: "Cannot read property 'id' of undefined"**
- **Cause:** `req.session.agent` doesn't exist (user not authenticated)
- **Fix:** Add authentication check before accessing session

**Images not displaying on frontend**
- **Cause:** Storing full server path instead of web-accessible path
- **Fix:** Store relative path and ensure static file serving is configured

**Response returns undefined values**
- **Cause:** Response references `data` object instead of `newPost`
- **Fix:** Change all `data.field` to `newPost.field` in response

---

## Required Fixes Summary

### High Priority (Breaking Issues)
1. Fix `prince` → `price` typo
2. Fix `req.file` → `req.files` for multiple images
3. Fix validation check: `!errors.notEmpty()` → `!errors.isEmpty()`
4. Fix response data references: `data.field` → `newPost.field`
5. Fix typo: `data.loction` → `data.location`
6. Add authentication check before accessing `req.session.agent.id`

### Medium Priority (Improvements)
1. Replace deprecated `.substr()` with `.substring()`
2. Store relative image paths instead of absolute paths
3. Add proper image type validation
4. Add file size limits
5. Remove `.trim().escape()` from numeric validations
6. Add authentication middleware

### Low Priority (Enhancements)
1. Add rate limiting
2. Add more detailed error messages
3. Add logging for debugging
4. Add input range validation
5. Add transaction-like behavior for file cleanup on errors

---

## Related Files

- **Backend:** `agent-upload.js` - Main API implementation
- **Frontend:** `agent-loged/logic.js` - Form submission handler
- **Frontend:** `agent-loged/index.html` - Property upload form
- **Data:** `post-property.json` - Property listings storage
- **Server:** `app.js` - Express app configuration

---

## Next Steps

1. Fix all critical issues listed above
2. Add comprehensive error handling
3. Implement proper authentication middleware
4. Add file type and size validation
5. Test all edge cases
6. Add logging for monitoring
7. Consider migrating to database instead of JSON file
8. Add image optimization/resizing
9. Implement property editing and deletion endpoints

---

*Last Updated: [Current Date]*  
*Status: Issues Identified - Fixes Pending*