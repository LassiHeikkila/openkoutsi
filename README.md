<img src="frontend/design/exports/frame-wheels-black.svg" alt="openkoutsi" width="120">

# openkoutsi

A self-hosted cycling coaching platform. Upload FIT files or sync from Strava, track fitness metrics (CTL/ATL/TSB), and generate periodized training plans — all from your own server.

> **koutsi** (κουτσί) — Finnish for "coach"

## Why

Most cycling coaching tools are cloud-only SaaS. openkoutsi is different: you run it on your own hardware, your data never leaves your control, and you can export or delete everything at any time. Strava sync is a convenience layer on top of the core platform, not a requirement.

## Features

- **Multi-team support** — isolated teams (clubs, friend groups), each with their own encrypted database and storage; users can belong to multiple teams
- **Invite-only signup** — administrators generate invite links with configurable roles and expiry; no open registration
- **Admin dashboard** — manage members (roles, removal, password resets), invitations, and per-team LLM settings
- **Coach access** — coaches can view any team member's athlete profile and activity list
- **First-run setup wizard** — fresh deployments guide you through creating the first team and admin account
- **FIT file ingestion** — upload activity files directly; TSS, normalized power, and zone distributions are calculated automatically
- **Workout categorization** — automatic classification into Recovery, Endurance, Tempo, Threshold, VO2 Max, Anaerobic, and Sprint based on Coggan's power zone model; manually overridable
- **Strava sync** — OAuth2 connection with full activity history import and real-time webhook updates
- **Zone sync** — one-click sync of HR zones, power zones, and FTP from Strava or Wahoo (manual editing still supported)
- **Fitness metrics** — CTL (fitness), ATL (fatigue), TSB (form) calculated via exponentially weighted averages, displayed as interactive charts
- **Zone analysis** — power and heart-rate zone distribution per activity
- **Power curve time ranges** — all-time, 12M, 6M, or 3M rolling windows for the power curve chart
- **AI coaching analysis** — per-activity LLM analysis and AI-generated training plans; bring your own API key (encrypted at rest, proxied server-side — never exposed to the browser); override the server LLM per team
- **Training plan generation** — periodized plans (Base → Build → Peak → Taper) generated from your goals, availability, and current fitness
- **Privacy-first** — full data export (JSON + FIT files) and account deletion at any time
- **Self-hostable** — runs as a single Docker container or bare `uv` + `pnpm` processes; no public URL required

## License

Apache-2.0. See [LICENSE](LICENSE).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Next.js frontend  (TypeScript · Tailwind · Recharts)│
│──────────────────────────────────────────────────────│
│  FastAPI backend   (Python · SQLAlchemy · Alembic)   │
│──────────────────────────────────────────────────────│
│  data/registry.db   ← global users & team registry  │
│  data/teams/{id}/team.db  ← per-team athletic data  │
│  data/teams/{id}/uploads/ ← FIT files (encrypted)   │
│                                                      │
│  Self-hosted — no public URL needed                  │
└──────────────────────────────────────────────────────┘
              ↕ polls for events
┌──────────────────────────────────────────────────────┐
│  Strava Bridge  (tiny FastAPI service, cloud-hosted) │
│  Receives Strava webhooks · queues events            │
└──────────────────────────────────────────────────────┘
```

The Strava Bridge is a small separate service (~150 lines) that must be publicly reachable for Strava's webhook API. The main app polls it for events — this means your main app can sit behind NAT with no port forwarding required. The bridge can be deployed for free on Fly.io or Railway.

Data is split between a global registry database (user identities, team memberships, invitations) and per-team databases (athletic data). Each team's FIT files and avatar images are stored under `data/teams/{team_id}/`.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic |
| Database | SQLite (WAL mode) |
| Auth | JWT (python-jose · passlib) |
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui |
| Charts | Recharts |
| FIT parsing | fitdecode |
| Package managers | uv (Python) · pnpm (JS) |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+ and pnpm
- [uv](https://docs.astral.sh/uv/)

### Run locally

```bash
# 1. Clone
git clone https://github.com/your-username/openkoutsi.git
cd openkoutsi

# 2. Backend
cp .env.example .env          # fill in SECRET_KEY at minimum
uv sync
uv run uvicorn backend.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev                      # → http://localhost:3000

# 4. First-run setup
# Open http://localhost:3000 — you will be prompted to create
# the first team and admin account via the setup wizard.
```

### Environment variables

```env
# Main app (.env)
SECRET_KEY=<random 256-bit key>
DATA_DIR=data                     # stores registry.db and per-team databases
FRONTEND_URL=http://localhost:3000

# Strava integration (optional)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
BRIDGE_URL=https://your-bridge-host
BRIDGE_SECRET=<shared secret>

# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Strava integration

Strava sync is optional. To enable it:

1. Create a Strava API app at <https://www.strava.com/settings/api>
2. Deploy the Strava Bridge (see [`strava_bridge/`](strava_bridge/)) to any host with a public HTTPS URL
3. Register the webhook subscription with Strava (instructions in [`TODO.md`](TODO.md))
4. Add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `BRIDGE_URL`, and `BRIDGE_SECRET` to `.env`
