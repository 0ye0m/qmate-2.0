import Dexie from 'dexie';

/**
 * Dexie schema. Single local database "qmate".
 * All access goes through getDb() so tests can reset the instance.
 */
const SCHEMA = {
  users: 'id, email, role, status, department',
  sessions: 'token, userId, expiresAt',
  queues: 'id, name, department, status, [department+status]',
  tokens: 'id, code, queueId, userId, status, issuedAt, calledAt, completedAt, [queueId+status], [userId+status], [queueId+number], [queueId+calledAt]',
  counters: 'id, queueId, status, [queueId+status]',
  prebooks: 'id, queueId, userId, date, status, [queueId+date], [userId+status], [queueId+date+time]',
  feedback: 'id, queueId, tokenId, userId, createdAt',
  announcements: 'id, queueId, createdAt, severity',
  auditLog: 'id, createdAt, action, actorId, targetType',
  predictions: 'id',
  meta: 'key',
};

export const TABLES = Object.keys(SCHEMA);

let _db = null;

export function getDb() {
  if (!_db) {
    _db = new Dexie('qmate');
    _db.version(1).stores(SCHEMA);
  }
  return _db;
}

/** Test-only helper: close and wipe the database. */
export async function resetDb() {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* already closed */
    }
    _db = null;
  }
  try {
    await Dexie.delete('qmate');
  } catch {
    /* best effort */
  }
  // let pending microtasks release handles
  await new Promise((r) => setTimeout(r, 0));
}

/** Test-only helper: seed a tiny bare dataset. */
export async function seedBare() {
  const db = getDb();
  await db.meta.put({ key: 'seedVersion', value: 999 });
}
