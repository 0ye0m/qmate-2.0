import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function fmtClock(ts) {
  if (!ts) return '—';
  return format(new Date(ts), 'HH:mm');
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd MMM yyyy');
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return format(new Date(ts), 'dd MMM, HH:mm');
}

export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function fmtINR(n) {
  const v = Math.round(Number(n) || 0);
  return `₹${v.toLocaleString('en-IN')}`;
}

export function fmtPct(n) {
  return `${Math.round(Number(n) || 0)}%`;
}

export function timeAgo(ts) {
  if (!ts) return '—';
  return `${formatDistanceToNowStrict(new Date(ts))} ago`;
}

export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHmm(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function dateStrOf(ts) {
  return format(new Date(ts), 'yyyy-MM-dd');
}

export function initialsOf(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
