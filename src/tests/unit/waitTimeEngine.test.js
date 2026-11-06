import { describe, it, expect } from 'vitest';
import {
  defaultState, observeService, observeOutcome, predict, accuracyOf, seedFromSamples,
} from '../../services/prediction/waitTimeEngine';

const queue = { id: 'q1', avgServiceMin: 5 };

describe('waitTimeEngine (hybrid EWMA prediction)', () => {
  it('returns fallback-based ETA with a positive confidence band', () => {
    const p = predict({ state: null, queue, aheadCount: 4, openCounters: 2, now: new Date('2026-02-06T10:00:00').getTime() });
    expect(p.etaMin).toBeGreaterThan(0);
    expect(p.bandMin).toBeGreaterThan(0);
    // 4 ahead / 2 counters + half slot at 5 min → ~12.5 min
    expect(p.etaMin).toBeGreaterThan(8);
    expect(p.etaMin).toBeLessThan(20);
  });

  it('ETA grows with people ahead and shrinks with more counters', () => {
    const a = predict({ state: null, queue, aheadCount: 6, openCounters: 1 });
    const b = predict({ state: null, queue, aheadCount: 3, openCounters: 1 });
    const c = predict({ state: null, queue, aheadCount: 6, openCounters: 3 });
    expect(a.etaMin).toBeGreaterThan(b.etaMin);
    expect(a.etaMin).toBeGreaterThan(c.etaMin);
  });

  it('EWMA converges toward steady observed service times', () => {
    const st = defaultState('q1');
    for (let i = 0; i < 40; i++) observeService(st, 120); // steady 2-min service
    expect(st.ewmaSec).toBeGreaterThan(110);
    expect(st.ewmaSec).toBeLessThan(130);
    const p = predict({ state: st, queue, aheadCount: 2, openCounters: 1 });
    expect(p.etaMin).toBeLessThan(8); // much lower than the 5-min fallback
  });

  it('self-corrects bias when predictions undershoot reality', () => {
    const st = defaultState('q1');
    st.ewmaSec = 300;
    const before = st.bias;
    // predicted 5 min but actually waited 15 min → bias must rise
    observeOutcome(st, 5, 15 * 60);
    expect(st.bias).toBeGreaterThan(before);
    expect(st.deltas.length).toBe(1);
    expect(st.bias).toBeLessThanOrEqual(2.5);
  });

  it('accuracy stays within 0–100 and improves with consistent errors', () => {
    const st = defaultState('q1');
    expect(accuracyOf(st)).toBeNull();
    seedFromSamples(st, [{ serviceSec: 120, hour: 10 }, { serviceSec: 130, hour: 10 }]);
    observeOutcome(st, 3, 3.2 * 60);
    observeOutcome(st, 3, 2.9 * 60);
    const acc = accuracyOf(st);
    expect(acc).toBeGreaterThanOrEqual(0);
    expect(acc).toBeLessThanOrEqual(100);
    expect(acc).toBeGreaterThan(40);
  });

  it('time-of-day factor is learned and clamped', () => {
    const st = defaultState('q1');
    st.ewmaSec = 100;
    observeService(st, 400, 11); // 11:00 is 4× slower
    expect(st.tod['11']).toBeGreaterThan(1);
    expect(st.tod['11']).toBeLessThanOrEqual(2.2);
  });
});
