/**
 * Q-Mate 2.0 — global constants & tunable factors.
 * Everything a college might want to adjust lives here (green factors,
 * ₹ values, grace windows, priorities). No magic numbers in business logic.
 */

export const APP = {
  name: 'Q-Mate 2.0',
  tagline: 'Wait Less, Do More.',
  org: 'Smart Campus',
};

export const ROLES = {
  STUDENT: 'student',
  ADMIN: 'admin',
  SUPER: 'super-admin',
};

export const ROLE_RANK = { student: 1, admin: 2, 'super-admin': 3 };

export const QUEUE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  PAUSED: 'paused',
};

export const QUEUE_STATUS_FLOW = ['active', 'inactive', 'scheduled', 'paused', 'completed'];

export const TOKEN_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  SERVING: 'serving',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  NO_SHOW: 'no-show',
  CANCELLED: 'cancelled',
};

/** Token statuses that occupy a slot in the live queue. */
export const LIVE_TOKEN_STATUSES = ['waiting', 'called', 'serving'];
/** Token statuses that count as "not finished negatively". */
export const OK_OUTCOMES = ['completed', 'cancelled'];

export const CALL_GRACE_MS = 90 * 1000; // student must check-in within 90s of being called
export const STEP_AWAY_MS = 5 * 60 * 1000; // "Step Away" keeps your place for 5 minutes
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h session
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout
export const PBKDF2_ITERATIONS = 150000;

export const PRIORITY_TYPES = ['none', 'differently-abled', 'emergency', 'faculty'];

export const PRIORITY_META = {
  none: { label: 'Standard', weight: 0 },
  'differently-abled': { label: 'Differently-abled', weight: 3 },
  emergency: { label: 'Emergency', weight: 3 },
  faculty: { label: 'Faculty / Staff', weight: 2 },
};

/**
 * Fair-play rule: after a priority token is served, at least N standard
 * tokens must be served before the next priority token jumps the line.
 */
export const PRIORITY_FAIR_RATIO = 4;

export const DEPARTMENTS = ['CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'MBA', 'SCI'];
export const YEARS = [1, 2, 3, 4];

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

export const PREBOOK_SLOT_MIN = 30;
export const PREBOOK_MAX_PER_USER_PER_QUEUE = 2;

/* ── GREEN IMPACT ENGINE — configurable factors (college can tune) ─────── */
export const GREEN_FACTORS = {
  paperSheetsPerToken: 1, // one physical ticket avoided per token
  paperCO2gPerSheet: 5, // g CO₂e per A4 sheet (print + disposal)
  paperCostInrPerSheet: 0.6, // ₹ per sheet (paper + print + bin)
  avgCommuteKmOneWay: 4, // km a student lives from the counter block
  co2gPerKmMix: 62, // g CO₂/km for typical campus commute mix (bus + two-wheeler)
  hvacLightingWPerPerson: 140, // marginal HVAC+lighting watts per waiting person
  gridCO2gPerKWh: 713, // India CEA average grid emission factor (g CO₂/kWh)
  treeKgCO2PerYear: 21, // one mature tree absorbs ~21 kg CO₂/year
  minutesOfQueueAvoidedPerToken: 0, // computed from actual wait at runtime
  extraPaperMinPerTokenStaff: 3, // staff minutes per paper token (tear/check/bin)
};

export const GREEN_POINTS = {
  perToken: 10,
  per100gCO2: 1,
  per10minSaved: 1,
  offpeakJoinBonus: 5,
};

export const VALUE_FACTORS = {
  studentInrPerHour: 120, // opportunity cost of a student's time
  staffInrPerHour: 420, // loaded cost of staff time
};

export const COST_PERIODS = {
  month: { label: '1 Month', days: 30 },
  semester: { label: '1 Semester', days: 180 },
  year: { label: '1 Year', days: 365 },
};

export const BADGES = [
  {
    id: 'paperless-pioneer',
    icon: '🧾',
    name: 'Paperless Pioneer',
    desc: 'Completed 10 paperless tokens',
    test: (s) => s.tokens >= 10,
  },
  {
    id: 'time-saver',
    icon: '⏱️',
    name: 'Time Saver',
    desc: 'Saved 5 hours of queue time',
    test: (s) => s.minutesSaved >= 300,
  },
  {
    id: 'green-champion',
    icon: '🌱',
    name: 'Green Champion',
    desc: 'Avoided 5 kg of CO₂',
    test: (s) => s.co2g >= 5000,
  },
  {
    id: 'offpeak-hero',
    icon: '🕊️',
    name: 'Off-Peak Hero',
    desc: 'Chose a low-crowd slot 5 times',
    test: (s) => s.offpeakJoins >= 5,
  },
  {
    id: 'campus-regular',
    icon: '🏅',
    name: 'Campus Regular',
    desc: 'Completed 25 tokens',
    test: (s) => s.tokens >= 25,
  },
];

/* ── GEMINI CLIENT LIMITS ──────────────────────────────────────────────── */
export const GEMINI = {
  TIMEOUT_MS: 10000,
  MAX_ATTEMPTS: 3, // 1 try + 2 retries on other keys
  CACHE_TTL_MS: 10 * 60 * 1000,
  RATE_LIMIT_PER_MIN: 10,
  COOLDOWN_BASE_MS: 60 * 1000,
  COOLDOWN_MAX_MS: 15 * 60 * 1000,
  MAX_OUTPUT_TOKENS: 1024,
};

/* ── MISC ──────────────────────────────────────────────────────────────── */
export const SIMULATOR_INTERVAL_MS = 7000;
export const AUDIT_LOG_MAX = 500;
export const ANNOUNCEMENT_FEED_MAX = 30;
export const SEED_VERSION = 6;

export const TOKEN_NUMBER_START = 101;

export const STORAGE_KEYS = {
  AI_STATS: 'qmate-ai-stats',
  AI_CACHE: 'qmate-ai-cache',
  LAST_EVENT: 'qmate-last-event',
  LOCK_PREFIX: 'qmate-lock:',
};
