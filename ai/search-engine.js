/**
 * EasyFind Custom AI Search Engine
 * ==================================
 * Built from scratch — no external APIs, no native binaries.
 *
 * How it works (the same math behind real search engines):
 *
 * 1. TOKENIZATION     — Split text into meaningful words, strip noise
 * 2. STEMMING         — Reduce words to their root ("selling" → "sell")
 * 3. SYNONYM EXPANSION— "house" also searches "property", "home", "land"
 * 4. TF-IDF SCORING   — Words rare across all agents score higher (smarter weighting)
 * 5. COSINE SIMILARITY— Measures the angle between query & agent vectors (true semantic match)
 * 6. BOOST SIGNALS    — Verified + boosted agents rank higher at equal scores
 * 7. IN-MEMORY INDEX  — Built once on startup, refreshed every 10 min (zero DB hits on search)
 */

'use strict';

// ─── Synonym Map ─────────────────────────────────────────────────────────────
// If a user types any word on the left, we ALSO search for all words on the right.
// Add more as you learn what your users search for.
const SYNONYM_MAP = {
    // Property types
    'house':        ['home', 'property', 'duplex', 'bungalow', 'mansion', 'residence'],
    'home':         ['house', 'property', 'residence', 'duplex'],
    'property':     ['house', 'home', 'land', 'estate', 'building', 'real estate'],
    'land':         ['plot', 'property', 'estate', 'acre'],
    'flat':         ['apartment', 'unit', 'studio'],
    'apartment':    ['flat', 'unit', 'studio'],
    'shop':         ['store', 'office', 'commercial', 'plaza'],
    'office':       ['shop', 'commercial', 'business', 'workspace'],
    'estate':       ['property', 'land', 'real estate', 'development'],
    'building':     ['property', 'structure', 'block'],

    // Agent roles
    'agent':        ['realtor', 'broker', 'dealer', 'consultant', 'seller'],
    'realtor':      ['agent', 'broker', 'dealer', 'consultant'],
    'broker':       ['agent', 'realtor', 'dealer'],
    'dealer':       ['agent', 'realtor', 'seller', 'vendor'],
    'consultant':   ['agent', 'advisor', 'realtor', 'expert'],
    'seller':       ['agent', 'dealer', 'vendor', 'realtor'],
    'buyer':        ['client', 'investor', 'purchaser'],
    'investor':     ['buyer', 'developer', 'financier'],

    // Actions
    'sell':         ['lease', 'rent', 'let', 'offer', 'list'],
    'buy':          ['purchase', 'acquire', 'invest'],
    'rent':         ['let', 'lease', 'hire'],
    'lease':        ['rent', 'let', 'hire'],
    'let':          ['rent', 'lease'],

    // Locations (Enugu-specific — expand as needed)
    'enugu':        ['coal city', 'enu'],
    'gra':          ['government reserved', 'reserved area'],
    'trans ekulu':  ['trans-ekulu', 'ekulu'],
    'independence': ['independence layout', 'layout'],
    'new haven':    ['new-haven', 'haven'],

    // Quality signals
    'cheap':        ['affordable', 'budget', 'low cost', 'inexpensive'],
    'affordable':   ['cheap', 'budget', 'low cost'],
    'luxury':       ['premium', 'highend', 'executive', 'upscale'],
    'premium':      ['luxury', 'executive', 'highend'],
    'verified':     ['trusted', 'certified', 'approved', 'legit'],
    'trusted':      ['verified', 'certified', 'legit'],
};

// ─── Stop Words (ignored during indexing & search) ───────────────────────────
const STOP_WORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','has','have','had',
    'do','does','did','will','would','could','should','may','might','shall',
    'i','you','he','she','it','we','they','my','your','his','her','its',
    'our','their','this','that','these','those','as','if','not','no','yes',
    'all','any','each','every','both','few','more','most','other','some',
    'than','then','when','where','who','which','what','how','why','very',
    'just','also','about','up','out','so','into','after','before','over',
    'between','through','during','above','below','off','again','further',
    'am','its','been','being','me','him','us','them','can','own','same',
]);

// ─── Porter Stemmer (lightweight — handles the most common English suffixes) ──
function stem(word) {
    if (word.length < 4) return word;

    // Step 1a
    if (word.endsWith('sses'))  return word.slice(0, -2);
    if (word.endsWith('ies'))   return word.slice(0, -2);
    if (word.endsWith('ss'))    return word;
    if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);

    // Step 1b
    if (word.endsWith('eed') && word.length > 5) return word.slice(0, -1);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed')  && word.length > 4) return word.slice(0, -2);

    // Step 1c
    if (word.endsWith('ying')) return word.slice(0, -4) + 'i';

    // Step 2 — common suffixes
    const step2 = [
        ['ational','ate'], ['tional','tion'], ['enci','ence'], ['anci','ance'],
        ['izer','ize'],    ['ising','ise'],   ['izing','ize'], ['ising','ise'],
        ['alism','al'],    ['ness',''],       ['ment',''],     ['ful',''],
        ['ous',''],        ['ive',''],        ['ers','er'],    ['ies','y'],
    ];
    for (const [suffix, replacement] of step2) {
        if (word.endsWith(suffix) && word.length > suffix.length + 2) {
            return word.slice(0, -suffix.length) + replacement;
        }
    }

    return word;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')   // keep only letters, digits, spaces
        .split(/\s+/)
        .filter(t => t.length > 1 && !STOP_WORDS.has(t))
        .map(stem);
}

// ─── Synonym Expansion ────────────────────────────────────────────────────────
function expandWithSynonyms(tokens) {
    // We expect input `tokens` to ALREADY be fully stemmed by your tokenizer pipeline
    const expanded = new Set(tokens);

    for (const token of tokens) {
        // 1. Direct Lookup: If your SYNONYM_MAP keys are plain words
        if (SYNONYM_MAP[token]) {
            SYNONYM_MAP[token].forEach(s => {
                // Tokenize AND Stem each synonym word so it perfectly matches indexed roots
                tokenize(s).forEach(t => expanded.add(stem(t)));
            });
        }

        // 2. Pre-stemmed reverse lookup helper to eliminate the heavy Object.entries loop
        for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
            // Stem the key once. (Pro-tip: If you put already-stemmed keys in your map, you can delete this part entirely!)
            if (stem(key) === token) {
                synonyms.forEach(s => {
                    tokenize(s).forEach(t => expanded.add(stem(t)));
                });
            }
        }
    }

    return [...expanded];
}

// ─── TF-IDF Index ─────────────────────────────────────────────────────────────
class TFIDFIndex {
    constructor() {
        // Map of agentId → { tokens: string[], tf: Map<term,number>, agent: object }
        this.documents  = new Map();
        // Map of term → number of documents containing it
        this.df         = new Map();
        this.totalDocs  = 0;
        this.builtAt    = null;
    }

    /**
     * Add one agent to the index.
     * Fields are weighted: name (×3), stand (×2), bio (×1)
     */
    addDocument(agentId, agent) {
        const nameTokens  = tokenize(agent.name  || '');
        const standTokens = tokenize(agent.stand || '');
        const bioTokens   = tokenize(agent.bio   || '');

        // Weight by repeating tokens
        const tokens = [
            ...nameTokens,  ...nameTokens,  ...nameTokens,   // ×3
            ...standTokens, ...standTokens,                  // ×2
            ...bioTokens,                                    // ×1
        ];

        // Term frequency for this document
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }
        // Normalize TF by document length
        for (const [term, count] of tf) {
            tf.set(term, count / tokens.length);
        }

        this.documents.set(agentId.toString(), { tokens, tf, agent });

        // Update document frequency
        const uniqueTerms = new Set(tokens);
        for (const term of uniqueTerms) {
            this.df.set(term, (this.df.get(term) || 0) + 1);
        }

        this.totalDocs++;
    }

    /**
     * Get IDF weight for a term.
     * Rare terms across all agents score higher.
     */
    idf(term) {
        const df = this.df.get(term) || 0;
        if (df === 0) return 0;
        return Math.log((this.totalDocs + 1) / (df + 1)) + 1; // smoothed IDF
    }

    /**
     * Build TF-IDF vector for a set of tokens.
     * Returns Map<term, tfidf_weight>
     */
    buildVector(tokens) {
        const tf = new Map();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }
        const len = tokens.length || 1;
        const vector = new Map();
        for (const [term, count] of tf) {
            vector.set(term, (count / len) * this.idf(term));
        }
        return vector;
    }

    /**
     * Cosine similarity between two TF-IDF vectors.
     */
    cosineSimilarity(vecA, vecB) {
        let dot = 0, normA = 0, normB = 0;
        for (const [term, weightA] of vecA) {
            const weightB = vecB.get(term) || 0;
            dot   += weightA * weightB;
            normA += weightA * weightA;
        }
        for (const [, weightB] of vecB) {
            normB += weightB * weightB;
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Search the index.
     * Returns array of { agent, score } sorted by score descending.
     */
    search(query, topK = 25) {
        if (this.totalDocs === 0) return [];

        // Tokenize + expand query with synonyms
        const rawTokens      = tokenize(query);
        const expandedTokens = expandWithSynonyms(rawTokens);
        const queryVector    = this.buildVector(expandedTokens);

        if (queryVector.size === 0) return [];

        const results = [];

        for (const [agentId, doc] of this.documents) {
            const docVector = this.buildVector(doc.tokens);
            let score = this.cosineSimilarity(queryVector, docVector);

            // Boost signals — tiny nudges that break ties fairly
            if (doc.agent.boostAccount) score += 0.04;
            if (doc.agent.isVerified)   score += 0.03;

            if (score > 0.01) {
                results.push({ agent: doc.agent, score });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    clear() {
        this.documents.clear();
        this.df.clear();
        this.totalDocs = 0;
        this.builtAt   = null;
    }
}

module.exports = { TFIDFIndex, tokenize, expandWithSynonyms };
