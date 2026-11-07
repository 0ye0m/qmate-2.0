/**
 * Client-side auth: PBKDF2 hashes, expiring sessions in IndexedDB,
 * 5-strikes → 15-minute lockout, role-based access. Rules are enforced by
 * authService; guards in app/guards.jsx read the auth store.
 *
 * Cloud mode (shared MongoDB store): registration is verified with an
 * email OTP and the account is created server-side with a signed receipt;
 * several provisioned roles may share one address, so sign-in matches on
 * email + password across every account on that address.
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { hashPassword, verifyPassword } from './password';
import { AppError } from '../../utils/errors';
import { uid } from '../../utils/id';
import { notify } from '../mail/mailService';
import { registerOnServer } from '../mail/mailService';
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  REMEMBER_TTL_MS,
  ROLE_RANK,
  SESSION_TTL_MS,
  SEED_VERSION,
} from '../../utils/constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAB_SESSION_KEY = 'qmate-tab-session';
const DEVICE_SESSION_KEY = 'qmate-device-session';

/**
 * Session tokens are DEVICE-LOCAL and never shared through the cloud store:
 *   • sessionStorage (per-tab) — always set on sign-in; dies with the tab,
 *     so closing the app requires credentials again (student + admin tabs
 *     can hold different roles side by side).
 *   • localStorage (this browser only) — written ONLY when the user opts in
 *     with "Keep me signed in"; never leaves the device.
 * The `sessions` table in the shared store is used solely to validate
 * expiry and to power "sign out everywhere" — restore() never adopts a
 * session it did not find a local token for.
 */
function rememberTabSession(token) {
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, token); // per-tab → student + admin tabs can coexist
  } catch {
    /* sessionStorage unavailable */
  }
}

function tabSessionToken() {
  try {
    return sessionStorage.getItem(TAB_SESSION_KEY);
  } catch {
    return null;
  }
}

function forgetTabSession() {
  try {
    sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function rememberDeviceSession(token, expiresAt) {
  try {
    localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    /* localStorage unavailable (private mode) — tab session still works */
  }
}

function deviceSessionToken() {
  try {
    const raw = localStorage.getItem(DEVICE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || (parsed.expiresAt && parsed.expiresAt <= Date.now())) {
      localStorage.removeItem(DEVICE_SESSION_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function forgetDeviceSession() {
  try {
    localStorage.removeItem(DEVICE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function publicUser(u) {
  if (!u) return null;
  const { passHash, salt, ...rest } = u;
  return rest;
}

function validateRegistration({ name, email, password, department, year }) {
  if (!name || String(name).trim().length < 2) throw new AppError('VALIDATION', { field: 'name' });
  if (!email || !EMAIL_RE.test(String(email).toLowerCase())) throw new AppError('BAD_EMAIL');
  // Policy: 8+ characters with at least one letter and one digit.
  const pw = String(password || '');
  if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw new AppError('WEAK_PASSWORD');
  if (!department) throw new AppError('VALIDATION', { field: 'department' });
  if (!year) throw new AppError('VALIDATION', { field: 'year' });
}

function strongPassword(pw) {
  return String(pw || '').length >= 8 && /[a-zA-Z]/.test(String(pw)) && /\d/.test(String(pw));
}

/**
 * Create a session record. The record lives in the store (so expiry and
 * "sign out everywhere" work), but ONLY the device that created it keeps
 * the token. `remember` extends the TTL and persists the token in this
 * browser's localStorage; otherwise the tab session alone holds it.
 */
async function createSession(userId, { remember = false } = {}) {
  const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const token = uid('ses-');
  const session = { token, userId, createdAt: Date.now(), expiresAt: Date.now() + ttl };
  await storage.put('sessions', session);
  if (remember) rememberDeviceSession(token, session.expiresAt);
  return session;
}

/**
 * Create an account.
 *  • Cloud mode — the email must carry a verified OTP receipt; the account
 *    record is created by the server (receipt-gated) and mirrored locally.
 *  • Offline mode — local creation with the same validation rules (the
 *    email-verification tier is unavailable by definition offline).
 * Self-service sign-up always creates a student account; staff roles are
 * provisioned by an administrator.
 */
export async function register({ name, email, password, department, year, verification }) {
  validateRegistration({ name, email, password, department, year });
  const normEmail = String(email).toLowerCase().trim();

  if (storage.kind === 'mongodb') {
    if (!verification?.receipt) {
      throw new AppError('OTP_REQUIRED');
    }
    let user;
    try {
      user = await registerOnServer({
        name: String(name).trim(),
        email: normEmail,
        password: String(password),
        department,
        year: Number(year) || 1,
        verification: { email: normEmail, receipt: verification.receipt },
      });
    } catch (err) {
      const code = String(err?.message || '');
      if (code === 'EMAIL_TAKEN') throw new AppError('EMAIL_TAKEN');
      if (code === 'RECEIPT_INVALID') throw new AppError('OTP_INVALID');
      if (code === 'WEAK_PASSWORD') throw new AppError('WEAK_PASSWORD');
      if (code === 'VALIDATION') throw new AppError('VALIDATION', { field: err?.detail });
      if (code === 'MAIL_UNREACHABLE' || /^MAIL_/.test(code)) throw new AppError('OTP_REQUIRED');
      throw new AppError('GENERIC');
    }
    const session = await createSession(user.id);
    rememberTabSession(session.token);
    eventBus.publish(EVENTS.USER_UPDATED, { userId: user.id, reason: 'registered' });
    return { user, session };
  }

  // offline fallback — same rules, local store
  const existing = await storage.table('users').where('email').equals(normEmail).first();
  if (existing) throw new AppError('EMAIL_TAKEN');
  const { hash, salt } = await hashPassword(password);
  const user = {
    id: uid('usr-'),
    name: String(name).trim(),
    email: normEmail,
    passHash: hash,
    salt,
    role: 'student',
    department,
    year: Number(year) || 1,
    status: 'active',
    failedAttempts: 0,
    lockedUntil: 0,
    greenScore: 0,
    badges: [],
    prefs: { sound: true, travelMinutes: 10 },
    emailVerified: false,
    createdAt: Date.now(),
  };
  await storage.put('users', user);
  const session = await createSession(user.id);
  rememberTabSession(session.token);
  eventBus.publish(EVENTS.USER_UPDATED, { userId: user.id, reason: 'registered' });
  return { user: publicUser(user), session };
}

/**
 * Sign in. Several provisioned accounts (student, admin, super-admin) may
 * legitimately share one address, so every account on the address is tried
 * against the supplied password; failed attempts count against the address
 * as a whole (an attacker cannot tell which account they are hitting).
 */
export async function login(email, password, { remember = false } = {}) {
  if (!email || !password) throw new AppError('INVALID_CREDENTIALS');
  const normEmail = String(email).toLowerCase().trim();
  const candidates = (await storage.table('users').where('email').equals(normEmail).toArray()) || [];
  if (!candidates.length) throw new AppError('INVALID_CREDENTIALS');

  const now = Date.now();
  const unlocked = candidates.filter((u) => !(u.lockedUntil && u.lockedUntil > now) && u.status !== 'locked');
  const locked = candidates.filter((u) => !unlocked.includes(u));

  if (!unlocked.length) {
    const soonest = Math.min(...locked.map((u) => (u.status === 'locked' ? Infinity : u.lockedUntil || Infinity)));
    if (soonest === Infinity) {
      throw new AppError('ACCOUNT_LOCKED', { byAdmin: true, until: Infinity, minutes: null });
    }
    throw new AppError('ACCOUNT_LOCKED', {
      until: soonest,
      minutes: Math.ceil((soonest - now) / 60000),
    });
  }

  let matched = null;
  for (const user of unlocked) {
    if (await verifyPassword(password, user.passHash, user.salt)) {
      matched = user;
      break;
    }
  }

  if (!matched) {
    // count the strike against every account on this address
    const results = await Promise.all(
      unlocked.map(async (user) => {
        const attempts = (user.failedAttempts || 0) + 1;
        const patch = { failedAttempts: attempts };
        let lockedNow = false;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          patch.lockedUntil = now + LOCKOUT_MS;
          patch.failedAttempts = 0; // reset counter after triggering lock
          lockedNow = true;
        }
        await storage.table('users').update(user.id, patch);
        if (lockedNow) {
          notify('account-locked', {
            to: user.email,
            dedupeKey: `lock:${user.id}:${now}`,
            data: { minutes: Math.ceil(LOCKOUT_MS / 60000), time: new Date().toLocaleString('en-IN') },
          }).catch(() => {});
        }
        return { lockedNow };
      })
    );
    if (results.some((r) => r.lockedNow)) {
      throw new AppError('ACCOUNT_LOCKED', { until: now + LOCKOUT_MS, minutes: Math.ceil(LOCKOUT_MS / 60000) });
    }
    throw new AppError('INVALID_CREDENTIALS', { attemptsLeft: MAX_FAILED_ATTEMPTS - (unlocked[0]?.failedAttempts || 1) });
  }

  if (matched.failedAttempts || matched.lockedUntil) {
    await storage.table('users').update(matched.id, { failedAttempts: 0, lockedUntil: 0 });
  }
  const session = await createSession(matched.id, { remember });
  rememberTabSession(session.token);

  // security alert on first sign-in from a device (fire-and-forget)
  notify('login-new-device', { userId: matched.id, to: matched.email }).catch(() => {});

  return { user: publicUser(matched), session };
}

/**
 * Restore session on boot — DEVICE-LOCAL ONLY.
 * A token is accepted exclusively from (1) this tab's sessionStorage or
 * (2) this browser's localStorage when the user opted into "Keep me signed
 * in". The shared/cloud store is never scanned for other sessions, so a
 * sign-in on one phone can never silently log in a different phone or PC.
 */
export async function restore() {
  const now = Date.now();

  // best-effort cleanup of expired sessions in the store
  const sessions = await storage.getAll('sessions');
  await Promise.all(
    sessions.filter((s) => s.expiresAt <= now).map((s) => storage.delete('sessions', s.token).catch(() => {}))
  );

  const validate = async (token) => {
    if (!token) return null;
    const session = await storage.get('sessions', token).catch(() => null);
    if (!session || session.expiresAt <= now) {
      return null;
    }
    const user = await storage.get('users', session.userId).catch(() => null);
    if (!user || user.status === 'locked') return null;
    return { user: publicUser(user), session };
  };

  // 1) this tab's own session (student + admin tabs can coexist)
  const viaTab = await validate(tabSessionToken());
  if (viaTab) return viaTab;

  // 2) this device's remembered session (opt-in only)
  const viaDevice = await validate(deviceSessionToken());
  if (viaDevice) {
    rememberTabSession(viaDevice.session.token);
    return viaDevice;
  }

  forgetTabSession();
  forgetDeviceSession();
  return null;
}

export async function logout(sessionToken) {
  if (sessionToken) await storage.delete('sessions', sessionToken).catch(() => {});
  forgetTabSession();
  forgetDeviceSession();
}

/** Security action: revoke every session this user holds on OTHER devices
 *  (and other tabs). The current session is kept alive. */
export async function logoutOtherDevices(userId, keepToken) {
  const sessions = await storage.getAll('sessions');
  const mine = sessions.filter((s) => s.userId === userId && s.token !== keepToken);
  await Promise.all(mine.map((s) => storage.delete('sessions', s.token).catch(() => {})));
  return mine.length;
}

/** Fresh copy of a user profile (password fields stripped). */
export async function getUserById(id) {
  const user = await storage.get('users', id);
  return publicUser(user);
}

export async function updateProfile(userId, patch) {
  const allowed = {};
  if (patch.name) allowed.name = String(patch.name).trim().slice(0, 60);
  if (patch.department) allowed.department = patch.department;
  if (patch.year) allowed.year = Number(patch.year);
  if (patch.prefs) allowed.prefs = patch.prefs;
  await storage.table('users').update(userId, allowed);
  const user = await storage.get('users', userId);
  eventBus.publish(EVENTS.USER_UPDATED, { userId, reason: 'profile' });
  return publicUser(user);
}

/** Update only the prefs sub-object (sound, travelMinutes…). */
export async function updatePrefs(userId, prefsPatch) {
  const user = await storage.get('users', userId);
  if (!user) return null;
  const prefs = { ...(user.prefs || {}), ...prefsPatch };
  await storage.table('users').update(userId, { prefs });
  return publicUser(await storage.get('users', userId));
}

/** Change password: re-verify the current one first, then re-hash and
 *  confirm by email. Every failure mode throws a typed AppError. */
export async function changePassword(userId, currentPassword, nextPassword) {
  if (!strongPassword(nextPassword)) throw new AppError('WEAK_PASSWORD');
  const user = await storage.get('users', userId);
  if (!user) throw new AppError('TOKEN_NOT_FOUND');
  const ok = await verifyPassword(String(currentPassword || ''), user.passHash, user.salt);
  if (!ok) throw new AppError('INVALID_CREDENTIALS');
  const { hash, salt } = await hashPassword(nextPassword);
  await storage.table('users').update(userId, { passHash: hash, salt, failedAttempts: 0, lockedUntil: 0 });
  notify('password-changed', {
    to: user.email,
    dedupeKey: `pwchange:${userId}:${Date.now()}`,
    data: { time: new Date().toLocaleString('en-IN') },
  }).catch(() => {});
  eventBus.publish(EVENTS.USER_UPDATED, { userId, reason: 'password' });
  return publicUser(await storage.get('users', userId));
}

/* ── Admin user management ─────────────────────────────────────────────── */

export async function listUsers() {
  const users = await storage.getAll('users');
  return users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name));
}

async function requireActor(actor, minRole = 'admin') {
  if (!actor || (ROLE_RANK[actor.role] || 0) < ROLE_RANK[minRole]) {
    throw new AppError('FORBIDDEN');
  }
}

export async function setUserRole(actor, userId, role) {
  await requireActor(actor, 'super-admin');
  if (!['student', 'admin', 'super-admin'].includes(role)) throw new AppError('VALIDATION');
  await storage.table('users').update(userId, { role });
  eventBus.publish(EVENTS.USER_UPDATED, { userId, reason: 'role' });
  return publicUser(await storage.get('users', userId));
}

export async function setUserStatus(actor, userId, status) {
  await requireActor(actor, 'admin');
  if (!['active', 'locked'].includes(status)) throw new AppError('VALIDATION');
  const patch = { status, failedAttempts: 0 };
  patch.lockedUntil = status === 'active' ? 0 : 0; // admin lock is persistent, not timed
  await storage.table('users').update(userId, patch);
  eventBus.publish(EVENTS.USER_UPDATED, { userId, reason: 'status' });
  return publicUser(await storage.get('users', userId));
}

export async function deleteUser(actor, userId) {
  await requireActor(actor, 'super-admin');
  if (actor.id === userId) throw new AppError('VALIDATION', { field: 'self' });
  await storage.delete('users', userId);
  eventBus.publish(EVENTS.USER_UPDATED, { userId, reason: 'deleted' });
}

/** Locked-out check helper (used by tests + login UI countdown). */
export function lockRemainingMinutes(user, now = Date.now()) {
  if (!user?.lockedUntil || user.lockedUntil <= now) return 0;
  return Math.ceil((user.lockedUntil - now) / 60000);
}

/** True when the local database has been seeded. */
export async function isSeeded() {
  const meta = await storage.get('meta', 'seedVersion');
  return meta?.value === SEED_VERSION;
}
