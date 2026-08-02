'use strict';

/**
 * Easy Find — Social Media Property Pipeline
 * ============================================
 * Replaced: Apify client
 * Now uses: RapidAPI Facebook Search (no Apify SDK needed)
 *
 * Flow:
 *  1. Search Facebook for property-related keywords via RapidAPI
 *  2. Search Instagram hashtags via RapidAPI
 *  3. Analyse each post with Gemini AI to extract structured property data
 *  4. Save valid listings to MongoDB as AgentPost documents
 */

const mongoose     = require('mongoose');
const axios        = require('axios');
const { GoogleGenAI } = require('@google/genai');
const AgentPost    = require('../model/AgentPost.js');

// ── Clients ───────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY });

// ── Config ────────────────────────────────────────────────────────────────────
const RAPIDAPI_KEY      = process.env.RAPIDAPI_KEY;
const FB_HOST           = process.env.RAPIDAPI_FACEBOOK_HOST || 'facebook-scraper3.p.rapidapi.com';
const SCRAPER_AGENT_ID  = process.env.SCRAPED_POSTS_AGENT_ID  || 'facebook_scraper_system';

// Search keywords — add/remove as needed
const FACEBOOK_KEYWORDS = [
    'house for rent Enugu',
    'apartment for rent Enugu',
    'land for sale Enugu',
    'property for sale Enugu',
    'flat to let Enugu',
    'duplex Enugu shortlet',
];

const INSTAGRAM_HASHTAGS = [
    'enugurealestate',
    'enuguhouses',
    'enuguapartment',
    'enuguland',
];

// ── RapidAPI headers helper ───────────────────────────────────────────────────
function rapidApiHeaders(host) {
    return {
        'x-rapidapi-key':  RAPIDAPI_KEY,
        'x-rapidapi-host': host,
        'Content-Type':    'application/json',
    };
}

// ── Facebook Search via RapidAPI ──────────────────────────────────────────────
async function searchFacebook(keyword) {
    try {
        console.log(`[Facebook] Searching: "${keyword}"`);

        // Primary endpoint — facebook-scraper3
        const response = await axios.get(
            `https://${FB_HOST}/search/posts`,
            {
                params:  { query: keyword, limit: 10 },
                headers: rapidApiHeaders(FB_HOST),
                timeout: 20000,
            }
        );

        const raw = response.data;

        // Normalize response — different APIs return different shapes
        const items = raw?.data || raw?.results || raw?.posts || raw?.items || [];

        return items.map(item => ({
            sourcePlatform: 'Facebook',
            rawText:    item.text || item.message || item.caption || item.content || '',
            postUrl:    item.url  || item.post_url || item.link || '',
            images:     item.images || item.photos || (item.image ? [item.image] : []) || [],
            timestamp:  item.timestamp || item.created_time || item.date || new Date(),
        })).filter(i => i.rawText && i.postUrl);

    } catch (err) {
        const status = err.response?.status;
        console.error(`[Facebook] Search failed for "${keyword}": ${status || err.message}`);

        // If the primary host fails, try alternate RapidAPI endpoint
        if (status === 404 || status === 422 || !status) {
            return await searchFacebookAlternate(keyword);
        }
        return [];
    }
}

// ── Fallback: alternate RapidAPI Facebook endpoint ────────────────────────────
async function searchFacebookAlternate(keyword) {
    const ALT_HOST = 'facebook-posts-search.p.rapidapi.com';
    try {
        console.log(`[Facebook] Trying alternate endpoint for: "${keyword}"`);
        const response = await axios.get(
            `https://${ALT_HOST}/search`,
            {
                params:  { q: keyword, type: 'posts', limit: '10' },
                headers: rapidApiHeaders(ALT_HOST),
                timeout: 20000,
            }
        );

        const raw   = response.data;
        const items = raw?.data || raw?.results || raw?.posts || [];

        return items.map(item => ({
            sourcePlatform: 'Facebook',
            rawText:   item.text || item.message || item.caption || '',
            postUrl:   item.url  || item.link    || '',
            images:    item.images || [],
            timestamp: item.timestamp || new Date(),
        })).filter(i => i.rawText && i.postUrl);

    } catch (err) {
        console.error(`[Facebook] Alternate search also failed: ${err.message}`);
        return [];
    }
}

// ── Instagram Search via RapidAPI ─────────────────────────────────────────────
async function searchInstagram(hashtag) {
    const IG_HOST = 'instagram-scraper-api2.p.rapidapi.com';
    try {
        console.log(`[Instagram] Hashtag: #${hashtag}`);
        const response = await axios.get(
            `https://${IG_HOST}/v1/hashtag`,
            {
                params:  { hashtag },
                headers: rapidApiHeaders(IG_HOST),
                timeout: 20000,
            }
        );

        const raw   = response.data;
        const items = raw?.data?.hashtag?.edge_hashtag_to_media?.edges || [];

        return items.map(edge => {
            const node = edge.node || {};
            return {
                sourcePlatform: 'Instagram',
                rawText:   node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                postUrl:   node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : '',
                images:    node.display_url ? [node.display_url] : [],
                timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000) : new Date(),
            };
        }).filter(i => i.rawText && i.postUrl);

    } catch (err) {
        console.error(`[Instagram] Hashtag #${hashtag} failed: ${err.message}`);
        return [];
    }
}

// ── Gemini AI: Analyse post text ──────────────────────────────────────────────
async function analyseWithGemini(rawText) {
    const prompt = `Extract real estate property listing details from this social media post.

Post Text:
"""
${rawText}
"""`;

    const response = await ai.models.generateContent({
        model:    'gemini-3.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    isPropertyListing: {
                        type: 'boolean',
                        description: 'True if this is a real estate listing for sale, rent, or shortlet.'
                    },
                    title:    { type: 'string', description: 'Brief clean title.' },
                    type:     { type: 'string', enum: ['house','apartment','land','villa','commercial'] },
                    category: { type: 'string', enum: ['sale','rent','shortlet'] },
                    price:    { type: 'number', description: 'Numeric price only. 0 if unknown.' },
                    location: { type: 'string', description: 'Location of the property.' },
                    beds:     { type: 'number', description: 'Bedrooms. 0 if not applicable.' },
                    baths:    { type: 'number', description: 'Bathrooms. 0 if not applicable.' },
                    area:     { type: 'string', description: 'Plot or floor area. "0" if unknown.' },
                    description: { type: 'string', description: 'Summary from post.' },
                    features: { type: 'array', items: { type: 'string' }, description: 'Amenities/features.' }
                },
                required: ['isPropertyListing', 'title', 'type', 'category', 'location']
            }
        }
    });

    return JSON.parse(response.text);
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────
async function runPipeline() {
    if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your_rapidapi_key_here') {
        console.error('[Pipeline] RAPIDAPI_KEY is not set. Skipping pipeline run.');
        return;
    }

    const isAlreadyConnected = mongoose.connection.readyState === 1;

    try {
        if (!isAlreadyConnected) {
            const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/easyfind';
            await mongoose.connect(mongoUri);
            console.log('[Pipeline] Connected to MongoDB');
        }

        const unifiedItems = [];

        // ── Section A: Facebook Search ────────────────────────────────────────
        for (const keyword of FACEBOOK_KEYWORDS) {
            const posts = await searchFacebook(keyword);
            unifiedItems.push(...posts);
            // Small delay to respect rate limits
            await new Promise(r => setTimeout(r, 3000));
        }

        // ── Section B: Instagram Hashtags ─────────────────────────────────────
        for (const hashtag of INSTAGRAM_HASHTAGS) {
            const posts = await searchInstagram(hashtag);
            unifiedItems.push(...posts);
            await new Promise(r => setTimeout(r, 3000));
        }

        // Deduplicate by postUrl
        const seen = new Set();
        const deduplicated = unifiedItems.filter(item => {
            if (seen.has(item.postUrl)) return false;
            seen.add(item.postUrl);
            return true;
        });

        console.log(`\n[Pipeline] Total unique posts to analyse: ${deduplicated.length}`);

        if (deduplicated.length === 0) {
            console.log('[Pipeline] No new posts found. Done.');
            return;
        }

        // ── Section C: Analyse + Save ─────────────────────────────────────────
        let saved = 0;
        let skipped = 0;

        for (let i = 0; i < deduplicated.length; i++) {
            const item = deduplicated[i];
            console.log(`\n[${i + 1}/${deduplicated.length}] ${item.sourcePlatform}: ${item.postUrl}`);

            // Skip if already in DB
            const escapedUrl = item.postUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const exists = await AgentPost.exists({
                description: { $regex: escapedUrl, $options: 'i' }
            });

            if (exists) {
                console.log('  → Already in DB, skipping.');
                skipped++;
                continue;
            }

            // Analyse with Gemini
            try {
                const data = await analyseWithGemini(item.rawText);
                console.log(`  → isPropertyListing: ${data.isPropertyListing} | ${data.title || '—'}`);

                if (data.isPropertyListing) {
                    await AgentPost.create({
                        agentId:     SCRAPER_AGENT_ID,
                        title:       data.title       || 'Property Listing',
                        type:        data.type        || 'house',
                        category:    data.category    || 'rent',
                        price:       data.price       || 0,
                        location:    data.location    || 'Enugu',
                        beds:        data.beds        || 0,
                        baths:       data.baths       || 0,
                        area:        data.area        || '0',
                        description: `${data.description || ''}\n\n[Source: ${item.postUrl}]`,
                        features:    data.features    || [],
                        imageNames:  item.images      || [],
                        date:        item.timestamp ? new Date(item.timestamp) : new Date(),
                    });
                    console.log(`  ✓ Saved: "${data.title}"`);
                    saved++;
                } else {
                    console.log('  → Not a property listing, skipping.');
                    skipped++;
                }
            } catch (geminiErr) {
                console.error(`  ✗ Gemini error: ${geminiErr.message}`);
            }

            // Delay between Gemini calls
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(`\n[Pipeline] Done. Saved: ${saved} | Skipped: ${skipped}`);

    } catch (err) {
        console.error('[Pipeline] Fatal error:', err.message);
    } finally {
        if (!isAlreadyConnected) {
            await mongoose.disconnect();
            console.log('[Pipeline] MongoDB disconnected.');
        }
    }
}

module.exports = { runPipeline };

// Run directly: node routes/runPipeline.js
if (require.main === module) {
    runPipeline();
}
