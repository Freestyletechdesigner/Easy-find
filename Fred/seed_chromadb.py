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

# Delete and recreate for a clean seed
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

# ── Helper ────────────────────────────────────────────────────────────────────
def make_id(text: str, prefix: str = "") -> str:
    return prefix + hashlib.md5(text.encode()).hexdigest()[:16]

documents  = []
metadatas  = []
ids        = []

# ── 1. Knowledge base ─────────────────────────────────────────────────────────
if KNOWLEDGE_FILE.exists():
    knowledge = json.loads(KNOWLEDGE_FILE.read_text(encoding="utf-8"))

    # Company overview
    company = knowledge.get("company", {})
    doc = (
        f"Company: {company.get('name', 'Easyfind Nigeria')}. "
        f"{company.get('description', '')} Country: {company.get('country', 'Nigeria')}."
    )
    documents.append(doc)
    metadatas.append({"type": "knowledge", "category": "company"})
    ids.append(make_id(doc, "kb_"))

    # Fred AI identity
    fred = knowledge.get("fred_ai", {})
    doc = (
        f"Fred AI: {fred.get('name', 'Fred')} is the {fred.get('role', '')}. "
        f"{fred.get('description', '')} "
        f"Personality: {', '.join(fred.get('personality', []))}."
    )
    documents.append(doc)
    metadatas.append({"type": "knowledge", "category": "fred_ai"})
    ids.append(make_id(doc, "kb_"))

    # FAQ entries
    for faq in knowledge.get("faq", []):
        doc = f"Q: {faq.get('question', '')} A: {faq.get('answer', '')}"
        documents.append(doc)
        metadatas.append({"type": "faq", "category": "faq"})
        ids.append(make_id(doc, "faq_"))

    # Rules
    rules = knowledge.get("rules", {})
    if rules:
        doc = "Fred rules: " + " | ".join(f"{k}: {v}" for k, v in rules.items())
        documents.append(doc)
        metadatas.append({"type": "knowledge", "category": "rules"})
        ids.append(make_id(doc, "kb_"))

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
            documents.append(doc)
            metadatas.append({"type": "knowledge", "category": "agent_portal"})
            ids.append(make_id(doc, "kb_"))

        upgrade_steps = portal.get("how_to_become_agent", [])
        if upgrade_steps:
            doc = (
                "How to become an agent on EasyFind / how to upgrade user account to agent: "
                + " ".join(f"Step {i+1}: {s}" for i, s in enumerate(upgrade_steps))
                + f" Upgrade page: {portal.get('upgrade_url', 'easyfind.com.ng/upgrade-to-agent')}."
                + f" New agent signup: {portal.get('signup_url', 'easyfind.com.ng/signup-agent')}."
            )
            documents.append(doc)
            metadatas.append({"type": "knowledge", "category": "agent_upgrade"})
            ids.append(make_id(doc, "kb_"))

        if portal.get("verification"):
            doc = f"Agent verification on EasyFind: {portal['verification']}"
            documents.append(doc)
            metadatas.append({"type": "knowledge", "category": "agent_verification"})
            ids.append(make_id(doc, "kb_"))

        if portal.get("boost"):
            doc = f"Agent boost on EasyFind: {portal['boost']}"
            documents.append(doc)
            metadatas.append({"type": "knowledge", "category": "agent_boost"})
            ids.append(make_id(doc, "kb_"))

    print(f"📚  Loaded {len(documents)} knowledge base documents.")
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
                documents.append(text)
                metadatas.append(meta)
                ids.append(doc_id)
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
total = len(documents)
print(f"\n⚡  Embedding {total} documents in batches of {BATCH}…")

for i in range(0, total, BATCH):
    batch_docs  = documents[i:i+BATCH]
    batch_metas = metadatas[i:i+BATCH]
    batch_ids   = ids[i:i+BATCH]
    collection.add(documents=batch_docs, metadatas=batch_metas, ids=batch_ids)
    print(f"   ✓  {min(i+BATCH, total)}/{total}")

print(f"\n🎉  Done! ChromaDB seeded with {total} documents.")
print(f"    DB path: {DB_PATH}")
print(f"    Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("\nNow start Fred with:")
print('    py -m uvicorn Fred.main:app --host 127.0.0.1 --port 8000')
