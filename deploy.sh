#!/usr/bin/env bash
# =============================================================================
# EasyFind VPS Deployment Script
# Tested on Ubuntu 22.04 / 24.04
#
# Run as root or a sudo user:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# What this script does:
#   1. Installs system packages (Node.js 20, Python 3.11, Nginx, PM2)
#   2. Installs Ollama and pulls the AI model
#   3. Sets up the Python venv and installs Fred's dependencies
#   4. Installs Node.js dependencies
#   5. Creates the systemd services (ollama, fred)
#   6. Starts everything with PM2 + systemd
#   7. Seeds ChromaDB from MongoDB
# =============================================================================

set -euo pipefail

# ── Config — edit these before running ────────────────────────────────────────
APP_DIR="/var/www/easyfind"        # where your project lives on the VPS
APP_USER="www-data"                # user that runs node + fred
OLLAMA_MODEL="llama3.2:1b"        # model to pull (change to qwen2.5:0.5b for low RAM)
NODE_VERSION="20"                  # Node.js major version
LOG_DIR="/var/log/easyfind"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── 0. Sanity checks ──────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo ./deploy.sh"
[[ ! -f "$APP_DIR/.env" ]] && error ".env not found at $APP_DIR/.env — copy it there first."
[[ ! -f "$APP_DIR/app.js" ]] && error "app.js not found at $APP_DIR — is the project uploaded?"

info "Starting EasyFind deployment…"
mkdir -p "$LOG_DIR"
chown "$APP_USER":"$APP_USER" "$LOG_DIR" 2>/dev/null || true

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating system packages…"
apt-get update -qq
apt-get install -y -qq \
    curl wget git build-essential \
    python3.11 python3.11-venv python3.11-dev \
    nginx ufw

# ── 2. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(\".\")[0].slice(1))')" != "$NODE_VERSION" ]]; then
    info "Installing Node.js $NODE_VERSION…"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
fi
info "Node $(node -v) / npm $(npm -v) ✓"

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "Installing PM2…"
    npm install -g pm2
fi
info "PM2 $(pm2 -v) ✓"

# ── 4. Ollama ─────────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    info "Installing Ollama…"
    curl -fsSL https://ollama.com/install.sh | sh
else
    info "Ollama already installed ✓"
fi

# Install/overwrite the systemd service
cp "$APP_DIR/Fred/ollama.service" /etc/systemd/system/ollama.service

# Create ollama user/group if not present
if ! id -u ollama &>/dev/null; then
    useradd -r -s /bin/false -m -d /usr/share/ollama ollama
fi

systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama
sleep 3  # give Ollama a moment to bind the port

info "Pulling Ollama model: $OLLAMA_MODEL (this may take a few minutes)…"
# Run as the ollama user so the model lands in the right cache dir
sudo -u ollama ollama pull "$OLLAMA_MODEL" || warn "Model pull failed — run manually: ollama pull $OLLAMA_MODEL"
info "Ollama model ready ✓"

# ── 5. Python venv + Fred dependencies ───────────────────────────────────────
VENV="$APP_DIR/Fred/venv"
info "Setting up Python venv at $VENV…"
python3.11 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install -r "$APP_DIR/Fred/requirements.txt"
chown -R "$APP_USER":"$APP_USER" "$VENV"
info "Python venv ready ✓"

# ── 6. Node.js dependencies ───────────────────────────────────────────────────
info "Installing Node.js dependencies…"
cd "$APP_DIR"
npm install --omit=dev --silent
info "npm install done ✓"

# ── 7. Fred systemd service ───────────────────────────────────────────────────
info "Installing Fred systemd service…"
cp "$APP_DIR/Fred/fred.service" /etc/systemd/system/fred.service
systemctl daemon-reload
systemctl enable fred
systemctl restart fred
sleep 2

# Health check
if curl -sf http://127.0.0.1:8000/health | grep -q '"status":"ok"'; then
    info "Fred is healthy ✓"
else
    warn "Fred health check failed — check: sudo journalctl -u fred -f"
fi

# ── 8. Seed ChromaDB ──────────────────────────────────────────────────────────
info "Seeding ChromaDB from MongoDB…"
"$VENV/bin/python" "$APP_DIR/Fred/seed_chromadb.py" || warn "ChromaDB seed failed — run manually: python Fred/seed_chromadb.py"

# ── 9. PM2 — Node.js app ─────────────────────────────────────────────────────
info "Starting Node.js app with PM2…"
cd "$APP_DIR"
pm2 delete easyfind 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
# Generate and print the startup command
STARTUP_CMD=$(pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | grep "sudo")
if [[ -n "$STARTUP_CMD" ]]; then
    info "Running PM2 startup command…"
    eval "$STARTUP_CMD"
fi
info "PM2 app started ✓"

# ── 9b. SearXNG (Docker) ─────────────────────────────────────────────────────
info "Setting up SearXNG…"

# Install Docker if not present
if ! command -v docker &>/dev/null; then
    info "Installing Docker…"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin if not present
if ! docker compose version &>/dev/null 2>&1; then
    info "Installing Docker Compose plugin…"
    apt-get install -y docker-compose-plugin
fi

SEARXNG_DIR="$APP_DIR/searxng"

# Generate a random secret key in settings.yml if still the default
if grep -q "CHANGE_THIS_TO_A_RANDOM_SECRET" "$SEARXNG_DIR/settings.yml"; then
    SECRET=$(openssl rand -hex 32)
    sed -i "s/CHANGE_THIS_TO_A_RANDOM_SECRET/$SECRET/" "$SEARXNG_DIR/settings.yml"
    info "SearXNG secret key generated ✓"
fi

# Start SearXNG
cd "$SEARXNG_DIR"
docker compose pull -q
docker compose up -d
cd "$APP_DIR"

# Wait for SearXNG to be ready
info "Waiting for SearXNG to start…"
for i in $(seq 1 15); do
    if curl -sf "http://localhost:8080/search?q=test&format=json" | grep -q "results"; then
        info "SearXNG is ready ✓"
        break
    fi
    sleep 2
done

# Update .env SEARXNG_URL
sed -i "s|SEARXNG_URL=.*|SEARXNG_URL=http://localhost:8080|" "$APP_DIR/.env"
info "SEARXNG_URL updated in .env ✓"

# ── 10. Nginx reverse proxy ───────────────────────────────────────────────────
info "Configuring Nginx…"
cat > /etc/nginx/sites-available/easyfind <<'NGINX'
server {
    listen 80;
    server_name easyfind.com.ng www.easyfind.com.ng;

    # Increase body size for image uploads
    client_max_body_size 20M;

    # Proxy everything to Node.js
    location / {
        proxy_pass         http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE (Fred streaming) — disable buffering
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/easyfind /etc/nginx/sites-enabled/easyfind
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "Nginx configured ✓"

# ── 11. Firewall ──────────────────────────────────────────────────────────────
info "Configuring firewall…"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
info "Firewall configured ✓"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  EasyFind deployment complete!         ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Services running:"
echo "    Ollama   → systemctl status ollama"
echo "    Fred     → systemctl status fred  /  journalctl -u fred -f"
echo "    SearXNG  → docker compose -f $APP_DIR/searxng/docker-compose.yml ps"
echo "    Node.js  → pm2 status"
echo "    Nginx    → systemctl status nginx"
echo ""
echo "  Next step — install SSL:"
echo "    apt install certbot python3-certbot-nginx"
echo "    certbot --nginx -d easyfind.com.ng -d www.easyfind.com.ng"
echo ""
echo "  Health check:"
echo "    curl http://127.0.0.1:8000/health"
echo ""
