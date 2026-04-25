# Deployment Guide

## Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- Node.js 20+ with npm/pnpm
- A reverse proxy with TLS (nginx, Caddy, etc.) for production

---

## 1. Backend

### Install dependencies

```bash
uv sync
```

### Configure environment

Create `.env` in the project root:

```env
# Required
SECRET_KEY=<hex-64-chars>          # python -c "import secrets; print(secrets.token_hex(32))"

# Optional – defaults shown
DATABASE_PATH=openkoutsi.db
FILE_STORAGE_PATH=uploads
FRONTEND_URL=https://your-domain
API_URL=https://api.your-domain
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Encryption for stored OAuth tokens and per-user LLM API keys (required for AI features)
ENCRYPTION_KEY=<fernet-key>        # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Strava (see "Strava Bridge" section)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
BRIDGE_URL=
BRIDGE_SECRET=

# Wahoo (register at developers.wahooligan.com)
WAHOO_CLIENT_ID=
WAHOO_CLIENT_SECRET=

# Server-side LLM (OpenAI-compatible) — used when no per-user LLM is configured
LLM_BASE_URL=                      # e.g. http://localhost:11434/v1 or https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=                         # e.g. llama3.2, gpt-4o-mini

# Optional: comma-separated list of allowed LLM base URLs users may choose from.
# When set, users must pick one of these servers instead of entering an arbitrary URL.
# Leave blank to allow users to enter any URL (subject to SSRF guards).
LLM_ALLOWED_SERVERS=               # e.g. http://localhost:11434/v1,https://api.openai.com/v1
```

### Initialize the database

**Fresh install** — let SQLAlchemy create all tables:

```bash
INIT_DB=true uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
# Stop after it starts; tables are now created.
```

**Existing database** — use Alembic:

```bash
uv run alembic upgrade head
```

### Run

```bash
uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

For production add `--workers 2` (or use gunicorn with uvicorn workers).

---

## 2. Frontend

### Configure environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://api.your-domain
```

### Build and run

The frontend can be built on any machine (e.g. your laptop) and the output copied to the server — no build step needed on the server.

**Build locally:**

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=https://api.your-domain npm run build
```

The build produces a self-contained server under `.next/standalone/`. Copy the static assets into it:

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public        .next/standalone/public
```

**Deploy to server:**

```bash
rsync -a --delete frontend/.next/standalone/ user@your-server:~/projects/openkoutsi/frontend/.next/standalone/
```

**Run on server** (or via the systemd service):

```bash
cd ~/projects/openkoutsi/frontend/.next/standalone
PORT=3000 node server.js
```

---

## 3. Reverse Proxy (nginx example)

```nginx
# API
server {
    listen 443 ssl;
    server_name api.your-domain;
    location / { proxy_pass http://127.0.0.1:8000; }
}

# Frontend
server {
    listen 443 ssl;
    server_name your-domain;
    location / { proxy_pass http://127.0.0.1:3000; }
}
```

---

## 4. Strava Bridge (optional)

The bridge is a separate service that receives Strava webhooks. Strava requires a **public HTTPS URL**.

### Setup

```bash
cd strava_bridge
uv sync
```

Create `strava_bridge/.env`:

```env
STRAVA_CLIENT_SECRET=<same as main app>
BRIDGE_SECRET=<same random string as BRIDGE_SECRET in main .env>
DATABASE_PATH=bridge.db
```

### Run

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8001
```

Expose it via your reverse proxy (e.g. `bridge.your-domain`) or ngrok for local testing.

### Register webhook with Strava (one-time)

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://bridge.your-domain/webhook \
  -F verify_token=YOUR_BRIDGE_SECRET
```

A `{"id": N}` response confirms the subscription. Keep the ID to manage the subscription later.

---

## 5. systemd Services

Service files are provided in the `systemd/` directory as [template units](https://www.freedesktop.org/software/systemd/man/systemd.unit.html#Description). The `@username` suffix at enable time fills in the user and home directory automatically.

```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openkoutsi-backend@$(whoami) openkoutsi-frontend@$(whoami)
# Only needed if using the Strava bridge:
sudo systemctl enable --now openkoutsi-bridge@$(whoami)
```

The frontend service uses a hardcoded nvm Node path. If you upgrade Node, update the `ExecStart` line in `systemd/openkoutsi-frontend@.service` and re-copy the file.

Check logs with `journalctl -u openkoutsi-backend@$(whoami) -f` (replace the unit name as needed).

---

## Checklist

- [ ] `SECRET_KEY` set to a strong random value
- [ ] `ENCRYPTION_KEY` set (required for per-user LLM API key storage; recommended for all prod deployments)
- [ ] Database initialized (`INIT_DB=true` or `alembic upgrade head`)
- [ ] `FRONTEND_URL` and `API_URL` point to real domains
- [ ] `NEXT_PUBLIC_API_URL` in `frontend/.env.local` points to the API
- [ ] TLS termination in place for both frontend and API
- [ ] Strava app callback domain updated to production domain (if using Strava)
