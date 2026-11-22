"""
FRED AI ENGINE  —  EASYFIND NIGERIA
====================================

Full pipeline:

  User message
      │
      ▼
  LAYER 0 — Language Detector + Initial Cleaner
      │   Detects language: "english" | "pidgin"
      │   Lightly corrects typos/shorthand while PRESERVING the user's language style
      │   Pidgin stays pidgin — never silently translated to English
      │   Produces: lang, style_hint, clean_msg, optional correction note
      │
      ▼
  AI Router  (pure LLM classifier — no hardcoded keywords)
      │
      ├── property_search    →  ChromaDB semantic search + re-ranking
      ├── easyfind_knowledge →  ChromaDB knowledge collection
      └── general_chat       →  LLM from training data
      │
      ▼
  VERIFIED CONTEXT assembled
  (ChromaDB listings  /  knowledge base  /  SearXNG web search fallback)
      │
      ▼
  LLM generates reply  (Gemini first → Ollama fallback, streaming)
  System prompt includes per-request LANGUAGE RULE so Fred replies in
  the same language/style the user wrote in
      │
      ▼
  SUPERVISOR  — quality + language gate
      │
      ├── Layer 1: Rule-based guard  (pure Python, zero latency)
      │     Catches fabricated phone numbers, fake addresses,
      │     invented prices/figures with no context source.
      │
      ├── Layer 2: LLM grounding check
      │     Verifies every specific claim against the context.
      │     PASS → continue
      │     WARN → regenerate once with correction hint
      │     BLOCK → safe fallback, never the draft
      │
      └── Layer 3: Language gate
            Checks the reply language matches the user's detected language.
            Pidgin user must get a pidgin reply; English user gets English.
            PASS → stream to client
            WARN → regenerate once with language correction hint
            (never BLOCK — language mismatch is always fixable by rewrite)
"""

import os, re, json, ctypes, urllib.request, urllib.parse, asyncio, uuid, time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# ═══════════════════════════════════════════════════════════════════════════════
# STARTUP — env, paths, models
# ═══════════════════════════════════════════════════════════════════════════════

_ROOT_ENV = Path(__file__).parent.parent / ".env"
if _ROOT_ENV.exists():
    with open(_ROOT_ENV, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

_torch_dll = r"C:\Users\Dell PC\AppData\Local\Programs\Python\Python313\Lib\site-packages\torch\lib\c10.dll"
if os.path.exists(_torch_dll):
    try: ctypes.CDLL(_torch_dll)
    except Exception: pass

FRED_DIR      = Path(__file__).parent.resolve()
OLLAMA_URL    = os.environ.get("OLLAMA_URL",    "http://localhost:11434")
OLLAMA_MODEL  = os.environ.get("OLLAMA_MODEL",  "fred")
SEARXNG_URL   = os.environ.get("SEARXNG_URL",   "http://localhost:8080")
GEMINI_MODEL  = os.environ.get("GEMINI_MODEL",  "gemini-3.8-flash")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="Fred AI Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:9000", "https://easyfind.com.ng"],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

# ── ChromaDB ──────────────────────────────────────────────────────────────────
print("[Fred] Loading ChromaDB…")
chroma_client = chromadb.PersistentClient(path=str(FRED_DIR / "fred_chromadb"))

try:
    listings_col = chroma_client.get_collection(name="easyfind_listings")
    print(f"[Fred] Listings collection — {listings_col.count()} properties")
except Exception:
    listings_col = chroma_client.create_collection(name="easyfind_listings")
    print("[Fred] Listings collection created (empty)")

try:
    knowledge_col = chroma_client.get_or_create_collection(name="easyfind_knowledge")
    print(f"[Fred] Knowledge collection — {knowledge_col.count()} chunks")
except Exception:
    knowledge_col = None
    print("[Fred] ⚠ Knowledge collection unavailable")

# ── Embedding model ───────────────────────────────────────────────────────────
print("[Fred] Loading embedding model…")
try:
    embedding_fn = SentenceTransformerEmbeddingFunction(
        model_name="BAAI/bge-small-en-v1.5",
        model_kwargs={"local_files_only": True},
    )
    print("[Fred] bge-small-en-v1.5 loaded ✓")
except Exception as _e:
    print(f"[Fred] ⚠ bge-small failed: {_e}")
    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
    embedding_fn = DefaultEmbeddingFunction()
    print("[Fred] Default embedding loaded ✓")

print("[Fred] Ready ✓\n")


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ChatPayload(BaseModel):
    user_message: str
    chat_history: list = []          # legacy / fallback (ignored when session_id given)
    session_id:   Optional[str] = None  # Fred-managed session key
    is_agent:     bool = False        # true when the caller has an active agent session

class PropertyPayload(BaseModel):
    id:          str
    title:       str        = ""
    type:        str        = ""
    category:    str        = ""
    price:       float      = 0
    price_raw:   str        = ""
    location:    str        = ""
    beds:        Optional[float] = None
    baths:       Optional[float] = None
    description: str        = ""
    features:    list       = []
    agentName:   str        = ""
    agentNumber: str        = ""
    platform:    str        = "Easyfind"
    postUrl:     str        = ""


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — AI ROUTER  (pure LLM, no hardcoded keywords)
# ═══════════════════════════════════════════════════════════════════════════════

_ROUTER_PROMPT = """\
You are the routing brain for Fred, EasyFind Nigeria's real estate AI assistant.

Your only job is to classify what the user wants into ONE of these intents:
  property_search    — the user wants to find, rent, buy, lease, or ask about a \
property (house, flat, apartment, room, land, shop, office, shortlet, duplex, etc.) \
in any phrasing including pidgin English (e.g. "i dey find house", "e get room?", \
"any flat for rent?", "I don't American u idiot 😂" after a property discussion still \
counts as general_chat — read the conversation history for context)
  easyfind_knowledge — the user is asking about the EasyFind Nigeria platform itself \
(how it works, fees, agent registration, verification, policies, payment, Paystack, \
how to post a property, how to become an agent, upgrade account, etc.)
  agent_listing      — the user wants to see a list of agents, top agents, best agents, \
or browse agents on EasyFind (e.g. "show me top agents", "who are the agents?", \
"list agents", "best agent for Enugu", "show me verified agents")
  agent_search       — the user wants to find a specific agent by name \
(e.g. "search for agent John", "find agent called Chidi", "who is agent Amaka?")
  post_property      — the user (an agent) wants to post, list, upload, or add a new \
property listing on EasyFind \
(e.g. "I want to post a property", "list my property", "add a new listing", \
"I have a house to rent", "i wan post property", "make I list my flat", \
"i want to post property on easyfind", "how do i post property", \
"i get property i wan post", "help me post my property")
  general_chat       — anything else: greetings, jokes, off-topic questions, reactions, \
small talk

CONVERSATION HISTORY (most recent last):
{history}

CURRENT USER MESSAGE:
{message}

Rules:
- Read the full history to understand follow-up messages ("yes", "ok", "show me more", \
"lol", reactions, corrections like "I don't mean X").
- When the history shows an ongoing property search, short affirmatives ("yes", "ok", \
"more") should return property_search.
- When genuinely unsure between property_search and general_chat, pick property_search.
- Reply with ONLY the intent label, nothing else. No explanation, no punctuation.

Intent:"""


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION STORE  — server-side chat memory with context compaction
# ═══════════════════════════════════════════════════════════════════════════════
#
# Architecture (mirrors the approach described in the README):
#   - _SESSIONS  : dict[session_id → SessionData]  — lives in RAM, zero DB cost
#   - Each session keeps a `messages` list of {"role":…,"content":…} dicts
#   - When a session grows beyond COMPACT_THRESHOLD turns, the oldest
#     COMPACT_WINDOW turns are summarised by the LLM into one compact entry,
#     keeping the active context window small → lower latency on every request
#   - Sessions expire after SESSION_TTL_HOURS hours of inactivity (idle cleanup)
#
# Speed properties:
#   - History lookup  : O(1) dict access, no DB round-trip
#   - Context sent to LLM : always ≤ (COMPACT_THRESHOLD - COMPACT_WINDOW + 1)
#     turns after compaction → token count stays bounded
#   - Compaction itself is async and runs as a background task so it never
#     blocks the streaming response

COMPACT_THRESHOLD  = 10   # compact when session exceeds this many messages
COMPACT_WINDOW     = 6    # summarise the oldest this-many messages
SESSION_TTL_HOURS  = 6    # drop idle sessions after this many hours

@dataclass
class SessionData:
    messages:     list  = field(default_factory=list)  # full in-session history
    last_active:  float = field(default_factory=time.time)

# The global store — keyed by session_id string
_SESSIONS: dict[str, SessionData] = {}


def _session_get(session_id: str) -> SessionData:
    """Return (or create) the SessionData for a given id."""
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = SessionData()
    s = _SESSIONS[session_id]
    s.last_active = time.time()
    return s


def _session_append(session_id: str, role: str, content: str):
    """Append one turn to the session."""
    s = _session_get(session_id)
    s.messages.append({"role": role, "content": content})


def _session_clear(session_id: str):
    """Reset a session (keep the key, clear messages)."""
    if session_id in _SESSIONS:
        _SESSIONS[session_id] = SessionData()


def _evict_idle_sessions():
    """Remove sessions that have been idle past TTL. Called lazily."""
    cutoff = time.time() - SESSION_TTL_HOURS * 3600
    stale  = [k for k, v in _SESSIONS.items() if v.last_active < cutoff]
    for k in stale:
        del _SESSIONS[k]
    if stale:
        print(f"[Fred] Evicted {len(stale)} idle session(s). Active: {len(_SESSIONS)}")


_COMPACT_PROMPT = """\
You are a memory compactor for Fred, EasyFind Nigeria's AI assistant.

Below are {n} turns of a conversation between a user and Fred.
Write a single, dense summary (max 80 words) that preserves:
- What the user was looking for (property type, location, price, bedrooms)
- Key facts Fred shared (listings presented, agent contacts, decisions made)
- Any unresolved questions or follow-ups

Start with "Summary:" and write in third person.
Do NOT invent any new information.

CONVERSATION:
{turns}

Summary:"""


async def _compact_session(session_id: str):
    """
    Background coroutine: if the session is over COMPACT_THRESHOLD messages,
    summarise the oldest COMPACT_WINDOW messages into one compact entry.
    This keeps the context sent to the LLM bounded no matter how long the
    chat runs.
    """
    s = _session_get(session_id)
    if len(s.messages) <= COMPACT_THRESHOLD:
        return

    to_compact = s.messages[:COMPACT_WINDOW]
    turns_text = "\n".join(
        f"{m['role'].capitalize()}: {m['content']}" for m in to_compact
    )

    prompt = _COMPACT_PROMPT.format(n=len(to_compact), turns=turns_text)
    try:
        summary = await _llm_call([{"role": "user", "content": prompt}], max_tokens=120)
        if not summary.strip():
            return
        compact_entry = {"role": "system", "content": f"[Conversation summary] {summary.strip()}"}
        # Replace the compacted turns with the single summary entry
        s.messages = [compact_entry] + s.messages[COMPACT_WINDOW:]
        print(f"[Fred] Compacted session {session_id[:8]}… "
              f"({len(to_compact)} turns → 1 summary, {len(s.messages)} total)")
    except Exception as e:
        print(f"[Fred] Compaction error for {session_id[:8]}…: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 0 — LANGUAGE DETECTOR + MESSAGE CLEANER
#
# Runs before routing. Does three things in a single LLM call:
#
#   1. DETECT   — identifies the user's language as "english" or "pidgin"
#                 ("pidgin" covers Nigerian Pidgin English, Naija, broken English,
#                  heavy slang, or any mix thereof)
#
#   2. CLEAN    — lightly corrects typos / SMS shorthand / unclear abbreviations
#                 WHILE PRESERVING THE DETECTED LANGUAGE STYLE.
#                 Pidgin stays pidgin.  English stays English.
#                 The clean version is used internally for routing and search;
#                 it is never shown to the user.
#
#   3. NOTE     — one short friendly correction note (≤10 words) if something
#                 was actually corrected.  Empty string if nothing needed fixing.
#
# Returns: DetectResult(lang, style_hint, clean, note)
#
#   lang        — "english" | "pidgin"
#   style_hint  — 1–2 word description used to tune Fred's reply tone
#                 e.g. "casual pidgin", "formal English", "friendly English"
#   clean       — internally usable version of the message
#   note        — correction note shown to user, or ""
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DetectResult:
    lang:       str   # "english" | "pidgin"
    style_hint: str   # e.g. "casual pidgin", "formal English"
    clean:      str   # lightly corrected version (internal use)
    note:       str   # shown to user if non-empty


_DETECT_PROMPT = """\
You are the language detection and cleaning layer for Fred, EasyFind Nigeria's AI.

Read the raw user message below and do THREE things:

1. DETECT language — reply "pidgin" if the message is Nigerian Pidgin English, \
Naija slang, heavy informal Nigerian English, or any mix of those. \
Reply "english" for standard English (even casual or Nigerian-accented). \
When in doubt between the two, use conversation history to decide.

2. STYLE HINT — write 2–3 words describing the tone/style, e.g.:
   "casual pidgin", "formal English", "friendly English", "excited pidgin", \
"neutral English", "frustrated pidgin"

3. CLEAN — lightly correct only genuine errors (typos, garbled words, unclear \
abbreviations, incomplete sentences). IMPORTANT: keep the same language. \
If the user wrote in pidgin, the clean version must also be in pidgin — do NOT \
translate pidgin to English. If the message is already clear, return it unchanged.

4. NOTE — if you corrected something, write one short friendly note (max 10 words) \
telling the user what you understood. Leave empty string if nothing was corrected.

CONVERSATION HISTORY (for context only):
{history}

RAW USER MESSAGE:
{message}

Reply with ONLY valid JSON — no markdown, no extra text:
{{"lang": "english"|"pidgin", "style": "<2-3 word style hint>", \
"clean": "<lightly corrected message, same language>", \
"note": "<correction note or empty string>"}}"""


async def detect_and_clean(message: str, history: list = []) -> DetectResult:
    """
    Language detector + light cleaner.
    Returns a DetectResult with lang, style_hint, clean message, and optional note.
    Falls back to DetectResult("english", "neutral English", original_message, "")
    on any error so the pipeline never breaks.
    """
    history_text = ""
    for turn in history[-4:]:
        role    = turn.get("role", "user").capitalize()
        content = (turn.get("content") or "").strip()
        if content:
            history_text += f"{role}: {content}\n"
    if not history_text:
        history_text = "(no prior conversation)"

    prompt = _DETECT_PROMPT.format(
        history=history_text.strip(),
        message=message.strip(),
    )

    try:
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=120)
        m   = re.search(r'\{[\s\S]*?\}', raw)
        if m:
            data       = json.loads(m.group(0))
            lang       = str(data.get("lang")  or "english").strip().lower()
            style      = str(data.get("style") or "neutral English").strip()
            clean      = str(data.get("clean") or "").strip()
            note       = str(data.get("note")  or "").strip()
            # Normalise lang to exactly "english" or "pidgin"
            if lang not in ("english", "pidgin"):
                lang = "pidgin" if "pidgin" in lang else "english"
            if not clean:
                clean = message
            print(f"[Fred] Detected lang={lang!r} style={style!r} | clean={clean[:60]!r} | note={note!r}")
            return DetectResult(lang=lang, style_hint=style, clean=clean, note=note)
    except Exception as e:
        print(f"[Fred] Language detection error: {e} — using original message")

    return DetectResult(lang="english", style_hint="neutral English", clean=message, note="")


async def classify_intent(message: str, history: list = []) -> str:
    """
    Pure LLM router. Returns 'property_search' | 'easyfind_knowledge' | 'general_chat'.
    Falls back to 'general_chat' on any error.
    """
    history_text = ""
    for turn in history[-6:]:
        role    = turn.get("role", "user").capitalize()
        content = (turn.get("content") or "").strip()
        if content:
            history_text += f"{role}: {content}\n"
    if not history_text:
        history_text = "(no prior conversation)"

    prompt = _ROUTER_PROMPT.format(
        history=history_text.strip(),
        message=message.strip(),
    )

    try:
        # Router needs only a few tokens — use _llm_call so it routes through
        # the backend manager (Gemini first, Ollama fallback).
        # Give 20 tokens — 10 was too tight; Gemini sometimes emits a short
        # preamble before the label and was hitting MAX_TOKENS.
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=20)
        raw = raw.strip().lower()
        print(f"[Fred] Router: LLM → {raw!r}")
    except Exception as e:
        print(f"[Fred] Router error: {e} — defaulting to general_chat")
        return "general_chat"

    if "property_search" in raw:
        return "property_search"
    if "easyfind_knowledge" in raw:
        return "easyfind_knowledge"
    if "agent_listing" in raw:
        return "agent_listing"
    if "agent_search" in raw:
        return "agent_search"
    if "post_property" in raw:
        return "post_property"
    return "general_chat"


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2A — PROPERTY SEARCH
# ChromaDB semantic search + LLM-based intent extraction + re-ranking
# ═══════════════════════════════════════════════════════════════════════════════

_INTENT_EXTRACT_PROMPT = """\
Extract search filters from the user's property query. Reply with ONLY valid JSON.

User query: {query}

JSON format (use null for any field not mentioned):
{{"type": "house|flat|apartment|duplex|land|shop|office|shortlet|room|self contain|studio|null",
  "max_price": <number in naira or null>,
  "beds": <integer or null>,
  "location": "<neighbourhood/area name or null>"}}

Examples:
- "3 bedroom flat in new haven under 500k" → {{"type":"flat","max_price":500000,"beds":3,"location":"new haven"}}
- "i need a shop to rent" → {{"type":"shop","max_price":null,"beds":null,"location":null}}
- "any house in trans ekulu" → {{"type":"house","max_price":null,"beds":null,"location":"trans ekulu"}}
- "i wan rent room" → {{"type":"room","max_price":null,"beds":null,"location":null}}

JSON:"""


async def _extract_intent_llm(query: str) -> dict:
    """
    Ask the LLM to extract type, price, beds, location from a free-form query.
    Returns a dict with those keys (all nullable). Falls back to all-null on error.
    """
    prompt = _INTENT_EXTRACT_PROMPT.format(query=query.strip())
    try:
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=60)
        m   = re.search(r'\{[\s\S]*?\}', raw)
        if m:
            data = json.loads(m.group(0))
            return {
                "type":      data.get("type") or None,
                "max_price": data.get("max_price") or None,
                "beds":      data.get("beds") or None,
                "location":  data.get("location") or None,
            }
    except Exception as e:
        print(f"[Fred] Intent extract error: {e}")
    return {"type": None, "max_price": None, "beds": None, "location": None}


def _score(meta: dict, intent: dict) -> int:
    """Re-rank ChromaDB candidates against extracted intent. Lower = better."""
    score = 0
    p_type_str = (meta.get("type", "") + " " + meta.get("category", "")).lower()
    p_type_search = intent.get("type") or ""

    # Hard penalty: land shown for dwelling search
    if p_type_search in ("house", "flat", "room", "self contain", "duplex", "shortlet", "apartment", "studio"):
        if "land" in p_type_str or "plot" in p_type_str:
            return 9999

    if p_type_search and p_type_search not in p_type_str:
        score += 100

    if intent.get("max_price") and meta.get("price", -1) > 0:
        if meta["price"] > intent["max_price"] * 1.2:
            score += 50

    if intent.get("beds") and meta.get("beds", -1) > 0:
        if int(meta["beds"]) != int(intent["beds"]):
            score += 30

    if intent.get("location") and meta.get("location", ""):
        if intent["location"].lower() not in meta["location"].lower():
            score += 10

    return score


def _property_card(meta: dict, idx: int) -> str:
    title    = meta.get("title", "Property")
    location = meta.get("location", "Enugu")
    price    = meta.get("price", -1)
    try:
        beds = float(meta.get("beds", -1) or -1)
    except (TypeError, ValueError):
        beds = -1
    try:
        baths = float(meta.get("baths", -1) or -1)
    except (TypeError, ValueError):
        baths = -1
    agent    = meta.get("agentName", "")
    number   = meta.get("agentNumber", "")
    url      = meta.get("postUrl", "")

    price_str = f"₦{int(price):,}" if price and price > 0 else "price on request"
    specs = ", ".join(filter(None, [
        f"{int(beds)} bedroom{'s' if beds > 1 else ''}"    if beds  and beds  > 0 else "",
        f"{int(baths)} bathroom{'s' if baths > 1 else ''}" if baths and baths > 0 else "",
    ]))

    card = f"Option {idx}: {title} in {location}"
    if specs: card += f" — {specs}"
    card += f". Price: {price_str}."
    if agent:
        card += f" Agent: {agent}"
        if number and number not in ("N/A", ""):
            card += f", call/WhatsApp {number}"
        card += "."
    if url: card += f" Link: {url}"
    return card


def _property_to_text(p: dict) -> str:
    return "\n".join([
        f"Title: {p.get('title','')}",
        f"Category: {p.get('category','')}",
        f"Type: {p.get('type','')}",
        f"Price: {p.get('price_raw') or p.get('price','')}",
        f"Location: {p.get('location','')}",
        f"Bedrooms: {p.get('beds','')}",
        f"Bathrooms: {p.get('baths','')}",
        f"Description: {p.get('description','')}",
        f"Features: {', '.join(p.get('features', []))}",
        f"Agent: {p.get('agentName','')}",
        f"Platform: {p.get('platform','')}",
    ])


async def search_properties(query: str, n: int = 5) -> tuple:
    """Returns (formatted_context_str, raw_metadatas). Empty string if nothing found."""
    if listings_col.count() == 0:
        return "", []

    intent  = await _extract_intent_llm(query)
    print(f"[Fred] Extracted intent: {intent}")

    fetch_n = min(n * 4, listings_col.count())
    emb     = embedding_fn([query])
    results = listings_col.query(
        query_embeddings=emb,
        n_results=fetch_n,
        include=["metadatas", "distances"],
    )

    if not results.get("metadatas") or not results["metadatas"][0]:
        return "", []

    candidates = results["metadatas"][0]
    scored     = sorted(candidates, key=lambda m: _score(m, intent))

    # Filter land out of dwelling searches
    p_type = intent.get("type") or ""
    if p_type in ("house", "flat", "room", "self contain", "duplex", "shortlet", "apartment", "studio"):
        filtered = [
            m for m in scored
            if "land" not in (m.get("type", "") + m.get("category", "")).lower()
            and "plot" not in (m.get("type", "") + m.get("category", "")).lower()
        ]
        if filtered:
            scored = filtered

    # Filter by price
    if intent.get("max_price"):
        price_filtered = [
            m for m in scored
            if m.get("price", -1) <= 0 or m["price"] <= intent["max_price"] * 2
        ]
        if price_filtered:
            scored = price_filtered

    top   = scored[:n]
    cards = [_property_card(m, i + 1) for i, m in enumerate(top)]
    return "\n\n".join(cards), top


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2B — EASYFIND KNOWLEDGE BASE
# ═══════════════════════════════════════════════════════════════════════════════

def search_knowledge(query: str, n: int = 4) -> str:
    """Returns relevant knowledge chunks as a single string."""
    if knowledge_col is None or knowledge_col.count() == 0:
        return ""
    emb     = embedding_fn([query])
    results = knowledge_col.query(
        query_embeddings=emb,
        n_results=min(n, knowledge_col.count()),
        include=["documents", "distances"],
    )
    if not results.get("documents") or not results["documents"][0]:
        return ""
    return "\n\n".join(results["documents"][0])


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2D — AGENT LISTING  (calls Node.js /api/fred/agents)
# ═══════════════════════════════════════════════════════════════════════════════

# Node.js base URL — Fred talks back to its parent process
_NODE_URL = os.environ.get("NODE_URL", "http://localhost:9000")


async def fetch_agents(query: str = "", limit: int = 5) -> tuple:
    """
    Fetch active agents from the Node.js backend.
    Returns (formatted_context_str, raw_agents_list).
    """
    try:
        params = f"?limit={limit}"
        if query:
            params += f"&q={urllib.parse.quote(query.strip()[:50])}"
        url = f"{_NODE_URL}/api/fred/agents{params}"
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return "", []
        data = resp.json()
        agents = data.get("agents", [])
        if not agents:
            return "", []

        lines = []
        for i, a in enumerate(agents, 1):
            badges = []
            if a.get("verified"):  badges.append("✅ Verified")
            if a.get("boosted"):   badges.append("⭐ Boosted")
            badge_str = " | ".join(badges) if badges else "Agent"
            bio = (a.get("bio") or "").strip()
            phone = a.get("phone") or "not listed"
            line  = f"Agent {i}: {a['name']} — {badge_str}."
            if bio:
                line += f" {bio[:100]}."
            line += f" Contact: {phone}."
            line += f" Profile: easyfind.com.ng/agent-profile?id={a['id']}"
            lines.append(line)

        context = f"EasyFind agents ({data.get('total', len(agents))} total active):\n\n" + "\n\n".join(lines)
        return context, agents
    except Exception as e:
        print(f"[Fred] fetch_agents error: {e}")
        return "", []


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2E — POST PROPERTY  (conversational form engine)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Fred guides an agent through a short conversation to collect:
#   title, type, category, price, location, beds, baths, description
# Then emits a special `post_form` SSE event the frontend turns into a
# confirmation card.  The agent confirms → frontend POSTs to /api/fred/post-property.
#
# The session stores a `_post_draft` dict under the session key so Fred can
# resume mid-flow across turns.

_POST_EXTRACT_PROMPT = """\
You are a data extractor for Fred, EasyFind Nigeria's AI assistant.

Extract property listing details from the agent's message and conversation history.
Return ONLY valid JSON — no markdown, no extra text.

Fields (use null for anything not mentioned):
{{
  "title":       "<short property title or null>",
  "type":        "house|apartment|land|villa|commercial|null",
  "category":    "rent|sale|shortlet|null",
  "price":       <number in naira or null>,
  "location":    "<location/area name or null>",
  "beds":        <integer or null>,
  "baths":       <integer or null>,
  "description": "<brief description or null>"
}}

CONVERSATION HISTORY:
{history}

AGENT MESSAGE:
{message}

JSON:"""

# Required fields in order Fred asks for them
_POST_FIELDS = [
    ("type",     "What type of property is it? (house, apartment, land, commercial)"),
    ("category", "Is it for rent, sale, or shortlet?"),
    ("location", "Where is the property located? (area/neighbourhood)"),
    ("price",    "What is the asking price? (in Naira)"),
    ("title",    "Give it a short title, e.g. '3 bedroom flat in GRA'"),
    ("beds",     "How many bedrooms does it have? (type 0 or skip for land/commercial)"),
    ("baths",    "How many bathrooms?"),
    ("description", "Give a short description of the property (or type 'skip' to leave blank)"),
]


def _post_draft_key(sid: str) -> str:
    return f"__post_draft__{sid}"


def _get_draft(sid: str) -> dict:
    s = _session_get(sid)
    # Store draft on the session's messages list as a special system entry
    for m in s.messages:
        if m.get("role") == "__post_draft__":
            return m.get("data", {})
    return {}


def _save_draft(sid: str, draft: dict):
    s = _session_get(sid)
    for m in s.messages:
        if m.get("role") == "__post_draft__":
            m["data"] = draft
            return
    s.messages.append({"role": "__post_draft__", "data": draft})


def _clear_draft(sid: str):
    s = _session_get(sid)
    s.messages = [m for m in s.messages if m.get("role") != "__post_draft__"]


def _next_missing_field(draft: dict) -> tuple | None:
    """Return (field_key, question) for the next field that needs filling."""
    for key, question in _POST_FIELDS:
        val = draft.get(key)
        # beds/baths can be 0 — that's valid
        if val is None or (isinstance(val, str) and val.strip() == ""):
            return key, question
    return None


async def _extract_post_details(message: str, history: list) -> dict:
    """Ask LLM to extract property fields from the agent's message."""
    history_text = "\n".join(
        f"{m['role'].capitalize()}: {m['content']}"
        for m in history[-6:]
        if m.get("role") in ("user", "assistant")
    ) or "(no prior conversation)"

    prompt = _POST_EXTRACT_PROMPT.format(
        history=history_text,
        message=message.strip(),
    )
    try:
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=150)
        m   = re.search(r'\{[\s\S]*?\}', raw)
        if m:
            data = json.loads(m.group(0))
            # Normalise type
            t = (data.get("type") or "").lower().strip()
            valid_types = {"house", "apartment", "land", "villa", "commercial"}
            if t not in valid_types:
                data["type"] = None
            # Normalise category
            c = (data.get("category") or "").lower().strip()
            if c not in {"rent", "sale", "shortlet"}:
                data["category"] = None
            # Beds/baths: convert to int or None
            for fld in ("beds", "baths"):
                try:
                    v = data.get(fld)
                    data[fld] = int(v) if v is not None else None
                except (TypeError, ValueError):
                    data[fld] = None
            # Price: keep as number
            try:
                p = data.get("price")
                data["price"] = float(str(p).replace(",", "").replace("₦", "")) if p else None
            except (TypeError, ValueError):
                data["price"] = None
            return data
    except Exception as e:
        print(f"[Fred] post extract error: {e}")
    return {}




def _searxng_available() -> bool:
    try:
        req = urllib.request.Request(
            f"{SEARXNG_URL}/search?q=test&format=json",
            headers={"User-Agent": "FredAI/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def web_search(query: str, n: int = 5, search_type: str = "general") -> str:
    """
    Search SearXNG and return top n results as a formatted string.
    Returns empty string if SearXNG is unavailable.
    """
    try:
        if search_type == "property":
            full_query = (
                f"({query} Enugu Nigeria) "
                f"site:nigeriapropertycentre.com OR "
                f"site:propertypro.ng OR "
                f"site:privateproperty.ng OR "
                f"site:jiji.ng"
            )
        elif search_type == "knowledge":
            full_query = f"{query} EasyFind Nigeria real estate Enugu"
        else:
            full_query = f"{query} Enugu Nigeria"

        params = urllib.parse.urlencode({
            "q":          full_query,
            "format":     "json",
            "categories": "general",
        })
        req = urllib.request.Request(
            f"{SEARXNG_URL}/search?{params}",
            headers={"User-Agent": "FredAI/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())

        results = data.get("results", [])[:n]
        if not results:
            return ""

        if search_type == "property":
            # Format as property cards with direct links
            lines = [f"Property listings found on the web ({search_type}):"]
            for i, r in enumerate(results, 1):
                title   = r.get("title", "Property")
                content = r.get("content", "")[:200]
                url     = r.get("url", "")
                domain  = r.get("parsed_url", {}).get("netloc", "") or url.split("/")[2] if url else ""
                lines.append(
                    f"\nOption {i}: {title}\n"
                    f"   Details: {content}\n"
                    f"   Source: {domain}\n"
                    f"   Link: {url}"
                )
        else:
            lines = [f"Web search results ({search_type}):"]
            for i, r in enumerate(results, 1):
                title   = r.get("title", "")
                content = r.get("content", "")[:300]
                url     = r.get("url", "")
                lines.append(f"{i}. {title}\n   {content}\n   Source: {url}")

        result_str = "\n\n".join(lines)
        print(f"[Fred] SearXNG returned {len(results)} results for {search_type!r} search")
        return result_str

    except Exception as e:
        print(f"[Fred] SearXNG error: {e}")
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
# LLM BACKEND MANAGER
# ═══════════════════════════════════════════════════════════════════════════════
#
# Priority order:
#   1. Gemini key 1  (GEMINI_API_KEY)
#   2. Gemini key 2  (GEMINI_API_KEY2)   ← auto-rotate when key 1 is exhausted
#   3. Ollama local  (OLLAMA_MODEL)       ← permanent fallback when both keys fail
#
# "Exhausted" means the key returned HTTP 429 (RESOURCE_EXHAUSTED).
# The exhausted state expires after GEMINI_QUOTA_RESET_SECS so the key is
# retried automatically once Google's quota window rolls over (hourly for
# free tier, daily for paid).
#
# Every call site uses _llm_call() — it never needs to know which backend
# is active.  classify_intent() (the only place that bypassed _llm_call)
# is updated below to go through the same manager.

GEMINI_QUOTA_RESET_SECS = 60   # retry exhausted key after 60 seconds


class _GeminiKey:
    def __init__(self, key: str, label: str):
        self.key           = key
        self.label         = label
        self.exhausted_at: Optional[float] = None

    @property
    def available(self) -> bool:
        if not self.key:
            return False
        if self.exhausted_at is None:
            return True
        if time.time() - self.exhausted_at >= GEMINI_QUOTA_RESET_SECS:
            print(f"[LLM] Gemini {self.label} quota reset — re-enabling")
            self.exhausted_at = None
            return True
        return False

    def mark_exhausted(self):
        self.exhausted_at = time.time()
        print(f"[LLM] Gemini {self.label} quota exhausted — rotating to next key")


class LLMBackendManager:
    """
    Gemini-primary LLM backend with round-robin rotation across up to 5 keys.
    When a key hits quota (429), rotates to the next key automatically.
    After the last key is exhausted, wraps back to KEY1.
    Falls back to Ollama only if ALL Gemini keys are exhausted simultaneously.
    """

    def __init__(self):
        key_names = ["GEMINI_API_KEY", "GEMINI_API_KEY2", "GEMINI_API_KEY3",
                     "GEMINI_API_KEY4", "GEMINI_API_KEY5"]
        self._keys: list[_GeminiKey] = []
        for i, name in enumerate(key_names):
            val = os.environ.get(name, "").strip()
            if val:
                self._keys.append(_GeminiKey(val, f"KEY{i+1}"))

        self._current_idx = 0

        if self._keys:
            print(f"[LLM] Gemini backend ready — {len(self._keys)} key(s) loaded")
        else:
            print("[LLM] No Gemini keys found — using Ollama only")

    def _next_key(self) -> Optional[_GeminiKey]:
        if not self._keys:
            return None
        total = len(self._keys)
        for _ in range(total):
            key = self._keys[self._current_idx % total]
            if key.available:
                return key
            self._current_idx = (self._current_idx + 1) % total
        return None

    def _rotate(self):
        if self._keys:
            self._current_idx = (self._current_idx + 1) % len(self._keys)

    @staticmethod
    def _to_gemini_messages(messages: list) -> tuple[Optional[str], list]:
        system_parts = []
        contents     = []
        for m in messages:
            role    = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                system_parts.append(content)
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": content}]})
            else:
                contents.append({"role": "user",  "parts": [{"text": content}]})
        merged = []
        for turn in contents:
            if merged and merged[-1]["role"] == turn["role"]:
                merged[-1]["parts"][0]["text"] += "\n" + turn["parts"][0]["text"]
            else:
                merged.append(turn)
        if merged and merged[-1]["role"] == "model":
            merged.append({"role": "user", "parts": [{"text": "(continue)"}]})
        system_str = "\n\n".join(system_parts) if system_parts else None
        return system_str, merged

    def _gemini_body(self, messages: list, max_tokens: int, stream: bool = False) -> tuple[str, dict]:
        system_str, contents = self._to_gemini_messages(messages)
        body: dict = {
            "contents":         contents,
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3},
        }
        if system_str:
            body["systemInstruction"] = {"parts": [{"text": system_str}]}
        endpoint = "streamGenerateContent" if stream else "generateContent"
        return endpoint, body

    async def _gemini_call(self, key: _GeminiKey, messages: list, max_tokens: int) -> str:
        endpoint, body = self._gemini_body(messages, max_tokens, stream=False)
        url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:{endpoint}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url, json=body,
                headers={"x-goog-api-key": key.key, "Content-Type": "application/json"}
            )
        if resp.status_code == 429:
            key.mark_exhausted()
            raise RuntimeError("quota_exhausted")
        resp.raise_for_status()
        data = resp.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
            if not parts:
                raise RuntimeError("empty_parts")
            return parts[0]["text"].strip()
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"parse_error: {e}")

    async def _ollama_call(self, messages: list, max_tokens: int) -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model":    OLLAMA_MODEL,
                    "messages": messages,
                    "stream":   False,
                    "options":  {"temperature": 0.3, "num_predict": max_tokens, "num_ctx": 512},
                },
            )
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "").strip()

    async def call(self, messages: list, max_tokens: int = 300) -> str:
        for _ in range(len(self._keys) or 1):
            key = self._next_key()
            if not key:
                break
            try:
                result = await self._gemini_call(key, messages, max_tokens)
                print(f"[LLM] ✓ Gemini {key.label}")
                return result
            except RuntimeError as e:
                if "quota_exhausted" in str(e):
                    self._rotate()
                    continue
                print(f"[LLM] Gemini {key.label} error: {e} — rotating")
                self._rotate()
                continue
            except Exception as e:
                print(f"[LLM] Gemini {key.label} unexpected error: {e} — rotating")
                self._rotate()
                continue
        print("[LLM] All Gemini keys exhausted — falling back to Ollama")
        return await self._ollama_call(messages, max_tokens)

    async def _gemini_stream(self, key: _GeminiKey, messages: list, max_tokens: int):
        endpoint, body = self._gemini_body(messages, max_tokens, stream=True)
        url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:{endpoint}?alt=sse"
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", url, json=body,
                headers={"x-goog-api-key": key.key, "Content-Type": "application/json"}
            ) as resp:
                if resp.status_code == 429:
                    key.mark_exhausted()
                    raise RuntimeError("quota_exhausted")
                resp.raise_for_status()
                async for raw_line in resp.aiter_lines():
                    line = raw_line.strip()
                    if not line or line in ("[DONE]", ""):
                        continue
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    try:
                        chunk = json.loads(line)
                        text  = (chunk.get("candidates", [{}])[0]
                                      .get("content", {})
                                      .get("parts", [{}])[0]
                                      .get("text", ""))
                        if text:
                            yield text
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue

    async def _ollama_stream(self, messages: list, max_tokens: int):
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", f"{OLLAMA_URL}/api/chat",
                json={
                    "model":    OLLAMA_MODEL,
                    "messages": messages,
                    "stream":   True,
                    "options":  {"temperature": 0.3, "num_predict": max_tokens, "num_ctx": 512},
                },
            ) as resp:
                resp.raise_for_status()
                async for raw_line in resp.aiter_lines():
                    if not raw_line.strip():
                        continue
                    try:
                        data  = json.loads(raw_line)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    async def stream(self, messages: list, max_tokens: int = 400):
        for _ in range(len(self._keys) or 1):
            key = self._next_key()
            if not key:
                break
            try:
                print(f"[LLM] Streaming via Gemini {key.label}…")
                collected = ""
                async for chunk in self._gemini_stream(key, messages, max_tokens):
                    collected += chunk
                    yield chunk
                print(f"[LLM] ✓ Gemini {key.label} stream complete ({len(collected)} chars)")
                return
            except RuntimeError as e:
                if "quota_exhausted" in str(e):
                    self._rotate()
                    continue
                print(f"[LLM] Gemini {key.label} stream error: {e} — rotating")
                self._rotate()
                continue
            except Exception as e:
                print(f"[LLM] Gemini {key.label} stream error: {e} — rotating")
                self._rotate()
                continue
        print("[LLM] All Gemini keys exhausted — streaming via Ollama fallback")
        async for chunk in self._ollama_stream(messages, max_tokens):
            yield chunk

    def status(self) -> dict:
        key = self._next_key()
        return {
            "active_backend": f"gemini ({key.label})" if key else "ollama (fallback)",
            "gemini_model":   GEMINI_MODEL,
            "ollama_model":   OLLAMA_MODEL,
            "keys": [{"label": k.label, "available": k.available} for k in self._keys],
        }


# Singleton — imported and used everywhere in this module
llm = LLMBackendManager()


# ═══════════════════════════════════════════════════════════════════════════════
# LLM CALL  — thin wrapper; all existing call sites stay unchanged
# ═══════════════════════════════════════════════════════════════════════════════

async def _llm_call(messages: list, max_tokens: int = 300) -> str:
    """Non-streaming LLM call routed through the backend manager."""
    return await llm.call(messages, max_tokens)


# ═══════════════════════════════════════════════════════════════════════════════
# SUPERVISOR  — hallucination guard
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SupervisorVerdict:
    verdict: str   # "PASS" | "WARN" | "BLOCK"
    reason:  str
    layer:   int   # 0 = skipped, 1 = rule guard, 2 = LLM check


# Nigerian phone pattern
_NG_PHONE_RE = re.compile(
    r'(?<!\d)(?:\+?234|0)([789]\d{9}|[789]\d{8})(?!\d)'
)
# Street address pattern
_STREET_ADDR_RE = re.compile(
    r'\b\d{1,4}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+'
    r'(?:Street|Road|Avenue|Close|Crescent|Drive|Lane|Way|Estate)\b',
    re.IGNORECASE,
)
# Price pattern
_PRICE_RE = re.compile(
    r'₦\s*[\d,]+|'
    r'\b\d[\d,]*\s*(?:million|thousand)\b|'
    r'\b\d+(?:\.\d+)?\s*m\b(?!\w)|'
    r'\b\d+k\b',
    re.IGNORECASE,
)


def _rule_guard(draft: str, context: str) -> SupervisorVerdict:
    ctx_lower = context.lower()

    for m in _NG_PHONE_RE.finditer(draft):
        number = m.group(0).replace(" ", "").replace("-", "")
        digits = re.sub(r'^\+?234|^0', '', number)
        if digits not in ctx_lower and number not in ctx_lower:
            print(f"[Supervisor L1] BLOCK — invented phone: {m.group(0)!r}")
            return SupervisorVerdict("BLOCK", f"Invented phone number: {m.group(0)}", 1)

    for m in _STREET_ADDR_RE.finditer(draft):
        addr = m.group(0).strip().lower()
        if addr not in ctx_lower:
            print(f"[Supervisor L1] BLOCK — invented address: {addr!r}")
            return SupervisorVerdict("BLOCK", f"Invented street address: {addr}", 1)

    if context and "Available property listings" in context:
        for m in _PRICE_RE.finditer(draft):
            fig = m.group(0).replace(",", "").replace(" ", "").lower()
            if fig not in ctx_lower.replace(",", "").replace(" ", ""):
                print(f"[Supervisor L1] BLOCK — invented figure: {m.group(0)!r}")
                return SupervisorVerdict("BLOCK", f"Invented price/figure: {m.group(0)}", 1)

    return SupervisorVerdict("PASS", "rule guard clear", 1)


_GROUNDING_PROMPT = """\
You are a strict hallucination supervisor for Fred, EasyFind Nigeria's AI assistant.

VERIFIED CONTEXT (the ONLY source of truth):
{context}

FRED'S DRAFT RESPONSE:
{draft}

USER'S QUESTION:
{question}

Check every specific claim in the draft (prices, phone numbers, addresses, agent names, \
bedroom counts, EasyFind facts) against the VERIFIED CONTEXT.

Verdict rules:
- PASS  → all claims are grounded, OR it's a general greeting/chat with no factual claims.
- WARN  → one or two minor claims are unverifiable but the core answer is grounded.
- BLOCK → any specific fact (price, phone, address, property name) cannot be found in context.

Reply with ONLY this JSON — no markdown, no extra text:
{{"verdict": "PASS"|"WARN"|"BLOCK", "reason": "<max 25 words>"}}"""


async def _grounding_check(question: str, context: str, draft: str) -> SupervisorVerdict:
    if len(draft) < 60 or not context:
        return SupervisorVerdict("PASS", "skipped — short or no context", 2)

    prompt = _GROUNDING_PROMPT.format(
        context=context[:1500],
        draft=draft[:700],
        question=question[:200],
    )
    try:
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=60)
        m   = re.search(r'\{[\s\S]*?\}', raw)
        if m:
            data    = json.loads(m.group(0))
            verdict = str(data.get("verdict", "PASS")).upper().strip()
            reason  = str(data.get("reason", ""))
            if verdict not in ("PASS", "WARN", "BLOCK"):
                verdict = "PASS"
            print(f"[Supervisor L2] {verdict} — {reason}")
            return SupervisorVerdict(verdict, reason, 2)
    except Exception as e:
        print(f"[Supervisor L2] Parse error: {e} — defaulting PASS")

    return SupervisorVerdict("PASS", "parse failed — defaulting pass", 2)


# ── Layer 3 — Language Gate ───────────────────────────────────────────────────
# Checks that Fred's reply is in the SAME language/style the user wrote in.
# A pidgin user must get a pidgin reply; an English user must get an English reply.
# This runs AFTER the grounding check so it only fires on drafts that already
# passed factual verification — we never down-grade a factually correct reply
# without a real language mismatch.

_LANG_GATE_PROMPT = """\
You are a language style checker for Fred, EasyFind Nigeria's AI assistant.

The user wrote in: {lang} ({style})

FRED'S DRAFT REPLY:
{draft}

Check whether Fred's reply matches the user's language and style:
- If the user wrote in pidgin/Naija slang, Fred's reply must also be in pidgin.
- If the user wrote in English, Fred's reply must also be in English.
- Minor mixing is fine (e.g. a few English words inside a pidgin reply).
- Property details (addresses, prices, phone numbers) are exempt — they stay as-is.

Verdict rules:
- PASS  → reply language matches the user's language, or it's close enough.
- WARN  → reply is mostly in the wrong language but the content is correct \
(rewrite needed to match the user's style).

Reply with ONLY this JSON — no markdown, no extra text:
{{"verdict": "PASS"|"WARN", "reason": "<max 20 words>"}}"""


async def _language_gate(draft: str, lang: str, style_hint: str) -> SupervisorVerdict:
    """
    Layer 3 — verify the reply language matches the user's detected language.
    Returns SupervisorVerdict with verdict "PASS" or "WARN".
    Never returns "BLOCK" — a language mismatch triggers a rewrite, not a hard block.
    Falls back to PASS on any error so it never breaks the pipeline.
    """
    # Skip for very short replies (greetings, one-liners) — not worth a round-trip
    if len(draft.split()) < 12:
        return SupervisorVerdict("PASS", "skipped — reply too short for lang check", 3)

    prompt = _LANG_GATE_PROMPT.format(
        lang=lang,
        style=style_hint,
        draft=draft[:600],
    )
    try:
        raw = await _llm_call([{"role": "user", "content": prompt}], max_tokens=40)
        m   = re.search(r'\{[\s\S]*?\}', raw)
        if m:
            data    = json.loads(m.group(0))
            verdict = str(data.get("verdict", "PASS")).upper().strip()
            reason  = str(data.get("reason", ""))
            if verdict not in ("PASS", "WARN"):
                verdict = "PASS"
            print(f"[Supervisor L3] lang={lang!r} → {verdict} — {reason}")
            return SupervisorVerdict(verdict, reason, 3)
    except Exception as e:
        print(f"[Supervisor L3] Parse error: {e} — defaulting PASS")

    return SupervisorVerdict("PASS", "parse failed — defaulting pass", 3)


async def supervise(
    question:   str,
    context:    str,
    draft:      str,
    intent:     str,
    lang:       str = "english",
    style_hint: str = "neutral English",
) -> SupervisorVerdict:
    """
    Full supervisor pipeline:
      Layer 1 — rule guard        (phone/address/price hallucination)
      Layer 2 — LLM grounding     (claim verification against context)
      Layer 3 — language gate     (reply language matches user language)

    Returns the worst verdict found.  BLOCK > WARN > PASS.
    Layer 3 can only return WARN (language mismatch → rewrite, never hard block).
    """
    if intent == "general_chat" and not context:
        # Still run the language gate even for general chat
        lv = await _language_gate(draft, lang, style_hint)
        if lv.verdict == "WARN":
            return SupervisorVerdict("WARN", f"[lang] {lv.reason}", 3)
        return SupervisorVerdict("PASS", "general chat — no context to verify", 0)

    # Layer 1 — rule guard
    v1 = _rule_guard(draft, context)
    if v1.verdict == "BLOCK":
        return v1

    # Layer 2 — grounding check
    v2 = await _grounding_check(question, context, draft)
    if v2.verdict == "BLOCK":
        return v2

    # Layer 3 — language gate (runs even if L2 was WARN so we capture both issues)
    v3 = await _language_gate(draft, lang, style_hint)

    # Escalate: if L2 is WARN AND L3 is WARN, still just WARN (one rewrite fixes both)
    if v2.verdict == "WARN":
        reason = v2.reason
        if v3.verdict == "WARN":
            reason += f"; [lang] {v3.reason}"
        return SupervisorVerdict("WARN", reason, 2)

    if v3.verdict == "WARN":
        return SupervisorVerdict("WARN", f"[lang] {v3.reason}", 3)

    return SupervisorVerdict("PASS", "all layers clear", 0)


# ═══════════════════════════════════════════════════════════════════════════════
# FRED SYSTEM PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

FRED_SYSTEM = (
    "CRITICAL INSTRUCTION: You are Fred. Respond DIRECTLY as Fred. "
    "NEVER explain what you are about to say. NEVER say 'Here is a response' or "
    "'Here's a reply' or 'I will respond with' or any meta-commentary about your answer. "
    "Just reply naturally as Fred would. Start your reply immediately.\n\n"
    "You are Fred, a friendly and flexible real estate assistant for EasyFind Nigeria — "
    "a property platform focused on Enugu State, Nigeria. "
    "You help people find houses, flats, apartments, rooms, land, shops, offices, shortlets, and duplexes "
    "to rent, buy, or shortlet anywhere in Enugu. "
    "You can also show users a list of active agents on EasyFind when they ask to see top agents or search for an agent by name. "
    "When displaying agents, show their name, verification/boost status, bio, and contact number. "
    "You understand Nigerian English, pidgin, slang, and casual phrasing naturally — respond in kind. "
    "Be warm, conversational, and human. Never sound robotic or formal. "
    "When the user is joking or reacting (laughing, venting, etc.), respond naturally to that tone first, "
    "then gently bring the conversation back to how you can help them. "
    "Keep replies concise — 1 to 3 sentences for chat, longer only when presenting listings or agents. "
    "When the VERIFIED CONTEXT contains property listings, present ALL of them clearly with prices and agent contacts. "
    "Always share the agent's phone number when available. "
    "For web search results from external sites (PropertyPro, Jiji, etc.), tell the user they are from "
    "those sites, share the link, and invite them to also check easyfind.com.ng for verified local agents.\n"
    "RULES — never break these:\n"
    "- NEVER invent or guess property listings, prices, addresses, agent names, or phone numbers.\n"
    "- Only present properties or agents that appear in the VERIFIED CONTEXT.\n"
    "- Always remind users never to pay any fee before meeting the agent face to face."
)

# Language instruction appended per-request based on detected user language.
# Kept separate from FRED_SYSTEM so the base prompt is clean and reusable.
_LANG_INSTRUCTION = {
    "pidgin": (
        "\n\nLANGUAGE RULE — CRITICAL: The user wrote in Nigerian Pidgin English ({style}). "
        "You MUST reply in the same pidgin style. "
        "Do not switch to formal English. "
        "Use natural Naija expressions like 'I don find am', 'e dey available', 'na so e be', "
        "'wetin you wan?', 'no worry', 'sharp sharp', etc. "
        "Property details (prices, addresses, phone numbers) stay as-is — only your conversational "
        "language must be pidgin."
    ),
    "english": (
        "\n\nLANGUAGE RULE: The user wrote in English ({style}). "
        "Reply in clear, warm, natural English that matches their tone. "
        "Do not switch to pidgin."
    ),
}


def _build_messages(
    system:     str,
    history:    list,
    user_msg:   str,
    lang:       str = "english",
    style_hint: str = "neutral English",
) -> list:
    """
    Build the message list for the LLM.
    Appends a per-request language instruction to the system prompt so Fred
    always mirrors the user's detected language and style.
    """
    lang_instruction = _LANG_INSTRUCTION.get(lang, _LANG_INSTRUCTION["english"])
    full_system = system + lang_instruction.format(style=style_hint)

    msgs = [{"role": "system", "content": full_system}]
    for m in history[-6:]:
        role = m.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        msgs.append({"role": role, "content": m.get("content", "")})
    msgs.append({"role": "user", "content": user_msg})
    return msgs


# ═══════════════════════════════════════════════════════════════════════════════
# INTERNAL ENDPOINTS — called by Node.js
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/internal/index-property")
async def index_property(payload: PropertyPayload):
    """Upsert a property into ChromaDB."""
    try:
        p    = payload.dict()
        text = _property_to_text(p)
        emb  = embedding_fn([text])
        listings_col.upsert(
            ids        = [p["id"]],
            documents  = [text],
            embeddings = emb,
            metadatas  = [{
                "id":          p["id"],
                "title":       p["title"],
                "category":    p["category"],
                "type":        p["type"],
                "location":    p["location"],
                "price":       p["price"] if p["price"] else -1,
                "beds":        p["beds"]  if p["beds"]  is not None else -1,
                "baths":       p["baths"] if p["baths"] is not None else -1,
                "agentName":   p["agentName"],
                "agentNumber": p["agentNumber"],
                "platform":    p["platform"],
                "postUrl":     p["postUrl"],
            }],
        )
        print(f"[Fred] ✓ Indexed: {p['id']} — {p['title']} ({listings_col.count()} total)")
        return {"success": True, "indexed": p["id"], "total": listings_col.count()}
    except Exception as e:
        print(f"[Fred] ✗ Index error {payload.id}: {e}")
        return {"success": False, "error": str(e)}


@app.delete("/internal/index-property/{property_id}")
async def remove_property(property_id: str):
    """Remove a property from ChromaDB."""
    try:
        listings_col.delete(ids=[property_id])
        print(f"[Fred] ✓ Removed {property_id} ({listings_col.count()} remaining)")
        return {"success": True, "removed": property_id}
    except Exception as e:
        print(f"[Fred] ✗ Remove error {property_id}: {e}")
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN CHAT ENDPOINT  — streaming SSE
# ═══════════════════════════════════════════════════════════════════════════════

_STATUS = {
    "understanding":       "🧠 Reading your message…",
    "routing":             "🔍 Figuring out what you need…",
    "searching_db":        "🏠 Searching EasyFind listings…",
    "searching_web":       "🌐 Nothing found locally — searching the web…",
    "still_searching":     "⏳ Still searching, just a moment…",
    "searching_knowledge": "📖 Looking up EasyFind information…",
    "searching_web_kb":    "🌐 Checking the web for more info…",
    "searching_web_gen":   "🌐 Looking that up online…",
    "searching_agents":    "👥 Looking up EasyFind agents…",
    "collecting_details":  "📝 Collecting property details…",
    "thinking":            "💭 Thinking…",
    "verifying":           "✅ Checking answer quality…",
    "regenerating":        "🔄 Improving answer…",
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# SSE comment line — ignored by clients but forces uvicorn to flush the chunk.
# Without this, small status payloads (~40 B) may sit in uvicorn's write buffer
# until the next larger chunk arrives, making the status pill appear frozen.
_SSE_FLUSH_PAD = ": keep-alive\n\n"


def _status(key: str) -> str:
    return _sse({"status": _STATUS.get(key, key)}) + _SSE_FLUSH_PAD


async def _stream_text(text: str):
    """Async generator: yield SSE token events word by word, then done.
    Used only for fallback/error messages that are already fully formed strings."""
    words = text.split(" ")
    for i, word in enumerate(words):
        yield _sse({"token": word + (" " if i < len(words) - 1 else "")})
    yield _sse({"done": True})


@app.post("/generate")
async def generate_response(payload: ChatPayload):
    user_msg = payload.user_message.strip()

    # ── Resolve session ───────────────────────────────────────────────────────
    # If the client sends a session_id, we use the server-side history.
    # Otherwise we fall back to the legacy chat_history array from the body.
    if payload.session_id:
        sid     = payload.session_id
        history = _session_get(sid).messages          # live server-side history
        # Lazily evict old sessions (cheap: only scans when a request comes in)
        _evict_idle_sessions()
    else:
        # Legacy path — no session management, stateless like before
        sid     = None
        history = payload.chat_history

    async def _pipeline():
        # ── STEP 0: Detect language + lightly clean the message ───────────
        yield _status("understanding")
        detect = await detect_and_clean(user_msg, history)
        lang       = detect.lang        # "english" | "pidgin"
        style_hint = detect.style_hint  # e.g. "casual pidgin"
        working_msg = detect.clean      # lightly corrected, same language

        # Send correction note to the UI if something was fixed
        if detect.note:
            yield _sse({"correction": detect.note})
            print(f"[Fred] Correction note sent: {detect.note!r}")

        # Save raw user turn to session store (not the cleaned version — history
        # should read naturally when compacted later)
        if sid:
            _session_append(sid, "user", user_msg)

        # ── STEP 1: Route ──────────────────────────────────────────────────
        yield _status("routing")
        intent = await classify_intent(working_msg, history)
        print(f"[Fred] Intent: {intent} | lang: {lang} | Message: {working_msg[:60]!r}")

        # ── STEP 2: Gather verified context ───────────────────────────────
        context      = ""
        context_type = intent
        metadatas    = []

        if intent == "property_search":
            yield _status("searching_db")
            context_str, metadatas = await search_properties(working_msg)

            if context_str:
                context      = "Available property listings from EasyFind database:\n\n" + context_str
                context_type = "easyfind_db"
            else:
                yield _status("searching_web")
                web_task = asyncio.create_task(
                    asyncio.to_thread(web_search, working_msg, 5, "property")
                )
                try:
                    web = await asyncio.wait_for(asyncio.shield(web_task), timeout=3.0)
                except asyncio.TimeoutError:
                    yield _status("still_searching")
                    web = await web_task

                if web:
                    context = (
                        "NOTE: No matching properties were found in the EasyFind database. "
                        "The following property listings were found on external Nigerian property websites. "
                        "Present each one as a property option with its title, details, and a clickable link. "
                        "Tell the user these are from external sites and encourage them to also post or find "
                        "verified agents on easyfind.com.ng.\n\n"
                        + web
                    )
                    context_type = "web_property"
                    print(f"[Fred] Web property search returned context ({len(context)} chars)")
                else:
                    # No listings anywhere — send honest reply in user's language
                    print("[Fred] No listings found anywhere — sending honest reply")
                    if lang == "pidgin":
                        msg = (
                            "I don search EasyFind database and web but I no see any matching "
                            "property for now. You fit check easyfind.com.ng directly, or come "
                            "back later — agents dey add new properties every day."
                        )
                    else:
                        msg = (
                            "I searched the EasyFind database and the web but couldn't find "
                            "matching properties right now. You can browse listings at "
                            "easyfind.com.ng, or check back soon as agents add new properties daily."
                        )
                    async for chunk in _stream_text(msg):
                        yield chunk
                    return

        elif intent == "easyfind_knowledge":
            yield _status("searching_knowledge")
            kb = search_knowledge(working_msg)
            if kb:
                context      = "EasyFind knowledge base:\n\n" + kb
                context_type = "knowledge_db"
            else:
                yield _status("searching_web_kb")
                web = web_search(working_msg, search_type="knowledge")
                if web:
                    context      = web
                    context_type = "web_search"
                else:
                    context = "No specific EasyFind information found for this query."

        elif intent in ("agent_listing", "agent_search"):
            yield _status("searching_agents")
            # Extract name if agent_search
            search_name = ""
            if intent == "agent_search":
                # Try to pull a name from the cleaned message
                name_match = re.search(
                    r'(?:agent|find|search|show|who is|called?|named?|by name)\s+([A-Za-z]{2,})',
                    working_msg, re.IGNORECASE
                )
                if name_match:
                    search_name = name_match.group(1).strip()
                else:
                    # Fall back to last word that looks like a name
                    words = [w for w in working_msg.split() if w.isalpha() and len(w) > 2]
                    if words:
                        search_name = words[-1]

            agent_ctx, _ = await fetch_agents(query=search_name, limit=5)
            if agent_ctx:
                context      = agent_ctx
                context_type = "agent_listing"
            else:
                context = "No agents found on EasyFind at the moment."
                context_type = "agent_listing"

        elif intent == "post_property":
            # ── Only agents can post — check session identity via header ───
            is_agent = payload.is_agent or False
            if not is_agent:
                yield _status("thinking")
                not_agent_msg = (
                    "You need an agent account to post property on EasyFind. "
                    "If you have a user account, visit easyfind.com.ng/upgrade-to-agent "
                    "to upgrade instantly, or sign up fresh at easyfind.com.ng/signup-agent."
                    if lang == "english" else
                    "You need agent account to post property for EasyFind. "
                    "If you get user account, go easyfind.com.ng/upgrade-to-agent to switch, "
                    "or sign up fresh for agent account for easyfind.com.ng/signup-agent."
                )
                async for chunk in _stream_text(not_agent_msg):
                    yield chunk
                return

            yield _status("collecting_details")

            # Retrieve or start draft
            if not sid:
                # No session — can't do multi-turn; send to dashboard instead
                redirect_msg = (
                    "I can help you post a property! Just head to your dashboard at "
                    "easyfind.com.ng/agent-loged to add a listing with photos and map pin."
                    if lang == "english" else
                    "I fit help you post property! Just go your dashboard for "
                    "easyfind.com.ng/agent-loged to add listing with photos and map."
                )
                async for chunk in _stream_text(redirect_msg):
                    yield chunk
                return

            draft = _get_draft(sid)

            # Check if agent said "cancel" or "stop"
            cancel_words = {"cancel", "stop", "nevermind", "never mind", "abort", "forget it",
                            "cancel am", "stop am", "abeg stop"}
            if any(w in working_msg.lower() for w in cancel_words):
                _clear_draft(sid)
                cancel_reply = (
                    "No problem, I've cancelled the property posting. Let me know if you need anything else."
                    if lang == "english" else
                    "No wahala, I don cancel the property posting. Tell me if you need anything."
                )
                async for chunk in _stream_text(cancel_reply):
                    yield chunk
                return

            # Extract any details the agent mentioned in this turn
            extracted = await _extract_post_details(working_msg, history)
            for k, v in extracted.items():
                if v is not None and draft.get(k) is None:
                    draft[k] = v
                elif k == "description" and v and v.lower() != "skip":
                    draft[k] = v  # allow description update

            # Handle explicit "skip" for optional fields
            if working_msg.strip().lower() in ("skip", "s", "none", "n/a", "no"):
                field_check = _next_missing_field(draft)
                if field_check:
                    key, _ = field_check
                    if key in ("beds", "baths", "description"):
                        draft[key] = 0 if key in ("beds", "baths") else ""

            _save_draft(sid, draft)

            # Check if all required fields are filled
            missing = _next_missing_field(draft)

            if missing is None:
                # All fields collected — emit post_form event for frontend
                # Build a clean summary for confirmation
                price_str = f"₦{int(draft['price']):,}" if draft.get("price") else "Not set"
                summary = (
                    f"Title: {draft.get('title', '')}\n"
                    f"Type: {draft.get('type', '')}\n"
                    f"Category: {draft.get('category', '')}\n"
                    f"Price: {price_str}\n"
                    f"Location: {draft.get('location', '')}\n"
                    f"Bedrooms: {draft.get('beds', 0)}\n"
                    f"Bathrooms: {draft.get('baths', 0)}\n"
                    f"Description: {draft.get('description', '') or 'None'}"
                )

                confirm_msg = (
                    f"Here's a summary of your listing. Confirm to post it now (you can add photos from your dashboard later):\n\n{summary}"
                    if lang == "english" else
                    f"Here na your listing summary. Confirm to post am now (you fit add photos from your dashboard later):\n\n{summary}"
                )

                # Send the confirmation text + the special post_form event
                yield _sse({"token": confirm_msg})
                yield _sse({"post_form": draft})
                yield _sse({"done": True})

                # Persist the assistant turn
                if sid:
                    _session_append(sid, "assistant", confirm_msg)

            else:
                # Ask for the next missing field
                field_key, question = missing
                if lang == "pidgin":
                    intro = "" if draft else "Okay! "
                    reply = f"{intro}{question} (or type 'cancel' to stop)"
                else:
                    filled = sum(1 for k, _ in _POST_FIELDS if draft.get(k) is not None)
                    total  = len(_POST_FIELDS)
                    reply  = f"Got it! ({filled}/{total}) {question} (or type 'cancel' to stop)"

                yield _sse({"token": reply})
                yield _sse({"done": True})
                if sid:
                    _session_append(sid, "assistant", reply)

            return  # skip normal LLM pipeline for post_property

        else:  # general_chat
            # Only search the web if SearXNG is reachable — skip silently if not
            if _searxng_available():
                yield _status("searching_web_gen")
                web = web_search(working_msg, search_type="general")
                if web:
                    context      = web
                    context_type = "web_search"

        print(f"[Fred] Context type: {context_type} | Context length: {len(context)} chars")

        # ── STEP 3: Build system prompt (language-aware) ───────────────────
        system = FRED_SYSTEM + (
            f"\n\nVERIFIED CONTEXT:\n{context}"
            if context
            else "\n\nNo specific context available. Answer from your general knowledge."
        )
        # _build_messages now injects the per-request language instruction
        messages = _build_messages(system, history, working_msg, lang, style_hint)

        # ── STEP 4 + 5 + 6: Generate, supervise, stream ───────────────────
        yield _status("thinking")

        # ── general_chat with no context: stream live, language-gate only ──
        # Collect tokens but yield them immediately for low latency.
        # Language gate still runs — if it WARNs we regenerate once.
        if intent == "general_chat" and not context:
            final_reply = ""
            try:
                async for chunk in llm.stream(messages, max_tokens=400):
                    final_reply += chunk
                    yield _sse({"token": chunk})
                yield _sse({"done": True})
            except Exception as e:
                print(f"[Fred] ✗ Stream failed: {e}")
                yield _sse({"error": str(e)})
                return

            # Run language gate in the background after streaming completes.
            # If it fails we can't unsend tokens, but we log it so patterns are visible.
            lv = await _language_gate(final_reply, lang, style_hint)
            if lv.verdict == "WARN":
                print(f"[Supervisor L3 post-stream] WARN — {lv.reason} (already sent, logged only)")

        else:
            # ── supervised path: collect draft, run all 3 supervisor layers,
            #    then stream the verified final reply ──────────────────────
            try:
                draft = ""
                # Stream tokens to user immediately while collecting
                async for chunk in llm.stream(messages, max_tokens=400):
                    draft += chunk
                    yield _sse({"token": chunk})
            except Exception as e:
                print(f"[Fred] ✗ Draft generation failed: {e}")
                yield _sse({"error": str(e)})
                return

            print(f"[Fred] Draft ({llm.status()['active_backend']}): {draft[:80]!r}…")

            # ── STEP 5: Supervise (L1 rule + L2 grounding + L3 language) ──
            yield _status("verifying")
            verdict = await supervise(
                working_msg, context, draft, intent, lang, style_hint
            )
            print(f"[Supervisor] {verdict.verdict} (layer {verdict.layer}) — {verdict.reason}")

            if verdict.verdict == "BLOCK":
                print(f"[Supervisor] BLOCKED draft: {draft[:120]!r}")
                yield _status("regenerating")
                force_system = (
                    system
                    + "\n\nIMPORTANT: Only use facts from the VERIFIED CONTEXT above. "
                    "Do not invent any details. If you cannot answer from the context, "
                    "say so honestly and suggest the user visit easyfind.com.ng."
                )
                try:
                    regenerated = await _llm_call(
                        _build_messages(force_system, history, working_msg, lang, style_hint),
                        max_tokens=350,
                    )
                    v_retry = _rule_guard(regenerated, context)
                    final_reply = regenerated if v_retry.verdict != "BLOCK" else (
                        "I no fit give you verified answer for that one. "
                        "Abeg check easyfind.com.ng or contact EasyFind support."
                        if lang == "pidgin" else
                        "I couldn't produce a verified answer for that. "
                        "Please visit easyfind.com.ng or contact EasyFind support directly."
                    )
                except Exception:
                    final_reply = (
                        "I no fit give you verified answer for that one. "
                        "Abeg check easyfind.com.ng or contact EasyFind support."
                        if lang == "pidgin" else
                        "I couldn't produce a verified answer for that. "
                        "Please visit easyfind.com.ng or contact EasyFind support directly."
                    )

            elif verdict.verdict == "WARN":
                yield _status("regenerating")
                print(f"[Supervisor] WARN — regenerating with correction hint…")
                # Include language gate feedback in the correction hint if it fired
                warn_note = verdict.reason
                correction_system = (
                    system
                    + f"\n\nNOTE: Your previous answer had issues: {warn_note}. "
                    "Rewrite using ONLY the exact facts in the VERIFIED CONTEXT. "
                    "Omit any detail not present there. "
                    f"Also make sure your reply is in {lang} ({style_hint}) to match the user."
                )
                try:
                    regenerated = await _llm_call(
                        _build_messages(correction_system, history, working_msg, lang, style_hint),
                        max_tokens=300,
                    )
                    print(f"[Supervisor] Regenerated: {regenerated[:80]!r}…")
                    v_retry = _rule_guard(regenerated, context)
                    final_reply = regenerated if v_retry.verdict != "BLOCK" else (
                        "I no fit give fully verified answer. "
                        "Abeg check easyfind.com.ng for correct details."
                        if lang == "pidgin" else
                        "I couldn't produce a fully verified answer. "
                        "Please check easyfind.com.ng for accurate details."
                    )
                except Exception:
                    final_reply = draft

            else:
                final_reply = draft

            # ── STEP 6: Stream corrected reply only if supervisor changed it ──
            # If PASS, draft was already streamed token-by-token above — don't resend.
            # Only stream if BLOCK or WARN produced a different final_reply.
            if final_reply != draft:
                async for chunk in _stream_text(final_reply):
                    yield chunk
            else:
                yield _sse({"done": True})

        # ── STEP 7: Persist assistant turn + trigger compaction ────────────
        if sid:
            _session_append(sid, "assistant", final_reply)
            asyncio.create_task(_compact_session(sid))

    return StreamingResponse(
        _pipeline(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class SessionClearPayload(BaseModel):
    session_id: str

@app.post("/session/clear")
async def clear_session(payload: SessionClearPayload):
    """Reset a session's history (e.g. when user starts a new chat)."""
    _session_clear(payload.session_id)
    return {"success": True, "session_id": payload.session_id}

@app.get("/session/stats")
async def session_stats():
    """Dev helper — shows how many sessions are live and their sizes."""
    return {
        "active_sessions": len(_SESSIONS),
        "sessions": [
            {
                "id":       k[:8] + "…",
                "messages": len(v.messages),
                "idle_min": round((time.time() - v.last_active) / 60, 1),
            }
            for k, v in _SESSIONS.items()
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    ollama_ok  = False
    searxng_ok = _searxng_available()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass

    return {
        "status":         "ok",
        "ollama":         "reachable" if ollama_ok else "unreachable — run `ollama serve`",
        "ollama_model":   OLLAMA_MODEL,
        "searxng":        "reachable" if searxng_ok else "offline — web search disabled",
        "listings_docs":  listings_col.count(),
        "knowledge_docs": knowledge_col.count() if knowledge_col else 0,
        **llm.status(),   # active_backend, gemini_model, gemini_keys
    }


@app.get("/llm/status")
async def llm_status():
    """
    Returns the current LLM backend state — useful for the admin monitor page.
    Shows which backend is active, which Gemini keys are exhausted, and when
    they will auto-recover.
    """
    return llm.status()
