# Fred AI Engine — EasyFind Nigeria

Fred is EasyFind's AI assistant. It uses:
- **Gemini API** — primary LLM (fast, high-quality); auto-rotates across two keys when quota is hit
- **Ollama** — local LLM fallback when both Gemini keys are exhausted (no downtime)
- **ChromaDB** — vector search over property listings, auto-updated when agents post
- **FastAPI + Uvicorn** — HTTP API consumed by the Node.js backend
- **Supervisor** — 3-layer hallucination guard (rule guard + LLM grounding check)

---

## Local Development (Windows)

### 1. Start Ollama
```cmd
ollama serve
```
Confirm the model is pulled:
```cmd
ollama list
```
If `llama3.2:1b` is missing:
```cmd
ollama pull llama3.2:1b
```

### 2. Start Fred
```cmd
cd "C:\Users\Dell PC\Desktop\web e"
py -m uvicorn Fred.main:app --host 127.0.0.1 --port 8000
```

### 3. Start Node.js
```cmd
node app.js
```

### Health check
Open in browser: http://127.0.0.1:8000/health

Expected:
```json
{
  "status": "ok",
  "ollama": "reachable",
  "ollama_model": "llama3.2:1b",
  "searxng": "offline — web search disabled",
  "listings_docs": 9,
  "knowledge_docs": 31
}
```

### Low RAM fallback
If your machine has less than 1.5 GB free, switch to a smaller model:
```cmd
ollama pull qwen2.5:0.5b
```
Then in `.env`:
```
OLLAMA_MODEL=qwen2.5:0.5b
```

---

## VPS Deployment (Ubuntu 22.04 / 24.04)

### Prerequisites
- VPS with at least **4 GB RAM** (8 GB recommended for `llama3.2:1b`)
- Ubuntu 22.04 or 24.04
- Your project uploaded to `/var/www/easyfind`
- `.env` file present at `/var/www/easyfind/.env`

### One-shot deployment
Upload the project to your VPS, then:
```bash
chmod +x /var/www/easyfind/deploy.sh
sudo /var/www/easyfind/deploy.sh
```

The script installs and configures everything automatically:
| Step | What it does |
|------|-------------|
| System packages | Node.js 20, Python 3.11, Nginx, UFW |
| Ollama | Installs + pulls `llama3.2:1b` |
| Python venv | `Fred/venv/` with pinned deps from `requirements.txt` |
| npm | Installs Node.js production dependencies |
| systemd: `ollama` | Starts Ollama on boot |
| systemd: `fred` | Starts Fred (FastAPI) on boot, after Ollama |
| PM2: `easyfind` | Starts Node.js app, restarts on crash |
| Nginx | Reverse proxy on port 80 → Node.js on 9000 |
| UFW | Opens ports 22 (SSH), 80, 443 |
| ChromaDB seed | Populates Fred from MongoDB listings |

### After deployment — add SSL
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d easyfind.com.ng -d www.easyfind.com.ng
```
Certbot auto-renews. Done.

### Managing services on the VPS

**Fred (FastAPI)**
```bash
sudo systemctl status fred
sudo systemctl restart fred
sudo journalctl -u fred -f          # live logs
```

**Ollama**
```bash
sudo systemctl status ollama
sudo systemctl restart ollama
sudo journalctl -u ollama -f
```

**Node.js app**
```bash
pm2 status
pm2 logs easyfind
pm2 restart easyfind
```

**Nginx**
```bash
sudo systemctl status nginx
sudo nginx -t                        # test config
sudo systemctl reload nginx
```

### Managing SearXNG
```bash
# Status
docker compose -f /var/www/easyfind/searxng/docker-compose.yml ps

# Restart
docker compose -f /var/www/easyfind/searxng/docker-compose.yml restart

# Logs
docker compose -f /var/www/easyfind/searxng/docker-compose.yml logs -f

# Stop
docker compose -f /var/www/easyfind/searxng/docker-compose.yml down
```

SearXNG runs on `http://localhost:8080` — only accessible locally (not exposed to the internet). Fred calls it directly.

### Re-seeding ChromaDB on the VPS
Run this any time you want to force a full re-index from MongoDB:
```bash
cd /var/www/easyfind
Fred/venv/bin/python Fred/seed_chromadb.py
sudo systemctl restart fred
```

### Changing the model on the VPS
```bash
sudo -u ollama ollama pull llama3.2:3b     # pull the new model
```
Edit `/var/www/easyfind/.env`:
```
OLLAMA_MODEL=llama3.2:3b
```
Then restart Fred:
```bash
sudo systemctl restart fred
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2:1b` | Local model name (fallback) |
| `GEMINI_API_KEY` | — | Primary Gemini API key |
| `GEMINI_API_KEY2` | — | Secondary Gemini key (auto-rotated when key 1 hits quota) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model name |
| `FRED_URL` | `http://127.0.0.1:8000` | Used by Node.js to push property updates |
| `SEARXNG_URL` | `http://localhost:8080` | Optional web search fallback |

---

## LLM backend — Gemini first, Ollama fallback

Fred uses a priority chain for every LLM call:

```
GEMINI_API_KEY  →  GEMINI_API_KEY2  →  Ollama (local)
```

- **Gemini** is used for all calls by default — faster responses, better quality.
- When a key returns HTTP **429 (quota exhausted)**, it is marked as unavailable and the next key is tried automatically.
- When **both keys** are exhausted, Fred silently falls back to the local Ollama model with no downtime.
- Exhausted keys **auto-recover** after 1 hour (matching Google's free-tier quota window). Paid-tier keys recover sooner — adjust `GEMINI_QUOTA_RESET_SECS` in `main.py` if needed.

### Checking the active backend

```
GET /api/fred/llm/status   (admin only)
```

Example response:
```json
{
  "active_backend": "gemini (KEY1)",
  "gemini_model":   "gemini-2.0-flash",
  "ollama_model":   "llama3.2:1b",
  "gemini_keys": [
    { "label": "KEY1", "state": "active" },
    { "label": "KEY2", "state": "active" }
  ]
}
```

When quota is hit:
```json
{
  "active_backend": "ollama (fallback)",
  "gemini_keys": [
    { "label": "KEY1", "state": "exhausted — resets in 42m 17s" },
    { "label": "KEY2", "state": "exhausted — resets in 11m 5s" }
  ]
}
```

### Using a different Gemini model

In `.env`:
```
GEMINI_MODEL=gemini-2.5-flash
```
Then restart Fred. Any model available in your Google AI Studio project works.

---

## Model options

| Model | RAM needed | Quality |
|-------|-----------|---------|
| `qwen2.5:0.5b` | ~400 MB | Low — backup for tight RAM |
| `llama3.2:1b` ✅ | ~1.5 GB | **Recommended default** |
| `llama3.2:3b` | ~3.5 GB | Better — good for 8 GB VPS |
| `llama3.1:8b` | ~6 GB | Best — needs 16 GB VPS |

---

## Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app — full pipeline |
| `requirements.txt` | Pinned Python dependencies |
| `fred.service` | systemd unit for Fred on the VPS |
| `ollama.service` | systemd unit for Ollama on the VPS |
| `seed_chromadb.py` | Populates ChromaDB from MongoDB |
| `build_knowledge_json.py` | Regenerates `easyfind_knowledge.json` |
| `easyfind_knowledge.json` | Company / FAQ knowledge base |
| `fred_chromadb/` | Local vector DB (gitignored, auto-rebuilt) |
| `venv/` | Python venv (gitignored, created by deploy.sh) |
