# openkoutsi Frontend — Implementation Plan

## Context

Builds on the FastAPI backend defined in the root `plan.md`. This plan covers the frontend only: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui + Recharts.

**Goal**: Simplest UI that covers the full user journey — register → upload workouts → view fitness metrics → set goals → follow a training plan.

---

## Resolved Design Decisions

| Question | Decision |
|---|---|
| FTP auto-detection | Excluded — FTP is set manually on the profile page only |
| AI workout narratives | Deferred. When added, use any OpenAI-compatible endpoint (Claude, OpenAI, Ollama). Profile page will have endpoint URL, API key, model name fields. Stub section with "coming soon" placeholder now. |
| Strava UI placement | Profile page only — connect, sync, disconnect all live on `/profile` |
| JWT storage | Refresh token in `localStorage`, access token in-memory module variable |
| Data fetching | SWR for reads, plain `fetch` + `mutate()` for mutations |
| FIT upload status | 2s polling loop, 60s timeout, optimistic card in list |
| Training plan calendar | Simple 7-column weekly table, Prev/Next week navigation |
| Strava OAuth redirect | Backend redirects to `/profile?strava=connected` — profile page reads search params on mount |

---

## File Structure

```
frontend/
  src/
    lib/
      api.ts              ← typed fetch client + token refresh on 401
      auth.tsx            ← AuthContext, useAuth hook, token storage
      types.ts            ← all API response types
    middleware.ts         ← redirect unauthenticated users to /login
    app/
      layout.tsx          ← root: <SWRConfig fetcher={apiFetch}> + <AuthProvider>
      globals.css
      (auth)/
        layout.tsx        ← centered layout, no nav
        login/page.tsx
        register/page.tsx
      (app)/
        layout.tsx        ← nav shell + client-side auth guard
        dashboard/page.tsx
        activities/
          page.tsx
          [id]/page.tsx
        profile/page.tsx
        goals/page.tsx
        plan/page.tsx
    components/
      Nav.tsx
      charts/
        FitnessChart.tsx   ← CTL/ATL/TSB 90-day area chart
        WeeklyTssBar.tsx   ← 8-week TSS bar chart
        ZoneDonut.tsx      ← zone distribution pie (power or HR)
        StreamChart.tsx    ← time-series for activity streams
      activities/
        ActivityCard.tsx
        UploadDropzone.tsx
      plan/
        PlanCalendar.tsx
        WorkoutCard.tsx
  package.json
  next.config.ts
  tailwind.config.ts
  tsconfig.json
```

---

## Build Phases

### Phase 0 — Scaffold *(everything depends on this)*

- `pnpm create next-app@latest . --typescript --tailwind --app` inside `frontend/`
- `pnpm add swr recharts date-fns clsx lucide-react`
- `npx shadcn@latest init` then add: `button input label card dialog alert-dialog toast badge tabs select`
- `src/lib/types.ts` — all API response shapes (see Types section below)
- `src/lib/api.ts` — `apiFetch<T>()` with inline 401 → refresh → retry logic
- `src/lib/auth.tsx` — `AuthContext`, `useAuth()`, `login()`, `logout()`
- `src/app/layout.tsx` — root layout wrapping `<SWRConfig>` and `<AuthProvider>`

**`src/lib/api.ts` — the load-bearing file:**

```typescript
let accessToken: string | null = null;
export const setAccessToken = (t: string) => { accessToken = t; };
export const clearAccessToken = () => { accessToken = null; };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    const ok = await attemptRefresh(); // reads localStorage.getItem('refresh_token')
    if (!ok) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
    return apiFetch<T>(path, init); // retry once
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
```

> Skip `Content-Type` for `FormData` — browser must set `multipart/form-data` with the correct boundary parameter.

---

### Phase 1 — Auth Pages *(after Phase 0)*

**Files:** `(auth)/layout.tsx`, `(auth)/login/page.tsx`, `(auth)/register/page.tsx`

- Centered layout, no nav bar
- Login: form → `POST /api/auth/login` → `useAuth().login(tokens)` → `router.push('/dashboard')`
- Register: same → auto-login after registration
- HTML5 validation only (`required`, `type="email"`) — no validation library
- shadcn `Input`, `Button`, `Label`; show API error message inline below the form

---

### Phase 2 — Nav Shell *(after Phase 0, must precede Phases 3–7)*

**Files:** `(app)/layout.tsx`, `Nav.tsx`

- `(app)/layout.tsx`: on mount, check `useAuth().user`. If null after the initial token refresh completes, `router.push('/login')`. Show loading spinner until auth state resolves (prevents flash of unauthenticated content).
- `Nav.tsx`: left sidebar on desktop. Links: Dashboard, Activities, Plan, Goals, Profile. Mobile: hamburger toggle (Phase 6 polish).
- All authenticated pages live under `(app)/`

---

### Phase 3 — Dashboard *(after Phase 2)*

**Files:** `(app)/dashboard/page.tsx`, `charts/FitnessChart.tsx`, `charts/WeeklyTssBar.tsx`

Layout:
```
┌──────────────────────────────────────────┐
│  Today: CTL 72 | ATL 81 | Form -9        │  ← GET /api/metrics/fitness/current
├─────────────────────┬────────────────────┤
│  FitnessChart       │  WeeklyTssBar      │
│  (90-day area)      │  (8-week bars)     │
├─────────────────────┴────────────────────┤
│  Recent Activities (last 5 ActivityCards)│
└──────────────────────────────────────────┘
```

**FitnessChart:**
- Data: `GET /api/metrics/fitness?days=90` → `[{ date, ctl, atl, tsb, tss_day }]`
- Recharts `ComposedChart` + `ResponsiveContainer`
- Three `Area` components: CTL (blue), ATL (red), TSB (green, can go negative)
- `<ReferenceLine y={0}>` for TSB zero line
- TSB fill: `<linearGradient>` green above 0, grey below 0 (keyed to data range)
- X-axis ticks: `date-fns format(date, 'MMM d')`, every ~2 weeks

**WeeklyTssBar:**
- Aggregate `tss_day` by ISO week (`date-fns getISOWeek`)
- Recharts `BarChart` with 8 bars, reference line for average

> All chart components require `'use client'` — Recharts uses `window`.

---

### Phase 4 — Activities *(after Phase 2, parallel with 3/5/6)*

**Files:** `activities/page.tsx`, `activities/[id]/page.tsx`, `ActivityCard.tsx`, `UploadDropzone.tsx`, `StreamChart.tsx`, `ZoneDonut.tsx`

**Activities list page:**
- SWR key: `/api/activities/?page=${page}&limit=20&type=${type}&from=${from}&to=${to}`
- Filter controls are controlled state that rebuild the SWR key
- `UploadDropzone` sits at the top of the page

**UploadDropzone — polling flow:**
```
POST /api/activities/upload (FormData) → { id, status: "pending" }
  → optimistically prepend pending ActivityCard (spinner, link disabled)
  → poll GET /api/activities/{id} every 2s
  → "processed" → mutate('/api/activities/'), clear pending card
  → "error"     → toast error, clear pending card
  → 60s elapsed → show "processing is taking longer than expected"
```
`useEffect` cleanup: `return () => clearTimeout(timer)`

**ActivityCard** — name, date, duration (H:MM), distance (km), TSS, sport icon. `status: "pending"` → pulsing orange badge.

**Activity detail `[id]`:**
- `GET /api/activities/{id}` returns metadata + all streams
- **StreamChart**: power (blue) + HR (red) on dual Y-axes, `Brush` for zoom. Cadence/speed on a second synchronized chart below. Downsample when `data.length > 5000`: `data.filter((_, i) => i % Math.ceil(data.length / 5000) === 0)`
- **ZoneDonut**: `GET /api/metrics/zones/{id}` → Recharts `PieChart`. Tabs to switch power/HR. Zone colors: Z1 grey → Z7 purple.

---

### Phase 5 — Profile *(after Phase 2, parallel with 3/4/6)*

**File:** `(app)/profile/page.tsx`

Four sections:
1. **Basic info** — display name, weight input → `PUT /api/athlete/`
2. **Zones** — FTP field + editable HR/power zone tables (zone name, low, high). "Reset power zones from FTP" button applies standard Coggan percentages (55/75/87/95/105/120/150% of FTP).
3. **Strava** — if `strava_athlete_id` present: "Connected" + Sync + Disconnect buttons. If absent: "Connect Strava" button → `GET /api/strava/connect` → `window.location.href = oauthUrl`.
4. **AI Summaries** *(stub)* — shadcn `Card` with "AI weekly summaries — coming soon" message. Layout placeholder for future: endpoint URL, API key, model name fields (any OpenAI-compatible API).

On mount: `searchParams.get('strava')` → if `'connected'` show success toast + `mutate('/api/athlete/')`. If `'error'` show error toast + reason.

---

### Phase 6 — Goals *(after Phase 2, parallel with 3/4/5)*

**File:** `(app)/goals/page.tsx`

- SWR for `GET /api/goals/`
- Goal cards + create/edit via shadcn `Dialog`
- Form: goal type (select: event/fitness/weight/ftp), description, target date, target value
- Delete via shadcn `AlertDialog`
- All mutations call `mutate('/api/goals/')` after

---

### Phase 7 — Training Plan *(after Phase 6)*

**Files:** `(app)/plan/page.tsx`, `PlanCalendar.tsx`, `WorkoutCard.tsx`

- SWR for `GET /api/plans/active` → if present, `GET /api/plans/{id}/workouts`
- No active plan: "Generate plan" button → `POST /api/plans/generate` (loading state) → refetch
- No goals at all: "Create a goal first" with link to `/goals`

**PlanCalendar — 7-column weekly table:**
- Week offset state (int, 0 = current week). Prev/Next buttons.
- `startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 })` → Monday-start
- Filter workouts where `scheduled_date` ∈ [monday, monday+6]
- Each column = one day; each cell = empty or `WorkoutCard`

**WorkoutCard** — type badge (color per type), target TSS, target duration. If `completed_activity_id` set: green checkmark + link.

---

## Type Definitions (`src/lib/types.ts`)

```typescript
export interface Activity {
  id: string;
  name: string;
  sport_type: string;
  start_time: string;
  duration_s: number;
  distance_m: number;
  elevation_m: number;
  avg_power_w: number | null;
  normalized_power_w: number | null;
  avg_hr: number | null;
  tss: number | null;
  intensity_factor: number | null;
  status: 'pending' | 'processed' | 'error';
}

export interface ActivityDetail extends Activity {
  streams: {
    power?: number[];
    heartrate?: number[];
    cadence?: number[];
    speed?: number[];
    altitude?: number[];
    time: number[];
  };
}

export interface Zone {
  low: number;
  high: number;
  name: string;
}

export interface AthleteProfile {
  display_name: string;
  weight_kg: number;
  max_hr: number;
  current_ftp: number;
  hr_zones: Zone[];
  power_zones: Zone[];
  strava_athlete_id: number | null;
}

export interface ZoneBreakdown {
  hr: Record<string, number>;      // zone name → seconds, e.g. { "Z1": 1200, "Z2": 900 }
  power: Record<string, number>;
}

export interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss_day: number;
}

export interface Goal {
  id: string;
  goal_type: 'event' | 'fitness' | 'weight' | 'ftp';
  description: string;
  target_date: string;
  target_value: number;
  priority: number;
}

export interface PlannedWorkout {
  id: string;
  scheduled_date: string;
  workout_type: 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'recovery' | 'long';
  description: string;
  target_tss: number;
  target_duration_min: number;
  completed_activity_id: string | null;
}
```

---

## Dependencies

```bash
# Core
pnpm add next@15 react react-dom typescript @types/react @types/node

# Styling
pnpm add tailwindcss postcss autoprefixer

# Data / UI
pnpm add swr recharts date-fns clsx lucide-react

# shadcn/ui (CLI init + individual components)
npx shadcn@latest init
npx shadcn@latest add button input label card dialog alert-dialog toast badge tabs select
```

---

## Gotchas

1. **`'use client'`** — every component using hooks, SWR, or Recharts needs this. App Router defaults to Server Components.

2. **FormData upload** — do not set `Content-Type: multipart/form-data` manually. `apiFetch` must detect `body instanceof FormData` and skip the JSON header so the browser sets the correct boundary.

3. **Large stream arrays** — a 3-hour ride ≈ 10,800 data points. Never store in global state. Downsample to ≤ 5,000 before passing to Recharts.

4. **SWR cache invalidation** — after any POST/PUT/DELETE, call `mutate('/api/exact/path/')` to refetch. Do not attempt manual cache merging.

5. **`startOfWeek` locale** — always pass `{ weekStartsOn: 1 }` for Monday-start. The `date-fns` default is Sunday.

6. **Strava OAuth stale cache** — after returning from Strava OAuth, SWR still has the old athlete profile. Call `mutate('/api/athlete/')` inside the `useEffect` that reads `?strava=connected`.

---

## End-to-End Verification

```bash
# Start backend (from project root)
uv run uvicorn backend.app.main:app --reload

# Start frontend (from frontend/)
pnpm dev
```

Golden path:
1. `http://localhost:3000` → redirects to `/login`
2. Register new account → lands on dashboard (all zeros)
3. Upload `testdata/Zwift_Aerobic_Foundation_Forge.fit` → pending card appears → card flips to processed
4. Dashboard CTL/ATL/TSB updates to reflect TSS
5. Activity detail → StreamChart shows power/HR, ZoneDonut shows zone breakdown
6. Profile → set FTP and zones → save
7. Profile → Connect Strava → OAuth flow → success toast
8. Goals → create an event goal
9. Plan → Generate plan → weekly calendar renders with workouts
