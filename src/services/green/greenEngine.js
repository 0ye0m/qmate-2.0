/**
 * GREEN IMPACT ENGINE — the environmental + economic accounting layer.
 * Every completed token avoids: 1 paper ticket, standing in a physical line
 * (HVAC/lighting load), and — when the student joined remotely — a commute.
 * All factors are configurable in utils/constants.js.
 */
import { storage } from '../storage';
import { GREEN_FACTORS, GREEN_POINTS, VALUE_FACTORS, BADGES } from '../../utils/constants';
import { TOKEN_STATUS } from '../../utils/constants';

/** Pure: environmental + economic impact of one completed token. */
export function computeTokenImpact(token) {
  const f = GREEN_FACTORS;
  const sheets = f.paperSheetsPerToken;
  const waitMin = Math.max(0, (token.waitSeconds || 0) / 60);
  const commuteG = token.joinedRemote ? f.avgCommuteKmOneWay * 2 * f.co2gPerKmMix : 0;
  const crowdG = (waitMin / 60) * (f.hvacLightingWPerPerson / 1000) * f.gridCO2gPerKWh;
  const paperG = sheets * f.paperCO2gPerSheet;
  const co2g = paperG + commuteG + crowdG;
  const minutesSaved = waitMin;
  const inrValue = (minutesSaved / 60) * VALUE_FACTORS.studentInrPerHour;
  const points =
    GREEN_POINTS.perToken +
    Math.round((co2g / 100) * GREEN_POINTS.per100gCO2) +
    Math.round((minutesSaved / 10) * GREEN_POINTS.per10minSaved);
  return {
    sheets,
    co2g: Math.round(co2g),
    minutesSaved: Math.round(minutesSaved),
    inrValue: Math.round(inrValue),
    points,
    breakdown: { paperG: Math.round(paperG), commuteG: Math.round(commuteG), crowdG: Math.round(crowdG) },
  };
}

/** Add green points to a user (completion bonuses, off-peak booking bonus). */
export async function addGreenPoints(userId, points) {
  if (!userId || !points) return;
  const user = await storage.get('users', userId);
  if (!user) return;
  await storage.table('users').update(userId, { greenScore: (user.greenScore || 0) + points });
}

/** Pure: which badges a stats object earns. */
export function evalBadges(stats) {
  return BADGES.filter((b) => {
    try {
      return b.test(stats);
    } catch {
      return false;
    }
  }).map((b) => b.id);
}

/** Per-student sustainability stats + earned badges. */
export async function userStats(userId) {
  const tokens = await storage.table('tokens').where('userId').equals(userId).toArray();
  const completed = tokens.filter((t) => t.status === TOKEN_STATUS.COMPLETED);
  const prebooks = await storage.table('prebooks').where('userId').equals(userId).toArray();
  const offpeakJoins = prebooks.filter((p) => p.offpeak && p.status !== 'cancelled').length;
  const stats = { tokens: completed.length, minutesSaved: 0, co2g: 0, sheets: 0, inrValue: 0, offpeakJoins };
  for (const t of completed) {
    const imp = computeTokenImpact(t);
    stats.minutesSaved += imp.minutesSaved;
    stats.co2g += imp.co2g;
    stats.sheets += imp.sheets;
    stats.inrValue += imp.inrValue;
  }
  stats.score =
    stats.tokens * GREEN_POINTS.perToken +
    Math.round((stats.co2g / 100) * GREEN_POINTS.per100gCO2) +
    Math.round((stats.minutesSaved / 10) * GREEN_POINTS.per10minSaved) +
    offpeakJoins * GREEN_POINTS.offpeakJoinBonus;
  stats.badges = evalBadges(stats);
  return stats;
}

/** Campus-wide impact over the last N days. */
export async function campusStats(days = 365) {
  const since = Date.now() - days * 86400000;
  const tokens = (await storage.getAll('tokens')).filter(
    (t) => t.status === TOKEN_STATUS.COMPLETED && (t.completedAt || 0) >= since
  );
  const agg = { tokens: tokens.length, sheets: 0, co2g: 0, minutesSaved: 0, inrValue: 0 };
  for (const t of tokens) {
    const imp = computeTokenImpact(t);
    agg.sheets += imp.sheets;
    agg.co2g += imp.co2g;
    agg.minutesSaved += imp.minutesSaved;
    agg.inrValue += imp.inrValue;
  }
  const f = GREEN_FACTORS;
  return {
    ...agg,
    co2Kg: Math.round(agg.co2g / 100) / 10,
    treesEquivalent: Math.round(agg.co2g / 1000 / f.treeKgCO2PerYear * 100) / 100,
    paperCostSaved: Math.round(agg.sheets * f.paperCostInrPerSheet),
    staffSavings: Math.round((agg.tokens * f.extraPaperMinPerTokenStaff * VALUE_FACTORS.staffInrPerHour) / 60),
    totalInr: agg.inrValue + Math.round(agg.tokens * f.extraPaperMinPerTokenStaff * VALUE_FACTORS.staffInrPerHour / 60),
  };
}

/** Department leaderboard by green score (completed tokens × factors). */
export async function leaderboard() {
  const [tokens, users] = await Promise.all([storage.getAll('tokens'), storage.getAll('users')]);
  const deptByUser = new Map(users.map((u) => [u.id, u.department || '—']));
  const byDept = new Map();
  for (const t of tokens) {
    if (t.status !== TOKEN_STATUS.COMPLETED) continue;
    const dept = deptByUser.get(t.userId) || '—';
    const imp = computeTokenImpact(t);
    const row = byDept.get(dept) || { department: dept, tokens: 0, co2g: 0, minutesSaved: 0, points: 0 };
    row.tokens += 1;
    row.co2g += imp.co2g;
    row.minutesSaved += imp.minutesSaved;
    row.points += imp.points;
    byDept.set(dept, row);
  }
  return [...byDept.values()]
    .map((r) => ({ ...r, co2Kg: Math.round(r.co2g / 100) / 10 }))
    .sort((a, b) => b.points - a.points);
}

/** Cost dashboard: savings vs a paper-token system for 1 month/semester/year. */
export async function costSavings() {
  const [month, semester, year] = await Promise.all([
    campusStats(30),
    campusStats(180),
    campusStats(365),
  ]);
  return { month, semester, year };
}
