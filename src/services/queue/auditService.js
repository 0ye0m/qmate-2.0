/**
 * Audit trail — every admin action and system mutation is recorded and
 * capped at AUDIT_LOG_MAX entries (oldest trimmed).
 */
import { storage } from '../storage';
import { uid } from '../../utils/id';
import { AUDIT_LOG_MAX } from '../../utils/constants';

export async function log(actor, action, targetType, targetId, details = {}) {
  try {
    const entry = {
      id: uid('aud-'),
      ts: Date.now(),
      actorId: actor?.id || 'system',
      actorEmail: actor?.email || 'system',
      action,
      targetType,
      targetId,
      details,
    };
    await storage.put('auditLog', entry);
    const count = await storage.count('auditLog');
    if (count > AUDIT_LOG_MAX) {
      const extra = count - AUDIT_LOG_MAX;
      const oldest = await storage.table('auditLog').orderBy('ts').limit(extra).toArray();
      await Promise.all(oldest.map((e) => storage.delete('auditLog', e.id)));
    }
    return entry;
  } catch (err) {
    console.error('[audit] failed', err);
    return null;
  }
}

export async function list({ action, actorId, limit = 200 } = {}) {
  let rows = await storage.table('auditLog').orderBy('ts').reverse().limit(limit * 3).toArray();
  if (action) rows = rows.filter((r) => r.action === action);
  if (actorId) rows = rows.filter((r) => r.actorId === actorId);
  return rows.slice(0, limit);
}

export async function actions() {
  const rows = await storage.getAll('auditLog');
  return [...new Set(rows.map((r) => r.action))].sort();
}
