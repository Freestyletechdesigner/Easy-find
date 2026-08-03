'use strict';

/**
 * Easy Find — Social Media Property Pipeline (Consolidated Edition)
 * =========================================================================
 * Replaced: Apify client
 * Now uses: RapidAPI Facebook Search & Instagram Hashtags
 *
 * Flow:
 *  1. Search Facebook and Instagram for listings via RapidAPI
 *  2. Analyse posts with Gemini AI to extract property details & verify trust
 *  3. Save all matching, verified listings directly to ScrapedAgent documents
 */

const mongoose     = require('mongoose');
const axios        = require('axios');
const { GoogleGenAI } = require('@google/genai');
const ScrapedAgent = require('../model/ScrapedAgent.js'); // Import consolidated model

// ── Clients ───────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY });

// ── Config ────────────────────────────────────────────────────────────────────
const RAPIDAPI_KEY      = process.env.RAPIDAPI_KEY;
const FB_HOST           = process.env.RAPIDAPI_FACEBOOK_HOST || 'facebook-scraper3.p.rapidapi.com';

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

        const response = await axios.get(
            `https://${FB_HOST}/search/posts`,
            {
                params:  { query: keyword, limit: 10 },
                headers: rapidApiHeaders(FB_HOST),
                timeout: 20000,
            }
        );

        const raw = response.data;
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

// ── Gemini AI: Advanced Verification Analysis ──────────────────────────────────
async function analyseWithGemini(rawText) {
    const prompt = `Extract real estate property listing details, verify legitimacy, and extract contact information from this social media post.

Analyze for the following scam indicators common in the Nigerian housing market:
- Pricing is suspiciously low for the stated neighborhood (e.g. self-contained flat in Independence Layout or Trans Ekulu for ₦50,000/year).
- Demands booking, commitment, or inspection fees prior to viewing.
- The post mentions locations outside of Enugu state (like Lekki, Lagos, or Ikeja) despite being targeted for Enugu.
- Details are highly pressured, inconsistent, or evasive.

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
                    trustDetails: {
                        type: 'object',
                        properties: {
                            trustScore: {
                                type: 'number',
                                description: 'A rating from 0 to 100 on the legitimacy of this post. Deduct points for missing contact names, suspiciously cheap prices, or pre-inspection fee demands.'
                            },
                            riskLevel: {
                                type: 'string',
                                enum: ['low', 'medium', 'high'],
                                description: 'Risk level based on suspicious factors detected.'
                            },
                            riskFlags: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'A list of suspicious signals found in the text. Keep empty if clean.'
                            },
                            scamReason: {
                                type: 'string',
                                description: 'Detailed reason why this post is classified as suspicious or high-risk. Empty if low risk.'
                            }
                        },
                        required: ['trustScore', 'riskLevel', 'riskFlags', 'scamReason']
                    },
                    pricingDetails: {
                        type: 'object',
                        properties: {
                            baseRentOrPrice: {
                                type: 'number',
                                description: 'The raw cost of the property/rent as stated. 0 if not stated.'
                            },
                            agencyFee: {
                                type: 'number',
                                description: 'Commission fee (Agreement/Agency). 0 if not mentioned.'
                            },
                            legalFee: {
                                type: 'number',
                                description: 'Legal/Agreement signing fee. 0 if not mentioned.'
                            },
                            cautionDeposit: {
                                type: 'number',
                                description: 'Caution or damages deposit fee. 0 if not mentioned.'
                            },
                            totalPackage: {
                                type: 'number',
                                description: 'Total initial payment required (Base rent + Agency + Legal + Caution). Calculate logically if individual fees are stated separately.'
                            }
                        },
                        required: ['baseRentOrPrice', 'totalPackage']
                    },
                    title:    { type: 'string', description: 'Brief clean title.' },
                    type:     { type: 'string', enum: ['house','apartment','land','villa','commercial'] },
                    category: { type: 'string', enum: ['sale','rent','shortlet'] },
                    location: { type: 'string', description: 'Standardized location or neighborhood (e.g., Independence Layout, Trans Ekulu, Achara Layout, Enugu).' },
                    beds:     { type: 'number', description: 'Bedrooms. 0 if not applicable.' },
                    baths:    { type: 'number', description: 'Bathrooms. 0 if not applicable.' },
                    area:     { type: 'string', description: 'Plot or floor area. "0" if unknown.' },
                    description: { type: 'string', description: 'A descriptive summary extracted from the text.' },
                    features: { type: 'array', items: { type: 'string' }, description: 'Amenities/features.' },
                    agentNumber: {
                        type: 'string',
                        description: 'The phone number or WhatsApp contact of the poster. Format cleanly as numbers (e.g., +234..., 080...). Empty if not found.'
                    },
                    agentName: {
                        type: 'string',
                        description: 'The name of the agent or agency if mentioned. Empty if not found.'
                    },
                    agentType: {
                        type: 'string',
                        enum: ['agent', 'landlord', 'developer', 'unknown'],
                        description: 'Type of poster, parsed from the listing context.'
                    },
                    contactPreference: {
                        type: 'string',
                        enum: ['whatsapp', 'call', 'any', 'unknown'],
                        description: 'Preferred contact method based on text clues.'
                    }
                },
                required: ['isPropertyListing', 'trustDetails', 'pricingDetails', 'title', 'type', 'category', 'location']
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
        let scamsBlocked = 0;

        for (let i = 0; i < deduplicated.length; i++) {
            const item = deduplicated[i];
            console.log(`\n[${i + 1}/${deduplicated.length}] ${item.sourcePlatform}: ${item.postUrl}`);

            // Deduplication Check: Exact search on the ScrapedAgent postUrl field (very fast)
            const exists = await ScrapedAgent.exists({ postUrl: item.postUrl });

            if (exists) {
                console.log('  → Already in DB, skipping.');
                skipped++;
                continue;
            }

            // Analyse and Verify with Gemini
            try {
                const data = await analyseWithGemini(item.rawText);

                if (data.isPropertyListing) {
                    
                    // --- THE ANTI-SCAM SECURITY GATE ---
                    if (data.trustDetails.riskLevel === 'high' || data.trustDetails.trustScore < 40) {
                        console.log(`  ⚠ [VERIFICATION FAILED - SCAM FLAG] Skipped: "${data.title}"`);
                        console.log(`    Risk level: ${data.trustDetails.riskLevel.toUpperCase()} | Trust Score: ${data.trustDetails.trustScore}/100`);
                        console.log(`    Reason: ${data.trustDetails.scamReason || 'Fails security baseline checks'}`);
                        console.log(`    Flags: ${data.trustDetails.riskFlags.join(', ') || 'None'}`);
                        scamsBlocked++;
                        continue;
                    }

                    // --- GENERATE COST PACKAGE AND TRUST MARKDOWN REPORT ---
                    const formatCurrency = (val) => val > 0 ? `₦${val.toLocaleString()}` : 'Not Specified';
                    
                    const verificationReport = `
### 🛡 Verification & Cost Report
| Parameter | Value / Status |
| :--- | :--- |
| **Verification Rating** | ${data.trustDetails.trustScore}/100 (${data.trustDetails.riskLevel.toUpperCase()} RISK) |
| **Detected Risk Signals** | ${data.trustDetails.riskFlags.length > 0 ? data.trustDetails.riskFlags.join(', ') : 'None (Passed Security Checks)'} |
| **Poster Profile** | ${data.agentType.toUpperCase()} |
| **Preferred Contact** | ${data.contactPreference.toUpperCase()} |

### 💰 Cost Package Breakdown
| Fee Category | Amount |
| :--- | :--- |
| **Base Rent / Price** | ${formatCurrency(data.pricingDetails.baseRentOrPrice)} |
| **Agency / Commission Fee** | ${formatCurrency(data.pricingDetails.agencyFee)} |
| **Legal / Agreement Fee** | ${formatCurrency(data.pricingDetails.legalFee)} |
| **Caution / Security Deposit** | ${formatCurrency(data.pricingDetails.cautionDeposit)} |
| **Total Out-of-Pocket Package** | **${formatCurrency(data.pricingDetails.totalPackage)}** |
`;

                    const finalDescription = `${data.description || ''}\n\n${verificationReport}\n\n[Source: ${item.postUrl}]`;

                    // Save directly and only to the ScrapedAgent Collection
                    await ScrapedAgent.create({
                        // Contact Info
                        agentNumber: data.agentNumber && data.agentNumber.trim() !== '' ? data.agentNumber.trim() : 'N/A',
                        agentName:   data.agentName && data.agentName.trim() !== '' ? data.agentName.trim() : 'Unknown Agent',
                        agentType:   data.agentType || 'unknown',
                        contactPreference: data.contactPreference || 'unknown',

                        // Listing details
                        title:       data.title       || 'Property Listing',
                        type:        data.type        || 'house',
                        category:    data.category    || 'rent',
                        price:       data.pricingDetails.totalPackage || data.pricingDetails.baseRentOrPrice || 0,
                        location:    data.location    || 'Enugu',
                        beds:        data.beds        || 0,
                        baths:       data.baths       || 0,
                        area:        data.area        || '0',
                        description: finalDescription,
                        features:    data.features    || [],
                        imageNames:  item.images      || [],

                        // Platform & Trust
                        postUrl:     item.postUrl,
                        platform:    item.sourcePlatform,
                        trustScore:  data.trustDetails.trustScore,
                        riskLevel:   data.trustDetails.riskLevel,
                        scrapedAt:   item.timestamp ? new Date(item.timestamp) : new Date()
                    });

                    console.log(`  ✓ Saved Consolidated Post to ScrapedAgent collection (Trust: ${data.trustDetails.trustScore}/100)`);
                    saved++;
                } else {
                    console.log('  → Not a property listing, skipping.');
                    skipped++;
                }
            } catch (geminiErr) {
                console.error(`  ✗ Gemini error: ${geminiErr.message}`);
            }

            // Delay between Gemini calls (4.5s delay to keep under the 15 RPM free tier limit)
            await new Promise(r => setTimeout(r, 4500));
        }

        console.log(`\n[Pipeline] Done. Saved to ScrapedAgent: ${saved} | Skipped: ${skipped} | Scams Blocked: ${scamsBlocked}`);

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