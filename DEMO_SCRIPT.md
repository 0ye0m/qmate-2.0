# Q-Mate 2.0 — 5-Minute Demo Script

**Setup (before the audience):** `npm install && npm run dev` → open two tabs.
Tab A = student (`student@qmate.local / Student@123`), Tab B = admin
(`admin@qmate.local / Admin@123`). Optionally enable the **Demo Simulator** on
the admin dashboard 30 s before starting so the board is alive.

---

### 0:00–0:30 — Landing + Green Impact (Tab A, logged out or landing)
- Point at the **Green Impact** counters: *"950 paper sheets, 306 kg CO₂ —
  computed on-device from real completed tokens: 5 g CO₂/sheet, commute and
  HVAC crowd factors, 21 kg CO₂ per tree-year."*
- Tagline: **"Wait Less, Do More."** Three highlights: Real-Time Tracking,
  Prebook Ease, Fair System.

### 0:30–1:15 — Student joins with checklist (Tab A)
- **Active Queues** → pick *Admissions Helpdesk* (show live ETA `±band` and the
  low-crowd window chip) → **Join queue**.
- The **Document Checklist** modal appears (admin docs + AI-enriched tips).
  *"Students who carry everything never get rejected at the counter and never
  re-queue."* Tick all → **Confirm & get token** → toast `Token #200 issued`.
- Open **Queue Status**: giant `#200`, position, people ahead, ETA
  `~13.8 ±1.7`, Now-Serving banner, downloadable **QR token card**.

### 1:15–2:15 — Admin console + cross-tab realtime (Tab B)
- **Manage Queues** → show the one-line **NL creation bar** ("Exam form queue
  for CSE 3rd year tomorrow 10 to 1, 2 counters, 80 slots" → auto-filled form).
- Open a **Counter Console**: multi-counter grid, **Call next token**.
- Switch to Tab A **without touching it**: position dropped, ETA recalculated,
  Now Serving updated — *"instant, event-driven over BroadcastChannel; zero
  polling, zero backend."*
- Back in Tab B: press **Call next** again and *don't complete* — the 90 s
  **grace timer** counts down on the counter card and the token is
  **auto-skipped as a no-show** (student gets the alert too).

### 2:15–3:00 — Event-driven alerts + Leave Now (Tab A)
- Point at the alert stack: token near (3-2-1 ahead), called (sound +
  vibration + notification), queue paused/closed, announcements.
- Set **travel time = 10 min** on Queue Status: *"The Leave-Now alert pings me
  exactly when to start walking so I arrive just in time."*
- Show **Step Away** (*"keeps my place for 5 minutes"*).

### 3:00–4:00 — AI layer with honest fallback (any tab)
- **Q-Buddy** (bottom-right): ask *"Which queue for bonafide?"* and *"Best time
  to visit?"* — answer cites live queues and low-crowd windows. Voice input via
  the mic button.
- Admin: dashboard **AI Insights** (weekly summary + 3 recommendations),
  **Announcement writer** (polish + Hindi/Marathi translate → broadcast →
  student tab gets it instantly).
- **AI Health** page: key status (active/cooling), calls, cache hits, failures.
  *"AI: Off (local engine)" badge — every AI feature has a local fallback, the
  app never depends on the network.*

### 4:00–5:00 — Sustainability + numbers (Tab B)
- **Analytics**: hourly load, wait distribution, per-counter service times,
  no-show 8%, peak hours, **prediction accuracy %** (self-correcting engine).
- **Sustainability**: sheets / CO₂ / tree-years / student-hours / ₹ value with
  month–semester–year toggle, department leaderboard, badges, cost dashboard
  vs the paper-token system → **Print report** (NAAC/green-audit ready).
- **Staffing advisor** on the console: *"Open 3 counters at 11:00 — computed
  locally with Erlang-C; Gemini only explains it."*
- Close on **Eco Mode** (topbar leaf): *"Fewer animations, simulator paused,
  less refresh work — the platform practices the energy savings it preaches."*

---

## One-line mapping for the jury

| Demo beat | Dimension |
|---|---|
| Tokens + green counters + report | Environmental |
| Saved-hours → ₹, cost dashboard, staffing ₹ | Economic / Financial |
| Offline-first PWA, event-driven engine, self-correcting ETA | Technical |
| Peak flattener + off-peak bonus + QR/no-show discipline | All four |
