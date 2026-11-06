/**
 * GEMINI CLIENT — browser-direct REST calls (no SDK), engineered for a
 * college demo that must never crash and never burn quota:
 *
 *  • Key pool (up to 3 keys) with round-robin + least-used selection.
 *  • HTTP 429/403/5xx or timeout → key cooldown (exponential backoff, 60 s
 *    base, 15 min cap) and instant retry on the next key; ≤3 attempts total.
 *  • 10 s AbortController timeout per attempt.
 *  • Response cache: djb2(prompt+model) → result, TTL 10 min, persisted.
 *  • In-flight de-duplication (identical prompts share one request).
 *  • Per-minute rate limiter (token bucket over a sliding 60 s window).
 *  • All prompts ask for JSON (responseMimeType) and are parsed through
 *    repairJson() — never a raw JSON.parse crash.
 *  • Health metrics mirrored into aiStore (never the key values).
 *
 * If no keys are configured, callers skip straight to their local fallback.
 */
import { GEMINI, STORAGE_KEYS } from '../../utils/constants';
import { hashString } from '../../utils/jsonRepair';
import { useAiStore } from '../../store/aiStore';

const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const KEYS = [1, 2, 3]
  .map((i) => import.meta.env[`VITE_GEMINI_KEY_${i}`])
  .map((k) => (typeof k === 'string' ? k.trim() : ''))
  .filter(Boolean)
  .map((key, idx) => ({ idx, key, calls: 0, failures: 0, cooldownUntil: 0 }));

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

export function aiConfigured() {
  return KEYS.length > 0;
}

export function aiMode() {
  if (!KEYS.length) return 'off';
  return KEYS.some((k) => k.cooldownUntil <= Date.now()) ? 'online' : 'fallback';
}

function mirrorStats() {
  stats.byKey = KEYS.map((k) => ({
    idx: k.idx,
    calls: k.calls,
    failures: k.failures,
    cooling: k.cooldownUntil > Date.now(),
    cooldownLeftSec: Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000)),
  }));
  useAiStore.getState().sync({ ...stats, byKey: [...stats.byKey] }, aiMode(), MODEL);
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
    if (!KEYS.length) {
      const err = new Error('No Gemini keys configured');
      err.code = 'AI_UNAVAILABLE';
      throw err;
    }
    await rateGate();
    let lastErr = null;
    const ordered = KEYS.slice().sort(
      (a, b) => a.cooldownUntil - b.cooldownUntil || a.calls - b.calls
    );
    for (const k of ordered.slice(0, GEMINI.MAX_ATTEMPTS)) {
      if (k.cooldownUntil > Date.now()) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GEMINI.TIMEOUT_MS);
      const t0 = Date.now();
      try {
        k.calls += 1;
        const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
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
          if (res.status === 429 || res.status === 403 || res.status >= 500) {
            putCooldown(k);
            lastErr = new Error(msg);
            continue; // instant retry on the next key
          }
          throw new Error(msg); // 400/404 → our prompt/config problem, don't burn keys
        }

        const data = await res.json();
        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (!text) {
          if (cand?.finishReason && cand.finishReason !== 'STOP') {
            throw new Error(`Blocked: ${cand.finishReason}`);
          }
          throw new Error('Empty response');
        }
        k.failures = 0;
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
          putCooldown(k);
          lastErr = new Error('Gemini timeout (10s)');
        } else if (err instanceof TypeError) {
          // network failure / offline → cool this key briefly and try next
          putCooldown(k);
          lastErr = new Error('Network unreachable');
        } else {
          lastErr = err;
        }
      }
    }
    stats.failures += 1;
    stats.lastError = String(lastErr?.message || 'All AI keys failed');
    mirrorStats();
    throw lastErr || new Error('All AI keys failed');
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

/** Admin AI Health panel snapshot — key VALUES never included. */
export function healthSnapshot() {
  mirrorStats();
  return {
    model: MODEL,
    configuredKeys: KEYS.length,
    mode: aiMode(),
    ...stats,
  };
}

export function clearAiCache() {
  cache.clear();
  persistCache();
  mirrorStats();
}

export const geminiModel = MODEL;
