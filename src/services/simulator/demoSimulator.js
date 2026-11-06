/**
 * DEMO SIMULATOR — makes the campus feel alive during presentations.
 * Admin toggle (stored in uiStore). Every ~7 s it performs realistic random
 * actions THROUGH the transactional queueService, so every tab sees the
 * activity live over the EventBus. Automatically disabled in Eco Mode.
 */
import { storage } from '../storage';
import * as queue from '../queue/queueService';
import { QUEUE_STATUS, TOKEN_STATUS } from '../../utils/constants';
import { mulberry32, pick, randInt, chance } from '../../utils/rng';

const rng = mulberry32(Date.now() % 100000);
let timer = null;
let simUsers = null;

async function loadSimUsers() {
  if (simUsers) return simUsers;
  const users = await storage.getAll('users');
  simUsers = users.filter((u) => u.email?.startsWith('sim') && u.email?.endsWith('@qmate.local'));
  return simUsers;
}

async function tick() {
  try {
    const users = await loadSimUsers();
    if (!users.length) return;
    const queues = (await storage.getAll('queues')).filter((q) => q.status === QUEUE_STATUS.ACTIVE);
    if (!queues.length) return;

    // 1) a new student joins somewhere
    if (chance(rng, 0.75)) {
      const queue = pick(rng, queues);
      const stats = await queue.liveQueueStats(queue.id);
      const waiting = stats.waiting;
      if (stats.slotsUsed < queue.maxSlots - 1 && waiting < 14) {
        const freeUsers = [];
        for (const u of users) {
          // eslint-disable-next-line no-await-in-loop
          const active = await queue.activeTokensForUser(u.id);
          if (!active.length) freeUsers.push(u);
        }
        if (freeUsers.length) {
          const user = pick(rng, freeUsers);
          await queue.joinQueue({
            queueId: queue.id,
            user,
            opts: {
              remote: chance(rng, 0.6),
              priority: chance(rng, 0.08) ? pick(rng, ['differently-abled', 'emergency']) : 'none',
              docsAcknowledged: true,
            },
          });
        }
      }
    }

    // 2) staff calls next on a busy queue
    if (chance(rng, 0.5)) {
      const busy = [];
      for (const q of queues) {
        // eslint-disable-next-line no-await-in-loop
        const stats = await queue.liveQueueStats(q.id);
        if (stats.waiting > 0) busy.push(q);
      }
      if (busy.length) {
        const q = pick(rng, busy);
        try {
          await queue.callNext({ id: 'simulator', email: 'simulator' }, q.id);
        } catch {
          /* no free counter — fine */
        }
      }
    }

    // 3) staff completes a serving token
    if (chance(rng, 0.65)) {
      const all = await storage.getAll('tokens');
      const serving = all.filter((t) => t.status === TOKEN_STATUS.SERVING || (t.status === TOKEN_STATUS.CALLED && t.arrived));
      if (serving.length) {
        const t = pick(rng, serving);
        await queue.completeToken({ id: 'simulator', email: 'simulator' }, t.id);
      }
    }
  } catch (err) {
    console.error('[simulator] tick failed', err);
  }
}

function schedule() {
  const jitter = randInt(rng, -1500, 2500);
  timer = setTimeout(async () => {
    await tick();
    if (timer !== null) schedule();
  }, 7000 + jitter);
}

export function start() {
  if (timer !== null) return false;
  timer = 0; // sentinel while scheduling
  schedule();
  return true;
}

export function stop() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

export function isRunning() {
  return timer !== null;
}
