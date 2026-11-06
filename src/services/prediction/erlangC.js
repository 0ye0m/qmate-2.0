/**
 * M/M/c queueing math — Erlang-B / Erlang-C, computed locally.
 * Used by the Staffing Advisor: "how many counters should be open at 11:00?"
 * Gemini is never involved in the math, only (optionally) the explanation.
 */

/** Erlang-B blocking probability for c servers, offered load a erlangs. */
export function erlangB(c, a) {
  if (a < 0 || c < 1) return 0;
  let b = 1;
  for (let i = 1; i <= c; i++) {
    b = (a * b) / (i + a * b);
  }
  return Math.min(1, Math.max(0, b));
}

/** Erlang-C probability a caller must WAIT (c servers, load a erlangs). */
export function erlangC(c, a) {
  if (a <= 0) return 0;
  if (a >= c) return 1; // unstable system — everyone waits indefinitely
  const b = erlangB(c, a);
  const rho = a / c;
  return Math.min(1, Math.max(0, b / (1 - rho * (1 - b))));
}

/**
 * Average wait in minutes before service for M/M/c.
 * @param {number} c            counters
 * @param {number} arrivalsHr   arrival rate λ (people/hour)
 * @param {number} avgServiceMin mean service time (minutes)
 */
export function avgWaitMinutes(c, arrivalsHr, avgServiceMin) {
  const S = avgServiceMin / 60; // service time in hours
  const a = arrivalsHr * S; // offered load (erlangs)
  if (arrivalsHr <= 0) return 0;
  if (a >= c) return Infinity;
  const mu = 1 / S;
  const C = erlangC(c, a);
  const WqHours = C / (c * mu - arrivalsHr);
  return (WqHours * 60);
}

/**
 * Staffing recommendation for one hourly bucket.
 * @returns {{recommended:number, utilization:number, waitMin:number, unstable:boolean, rows:Array}}
 */
export function staffingFor({ arrivalsPerHour, avgServiceMin, targetWaitMin = 10, maxCounters = 12 }) {
  const S = avgServiceMin / 60;
  const a = arrivalsPerHour * S;
  const mu = 1 / S;
  const rows = [];
  let recommended = null;
  for (let c = 1; c <= maxCounters; c++) {
    const unstable = a >= c;
    const waitMin = unstable ? Infinity : avgWaitMinutes(c, arrivalsPerHour, avgServiceMin);
    const utilization = a / c;
    rows.push({ counters: c, waitMin, utilization, unstable });
    if (recommended == null && !unstable && waitMin <= targetWaitMin) {
      recommended = c;
    }
  }
  if (recommended == null) {
    // even maxCounters can't hit target → recommend the best we scanned
    const feasible = rows.filter((r) => !r.unstable);
    recommended = feasible.length ? feasible[feasible.length - 1].counters : maxCounters;
  }
  const chosen = rows.find((r) => r.counters === recommended);
  return {
    recommended,
    utilization: chosen ? chosen.utilization : a / maxCounters,
    waitMin: chosen && Number.isFinite(chosen.waitMin) ? chosen.waitMin : null,
    unstable: a >= maxCounters,
    rows,
  };
}
