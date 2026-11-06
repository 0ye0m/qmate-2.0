import { STORAGE_KEYS } from '../../utils/constants';
import { uid } from '../../utils/id';

/**
 * Cross-tab mutex.
 * Primary: Web Locks API (navigator.locks) — browser-native, auto-release.
 * Fallback: localStorage spin-lock with TTL heartbeat (for tests/old browsers).
 * Every queue mutation is wrapped in withLock() + a Dexie transaction, so
 * two tabs can never mint the same token number or double-book a counter.
 */
export async function withLock(key, fn, { ttlMs = 8000, retries = 240, delayMs = 20 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    try {
      return await navigator.locks.request(key, { mode: 'exclusive' }, fn);
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // Some browsers throw on unsupported options — retry plainly.
      return navigator.locks.request(key, fn);
    }
  }

  // ── localStorage fallback ──────────────────────────────────────────────
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!ls) return fn(null);
  const k = STORAGE_KEYS.LOCK_PREFIX + key;
  const owner = uid('lk-');

  for (let i = 0; i < retries; i++) {
    let cur = null;
    try {
      cur = JSON.parse(ls.getItem(k) || 'null');
    } catch {
      cur = null;
    }
    const now = Date.now();
    if (!cur || cur.expires < now) {
      ls.setItem(k, JSON.stringify({ owner, expires: now + ttlMs }));
      // Re-read to shrink the race window between writers.
      let check = null;
      try {
        check = JSON.parse(ls.getItem(k) || 'null');
      } catch {
        check = null;
      }
      if (check && check.owner === owner) {
        try {
          return await fn(null);
        } finally {
          let held = null;
          try {
            held = JSON.parse(ls.getItem(k) || 'null');
          } catch {
            held = null;
          }
          if (held && held.owner === owner) ls.removeItem(k);
        }
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const err = new Error(`Lock timeout: ${key}`);
  err.code = 'LOCK_TIMEOUT';
  throw err;
}
