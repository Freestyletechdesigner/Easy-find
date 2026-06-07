# EasyFind Platform — Full Technical Documentation

> Real Estate Platform for Enugu State, Nigeria  
> Domain: https://easyfind.com.ng  
> Stack: Node.js · Express · MongoDB Atlas · Nodemailer · Paystack · Gemini AI

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Environment Variables](#3-environment-variables)
4. [Database Models](#4-database-models)
5. [API Reference](#5-api-reference)
   - [Authentication — Users](#51-authentication--users)
   - [Authentication — Agents](#52-authentication--agents)
   - [Authentication — Admin](#53-authentication--admin)
   - [Properties](#54-properties)
   - [AI Property Search](#55-ai-property-search)
   - [Agent Search](#56-agent-search)
   - [Boost & Payments](#57-boost--payments)
   - [Agent Verification (NIN)](#58-agent-verification-nin)
   - [Feedback](#59-feedback)
   - [Contact / Inbox](#510-contact--inbox)
   - [Property Reports](#511-property-reports)
   - [Analytics / Views](#512-analytics--views)
6. [AI Systems](#6-ai-systems)
   - [Property NLP Parser](#61-property-nlp-parser)
   - [Agent TF-IDF Search Engine](#62-agent-tf-idf-search-engine)
7. [Email System (OTP Mailer)](#7-email-system-otp-mailer)
8. [Password Reset Flow](#8-password-reset-flow)
9. [Boost System](#9-boost-system)
10. [Image Upload & Processing](#10-image-upload--processing)
11. [Admin Panel](#11-admin-panel)
12. [Agent Dashboard](#12-agent-dashboard)
13. [Frontend Pages](#13-frontend-pages)
14. [WebSocket — Live Property Feed](#14-websocket--live-property-feed)
15. [Security](#15-security)
16. [Deployment Checklist](#16-deployment-checklist)

---

## 1. Project Overview

EasyFind is a full-stack real estate web platform where **property agents** list properties and **users** browse, search, and contact agents. Key capabilities:

- Agents sign up, list properties with photos, and manage their profiles
- Users search properties using natural language AI ("2 bedroom flat in GRA under 2 million")
- Agents can boost their profile or individual listings via Paystack payment
- Agents can get NIN-verified to earn a "Verified Agent" badge
- Admin manages agents, reports, analytics, and inbox from a dashboard
- Password reset via OTP sent to the agent's registered email

---

## 2. Project Structure

```
web e/
├── app.js                  — Express app entry point
├── db.js                   — MongoDB Atlas connection
├── create-admin.js         — One-time admin account creation script
├── .env                    — Environment variables (never commit)
│
├── ai/
│   ├── property-parser.js  — NLP parser: text → structured MongoDB filters
│   └── search-engine.js    — TF-IDF vector engine for agent search
│
├── routes/
│   ├── agent.js            — Agent auth, profile, admin management
│   ├── agent-upload.js     — Property CRUD + Gemini AI description
│   ├── agent-search-engine.js — Agent name search (simple regex)
│   ├── agent-profile-upload.js — Profile picture upload
│   ├── agent-verification.js   — NIN verification + Paystack payment
│   ├── property-search.js  — AI property search endpoint
│   ├── payment-for-boost.js — Boost payments via Paystack
│   ├── feedback.js         — Public feedback submission
│   ├── message.js          — Contact form inbox
│   ├── property-report.js  — Property report/flag system
│   ├── signup.js           — User signup/login/admin login
│   └── view-post.js        — Property view counter
│
├── model/
│   ├── AgentUser.js        — Agent account schema
│   ├── AgentPost.js        — Property listing schema
│   ├── ADMIN.js            — Admin account schema
│   ├── User.js             — Regular user schema
│   ├── Feedback.js         — Feedback schema
│   ├── message.js          — Contact message schema
│   ├── PageViews.js        — Daily page view counter
│   ├── PropertyReport.js   — Property report schema
│   └── VisitorLog.js       — Unique visitor tracking
│
├── utils/
│   └── sms.js              — Nodemailer OTP email sender
│
├── public/                 — Public-facing frontend
│   ├── index.html          — Homepage (property feed + AI search)
│   ├── signup-agent.html   — Agent registration
│   ├── login-agent.html    — Agent login
│   ├── our-agent.html      — Verified agents listing
│   ├── contact.html        — Contact form
│   ├── style.css           — Global styles
│   └── logic/logic.js      — All homepage JavaScript
│
├── admin/                  — Admin panel (protected)
├── agent-loged/            — Agent dashboard (post-login)
├── password-reset/         — 4-page password reset flow
├── boost-account/          — Boost payment page
├── agent-verification/     — NIN verification page
└── verification-payment/   — Verification payment page
```

---

## 3. Environment Variables

File: `.env` (root of project)

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | `development` or `production` | `production` |
| `SESSION_SECRET` | Random secret for express-session | `a50e720698...` |
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster...` |
| `PAYSTACK_SECRET_KEY` | Paystack secret key | `sk_live_xxx` or `sk_test_xxx` |
| `GEMINI_API_KEY` | Google Gemini API key for AI descriptions | `AQ.Ab8RN6...` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `764343...apps.googleusercontent.com` |
| `MAIL_HOST` | cPanel mail server hostname | `mail.easyfind.com.ng` |
| `MAIL_PORT` | SMTP port | `465` |
| `MAIL_USERNAME` | Full email address | `support@easyfind.com.ng` |
| `MAIL_PASSWORD` | Email account password | `yourpassword` |
| `APP_URL` | Comma-separated allowed origins | `https://easyfind.com.ng,https://www.easyfind.com.ng` |

> ⚠️ Never commit `.env` to git. It is listed in `.gitignore`.

---

## 4. Database Models

### AgentUser
| Field | Type | Description |
|---|---|---|
| `name` | String | Full name |
| `email` | String (unique) | Login email |
| `password` | String (hashed) | bcrypt hashed |
| `number` | String (unique) | Phone number |
| `profilePicture` | String | File path |
| `status` | String | `active` / `inactive` / `suspended` |
| `stand` | String | `Not verified` / `Verified Agent` |
| `bio` | String | Agent description |
| `boostAccount` | Boolean | Account boost active |
| `boostAccountExpiry` | Date | Boost expiry |
| `verifyPayment` | Boolean | NIN verification payment done |
| `isVerified` | Boolean | NIN face-match verified |
| `verificationData` | Object | NIMC data (name, DOB, photos) |
| `isBlacklisted` | Boolean | Scam flag |

### AgentPost
| Field | Type | Description |
|---|---|---|
| `agentId` | String | Owner's agent ID |
| `title` | String | Property title |
| `type` | Enum | `house` / `apartment` / `land` / `villa` / `commercial` |
| `category` | Enum | `sale` / `rent` / `shortlet` |
| `price` | Number | Price in Naira |
| `location` | String | Location description |
| `beds` | Number | Bedroom count |
| `baths` | Number | Bathroom count |
| `area` | String | Plot/floor area |
| `description` | String | AI-generated or manual description |
| `features` | [String] | Amenities list |
| `imageNames` | [String] | Uploaded image filenames (.webp) |
| `latitude` / `longitude` | Number | Map coordinates |
| `boostPost` | Boolean | Post boost active |
| `boostPostExpiry` | Date | Post boost expiry |
| `view` | Number | View count |

---

## 5. API Reference

All routes return JSON with `{ success: true/false, ... }`.

---

### 5.1 Authentication — Users

#### `POST /api/signup`
Register a new regular user.

**Body (form-urlencoded):**
```
name, email, number, password
```

**Response:**
```json
{ "success": true, "message": "Account created successfully!" }
```

---

#### `POST /api/login`
Login as user or admin.

**Body:**
```json
{ "email": "user@example.com", "password": "Password1!" }
```
Or with Google:
```json
{ "googleToken": "<google_id_token>" }
```

**Response:**
```json
{ "success": true, "user": { "id": "...", "name": "...", "email": "..." } }
```

---

#### `POST /api/logout`
Destroy session and clear cookie.

---

#### `GET /api/user/profile`
Get current logged-in user profile. Requires user session.

---

#### `POST /api/reset-password`
Change password (requires knowing current password).

**Body:**
```json
{ "email": "...", "currentPassword": "...", "newPassword": "..." }
```

---

### 5.2 Authentication — Agents

#### `POST /api/agent/signup`
Register a new agent account.

**Body (form-urlencoded):**
```
firstName, lastName, email, phone, password, bio (optional)
```

Password rules: 8+ chars, uppercase, lowercase, number, symbol.

---

#### `POST /api/agent/login`
Login as agent (password or Google OAuth).

**Body:**
```json
{ "email": "agent@example.com", "password": "Pass1!abc" }
```

---

#### `POST /api/agent/logout`
Destroy agent session.

---

#### `GET /api/agent/profile`
Get logged-in agent's full profile. Requires agent session.

---

#### `POST /api/update/bio`
Update agent bio (max 300 chars). Requires agent session.

---

#### `PATCH /api/agent/settings/name`
Update agent display name.

---

#### `PATCH /api/agent/settings/password`
Change agent password (requires current password).

---

#### `DELETE /api/agent/settings/delete`
Delete agent account and all their properties.

---

#### `POST /api/agent/send-code`
Send OTP to agent's registered email for password reset.

**Body:**
```json
{ "email": "agent@example.com" }
```

---

#### `POST /api/agent/verify-otp`
Verify the OTP code.

**Body:**
```json
{ "otp": "123456" }
```

---

#### `POST /api/agent/reset-password`
Set new password after OTP verified.

**Body:**
```json
{ "newPassword": "NewPass1!" }
```

---

#### `GET /api/agent/public/:id`
Get a public agent profile by ID (name, photo, bio, stand, phone, joined date).

---

#### `GET /api/agents/verified`
List all verified agents (paginated, 8 per page).

**Query:** `?page=1`

---

### 5.3 Authentication — Admin

#### `POST /api/login`
Same endpoint as users. If email matches an admin account, sets admin session.

---

#### `GET /api/admin/session`
Check if admin session is active.

---

#### `POST /api/admin/logout`
Destroy admin session.

---

#### `GET /api/admin/status`
Confirm admin authentication. Returns role.

---

#### `GET /api/admin/agents`
List all agents with property counts. Admin only.

---

#### `PATCH /api/admin/agents/:id`
Update agent `stand` (Not verified / Verified Agent) or `status`. Admin only.

**Body:**
```json
{ "stand": "Verified Agent", "status": "active" }
```

---

### 5.4 Properties

#### `POST /api/agent/post`
Upload a new property listing. Requires agent session.

**Form-data fields:**
```
title, type, category, price, location, beds, baths, area,
description, features, latitude, longitude, file (images, up to 10)
```

Images are compressed, watermarked, and saved as `.webp`.

---

#### `GET /api/post/property`
Get the public property feed (up to 20 listings, boosted posts first).

---

#### `GET /api/agent/property`
Get properties belonging to logged-in agent (paginated).

**Query:** `?page=1`

---

#### `GET /api/view/property/:id`
Get a single property by ID.

---

#### `PATCH /api/edit/post/:id`
Edit an existing property. Requires agent session + ownership.

---

#### `DELETE /api/agent/property/:id`
Delete a property. Requires agent session + ownership. Also deletes images.

---

#### `GET /api/get/postForPublicAgentProfile/:id`
Get all properties for a public agent profile (paginated).

---

#### `GET /api/property/related/:id`
Get related properties (same type, location, price, beds, or category).

---

#### `POST /api/view/post/:id/view`
Increment view count for a property (rate limited: 10/min per IP).

---

#### `GET /api/agent/views`
Get total views across all of logged-in agent's properties.

---

#### `POST /api/ai/generate-description`
Generate a property description using Google Gemini AI. Requires agent session.

**Body:**
```json
{
  "title": "3 Bedroom Duplex",
  "type": "house",
  "category": "sale",
  "price": 45000000,
  "location": "GRA, Enugu",
  "beds": 3,
  "baths": 3,
  "features": "swimming pool, CCTV, 24hr security"
}
```

**Response:**
```json
{ "success": true, "description": "Nestled in the prestigious GRA..." }
```

---

### 5.5 AI Property Search

#### `GET /api/search/property?q=<query>`
Natural language property search.

**Examples:**
```
?q=2 bedroom flat in GRA under 2 million
?q=affordable land for sale in Enugu
?q=shortlet apartment new haven
?q=3 bed house for rent below 500k
```

**Response:**
```json
{
  "success": true,
  "properties": [...],
  "parsed": {
    "type": "apartment",
    "category": "rent",
    "minBeds": 3,
    "maxBeds": 3,
    "maxPrice": 500000,
    "location": "new haven"
  },
  "total": 7
}
```

The `parsed` object shows what the AI understood from the query. Displayed as colour-coded badges in the UI.

**Fallback:** If no structured results found, falls back to keyword text search on location/title/description.

---

### 5.6 Agent Search

#### `GET /api/search/agent?q=<name>`
Simple partial name match — only searches active agents by name.

```
?q=John → finds "John Doe", "Johnson Realty"
?q=Freedom → finds "Freedom Onwumere"
?q=property dealer → no match (not a name)
```

**Response:**
```json
{
  "success": true,
  "agents": [
    { "_id": "...", "name": "Freedom", "stand": "Verified Agent", "profilePicture": "..." }
  ]
}
```

---

#### `GET /api/search/status`
Check if search is running.

---

### 5.7 Boost & Payments

#### Boost Packages
| Plan | Price | Duration |
|---|---|---|
| `post` | ₦950 | 3 days |
| `profile` | ₦3,500 | 30 days |

#### `POST /api/payment-boost`
Initialize a Paystack payment for boosting. Requires agent session.

**Body:**
```json
{ "email": "agent@example.com", "plan": "profile", "postId": "optional" }
```

**Response:**
```json
{ "success": true, "data": { "authorization_url": "https://paystack.com/...", "reference": "..." } }
```

---

#### `GET /api/payment-boost/verify?reference=<ref>`
Verify Paystack payment after redirect. Activates boost in DB.

---

#### `POST /api/paystack-webhook`
Paystack webhook for background boost activation. Validates HMAC signature.

---

#### Boost Expiry Cron Job
Runs daily at midnight. Automatically expires all overdue boosts.

---

### 5.8 Agent Verification (NIN)

#### `POST /api/verification/initialize-payment`
Initialize Paystack payment for NIN verification (₦3,000). Requires agent session.

---

#### Paystack Redirect — `GET /agent-verification`
Called by Paystack after payment. Verifies payment directly with Paystack API, updates `verifyPayment: true`, redirects to verification page.

---

#### `POST /api/verification/webhook`
Paystack webhook backup for verification payment. Updates DB if redirect missed.

---

#### `POST /complete-verification`
Submit NIN verification result from Dojah. Updates `isVerified: true`, `stand: "Verified Agent"`. Requires agent session + payment verified.

---

### 5.9 Feedback

#### `POST /api/feedback`
Submit public feedback (name optional, message required, rating 1–5).

#### `GET /api/feedback`
Get latest 20 feedbacks (public).

#### `GET /api/admin/feedback`
Get all feedbacks. Admin only.

#### `DELETE /api/admin/feedback/:id`
Delete a feedback. Admin only.

---

### 5.10 Contact / Inbox

#### `POST /api/contact/submit`
Submit a contact message (name, email, phone, subject, message).

#### `GET /api/messages`
Get all messages. Admin only.

#### `GET /api/messages/:id`
Get single message. Admin only.

#### `PATCH /api/messages/:id/read`
Mark message as read. Admin only.

#### `DELETE /api/messages/:id`
Delete message. Admin only.

---

### 5.11 Property Reports

#### `POST /api/properties/:id/report`
Report a property listing.

**Body:**
```json
{
  "reporterEmail": "user@example.com",
  "reporterName": "John",
  "reason": "fraudulent",
  "description": "This listing looks fake"
}
```

Valid reasons: `spam`, `incorrect_details`, `fraudulent`, `offensive`, `other`

#### `GET /api/admin/reports`
Get all reports. Admin only.

#### `DELETE /api/admin/reports/:id`
Dismiss a report. Admin only.

#### `DELETE /api/admin/properties/:id`
Delete property + all its reports. Admin only.

---

### 5.12 Analytics / Views

#### `GET /api/views`
Increment and get total page views + unique visitors for today.

#### `GET /api/views/stats`
Get 7-day view stats for admin analytics dashboard.

#### `GET /api/first-visit`
Check if this IP is visiting for the first time (used to show Terms popup).

#### `GET /api/geocode?location=<text>`
Server-side geocoding via Nominatim (OpenStreetMap). Returns `{ lat, lng }`.

---

## 6. AI Systems

### 6.1 Property NLP Parser

**File:** `ai/property-parser.js`

Parses natural language into structured MongoDB filters. No external API, runs fully in Node.js memory.

**Extracts:**
| Field | Examples |
|---|---|
| `type` | "house", "flat" → `apartment`, "plot" → `land` |
| `category` | "for rent", "for sale", "shortlet", "airbnb" |
| `minBeds` / `maxBeds` | "3 bedrooms", "at least 2 beds", "under 4 rooms" |
| `minPrice` / `maxPrice` | "under 2m", "above 500k", "between 1m and 5m" |
| `location` | "GRA", "new haven", "trans ekulu" + any custom location |

**Dynamic Location Learning:**
- Starts with 60+ known Enugu locations (static seed)
- On startup: queries `AgentPost.distinct('location')` and adds any new locations
- Refreshes every 10 minutes
- New agent locations auto-become searchable without any code change

**Synonym Expansion:**
- `cheap` → `affordable`, `house` → `home/duplex/bungalow`, `shop` → `commercial/office`

---

### 6.2 Agent TF-IDF Search Engine

**File:** `ai/search-engine.js`

The TF-IDF engine is available but the live agent search endpoint was simplified to a direct DB regex name match. The `TFIDFIndex` class remains available for future use.

**TFIDFIndex methods:**
- `addDocument(id, agent)` — index an agent
- `search(query, topK)` — cosine similarity ranked results
- `idf(term)` — smoothed inverse document frequency

**Agent search in production uses:**
```js
AgentUser.find({ status: 'active', name: { $regex: q, $options: 'i' } })
```

---

## 7. Email System (OTP Mailer)

**File:** `utils/sms.js`

Uses **nodemailer** with cPanel SMTP to send OTP emails.

**Config (from `.env`):**
```
MAIL_HOST=mail.easyfind.com.ng
MAIL_PORT=465
MAIL_USERNAME=support@easyfind.com.ng
MAIL_PASSWORD=<your_password>
```

**Functions:**
- `generateOTP()` — returns a 6-digit string
- `sendOTPEmail(email, otp)` — sends styled HTML email
- `sendOTP(phone, email)` — generates OTP + sends email, returns `{ success, otp }`

**Email template includes:**
- Large styled OTP code block
- 10-minute expiry warning
- Easy Find branding

---

## 8. Password Reset Flow

4-step flow using email OTP:

```
1. /password-reset/forgot-password
   → Agent enters their email address
   → POST /api/agent/send-code { email }
   → OTP generated, stored in session, emailed to agent

2. /password-reset/verify-reset
   → Agent enters 6-digit OTP from email
   → POST /api/agent/verify-otp { otp }
   → Session stores emailVerified = agent's email

3. /password-reset/reset-password
   → Agent sets new password
   → POST /api/agent/reset-password { newPassword }
   → Looks up agent by session.emailVerified, updates password

4. Redirect → /login-agent
```

OTP expires in 10 minutes. "Resend Code" available after 60 seconds.

---

## 9. Boost System

### Profile Boost (₦3,500 / 30 days)
- Agent's posts appear above non-boosted posts in the property feed
- Applies to ALL of the agent's listings
- Stored: `AgentUser.boostAccount = true`, `boostAccountExpiry`

### Post Boost (₦950 / 3 days)
- A single specific property listing rises to the top
- Stored: `AgentPost.boostPost = true`, `boostPostExpiry`

### Feed Priority Order
1. Boosted Posts (boostPost = true, not expired)
2. Boosted Agent's Posts
3. Normal Posts (sorted by newest)

### Automatic Expiry
Cron job in `routes/payment-for-boost.js` runs daily at midnight and sets expired boosts back to `false`.

---

## 10. Image Upload & Processing

**Route:** `POST /api/agent/post` and `PATCH /api/edit/post/:id`

**Pipeline:**
1. Multer receives images (up to 10, max 30MB each)
2. Sharp resizes to max 1200px width
3. SVG watermark overlaid with agent name + "easyfind.com.ng"
4. Converted to WebP format (65% quality)
5. Saved to `agent-loged/upload-property/`
6. Original non-webp files cleaned up every 60 seconds

**Filename format:**
```
{agentId}_{timestamp}_{random}.webp
```

**Profile pictures** stored in `agent-profiles/`.

---

## 11. Admin Panel

**URL:** `/admin/dashboard` (requires admin session)

**Pages:**
| Page | URL | Description |
|---|---|---|
| Dashboard | `/admin/dashboard` | Overview stats |
| Agents | `/admin/agents` | Manage agent accounts + status |
| Analytics | `/admin/analytics` | Page views, unique visitors chart |
| Inbox | `/admin/inbox` | Contact form messages |
| Feedback | `/admin/feedback` | User feedback submissions |
| Reports | `/admin/reports` | Reported properties |
| Settings | `/admin/settings` | Admin settings |

**To create the first admin account:**
```bash
node create-admin.js
```

---

## 12. Agent Dashboard

**URL:** `/agent-loged` (requires agent session)

**Features:**
- View/manage all listed properties
- Upload new properties with AI-generated descriptions
- Edit or delete existing listings
- View total property views
- Upload/change profile picture
- Update bio and display name
- Change password
- Boost account or individual posts
- Access NIN verification

---

## 13. Frontend Pages

| Page | URL | Description |
|---|---|---|
| Homepage | `/` | Property feed, AI search, agent listings |
| Agent Signup | `/signup-agent` | New agent registration with password rules |
| Agent Login | `/login-agent` | Password + Google OAuth login |
| Our Agents | `/our-agent` | Public listing of verified agents |
| Agent Profile | `/agent-profile?id=<id>` | Public agent profile + properties |
| Property Detail | `/property?id=<id>` | Single property page |
| Contact | `/contact` | Contact form |
| Terms | `/terms` | Terms of service |
| Forgot Password | `/password-reset/forgot-password` | Email-based password reset start |
| Verify Code | `/password-reset/verify-reset` | OTP entry |
| Reset Password | `/password-reset/reset-password` | New password entry |
| Boost Account | `/boost-account` | Choose and pay for boost |
| Verification Payment | `/verification-payment` | Pay for NIN verification |
| Agent Verification | `/agent-verification` | Complete NIN + face verification |
| Appeal | `/appeal` | Account appeal form |
| 404 | auto | Custom not found page |

---

## 14. WebSocket — Live Property Feed

New property listings are broadcast in real-time to all connected browsers via WebSocket.

**Server (`app.js`):**
```js
app.set('broadcastProperty', (property) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'NEW_PROPERTY', property }));
        }
    });
});
```

**Triggered in:** `routes/agent-upload.js` after every successful property post via `setImmediate`.

---

## 15. Security

| Protection | Implementation |
|---|---|
| Password hashing | bcrypt (salt rounds: 10) via Mongoose pre-save hook |
| Session security | `httpOnly`, `secure` (prod), `sameSite: strict` (prod), 30-day expiry |
| Rate limiting | Auth routes: 10 req/4min, Reset: 2/hour, View counter: 10/min |
| CORS | Only `APP_URL` origins allowed in production |
| Helmet | HTTP security headers (CSP disabled in dev) |
| Input validation | express-validator on all POST routes |
| Payment security | Paystack HMAC signature verified on all webhooks |
| IDOR protection | Agent ID from session compared to resource owner before edits/deletes |
| Admin protection | All `/admin/*` pages and `/api/admin/*` routes gated by `requireAdmin` middleware |
| Proxy trust | `app.set('trust proxy', 1)` only in production |
| Gemini AI rate limit | 10 requests / 4 minutes per IP |

---

## 16. Deployment Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Set `PAYSTACK_SECRET_KEY` to live key (`sk_live_...`)
- [ ] Set correct `APP_URL` (comma-separated, no trailing slash)
- [ ] Set correct `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`
- [ ] Set `GEMINI_API_KEY`
- [ ] Set `GOOGLE_CLIENT_ID`
- [ ] Run `node create-admin.js` to create the first admin account
- [ ] Confirm `MONGO_URI` points to Atlas cluster (not `MONGO_URI=MONGO_URI=...` — remove the duplicate prefix)
- [ ] Ensure `agent-loged/upload-property/` and `agent-profiles/` folders exist and are writable
- [ ] Configure reverse proxy (Nginx/Apache) to forward to port 9000
- [ ] Enable SSL on domain
- [ ] Add Paystack webhook URL in Paystack dashboard:
  - Boost: `https://easyfind.com.ng/api/paystack-webhook`
  - Verification: `https://easyfind.com.ng/api/verification/webhook`

---

*Documentation generated for EasyFind v1.0 — June 2026*
