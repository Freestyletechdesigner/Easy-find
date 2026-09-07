'use strict';

/**
 * Easy Find — Self-Hosted Dual Scraper (Facebook & Instagram)
 * ============================================================
 * Flow:
 *  1. Asks Gemini to generate 7 Facebook search phrases + 7 Instagram hashtags
 *  2. Verifies Facebook & Instagram logged-in sessions
 *  3. Scrapes Facebook search results (7 queries)
 *  4. Scrapes Instagram hashtag pages (7 hashtags)
 *  5. Runs Gemini AI on each post, checks completeness, saves to ScrapedAgent
 *
 * Completeness rule: skip if missing price, phone number, or bedrooms
 * (land & commercial/shop listings are exempt from the bedroom requirement)
 */

const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const puppeteer    = require('puppeteer');
const mongoose     = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const ScrapedAgent = require('../model/ScrapedAgent.js');
const fs           = require('fs');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY });
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ────────────────────────────────────────────────────────────────
const delay = (min, max) => new Promise(r =>
    setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min))
);

function isSeeker(text) {
    const lower = text.toLowerCase();
    return [
        'i need a ', 'i am looking for', "i'm looking for", 'in search of a',
        'please i need', 'urgent need for', 'help me find',
        'i need accommodation', 'need a flat urgently', 'need a house urgently',
        'anyone with a ', 'who has a house', 'who has a flat', 'does anyone know',
        'looking for a shop', 'need a shop', 'need a land',
    ].some(p => lower.includes(p));
}

function hasPropertyKeyword(text) {
    const lower = text.toLowerCase();
    return [
        'bedroom', 'flat', 'apartment', 'duplex', 'bungalow', 'house',
        'land', 'plot', 'shortlet', 'self contain', 'to let', 'for rent',
        'for sale', 'lease', 'property', 'mini flat', 'storey', 'terrace',
        'shop', 'office', 'warehouse', 'commercial', 'showroom',
        '₦', '0803', '0806', '0807', '0808', '0810', '0812', '0813',
        '0814', '0815', '0816', '0817', '0818', '0901', '0902', '0903',
        'enugu', 'gra', 'independence layout', 'trans ekulu',
        'new haven', 'achara', 'coal camp', 'emene', 'uwani', 'ogui',
    ].some(k => lower.includes(k));
}

/**
 * Skip listings that are incomplete.
 * Required: price > 0 AND phone number AND
 *   (beds > 0 OR type is land/commercial — those don't have bedrooms)
 */
function isComplete(data) {
    const price = data.pricingDetails?.totalPackage || data.pricingDetails?.baseRentOrPrice || 0;
    const phone = (data.agentNumber || '').replace(/\s/g, '');
    const beds  = data.beds || 0;
    const type  = (data.type || '').toLowerCase();
    const noBedsRequired = ['land', 'commercial'].includes(type);

    if (price <= 0)                           return { ok: false, reason: 'missing price' };
    if (!phone || phone === 'N/A' || phone.length < 7)
                                               return { ok: false, reason: 'missing phone number' };
    if (!noBedsRequired && beds <= 0)          return { ok: false, reason: 'missing bedroom count' };
    return { ok: true };
}

async function safeGoto(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
        console.log(`  [Nav] ${err.message.slice(0, 80)}`);
    }
}

// ── Step 1: Gemini generates search keywords dynamically ───────────────────
async function generateQueriesWithGemini() {
    console.log('Asking Gemini to generate search keywords...');
    const prompt = `Generate exactly 7 realistic search phrases that real estate agents and landlords use when posting public property listings on Facebook in Enugu, Nigeria.
Include a mix of: houses for rent, flats to let, land for sale, self contain, shortlet, shops to let, and commercial property.
Example: "To let 3 bedroom flat Enugu", "shop for rent Enugu state", "land for sale Enugu GRA"

Also generate exactly 7 Enugu real estate hashtags for Instagram (without the # symbol).
Example: "enuguhouses", "enugurealestate", "enuguland"

Return ONLY valid JSON with this exact shape (no markdown, no backticks):
{"facebook":["q1","q2","q3","q4","q5","q6","q7"],"instagram":["h1","h2","h3","h4","h5","h6","h7"]}`;

    try {
        const response = await ai.models.generateContent({
            model:    'gemini-2.5-flash',
            contents: prompt,
        });
        let text = (response.text || '').trim();
        // Strip markdown code fences if present
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(text);
        // Validate shape
        if (!Array.isArray(parsed.facebook) || parsed.facebook.length < 7) throw new Error('Bad facebook array');
        if (!Array.isArray(parsed.instagram) || parsed.instagram.length < 7) throw new Error('Bad instagram array');
        return parsed;
    } catch (e) {
        console.warn('  [Warn] Gemini keyword generation failed, using defaults:', e.message);
        return {
            facebook: [
                'house for rent Enugu',
                'flat to let Enugu',
                'land for sale Enugu',
                'self contain Enugu',
                'shortlet Enugu',
                'shop to let Enugu state',
                'commercial property Enugu',
            ],
            instagram: [
                'enuguhouses', 'enugurealestate', 'enuguapartment',
                'enuguland', 'enuguproperties', 'enuguhouse', 'enugurealtor',
            ],
        };
    }
}

// ── Step 2: Facebook scraper (via __cft__ token grouping) ─────────────────
async function scrapeFacebookPosts(page, query) {
    const url = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`;
    await safeGoto(page, url);
    await delay(3000, 4000);

    // Scroll to trigger virtual list rendering
    for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 900));
        await delay(1500, 2000);
    }
    await delay(2000, 3000);

    return await page.evaluate(() => {
        const results    = [];
        const seenTokens = new Set();
        const seenText   = new Set();

        // Group links by their unique __cft__[0]= token (one token = one post card)
        const tokenMap = new Map();
        Array.from(document.querySelectorAll('a[href]')).forEach(a => {
            const match = (a.href || '').match(/__cft__\[0\]=([A-Za-z0-9_\-]{20,})/);
            if (!match) return;
            const token = match[1].slice(0, 30);
            if (!tokenMap.has(token)) tokenMap.set(token, []);
            tokenMap.get(token).push(a);
        });

        for (const [token, anchors] of tokenMap) {
            if (seenTokens.has(token)) continue;
            seenTokens.add(token);

            // Find canonical post URL
            let postUrl = '';
            for (const a of anchors) {
                const h = a.href || '';
                if (/\/groups\/\d+\/(posts|permalink)\//.test(h)) {
                    try { const u = new URL(h); u.search = ''; u.hash = ''; postUrl = u.toString(); break; } catch (_) {}
                }
            }
            if (!postUrl) {
                for (const a of anchors) {
                    if ((a.href || '').includes('story_fbid=')) {
                        try {
                            const u = new URL(a.href);
                            const p = new URLSearchParams();
                            ['story_fbid', 'id'].forEach(k => { if (u.searchParams.get(k)) p.set(k, u.searchParams.get(k)); });
                            u.search = p.toString(); u.hash = ''; postUrl = u.toString(); break;
                        } catch (_) {}
                    }
                }
            }
            if (!postUrl) postUrl = `https://www.facebook.com/search/posts/?t=${token.slice(0, 16)}`;

            // Extract post text by walking up the DOM from the first anchor
            let postText = '';
            let el = anchors[0].parentElement;
            for (let d = 0; d < 25 && el; d++) {
                const raw = (el.innerText || el.textContent || '').trim();
                if (raw.length > 80 && raw.length < 5000) {
                    const cleaned = raw.split('\n')
                        .map(l => l.trim()).filter(l => l.length > 1)
                        .filter(l => l !== 'Facebook')
                        .filter(l => !/^(like|comment|share|follow|see more|see less|repost|send)$/i.test(l))
                        .filter(l => !/^\d+\s*(reactions?|comments?|shares?|likes?)$/i.test(l))
                        .filter(l => !/^(just now|\d+[smhdwmy]|\d+ (min|hour|day|week)s? ago)$/i.test(l))
                        .join('\n').trim();
                    if (cleaned.length > 60) { postText = cleaned; break; }
                }
                el = el.parentElement;
            }

            if (!postText) continue;
            const fp = postText.slice(0, 80).replace(/\s+/g, ' ').toLowerCase();
            if (seenText.has(fp)) continue;
            seenText.add(fp);
            results.push({ postUrl, rawText: postText.slice(0, 2000), sourcePlatform: 'Facebook' });
        }
        return results;
    });
}

// ── Step 3: Instagram scraper (hashtag pages) ─────────────────────────────
async function scrapeInstagramPosts(page, hashtag) {
    const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`;
    await safeGoto(page, url);
    await delay(3000, 4000);

    for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 900));
        await delay(1500, 2000);
    }
    await delay(2000, 3000);

    return await page.evaluate(() => {
        const results  = [];
        const seenUrls = new Set();

        // Instagram post links are /p/CODE/ — the image alt contains the caption
        Array.from(document.querySelectorAll('a[href*="/p/"]')).forEach(a => {
            const cleanUrl = (a.href || '').split('?')[0];
            if (!cleanUrl || seenUrls.has(cleanUrl)) return;
            seenUrls.add(cleanUrl);

            // Caption is in the img alt attribute on the hashtag grid
            const img     = a.querySelector('img');
            const rawText = img ? (img.alt || '').trim() : '';

            // Also try walking up for any visible caption text
            let extraText = '';
            let el = a.parentElement;
            for (let d = 0; d < 8 && el; d++) {
                const t = (el.innerText || '').trim();
                if (t.length > 40 && t.length < 2000) { extraText = t; break; }
                el = el.parentElement;
            }

            const combined = [rawText, extraText].filter(Boolean).join('\n').slice(0, 2000);
            if (combined.length > 30) {
                results.push({ postUrl: cleanUrl, rawText: combined, sourcePlatform: 'Instagram' });
            }
        });
        return results;
    });
}

// ── Step 4: Gemini AI analysis ─────────────────────────────────────────────
async function analyseWithGemini(rawText) {
    const response = await ai.models.generateContent({
        model:    'gemini-2.5-flash',
        contents: `You are a Nigerian real estate analyst. Analyse this social media post.

Post:
"""
${rawText.slice(0, 1500)}
"""

Return JSON only. isPropertyListing=true ONLY if someone is ADVERTISING a property for sale/rent/shortlet.
Extract the agent/landlord phone number into agentNumber — look for Nigerian numbers (08xx, 07xx, 09xx, +234).
Use type "commercial" for shops, offices, warehouses, showrooms.
For land listings, beds should be 0.`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    isPropertyListing: { type: 'boolean' },
                    trustDetails: {
                        type: 'object',
                        properties: {
                            trustScore: { type: 'number' },
                            riskLevel:  { type: 'string', enum: ['low', 'medium', 'high'] },
                            riskFlags:  { type: 'array', items: { type: 'string' } },
                            scamReason: { type: 'string' }
                        },
                        required: ['trustScore', 'riskLevel', 'riskFlags', 'scamReason']
                    },
                    pricingDetails: {
                        type: 'object',
                        properties: {
                            baseRentOrPrice: { type: 'number' },
                            totalPackage:    { type: 'number' }
                        },
                        required: ['baseRentOrPrice', 'totalPackage']
                    },
                    title:             { type: 'string' },
                    type:              { type: 'string', enum: ['house', 'apartment', 'land', 'villa', 'commercial'] },
                    category:          { type: 'string', enum: ['sale', 'rent', 'shortlet'] },
                    location:          { type: 'string' },
                    beds:              { type: 'number' },
                    baths:             { type: 'number' },
                    area:              { type: 'string' },
                    description:       { type: 'string' },
                    features:          { type: 'array', items: { type: 'string' } },
                    agentNumber:       { type: 'string' },
                    agentName:         { type: 'string' },
                    agentType:         { type: 'string', enum: ['agent', 'landlord', 'developer', 'unknown'] },
                    contactPreference: { type: 'string', enum: ['whatsapp', 'call', 'any', 'unknown'] }
                },
                required: ['isPropertyListing', 'trustDetails', 'pricingDetails', 'title', 'type', 'category', 'location']
            }
        }
    });
    return JSON.parse(response.text);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function startLocalScraper() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/easyfind');
    console.log('MongoDB Connected.');

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: './user_session',
        executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
        args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setUserAgent(DESKTOP_UA);
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        // ── Check Facebook session ─────────────────────────────────────────
        console.log('Checking Facebook login...');
        await safeGoto(page, 'https://www.facebook.com');
        await delay(3000, 4000);
        let fbPrompted = false;
        while (true) {
            const loginForm = await page.$('input[name="email"], #login_form');
            if (!loginForm) { console.log('✓ Facebook Session Verified.\n'); break; }
            if (!fbPrompted) { console.log('\n[ACTION REQUIRED] Log into Facebook in the browser window.\n'); fbPrompted = true; }
            await delay(3000, 3000);
        }

        // ── Check Instagram session ────────────────────────────────────────
        console.log('Checking Instagram login...');
        await safeGoto(page, 'https://www.instagram.com');
        await delay(3000, 4000);
        let igPrompted = false;
        while (true) {
            const hasIgLogin = await page.$('input[name="username"], input[name="password"]');
            if (!hasIgLogin) { console.log('✓ Instagram Session Verified.\n'); break; }
            if (!igPrompted) { console.log('\n[ACTION REQUIRED] Log into Instagram in the browser window.\n'); igPrompted = true; }
            await delay(3000, 3000);
        }

        // ── Generate keywords dynamically via Gemini ───────────────────────
        const keywords = await generateQueriesWithGemini();
        console.log('\n[Keywords] Facebook queries:', keywords.facebook);
        console.log('[Keywords] Instagram hashtags:', keywords.instagram);

        const allPosts = [];

        // ── Phase 1: Scrape Facebook (7 queries) ───────────────────────────
        console.log('\n─── FACEBOOK SCRAPING ───────────────────────────────');
        for (const query of keywords.facebook) {
            console.log(`\n[FB] Searching: "${query}"`);
            const posts = await scrapeFacebookPosts(page, query);
            console.log(`  Found ${posts.length} post(s).`);
            allPosts.push(...posts);
            await delay(4000, 6000);
        }

        // ── Phase 2: Scrape Instagram (7 hashtags) ─────────────────────────
        console.log('\n─── INSTAGRAM SCRAPING ──────────────────────────────');
        for (const hashtag of keywords.instagram) {
            console.log(`\n[IG] Hashtag: #${hashtag}`);
            const posts = await scrapeInstagramPosts(page, hashtag);
            console.log(`  Found ${posts.length} post(s).`);
            allPosts.push(...posts);
            await delay(4000, 6000);
        }

        console.log(`\n[Processing] Total combined posts collected: ${allPosts.length}`);

        // Process up to 20 posts per run to stay within Gemini free tier
        const toProcess = allPosts.slice(0, 20);
        console.log(`[Processing] Analysing top ${toProcess.length} posts...\n`);

        // ── Phase 3: AI analysis + completeness check + save ──────────────
        let totalSaved = 0;
        const sessionSeen = new Set();

        for (let i = 0; i < toProcess.length; i++) {
            const item = toProcess[i];
            console.log(`\n[${i + 1}/${toProcess.length}] [${item.sourcePlatform}] ${item.postUrl}`);
            console.log(`  "${item.rawText.slice(0, 120).replace(/\n/g, ' ')}"`);

            // Session dedup
            const fp = item.rawText.slice(0, 80).replace(/\s+/g, ' ').toLowerCase();
            if (sessionSeen.has(fp))              { console.log('  → Already seen this session.'); continue; }
            sessionSeen.add(fp);

            if (!hasPropertyKeyword(item.rawText)) { console.log('  → No property keywords.'); continue; }
            if (isSeeker(item.rawText))            { console.log('  → Seeker post, skip.'); continue; }

            const exists = await ScrapedAgent.exists({ postUrl: item.postUrl });
            if (exists) { console.log('  → Already in DB.'); continue; }

            try {
                console.log('  → Sending to Gemini AI...');
                const data = await analyseWithGemini(item.rawText);
                console.log(`  listing=${data.isPropertyListing} | trust=${data.trustDetails?.trustScore} | risk=${data.trustDetails?.riskLevel} | phone="${data.agentNumber}" | price=₦${data.pricingDetails?.baseRentOrPrice} | beds=${data.beds}`);

                if (!data.isPropertyListing)          { console.log('  → Not a listing.'); continue; }
                if (data.trustDetails.riskLevel === 'high' || data.trustDetails.trustScore < 35) {
                    console.log('  ⚠ High risk, blocked.'); continue;
                }

                // Completeness check — skip if price, phone, or bedroom missing
                const check = isComplete(data);
                if (!check.ok) {
                    console.log(`  → Incomplete (${check.reason}), skipping.`);
                    continue;
                }

                const price  = data.pricingDetails.totalPackage || data.pricingDetails.baseRentOrPrice || 0;
                const report = `\n\n---\n**Trust:** ${data.trustDetails.trustScore}/100 | **Risk:** ${data.trustDetails.riskLevel.toUpperCase()} | **Source:** ${item.sourcePlatform}`;

                await ScrapedAgent.create({
                    agentNumber:       data.agentNumber,
                    agentName:         data.agentName         || 'Unknown Agent',
                    agentType:         data.agentType         || 'unknown',
                    contactPreference: data.contactPreference || 'unknown',
                    title:             data.title,
                    type:              data.type              || 'apartment',
                    category:          data.category          || 'rent',
                    price,
                    location:          data.location          || 'Enugu',
                    beds:              data.beds              || 0,
                    baths:             data.baths             || 0,
                    area:              data.area              || '0',
                    description:       (data.description || item.rawText.slice(0, 500)) + report,
                    features:          data.features          || [],
                    postUrl:           item.postUrl,
                    platform:          item.sourcePlatform,
                    trustScore:        data.trustDetails.trustScore,
                    riskLevel:         data.trustDetails.riskLevel,
                });

                console.log(`  ✓ Saved: "${data.title}" — ${data.location} | ₦${Number(price).toLocaleString()} | ${data.agentNumber}`);
                totalSaved++;

            } catch (aiErr) {
                console.error(`  ✗ Gemini error: ${aiErr.message}`);
            }

            // 6–9s between Gemini calls (stay within 15 RPM free tier)
            await delay(6000, 9000);
        }

        console.log(`\n✓ Scraper complete. Saved ${totalSaved} new listings to MongoDB.`);

    } catch (err) {
        console.error('Fatal:', err.message);
        console.error(err.stack);
    } finally {
        await browser.close();
        await mongoose.disconnect();
        console.log('Browser and DB connection closed.');
    }
}

startLocalScraper();
