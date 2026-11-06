import { TOKEN_STATUS } from './constants';
import { dateStrOf } from './format';

/** Count tokens issued per hour of day (0–23). */
export function hourlyLoad(tokens) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const t of tokens) {
    if (!t.issuedAt) continue;
    buckets[new Date(t.issuedAt).getHours()].count++;
  }
  return buckets.filter((b) => b.hour >= 7 && b.hour <= 19);
}

/** Top-N busiest hours across a token sample. */
export function peakHours(tokens, topN = 2) {
  return hourlyLoad(tokens)
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .filter((b) => b.count > 0);
}

/** Wait-time distribution in friendly buckets (minutes). */
export function waitBuckets(tokens) {
  const defs = [
    { label: '0–5m', min: 0, max: 5 },
    { label: '5–10m', min: 5, max: 10 },
    { label: '10–20m', min: 10, max: 20 },
    { label: '20–40m', min: 20, max: 40 },
    { label: '40m+', min: 40, max: Infinity },
  ];
  return defs.map((d) => ({
    bucket: d.label,
    count: tokens.filter((t) => {
      const w = (t.waitSeconds || 0) / 60;
      return t.waitSeconds != null && w >= d.min && w < d.max;
    }).length,
  }));
}

/** Average completed service time per counter (minutes). */
export function avgServicePerCounter(tokens, counters) {
  const byCounter = new Map();
  for (const t of tokens) {
    if (t.status !== TOKEN_STATUS.COMPLETED || !t.counterId) continue;
    const s = (t.serviceSeconds || 0) / 60;
    if (!byCounter.has(t.counterId)) byCounter.set(t.counterId, []);
    byCounter.get(t.counterId).push(s);
  }
  return (counters || []).map((c) => {
    const arr = byCounter.get(c.id) || [];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { counter: c.label, avgMin: Math.round(avg * 10) / 10, served: arr.length };
  });
}

/** No-show rate = (no-show + skip) / (completed + no-show + skip). */
export function noShowRate(tokens) {
  const done = tokens.filter(
    (t) => [TOKEN_STATUS.COMPLETED, TOKEN_STATUS.NO_SHOW, TOKEN_STATUS.SKIPPED].includes(t.status)
  );
  const bad = done.filter((t) => t.status !== TOKEN_STATUS.COMPLETED);
  if (!done.length) return 0;
  return Math.round((bad.length / done.length) * 100);
}

/**
 * Counter utilization = busy minutes / (open window minutes × counters).
 * Busy minutes derived from completed + in-flight service durations.
 */
export function counterUtilization(tokens, counters, windowMin = 420) {
  const c = Math.max(1, (counters || []).length);
  const busyMin = tokens.reduce((sum, t) => {
    if (t.status === TOKEN_STATUS.COMPLETED) return sum + (t.serviceSeconds || 0) / 60;
    if (t.status === TOKEN_STATUS.SERVING && t.servingSince) {
      return sum + (Date.now() - t.servingSince) / 60000;
    }
    return sum;
  }, 0);
  const capacity = c * windowMin;
  return Math.min(100, Math.round((busyMin / capacity) * 100));
}

/** Filter items whose timestamp field falls within the last N days. */
export function lastDays(items, field, days) {
  if (!days || days <= 0) return items;
  const since = Date.now() - days * 86400000;
  return items.filter((i) => (i[field] || 0) >= since);
}

/** Group tokens by calendar day string (yyyy-MM-dd). */
export function groupByDay(tokens) {
  const map = new Map();
  for (const t of tokens) {
    const k = dateStrOf(t.issuedAt || Date.now());
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return map;
}

/** Average wait of completed tokens in minutes. */
export function avgWaitMin(tokens) {
  const arr = tokens.filter((t) => t.waitSeconds != null).map((t) => t.waitSeconds / 60);
  if (!arr.length) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}
