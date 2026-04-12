# openkoutsi — Implementation Plan

## Guiding Principle

**Build the simplest system that works. Add complexity only when a real, concrete need justifies it.**

Every dependency, abstraction, and infrastructure component has a cost: setup time, operational burden, debugging surface, and onboarding friction. The default answer to "should we add X?" is no. Something gets added only when the alternative is genuinely worse.

---

## Overview

openkoutsi is a web-based cycling coaching platform. The goal is a self-hosted, privacy-first application where athletes own their data, can sync from Strava or upload FIT files manually, and receive training plans based on their goals and fitness metrics.

The Python core (`openkoutsi/`) already provides working data models (Athlete, Workout, Zones, Goal) and FIT file parsing. This plan builds a full-stack web application on top of that foundation.

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │  Strava API                  │
                        └──────┬──────────────┬────────┘
                    OAuth/sync │              │ webhooks
                               │    ┌─────────▼───────────────────┐
                               │    │  Strava Bridge              │
                               │    │  (cloud-hosted, public HTTPS│
                               │    │   tiny FastAPI service)     │
                               │    └─────────┬───────────────────┘
                               │              │ forward events
                               │              │ (shared secret)
┌──────────────────────────────▼──────────────▼──────────────────┐
│                        Main App                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Next.js Frontend                       │  │
│  │            (TypeScript + Tailwind + Recharts)            │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                 │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │                    FastAPI Backend                       │  │
│  │   Auth  │  Activities  │  Metrics  │  Plans  │  FIT parse│  │
│  │                  BackgroundTasks                         │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                 │
│                     ┌────────▼────────┐                        │
│                     │  SQLite (WAL)   │                        │
│                     └─────────────────┘                        │
│                                                                │
│  Self-hosted: home server, VPS, laptop — no public URL needed  │
└────────────────────────────────────────────────────────────────┘
```

### Why a separate Strava Bridge?

Strava's API Terms of Service require that apps handle webhook events for user deauthorization and promptly delete that user's data. A missed deauthorization webhook is a compliance failure, not just a sync inconvenience.

The main app can run self-hosted behind NAT with no public URL. The webhook receiver, however, must be reliably reachable over public HTTPS at all times — including when the main app is offline. These are different reliability requirements, which justifies a separate deployable.

The Bridge cannot call back to the main app directly — the main app has no public URL. Instead, the Bridge acts as a durable event queue: it stores incoming webhook events in its own SQLite file, and the main app polls the Bridge periodically to claim and process them.

```
Strava ──POST /webhook──▶ Bridge (validates signature, stores event)

Main app ──GET /events/pending──▶ Bridge  (polls every ~60s via BackgroundTask)
Main app ──POST /events/{id}/claim──▶ Bridge  (after processing each event)
```

Both directions are authenticated with a shared secret. The Bridge never needs to know the main app's address. Events older than 7 days are purged automatically.

The Bridge needs only one extra file (SQLite) and one extra table (`webhook_events`). It can be deployed for free on Fly.io or Railway.

### Design Principles

- **Simplest viable stack**: SQLite + FastAPI + Next.js. No Redis, no Celery, no separate worker process.
- **Separate only what must be separate**: the Strava Bridge exists solely because Strava's ToS demands a reliable public HTTPS endpoint. Everything else runs in the main app.
- **Strava is optional**: the platform is fully functional without a Strava account. FIT file upload is the primary data input path; Strava sync is a convenience on top of it.
- **Privacy-first**: users own their data; full export and delete at any time.
- **Self-hostable main app**: a single Docker container (or `uv run` + `pnpm dev`) — no public URL required.
- **Async where needed**: FIT parsing and metric recalculation run in FastAPI `BackgroundTasks` — no external queue required at this scale.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend framework | **FastAPI** | Python-native, async, auto OpenAPI docs, Pydantic models complement existing dataclasses |
| Database | **SQLite** (WAL mode) | Zero infrastructure — one file, trivial backup, no separate process |
| ORM / migrations | **SQLAlchemy 2 + Alembic** | Async ORM, declarative models; swap to Postgres later if ever needed |
| Background tasks | **FastAPI BackgroundTasks** | Built-in, no broker required; sufficient for single-user load |
| Auth | **JWT (python-jose)** | Stateless, no session store needed |
| Frontend framework | **Next.js 15 (App Router)** | TypeScript, SSR for initial load, good ecosystem |
| UI / styling | **Tailwind CSS + shadcn/ui** | Utility-first, accessible component primitives |
| Charts | **Recharts** | Composable React charts, good for time-series data |
| Package manager | **uv** (Python) / **pnpm** (JS) | Fast, deterministic |
| Strava Bridge | **FastAPI** (tiny, separate deploy) | Strava ToS requires reliable public HTTPS for webhooks; this is the only component that needs it |
| Container | **Docker** (two images: main app + bridge) | Optional; app also runs directly with uv + pnpm |

**Not used (and why):**
- ~~Redis~~ — no caching or queue needed at this scale
- ~~Celery~~ — FastAPI BackgroundTasks is sufficient; add Celery only if background jobs become a bottleneck
- ~~PostgreSQL~~ — SQLite handles single-user load comfortably; migrate if multi-user hosting becomes a goal

---

## Database Schema

All primary keys are `TEXT` (UUID generated in Python via `uuid.uuid4()`). JSON columns use `TEXT` (SQLite has no native JSON type, but SQLAlchemy's `JSON` type handles serialization transparently).

### `users`
```sql
id            TEXT PRIMARY KEY
email         TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at    TEXT DEFAULT (datetime('now'))
deleted_at    TEXT    -- soft delete
```

### `athletes`
```sql
id                    TEXT PRIMARY KEY
user_id               TEXT REFERENCES users(id) ON DELETE CASCADE
display_name          TEXT
weight_kg             REAL
max_hr                INTEGER
current_ftp           INTEGER
hr_zones              TEXT    -- JSON: [{low, high, name}, ...]
power_zones           TEXT    -- JSON: [{low, high, name}, ...]
availability          TEXT    -- JSON: {days_per_week, max_hours_per_week, long_ride_day}
ftp_tests             TEXT    -- JSON: [{date, ftp}, ...] — append-only historical log
strava_athlete_id     INTEGER UNIQUE
strava_access_token   TEXT
strava_refresh_token  TEXT
strava_token_expires  TEXT
created_at            TEXT DEFAULT (datetime('now'))
updated_at            TEXT DEFAULT (datetime('now'))
```

### `activities`
```sql
id                 TEXT PRIMARY KEY
athlete_id         TEXT REFERENCES athletes(id) ON DELETE CASCADE
strava_id          INTEGER UNIQUE
source             TEXT    -- 'strava' | 'manual'
name               TEXT
sport_type         TEXT
start_time         TEXT NOT NULL
duration_s         INTEGER
distance_m         REAL
elevation_m        REAL
avg_power_w        REAL
normalized_power_w REAL
avg_hr             REAL
avg_speed_ms       REAL
avg_cadence        REAL
tss                REAL
intensity_factor   REAL
fit_file_path      TEXT
status             TEXT DEFAULT 'pending'    -- pending | processed | error
created_at         TEXT DEFAULT (datetime('now'))
```

### `activity_streams`
```sql
id          TEXT PRIMARY KEY
activity_id TEXT REFERENCES activities(id) ON DELETE CASCADE
stream_type TEXT    -- 'power' | 'heartrate' | 'cadence' | 'speed' | 'altitude' | 'distance' | 'time'
data        TEXT    -- JSON array of REAL values, sampled at 1s intervals
```

### `daily_metrics`
```sql
athlete_id  TEXT REFERENCES athletes(id) ON DELETE CASCADE
date        TEXT NOT NULL
ctl         REAL    -- Chronic Training Load (fitness), 42-day EWA
atl         REAL    -- Acute Training Load (fatigue), 7-day EWA
tsb         REAL    -- Training Stress Balance (form) = CTL - ATL
tss_day     REAL    -- total TSS for the day
PRIMARY KEY (athlete_id, date)
```

### `goals`
```sql
id           TEXT PRIMARY KEY
athlete_id   TEXT REFERENCES athletes(id) ON DELETE CASCADE
goal_type    TEXT    -- 'event' | 'fitness' | 'weight' | 'ftp'
description  TEXT
target_date  TEXT
target_value REAL
priority     INTEGER DEFAULT 1
created_at   TEXT DEFAULT (datetime('now'))
```

### `training_plans`
```sql
id          TEXT PRIMARY KEY
athlete_id  TEXT REFERENCES athletes(id) ON DELETE CASCADE
goal_id     TEXT REFERENCES goals(id)
name        TEXT
start_date  TEXT
end_date    TEXT
status      TEXT DEFAULT 'active'    -- active | completed | paused
created_at  TEXT DEFAULT (datetime('now'))
```

### `planned_workouts`
```sql
id                    TEXT PRIMARY KEY
plan_id               TEXT REFERENCES training_plans(id) ON DELETE CASCADE
scheduled_date        TEXT
workout_type          TEXT    -- endurance | tempo | threshold | vo2max | recovery | long
description           TEXT
target_tss            REAL
target_duration_min   INTEGER
completed_activity_id TEXT REFERENCES activities(id)
```

---

## API Design (FastAPI)

### Auth — `/api/auth`
| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create account |
| POST | `/login` | Returns JWT access + refresh token |
| POST | `/refresh` | Rotate tokens |
| DELETE | `/account` | Delete account and all data |

### Strava — `/api/strava` (main app)
| Method | Path | Description |
|---|---|---|
| GET | `/connect` | Returns OAuth authorization URL |
| GET | `/callback` | OAuth callback — exchanges code for tokens |
| POST | `/sync` | Manually trigger full activity sync (BackgroundTask) |
| DELETE | `/disconnect` | Revoke Strava integration |

### Strava Bridge — separate service
| Method | Path | Description |
|---|---|---|
| GET | `/webhook` | Strava hub challenge verification (subscription setup) |
| POST | `/webhook` | Receives Strava webhook, validates signature, stores event |
| GET | `/events/pending` | Main app polls for unprocessed events (shared secret auth) |
| POST | `/events/{id}/claim` | Main app marks event as processed |

### Athlete Profile — `/api/athlete`
| Method | Path | Description |
|---|---|---|
| GET | `/` | Get athlete profile |
| PUT | `/` | Update profile (weight, FTP, HR zones, power zones) |
| GET | `/export` | Full data export as JSON/ZIP |

### Activities — `/api/activities`
| Method | Path | Description |
|---|---|---|
| GET | `/` | Paginated activity list with filters (date range, type) |
| GET | `/{id}` | Activity detail with streams |
| POST | `/upload` | Upload FIT file — processing runs as BackgroundTask |
| DELETE | `/{id}` | Delete activity |

### Metrics — `/api/metrics`
| Method | Path | Description |
|---|---|---|
| GET | `/fitness` | CTL/ATL/TSB time series (date range param) |
| GET | `/fitness/current` | Today's CTL, ATL, TSB snapshot |
| GET | `/zones/{activity_id}` | Zone distribution for an activity |
| GET | `/ftp-history` | Historical FTP test values |

### Goals — `/api/goals`
| Method | Path | Description |
|---|---|---|
| GET | `/` | List goals |
| POST | `/` | Create goal |
| PUT | `/{id}` | Update goal |
| DELETE | `/{id}` | Delete goal |

### Training Plan — `/api/plans`
| Method | Path | Description |
|---|---|---|
| GET | `/active` | Current active plan |
| POST | `/generate` | Generate new plan from active goals |
| GET | `/{id}/workouts` | Planned workouts (calendar view) |
| PUT | `/workouts/{id}` | Adjust a planned workout |

---

## Core Metric Calculations

### TSS (Training Stress Score)

**With power data**:
```
IF = NP / FTP
TSS = (duration_s × NP × IF) / (FTP × 3600) × 100
```

Normalized Power: 30-second rolling average of power values, raised to the 4th power, averaged, then 4th-root.

**Heart-rate proxy (when no power)**:
```
hrTSS = (duration_s × avg_hr × TRIMP_weight) / (LTHR × 3600) × 100
```

### CTL / ATL / TSB

Exponentially weighted averages, recalculated daily forward from earliest activity:

```python
CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) * (1 - exp(-1/42))
ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) * (1 - exp(-1/7))
TSB_today = CTL_yesterday - ATL_yesterday   # "yesterday's form"
```

When a past activity is added or deleted, a BackgroundTask recomputes `daily_metrics` forward from that date. This is fast enough synchronously for personal-scale data (a few thousand activities).

---

## Training Plan Generation

### Algorithm

1. Parse primary goal: event date, goal type, current CTL/ATL
2. Calculate weeks to goal, determine total training volume budget
3. Apply periodization model: Base → Build → Peak → Taper
4. Ramp CTL toward target (max +5–8 CTL/week to avoid injury risk)
5. Distribute weekly TSS across available training days per athlete's `Availability` settings
6. Assign workout types per day based on phase and weekly structure
7. Output: list of `PlannedWorkout` records

### Phase Breakdown

| Phase | Duration | Focus | Intensity Distribution |
|---|---|---|---|
| Base | ~30–40% of plan | Aerobic foundation | 80% Z1-Z2, 20% Z3 |
| Build | ~35–45% | Raise threshold | 70% Z1-Z2, 20% Z3-Z4, 10% Z5 |
| Peak | ~15–20% | Race-specific intensity | 60% Z1-Z2, 25% Z4-Z5, 15% Z6+ |
| Taper | ~10% | Freshness (reduce volume 40–50%) | Low volume, maintain intensity |

---

## Implementation Phases

Phases are ordered by dependency. Each phase produces a working vertical slice before the next begins.

### Phase 1: Core Backend
Everything else depends on this. No frontend work starts until the API and processing pipeline are solid.

- FastAPI project scaffold with SQLAlchemy models and Alembic migrations
- SQLite database with WAL mode enabled on startup
- User registration / login / JWT auth
- Athlete profile CRUD
- FIT file upload endpoint → BackgroundTask → parse with existing `openkoutsi` code → store activity + streams
- Activity list and detail endpoints
- TSS calculation (power + HR fallback)
- Daily metrics recalculation as BackgroundTask (CTL/ATL/TSB)

### Phase 2: Strava Integration
Depends on Phase 1 (activity ingestion pipeline must exist first).

**Main app:**
- Strava OAuth2 flow (token storage, auto-refresh)
- Manual full sync: paginate athlete activities, fetch streams
- Deduplication via `strava_id`
- Scheduled BackgroundTask (~60s): polls Bridge `GET /events/pending`, processes each event, claims it
- On deauthorization event: revoke tokens, clear strava_* columns on Athlete

**Strava Bridge** (separate deployable, ~150 lines):
- `GET /webhook` — Strava hub challenge during subscription setup
- `POST /webhook` — validates `X-Hub-Signature-256` against `STRAVA_CLIENT_SECRET`, stores event in SQLite
- `GET /events/pending` — returns unclaimed events (authenticated by `BRIDGE_SECRET`)
- `POST /events/{id}/claim` — marks event as processed
- Cleanup: delete events older than 7 days

### Phase 3: Frontend — Auth & Dashboard
Depends on Phase 1. Can proceed in parallel with Phase 2.

- Next.js app with App Router, TypeScript, Tailwind, shadcn/ui
- Auth pages: register, login
- Athlete profile setup (weight, FTP, zones)
- Dashboard: current CTL/ATL/TSB, recent activities, weekly TSS bar chart
- CTL/ATL/TSB history chart (90-day Recharts area chart)
- Strava connect button and sync status (requires Phase 2)

### Phase 4: Activity Pages
Depends on Phase 3 (navigation and auth shell must exist).

- Activity list with filter (date range, sport type)
- Activity detail: power/HR/cadence time-series chart, zone distribution donut chart
- FIT file upload dropzone with processing status
- Activity delete with confirmation

### Phase 5: Goals & Training Plan
Depends on Phase 4. Requires real activity data to validate plan generation logic.

- Goal creation form (event, fitness, FTP targets)
- Plan generation and calendar view of planned workouts
- Workout detail panel
- Compliance tracking: planned vs completed TSS per week

### Phase 6: Data Ownership & Polish
Depends on all prior phases.

- Full data export (JSON + FIT files as ZIP)
- Account deletion (cascade delete, background file cleanup)
- Mobile-responsive polish
- Onboarding for new users

---

## Project Directory Structure

```
openkoutsi/                    ← existing Python core library (keep as-is)
pyproject.toml                ← add FastAPI, SQLAlchemy, httpx, etc.

backend/
  app/
    api/
      auth.py
      athlete.py
      activities.py
      strava.py               ← OAuth, sync, Bridge polling task
      metrics.py
      goals.py
      plans.py
    models/                   ← SQLAlchemy ORM models
    services/
      fit_processor.py        ← wraps openkoutsi FIT parsing
      strava_client.py        ← httpx-based Strava API client
      metrics_engine.py       ← TSS / CTL / ATL / TSB calculations
      plan_generator.py       ← training plan algorithm
    db/
      base.py                 ← SQLAlchemy engine (SQLite + WAL), session
      migrations/             ← Alembic revisions
    core/
      config.py               ← pydantic-settings env config
      auth.py                 ← JWT helpers
  main.py                     ← FastAPI app factory

strava_bridge/                ← separate deployable (~150 lines)
  main.py                     ← FastAPI app: receive webhooks, store events, serve to poller
  openkoutsi.db                ← SQLite file (webhook_events table only)
  Dockerfile
  pyproject.toml              ← minimal deps: fastapi, sqlalchemy, uvicorn

frontend/
  plan/
    plan.md                   ← this file
  src/
    app/
      (auth)/login/page.tsx
      (auth)/register/page.tsx
      dashboard/page.tsx
      activities/page.tsx
      activities/[id]/page.tsx
      goals/page.tsx
      plan/page.tsx
      profile/page.tsx
    components/
      charts/
        FitnessChart.tsx
        ZoneDonut.tsx
        WeeklyTssBar.tsx
      activities/
        ActivityCard.tsx
        StreamChart.tsx
      plan/
        PlanCalendar.tsx
        WorkoutCard.tsx
      ui/                     ← shadcn/ui components
    lib/
      api.ts                  ← typed fetch client
      auth.ts
  package.json

Dockerfile                    ← optional; single image for self-hosting
```

---

## Environment Variables

```env
# Main app
DATABASE_PATH=/data/openkoutsi.db
SECRET_KEY=<random 256-bit key>
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
BRIDGE_SECRET=<shared secret for Bridge → main app calls>
FRONTEND_URL=http://localhost:3000
FILE_STORAGE_PATH=/data/uploads

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Strava Bridge (separate deploy)
STRAVA_CLIENT_SECRET=          # to verify X-Hub-Signature-256 on incoming webhooks
STRAVA_WEBHOOK_VERIFY_TOKEN=   # for hub challenge during subscription setup
BRIDGE_SECRET=<same shared secret as main app>
# Note: Bridge does not need MAIN_APP_URL — main app polls Bridge, not the other way around
```

---

## Open Questions / Decisions

1. **FTP auto-detection**: detect 20-min best power from activity streams, propose 95% as new FTP. Reduces manual entry friction considerably.

2. **Training plan regeneration policy**: explicit user action (re-generate button) rather than silent auto-adjust, to preserve transparency and athlete control.

3. **Strava webhooks**: handled by the Bridge, which must be deployed to a public HTTPS host. The main app has no public URL requirement. The Bridge is stateless and cheap to host (fits on a free tier).

4. **AI workout narratives**: optionally use the Claude API to generate natural-language weekly summaries. Optional feature gated behind a user-provided API key — not part of the core system.

5. **Multi-sport**: data model is sport-agnostic. Running support (HR-based TSS, run-specific zones) can be added later without schema changes.
