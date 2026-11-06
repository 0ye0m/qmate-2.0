import { describe, it, expect } from 'vitest';
import { erlangB, erlangC, avgWaitMinutes, staffingFor } from '../../services/prediction/erlangC';

describe('Erlang-C staffing math (M/M/c)', () => {
  it('blocking probability is 0 for zero offered load', () => {
    expect(erlangB(3, 0)).toBe(0);
    expect(erlangC(3, 0)).toBe(0);
  });

  it('Erlang-C returns 1 when system is unstable (a ≥ c)', () => {
    expect(erlangC(2, 2.5)).toBe(1);
    expect(avgWaitMinutes(2, 100, 5)).toBe(Infinity);
  });

  it('probability of waiting is between 0 and 1 for stable systems', () => {
    const c = erlangC(3, 1.8);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });

  it('average wait decreases as counters increase', () => {
    const w2 = avgWaitMinutes(2, 40, 4);
    const w3 = avgWaitMinutes(3, 40, 4);
    const w4 = avgWaitMinutes(4, 40, 4);
    expect(w2).toBeGreaterThan(w3);
    expect(w3).toBeGreaterThan(w4);
    expect(w4).toBeGreaterThanOrEqual(0);
  });

  it('staffingFor recommends the minimal counters meeting the wait target', () => {
    const plan = staffingFor({ arrivalsPerHour: 60, avgServiceMin: 4, targetWaitMin: 10, maxCounters: 10 });
    // a = 60 * 4/60 = 4 erlangs → 5 counters is the first stable option
    expect(plan.recommended).toBeGreaterThanOrEqual(5);
    expect(plan.rows.length).toBe(10);
    const chosen = plan.rows.find((r) => r.counters === plan.recommended);
    expect(chosen.waitMin).toBeLessThanOrEqual(10);
    // one fewer counter should miss the target or be unstable
    const prev = plan.rows.find((r) => r.counters === plan.recommended - 1);
    expect(prev.unstable || prev.waitMin > 10).toBe(true);
  });

  it('utilization is shared load a/c and stays below 1 when stable', () => {
    const plan = staffingFor({ arrivalsPerHour: 30, avgServiceMin: 3, targetWaitMin: 15 });
    expect(plan.utilization).toBeLessThan(1);
  });
});
