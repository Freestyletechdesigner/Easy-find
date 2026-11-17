# EasyFind — VPS Deployment Guide

Ubuntu 24.04 LTS · Node.js 20 · Python 3.12 · PM2 · Nginx

Server: `92.242.191.177`  
Project path: `/var/www/easyfind`

---

## 1. Connect to the server

```bash
ssh root@92.242.191.177
```

---

## 2. System dependencies

```bash
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Python 3.12 + pip + venv
apt install -y python3 python3-pip python3-venv

# Build tools needed by sharp, canvas, bcrypt
apt install -y build-essential git nginx certbot python3-certbot-nginx

# PM2 (global)
npm install -g pm2
```

---

## 3. Upload the project

### Option A — Git Bash (recommended, already installed)

Open Git Bash on your Windows machine and run:

```bash
scp -r "/c/Users/Dell PC/Desktop/web e/" root@92.242.191.177:/var/www/easyfind
```

> Note: Git Bash uses Unix-style paths — `C:/Users/...` becomes `/c/Users/...`

### Option B — WinSCP (GUI, easiest)

1. Download from [winscp.net](https://winscp.net/eng/download.php) and install
2. Open WinSCP → New Session:
   - Protocol: **SFTP**
   - Host: `92.242.191.177`
   - Username: `root`
   - Password: your VPS password
3. Click **Login**
4. Left panel: navigate to `C:\Users\Dell PC\Desktop\web e\`
5. Right panel: navigate to `/var/www/easyfind`
6. Select all files → drag to the right panel

### Option C — rsync via Git Bash (faster for re-uploads)

First, install rsync on the server:

```bash
# Run this on the VPS
apt update && apt install rsync -y
```

Then from Git Bash on your Windows machine:

```bash
rsync -avz --partial --append-verify \
  --exclude 'node_modules' --exclude '.git' --exclude 'Fred/fred_chromadb' \
  "/c/Users/Dell PC/Desktop/web e/" \
  root@92.242.191.177:/var/www/easyfind/
```

The `--partial` and `--append-verify` flags make rsync **resumable** — if your PC shuts off mid-transfer, just run the same command again and it picks up exactly where it stopped. Already-transferred files are skipped entirely.

### Option D — Git (cleanest for ongoing deploys)

Push your project to GitHub first, then on the server:

```bash
git clone https://github.com/YOUR_USERNAME/easyfind.git /var/www/easyfind
```

Add `.gitignore` entries to avoid pushing secrets:
```
.env
node_modules/
whatsapp-session/
agent-loged/upload-property/
agent-profiles/
user-profiles/
Fred/fred_chromadb/
```

---

## 4. Set ownership

```bash
chown -R www-data:www-data /var/www/easyfind
chmod -R 755 /var/www/easyfind
```

---

## 5. Create the .env file

```bash
nano /var/www/easyfind/.env
```

Paste your environment variables (copy from your local `.env` and update values for production):

```env
NODE_ENV=production
SESSION_SECRET=your_long_random_secret_here
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/easyfind
APP_URL=https://easyfind.com.ng
PAYSTACK_SECRET_KEY=sk_live_...
GEMINI_API_KEY=...
GEMINI_API_KEY2=...
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_CLIENT_ID=...
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_FROM=service@easyfind.com.ng
ADMIN_EMAIL=admin042@easyfind.com
ADMIN_PASSWORD=...
SMILE_ID_PARTNER_ID=...
SMILE_ID_API_KEY=...
SMILE_ID_ENVIRONMENT=production
ONESIGNAL_APP_ID=...
ONESIGNAL_REST_API_KEY=...
FRED_URL=http://127.0.0.1:8000
NODE_URL=http://127.0.0.1:9000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
SEARXNG_URL=http://localhost:8080
WHATSAPP_SESSION_DIR=/var/www/easyfind/whatsapp-session
```

---

## 6. Install Node.js dependencies

```bash
cd /var/www/easyfind
npm install --legacy-peer-deps
```

---

## 7. Create required directories

```bash
mkdir -p /var/www/easyfind/agent-loged/upload-property
mkdir -p /var/www/easyfind/agent-profiles
mkdir -p /var/www/easyfind/user-profiles
mkdir -p /var/www/easyfind/whatsapp-session
mkdir -p /var/log/easyfind
chown -R www-data:www-data /var/www/easyfind
```

---

## 8. Create the first admin account

```bash
cd /var/www/easyfind
node create-admin.js
```

---

## 9. Set up Fred (Python AI engine)

```bash
cd /var/www/easyfind/Fred

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Seed the knowledge base (first time only)
python seed_chromadb.py

# Deactivate venv
deactivate
```

### Install Fred as a systemd service

```bash
# Copy the service file
cp /var/www/easyfind/Fred/fred.service /etc/systemd/system/fred.service

# Reload and enable
systemctl daemon-reload
systemctl enable fred
systemctl start fred

# Verify Fred is running
systemctl status fred
curl http://127.0.0.1:8000/health
```

---

## 10. Install Ollama (local LLM fallback)

```bash
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model Fred uses as fallback
ollama pull llama3.2:1b

# Enable Ollama as a service
systemctl enable ollama
systemctl start ollama
```

---

## 11. Start the Node.js app with PM2

```bash
cd /var/www/easyfind

# Update the cwd path in ecosystem.config.js if needed
# It should already say: cwd: '/var/www/easyfind'

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the command it prints to auto-start on reboot
```

Check it's running:

```bash
pm2 status
pm2 logs easyfind --lines 50
```

---

## 12. Configure Nginx as a reverse proxy

```bash
nano /etc/nginx/sites-available/easyfind
```

Paste:

```nginx
server {
    listen 80;
    server_name easyfind.com.ng www.easyfind.com.ng;

    client_max_body_size 210M;

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
        proxy_read_timeout 120s;
    }
}
```

Enable and test:

```bash
ln -s /etc/nginx/sites-available/easyfind /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 13. SSL certificate (HTTPS)

```bash
certbot --nginx -d easyfind.com.ng -d www.easyfind.com.ng
```

Certbot auto-renews. Verify:

```bash
certbot renew --dry-run
```

---

## 14. WhatsApp (Baileys) — scan QR code once

```bash
cd /var/www/easyfind
node whatsapp-connect.js
```

Scan the QR code with the WhatsApp number you want Fred to use. The session is saved to `whatsapp-session/` and reconnects automatically on restart.

---

## 15. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## Useful commands

| Task | Command |
|---|---|
| View Node.js logs | `pm2 logs easyfind` |
| Restart Node.js app | `pm2 restart easyfind` |
| View Fred logs | `journalctl -u fred -f` |
| Restart Fred | `systemctl restart fred` |
| Restart Nginx | `systemctl reload nginx` |
| Check all services | `pm2 status && systemctl status fred ollama nginx` |
| Re-seed Fred knowledge | `cd /var/www/easyfind/Fred && source venv/bin/activate && python seed_chromadb.py` |
| Deploy new code | See section below |

---

## Deploying updates

**From Git Bash on Windows (fastest — only sends changed files, resumes if disconnected):**

```bash
rsync -avz --partial --append-verify \
  --exclude 'node_modules' --exclude '.git' --exclude 'Fred/fred_chromadb' \
  "/c/Users/Dell PC/Desktop/web e/" \
  root@92.242.191.177:/var/www/easyfind/
```

**Then on the server:**

```bash
cd /var/www/easyfind
npm install --legacy-peer-deps   # only if package.json changed
pm2 restart easyfind
systemctl restart fred           # only if Fred Python code changed
```

Or if using Git:

```bash
cd /var/www/easyfind
git pull
npm install --legacy-peer-deps
pm2 restart easyfind
systemctl restart fred
```

---

## Service architecture

```
Internet
    │
    ▼
Nginx :443 (HTTPS)
    │
    ▼
Node.js :9000  (PM2 — easyfind)
    │
    ├──► MongoDB Atlas (cloud)
    ├──► Fred FastAPI :8000  (systemd — fred)
    │        └──► Ollama :11434  (systemd — ollama)
    └──► WhatsApp Baileys (embedded in Node.js)
```

---

## Troubleshooting

**App won't start**
```bash
pm2 logs easyfind --err --lines 100
```

**Fred offline**
```bash
systemctl status fred
journalctl -u fred -n 50
curl http://127.0.0.1:8000/health
```

**Nginx 502 Bad Gateway**
```bash
pm2 status          # check Node.js is running
systemctl status nginx
```

**WhatsApp disconnected**
```bash
# Delete old session and re-scan
rm -rf /var/www/easyfind/whatsapp-session/*
node /var/www/easyfind/whatsapp-connect.js
```

**Port already in use**
```bash
lsof -i :9000
kill -9 <PID>
pm2 restart easyfind
```
