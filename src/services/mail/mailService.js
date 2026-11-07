/**
 * MAIL SERVICE (client) — thin, resilient client for the mail & verification
 * tier embedded in the application server (/api/mail/*).
 *
 * Every call degrades gracefully: when the app runs on the local offline
 * store (data API unreachable) the feature reports `available:false` and the
 * caller continues without email — the rest of the app is never blocked.
 */
import { storage } from '../storage';

const BASE = '/api/mail';

let healthCache = null; // { smtp, modes, at }

async function api(path, { method = 'POST', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('MAIL_UNREACHABLE');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `MAIL_${res.status}`);
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

/** SMTP availability + delivery modes (cached 2 min). Never throws. */
export async function mailHealth(force = false) {
  if (!force && healthCache && Date.now() - healthCache.at < 120000) return healthCache;
  try {
    const h = await api('/health', { method: 'GET' });
    healthCache = { ...h, at: Date.now() };
    return healthCache;
  } catch {
    healthCache = { ok: false, smtp: 'unavailable', modes: { otp: false, alerts: false }, at: Date.now() };
    return healthCache;
  }
}

/** True when the app is running on the shared cloud store (OTP applies). */
export function cloudMode() {
  return storage.kind === 'mongodb';
}

/** Issue a 6-digit verification code. Returns {delivery, onscreenCode?, expiresAt}. */
export async function sendOtp(email, purpose = 'signup', name = '') {
  return api('/otp/send', { body: { email, purpose, name } });
}

/** Verify a code; returns a short-lived signed receipt for registration. */
export async function verifyOtp(email, purpose, code) {
  return api('/otp/verify', { body: { email, purpose, code } });
}

/** Server-side account creation (email-verified). Returns the public user. */
export async function registerOnServer(profile) {
  const out = await api('/register', { body: profile });
  return out.user;
}

/** Stable, privacy-preserving device descriptor for security alerts. */
export function deviceDescriptor() {
  try {
    return {
      ua: navigator.userAgent?.slice(0, 180) || '',
      platform: navigator.platform || (navigator.userAgentData?.platform ?? ''),
      lang: navigator.language || '',
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    };
  } catch {
    return { ua: '', platform: '', lang: '', screen: '', tz: '' };
  }
}

function humanDevice(d) {
  return `${d.platform || 'Unknown device'} · ${d.screen || '?'} · ${d.tz || ''}`.trim();
}

/** Fire-and-forget security/realtime alert. Never throws, never blocks UI. */
export async function notify(type, payload = {}) {
  try {
    const h = await mailHealth();
    if (!h.modes?.alerts && type !== 'login-new-device') return { ok: false, skipped: 'unavailable' };
    const body = { type, to: payload.to, data: payload.data || {}, dedupeKey: payload.dedupeKey };
    if (type === 'login-new-device') {
      const device = payload.device || deviceDescriptor();
      Object.assign(body, { userId: payload.userId, device });
      body.data = { device: humanDevice(device), time: new Date().toLocaleString('en-IN') };
    }
    return await api('/notify', { body });
  } catch {
    return { ok: false, skipped: 'error' };
  }
}
