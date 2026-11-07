# Q-Mate 2.0 — Sustainable Smart Campus Queue Platform

> **Wait Less, Do More.** — a campus digital queue system (admissions, exam forms,
> fees, library, certificates, labs, canteen) that replaces physical lines with
> virtual tokens. One shared live campus for every student and admin. Zero paper.

**React 18 + Vite SPA · Express-compatible REST data API · MongoDB Atlas.**
Queue data lives in the owner's MongoDB Atlas cluster behind a small REST data
API, so every student, admin and device shares the same live campus. The data
API ships in two interchangeable form factors:

- **Embedded (default, used by the hosted deployment)** — the same application
  server that serves the React build also serves `/api/db/*` and holds the
  Atlas connection. One process, one deployable unit.
- **Standalone** — `server/index.js`, the same REST contract as a standalone
  Express + MongoDB service for API-only or local hosting (`npm run dev:all`).

If the data API or Atlas is unreachable, the client transparently falls back
to IndexedDB (Dexie) and keeps working offline — the data layer is a pluggable
adapter, the UI never changes.

---

## ⚡ Quick start

```bash
npm install
cp .env.example .env   # paste your MONGODB_URI (Atlas) + optional Gemini keys
npm run dev:all        # Express API :4000 + Vite dev server :5173
# → http://localhost:5173
```

**MongoDB Atlas setup (one time):** create a free cluster at
[mongodb.com/atlas](https://www.mongodb.com/atlas) → *Database Access*: add a
database user → *Network Access*: allow your IP (or `0.0.0.0/0` for a demo) →
copy the SRV connection string into `MONGODB_URI` in `.env`. First boot seeds
the whole campus into the cloud automatically. **No `MONGODB_URI`?** The app
still runs 100% locally on IndexedDB — it detects the missing API and falls
back by itself.

Optional AI (the app is fully functional without it):

```bash
# paste your Gemini keys into VITE_GEMINI_KEY_1..3 in .env
```

| Script | What it does |
|---|---|
| `npm run dev:all` | Express data API (:4000) + Vite dev server (HMR) together |
| `npm run server` | Express data API only (MongoDB Atlas) |
| `npm run dev` | Vite dev server only (proxies `/api/db` → :4000) |
| `npm run build` | Production build (add `VITE_PWA=on` for the installable offline PWA) |
| `npm run preview` | Serve the production build |
| `npm run test` | Vitest suite (44 tests: unit + component) |
| `npm run test:watch` | Vitest in watch mode |

### Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@qmate.local` | `Admin@123` |
| Student | `student@qmate.local` | `Student@123` |

Plus 8 simulator students (`sim1@qmate.local` … `sim8@qmate.local`) used by the
Demo Simulator. First launch seeds a full 3-day campus into **MongoDB Atlas**:
7 queues, ~600 historical + live tokens (analytics, prediction EWMA, green
stats), prebooks, feedback, announcements and an audit trail. Passwords are
PBKDF2-hashed before they ever reach the database.

> ⚠️ Auth is simulated client-side (PBKDF2-hashed passwords, expiring sessions,
> 5-strikes → 15-min lockout) — demonstration-grade security, not production
> authentication.

---

## 🧪 Demo with two browser tabs (student + admin)

Each tab keeps **its own session** (per-tab `sessionStorage`), so one tab can be
the student and the other the admin in the same browser:

1. **Tab A** — open the app, log in as `student@qmate.local / Student@123`.
2. **Tab B** — open the app in a second tab, log in as `admin@qmate.local / Admin@123`.
3. In Tab A: **Active Queues → Join queue** → tick the document checklist →
   **Confirm & get token**. You get e.g. `ADM-200`.
4. Open **Queue Status** in Tab A: giant token, position, people-ahead,
   live ETA `~13.8 ±1.7`, Now-Serving banner.
5. In Tab B: **Manage Queues → open Counter Console** → **Call next token**.
6. Watch Tab A update **instantly** (position, ETA, Now Serving) — no refresh,
   no polling. Sound + notification + vibration fire near your turn.
7. In Tab B, don't complete the called token — after the 90 s grace timer it is
   **auto-skipped as a no-show** (watch the countdown on the counter card).
8. Toggle the **Demo Simulator** on the admin dashboard to keep the campus
   moving during a presentation.

**Multiple browsers/devices:** with the MongoDB data API running, every browser
and device shares the same Atlas data — a student can join from their phone and
watch the admin call their token from another laptop. A light poll (10 s) folds
other devices' actions in; BroadcastChannel still syncs tabs of the same
browser instantly.

---

## 🔄 How real-time sync works

```
mutation (any tab)                          receivers (all tabs)
┌────────────────────────────┐
│ queueService.*             │
│  1. navigator.locks mutex  │  ← cross-tab write lock (localStorage spin-lock fallback)
│  2. atomic transaction     │  ← MongoDB multi-doc txn (cloud) / Dexie txn (offline fallback)
│  3. COMMIT                 │
│  4. eventBus.publish(...) ─┼──BroadcastChannel──▶ other tabs: store refresh
│                            ├──localStorage 'storage' event──▶ BC-less browsers
│                            └──in-tab dispatch──────────────▶ this tab
└────────────────────────────┘
```

- **EventBus** (`src/services/realtime/EventBus.js`) publishes typed events
  (`TOKEN_ISSUED`, `TOKEN_CALLED`, `TOKEN_COMPLETED`, `QUEUE_PAUSED`,
  `COUNTER_CLOSED`, `ANNOUNCEMENT`, …). Subscribers never poll.
- **Concurrency:** every mutation runs `withLock(queueKey)` + one atomic
  transaction (MongoDB multi-document transaction in cloud mode, Dexie
  transaction offline), so two tabs — or two devices — can never mint the same
  token number or double-book a counter (covered by
  `tokenServiceConcurrency.test.js` — 5 parallel joins produce exactly 101–105).
- **Notifications are event-driven** (token near / called / counter change /
  paused / closed / Leave-Now) — the failed "poll every 3 minutes" is gone.

## 🗄️ Pluggable architecture (three storage tiers)

The UI never touches a database directly — it talks to the `StorageAdapter`
interface (`src/services/storage/StorageAdapter.js`):

```
StorageAdapter (interface) — the ONLY data-access contract in Q-Mate 2.0
├── MongoRestAdapter        ← primary: Express REST API + MongoDB Atlas (cloud,
│                             shared across devices, atomic multi-document
│                             transactions, auto-seeding)
├── DexieStorageAdapter     ← automatic offline fallback (IndexedDB)
└── LocalStorageAdapter     ← last resort (blocked IndexedDB)
```

The `MongoRestAdapter` boots with a `/api/db/health` ping; if the API or Atlas
cannot be reached it swaps to Dexie invisibly — same methods, same table
handles, same transaction semantics (`transaction()` buffers writes and
commits them as **one MongoDB multi-document transaction** with
`snapshot` read-concern and `majority` write-concern).

---

## 🌍 Sustainability map — feature → dimension

| Feature | Technical | Economic | Financial | Environmental |
|---|---|---|---|---|
| Paperless virtual tokens + Green Impact Engine (sheets, CO₂, trees, per-user & campus) | ✅ | ✅ | | ✅ |
| Time & Cost Value (student-hours → ₹, staff idle reduction → ₹, 1 month / semester / year) | | ✅ | ✅ | |
| Peak Flattening Recommender ("Visit 11:30–12:00, ~70% shorter") + low-crowd prebook bonus | ✅ | ✅ | ✅ | ✅ |
| Staffing Advisor (M/M/c Erlang-C, fully local; AI only explains) | ✅ | ✅ | ✅ | |
| Cost dashboard vs paper-token system | | | ✅ | ✅ |
| Offline-first PWA + Eco Mode (fewer animations, simulator off, less refresh work) | ✅ | | | ✅ |
| Hybrid wait prediction (EWMA + time-of-day + self-correcting bias, ±band, accuracy %) | ✅ | ✅ | | |
| Event-driven notifications + Leave-Now alert | ✅ | ✅ | | ✅ |
| QR check-in + no-show grace timers (fewer wasted trips) | ✅ | ✅ | | ✅ |
| Document checklist before visit (no re-queueing) | | ✅ | | ✅ |
| Printable Sustainability Report (NAAC / green-audit) | | | ✅ | ✅ |
| Pluggable StorageAdapter (MongoDB Atlas cloud + offline fallback) / EventBus, lazy routes | ✅ | | | |

---

## 🤖 Gemini integration (optional, hardened)

`src/services/ai/geminiClient.js` — plain `fetch` to the Gemini REST API
(model from `VITE_GEMINI_MODEL`, default `gemini-3.8-flash`, with an automatic
model chain `gemini-3.8-flash → gemini-2.5-flash → gemini-flash-latest` that
advances when Google retires a model for new keys):

- **Engine pool:** up to 3 owner keys (browser-direct Gemini REST) **+ the
  in-app AI engine** (`/api/ai`, same-origin route powered server-side by the
  z-ai SDK). Region-blocked networks ("location is not supported") cool all
  direct keys and hand over to the in-app engine automatically — AI keeps
  working even where Google's API is unreachable.
- Key pool round-robin + least-used selection
- 429 / 403 / 5xx / timeout → exponential **cooldown (60 s → 15 min)** and
  instant retry on the next engine (≤ 3 real attempts), then graceful
  **local fallback**
- 10 s `AbortController` timeout, response **cache** (prompt-hash → TTL 10 min),
  in-flight **de-duplication**, **per-minute rate limiter** (10/min)
- Strict JSON prompts parsed through `repairJson()` (fences, trailing commas,
  prose — never a raw `JSON.parse` crash)
- **Privacy:** names/emails never leave the device — AI receives only queue
  metadata, aggregates and the free text a user typed
- Every AI feature (Q-Buddy chatbot, document checklist, NL queue creation,
  admin insights, feedback sentiment, announcement writer/translator) has a
  deterministic non-AI fallback; UI shows **AI: Online / Fallback / Off**

**Key security (read this):** keys shipped in a frontend bundle are visible to
anyone who opens DevTools. Restrict each key by **HTTP-referrer** in Google AI
Studio and use demo/college keys only. Never commit `.env` (it is gitignored).

**Hosting note:** the sandbox preview serves the built bundle from a Next.js
app at `/qmate/` with `VITE_ROUTER_MODE=hash` (deep links work from any static
path) and `VITE_PWA=off` (cache-clean iterations). Build for a domain root with
`VITE_BASE=/ VITE_ROUTER_MODE=browser VITE_PWA=on npx vite build`.

### The "AI Health" admin panel shows
per-key status (active / cooling Xs), calls, cache hits, failures, last
latency/error, a one-click test call and cache clear — **never the key values**.

---

## 📁 Folder structure

```
qmate-2.0/
├── index.html · vite.config.js · tailwind.config.js · postcss.config.js
├── .env.example              # MONGODB_URI + key slots (never commit .env)
├── server/                   # Express data API (MongoDB Atlas)
│   ├── index.js              #   REST endpoints + atomic transactions + indexes
│   └── mongo.js              #   connection singleton
├── public/                   # PWA icons + favicon
└── src/
    ├── app/                  # router (lazy routes), guards, boot loader
    ├── components/
    │   ├── common/           # Button, Card, Modal, Input, Skeleton, StatCard…
    │   ├── layout/           # AppShell, Sidebar, TopBar, MobileNav, NotificationWatcher
    │   ├── queue/            # QueueCard, JoinFlowModal, TokenCard(QR), ScannerModal…
    │   ├── qbuddy/           # floating AI assistant (voice input)
    │   └── ErrorBoundary.jsx
    ├── features/             # (reserved for feature modules)
    ├── services/
    │   ├── storage/          # StorageAdapter: Mongo REST → Dexie → localStorage
    │   ├── realtime/         # EventBus (BroadcastChannel + storage event)
    │   ├── concurrency/      # Web Locks mutex (+ localStorage spin-lock)
    │   ├── auth/             # PBKDF2 passwords, sessions, lockout, admin user mgmt
    │   ├── queue/            # transactional queueService, prebook, feedback,
    │   │                     #   announcements, audit, fairness
    │   ├── prediction/       # EWMA engine, Erlang-C, staffing advisor
    │   ├── green/            # green engine, badges, leaderboard, peak flattener
    │   ├── ai/               # gemini client, prompts, features+fallbacks
    │   ├── notifications/    # Web Notifications + WebAudio + vibration
    │   ├── simulator/        # demo simulator
    │   ├── seed/             # 3-day campus seed
    │   └── export/           # CSV reports
    ├── store/                # zustand: auth, ui (theme/lang/eco), queue, ai
    ├── hooks/                # useEventBus, useNow, useLiveTokenInfo, useTheme…
    ├── i18n/                 # en / hi / mr JSON + provider
    ├── pages/                # Landing, Login, Signup, student/* (7), admin/* (9)
    ├── tests/                # Vitest + RTL: unit + component (44 tests)
    └── utils/                # constants (all tunable factors), analytics, csv…
```

---

## ✅ What was rebuilt & fixed (from the Q-Mate report)

| Reported gap | Now |
|---|---|
| Invalid-login error handling failed | Precise codes: wrong password (attempts left), 5-strike → 15-min lockout with countdown, admin locks — all translated (EN/HI/MR) |
| Wait-time prediction deviated | Hybrid EWMA + time-of-day + self-correcting bias; confidence band; accuracy % on dashboard |
| Notifications (every 3 min) failed | Event-driven: called / near (3-2-1 ahead) / paused / closed / announcements / Leave-Now — Web Notifications + sound + vibration + toast |
| Responsive issues on small screens | Mobile-first, verified at 320 px: bottom nav, drawer sidebar, tuned stat grids |
| Concurrent-user handling failed | Web Locks mutex + Dexie transactions on every mutation (tests prove 5 parallel joins → 101–105, no duplicates) |
| API/error handling failed (crashes) | Global ErrorBoundary, every async call wrapped, typed `AppError`s + translated toasts, safe JSON repair |
| Polling-based updates | EventBus on BroadcastChannel + storage events — zero polling |
| QR check-in, multi-counter, slot limits, sudden-update alerts, feedback (was "future scope") | All implemented (see feature list above) |

## 🧮 Tests (44)

- **Unit:** token service & slot limits (parallel joins, auto-pause on full,
  auto-resume, multi-counter), mutex fallback, fairness ordering (1-priority-
  per-4 rule), EWMA prediction, Erlang-C math, auth lockout, JSON repair,
  green engine accounting
- **Component:** join-queue flow (checklist gate → token #101) and call-next
  flow (counter binding, waiting list, friendly empty errors)


Built as a college sustainability + engineering showcase. **Wait Less, Do More.** 🌱
