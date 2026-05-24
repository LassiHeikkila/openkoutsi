<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/design/exports-horizontal/openkoutsi-horizontal-white.svg">
  <source media="(prefers-color-scheme: light)" srcset="frontend/design/exports-horizontal/openkoutsi-horizontal-black.svg">
  <img src="frontend/design/exports-horizontal/openkoutsi-horizontal-black.svg" alt="openkoutsi">
</picture>

# openkoutsi

A self-hosted cycling coaching platform. Upload FIT files or sync from Strava/Wahoo, track fitness metrics (CTL/ATL/TSB), and generate periodized training plans from your own server.

> **koutsi** (κουτσί) — Finnish for "coach"

## Why

Most cycling coaching tools are cloud-only SaaS. openkoutsi is different: you run it on your own hardware, your data stays under your control, and integrations are optional.

## Features

- **Multi-team support** — isolated teams with separate databases/storage; users can belong to multiple teams
- **Invite-only signup + team requests** — setup wizard creates the first team/admin; later team creation requests can be approved via superadmin
- **Admin dashboard** — manage members, invitations, password resets, and per-team LLM settings
- **Coach access** — coaches can view athlete profiles and activity lists inside their team
- **FIT file ingestion** — upload activities directly with automatic TSS, normalized power, and zone distribution analysis
- **Workout categorization** — automatic Coggan-style zone classification with manual override
- **Strava + Wahoo sync** — OAuth integrations with history import and webhook updates through bridge services
- **Zone sync** — sync HR/power zones and FTP from connected providers
- **Fitness metrics** — CTL/ATL/TSB computed and shown as interactive charts
- **Training calendar** — dashboard calendar shows both performed and planned workouts with distinct visual markers
- **Training plan generation** — periodized plans (Base → Build → Peak → Taper)
- **Structured workouts** — create interval workouts and export as Zwift `.zwo` or FIT workout files for head units
- **AI coaching analysis** — per-activity analysis and plan support with OpenAI-compatible backends
- **Privacy-first** — export your data and delete your account at any time
- **Cycling-themed 404 page** — localized "Wrong Turn!" not-found page with cycling flavour

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Next.js frontend (TypeScript · Tailwind · Recharts)              │
│  FastAPI backend (Python · SQLAlchemy · Alembic)                  │
│                                                                    │
│  data/registry.db                 global users + team registry     │
│  data/teams/{id}/team.db          per-team athletic data           │
│  data/teams/{id}/uploads/         encrypted FIT files              │
└────────────────────────────────────────────────────────────────────┘
                 ↕ polls for events
       ┌──────────────────────────────┐     ┌──────────────────────────────┐
       │ Strava Bridge (FastAPI)      │     │ Wahoo Bridge (FastAPI)       │
       │ public webhook endpoint       │     │ public webhook endpoint       │
       └──────────────────────────────┘     └──────────────────────────────┘
```

The bridge services are small external webhook receivers. The main app polls them, so the main app can stay private (for example behind NAT) while only bridges are exposed publicly.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic |
| Database | SQLite (WAL mode) |
| Auth | JWT (`python-jose` · `passlib`) |
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind CSS |
| Charts | Recharts |
| FIT parsing | fitdecode |
| Package managers | uv (Python) · npm (frontend) |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm
- [uv](https://docs.astral.sh/uv/)

### Run locally

```bash
# 1. Clone
git clone https://github.com/your-username/openkoutsi.git
cd openkoutsi

# 2. Create backend env
cat > .env <<'ENV'
SECRET_KEY=<random 256-bit key>
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:8000
# Optional but recommended if you use encrypted token/file storage features:
# ENCRYPTION_KEY=<fernet-key>
ENV

# 3. Install backend deps and run API
uv sync --group dev
uv run uvicorn backend.main:app --reload --port 8000

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev

# 5. First-run setup
# Open http://localhost:3000 and complete the setup wizard.
```

## Environment variables

Main app (`.env`):

```env
# Required
SECRET_KEY=<random 256-bit key>

# Core settings
DATA_DIR=data
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:8000

# Optional encryption (required for encrypted key/file flows)
ENCRYPTION_KEY=<fernet-key>

# Strava integration (optional)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
BRIDGE_URL=
BRIDGE_SECRET=

# Wahoo integration (optional)
WAHOO_CLIENT_ID=
WAHOO_CLIENT_SECRET=
WAHOO_BRIDGE_URL=
WAHOO_BRIDGE_SECRET=

# Optional server-side LLM defaults
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_ALLOWED_SERVERS=

# Optional: enables /superadmin for approving pending teams
SUPERADMIN_SECRET=
```

Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Integrations

- **Strava:** configure Strava app credentials in `.env` and deploy `strava_bridge/` to a public HTTPS URL.
- **Wahoo:** configure Wahoo credentials in `.env` and deploy `wahoo_bridge/` to a public HTTPS URL.

Detailed production setup, reverse proxy examples, systemd units, bridge registration steps, and GitHub Actions automated deployment are in [DEPLOY.md](DEPLOY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
