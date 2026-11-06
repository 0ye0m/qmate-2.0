/**
 * QUEUE SERVICE — the single transactional gateway for every queue/token
 * mutation. Rules that keep concurrent tabs safe:
 *   1. Every mutation runs inside withLock(queueKey)  → cross-tab mutex.
 *   2. Inside the lock, reads+writes run in one Dexie transaction → atomic.
 *   3. Events publish AFTER the transaction commits → listeners never see
 *      uncommitted state.
 * A future backend re-implements these methods over HTTP; UI code and the
 * EventBus contract stay untouched.
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { withLock } from '../concurrency/mutex';
import { AppError } from '../../utils/errors';
import { uid } from '../../utils/id';
import {
  QUEUE_STATUS,
  TOKEN_STATUS,
  LIVE_TOKEN_STATUSES,
  CALL_GRACE_MS,
  TOKEN_NUMBER_START,
  PRIORITY_FAIR_RATIO,
} from '../../utils/constants';
import { pickNextToken } from './fairness';
import { log as audit } from './auditService';
import { onCompletion, predictForQueue } from '../prediction/predictionService';
import { computeTokenImpact, addGreenPoints } from '../green/greenEngine';

/* ── reads ─────────────────────────────────────────────────────────────── */

export async function listQueues() {
  const rows = await storage.getAll('queues');
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getQueue(id) {
  return storage.get('queues', id);
}

export async function countersOf(queueId) {
  const rows = await storage.table('counters').where('queueId').equals(queueId).toArray();
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export async function openCounterCount(queueId) {
  const rows = await countersOf(queueId);
  return rows.filter((c) => c.status === 'open').length;
}

export async function liveQueueStats(queueId) {
  const tokens = await storage.table('tokens').where('queueId').equals(queueId).toArray();
  const live = tokens.filter((t) => LIVE_TOKEN_STATUSES.includes(t.status));
  return {
    waiting: live.filter((t) => t.status === TOKEN_STATUS.WAITING).length,
    called: live.filter((t) => t.status === TOKEN_STATUS.CALLED).length,
    serving: live.filter((t) => t.status === TOKEN_STATUS.SERVING).length,
    slotsUsed: live.length,
  };
}

/** ETA snapshot for queue cards (what a new joiner would face). */
export async function queueEta(queue) {
  const [stats, open] = await Promise.all([liveQueueStats(queue.id), openCounterCount(queue.id)]);
  const eta = await predictForQueue(queue, stats.waiting, Math.max(1, open));
  return { ...eta, ...stats, openCounters: open };
}

export async function waitingTokens(queueId) {
  const rows = await storage
    .table('tokens')
    .where('[queueId+status]')
    .equals([queueId, TOKEN_STATUS.WAITING])
    .toArray();
  return rows.sort((a, b) => a.number - b.number);
}

export async function calledTokens(queueId) {
  const rows = await storage.table('tokens').where('queueId').equals(queueId).toArray();
  return rows
    .filter((t) => t.status === TOKEN_STATUS.CALLED || t.status === TOKEN_STATUS.SERVING)
    .sort((a, b) => (a.calledAt || 0) - (b.calledAt || 0));
}

export async function activeTokensForUser(userId) {
  const rows = await storage.table('tokens').where('userId').equals(userId).toArray();
  return rows
    .filter((t) => LIVE_TOKEN_STATUSES.includes(t.status))
    .sort((a, b) => b.issuedAt - a.issuedAt);
}

export async function historyForUser(userId) {
  const rows = await storage.table('tokens').where('userId').equals(userId).toArray();
  return rows
    .filter((t) => ![TOKEN_STATUS.WAITING, TOKEN_STATUS.CALLED, TOKEN_STATUS.SERVING].includes(t.status))
    .sort((a, b) => (b.completedAt || b.issuedAt) - (a.completedAt || a.issuedAt));
}

export async function tokenById(tokenId) {
  return storage.get('tokens', tokenId);
}

/* ── queue admin ───────────────────────────────────────────────────────── */

function deriveCode(name) {
  return (
    String(name)
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'QM'
  );
}

async function ensureCounters(queue) {
  const existing = await countersOf(queue.id);
  const open = existing.filter((c) => c.status !== 'closed');
  if (open.length < queue.countersCount) {
    for (let i = open.length; i < queue.countersCount; i++) {
      await storage.put('counters', {
        id: uid('cnt-'),
        queueId: queue.id,
        label: `Counter ${i + 1}`,
        status: 'open',
        currentTokenId: null,
        servingSince: null,
        servedCount: 0,
        createdAt: Date.now(),
      });
    }
  } else if (open.length > queue.countersCount) {
    for (const c of open.slice(queue.countersCount)) {
      if (c.currentTokenId) continue; // busy — leave it alone
      await storage.table('counters').update(c.id, { status: 'closed' });
    }
  }
}

export async function createQueue(actor, data) {
  if (!data.name || String(data.name).trim().length < 3) throw new AppError('VALIDATION', { field: 'name' });
  const countersCount = Math.max(1, Math.min(10, Number(data.countersCount) || 1));
  const maxSlots = Math.max(10, Math.min(999, Number(data.maxSlots) || 60));
  const queue = {
    id: uid('q-'),
    code: deriveCode(data.name),
    name: String(data.name).trim().slice(0, 60),
    department: data.department || 'CSE',
    description: String(data.description || '').slice(0, 200),
    status: data.status || QUEUE_STATUS.ACTIVE,
    countersCount,
    maxSlots,
    serviceWindow: {
      from: data.serviceWindow?.from || '09:00',
      to: data.serviceWindow?.to || '17:00',
    },
    scheduledFor: data.scheduledFor || null,
    avgServiceMin: Math.max(1, Math.min(60, Number(data.avgServiceMin) || 5)),
    requiredDocs: Array.isArray(data.requiredDocs) ? data.requiredDocs.slice(0, 12) : [],
    priorityRatio: PRIORITY_FAIR_RATIO,
    pausedReason: null,
    createdAt: Date.now(),
    createdBy: actor?.id || 'system',
  };
  await storage.put('queues', queue);
  await ensureCounters(queue);
  await audit(actor, 'queue.create', 'queue', queue.id, { name: queue.name });
  eventBus.publish(EVENTS.QUEUE_CREATED, { queueId: queue.id });
  return queue;
}

export async function updateQueue(actor, id, patch) {
  const queue = await storage.get('queues', id);
  if (!queue) throw new AppError('QUEUE_NOT_FOUND');
  const allowed = {};
  if (patch.name) allowed.name = String(patch.name).trim().slice(0, 60);
  if (patch.description != null) allowed.description = String(patch.description).slice(0, 200);
  if (patch.department) allowed.department = patch.department;
  if (patch.countersCount) allowed.countersCount = Math.max(1, Math.min(10, Number(patch.countersCount)));
  if (patch.maxSlots) allowed.maxSlots = Math.max(10, Math.min(999, Number(patch.maxSlots)));
  if (patch.serviceWindow) allowed.serviceWindow = patch.serviceWindow;
  if (patch.avgServiceMin) allowed.avgServiceMin = Math.max(1, Math.min(60, Number(patch.avgServiceMin)));
  if (Array.isArray(patch.requiredDocs)) allowed.requiredDocs = patch.requiredDocs.slice(0, 12);
  if (patch.scheduledFor !== undefined) allowed.scheduledFor = patch.scheduledFor;
  await storage.table('queues').update(id, allowed);
  const updated = await storage.get('queues', id);
  await ensureCounters(updated);
  await audit(actor, 'queue.update', 'queue', id, allowed);
  eventBus.publish(EVENTS.QUEUE_UPDATED, { queueId: id });
  return updated;
}

export async function setQueueStatus(actor, id, status) {
  const queue = await storage.get('queues', id);
  if (!queue) throw new AppError('QUEUE_NOT_FOUND');
  if (!Object.values(QUEUE_STATUS).includes(status)) throw new AppError('VALIDATION');
  const patch = { status, pausedReason: status === QUEUE_STATUS.PAUSED ? 'manual' : null };
  if (status === QUEUE_STATUS.COMPLETED) patch.closedAt = Date.now();
  await storage.table('queues').update(id, patch);
  await audit(actor, `queue.${status}`, 'queue', id, { from: queue.status });
  const eventType =
    status === QUEUE_STATUS.PAUSED
      ? EVENTS.QUEUE_PAUSED
      : status === QUEUE_STATUS.COMPLETED
        ? EVENTS.QUEUE_CLOSED
        : status === QUEUE_STATUS.ACTIVE
          ? EVENTS.QUEUE_RESUMED
          : EVENTS.QUEUE_STATUS;
  eventBus.publish(eventType, { queueId: id, status });
  return storage.get('queues', id);
}

export async function openCounter(actor, counterId) {
  const c = await storage.get('counters', counterId);
  if (!c) throw new AppError('VALIDATION');
  await storage.table('counters').update(counterId, { status: 'open' });
  await audit(actor, 'counter.open', 'counter', counterId, { queueId: c.queueId });
  eventBus.publish(EVENTS.COUNTER_OPENED, { queueId: c.queueId, counterId });
}

export async function closeCounter(actor, counterId) {
  const c = await storage.get('counters', counterId);
  if (!c) throw new AppError('VALIDATION');
  if (c.currentTokenId) throw new AppError('COUNTER_BUSY');
  await storage.table('counters').update(counterId, { status: 'closed' });
  await audit(actor, 'counter.close', 'counter', counterId, { queueId: c.queueId });
  eventBus.publish(EVENTS.COUNTER_CLOSED, { queueId: c.queueId, counterId });
}

/* ── student actions ───────────────────────────────────────────────────── */

/**
 * Join a queue → unique per-queue token (numbers start at 101).
 * Auto-pauses the queue the instant it hits maxSlots (auto-close on full),
 * and any later completion auto-resumes it.
 */
export async function joinQueue({ queueId, user, opts = {} }) {
  if (!user) throw new AppError('FORBIDDEN');

  // Pre-compute the ETA prediction OUTSIDE the transaction (read-only,
  // touches the `predictions` table which is not part of the write scope).
  let predictedWaitMin = null;
  try {
    const pre = await storage.get('queues', queueId);
    if (pre) {
      const preTokens = await storage.table('tokens').where('queueId').equals(queueId).toArray();
      const preLive = preTokens.filter((t) => LIVE_TOKEN_STATUSES.includes(t.status));
      const preOpen = (await storage.table('counters').where('queueId').equals(queueId).toArray()).filter(
        (c) => c.status === 'open'
      ).length;
      const p = await predictForQueue(
        pre,
        opts.aheadCount != null ? opts.aheadCount : preLive.filter((t) => t.status === TOKEN_STATUS.WAITING).length,
        Math.max(1, preOpen)
      );
      predictedWaitMin = p.etaMin;
    }
  } catch {
    predictedWaitMin = null;
  }

  const token = await withLock(`q:${queueId}`, () =>
    storage.transaction(['queues', 'tokens', 'counters', 'prebooks'], async () => {
      const queue = await storage.get('queues', queueId);
      if (!queue) throw new AppError('QUEUE_NOT_FOUND');

      // capacity first: a full queue reports QUEUE_FULL even if it has
      // already auto-paused (clearer than a generic "not active")
      const qTokens = await storage.table('tokens').where('queueId').equals(queueId).toArray();
      const live = qTokens.filter((t) => LIVE_TOKEN_STATUSES.includes(t.status));
      if (live.length >= queue.maxSlots) {
        if (queue.status === QUEUE_STATUS.ACTIVE) {
          await storage.table('queues').update(queueId, { status: QUEUE_STATUS.PAUSED, pausedReason: 'full' });
        }
        throw new AppError('QUEUE_FULL');
      }
      if (queue.status !== QUEUE_STATUS.ACTIVE) throw new AppError('QUEUE_NOT_ACTIVE');

      const mine = await storage.table('tokens').where('userId').equals(user.id).toArray();
      if (mine.some((t) => t.queueId === queueId && LIVE_TOKEN_STATUSES.includes(t.status))) {
        throw new AppError('ALREADY_IN_QUEUE');
      }

      if (live.length >= queue.maxSlots) {
        await storage.table('queues').update(queueId, { status: QUEUE_STATUS.PAUSED, pausedReason: 'full' });
        throw new AppError('QUEUE_FULL');
      }

      const maxNum = qTokens.reduce((m, t) => Math.max(m, t.number || 0), TOKEN_NUMBER_START - 1);
      const number = maxNum + 1;
      const now = Date.now();
      const token = {
        id: uid('tok-'),
        code: `${queue.code || 'Q'}-${number}`,
        number,
        queueId,
        queueName: queue.name,
        userId: user.id,
        department: user.department || '—',
        year: user.year || null,
        status: TOKEN_STATUS.WAITING,
        priority: opts.priority || 'none',
        priorityVerified: false,
        issuedAt: now,
        calledAt: null,
        servingSince: null,
        completedAt: null,
        counterId: null,
        waitSeconds: null,
        serviceSeconds: null,
        predictedWaitMin,
        joinedRemote: !!opts.remote,
        prebookId: opts.prebookId || null,
        stepAwayUntil: 0,
        arrived: false,
        docsAcknowledged: !!opts.docsAcknowledged,
      };
      await storage.put('tokens', token);

      const nowLive = live.length + 1;
      if (nowLive >= queue.maxSlots) {
        await storage.table('queues').update(queueId, { status: QUEUE_STATUS.PAUSED, pausedReason: 'full' });
      }
      if (opts.prebookId) {
        await storage.table('prebooks').update(opts.prebookId, { status: 'converted', tokenId: token.id });
      }
      return token;
    })
  );
  eventBus.publish(EVENTS.TOKEN_ISSUED, {
    queueId,
    tokenId: token.id,
    number: token.number,
    code: token.code,
    userId: token.userId,
  });
  const queueAfter = await storage.get('queues', queueId);
  if (queueAfter.status === QUEUE_STATUS.PAUSED) {
    eventBus.publish(EVENTS.QUEUE_PAUSED, { queueId, reason: 'full' });
  }
  return token;
}

/** Leave a waiting queue voluntarily. */
export async function leaveQueue(tokenId, userId) {
  return withLock('tok:' + tokenId, async () => {
    const out = await storage.transaction(['tokens', 'queues'], async () => {
      const token = await storage.get('tokens', tokenId);
      if (!token) throw new AppError('TOKEN_NOT_FOUND');
      if (token.userId !== userId) throw new AppError('FORBIDDEN');
      if (token.status !== TOKEN_STATUS.WAITING) throw new AppError('VALIDATION');
      const patch = { status: TOKEN_STATUS.CANCELLED, cancelledAt: Date.now() };
      await storage.table('tokens').update(tokenId, patch);
      const queue = await storage.get('queues', token.queueId);
      let resumed = false;
      if (queue.status === QUEUE_STATUS.PAUSED && queue.pausedReason === 'full') {
        const live = (await storage.table('tokens').where('queueId').equals(token.queueId).toArray())
          .filter((t) => LIVE_TOKEN_STATUSES.includes(t.status)).length;
        if (live < queue.maxSlots) {
          await storage.table('queues').update(queue.id, { status: QUEUE_STATUS.ACTIVE, pausedReason: null });
          resumed = true;
        }
      }
      return { queueId: token.queueId, resumed };
    });
    eventBus.publish(EVENTS.TOKEN_CANCELLED, { tokenId, queueId: out.queueId, userId });
    return out;
  });
}

/** "Step Away" — keep your place for 5 minutes; you won't be called while away. */
export async function stepAway(tokenId, userId, away = true) {
  const token = await storage.get('tokens', tokenId);
  if (!token || token.userId !== userId) throw new AppError('FORBIDDEN');
  const stepAwayUntil = away ? Date.now() + 5 * 60 * 1000 : 0;
  await storage.table('tokens').update(tokenId, { stepAwayUntil });
  eventBus.publish(EVENTS.TOKEN_UPDATED, { tokenId, queueId: token.queueId, reason: 'step-away', away });
}

/** Check-in (admin scans QR, or student taps "I'm at the counter"). */
export async function markArrived(tokenId) {
  return withLock('tok:' + tokenId, async () => {
    const out = await storage.transaction(['tokens', 'counters'], async () => {
      const token = await storage.get('tokens', tokenId);
      if (!token) throw new AppError('TOKEN_NOT_FOUND');
      if (!['called', 'serving'].includes(token.status)) throw new AppError('VALIDATION');
      const now = Date.now();
      if (token.status === TOKEN_STATUS.CALLED) {
        const patch = { status: TOKEN_STATUS.SERVING, arrived: true, servingSince: now };
        await storage.table('tokens').update(tokenId, patch);
        return { token: { ...token, ...patch }, transition: 'serving' };
      }
      await storage.table('tokens').update(tokenId, { arrived: true });
      return { token: { ...token, arrived: true }, transition: 'arrived' };
    });
    eventBus.publish(EVENTS.TOKEN_SERVING, {
      tokenId,
      queueId: out.token.queueId,
      counterId: out.token.counterId,
      userId: out.token.userId,
    });
    return out.token;
  });
}

/* ── counter actions (admin) ───────────────────────────────────────────── */

/** Call the next fair token to a free counter (or the given counter). */
export async function callNext(actor, queueId, counterId = null) {
  return withLock(`q:${queueId}`, async () => {
    const out = await storage.transaction(['queues', 'tokens', 'counters'], async () => {
      const queue = await storage.get('queues', queueId);
      if (!queue) throw new AppError('QUEUE_NOT_FOUND');
      if (![QUEUE_STATUS.ACTIVE, QUEUE_STATUS.PAUSED].includes(queue.status)) {
        throw new AppError('QUEUE_NOT_ACTIVE');
      }
      const counters = (await storage.table('counters').where('queueId').equals(queueId).toArray()).filter(
        (c) => c.status === 'open'
      );
      const target = counterId ? counters.find((c) => c.id === counterId) : counters[0];
      if (!target) throw new AppError('NO_FREE_COUNTER');
      if (target.currentTokenId) throw new AppError('COUNTER_BUSY');

      const all = await storage.table('tokens').where('queueId').equals(queueId).toArray();
      const now = Date.now();
      const waiting = all
        .filter((t) => t.status === TOKEN_STATUS.WAITING)
        .sort((a, b) => a.number - b.number);
      const eligible = waiting.filter((t) => !t.stepAwayUntil || t.stepAwayUntil < now);
      if (!eligible.length) throw new AppError('NO_WAITING_TOKENS');

      const recent = all
        .filter((t) => t.calledAt)
        .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))
        .slice(0, 12);
      const chosen = pickNextToken(eligible, recent, queue.priorityRatio || PRIORITY_FAIR_RATIO);
      if (!chosen) throw new AppError('NO_WAITING_TOKENS');

      const patch = {
        status: TOKEN_STATUS.CALLED,
        counterId: target.id,
        calledAt: now,
        graceUntil: now + CALL_GRACE_MS,
        arrived: false,
        waitSeconds: Math.round((now - chosen.issuedAt) / 1000),
      };
      await storage.table('tokens').update(chosen.id, patch);
      const updatedCounter = {
        ...target,
        status: 'serving',
        currentTokenId: chosen.id,
        servingSince: now,
      };
      await storage.table('counters').update(target.id, {
        status: 'serving',
        currentTokenId: chosen.id,
        servingSince: now,
      });
      return { token: { ...chosen, ...patch }, counter: updatedCounter };
    });
    eventBus.publish(EVENTS.TOKEN_CALLED, {
      queueId,
      tokenId: out.token.id,
      number: out.token.number,
      code: out.token.code,
      counterId: out.counter.id,
      counterLabel: out.counter.label,
      userId: out.token.userId,
      priority: out.token.priority,
    });
    await audit(actor, 'token.call', 'token', out.token.id, { queueId, counter: out.counter.label });
    return out;
  });
}

/** Complete the current token → frees the counter, updates prediction + green. */
export async function completeToken(actor, tokenId) {
  const token0 = await storage.get('tokens', tokenId);
  if (!token0) throw new AppError('TOKEN_NOT_FOUND');
  return withLock(`q:${token0.queueId}`, async () => {
    const out = await storage.transaction(['tokens', 'counters', 'queues'], async () => {
      const token = await storage.get('tokens', tokenId);
      if (!['called', 'serving'].includes(token.status)) throw new AppError('VALIDATION');
      const now = Date.now();
      const serviceSeconds = token.servingSince
        ? Math.round((now - token.servingSince) / 1000)
        : Math.round((now - (token.calledAt || token.issuedAt)) / 1000);
      const patch = { status: TOKEN_STATUS.COMPLETED, completedAt: now, serviceSeconds };
      await storage.table('tokens').update(tokenId, patch);
      if (token.counterId) {
        const counter = await storage.get('counters', token.counterId);
        await storage.table('counters').update(token.counterId, {
          status: 'open',
          currentTokenId: null,
          servingSince: null,
          servedCount: (counter?.servedCount || 0) + 1,
        });
      }
      const queue = await storage.get('queues', token.queueId);
      let resumed = false;
      if (queue.status === QUEUE_STATUS.PAUSED && queue.pausedReason === 'full') {
        const live = (await storage.table('tokens').where('queueId').equals(token.queueId).toArray())
          .filter((t) => LIVE_TOKEN_STATUSES.includes(t.status)).length;
        if (live < queue.maxSlots) {
          await storage.table('queues').update(queue.id, { status: QUEUE_STATUS.ACTIVE, pausedReason: null });
          resumed = true;
        }
      }
      return { token: { ...token, ...patch }, queue, resumed };
    });

    // Post-commit side effects (idempotent, outside the lock's txn)
    try {
      await onCompletion(out.queue, out.token);
      const impact = computeTokenImpact(out.token);
      await addGreenPoints(out.token.userId, impact.points);
    } catch (err) {
      console.error('[queue] post-completion side effects failed', err);
    }
    eventBus.publish(EVENTS.TOKEN_COMPLETED, {
      queueId: out.queue.id,
      tokenId,
      number: out.token.number,
      counterId: out.token.counterId,
      userId: out.token.userId,
    });
    if (out.resumed) eventBus.publish(EVENTS.QUEUE_RESUMED, { queueId: out.queue.id });
    await audit(actor, 'token.complete', 'token', tokenId, {
      queueId: out.queue.id,
      serviceSeconds: out.token.serviceSeconds,
    });
    return out.token;
  });
}

/** Admin skip (manual). */
export async function skipToken(actor, tokenId, reason = 'manual') {
  const token0 = await storage.get('tokens', tokenId);
  if (!token0) throw new AppError('TOKEN_NOT_FOUND');
  return withLock(`q:${token0.queueId}`, async () => {
    const out = await storage.transaction(['tokens', 'counters', 'queues'], async () => {
      const token = await storage.get('tokens', tokenId);
      if (!['called', 'serving'].includes(token.status)) throw new AppError('VALIDATION');
      await storage.table('tokens').update(tokenId, { status: TOKEN_STATUS.SKIPPED, skippedAt: Date.now(), skipReason: reason });
      if (token.counterId) {
        await storage.table('counters').update(token.counterId, { status: 'open', currentTokenId: null, servingSince: null });
      }
      const queue = await storage.get('queues', token.queueId);
      let resumed = false;
      if (queue.status === QUEUE_STATUS.PAUSED && queue.pausedReason === 'full') {
        const live = (await storage.table('tokens').where('queueId').equals(token.queueId).toArray())
          .filter((t) => LIVE_TOKEN_STATUSES.includes(t.status)).length;
        if (live < queue.maxSlots) {
          await storage.table('queues').update(queue.id, { status: QUEUE_STATUS.ACTIVE, pausedReason: null });
          resumed = true;
        }
      }
      return { queueId: token.queueId, userId: token.userId, number: token.number, resumed };
    });
    eventBus.publish(EVENTS.TOKEN_SKIPPED, { tokenId, queueId: out.queueId, userId: out.userId, reason });
    if (out.resumed) eventBus.publish(EVENTS.QUEUE_RESUMED, { queueId: out.queueId });
    await audit(actor, 'token.skip', 'token', tokenId, { queueId: out.queueId, reason });
  });
}

/** Auto-skip a no-show whose grace timer expired (called by the watcher). */
export async function markNoShow(tokenId) {
  const token0 = await storage.get('tokens', tokenId);
  if (!token0 || token0.status !== TOKEN_STATUS.CALLED) return null;
  if (token0.arrived) return null;
  if ((token0.graceUntil || 0) > Date.now()) return null;
  return withLock(`q:${token0.queueId}`, async () => {
    const out = await storage.transaction(['tokens', 'counters'], async () => {
      const token = await storage.get('tokens', tokenId);
      if (!token || token.status !== TOKEN_STATUS.CALLED || token.arrived) return null;
      if ((token.graceUntil || 0) > Date.now()) return null;
      await storage.table('tokens').update(tokenId, { status: TOKEN_STATUS.NO_SHOW, skippedAt: Date.now(), skipReason: 'no-show' });
      if (token.counterId) {
        await storage.table('counters').update(token.counterId, { status: 'open', currentTokenId: null, servingSince: null });
      }
      return { queueId: token.queueId, userId: token.userId, number: token.number };
    });
    if (!out) return null;
    eventBus.publish(EVENTS.TOKEN_NO_SHOW, { tokenId, queueId: out.queueId, userId: out.userId });
    await audit({ id: 'system', email: 'system' }, 'token.no-show', 'token', tokenId, { queueId: out.queueId });
    return out;
  });
}

/** Any expired grace timers across a queue (or all queues when queueId null). */
export async function autoSkipExpired(queueId = null) {
  let called = [];
  if (queueId) {
    called = await calledTokens(queueId);
  } else {
    called = (await storage.getAll('tokens')).filter((t) => t.status === TOKEN_STATUS.CALLED);
  }
  const expired = called.filter((t) => !t.arrived && (t.graceUntil || 0) < Date.now());
  const results = [];
  for (const t of expired) {
    try {
      const r = await markNoShow(t.id);
      if (r) results.push(r);
    } catch (err) {
      console.error('[queue] auto-skip failed', err);
    }
  }
  return results;
}

/** Recall: re-announce a called token and refresh its grace window. */
export async function recallToken(actor, tokenId) {
  const token = await storage.get('tokens', tokenId);
  if (!token || token.status !== TOKEN_STATUS.CALLED) throw new AppError('VALIDATION');
  const graceUntil = Date.now() + CALL_GRACE_MS;
  await storage.table('tokens').update(tokenId, { graceUntil });
  eventBus.publish(EVENTS.TOKEN_RECALLED, { tokenId, queueId: token.queueId, counterId: token.counterId, userId: token.userId });
  await audit(actor, 'token.recall', 'token', tokenId, { queueId: token.queueId });
}

/** Admin verifies a priority claim (shown with a badge on the waiting list). */
export async function verifyPriority(actor, tokenId, verified = true) {
  const token = await storage.get('tokens', tokenId);
  if (!token) throw new AppError('TOKEN_NOT_FOUND');
  await storage.table('tokens').update(tokenId, { priorityVerified: !!verified });
  eventBus.publish(EVENTS.TOKEN_UPDATED, { tokenId, queueId: token.queueId, reason: 'priority-verified' });
  await audit(actor, 'token.verifyPriority', 'token', tokenId, { verified });
}

/** Today's completed + live tokens for a queue (analytics & console). */
export async function queueTodayTokens(queueId) {
  const rows = await storage.table('tokens').where('queueId').equals(queueId).toArray();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return rows.filter((t) => (t.issuedAt || 0) >= start.getTime());
}
