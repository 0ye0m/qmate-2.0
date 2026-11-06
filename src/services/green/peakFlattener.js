/**
 * PEAK FLATTENING RECOMMENDER — analyzes historical hourly load and tells
 * students when the queue is emptiest ("Visit 11:30–12:00, ~70% shorter
 * wait") and powers "Low crowd first" prebook slot ordering.
 */
import { storage } from '../storage';
import { TOKEN_STATUS } from '../../utils/constants';
import { minutesToHHmm, hhmmToMinutes } from '../../utils/format';

/**
 * Average queue size at issue-time, bucketed by hour, averaged per day.
 * @returns [{hour, avgLoad, count}]
 */
export async function loadProfile(queueId, window = null) {
  const tokens = (await storage.table('tokens').where('queueId').equals(queueId).toArray()).filter(
    (t) => t.issuedAt
  );
  const days = Math.max(1, new Set(tokens.map((t) => new Date(t.issuedAt).toDateString())).size);
  const map = new Map();
  for (const t of tokens) {
    const h = new Date(t.issuedAt).getHours();
    if (window && (h * 60 < window.fromMin || h * 60 > window.toMin)) continue;
    if (!map.has(h)) map.set(h, { hour: h, total: 0, count: 0 });
    const row = map.get(h);
    row.total += peopleAheadOf(t, tokens);
    row.count += 1;
  }
  return [...map.values()]
    .map((r) => ({ hour: r.hour, avgLoad: Math.round((r.total / r.count) * 10) / 10, count: r.count }))
    .sort((a, b) => a.hour - b.hour);
}

function peopleAheadOf(token, all) {
  return all.filter(
    (o) =>
      o.queueId === token.queueId &&
      o.number < token.number &&
      ['waiting', 'called', 'serving', 'completed'].includes(o.status) &&
      Math.abs(o.issuedAt - token.issuedAt) < 6 * 3600000
  ).length;
}

/**
 * Best visit windows for a queue: two 30-min slots with the lowest average
 * load inside the service window. Returns [{label, from, to, reductionPct}].
 */
export async function bestWindows(queue, topN = 2) {
  const win = {
    fromMin: hhmmToMinutes(queue.serviceWindow?.from || '09:00'),
    toMin: hhmmToMinutes(queue.serviceWindow?.to || '17:00'),
  };
  const profile = await loadProfile(queue.id, win);
  if (profile.length < 3) return [];
  const overall = profile.reduce((a, b) => a + b.avgLoad, 0) / profile.length;
  const slots = [];
  for (let m = Math.ceil(win.fromMin / 30) * 30; m + 30 <= win.toMin; m += 30) {
    const h = Math.floor(m / 60);
    const row = profile.find((p) => p.hour === h) || profile.find((p) => p.hour === h + 1);
    if (!row) continue;
    const reduction = overall > 0 ? Math.round((1 - row.avgLoad / overall) * 100) : 0;
    slots.push({
      from: minutesToHHmm(m),
      to: minutesToHHmm(m + 30),
      avgLoad: row.avgLoad,
      reductionPct: Math.max(0, Math.min(90, reduction)),
    });
  }
  return slots.sort((a, b) => b.reductionPct - a.reductionPct).slice(0, topN);
}

/** Convenience wrapper: {windows, busiestHour}. */
export async function suggestForQueue(queue) {
  const windows = await bestWindows(queue);
  const profile = await loadProfile(queue.id);
  const busiest = profile.slice().sort((a, b) => b.avgLoad - a.avgLoad)[0] || null;
  return { windows, busiest };
}
