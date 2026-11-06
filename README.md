# Q-Mate 2.0 — Sustainable Smart Campus Queue Platform

> **Wait Less, Do More.** — a campus digital queue system (admissions, exam forms,
> fees, library, certificates, labs, canteen) that replaces physical lines with
> virtual tokens. 100% frontend. Zero backend. Zero servers. Zero paper.

**Pure React 18 + Vite SPA.** All logic, auth, "real-time" sync and AI calls run
in the browser. There is no backend anywhere in this project — nothing to deploy,
nothing that can sleep.

---

## ⚡ Quick start

```bash
npm install
npm run dev          # → http://localhost:5173
```

Optional AI (the app is fully functional without it):

```bash
cp .env.example .env # then paste your Gemini keys into VITE_GEMINI_KEY_1..3
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Production build + PWA service worker |
| `npm run preview` | Serve the production build (installable PWA, offline-first) |
| `npm run test` | Vitest suite (44 tests: unit + component) |
| `npm run test:watch` | Vitest in watch mode |

### Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@qmate.local` | `Admin@123` |
| Student | `student@qmate.local` | `Student@123` |

Plus 8 simulator students (`sim1@qmate.local` … `sim8@qmate.local`) used by the
Demo Simulator. First launch seeds a full 3-day campus: 7 queues, ~300 historical
tokens (analytics, prediction EWMA, green stats), live waiting/called tokens,
prebooks, feedback, announcements and an audit trail.

> ⚠️ Auth is client-side and simulated (PBKDF2-hashed passwords, expiring
> sessions in IndexedDB, 5-strikes → 15-min lockout). It is demonstration-grade
> security, not production authentication.

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

**Multiple browsers/devices:** each browser has its own IndexedDB, so data is
per-browser (see Limitations). BroadcastChannel syncs all *tabs of the same
browser* instantly.

---

## 🔄 How "real-time" works without a backend

```
mutation (any tab)                          receivers (all tabs)
┌────────────────────────────┐
│ queueService.*             │
│  1. navigator.locks mutex  │  ← cross-tab write lock (localStorage spin-lock fallback)
│  2. Dexie transaction      │  ← atomic multi-table write (IndexedDB)
│  3. COMMIT                 │
│  4. eventBus.publish(...) ─┼──BroadcastChannel──▶ other tabs: store refresh
│                            ├──localStorage 'storage' event──▶ BC-less browsers
│                            └──in-tab dispatch──────────────▶ this tab
└────────────────────────────┘
```

- **EventBus** (`src/services/realtime/EventBus.js`) publishes typed events
  (`TOKEN_ISSUED`, `TOKEN_CALLED`, `TOKEN_COMPLETED`, `QUEUE_PAUSED`,
  `COUNTER_CLOSED`, `ANNOUNCEMENT`, …). Subscribers never poll.
- **Concurrency:** every mutation runs `withLock(queueKey)` + one Dexie
  transaction, so two tabs can never mint the same token number or double-book
  a counter (covered by `tokenServiceConcurrency.test.js` — 5 parallel joins
  produce exactly 101–105).
- **Notifications are event-driven** (token near / called / counter change /
  paused / closed / Leave-Now) — the failed "poll every 3 minutes" is gone.

## 🗄️ Pluggable architecture (backend migration path)

The UI never touches Dexie directly — it talks to the `StorageAdapter`
interface (`src/services/storage/StorageAdapter.js`):

```
StorageAdapter (interface)
├── DexieStorageAdapter     ← default (IndexedDB)
└── LocalStorageAdapter     ← automatic fallback
```

To move to a real backend later: implement `RestStorageAdapter` with the same
methods (`get/getAll/put/bulkPut/delete/transaction` → HTTP), swap the factory
in `src/services/storage/index.js`, and re-point the EventBus at a WebSocket.
**Zero UI changes.** The README of a future backend only needs to reimplement
the semantics of `queueService` (already the single transactional gateway).

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
| Pluggable StorageAdapter / EventBus, lazy routes, Lighthouse-minded build | ✅ | | | |

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
├── .env.example              # key slots (never commit .env)
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
    │   ├── storage/          # StorageAdapter + Dexie + localStorage fallback
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

## ⚠️ Honest limitations

- **Data is per-browser.** IndexedDB is local to each browser profile; two
  different browsers/laptops do not share queues. This is the honest trade-off
  of a zero-backend demo — the StorageAdapter/EventBus seams are exactly where
  a backend plugs in later.
- **Auth is simulated** (strong hashing, but the client holds the data).
- **Gemini keys in a frontend are public** — restrict by HTTP-referrer, demo use.
- Lighthouse ≥ 90 is enabled by design (code-split routes, PWA precache, a11y
  pass) but the final score depends on the machine running the audit.

---

Built as a college sustainability + engineering showcase. **Wait Less, Do More.** 🌱
