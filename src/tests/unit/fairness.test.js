import { describe, it, expect } from 'vitest';
import { pickNextToken } from '../../services/queue/fairness';

const tok = (number, priority = 'none') => ({ number, priority });

describe('fairness.pickNextToken (max 1 priority per N standard)', () => {
  it('returns null on an empty queue', () => {
    expect(pickNextToken([], [], 4)).toBeNull();
  });

  it('serves strict FIFO when there is no priority token', () => {
    const waiting = [tok(101), tok(102), tok(103)];
    expect(pickNextToken(waiting, [], 4).number).toBe(101);
  });

  it('sends a priority token first right after the queue opens', () => {
    const waiting = [tok(101), tok(102, 'emergency')];
    expect(pickNextToken(waiting, [], 4).number).toBe(102);
  });

  it('holds priority back until N standard tokens were called', () => {
    const waiting = [tok(106, 'faculty'), tok(107), tok(108)];
    // last call was priority → 0 standards since
    expect(pickNextToken(waiting, [tok(105, 'emergency')], 4).number).toBe(107);
    // 3 standards since last priority → still cooling down
    const warmup = [tok(105), tok(104), tok(103), tok(102, 'emergency')];
    expect(pickNextToken(waiting, warmup, 4).number).toBe(107);
    // 4 standards since last priority → priority earns the head of the line
    const history = [tok(105), tok(104), tok(103), tok(102), tok(101, 'emergency')];
    expect(pickNextToken(waiting, history, 4).number).toBe(106);
  });

  it('falls back to priority when only priority tokens remain', () => {
    const waiting = [tok(108, 'emergency'), tok(109, 'faculty')];
    expect(pickNextToken(waiting, [tok(107)], 4).number).toBe(108);
  });
});
