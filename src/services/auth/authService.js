/**
 * Client-side simulated auth: PBKDF2 hashes, expiring sessions in IndexedDB,
 * 5-strikes → 15-minute lockout, role-based access. All rules enforced by
 * authService; guards in app/guards.jsx read the auth store.
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { hashPassword, verifyPassword } from './password';
import { AppError } from '../../utils/errors';
import { uid } from '../../utils/id';
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  ROLE_RANK,
  SESSION_TTL_MS,
  SEED_VERSION,
} from '../../utils/constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAB_SESSION_KEY = 'qmate-tab-session';

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

function publicUser(u) {
  if (!u) return null;
  const { passHash, salt, ...rest } = u;
  return rest;
}

function validateRegistration({ name, email, password, department, year }) {
  if (!name || String(name).trim().length < 2) throw new AppError('VALIDATION', { field: 'name' });
  if (!email || !EMAIL_RE.test(String(email).toLowerCase())) throw new AppError('BAD_EMAIL');
  if (!password || String(password).length < 8) throw new AppError('WEAK_PASSWORD');
  if (!department) throw new AppError('VALIDATION', { field: 'department' });
  if (!year) throw new AppError('VALIDATION', { field: 'year' });
}

async function createSession(userId) {
  const token = uid('ses-');
  const session = { token, userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  await storage.put('sessions', session);
  return session;
}

export async function register({ name, email, password, department, year, role = 'student' }) {
  validateRegistration({ name, email, password, department, year });
  const normEmail = String(email).toLowerCase().trim();
  const existing = await storage.table('users').where('email').equals(normEmail).first();
  if (existing) throw new AppError('EMAIL_TAKEN');
  const { hash, salt } = await hashPassword(password);
  const user = {
    id: uid('usr-'),
    name: String(name).trim(),
    email: normEmail,
    passHash: hash,
    salt,
    role,
    department,
    year: Number(year) || 1,
    status: 'active',
    failedAttempts: 0,
    lockedUntil: 0,
    greenScore: 0,
    badges: [],
    prefs: { sound: true, travelMinutes: 10 },
    createdAt: Date.now(),
  };
  await storage.put('users', user);
  const session = await createSession(user.id);
  rememberTabSession(session.token);
  eventBus.publish(EVENTS.USER_UPDATED, { userId: user.id, reason: 'registered' });
  return { user: publicUser(user), session };
}

export async function login(email, password) {
  if (!email || !password) throw new AppError('INVALID_CREDENTIALS');
  const normEmail = String(email).toLowerCase().trim();
  const user = await storage.table('users').where('email').equals(normEmail).first();
  if (!user) throw new AppError('INVALID_CREDENTIALS');

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AppError('ACCOUNT_LOCKED', { until: user.lockedUntil, minutes: Math.ceil((user.lockedUntil - now) / 60000) });
  }
  if (user.status === 'locked' && !user.lockedUntil) {
    throw new AppError('ACCOUNT_LOCKED', { until: Infinity, minutes: null, byAdmin: true });
  }

  const ok = await verifyPassword(password, user.passHash, user.salt);
  if (!ok) {
    const attempts = (user.failedAttempts || 0) + 1;
    const patch = { failedAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.lockedUntil = now + LOCKOUT_MS;
      patch.failedAttempts = 0; // reset counter after triggering lock
    }
    await storage.table('users').update(user.id, patch);
    if (patch.lockedUntil) {
      throw new AppError('ACCOUNT_LOCKED', { until: patch.lockedUntil, minutes: Math.ceil(LOCKOUT_MS / 60000) });
    }
    throw new AppError('INVALID_CREDENTIALS', { attemptsLeft: MAX_FAILED_ATTEMPTS - attempts });
  }

  if (user.failedAttempts || user.lockedUntil) {
    await storage.table('users').update(user.id, { failedAttempts: 0, lockedUntil: 0 });
  }
  const session = await createSession(user.id);
  rememberTabSession(session.token);
  return { user: publicUser(user), session };
}

/** Restore session on boot. Tab-local session wins so two tabs can hold
 *  different roles (the student + admin two-tab demo). */
export async function restore() {
  const now = Date.now();
  const sessions = await storage.getAll('sessions');
  const live = sessions.filter((s) => s.expiresAt > now);

  const tabToken = tabSessionToken();
  const tabSession = tabToken ? live.find((s) => s.token === tabToken) : null;
  if (tabSession) {
    const user = await storage.get('users', tabSession.userId);
    if (user) return { user: publicUser(user), session: tabSession };
  }

  const fresh = live.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!fresh) {
    // best-effort cleanup of expired sessions
    await Promise.all(sessions.filter((s) => s.expiresAt <= now).map((s) => storage.delete('sessions', s.token)));
    return null;
  }
  rememberTabSession(fresh.token);
  const user = await storage.get('users', fresh.userId);
  if (!user) return null;
  return { user: publicUser(user), session: fresh };
}

export async function logout(sessionToken) {
  if (sessionToken) await storage.delete('sessions', sessionToken);
  forgetTabSession();
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
