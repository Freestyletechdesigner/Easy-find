'use strict';

/**
 * Easy Find — Facebook + PrivateProperty.ng Scraper
 * ====================================================
 * Facebook:
 *   - Gemini generates 7 search phrases each run
 *   - Scrapes search results (__cft__ token grouping)
 *   - Visits post detail for comments + poster name + profile phone fallback
 *
 * PrivateProperty.ng:
 *   - Scrapes https://privateproperty.ng/property-for-all/enugu (paginated)
 *   - Collects listing cards → visits each detail page
 *   - Clicks "CALL" button to reveal agent phone number
 *
 * Both pipelines:
 *   - Downloads images to agent-loged/upload-property/
 *   - Gemini AI analysis → completeness check → saves to AgentPost
 *
 * Completeness rule: skip if missing price, phone, or bedrooms
 * (land & commercial exempt from bedroom requirement)
 */

const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const puppeteer  = require('puppeteer');
const mongoose   = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const AgentPost  = require('../model/AgentPost.js');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const http       = require('http');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY });
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const UPLOAD_DIR = path.join(__dirname, '..', 'agent-loged', 'upload-property');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const delay = (min, max) => new Promise(r =>
    setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min))
);

// ── Filters ────────────────────────────────────────────────────────────────
function isSeeker(text) {
    const lower = text.toLowerCase();
    return [
        'i need a ', 'i am looking for', "i'm looking for", 'in search of a',
        'please i need', 'urgent need for', 'help me find',
        'i need accommodation', 'need a flat urgently', 'need a house urgently',
        'anyone with a ', 'who has a house', 'who has a flat', 'does anyone know',
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

function isComplete(data) {
    const phone = (data.agentNumber || '').replace(/\s/g, '');
    const beds  = data.beds || 0;
    const type  = (data.type || '').toLowerCase();
    if (!phone || phone === 'N/A' || phone.length < 7) return { ok: false, reason: 'missing phone number' };
    if (!['land', 'commercial'].includes(type) && beds <= 0) return { ok: false, reason: 'missing bedroom count' };
    return { ok: true };
}

async function safeGoto(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
        console.log(`  [Nav] ${err.message.slice(0, 80)}`);
    }
}

// ── Image downloader ───────────────────────────────────────────────────────
function downloadImage(imageUrl, prefix) {
    return new Promise(resolve => {
        try {
            const filename = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
            const dest = path.join(UPLOAD_DIR, filename);
            const file = fs.createWriteStream(dest);
            const proto = imageUrl.startsWith('https') ? https : http;
            const req = proto.get(imageUrl, { headers: { 'User-Agent': DESKTOP_UA }, timeout: 15000 }, res => {
                if (res.statusCode !== 200) { file.close(); fs.unlink(dest, () => {}); return resolve(null); }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(filename); });
            });
            req.on('error', () => { file.close(); fs.unlink(dest, () => {}); resolve(null); });
            req.on('timeout', () => { req.destroy(); resolve(null); });
        } catch (_) { resolve(null); }
    });
}

async function downloadImages(imageUrls, prefix, maxImages = 4) {
    const saved = [];
    for (const url of (imageUrls || []).slice(0, maxImages)) {
        if (!url || url.startsWith('data:')) continue;
        const filename = await downloadImage(url, prefix);
        if (filename) saved.push(filename);
    }
    return saved;
}

// ── Step 1: Gemini generates 7 Facebook search queries dynamically ─────────
async function generateFacebookQueries() {
    console.log('Asking Gemini to generate Facebook search queries...');
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: `Generate exactly 7 realistic Facebook search phrases used by real estate agents posting property listings in Enugu, Nigeria.
Include a mix of: houses for rent, flats to let, land for sale, self contain, shortlet, shops to let, commercial property.
Return ONLY valid JSON array (no markdown, no extra text):
["query1","query2","query3","query4","query5","query6","query7"]`
        });
        let text = (response.text || '').trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length >= 7) return parsed.slice(0, 7);
        throw new Error('invalid shape');
    } catch (e) {
        console.warn('  [Warn] Using default queries:', e.message);
        return [
            'house for rent Enugu',
            'flat to let Enugu',
            'land for sale Enugu',
            'self contain Enugu',
            'shortlet Enugu',
            'shop to let Enugu state',
            'commercial property Enugu',
        ];
    }
}

// ── Step 2: Facebook scraper (__cft__ token grouping) ─────────────────────
async function scrapeFacebookPosts(page, query) {
    await safeGoto(page, `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`);
    await delay(3000, 4000);

    for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 900));
        await delay(1500, 2000);
    }
    await delay(2000, 3000);

    return await page.evaluate(() => {
        const results    = [];
        const seenTokens = new Set();
        const seenText   = new Set();

        // Each post card's links share the same unique __cft__[0]= token
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
                            const u = new URL(a.href), p = new URLSearchParams();
                            ['story_fbid', 'id'].forEach(k => { if (u.searchParams.get(k)) p.set(k, u.searchParams.get(k)); });
                            u.search = p.toString(); u.hash = ''; postUrl = u.toString(); break;
                        } catch (_) {}
                    }
                }
            }
            if (!postUrl) postUrl = `https://www.facebook.com/search/posts/?t=${token.slice(0, 16)}`;

            // Walk up DOM to find post container with text + images
            let postText = '', imageUrls = [], el = anchors[0].parentElement;
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
                    if (cleaned.length > 60) {
                        postText = cleaned;
                        imageUrls = Array.from(el.querySelectorAll('img[src]'))
                            .map(img => img.src || '')
                            .filter(s => s && !s.startsWith('data:') && !s.includes('rsrc.php') &&
                                (s.includes('fbcdn.net') || s.includes('fbsbx.com')))
                            .slice(0, 5);
                        break;
                    }
                }
                el = el.parentElement;
            }

            if (!postText) continue;
            const fp = postText.slice(0, 80).replace(/\s+/g, ' ').toLowerCase();
            if (seenText.has(fp)) continue;
            seenText.add(fp);
            results.push({ postUrl, rawText: postText.slice(0, 2000), imageUrls, sourcePlatform: 'Facebook' });
        }
        return results;
    });
}

// ── Step 2b: Visit individual post to get first comment + poster name ──────
// Many Nigerian property agents put phone numbers in comments, not the post body.
// We also grab the poster's display name from the post header.
async function fetchPostDetail(page, postUrl) {
    // Skip token-only URLs — they don't resolve to a real post
    if (postUrl.includes('/search/posts/?t=')) return { firstComment: '', posterName: '', posterProfileUrl: '' };

    try {
        await safeGoto(page, postUrl);
        await delay(2500, 3500);

        // Scroll a little to trigger comment loading
        await page.evaluate(() => window.scrollBy(0, 600));
        await delay(1500, 2000);

        return await page.evaluate(() => {
            // ── Poster name + profile URL ─────────────────────────────────
            // Facebook puts the poster's name as a strong/b tag or an h2/h3 near the top
            let posterName = '';
            let posterProfileUrl = '';
            const nameSelectors = [
                'h1 strong', 'h2 strong', 'strong a', 'h2 a', 'h3 a',
                '[data-testid="post_author"] a',
                'a[role="link"] > strong',
            ];
            for (const sel of nameSelectors) {
                const el = document.querySelector(sel);
                if (el && el.innerText && el.innerText.trim().length > 1) {
                    posterName = el.innerText.trim();
                    // Walk up to find the nearest anchor for the profile link
                    const anchor = el.closest('a') || (el.tagName === 'A' ? el : null);
                    if (anchor && anchor.href && anchor.href.includes('facebook.com')) {
                        try {
                            const u = new URL(anchor.href);
                            // Keep only the path portion (strips __cft__ tracking params)
                            posterProfileUrl = u.origin + u.pathname;
                        } catch (_) {
                            posterProfileUrl = anchor.href.split('?')[0];
                        }
                    }
                    break;
                }
            }
            // Fallback: any anchor whose href looks like a profile
            if (!posterProfileUrl) {
                const anchors = Array.from(document.querySelectorAll('a[href*="facebook.com"]'));
                for (const a of anchors) {
                    const href = (a.href || '');
                    // Profile URLs look like /YourName or /profile.php?id= — avoid posts/photos/groups
                    if (href.includes('facebook.com') &&
                        !href.includes('/posts/') &&
                        !href.includes('/photos/') &&
                        !href.includes('/groups/') &&
                        !href.includes('/events/') &&
                        !href.includes('/search/') &&
                        !href.includes('/__cft__') &&
                        !/\?(.*cft|story_fbid|ref=)/.test(href)) {
                        try {
                            const u = new URL(href);
                            // Must have a non-trivial path (not just "/")
                            if (u.pathname.length > 2) {
                                posterProfileUrl = u.origin + u.pathname;
                                break;
                            }
                        } catch (_) {}
                    }
                }
            }

            // ── First comment ─────────────────────────────────────────────
            // Comments are in [role="article"] elements nested under the main post article.
            // The first [role="article"] is the post itself; subsequent ones are comments.
            let firstComment = '';
            const articles = Array.from(document.querySelectorAll('[role="article"]'));

            // Skip the first article (the post) — take the second onward as comments
            for (let i = 1; i < articles.length; i++) {
                const art = articles[i];
                const text = (art.innerText || art.textContent || '').trim();
                // Valid comment: has meaningful text, not just "Like · Reply"
                if (text.length > 15 && !/^(like|reply|see more)$/i.test(text)) {
                    // Clean noise
                    const cleaned = text.split('\n')
                        .map(l => l.trim()).filter(l => l.length > 1)
                        .filter(l => !/^(like|reply|see more|see less|\d+[smhdw])$/i.test(l))
                        .join(' ').trim();
                    if (cleaned.length > 10) {
                        firstComment = cleaned.slice(0, 500);
                        break;
                    }
                }
            }

            return { firstComment, posterName, posterProfileUrl };
        });
    } catch (err) {
        console.log(`  [detail] Could not fetch post detail: ${err.message.slice(0, 60)}`);
        return { firstComment: '', posterName: '', posterProfileUrl: '' };
    }
}
// ── Step 2c: Visit poster's Facebook profile to find phone number ──────────
// Some agents don't put their phone in the post or comments — only in their
// Facebook "About → Contact and basic info" section. We navigate there and
// grep for any Nigerian mobile number pattern.
async function fetchAgentProfilePhone(page, posterProfileUrl) {
    if (!posterProfileUrl) return '';
    try {
        // Build the direct About-contact URL from any facebook.com/... profile URL
        let aboutUrl = posterProfileUrl.trim();

        // Normalise: strip query/hash first
        try {
            const u = new URL(aboutUrl);
            u.search = '';
            u.hash   = '';
            aboutUrl = u.toString();
        } catch (_) { /* keep as-is */ }

        // Facebook profile About-contact tab URL patterns:
        //   facebook.com/username        → facebook.com/username/about_contact_and_basic_info
        //   facebook.com/profile.php?id= → facebook.com/profile.php?id=XXX&sk=about_contact_and_basic_info
        if (aboutUrl.includes('profile.php')) {
            aboutUrl = aboutUrl + '&sk=about_contact_and_basic_info';
        } else {
            aboutUrl = aboutUrl.replace(/\/$/, '') + '/about_contact_and_basic_info';
        }

        console.log(`  → Profile About page: ${aboutUrl}`);
        await safeGoto(page, aboutUrl);
        await delay(2500, 3500);

        // Scroll a little to load lazy content
        await page.evaluate(() => window.scrollBy(0, 800));
        await delay(1000, 1500);

        const phone = await page.evaluate(() => {
            const text = document.body.innerText || document.body.textContent || '';
            // Nigerian mobile patterns: 08xx, 07xx, 09xx, +2348xx, +2347xx, +2349xx
            const patterns = [
                /(?:\+?234|0)[789]\d{9}/g,          // +2348012345678 or 08012345678
                /0[789]\d{2}[\s\-]?\d{3}[\s\-]?\d{4}/g, // spaced/dashed versions
            ];
            for (const re of patterns) {
                const matches = text.match(re);
                if (matches && matches.length > 0) {
                    // Normalise: strip spaces/dashes
                    return matches[0].replace(/[\s\-]/g, '');
                }
            }
            return '';
        });

        if (phone) console.log(`  → Profile phone found: ${phone}`);
        return phone;

    } catch (err) {
        console.log(`  [profile] Could not fetch agent profile: ${err.message.slice(0, 60)}`);
        return '';
    }
}

// ── Step 3: PrivateProperty.ng scraper ────────────────────────────────────
// Scrapes https://privateproperty.ng/property-for-all/enugu (paginated).
// Pages 1–3 give up to 60 listings before detail visiting.
const PP_BASE_URL  = 'https://privateproperty.ng/property-for-all/enugu';
const PP_MAX_PAGES = 3; // each page has ~20 cards → up to 60 candidates

// Scrape listing cards from one results page.
// Returns array of { postUrl, title, priceText, locationText, beds, baths, imageUrls }
async function scrapePPListings(page, pageNum) {
    const url = pageNum === 1 ? PP_BASE_URL : `${PP_BASE_URL}?page=${pageNum}`;
    console.log(`  [PP] ${url}`);
    await safeGoto(page, url);
    await delay(3000, 4000);

    // Scroll to load any lazy images
    for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await delay(800, 1200);
    }
    await delay(1000, 1500);

    return await page.evaluate(() => {
        const results = [];
        const seen    = new Set();

        // PrivateProperty listing cards are <li> elements containing an <a>
        // whose href contains "/property/" or "/for-sale/" or "/to-let/".
        // We cast a wide net and filter by link shape.
        const anchors = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            const h = a.href || '';
            return h.includes('privateproperty.ng') &&
                   (h.includes('/property/') || h.includes('/for-sale/') ||
                    h.includes('/to-let/')   || h.includes('/for-rent/') ||
                    /privateproperty\.ng\/[^/]+-\d+/.test(h));
        });

        for (const anchor of anchors) {
            let href = anchor.href || '';
            try { const u = new URL(href); u.search = ''; u.hash = ''; href = u.toString(); } catch (_) {}
            if (seen.has(href)) continue;
            seen.add(href);

            // Walk up to find the card container
            let card = anchor;
            for (let d = 0; d < 10 && card; d++) {
                const text = (card.innerText || card.textContent || '').trim();
                if (text.length > 40) break;
                card = card.parentElement;
            }
            if (!card) card = anchor.parentElement;

            const cardText = (card.innerText || card.textContent || '').trim();
            if (!cardText || cardText.length < 10) continue;

            // ── Title ───────────────────────────────────────────────
            const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]');
            const title   = (titleEl?.innerText || titleEl?.textContent || anchor.innerText || '').trim().slice(0, 200);

            // ── Price ────────────────────────────────────────────────
            const priceEl  = card.querySelector('[class*="price"], [class*="Price"], [class*="amount"]');
            const priceText = (priceEl?.innerText || priceEl?.textContent || '').replace(/\s+/g, ' ').trim();

            // ── Location ─────────────────────────────────────────────
            const locEl      = card.querySelector('[class*="location"], [class*="Location"], [class*="address"], [class*="area"]');
            const locationText = (locEl?.innerText || locEl?.textContent || '').replace(/\s+/g, ' ').trim();

            // ── Beds / Baths (visible in card) ───────────────────────
            const bedsMatch  = cardText.match(/(\d+)\s*bed/i);
            const bathsMatch = cardText.match(/(\d+)\s*bath/i);
            const beds  = bedsMatch  ? parseInt(bedsMatch[1])  : null;
            const baths = bathsMatch ? parseInt(bathsMatch[1]) : null;

            // ── Thumbnail images ─────────────────────────────────────
            const imageUrls = Array.from(card.querySelectorAll('img[src]'))
                .map(img => img.src || img.dataset?.src || img.dataset?.lazySrc || '')
                .filter(s => s && !s.startsWith('data:') && s.startsWith('http'))
                .slice(0, 4);

            if (!title && !priceText) continue;

            results.push({
                postUrl:      href,
                title:        title       || '',
                priceText:    priceText   || '',
                locationText: locationText || '',
                beds,
                baths,
                imageUrls,
                sourcePlatform: 'PrivateProperty',
            });
        }
        return results;
    });
}

// Visit a PrivateProperty.ng listing detail page.
// The phone number is hidden — clicking the "CALL" button reveals it.
async function scrapePPDetail(page, listingUrl) {
    try {
        await safeGoto(page, listingUrl);
        await delay(3000, 4000);

        // Click "CALL" / "Show number" button to reveal the phone
        try {
            const callBtn = await page.$(
                'a[href^="tel:"], button[class*="call"], button[class*="Call"], ' +
                '[class*="phone-reveal"], [class*="showPhone"], a[class*="call"], ' +
                'a[class*="Call"], .call-btn, [data-action*="call"]'
            );
            if (callBtn) {
                await callBtn.click();
                await delay(1500, 2000);
            }
        } catch (_) { /* button not present */ }

        return await page.evaluate(() => {
            // ── Description ──────────────────────────────────────────
            const descEl = document.querySelector(
                '[class*="description"], [class*="Description"], ' +
                '[itemprop="description"], .property-description, ' +
                '[class*="details"], [class*="Details"], article'
            );
            const description = (descEl?.innerText || descEl?.textContent || '').trim().slice(0, 2000);

            // ── Agent / seller name ───────────────────────────────────
            const agentEl = document.querySelector(
                '[class*="agent"], [class*="Agent"], [class*="seller"], ' +
                '[class*="contact-name"], [class*="advertiser"]'
            );
            const sellerName = (agentEl?.innerText || agentEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);

            // ── Phone number ─────────────────────────────────────────
            let phone = '';

            // 1. tel: link (most reliable — appears after CALL click)
            const telEl = document.querySelector('a[href^="tel:"]');
            if (telEl) {
                phone = telEl.getAttribute('href').replace('tel:', '').replace(/\s/g, '').trim();
            }

            // 2. data-phone attribute
            if (!phone || phone.length < 7) {
                const dataPhoneEl = document.querySelector('[data-phone]');
                if (dataPhoneEl) phone = dataPhoneEl.getAttribute('data-phone').replace(/\s/g, '').trim();
            }

            // 3. Grep full page text for Nigerian number
            if (!phone || phone.length < 7) {
                const bodyText = document.body.innerText || document.body.textContent || '';
                const match = bodyText.match(/(?:\+?234|0)[789]\d{9}/);
                if (match) phone = match[0].replace(/\s/g, '');
            }

            // ── Gallery images on detail page ────────────────────────
            const imageUrls = Array.from(document.querySelectorAll(
                '[class*="gallery"] img, [class*="Gallery"] img, ' +
                '[class*="slide"] img, [class*="photo"] img, ' +
                '[class*="carousel"] img, .property-image img, ' +
                '[class*="image"] img, [class*="Image"] img'
            ))
                .map(img => img.src || img.dataset?.src || img.dataset?.lazySrc || '')
                .filter(s => s && !s.startsWith('data:') && s.startsWith('http'))
                .slice(0, 6);

            // ── Beds / baths (detail page may show them more reliably) ─
            const bodyText = document.body.innerText || '';
            const bedsMatch  = bodyText.match(/(\d+)\s*bed/i);
            const bathsMatch = bodyText.match(/(\d+)\s*bath/i);
            const beds  = bedsMatch  ? parseInt(bedsMatch[1])  : null;
            const baths = bathsMatch ? parseInt(bathsMatch[1]) : null;

            return { description, sellerName, phone, imageUrls, beds, baths };
        });
    } catch (err) {
        console.log(`  [PP detail] ${err.message.slice(0, 60)}`);
        return { description: '', sellerName: '', phone: '', imageUrls: [], beds: null, baths: null };
    }
}

async function analyseWithGemini(rawText) {
    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `You are a Nigerian real estate analyst. Analyse this Facebook post.

Post:
"""
${rawText.slice(0, 1500)}
"""

Return JSON only. isPropertyListing=true ONLY if someone is ADVERTISING property for sale/rent/shortlet.
Extract agent/landlord phone number into agentNumber (Nigerian: 08xx, 07xx, 09xx, +234).
Use type "commercial" for shops/offices/warehouses. For land beds=0.`,
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
    const data = JSON.parse(response.text);

    // Gemini sometimes returns trustScore on a 0–1 scale instead of 0–100.
    // Normalise it so the < 35 threshold works correctly in both cases.
    if (data.trustDetails && data.trustDetails.trustScore <= 1) {
        data.trustDetails.trustScore = Math.round(data.trustDetails.trustScore * 100);
    }

    return data;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function startLocalScraper() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/easyfind');
    console.log('MongoDB Connected.');

    // Resolve Chrome executable — use Puppeteer's own executablePath() first,
    // then fall back to manual cache scan if that fails.
    const os = require('os');
    let executablePath;
    try {
        executablePath = puppeteer.executablePath();
        if (!executablePath || !fs.existsSync(executablePath)) throw new Error('not found');
        console.log(`✓ Chrome: ${executablePath}`);
    } catch (_) {
        // Manual fallback — scan the puppeteer cache directory
        try {
            const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
            const versions = fs.readdirSync(cacheDir).filter(d => d.startsWith('win'));
            if (versions.length > 0) {
                versions.sort().reverse();
                const candidate = path.join(cacheDir, versions[0], 'chrome-win64', 'chrome.exe');
                if (fs.existsSync(candidate)) {
                    executablePath = candidate;
                    console.log(`✓ Chrome (manual): ${executablePath}`);
                }
            }
        } catch (_2) { /* will use undefined — let Puppeteer try its default */ }
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1280, height: 900 },
        userDataDir: './user_session',
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
        ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setUserAgent(DESKTOP_UA);
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        // ── Facebook session check ────────────────────────────────────────
        // In headless/server mode there's no interactive login.
        // We rely on cookies saved in ./user_session from a prior local run.
        // If the session has expired the scraper still runs — it will just
        // pick up fewer results from public posts.
        console.log('Checking Facebook session...');
        await safeGoto(page, 'https://www.facebook.com');
        await delay(3000, 4000);
        const loginForm = await page.$('input[name="email"], #login_form');
        if (loginForm) {
            console.log('⚠ Facebook session expired or missing. Scraper will run on public posts only.');
            console.log('  Tip: Run once locally with headless:false to save a fresh session in ./user_session');
        } else {
            console.log('✓ Facebook: Session active.\n');
        }

        // ── Generate Facebook queries via Gemini ───────────────────────────
        const queries = await generateFacebookQueries();
        console.log('[Queries]', queries);

        const allPosts = [];

        // ── Scrape each query ──────────────────────────────────────────────
        for (const query of queries) {
            console.log(`\n[FB] "${query}"`);
            const posts = await scrapeFacebookPosts(page, query);
            console.log(`  Found ${posts.length} post(s).`);
            allPosts.push(...posts);
            await delay(4000, 6000);
        }

        console.log(`\n[Processing] ${allPosts.length} total posts collected.`);
        const toProcess = allPosts.slice(0, 20); // max 20 per run (Gemini free tier)
        console.log(`[Processing] Analysing top ${toProcess.length}...\n`);

        let totalSaved = 0;
        const sessionSeen = new Set();

        for (let i = 0; i < toProcess.length; i++) {
            const item = toProcess[i];
            console.log(`\n[${i + 1}/${toProcess.length}] ${item.postUrl}`);
            console.log(`  "${item.rawText.slice(0, 120).replace(/\n/g, ' ')}"`);
            console.log(`  Images: ${item.imageUrls?.length || 0}`);

            const fp = item.rawText.slice(0, 80).replace(/\s+/g, ' ').toLowerCase();
            if (sessionSeen.has(fp))               { console.log('  → Seen this session.'); continue; }
            sessionSeen.add(fp);
            if (!hasPropertyKeyword(item.rawText))  { console.log('  → No property keywords.'); continue; }
            if (isSeeker(item.rawText))             { console.log('  → Seeker post.'); continue; }

            const exists = await AgentPost.exists({ postUrl: item.postUrl });
            if (exists) { console.log('  → Already in DB.'); continue; }

            // ── Fetch post detail: first comment + poster name + profile URL ──
            // Adds extra info (phone numbers often live in comments or the profile)
            let enrichedText = item.rawText;
            let posterProfileUrl = '';
            const realPostUrl = !item.postUrl.includes('/search/posts/?t=');
            if (realPostUrl) {
                console.log('  → Fetching post detail (comments + poster name)...');
                const detail = await fetchPostDetail(page, item.postUrl);
                if (detail.posterName) {
                    enrichedText = `Poster: ${detail.posterName}\n\n${enrichedText}`;
                    console.log(`  → Poster: ${detail.posterName}`);
                }
                if (detail.firstComment) {
                    enrichedText += `\n\nFirst comment: ${detail.firstComment}`;
                    console.log(`  → Comment: "${detail.firstComment.slice(0, 80)}"`);
                }
                if (detail.posterProfileUrl) {
                    posterProfileUrl = detail.posterProfileUrl;
                    console.log(`  → Profile URL: ${posterProfileUrl}`);
                }
                await delay(1500, 2500); // brief pause before Gemini
            }

            try {
                console.log('  → Gemini...');
                const data = await analyseWithGemini(enrichedText);
                console.log(`  listing=${data.isPropertyListing} trust=${data.trustDetails?.trustScore} risk=${data.trustDetails?.riskLevel} phone="${data.agentNumber}" price=₦${data.pricingDetails?.baseRentOrPrice} beds=${data.beds}`);

                if (!data.isPropertyListing) { console.log('  → Not a listing.'); continue; }
                if (data.trustDetails.riskLevel === 'high' || data.trustDetails.trustScore < 35) {
                    console.log('  ⚠ High risk, blocked.'); continue;
                }

                // ── Profile phone fallback ─────────────────────────────────
                // If Gemini couldn't find a phone number, try the poster's FB profile About page
                const phoneClean = (data.agentNumber || '').replace(/\s/g, '');
                if ((!phoneClean || phoneClean === 'N/A' || phoneClean.length < 7) && posterProfileUrl) {
                    console.log('  → Phone missing — checking agent FB profile...');
                    const profilePhone = await fetchAgentProfilePhone(page, posterProfileUrl);
                    if (profilePhone) {
                        data.agentNumber = profilePhone;
                        console.log(`  → Profile phone used: ${profilePhone}`);
                        enrichedText += `\n\nPhone (from profile): ${profilePhone}`;
                    }
                    await delay(1500, 2500);
                }

                const check = isComplete(data);
                if (!check.ok) { console.log(`  → Incomplete (${check.reason}).`); continue; }

                // Download images
                let savedImages = [];
                if (item.imageUrls?.length) {
                    savedImages = await downloadImages(item.imageUrls, 'scraped_fb', 4);
                    if (savedImages.length) console.log(`  → Downloaded ${savedImages.length} image(s).`);
                }

                const price  = data.pricingDetails.totalPackage || data.pricingDetails.baseRentOrPrice || 0;
                const priceDisplay = price > 0 ? `₦${Number(price).toLocaleString()}` : 'Contact agent for price';
                const report = `\n\n---\n**Price:** ${priceDisplay} | **Trust:** ${data.trustDetails.trustScore}/100 | **Risk:** ${data.trustDetails.riskLevel.toUpperCase()} | **Source:** Facebook`;

                await AgentPost.create({
                    agentId:           'scraped',
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
                    description:       (data.description || enrichedText.slice(0, 500)) + report,
                    features:          data.features          || [],
                    imageNames:        savedImages,
                    postUrl:           item.postUrl,
                    platform:          'Facebook',
                    trustScore:        data.trustDetails.trustScore,
                    riskLevel:         data.trustDetails.riskLevel,
                    scrapedAt:         new Date(),
                    latitude:          null,
                    longitude:         null,
                });

                console.log(`  ✓ Saved: "${data.title}" | ${data.location} | ${priceDisplay} | ${data.agentNumber} | ${savedImages.length} img(s)`);
                totalSaved++;

            } catch (aiErr) {
                console.error(`  ✗ Gemini error: ${aiErr.message}`);
            }

            await delay(6000, 9000); // stay within Gemini 15 RPM free tier
        }

        console.log(`\n✓ Facebook done. Saved ${totalSaved} new listings.`);

        // ══════════════════════════════════════════════════════════════════
        // ── PRIVATEPROPERTY.NG SCRAPER ────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════
        console.log('\n\n════════════════════════════════');
        console.log('  PRIVATEPROPERTY.NG SCRAPER');
        console.log('════════════════════════════════');

        let ppSaved = 0;
        const ppAllListings = [];

        // Collect cards across pages 1–PP_MAX_PAGES
        for (let pg = 1; pg <= PP_MAX_PAGES; pg++) {
            console.log(`\n[PP] Page ${pg}/${PP_MAX_PAGES}`);
            const listings = await scrapePPListings(page, pg);
            console.log(`  Found ${listings.length} listing(s).`);
            ppAllListings.push(...listings);
            await delay(3000, 5000);
        }

        // Deduplicate by URL
        const ppUnique = [];
        const ppSeenUrls = new Set();
        for (const item of ppAllListings) {
            if (item.postUrl && !ppSeenUrls.has(item.postUrl)) {
                ppSeenUrls.add(item.postUrl);
                ppUnique.push(item);
            }
        }

        console.log(`\n[PP] ${ppUnique.length} unique listings collected. Processing up to 15...\n`);
        const ppToProcess = ppUnique.slice(0, 15);

        for (let i = 0; i < ppToProcess.length; i++) {
            const item = ppToProcess[i];
            console.log(`\n[PP ${i + 1}/${ppToProcess.length}] ${item.postUrl}`);
            console.log(`  "${item.title}" | ${item.priceText}`);

            // Skip if already in DB
            const exists = await AgentPost.exists({ postUrl: item.postUrl });
            if (exists) { console.log('  → Already in DB.'); continue; }

            // ── Visit detail page ──────────────────────────────────────
            console.log('  → Fetching detail page...');
            const detail = await scrapePPDetail(page, item.postUrl);

            // Merge card + detail into a rich text block for Gemini
            // Prefer detail-page beds/baths over card values
            const beds  = detail.beds  ?? item.beds  ?? null;
            const baths = detail.baths ?? item.baths ?? null;

            const rawText = [
                item.title         ? `Title: ${item.title}`           : '',
                item.priceText     ? `Price: ${item.priceText}`       : '',
                item.locationText  ? `Location: ${item.locationText}` : '',
                detail.sellerName  ? `Agent: ${detail.sellerName}`    : '',
                detail.phone       ? `Phone: ${detail.phone}`         : '',
                beds  !== null     ? `Bedrooms: ${beds}`              : '',
                baths !== null     ? `Bathrooms: ${baths}`            : '',
                detail.description ? `\n${detail.description}`        : '',
            ].filter(Boolean).join('\n').trim();

            if (!rawText || rawText.length < 30) { console.log('  → No content.'); continue; }
            if (!hasPropertyKeyword(rawText))     { console.log('  → No property keywords.'); continue; }

            // Use detail-page images if available, fall back to card thumbnails
            const imageUrls = detail.imageUrls?.length ? detail.imageUrls : item.imageUrls;

            if (detail.phone)      console.log(`  → Phone: ${detail.phone}`);
            if (detail.sellerName) console.log(`  → Agent: ${detail.sellerName}`);

            try {
                console.log('  → Gemini...');
                const data = await analyseWithGemini(rawText);
                console.log(`  listing=${data.isPropertyListing} trust=${data.trustDetails?.trustScore} risk=${data.trustDetails?.riskLevel} phone="${data.agentNumber}" price=₦${data.pricingDetails?.baseRentOrPrice} beds=${data.beds}`);

                if (!data.isPropertyListing) { console.log('  → Not a listing.'); continue; }
                if (data.trustDetails.riskLevel === 'high' || data.trustDetails.trustScore < 35) {
                    console.log('  ⚠ High risk, blocked.'); continue;
                }

                // Normalise trust score if Gemini returned 0–1 scale
                if (data.trustDetails.trustScore <= 1) {
                    data.trustDetails.trustScore = Math.round(data.trustDetails.trustScore * 100);
                }

                // If Gemini missed the phone but we scraped it directly, use it
                const phoneClean = (data.agentNumber || '').replace(/\s/g, '');
                if ((!phoneClean || phoneClean === 'N/A' || phoneClean.length < 7) && detail.phone) {
                    data.agentNumber = detail.phone;
                    console.log(`  → Used scraped phone: ${detail.phone}`);
                }

                const check = isComplete(data);
                if (!check.ok) { console.log(`  → Incomplete (${check.reason}).`); continue; }

                // Download images
                let savedImages = [];
                if (imageUrls?.length) {
                    savedImages = await downloadImages(imageUrls, 'scraped_pp', 4);
                    if (savedImages.length) console.log(`  → Downloaded ${savedImages.length} image(s).`);
                }

                const price       = data.pricingDetails.totalPackage || data.pricingDetails.baseRentOrPrice || 0;
                const priceDisplay = price > 0 ? `₦${Number(price).toLocaleString()}` : 'Contact agent for price';
                const report      = `\n\n---\n**Price:** ${priceDisplay} | **Trust:** ${data.trustDetails.trustScore}/100 | **Risk:** ${data.trustDetails.riskLevel.toUpperCase()} | **Source:** PrivateProperty.ng`;

                await AgentPost.create({
                    agentId:           'scraped',
                    agentNumber:       data.agentNumber,
                    agentName:         data.agentName         || detail.sellerName || 'Unknown Agent',
                    agentType:         data.agentType         || 'unknown',
                    contactPreference: data.contactPreference || 'unknown',
                    title:             data.title             || item.title,
                    type:              data.type              || 'apartment',
                    category:          data.category          || 'rent',
                    price,
                    location:          data.location          || item.locationText || 'Enugu',
                    beds:              data.beds              || beds  || 0,
                    baths:             data.baths             || baths || 0,
                    area:              data.area              || '0',
                    description:       (data.description || rawText.slice(0, 500)) + report,
                    features:          data.features          || [],
                    imageNames:        savedImages,
                    postUrl:           item.postUrl,
                    platform:          'PrivateProperty',
                    trustScore:        data.trustDetails.trustScore,
                    riskLevel:         data.trustDetails.riskLevel,
                    scrapedAt:         new Date(),
                    latitude:          null,
                    longitude:         null,
                });

                console.log(`  ✓ Saved: "${data.title || item.title}" | ${data.location} | ${priceDisplay} | ${data.agentNumber} | ${savedImages.length} img(s)`);
                ppSaved++;

            } catch (aiErr) {
                console.error(`  ✗ Gemini error: ${aiErr.message}`);
            }

            await delay(6000, 9000); // stay within Gemini free tier
        }

        console.log(`\n✓ PrivateProperty done. Saved ${ppSaved} new listings.`);
        console.log(`\n✓ Total saved this run: ${totalSaved + jijiSaved} (Facebook: ${totalSaved} | Jiji: ${jijiSaved})`);

    } catch (err) {
        console.error('Fatal:', err.message, err.stack);
    } finally {
        await browser.close();
        await mongoose.disconnect();
        console.log('Browser and DB closed.');
    }
}

// Run directly: node routes/localScraper.js
// Or imported by app.js cron — only auto-runs when called directly
if (require.main === module) {
    startLocalScraper();
}

module.exports = startLocalScraper;
