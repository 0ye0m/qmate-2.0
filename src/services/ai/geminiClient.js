/**
 * GEMINI CLIENT — browser-direct REST calls (no SDK), engineered for a
 * college demo that must never crash and never burn quota:
 *
 *  • Engine pool: up to 3 owner keys (browser-direct Gemini REST) + the
 *    in-app proxy engine (same-origin /api/ai route, server-side SDK).
 *    Round-robin + least-used selection; ≤3 attempts per request.
 *  • Model chain: configured model → known-good fallbacks, auto-advanced
 *    when Google retires a model for new keys (HTTP 404).
 *  • HTTP 429/403/5xx or timeout → engine cooldown (exponential backoff,
 *    60 s base, 15 min cap) and instant retry on the next engine.
 *  • "location is not supported" (400) cools ALL direct keys for this
 *    network and hands over to the proxy engine.
 *  • 10 s AbortController timeout per attempt.
 *  • Response cache: djb2(prompt+model) → result, TTL 10 min, persisted.
 *  • In-flight de-duplication (identical prompts share one request).
 *  • Per-minute rate limiter (token bucket over a sliding 60 s window).
 *  • All prompts ask for JSON (responseMimeType) and are parsed through
 *    repairJson() — never a raw JSON.parse crash.
 *  • Health metrics mirrored into aiStore (never the key values).
 *
 * If no engine succeeds, callers skip straight to their local fallback.
 */
import { GEMINI, STORAGE_KEYS } from '../../utils/constants';
import { hashString } from '../../utils/jsonRepair';
import { useAiStore } from '../../store/aiStore';

const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const PROXY_URL = '/api/ai';

/** Configured model first, then known-good fallbacks (deduped). */
const MODEL_CHAIN = [...new Set([
  MODEL,
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
])];

const DIRECT_KEYS = [1, 2, 3]
  .map((i) => import.meta.env[`VITE_GEMINI_KEY_${i}`])
  .map((k) => (typeof k === 'string' ? k.trim() : ''))
  .filter(Boolean)
  .map((key, idx) => ({ idx, type: 'direct', key, calls: 0, failures: 0, cooldownUntil: 0 }));

const PROXY_ENGINE = { idx: DIRECT_KEYS.length, type: 'proxy', key: null, calls: 0, failures: 0, cooldownUntil: 0 };
const ENGINES = [...DIRECT_KEYS, PROXY_ENGINE];

const stats = {
  callsMade: 0,
  cacheHits: 0,
  failures: 0,
  cooldowns: 0,
  lastLatencyMs: null,
  lastError: null,
  byKey: [],
};

const cache = new Map();
const inflight = new Map();
const callTimes = [];

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.AI_CACHE) || '[]');
    for (const [h, entry] of raw) {
      if (entry && entry.e > Date.now()) cache.set(h, entry);
    }
  } catch {
    /* ignore */
  }
}
function persistCache() {
  try {
    const now = Date.now();
    const entries = [...cache.entries()].filter(([, e]) => e.e > now).slice(-50);
    localStorage.setItem(STORAGE_KEYS.AI_CACHE, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}
loadCache();
// Sync the AI store once at boot so status badges show the real mode
// (online/fallback) instead of the store's initial 'off' placeholder.
mirrorStats();

export function aiConfigured() {
  return ENGINES.length > 0;
}

export function aiMode() {
  if (!ENGINES.length) return 'off';
  return ENGINES.some((k) => k.cooldownUntil <= Date.now()) ? 'online' : 'fallback';
}

function mirrorStats() {
  stats.byKey = ENGINES.map((k) => ({
    idx: k.idx,
    type: k.type,
    label: k.type === 'proxy' ? 'In-app AI engine' : `Gemini key ${k.idx + 1}`,
    calls: k.calls,
    failures: k.failures,
    cooling: k.cooldownUntil > Date.now(),
    cooldownLeftSec: Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)),
  }));
  useAiStore.getState().sync({ ...stats, byKey: [...stats.byKey] }, aiMode(), MODEL_CHAIN[0]);
}

function putCooldown(k) {
  k.failures += 1;
  k.cooldownUntil = Date.now() + Math.min(GEMINI.COOLDOWN_MAX_MS, GEMINI.COOLDOWN_BASE_MS * 2 ** (k.failures - 1));
  stats.cooldowns += 1;
}

async function rateGate() {
  for (;;) {
    const now = Date.now();
    while (callTimes.length && callTimes[0] <= now - 60000) callTimes.shift();
    if (callTimes.length < GEMINI.RATE_LIMIT_PER_MIN) {
      callTimes.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, Math.max(60, callTimes[0] + 60000 - now)));
  }
}

function cacheGet(h) {
  const entry = cache.get(h);
  if (!entry) return null;
  if (entry.e <= Date.now()) {
    cache.delete(h);
    return null;
  }
  return entry.v;
}

function buildBody({ prompt, system, json, temperature }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: GEMINI.MAX_OUTPUT_TOKENS,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

/**
 * Core text generation.
 * @returns {{text:string, cached:boolean, latencyMs?:number}}
 */
export async function generate({ prompt, system = '', json = true, temperature = 0.4 }) {
  const cacheKey = hashString(`${MODEL}|${json ? 'J' : 'T'}|${temperature}|${system}|${prompt}`);
  const hit = cacheGet(cacheKey);
  if (hit != null) {
    stats.cacheHits += 1;
    mirrorStats();
    return { text: hit, cached: true };
  }
  const running = inflight.get(cacheKey);
  if (running) return running;

  const task = (async () => {
    if (!ENGINES.length) {
      const err = new Error('No AI engines configured');
      err.code = 'AI_UNAVAILABLE';
      throw err;
    }
    await rateGate();
    let lastErr = null;
    let modelIdx = 0;
    const ordered = ENGINES.slice().sort(
      (a, b) => a.cooldownUntil - b.cooldownUntil || a.calls - b.calls
    );
    // Count real attempts (skipped/cooling engines don't consume the budget),
    // so a mid-loop cooldown cascade can never cut off the proxy engine.
    let attempts = 0;
    for (const eng of ordered) {
      if (eng.cooldownUntil > Date.now()) continue;
      if (attempts >= GEMINI.MAX_ATTEMPTS) break;
      attempts += 1;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GEMINI.TIMEOUT_MS);
      const t0 = Date.now();
      try {
        eng.calls += 1;
        let text = '';

        if (eng.type === 'proxy') {
          // Layer 2: same-origin in-app engine (server-side SDK, no keys exposed)
          const res = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, system, json, temperature }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!res.ok) {
            if (res.status === 429 || res.status >= 500) {
              putCooldown(eng);
              lastErr = new Error(`Proxy HTTP ${res.status}`);
              continue;
            }
            throw new Error(`Proxy HTTP ${res.status}`);
          }
          const data = await res.json();
          text = String(data?.text || '').trim();
          if (!text) throw new Error('Empty response');
        } else {
          // Layer 1: browser-direct Gemini REST with the owner's key
          const model = MODEL_CHAIN[Math.min(modelIdx, MODEL_CHAIN.length - 1)];
          const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': eng.key },
            body: JSON.stringify(buildBody({ prompt, system, json, temperature })),
            signal: ctrl.signal,
          });
          clearTimeout(timer);

          if (!res.ok) {
            const raw = await res.text().catch(() => '');
            let msg = `HTTP ${res.status}`;
            try {
              msg = JSON.parse(raw)?.error?.message || msg;
            } catch {
              /* keep plain */
            }
            // Model retired/unavailable for this key → advance the model chain
            // (a key problem, not an engine problem — don't cooldown).
            if (
              res.status === 404 ||
              /no longer available|model not found|not supported for new users/i.test(msg)
            ) {
              if (modelIdx < MODEL_CHAIN.length - 1) {
                modelIdx += 1;
                lastErr = new Error(msg);
                continue;
              }
              throw new Error(msg);
            }
            // Region-blocked egress → direct keys can never work on this
            // network. Cool them all and let the proxy engine take over.
            if (/location is not supported/i.test(msg)) {
              for (const e of ENGINES) if (e.type === 'direct') putCooldown(e);
              lastErr = new Error(msg);
              continue;
            }
            if (res.status === 429 || res.status === 403 || res.status >= 500) {
              putCooldown(eng);
              lastErr = new Error(msg);
              continue; // instant retry on the next engine
            }
            throw new Error(msg); // other 400s → our prompt/config problem
          }

          const data = await res.json();
          const cand = data?.candidates?.[0];
          text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
          if (!text) {
            if (cand?.finishReason && cand.finishReason !== 'STOP') {
              throw new Error(`Blocked: ${cand.finishReason}`);
            }
            throw new Error('Empty response');
          }
        }

        eng.failures = 0;
        stats.callsMade += 1;
        stats.lastLatencyMs = Date.now() - t0;
        stats.lastError = null;
        cache.set(cacheKey, { v: text, e: Date.now() + GEMINI.CACHE_TTL_MS });
        persistCache();
        mirrorStats();
        return { text, cached: false, latencyMs: stats.lastLatencyMs };
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err?.name === 'AbortError';
        if (isAbort) {
          putCooldown(eng);
          lastErr = new Error('AI timeout (10s)');
        } else if (err instanceof TypeError) {
          // network failure / offline → cool this engine briefly and try next
          putCooldown(eng);
          lastErr = new Error('Network unreachable');
        } else {
          lastErr = err;
        }
      }
    }
    stats.failures += 1;
    stats.lastError = String(lastErr?.message || 'All AI engines failed');
    mirrorStats();
    throw lastErr || new Error('All AI engines failed');
  })();

  inflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(cacheKey);
  }
}

/** JSON-mode generation → parsed object (null when unparseable). */
export async function generateJSON(opts) {
  const { text } = await generate({ ...opts, json: true });
  const { repairJson } = await import('../../utils/jsonRepair');
  return repairJson(text);
}

/** Admin AI Health panel snapshot — key VALUES never included.
 *  PURE: no store writes here. Calling mirrorStats() (which setState()s)
 *  from this getter caused an infinite re-render livelock that froze the
 *  AI Health page. byKey is derived read-only for display. */
export function healthSnapshot() {
  const byKey = ENGINES.map((k) => ({
    idx: k.idx,
    type: k.type,
    label: k.type === 'proxy' ? 'In-app AI engine' : `Gemini key ${k.idx + 1}`,
    calls: k.calls,
    failures: k.failures,
    cooling: k.cooldownUntil > Date.now(),
    cooldownLeftSec: Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)),
  }));
  return {
    model: MODEL_CHAIN[0],
    configuredKeys: DIRECT_KEYS.length,
    engines: ENGINES.length,
    mode: aiMode(),
    ...stats,
    byKey,
  };
}

export function clearAiCache() {
  cache.clear();
  persistCache();
  mirrorStats();
}

export const geminiModel = MODEL_CHAIN[0];
