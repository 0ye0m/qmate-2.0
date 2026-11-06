import { describe, it, expect, beforeEach } from 'vitest';
import { joinQueue, callNext, completeToken, liveQueueStats, leaveQueue } from '../../services/queue/queueService';
import { storage } from '../../services/storage';
import { TOKEN_STATUS, QUEUE_STATUS } from '../../utils/constants';
import { freshDb, seedUser, seedQueue, addWaitingToken } from '../helpers';

describe('token service — concurrency safety & slot limits', () => {
  beforeEach(freshDb);

  it('issues unique sequential token numbers starting at 101 under parallel joins', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 1, maxSlots: 50 });
    const users = await Promise.all([seedUser(1), seedUser(2), seedUser(3), seedUser(4), seedUser(5)]);

    // 5 tabs joining simultaneously — the lock + transaction must serialize
    const tokens = await Promise.all(
      users.map((u) => joinQueue({ queueId: queue.id, user: u, opts: { remote: true } }))
    );

    const numbers = tokens.map((t) => t.number).sort((a, b) => a - b);
    expect(numbers).toEqual([101, 102, 103, 104, 105]);
    expect(new Set(tokens.map((t) => t.id)).size).toBe(5);
    const stats = await liveQueueStats(queue.id);
    expect(stats.slotsUsed).toBe(5);
  });

  it('rejects a second token in the same queue for the same user', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin);
    const user = await seedUser(1);
    await joinQueue({ queueId: queue.id, user, opts: {} });
    await expect(joinQueue({ queueId: queue.id, user, opts: {} })).rejects.toMatchObject({
      code: 'ALREADY_IN_QUEUE',
    });
  });

  it('auto-pauses at maxSlots and rejects further joins with QUEUE_FULL', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { maxSlots: 10 });
    const joiners = [];
    for (let i = 1; i <= 10; i++) joiners.push(seedUser(i));
    const users = await Promise.all(joiners);
    await Promise.all(users.map((u) => joinQueue({ queueId: queue.id, user: u, opts: {} })));

    const late = await seedUser(11);
    await expect(joinQueue({ queueId: queue.id, user: late, opts: {} })).rejects.toMatchObject({
      code: 'QUEUE_FULL',
    });
    const q = await storage.get('queues', queue.id);
    expect(q.status).toBe(QUEUE_STATUS.PAUSED);
    expect(q.pausedReason).toBe('full');
  });

  it('auto-resumes after a completion frees a slot', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { maxSlots: 10 });
    const users = await Promise.all([seedUser(1), seedUser(2), seedUser(3)]);
    const tokens = await Promise.all(users.map((u) => joinQueue({ queueId: queue.id, user: u, opts: {} })));

    await callNext(admin, queue.id, null); // 101 → called
    const after = await storage.get('queues', queue.id);
    // 3 tokens, 10 slots — was never full, so still active
    expect(after.status).toBe(QUEUE_STATUS.ACTIVE);

    await completeToken(admin, tokens[0].id);
    const tok = await storage.get('tokens', tokens[0].id);
    expect(tok.status).toBe(TOKEN_STATUS.COMPLETED);
    expect(tok.serviceSeconds).toBeGreaterThanOrEqual(0);
    const counters = await storage.table('counters').where('queueId').equals(queue.id).toArray();
    expect(counters.every((c) => !c.currentTokenId)).toBe(true);
  });

  it('multi-counter Call Next fills free counters and never double-books one', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 2 });
    const users = await Promise.all([seedUser(1), seedUser(2), seedUser(3)]);
    await Promise.all(users.map((u) => joinQueue({ queueId: queue.id, user: u, opts: {} })));

    const first = await callNext(admin, queue.id, null);
    const second = await callNext(admin, queue.id, null);
    expect(first.counter.id).not.toBe(second.counter.id);
    await expect(callNext(admin, queue.id, null)).rejects.toMatchObject({ code: 'NO_FREE_COUNTER' });

    const counters = await storage.table('counters').where('queueId').equals(queue.id).toArray();
    const busy = counters.filter((c) => c.currentTokenId);
    expect(busy.length).toBe(2);
  });

  it('leaveQueue frees the slot and cancels the token', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin);
    const user = await seedUser(1);
    const token = await joinQueue({ queueId: queue.id, user, opts: {} });
    await leaveQueue(token.id, user.id);
    const tk = await storage.get('tokens', token.id);
    expect(tk.status).toBe(TOKEN_STATUS.CANCELLED);
    const stats = await liveQueueStats(queue.id);
    expect(stats.slotsUsed).toBe(0);
  });

  it('the localStorage mutex fallback also serializes parallel joins', async () => {
    // jsdom has no navigator.locks → withLock uses the localStorage spin-lock
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 1 });
    const users = await Promise.all([seedUser(1), seedUser(2), seedUser(3), seedUser(4)]);
    const tokens = await Promise.all(users.map((u) => joinQueue({ queueId: queue.id, user: u, opts: {} })));
    const numbers = tokens.map((t) => t.number).sort((a, b) => a - b);
    expect(numbers).toEqual([101, 102, 103, 104]);
  });
});
