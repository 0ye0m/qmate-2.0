/**
 * Staffing Advisor — turns historical hourly load into an M/M/c plan:
 * "Open 3 counters between 10:00–13:00; 2 are enough after 14:00."
 * Pure local math (Erlang-C); admin can optionally ask AI to explain it.
 */
import { TOKEN_STATUS, LIVE_TOKEN_STATUSES } from '../../utils/constants';
import { hourlyLoad } from '../../utils/analytics';
import { staffingFor } from './erlangC';

/**
 * @param {Array} tokens   historical tokens for the queue (7 days is ideal)
 * @param {number} avgServiceMin
 * @param {number} targetWaitMin service-level target
 * @param {object} window  {fromMin, toMin} service window in minutes-of-day
 */
export function adviseStaffing({ tokens, avgServiceMin, targetWaitMin = 10, window }) {
  const load = hourlyLoad(tokens).filter(
    (b) => !window || (b.hour * 60 >= window.fromMin - 60 && b.hour * 60 <= window.toMin)
  );
  const days = Math.max(1, new Set((tokens || []).map((t) => new Date(t.issuedAt).toDateString())).size);
  const plan = load
    .filter((b) => b.count > 0)
    .map((b) => {
      const arrivalsPerHour = b.count / days; // average per single day, per this hour
      const advice = staffingFor({ arrivalsPerHour, avgServiceMin, targetWaitMin });
      return {
        hour: b.hour,
        arrivalsPerHour: Math.round(arrivalsPerHour * 10) / 10,
        recommendedCounters: advice.recommended,
        predictedWaitMin: advice.waitMin == null ? null : Math.round(advice.waitMin * 10) / 10,
        utilization: Math.round(advice.utilization * 100),
      };
    });
  return plan;
}

/** Busiest plan rows (for AI summarization / UI chips). */
export function peakPlanRows(plan, topN = 3) {
  return plan.slice().sort((a, b) => b.arrivalsPerHour - a.arrivalsPerHour).slice(0, topN);
}

/** Count live tokens (used to sanity-check plans against reality). */
export function liveCount(tokens) {
  return tokens.filter((t) => LIVE_TOKEN_STATUSES.includes(t.status) && t.status !== TOKEN_STATUS.CANCELLED).length;
}
