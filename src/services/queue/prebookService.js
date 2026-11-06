/**
 * PREBOOKING — reserve a date/slot in advance. Slot load is computed from
 * live bookings + historical load; "Low crowd" slots surface first and earn
 * a small Green Score bonus (off-peak nudge → flattens the day's peaks).
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { AppError } from '../../utils/errors';
import { uid } from '../../utils/id';
import { PREBOOK_SLOT_MIN, PREBOOK_MAX_PER_USER_PER_QUEUE, QUEUE_STATUS } from '../../utils/constants';
import { hhmmToMinutes, minutesToHHmm, todayStr } from '../../utils/format';
import { addGreenPoints } from '../green/greenEngine';
import { GREEN_POINTS } from '../../utils/constants';
import { log as audit } from './auditService';

function slotTimes(queue, dateStr) {
  const from = hhmmToMinutes(queue.serviceWindow?.from || '09:00');
  const to = hhmmToMinutes(queue.serviceWindow?.to || '17:00');
  const times = [];
  for (let m = Math.ceil(from / PREBOOK_SLOT_MIN) * PREBOOK_SLOT_MIN; m + PREBOOK_SLOT_MIN <= to; m += PREBOOK_SLOT_MIN) {
    times.push(minutesToHHmm(m));
  }
  return times.length ? times : [minutesToHHmm(from)];
}

/**
 * Slots for a queue/date with live load + crowd level.
 * @returns [{time, load, capacity, level}]  level: 'low' | 'medium' | 'high'
 */
export async function slotsFor(queue, dateStr) {
  const times = slotTimes(queue, dateStr);
  const bookings = await storage
    .table('prebooks')
    .where('[queueId+date]')
    .equals([queue.id, dateStr])
    .toArray();
  const active = bookings.filter((b) => b.status === 'booked');
  const perCap = Math.max(2, Math.round(queue.maxSlots / Math.max(1, times.length)));
  const now = Date.now();
  const isToday = dateStr === todayStr();
  const curMin = new Date().getHours() * 60 + new Date().getMinutes();
  return times.map((time) => {
    const load = active.filter((b) => b.time === time).length;
    const ratio = load / perCap;
    const level = ratio < 0.4 ? 'low' : ratio < 0.8 ? 'medium' : 'high';
    const past = isToday && hhmmToMinutes(time) <= curMin;
    return { time, load, capacity: perCap, level, past };
  });
}

export async function book({ userId, queueId, date, time }) {
  const queue = await storage.get('queues', queueId);
  if (!queue) throw new AppError('QUEUE_NOT_FOUND');
  if (date < todayStr()) throw new AppError('VALIDATION');
  const slots = await slotsFor(queue, date);
  const slot = slots.find((s) => s.time === time);
  if (!slot || slot.past) throw new AppError('VALIDATION');
  if (slot.load >= slot.capacity) throw new AppError('PREBOOK_FULL');

  const mine = await storage.table('prebooks').where('userId').equals(userId).toArray();
  const activeForQueue = mine.filter((p) => p.queueId === queueId && p.status === 'booked');
  if (activeForQueue.length >= PREBOOK_MAX_PER_USER_PER_QUEUE) throw new AppError('PREBOOK_DUPLICATE');
  if (activeForQueue.some((p) => p.date === date && p.time === time)) throw new AppError('PREBOOK_DUPLICATE');

  const prebook = {
    id: uid('pb-'),
    queueId,
    queueName: queue.name,
    userId,
    date,
    time,
    status: 'booked',
    offpeak: slot.level === 'low',
    createdAt: Date.now(),
  };
  await storage.put('prebooks', prebook);
  if (prebook.offpeak) {
    await addGreenPoints(userId, GREEN_POINTS.offpeakJoinBonus);
  }
  eventBus.publish(EVENTS.PREBOOK_CREATED, { prebookId: prebook.id, queueId, date, time, userId });
  return prebook;
}

export async function cancel(prebookId, userId) {
  const pb = await storage.get('prebooks', prebookId);
  if (!pb) throw new AppError('PREBOOK_NOT_FOUND');
  if (pb.userId !== userId) throw new AppError('FORBIDDEN');
  if (pb.status !== 'booked') throw new AppError('VALIDATION');
  await storage.table('prebooks').update(prebookId, { status: 'cancelled', cancelledAt: Date.now() });
  eventBus.publish(EVENTS.PREBOOK_CANCELLED, { prebookId, queueId: pb.queueId, userId });
  return true;
}

export async function reschedule(prebookId, userId, date, time) {
  const pb = await storage.get('prebooks', prebookId);
  if (!pb || pb.userId !== userId) throw new AppError('PREBOOK_NOT_FOUND');
  if (pb.status !== 'booked') throw new AppError('VALIDATION');
  await storage.table('prebooks').update(prebookId, { status: 'cancelled', cancelledAt: Date.now() });
  try {
    const created = await book({ userId, queueId: pb.queueId, date, time });
    await storage.delete('prebooks', prebookId);
    return created;
  } catch (err) {
    // roll back cancellation so the original booking survives
    await storage.table('prebooks').update(prebookId, { status: 'booked', cancelledAt: null });
    throw err;
  }
}

export async function listForUser(userId) {
  const rows = await storage.table('prebooks').where('userId').equals(userId).toArray();
  return rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function listForQueueDate(queueId, date) {
  const rows = await storage
    .table('prebooks')
    .where('[queueId+date]')
    .equals([queueId, date])
    .toArray();
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

/** Convert today's prebook into a live token (walk-in check-in). */
export async function convertToToken(actor, prebookId, { remote = false } = {}) {
  const pb = await storage.get('prebooks', prebookId);
  if (!pb) throw new AppError('PREBOOK_NOT_FOUND');
  if (pb.status !== 'booked') throw new AppError('VALIDATION');
  const queue = await storage.get('queues', pb.queueId);
  if (!queue || queue.status !== QUEUE_STATUS.ACTIVE) throw new AppError('QUEUE_NOT_ACTIVE');
  const user = await storage.get('users', pb.userId);
  if (!user) throw new AppError('TOKEN_NOT_FOUND');
  const { joinQueue } = await import('./queueService');
  const token = await joinQueue({
    queueId: pb.queueId,
    user,
    opts: { remote, prebookId, docsAcknowledged: true, priority: 'none' },
  });
  await audit(actor, 'prebook.convert', 'prebook', prebookId, { tokenId: token.id });
  return token;
}
