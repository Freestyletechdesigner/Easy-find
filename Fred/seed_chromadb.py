"""
seed_chromadb.py
----------------
Populates Fred's ChromaDB with:
  1. Easyfind knowledge base (company info, FAQ, policy) from easyfind_knowledge.json
  2. Live property listings pulled from MongoDB via MONGO_URI in .env

Run once (and re-run any time listings change significantly):
    py Fred/seed_chromadb.py
"""

import os
import sys
import json
import ctypes
import hashlib
from pathlib import Path
from datetime import datetime

# ── Offline mode ──────────────────────────────────────────────────────────────
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Fix PyTorch DLL on Windows
torch_lib = r"C:\Users\Dell PC\AppData\Local\Programs\Python\Python313\Lib\site-packages\torch\lib\c10.dll"
if os.path.exists(torch_lib):
    try:
        ctypes.CDLL(torch_lib)
    except Exception:
        pass

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent                          # Fred/
WORKSPACE    = SCRIPT_DIR.parent                              # web e/
DB_PATH      = str(SCRIPT_DIR / "fred_chromadb")
KNOWLEDGE_FILE = SCRIPT_DIR / "easyfind_knowledge.json"

# Load .env manually (no python-dotenv needed)
env_file = WORKSPACE / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

MONGO_URI = os.environ.get("MONGO_URI", "")
if not MONGO_URI:
    print("❌  MONGO_URI not found in .env — cannot fetch listings.")
    sys.exit(1)

# ── ChromaDB + Embeddings ─────────────────────────────────────────────────────
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

print("⏳  Loading embedding model (offline)…")
embedding_fn = SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-small-en-v1.5",
    model_kwargs={"local_files_only": True}
)

chroma_client = chromadb.PersistentClient(path=DB_PATH)

# ── Recreate listings collection ──────────────────────────────────────────────
try:
    chroma_client.delete_collection("easyfind_listings")
    print("🗑   Cleared old easyfind_listings collection.")
except Exception:
    pass

collection = chroma_client.create_collection(
    name="easyfind_listings",
    embedding_function=embedding_fn
)
print("✅  Created fresh easyfind_listings collection.")

# ── Recreate knowledge collection ─────────────────────────────────────────────
try:
    chroma_client.delete_collection("easyfind_knowledge")
    print("🗑   Cleared old easyfind_knowledge collection.")
except Exception:
    pass

knowledge_collection = chroma_client.create_collection(
    name="easyfind_knowledge",
    embedding_function=embedding_fn
)
print("✅  Created fresh easyfind_knowledge collection.")

# ── Helper ────────────────────────────────────────────────────────────────────
def make_id(text: str, prefix: str = "") -> str:
    return prefix + hashlib.md5(text.encode()).hexdigest()[:16]

# Separate lists for knowledge and listings
kb_documents  = []
kb_metadatas  = []
kb_ids        = []

listing_documents = []
listing_metadatas = []
listing_ids       = []

# ── 1. Knowledge base ─────────────────────────────────────────────────────────
if KNOWLEDGE_FILE.exists():
    knowledge = json.loads(KNOWLEDGE_FILE.read_text(encoding="utf-8"))

    # Company overview
    company = knowledge.get("company", {})
    doc = (
        f"Company: {company.get('name', 'Easyfind Nigeria')}. "
        f"{company.get('description', '')} Country: {company.get('country', 'Nigeria')}."
    )
    kb_documents.append(doc)
    kb_metadatas.append({"type": "knowledge", "category": "company"})
    kb_ids.append(make_id(doc, "kb_"))

    # Fred AI identity
    fred = knowledge.get("fred_ai", {})
    doc = (
        f"Fred AI: {fred.get('name', 'Fred')} is the {fred.get('role', '')}. "
        f"{fred.get('description', '')} "
        f"Personality: {', '.join(fred.get('personality', []))}."
    )
    kb_documents.append(doc)
    kb_metadatas.append({"type": "knowledge", "category": "fred_ai"})
    kb_ids.append(make_id(doc, "kb_"))

    # FAQ entries
    for faq in knowledge.get("faq", []):
        doc = f"Q: {faq.get('question', '')} A: {faq.get('answer', '')}"
        kb_documents.append(doc)
        kb_metadatas.append({"type": "faq", "category": "faq"})
        kb_ids.append(make_id(doc, "faq_"))

    # Rules
    rules = knowledge.get("rules", {})
    if rules:
        doc = "Fred rules: " + " | ".join(f"{k}: {v}" for k, v in rules.items())
        kb_documents.append(doc)
        kb_metadatas.append({"type": "knowledge", "category": "rules"})
        kb_ids.append(make_id(doc, "kb_"))

    # Agent portal — how to post property + how to become agent
    portal = knowledge.get("agent_portal", {})
    if portal:
        steps = portal.get("how_to_post_property", [])
        if steps:
            doc = (
                "How to post a property on EasyFind as an agent: "
                + " ".join(f"Step {i+1}: {s}" for i, s in enumerate(steps))
                + f" Agent portal: {portal.get('portal_url', 'easyfind.com.ng/agent-loged')}."
            )
            kb_documents.append(doc)
            kb_metadatas.append({"type": "knowledge", "category": "agent_portal"})
            kb_ids.append(make_id(doc, "kb_"))

        upgrade_steps = portal.get("how_to_become_agent", [])
        if upgrade_steps:
            doc = (
                "How to become an agent on EasyFind / how to upgrade user account to agent: "
                + " ".join(f"Step {i+1}: {s}" for i, s in enumerate(upgrade_steps))
                + f" Upgrade page: {portal.get('upgrade_url', 'easyfind.com.ng/upgrade-to-agent')}."
                + f" New agent signup: {portal.get('signup_url', 'easyfind.com.ng/signup-agent')}."
            )
            kb_documents.append(doc)
            kb_metadatas.append({"type": "knowledge", "category": "agent_upgrade"})
            kb_ids.append(make_id(doc, "kb_"))

        if portal.get("verification"):
            doc = f"Agent verification on EasyFind: {portal['verification']}"
            kb_documents.append(doc)
            kb_metadatas.append({"type": "knowledge", "category": "agent_verification"})
            kb_ids.append(make_id(doc, "kb_"))

        if portal.get("boost"):
            doc = f"Agent boost on EasyFind: {portal['boost']}"
            kb_documents.append(doc)
            kb_metadatas.append({"type": "knowledge", "category": "agent_boost"})
            kb_ids.append(make_id(doc, "kb_"))

    # Login/signup URLs summary
    website = knowledge.get("website", {})
    portal  = knowledge.get("agent_portal", {})
    doc = (
        f"EasyFind Nigeria website: {website.get('url', 'https://easyfind.com.ng')}. "
        f"Agent login: {portal.get('login_url', 'https://easyfind.com.ng/login-agent')}. "
        f"Agent signup: {portal.get('signup_url', 'https://easyfind.com.ng/signup-agent')}. "
        f"Upgrade to agent: {portal.get('upgrade_url', 'https://easyfind.com.ng/upgrade-to-agent')}. "
        f"Agent dashboard: {portal.get('portal_url', 'https://easyfind.com.ng/agent-loged')}."
    )
    kb_documents.append(doc)
    kb_metadatas.append({"type": "knowledge", "category": "urls"})
    kb_ids.append(make_id(doc, "kb_"))

    print(f"📚  Loaded {len(kb_documents)} knowledge base documents.")
else:
    print("⚠️   easyfind_knowledge.json not found — skipping knowledge base.")

# ── 2. Live listings from MongoDB ─────────────────────────────────────────────
print("🔌  Connecting to MongoDB…")
try:
    from pymongo import MongoClient
    from bson import ObjectId

    mongo = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db    = mongo.get_default_database()

    # Try AgentPost collection (adjust name if yours differs)
    collection_names = db.list_collection_names()
    # find the posts collection — try common names
    post_col = None
    for name in ["agentposts", "AgentPost", "posts", "properties", "listings"]:
        if name in collection_names:
            post_col = db[name]
            break
    if post_col is None and collection_names:
        # fallback: use whichever collection has the most docs
        post_col = db[max(collection_names, key=lambda n: db[n].estimated_document_count())]

    if post_col is None:
        print("⚠️   No suitable listings collection found in MongoDB.")
    else:
        cursor = post_col.find(
            {},
            {
                "title": 1, "price": 1, "location": 1, "beds": 1, "baths": 1,
                "description": 1, "propertyType": 1, "category": 1,
                "status": 1, "postUrl": 1, "agentName": 1, "_id": 1
            }
        ).limit(500)  # cap at 500 for embedding budget

        listing_count = 0
        for doc in cursor:
            try:
                title    = doc.get("title") or "Property"
                location = doc.get("location") or "Enugu"
                price    = doc.get("price", -1)
                beds     = doc.get("beds", "N/A")
                baths    = doc.get("baths", "N/A")
                prop_type = doc.get("propertyType") or doc.get("category") or ""
                description = doc.get("description") or ""
                post_url = doc.get("postUrl") or ""
                agent    = doc.get("agentName") or ""

                price_str = f"₦{price:,.0f}" if (price and price > 0) else "Contact agent"

                text = (
                    f"{title}. Location: {location}. Price: {price_str}. "
                    f"Beds: {beds}. Baths: {baths}. Type: {prop_type}. "
                    f"Agent: {agent}. {description[:200]}"
                ).strip()

                meta = {
                    "type":     "listing",
                    "title":    title,
                    "location": location,
                    "price":    float(price) if (price and price > 0) else -1,
                    "beds":     str(beds),
                    "baths":    str(baths),
                    "postUrl":  post_url,
                    "agentName": agent,
                }

                doc_id = "listing_" + str(doc["_id"])
                listing_documents.append(text)
                listing_metadatas.append(meta)
                listing_ids.append(doc_id)
                listing_count += 1
            except Exception as e:
                print(f"   ⚠️  Skipped one listing: {e}")

        print(f"🏠  Loaded {listing_count} property listings from MongoDB ({post_col.name}).")

except ImportError:
    print("⚠️   pymongo not installed. Run: py -m pip install pymongo")
    print("     Seeding knowledge base only.")
except Exception as e:
    print(f"⚠️   MongoDB error: {e}")
    print("     Seeding knowledge base only.")

# ── 3. Embed & insert in batches ──────────────────────────────────────────────
BATCH = 64

# Insert knowledge into easyfind_knowledge collection
if kb_documents:
    print(f"\n⚡  Embedding {len(kb_documents)} knowledge documents…")
    for i in range(0, len(kb_documents), BATCH):
        knowledge_collection.add(
            documents=kb_documents[i:i+BATCH],
            metadatas=kb_metadatas[i:i+BATCH],
            ids=kb_ids[i:i+BATCH]
        )
        print(f"   ✓  {min(i+BATCH, len(kb_documents))}/{len(kb_documents)}")
    print(f"✅  Knowledge collection: {knowledge_collection.count()} chunks")

# Insert listings into easyfind_listings collection
if listing_documents:
    print(f"\n⚡  Embedding {len(listing_documents)} property listings…")
    for i in range(0, len(listing_documents), BATCH):
        collection.add(
            documents=listing_documents[i:i+BATCH],
            metadatas=listing_metadatas[i:i+BATCH],
            ids=listing_ids[i:i+BATCH]
        )
        print(f"   ✓  {min(i+BATCH, len(listing_documents))}/{len(listing_documents)}")
    print(f"✅  Listings collection: {collection.count()} properties")

print(f"\n🎉  Done! ChromaDB seeded.")
print(f"    Knowledge chunks : {knowledge_collection.count()}")
print(f"    Property listings: {collection.count()}")
print(f"    DB path: {DB_PATH}")
print(f"    Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("\nNow start Fred with:")
print('    py -m uvicorn Fred.main:app --host 127.0.0.1 --port 8000')
