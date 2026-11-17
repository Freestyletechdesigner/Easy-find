'use strict';

/**
 * routes/whatsapp.js
 * ──────────────────
 * Baileys WhatsApp integration for Fred AI + Agent property posting.
 *
 * Features:
 *   1. Regular users  → Fred AI (property search, general chat)
 *   2. Agents         → Fred AI + "post property" command
 *                       Multi-turn conversation collects listing details,
 *                       accepts image attachments, posts to the platform.
 *
 * Agent identification: matched by WhatsApp number → AgentUser.number
 */

const path = require('path');
const fs   = require('fs');

const AgentUser = require('../model/AgentUser');
const AgentPost = require('../model/AgentPost');

// ── Per-user conversation history ─────────────────────────────────────────────
const _histories  = new Map();   // JID → [{role, content}]
const MAX_HISTORY = 10;

function _getHistory(jid)              { return _histories.get(jid) || []; }
function _pushHistory(jid, role, text) {
    const h = _getHistory(jid);
    h.push({ role, content: text });
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
    _histories.set(jid, h);
}

// ── Per-agent property draft store ────────────────────────────────────────────
// JID → { step, data: {title,type,category,price,location,beds,baths,description}, images: [Buffer] }
const _drafts = new Map();

const POST_STEPS = [
    { field: 'type',        ask: '🏠 What type of property?\nReply: *house*, *apartment*, *land*, or *commercial*' },
    { field: 'category',    ask: '📋 Is it for *rent*, *sale*, or *shortlet*?' },
    { field: 'location',    ask: '📍 Where is it located? (area/street/neighbourhood)' },
    { field: 'price',       ask: '💰 What is the asking price? (numbers only, e.g. 250000)' },
    { field: 'title',       ask: '✏️ Give it a short title (e.g. "3 bedroom flat in GRA")' },
    { field: 'beds',        ask: '🛏 How many bedrooms? (type 0 for land/commercial)' },
    { field: 'baths',       ask: '🚿 How many bathrooms? (type 0 for land)' },
    { field: 'description', ask: '📝 Add a short description of the property, or reply *skip* to skip.' },
    { field: 'images',      ask: '📸 Send photos *and/or a video* of the property (up to 10 photos + 1 video). When done, type *done*.' },
];

function _startDraft(jid) {
    _drafts.set(jid, { step: 0, data: {}, images: [], videoBuf: null, videoMime: null });
}
function _getDraft(jid) { return _drafts.get(jid) || null; }
function _clearDraft(jid) { _drafts.delete(jid); }

function _nextQuestion(draft) {
    return POST_STEPS[draft.step] || null;
}

// ── Normalise agent phone number for matching ─────────────────────────────────
function _normalisePhone(jid) {
    // JID format: "2348012345678@s.whatsapp.net"
    const digits = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    // Convert country code +234 → leading 0
    if (digits.startsWith('234') && digits.length === 13) return '0' + digits.slice(3);
    if (digits.startsWith('0')   && digits.length === 11) return digits;
    return digits;
}

// ── Look up agent by WhatsApp JID ─────────────────────────────────────────────
async function _findAgent(jid) {
    try {
        const phone = _normalisePhone(jid);
        return await AgentUser.findOne({ number: phone, status: 'active' })
            .select('_id name number stand')
            .lean();
    } catch (_) { return null; }
}

// ── Check if message is a post-property intent ────────────────────────────────
const POST_TRIGGERS = [
    /\bi\s*want\s+to\s+post\b/i,
    /\bpost\s+(a\s+)?property\b/i,
    /\blist\s+(a\s+)?property\b/i,
    /\badd\s+(a\s+)?listing\b/i,
    /\bupload\s+(a\s+)?property\b/i,
    /\bi\s+get\s+property\s+(to\s+)?(post|list|sell|rent)\b/i,
    /\bi\s+wan\s+(post|list)\b/i,
    /\bnew\s+listing\b/i,
];
function _isPostIntent(text) { return POST_TRIGGERS.some(r => r.test(text)); }

// ── Call Fred (non-streaming, collects tokens) ────────────────────────────────
async function _callFred(userMessage, history) {
    const fredUrl = (process.env.FRED_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const ctrl    = new AbortController();
    const timer   = setTimeout(() => ctrl.abort(), 60000);
    try {
        const res = await fetch(`${fredUrl}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify({ user_message: userMessage, chat_history: history }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) { console.error(`[WA] Fred ${res.status}`); return null; }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let reply = '', buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const js = t.slice(5).trim();
                if (js === '[DONE]') continue;
                try {
                    const c = JSON.parse(js);
                    if (c.token) reply += c.token;
                    if (c.done)  break;
                    if (c.error) return `⚠️ ${c.error}`;
                } catch (_) {}
            }
        }
        return reply.trim() || null;
    } catch (err) {
        clearTimeout(timer);
        console.error('[WA] Fred error:', err.message);
        return null;
    }
}

// ── Download image from WhatsApp message ──────────────────────────────────────
async function _downloadMedia(sock, msg, type) {
    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger: require('pino')({ level: 'silent' }) });
        return buf instanceof Buffer ? buf : null;
    } catch (err) {
        console.error(`[WA] ${type} download error:`, err.message);
        return null;
    }
}

// ── Save image buffer to upload-property folder ───────────────────────────────
async function _saveImage(buf, agentId, agentName) {
    const sharp      = require('sharp');
    const UPLOAD_DIR = path.join(__dirname, '..', 'agent-loged', 'upload-property');
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const fname   = `${agentId}_${Date.now()}_${Math.floor(Math.random() * 1000)}.webp`;
    const outPath = path.join(UPLOAD_DIR, fname);

    try {
        const meta  = await sharp(buf).metadata();
        const w     = Math.min(meta.width || 1200, 1200);
        const h     = Math.round((w / (meta.width || 1200)) * (meta.height || 800));
        const safe  = (agentName || 'Easy Find').replace(/[<>&"]/g, '');
        const fs_   = Math.max(16, Math.round(w * 0.024));
        const pad   = Math.round(fs_ * 0.8);
        const lh    = Math.round(fs_ * 1.4);
        const bh    = lh * 2 + pad * 2;
        const bw    = Math.round(w * 0.45);
        const bx    = (w - bw) / 2;
        const by_   = (h - bh) / 2;
        const svg   = Buffer.from(
            `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect x="${bx}" y="${by_}" width="${bw}" height="${bh}" rx="8" fill="rgba(0,0,0,0.45)"/>` +
            `<text x="${w/2}" y="${by_+pad+fs_}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs_}" font-weight="bold" fill="white" opacity="0.95">@${safe}</text>` +
            `<text x="${w/2}" y="${by_+pad+fs_+lh}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(fs_*0.85)}" fill="#66eae3" opacity="0.9">easyfind.com.ng</text>` +
            `</svg>`
        );
        await sharp(buf)
            .resize({ width: 1200, withoutEnlargement: true })
            .composite([{ input: svg, blend: 'over' }])
            .webp({ quality: 65, effort: 6 })
            .toFile(outPath);
        return fname;
    } catch (err) {
        console.error('[WA] Sharp error:', err.message);
        return null;
    }
}

// ── Save video buffer to upload-property folder ───────────────────────────────
async function _saveVideo(buf, agentId, mimetype) {
    const UPLOAD_DIR = path.join(__dirname, '..', 'agent-loged', 'upload-property');
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    // Determine extension from mimetype, default mp4
    const ext  = (mimetype || 'video/mp4').split('/')[1]?.split(';')[0] || 'mp4';
    const safe = ['mp4','mov','webm','avi'].includes(ext) ? ext : 'mp4';
    const fname = `${agentId}_${Date.now()}_video.${safe}`;
    try {
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
        return fname;
    } catch (err) {
        console.error('[WA] Video save error:', err.message);
        return null;
    }
}

// ── Post the property to the DB ───────────────────────────────────────────────
async function _submitProperty(agent, draft, sock, jid) {
    try {
        const agentId   = agent._id.toString();
        const { data, images } = draft;

        // Monthly cap for unverified agents
        const isVerified = agent.stand === 'Verified Agent';
        if (!isVerified) {
            const now        = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const count      = await AgentPost.countDocuments({ agentId, date: { $gte: monthStart, $lt: monthEnd } });
            if (count >= 5) {
                return '❌ You have reached the 5-property monthly limit for unverified agents. Get verified on easyfind.com.ng/agent-verification to post unlimited listings.';
            }
        }

        const cleanPrice = parseFloat(String(data.price || '0').replace(/[^0-9.]/g, '')) || 0;
        if (!isVerified && cleanPrice >= 1_000_000) {
            return '❌ Verification is required for properties priced ₦1,000,000 or above. Visit easyfind.com.ng/agent-verification.';
        }

        // Save images
        const imageNames = [];
        for (const buf of images.slice(0, 10)) {
            const fname = await _saveImage(buf, agentId, agent.name);
            if (fname) imageNames.push(fname);
        }

        let videoName = null;
        if (draft.videoBuf) {
            videoName = await _saveVideo(draft.videoBuf, agentId, draft.videoMime);
        }

        const newPost = new AgentPost({
            agentId,
            title:       (data.title || `${data.type} in ${data.location}`).trim(),
            type:        data.type        || 'house',
            category:    data.category    || 'rent',
            price:       cleanPrice,
            location:    (data.location   || 'Enugu').trim(),
            beds:        data.type === 'land' ? null : (parseInt(data.beds) || 0),
            baths:       data.type === 'land' ? null : (parseInt(data.baths) || 0),
            description: (data.description || '').trim().slice(0, 5000),
            imageNames,
            videoName:   videoName || null,
            date:        new Date(),
            latitude:    6.4584,   // default Enugu centre — agent can update from dashboard
            longitude:   7.5464,
            agentNumber: agent.number || 'N/A',
            agentName:   agent.name   || '',
            agentType:   'agent',
            platform:    'Easyfind',
        });

        await newPost.save();

        const appBase = (process.env.APP_URL || 'https://easyfind.com.ng').split(',')[0].trim();
        newPost.postUrl = `${appBase}/property?id=${newPost._id}`;
        await newPost.save();

        // Index in Fred's ChromaDB (non-blocking)
        const fredUrl = (process.env.FRED_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
        fetch(`${fredUrl}/internal/index-property`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: newPost._id.toString(), title: newPost.title,
                type: newPost.type, category: newPost.category,
                price: newPost.price, price_raw: `₦${newPost.price.toLocaleString('en-NG')}`,
                location: newPost.location, beds: newPost.beds, baths: newPost.baths,
                description: newPost.description, features: [],
                agentName: agent.name, agentNumber: agent.number || 'N/A',
                platform: 'Easyfind', postUrl: newPost.postUrl,
            }),
            signal: AbortSignal.timeout(8000),
        }).catch(() => {});

        const imgNote = imageNames.length > 0
            ? `\n📸 ${imageNames.length} photo(s) uploaded with watermark.${videoName ? '\n🎬 Video uploaded.' : ''}`
            : `\n📸 No photos uploaded.${videoName ? '\n🎬 Video uploaded.' : ' Add photos from your dashboard.'}`;
        return `✅ *Property posted successfully!*\n\n🔗 ${newPost.postUrl}${imgNote}\n\n💡 Tip: visit your dashboard to pin the exact location on the map.`;

    } catch (err) {
        console.error('[WA] Post property error:', err.message);
        return '❌ Failed to post the property. Please try again or post from your dashboard.';
    }
}

// ── Handle message from an AGENT ─────────────────────────────────────────────
async function _handleAgentMessage(sock, jid, text, imgBuf, videoBuf, videoMime, agent) {
    const draft = _getDraft(jid);

    // ── Active draft in progress ─────────────────────────────────────────────
    if (draft) {
        // Cancel command
        if (/\b(cancel|stop|abort|quit|never ?mind)\b/i.test(text)) {
            _clearDraft(jid);
            return '❌ Property posting cancelled. Let me know if you need anything else.';
        }

        const step = POST_STEPS[draft.step];

        // Image step — accept image and video buffers
        if (step?.field === 'images') {
            if (imgBuf) {
                draft.images.push(imgBuf);
                _drafts.set(jid, draft);
                if (draft.images.length >= 10) {
                    const reply = await _submitProperty(agent, draft, sock, jid);
                    _clearDraft(jid);
                    return reply;
                }
                return `📸 Got it! Image ${draft.images.length} received. Send more photos/video or type *done* to post.`;
            }
            if (videoBuf) {
                draft.videoBuf  = videoBuf;
                draft.videoMime = videoMime;
                _drafts.set(jid, draft);
                return `🎬 Video received! Send photos too or type *done* to post.`;
            }
            // User typed "done"
            if (/^\s*(done|finish|submit|post( it)?|yes|ok)\s*$/i.test(text)) {
                const reply = await _submitProperty(agent, draft, sock, jid);
                _clearDraft(jid);
                return reply;
            }
            return `📸 Send photos/video or type *done* to post without more media.`;
        }

        // Regular text step — handle image/video if sent during a text step
        if (imgBuf && step?.field !== 'images') {
            draft.images.push(imgBuf);
            _drafts.set(jid, draft);
            return `📸 Photo saved! Now please answer: ${step.ask}`;
        }
        if (videoBuf && step?.field !== 'images') {
            draft.videoBuf  = videoBuf;
            draft.videoMime = videoMime;
            _drafts.set(jid, draft);
            return `🎬 Video saved! Now please answer: ${step.ask}`;
        }

        if (!text) return `Please answer: ${step.ask}`;

        // Validate and store the answer
        let value = text.trim();

        if (step.field === 'type') {
            const t = value.toLowerCase();
            const map = { house: 'house', flat: 'house', apartment: 'apartment', duplex: 'house',
                          land: 'land', plot: 'land', shop: 'commercial', office: 'commercial', commercial: 'commercial' };
            value = map[t] || 'house';
        }
        if (step.field === 'category') {
            const c = value.toLowerCase();
            value = c.includes('sale') ? 'sale' : c.includes('short') ? 'shortlet' : 'rent';
        }
        if (step.field === 'price') {
            value = value.replace(/[^0-9.]/g, '');
            if (!value || isNaN(parseFloat(value))) return '💰 Please enter a valid number, e.g. *250000*';
        }
        if (step.field === 'beds' || step.field === 'baths') {
            const n = parseInt(value);
            value = isNaN(n) ? '0' : String(n);
        }
        if (step.field === 'description' && /^\s*(skip|s|none|no)\s*$/i.test(value)) {
            value = '';
        }

        draft.data[step.field] = value;
        draft.step++;
        _drafts.set(jid, draft);

        const next = _nextQuestion(draft);
        if (!next) {
            // All text steps done — move to images step (already at step 8)
            const imgStep = POST_STEPS[draft.step - 1]; // "images" step
            return imgStep ? imgStep.ask : '📸 Send photos or type *done* to post.';
        }
        return next.ask;
    }

    // ── No active draft — check for post intent ──────────────────────────────
    if (_isPostIntent(text)) {
        _startDraft(jid);
        const first = POST_STEPS[0];
        return `Great! Let's post your property 🏠\n\nI'll ask a few quick questions.\nType *cancel* at any time to stop.\n\n${first.ask}`;
    }

    // ── Regular message — pass to Fred with agent context ─────────────────────
    const history = _getHistory(jid).map(m => ({
        role:    m.role === 'bot' ? 'assistant' : m.role,
        content: m.content,
    }));
    const reply = await _callFred(text, history);
    return reply || "Sorry, I couldn't reach Fred right now. Try again in a moment. 🙏";
}

// ── Handle message from a regular USER ────────────────────────────────────────
async function _handleUserMessage(jid, text) {
    const history = _getHistory(jid).map(m => ({
        role:    m.role === 'bot' ? 'assistant' : m.role,
        content: m.content,
    }));
    const reply = await _callFred(text, history);
    return reply || "Sorry, I couldn't reach Fred right now. Try again in a moment. 🙏";
}

// ── Split long replies into WhatsApp-safe chunks ──────────────────────────────
function _splitMessage(text, maxLen = 4000) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + maxLen;
        if (end < text.length) {
            const nb = text.lastIndexOf('\n', end);
            if (nb > start + maxLen / 2) end = nb + 1;
            else { const sb = text.lastIndexOf(' ', end); if (sb > start) end = sb + 1; }
        }
        chunks.push(text.slice(start, end).trim());
        start = end;
    }
    return chunks;
}

// ── Start Baileys ─────────────────────────────────────────────────────────────
async function startBaileys() {
    let makeWASocket, useMultiFileAuthState, DisconnectReason, Boom;
    try {
        const baileys  = require('@whiskeysockets/baileys');
        const boomPkg  = require('@hapi/boom');
        makeWASocket          = baileys.makeWASocket || baileys.default;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        DisconnectReason      = baileys.DisconnectReason;
        Boom                  = boomPkg.Boom || boomPkg;
    } catch {
        console.error('[WhatsApp] Baileys not installed. Run: npm install @whiskeysockets/baileys --legacy-peer-deps');
        return;
    }

    const SESSION_DIR = path.resolve(process.env.WHATSAPP_SESSION_DIR || './whatsapp-session');
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    async function connect() {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        const sessionFiles = fs.readdirSync(SESSION_DIR).filter(f => f !== '.gitkeep');
        if (sessionFiles.length === 0) {
            console.log('\n[WhatsApp] ⚠️  No session. Run: node whatsapp-connect.js first.\n');
            return;
        }

        const sock = makeWASocket({
            auth: state, printQRInTerminal: false,
            logger: require('pino')({ level: 'silent' }),
            browser: ['EasyFind Fred', 'Chrome', '1.0.0'],
            syncFullHistory: false, markOnlineOnConnect: false,
        });

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) console.log('\n[WhatsApp] ⚠️  Session expired. Delete whatsapp-session/ and run whatsapp-connect.js\n');
            if (connection === 'open')  console.log('[WhatsApp] ✓ Connected');
            if (connection === 'close') {
                const code = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : undefined;
                if (code !== DisconnectReason.loggedOut) { console.log('[WhatsApp] Reconnecting…'); setTimeout(connect, 5000); }
                else console.log('[WhatsApp] Logged out — re-scan QR.');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe)                               continue;
                if (msg.key.remoteJid === 'status@broadcast')     continue;
                if (msg.key.remoteJid.endsWith('@g.us'))          continue;

                const jid = msg.key.remoteJid;

                // Extract text
                const text = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    msg.message?.buttonsResponseMessage?.selectedButtonId ||
                    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                    ''
                ).trim();

                // Extract image if present
                const hasImage = !!(msg.message?.imageMessage);
                const hasVideo = !!(msg.message?.videoMessage);
                let imgBuf = null, videoBuf = null, videoMime = null;

                if (hasImage) imgBuf = await _downloadMedia(sock, msg, 'image');
                if (hasVideo) {
                    videoBuf  = await _downloadMedia(sock, msg, 'video');
                    videoMime = msg.message.videoMessage.mimetype || 'video/mp4';
                }

                if (!text && !imgBuf && !videoBuf) continue;

                console.log(`[WhatsApp] ← ${jid}: ${text.slice(0, 60)}${hasImage ? ' [image]' : ''}${hasVideo ? ' [video]' : ''}`);

                await sock.sendPresenceUpdate('composing', jid);

                // Identify sender
                const agent = await _findAgent(jid);

                const typingInterval = setInterval(async () => {
                    try { await sock.sendPresenceUpdate('composing', jid); } catch (_) {}
                }, 4000);

                let reply;
                if (agent) {
                    reply = await _handleAgentMessage(sock, jid, text, imgBuf, videoBuf, videoMime, agent);
                } else {
                    reply = await _handleUserMessage(jid, text);
                }

                clearInterval(typingInterval);

                if (typeof global._trackFredWhatsApp === 'function') global._trackFredWhatsApp(jid);

                _pushHistory(jid, 'user', text || '[image]');
                _pushHistory(jid, 'bot',  reply);

                console.log(`[WhatsApp] → ${jid}: ${reply.slice(0, 80)}…`);

                const pauseMs = Math.min(3000, Math.max(1500, reply.length * 8));
                await new Promise(r => setTimeout(r, pauseMs));
                await sock.sendPresenceUpdate('paused', jid);
                await new Promise(r => setTimeout(r, 300));

                for (const [i, chunk] of _splitMessage(reply).entries()) {
                    await sock.sendMessage(jid, { text: chunk });
                    if (i < _splitMessage(reply).length - 1) await new Promise(r => setTimeout(r, 800));
                }
            }
        });
    }

    connect().catch(err => console.error('[WhatsApp] Failed to start:', err.message));
}

// ── Admin API routes ──────────────────────────────────────────────────────────
function registerRoutes(app) {
    app.get('/api/whatsapp/status', (req, res) => {
        res.json({ status: 'ok', active_chats: _histories.size, active_drafts: _drafts.size, engine: 'baileys' });
    });
    app.delete('/api/whatsapp/history/:jid', (req, res) => {
        if (!req.session?.admin) return res.status(403).json({ success: false, message: 'Admin only' });
        const jid = decodeURIComponent(req.params.jid);
        _histories.delete(jid);
        _drafts.delete(jid);
        res.json({ success: true, cleared: jid });
    });
}

module.exports = function whatsappRoutes(app) {
    registerRoutes(app);
    setTimeout(() => startBaileys(app), 2000);
};
