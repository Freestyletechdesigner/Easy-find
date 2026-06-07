/**
 * Property Search Route
 * ======================
 * POST /api/search/property
 *
 * Accepts a free-text query, parses it with the NLP parser,
 * builds a MongoDB query, and returns matching properties.
 */

'use strict';

const AgentPost              = require('../model/AgentPost.js');
const AgentUser              = require('../model/AgentUser.js');
const { parsePropertyQuery, learnLocations } = require('../ai/property-parser.js');

function PROPERTY_SEARCH(app) {

    // Learn locations from DB on startup, then refresh every 10 min
    learnLocations(AgentPost);
    setInterval(() => learnLocations(AgentPost), 10 * 60 * 1000);

    app.get('/api/search/property', async (req, res) => {
        try {
            const { q } = req.query;

            if (!q || !q.trim()) {
                return res.json({ success: true, properties: [], parsed: null });
            }

            // ── 1. Parse the query ────────────────────────────────────────────
            const parsed = parsePropertyQuery(q.trim());

            // ── 2. Build MongoDB filter ───────────────────────────────────────
            const filter = {};

            if (parsed.type)     filter.type     = parsed.type;
            if (parsed.category) filter.category = parsed.category;

            if (parsed.minBeds !== null || parsed.maxBeds !== null) {
                filter.beds = {};
                if (parsed.minBeds !== null) filter.beds.$gte = parsed.minBeds;
                if (parsed.maxBeds !== null) filter.beds.$lte = parsed.maxBeds;
            }

            if (parsed.minPrice !== null || parsed.maxPrice !== null) {
                filter.price = {};
                if (parsed.minPrice !== null) filter.price.$gte = parsed.minPrice;
                if (parsed.maxPrice !== null) filter.price.$lte = parsed.maxPrice;
            }

            if (parsed.location) {
                filter.location = { $regex: parsed.location, $options: 'i' };
            }

            // ── 3. Run query — only from active agents ────────────────────────
            const now = new Date();

            // Get active agent IDs first (keeps query clean)
            const activeAgents = await AgentUser.find({ status: 'active' })
                .select('_id stand boostAccount boostAccountExpiry')
                .lean();

            const activeIds   = activeAgents.map(a => a._id.toString());
            const agentStands = {};
            const agentBoost  = {};
            activeAgents.forEach(a => {
                agentStands[a._id.toString()] = a.stand || '';
                agentBoost[a._id.toString()]  = a.boostAccount && a.boostAccountExpiry > now;
            });

            filter.agentId = { $in: activeIds };

            // Fetch up to 50 candidates, then rank them
            const rawResults = await AgentPost.find(filter)
                .sort({ boostPost: -1, date: -1 })
                .limit(50)
                .lean();

            // ── 4. Score and sort results ─────────────────────────────────────
            const scored = rawResults.map(p => {
                let score = 0;

                // Boosted post
                if (p.boostPost && p.boostPostExpiry > now) score += 10;
                // Agent with boosted account
                if (agentBoost[p.agentId]) score += 5;
                // Verified agent
                if ((agentStands[p.agentId] || '').toLowerCase().includes('verified')) score += 3;

                // Exact type match bonus
                if (parsed.type && p.type === parsed.type) score += 4;
                // Exact category match bonus
                if (parsed.category && p.category === parsed.category) score += 4;
                // Exact bed match gets a higher score than range match
                if (parsed.minBeds !== null && parsed.maxBeds !== null &&
                    parsed.minBeds === parsed.maxBeds && p.beds === parsed.minBeds) {
                    score += 3;
                }

                return {
                    ...p,
                    stand: agentStands[p.agentId] || '',
                    _score: score,
                };
            });

            scored.sort((a, b) => b._score - a._score);

            // ── 5. If strict filters found nothing, fall back to fuzzy text search ──
            let finalResults = scored.slice(0, 25);

            if (finalResults.length === 0) {
                // Fallback: text search on location/title/description using raw query words
                const words = q.trim().split(/\s+/).filter(w => w.length > 2);
                if (words.length > 0) {
                    const regexTerms = words.map(w => new RegExp(w, 'i'));
                    const fallback = await AgentPost.find({
                        agentId: { $in: activeIds },
                        $or: [
                            { location:    { $in: regexTerms } },
                            { title:       { $in: regexTerms } },
                            { description: { $in: regexTerms } },
                        ]
                    })
                    .sort({ date: -1 })
                    .limit(25)
                    .lean();

                    finalResults = fallback.map(p => ({
                        ...p,
                        stand: agentStands[p.agentId] || '',
                    }));
                }
            }

            res.json({
                success:    true,
                properties: finalResults,
                parsed,                    // send back what the AI understood
                total:      finalResults.length,
            });

        } catch (err) {
            console.error('[Property Search] Error:', err.message);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });
}

module.exports = PROPERTY_SEARCH;
