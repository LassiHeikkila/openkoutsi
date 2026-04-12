# Backend Implementation Plan — openkoutsi

## Context

The `openkoutsi/` Python package already provides FIT parsing, workout zone analysis, and data models (Athlete, Workout, Zones, Goal). This plan builds the FastAPI web layer on top of that foundation. Work is scoped to **Phase 1** (core backend) with a separate section for **Phase 2** (Strava). Frontend (Phase 3+) is out of scope here.

Confirmed design decisions:
- Strava Bridge: **stateful queue** (SQLite). Main app polls; events survive main-app downtime.
- `athletes.availability`: stored as a **JSON column** in the athletes table.
- Auth: **multi-user** — full `users` table + JWT from day one.

---

## Component 0: Refactor FIT Parsing into the Package

**Why first:** Every downstream component depends on it.

The FIT parsing logic lives in root `main.py` as `summarizeWorkout()`. Move it into the package so the backend service can import it cleanly.

- Move `summarizeWorkout()` → `openkoutsi/fit.py`
- Update root `main.py` to import from `openkoutsi.fit`
- **Critical files:** `main.py`, `openkoutsi/workout.py`

---

## Component 1: Project Scaffold & Configuration

**Files to create:**
- `pyproject.toml` — add deps
- `backend/app/core/config.py` — pydantic-settings
- `backend/app/db/base.py` — engine + session
- `backend/main.py` — app factory

**Dependencies to add to `pyproject.toml`:**
```
fastapi[standard]       # includes uvicorn, pydantic v2
sqlalchemy[asyncio]>=2.0
alembic
aiosqlite               # async SQLite driver
python-jose[cryptography]
passlib[bcrypt]
python-multipart        # file uploads
httpx                   # Strava client (Phase 2), also test client
pydantic-settings
```

**`config.py`** — pydantic-settings `Settings` class reading from env:
```python
database_path: str       # path to .db file
secret_key: str          # JWT signing key
access_token_expire_minutes: int = 60
file_storage_path: str   # uploaded FIT files
frontend_url: str        # CORS origin
# Phase 2 additions:
strava_client_id: str = ""
strava_client_secret: str = ""
bridge_url: str = ""
bridge_secret: str = ""
```

**`db/base.py`:**
- `create_async_engine("sqlite+aiosqlite:///{settings.database_path}")`
- Enable WAL mode on connect via `event.listen(engine.sync_engine, "connect", ...)`
- `AsyncSession = async_sessionmaker(engine, expire_on_commit=False)`
- `async def get_session()` — FastAPI dependency

**`backend/main.py`:**
- `create_app()` factory function
- Include all routers under `/api`
- CORS middleware with `frontend_url`
- `@app.on_event("startup")` → `async_create_all()` (tables + WAL)

---

## Component 2: ORM Models & Migrations

**Files to create:**
- `backend/app/models/orm.py` — all SQLAlchemy models
- `backend/alembic.ini` + `backend/app/db/migrations/`

**SQLAlchemy models** (all `Base` subclasses, TEXT PKs via `uuid.uuid4()`):

| Model | Key columns |
|---|---|
| `User` | id, email, password_hash, created_at, deleted_at |
| `Athlete` | id, user_id FK, display_name, weight_kg, max_hr, current_ftp, hr_zones (JSON TEXT: `[{low,high,name}]`), power_zones (JSON TEXT: `[{low,high,name}]`), availability (JSON TEXT: `{days_per_week,max_hours_per_week,long_ride_day}`), ftp_tests (JSON TEXT: `[{date,ftp}]`), strava_* fields, timestamps |
| `Activity` | id, athlete_id FK, strava_id, source, name, sport_type, start_time, duration_s, distance_m, elevation_m, avg_power_w, normalized_power_w, avg_hr, avg_speed_ms, avg_cadence, tss, intensity_factor, fit_file_path, status |
| `ActivityStream` | id, activity_id FK, stream_type, data (JSON TEXT array) |
| `DailyMetric` | athlete_id + date (composite PK), ctl, atl, tsb, tss_day |
| `Goal` | id, athlete_id FK, goal_type, description, target_date, target_value, priority, created_at |
| `TrainingPlan` | id, athlete_id FK, goal_id FK, name, start_date, end_date, status |
| `PlannedWorkout` | id, plan_id FK, scheduled_date, workout_type, description, target_tss, target_duration_min, completed_activity_id FK |

**Alembic setup:**
```
alembic init backend/app/db/migrations
```
- `env.py`: point at `Base.metadata` and the async engine
- Initial migration creates all tables + WAL PRAGMA

---

## Component 3: Auth

**Files to create:**
- `backend/app/core/auth.py` — helpers
- `backend/app/api/auth.py` — routes
- `backend/app/schemas/auth.py` — Pydantic schemas

**`core/auth.py` functions:**
```python
hash_password(plain: str) -> str           # passlib bcrypt
verify_password(plain, hashed) -> bool
create_access_token(user_id: str) -> str   # python-jose JWT, 60min
create_refresh_token(user_id: str) -> str  # 30-day
decode_token(token: str) -> dict
get_current_user(token=Depends(oauth2_scheme), session=Depends(get_session)) -> User
```

**Routes (`/api/auth`):**

| Method | Path | Logic |
|---|---|---|
| POST | `/register` | Hash password, create User + Athlete rows, return both tokens |
| POST | `/login` | Fetch user by email, `verify_password`, return tokens |
| POST | `/refresh` | Decode refresh token, return new access token |
| DELETE | `/account` | Set `user.deleted_at = now()`, relies on CASCADE for downstream data |

---

## Component 4: Athlete Profile

**Files to create:**
- `backend/app/api/athlete.py`
- `backend/app/schemas/athlete.py`

**Schemas:**
- `AthleteResponse` — mirrors Athlete model; `hr_zones` / `power_zones` deserialized to `list[{low, high, name}]` (matches frontend `Zone[]` type)
- `AthleteUpdate` — all fields optional; includes `availability: dict`

**Routes (`/api/athlete`):**

| Method | Path | Logic |
|---|---|---|
| GET | `/` | Return athlete for current user |
| PUT | `/` | Partial update: weight, ftp, hr_zones, power_zones, availability, display_name |
| GET | `/export` | Stub — 501 Not Implemented until Phase 6 |

---

## Component 5: FIT Upload & Activity Pipeline

**Files to create:**
- `backend/app/services/fit_processor.py` — wraps `openkoutsi.fit`
- `backend/app/api/activities.py`
- `backend/app/schemas/activities.py`

**`fit_processor.py` — `process_fit_file(path, athlete, session)`:**
1. Call `openkoutsi.fit.summarizeWorkout(fitdecode.FitReader(path))` — reuses `openkoutsi/fit.py` (Component 0)
2. Calculate **Normalized Power** (NP):
   ```python
   # 30s rolling mean of power → ^4 → mean → ^0.25
   ```
3. Calculate **TSS**:
   - If power data: `IF = NP / athlete.current_ftp; TSS = (dur * NP * IF) / (ftp * 3600) * 100`
   - Else HR fallback: `hrTSS = (dur * avg_hr * trimp_weight) / (lthr * 3600) * 100` where `lthr ≈ 0.9 * max_hr`
4. Insert `Activity` row (status=`processed`)
5. Insert `ActivityStream` rows for power, heartrate, cadence, speed
6. Return the created `Activity`

**Routes (`/api/activities`):**

| Method | Path | Logic |
|---|---|---|
| POST | `/upload` | Save FIT to `file_storage_path/{athlete_id}/{uuid}.fit`; create Activity(status=pending); fire `BackgroundTasks.add_task(process_fit_file, ...)` + `recalculate_metrics(...)` |
| GET | `/` | Paginated list; filter params: `start`, `end` (dates), `sport_type`; no streams returned |
| GET | `/{id}` | Full activity + streams reshaped to `{power?: [], heartrate?: [], cadence?: [], speed?: [], altitude?: [], time: []}` — keyed by stream_type; 404 if not owned by current user |
| DELETE | `/{id}` | Delete activity + file from disk; fire `recalculate_metrics` BackgroundTask |

---

## Component 6: Metrics Engine

**Files to create:**
- `backend/app/services/metrics_engine.py`
- `backend/app/api/metrics.py`

**`metrics_engine.py`:**
```python
async def recalculate_from(athlete_id: str, from_date: date, session: AsyncSession):
    # 1. Load seed CTL/ATL from day before from_date (or 0.0)
    # 2. Load all activities from_date..today, bucket TSS by date
    # 3. Forward-iterate days:
    #    k42 = 1 - exp(-1/42)
    #    k7  = 1 - exp(-1/7)
    #    CTL = CTL_prev + (tss_day - CTL_prev) * k42
    #    ATL = ATL_prev + (tss_day - ATL_prev) * k7
    #    TSB = CTL_prev - ATL_prev
    # 4. Upsert DailyMetric rows (athlete_id, date) ON CONFLICT DO UPDATE
```

**Routes (`/api/metrics`):**

| Method | Path | Returns |
|---|---|---|
| GET | `/fitness` | `[{date, ctl, atl, tsb, tss_day}]` — query params: `start`, `end` |
| GET | `/fitness/current` | Single snapshot for today |
| GET | `/zones/{activity_id}` | `{hr: {Z1: seconds, ...}, power: {...}}` — calls `openkoutsi.workout.zoneBreakdown` with athlete's stored zones |
| GET | `/ftp-history` | Parsed from `athlete.ftp_tests` JSON column |

---

## Component 7: Goals

**Files to create:**
- `backend/app/api/goals.py`
- `backend/app/schemas/goals.py`

**Routes (`/api/goals`):**

| Method | Path | Logic |
|---|---|---|
| GET | `/` | List goals for current athlete |
| POST | `/` | Create goal |
| PUT | `/{id}` | Update goal (ownership check) |
| DELETE | `/{id}` | Delete goal (ownership check) |

---

## Phase 2: Strava Integration (after Phase 1 is solid)

### Main App Additions

- `backend/app/services/strava_client.py` — httpx async client: `get_athlete()`, `get_activities(page, per_page)`, `get_streams(activity_id)`, `refresh_token()`
- `backend/app/api/strava.py`:
  - `GET /api/strava/connect` → returns Strava OAuth URL
  - `GET /api/strava/callback` → exchange code, store tokens on Athlete
  - `POST /api/strava/sync` → BackgroundTask: paginate all Strava activities, skip strava_id dupes, call fit_processor equivalent for each
  - `DELETE /api/strava/disconnect` → revoke + clear strava_* columns
  - Background polling task (every ~60s): `GET {bridge_url}/events/pending`, process each, `POST {bridge_url}/events/{id}/claim`

### Strava Bridge — `strava_bridge/`

Separate deployable (~150 lines total):
- `strava_bridge/main.py` — FastAPI app
- `strava_bridge/pyproject.toml` — deps: fastapi, sqlalchemy, aiosqlite, uvicorn, python-jose

**`webhook_events` table:** `id, strava_event_type, strava_owner_id, payload (JSON), received_at, claimed_at`

**Endpoints:**
- `GET /webhook` — Strava hub challenge (returns `hub.challenge`)
- `POST /webhook` — validates `X-Hub-Signature-256` against `STRAVA_CLIENT_SECRET`, inserts row
- `GET /events/pending` — Bearer `BRIDGE_SECRET` auth; returns unclaimed events
- `POST /events/{id}/claim` — sets `claimed_at`
- Background cleanup: delete events where `received_at < now() - 7 days`

---

## Verification

After each component, verify with:

1. **Component 0:** `uv run python -c "from openkoutsi.fit import summarizeWorkout; print('ok')"`
2. **Component 1:** `uv run uvicorn backend.main:app --reload` — `GET /docs` returns OpenAPI UI
3. **Component 2:** `uv run alembic upgrade head` — creates `openkoutsi.db`
4. **Component 3:** `curl -X POST /api/auth/register` + `curl -X POST /api/auth/login` return JWT tokens
5. **Component 5:** Upload `testdata/Zwift_Aerobic_Foundation_Forge.fit` via `POST /api/activities/upload` — activity appears in `GET /api/activities/`
6. **Component 6:** After upload, `GET /api/metrics/fitness/current` returns non-zero CTL/ATL values
7. **End-to-end:** Import `testdata/Zwift_Aerobic_Foundation_Forge.fit`, check zone distribution at `GET /api/metrics/zones/{id}` matches CLI output from root `main.py`

---

## Open Questions (deferred — not blocking Phase 1)

- **FTP auto-detection**: detect 20-min best power from streams, propose `95% * best` as new FTP. Add as a `POST /api/metrics/ftp-detect/{activity_id}` endpoint in Phase 4.
- **AI narratives**: optional `POST /api/metrics/narrative/{week}` backed by Claude API, gated on user-provided API key. Phase 6.
