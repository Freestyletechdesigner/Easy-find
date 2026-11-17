/**
 * EasyFind Property NLP Parser
 * ==============================
 * Parses free-text natural language queries into structured MongoDB filters.
 * No external API. Runs entirely in Node.js memory.
 *
 * Examples of what it understands:
 *  "2 bedroom flat in GRA under 2 million"
 *  "find house with 2 rooms"
 *  "affordable land in Enugu for sale"
 *  "3 bed apartment for rent below 500k"
 *  "shortlet in new haven"
 *  "luxury duplex with 4 rooms above 10m"
 */

'use strict';

// ─── Property Type Synonyms ───────────────────────────────────────────────────
const TYPE_MAP = {
    house:      ['house', 'home', 'duplex', 'bungalow', 'mansion', 'terrace', 'semi-detached', 'detached', 'building', 'storey', 'face me and face you'],
    apartment:  ['apartment', 'flat', 'studio', 'unit', 'mini flat', 'self-contain', 'self contain', 'room'],
    land:       ['land', 'plot', 'plots', 'acre', 'acres', 'hectare', 'bare land', 'open land'],
    villa:      ['villa', 'chalet', 'lodge', 'resort'],
    commercial: ['commercial', 'shop', 'store', 'office', 'plaza', 'warehouse', 'showroom', 'factory', 'workshop'],
};

// ─── Category Synonyms ────────────────────────────────────────────────────────
const CATEGORY_MAP = {
    sale:     ['sale', 'sell', 'buy', 'purchase', 'buying', 'selling', 'for sale', 'outright'],
    shortlet: ['shortlet', 'short let', 'short-let', 'shortlets', 'airbnb', 'nightly', 'daily', 'weekly', 'holiday'],
    rent:     ['rent', 'rental', 'renting', 'lease', 'letting', 'let', 'for rent', 'annually', 'monthly', 'yearly'],
};

// ─── Price Multipliers ────────────────────────────────────────────────────────
const PRICE_MULTIPLIERS = {
    k:        1_000,
    thousand: 1_000,
    m:        1_000_000,
    million:  1_000_000,
    b:        1_000_000_000,
    billion:  1_000_000_000,
};

// ─── Location Keywords ────────────────────────────────────────────────────────
// Static seed list — covers all known Enugu locations.
// New locations posted by agents are merged in at runtime via learnLocations().
const STATIC_LOCATION_HINTS = [
    // Enugu Urban / Metropolis Neighbourhoods
    'gra', 'new haven', 'trans ekulu', 'independence layout', 'independence',
    'achara layout', 'achara', 'abakpa', 'abakpa nike', 'ogui', 'ogui new layout',
    'uwani', 'coal camp', 'emene', 'gariki', 'garriki', 'asata', 'maryland',
    'awkunanaw', 'obiagu', 'iva valley', 'ugwuaji', 'thinkers corner',
    'golf course estate', 'ekulu layout', 'mbanefo', 'ogbete', 'artisan',
    'china town', 'centenary city',
    'presidential road', 'okpara avenue', 'garden avenue', 'chime avenue', 'ogui road',
    // Core Capital LGAs
    'enugu north', 'enugu south', 'enugu east', 'enugu',
    // Major Towns & Smart City Hubs
    'nsukka', 'udi', 'awgu', 'agbani', 'nike', 'amechi', 'ozalla', 'nine mile', '9th mile',
    'jiwuani', 'orji river', 'oji river', 'obollo afor', 'obollo', 'ituku', 'ngwo',
    'umunede', 'nkanu', 'nkanu east', 'nkanu west', 'ezeagu', 'isi uzo', 'udenu',
    'igbo etiti', 'igbo eze', 'igbo eze north', 'igbo eze south',
    'uzouwani', 'uzo uwani', 'aninri', 'amagunze', 'ogbede', 'adanni', 'adani',
    // Institutional / Campus Layouts
    'unec', 'esut', 'unn', 'imthe', 'caritas', 'nss estate', 'nss campus', 'ekulu',
];

// Runtime list — starts with static hints, grows as agents post new locations
let LOCATION_HINTS = [...STATIC_LOCATION_HINTS];

/**
 * Pull every distinct property location from the DB and merge new ones in.
 * Called on startup + every 10 min from the property-search route.
 * Only ever adds — never removes existing entries.
 *
 * @param {object} AgentPost  The AgentPost mongoose model
 */
async function learnLocations(AgentPost) {
    try {
        const rawLocations = await AgentPost.distinct('location');
        let added = 0;
        for (const raw of rawLocations) {
            if (!raw) continue;
            const normalised = raw.toLowerCase().replace(/\s+/g, ' ').trim();
            if (normalised.length < 2) continue;
            if (!LOCATION_HINTS.includes(normalised)) {
                LOCATION_HINTS.push(normalised);
                added++;
            }
        }
        if (added > 0) {
            console.log(`[Property Parser] Learned ${added} new location(s). Total known: ${LOCATION_HINTS.length}`);
        }
    } catch (err) {
        console.error('[Property Parser] learnLocations error:', err.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise text: lowercase, collapse whitespace */
function normalise(text) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Parse a price token + optional multiplier.
 * e.g. "2m", "500k", "2 million", "1.5m"
 */
function parsePrice(numStr, unitStr) {
    const num = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(num)) return null;
    const unit = (unitStr || '').toLowerCase().replace(/[^a-z]/g, '');
    const multiplier = PRICE_MULTIPLIERS[unit] || 1;
    return Math.round(num * multiplier);
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a natural language query into structured filters.
 *
 * @param {string} query  Raw user input
 * @returns {object} { type, category, minBeds, maxBeds, minPrice, maxPrice, location, rawQuery }
 */
function parsePropertyQuery(query) {
    const q   = normalise(query);
    const out = {
        type:     null,
        category: null,
        minBeds:  null,
        maxBeds:  null,
        minPrice: null,
        maxPrice: null,
        location: null,
        rawQuery: query,
    };

    // ── 1. Property Type ──────────────────────────────────────────────────────
    for (const [type, keywords] of Object.entries(TYPE_MAP)) {
        if (keywords.some(kw => q.includes(kw))) {
            out.type = type;
            break;
        }
    }

    // ── 2. Category ───────────────────────────────────────────────────────────
    for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
        if (keywords.some(kw => q.includes(kw))) {
            out.category = cat;
            break;
        }
    }

    // ── 3. Bedroom Count ─────────────────────────────────────────────────────
    const bedMatch1 = q.match(/(\d+)\s*[-]?\s*(?:bed(?:room)?s?|br|room[s]?)/i);
    const bedMatch2 = q.match(/(?:at\s+least|minimum|min|more\s+than|over)\s+(\d+)\s*(?:bed(?:room)?s?|br|room[s]?)/i);
    const bedMatch3 = q.match(/(?:up\s+to|maximum|max|less\s+than|under|below)\s+(\d+)\s*(?:bed(?:room)?s?|br|room[s]?)/i);

    if (bedMatch2) {
        out.minBeds = parseInt(bedMatch2[1]);
    } else if (bedMatch3) {
        out.maxBeds = parseInt(bedMatch3[1]);
    } else if (bedMatch1) {
        out.minBeds = parseInt(bedMatch1[1]);
        out.maxBeds = parseInt(bedMatch1[1]);
    }

    // ── 4. Price ──────────────────────────────────────────────────────────────
    // Between range: "between 1m and 5m" or "1m to 5m"
    const rangeMatch = q.match(/(?:between\s+)?([₦]?[\d,]+(?:\.\d+)?)\s*([kmb]|thousand|million|billion)?\s*(?:to|and|-)\s*([₦]?[\d,]+(?:\.\d+)?)\s*([kmb]|thousand|million|billion)?/i);
    if (rangeMatch) {
        const p1 = parsePrice(rangeMatch[1].replace('₦', ''), rangeMatch[2]);
        const p2 = parsePrice(rangeMatch[3].replace('₦', ''), rangeMatch[4]);
        if (p1 && p2) {
            out.minPrice = Math.min(p1, p2);
            out.maxPrice = Math.max(p1, p2);
        }
    }

    if (!out.minPrice && !out.maxPrice) {
        const maxMatch = q.match(/(?:under|below|less\s+than|not\s+more\s+than|max(?:imum)?|within)\s+[₦]?([\d,]+(?:\.\d+)?)\s*([kmb]|thousand|million|billion)?/i);
        if (maxMatch) out.maxPrice = parsePrice(maxMatch[1], maxMatch[2]);

        const minMatch = q.match(/(?:above|over|more\s+than|at\s+least|min(?:imum)?|from)\s+[₦]?([\d,]+(?:\.\d+)?)\s*([kmb]|thousand|million|billion)?/i);
        if (minMatch) out.minPrice = parsePrice(minMatch[1], minMatch[2]);
    }

    // Avalable for all price
    if (!out.minPrice && !out.maxPrice) {
        const standaloneMatch = q.match(/[₦]?([\d,]{4,})/);
        if (standaloneMatch) {
            const val = parseFloat(standaloneMatch[1].replace(/,/g, ''));
            
            if (!isNaN(val) && val > 999) {
                // Check if the query contains explicit target keywords like "is", "at", "exactly", "equal to"
                const isExactMatch = /\b(is|at|exactly|worth|equal\s+to)\b/.test(q);
                
                if (isExactMatch) {
                    // Create a tight range around the target price (e.g. within 1% or exactly)
                    // This forces MongoDB to look directly for that price instead of everything below it
                    out.minPrice = val * 0.99; // 19,800,000
                    out.maxPrice = val * 1.01; // 20,200,000
                } else {
                    // If no explicit word is used, fall back to treating it as a maximum ceiling
                    out.maxPrice = val;
                }
            }
        }
    }

    // ── 5. Location ───────────────────────────────────────────────────────────
    // Sort by length descending so "independence layout" matches before "independence"
    const sorted = [...LOCATION_HINTS].sort((a, b) => b.length - a.length);
    for (const loc of sorted) {
        if (q.includes(loc)) {
            out.location = loc;
            break;
        }
    }

    // Fallback: extract "in <place>" or "at <place>" if no known location matched
    if (!out.location) {
        const locMatch = q.match(/(?:in|at|around|near|within)\s+([a-z0-9][a-z0-9\s-]{1,30}?)(?:\s+(?:area|layout|estate|road|street|avenue|close|crescent|drive))?(?:\s|$)/i);
        if (locMatch) {
            const rawLoc = locMatch[1].trim().replace(/\s+/g, ' ');
            const locWords = rawLoc.split(' ').slice(0, 3).join(' ');
            if (locWords.length > 2) out.location = locWords;
        }
    }

    return out;
}

module.exports = { parsePropertyQuery, learnLocations };
