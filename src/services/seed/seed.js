/**
 * SEED ENGINE — builds a believable 3-day campus on first run:
 * demo accounts, 7 queues with counters, ~300 historical tokens (feeding
 * analytics, prediction EWMA, green stats), live waiting/called tokens,
 * prebooks, feedback, announcements and an audit trail. Deterministic RNG
 * so every demo looks equally good.
 */
import { storage } from '../storage';
import { withLock } from '../concurrency/mutex';
import { hashPassword } from '../auth/password';
import { defaultState, observeService, observeOutcome } from '../prediction/waitTimeEngine';
import { classifyLocally } from '../queue/feedbackService';
import { uid } from '../../utils/id';
import { mulberry32, pick, randInt, chance } from '../../utils/rng';
import {
  SEED_VERSION,
  QUEUE_STATUS,
  TOKEN_STATUS,
  LIVE_TOKEN_STATUSES,
  CALL_GRACE_MS,
  TOKEN_NUMBER_START,
  PRIORITY_TYPES,
} from '../../utils/constants';
import { dateStrOf } from '../../utils/format';
import { SEED_USERS, SEED_QUEUES, NAME_POOL, FEEDBACK_POOL } from './seedData';

const rng = mulberry32(20260206);

function dayStart(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + offsetDays * 86400000;
}

async function createUser(def) {
  const { hash, salt } = await hashPassword(def.password);
  const user = {
    id: uid('usr-'),
    name: def.name,
    email: def.email,
    passHash: hash,
    salt,
    role: def.role,
    department: def.department,
    year: def.year,
    status: 'active',
    failedAttempts: 0,
    lockedUntil: 0,
    greenScore: 0,
    badges: [],
    prefs: { sound: true, travelMinutes: 10 },
    createdAt: dayStart(-9),
    seedKey: def.key,
  };
  await storage.put('users', user);
  return user;
}

function simUser(nameIdx, dept) {
  return {
    id: uid('usr-'),
    name: NAME_POOL[nameIdx % NAME_POOL.length],
    email: `walkin${nameIdx}@example.edu`,
    department: dept,
    year: randInt(rng, 1, 4),
  };
}

/**
 * Generate a queue's history for one day.
 * Returns {samples:[{serviceSec,hour}], tokens:[...], nextNumber}
 */
function generateDayHistory({ queue, counters, dayStartTs, nextNumber, untilTs = null, weights, simUsers, userDirs }) {
  const tokens = [];
  const samples = [];
  let num = nextNumber;
  for (let hour = 9; hour <= 17; hour++) {
    const w = weights[hour - 9] || 0;
    const count = Math.round(w * (0.7 + rng() * 0.6));
    for (let i = 0; i < count; i++) {
      const issuedAt = dayStartTs + hour * 3600000 + randInt(rng, 0, 55) * 60000;
      if (issuedAt > (untilTs || Date.now() - 120000)) continue;
      const waitMin = Math.max(1, Math.round((hour >= 11 && hour <= 14 ? 9 : 4) * (0.5 + rng()) + i * 1.2));
      const serviceMin = Math.max(1, Math.round(queue.avgServiceMin * (0.6 + rng() * 0.9)));
      const calledAt = issuedAt + waitMin * 60000;
      const completedAt = calledAt + serviceMin * 60000;
      if (completedAt > (untilTs || Date.now() - 60000)) continue;
      const counter = pick(rng, counters);
      const owner = pick(rng, simUsers);
      const status = chance(rng, 0.06) ? TOKEN_STATUS.NO_SHOW : TOKEN_STATUS.COMPLETED;
      const token = {
        id: uid('tok-'),
        code: `${queue.code}-${num}`,
        number: num,
        queueId: queue.id,
        queueName: queue.name,
        userId: owner ? owner.id : simUser(randInt(rng, 0, 19), pick(rng, userDirs)).id,
        department: pick(rng, userDirs),
        year: randInt(rng, 1, 4),
        status,
        priority: chance(rng, 0.05) ? pick(rng, PRIORITY_TYPES.slice(1)) : 'none',
        priorityVerified: chance(rng, 0.7),
        issuedAt,
        calledAt: status === TOKEN_STATUS.COMPLETED ? calledAt : null,
        servingSince: null,
        completedAt: status === TOKEN_STATUS.COMPLETED ? completedAt : null,
        counterId: status === TOKEN_STATUS.COMPLETED ? counter.id : null,
        waitSeconds: status === TOKEN_STATUS.COMPLETED ? waitMin * 60 : null,
        serviceSeconds: status === TOKEN_STATUS.COMPLETED ? serviceMin * 60 : null,
        predictedWaitMin: status === TOKEN_STATUS.COMPLETED ? Math.round(waitMin * (0.75 + rng() * 0.5)) : null,
        joinedRemote: chance(rng, 0.6),
        prebookId: null,
        stepAwayUntil: 0,
        arrived: status === TOKEN_STATUS.COMPLETED,
        graceUntil: null,
      };
      tokens.push(token);
      if (status === TOKEN_STATUS.COMPLETED) {
        samples.push({ serviceSec: serviceMin * 60, hour });
      }
      num += 1;
    }
  }
  return { tokens, samples, nextNumber: num };
}

/**
 * Seed on first run. Returns true when a fresh seed was written.
 * Idempotent + concurrency-safe: guarded by meta.seedVersion AND a
 * module-level in-flight promise + cross-tab lock (React StrictMode and
 * multi-tab first loads must never double-seed).
 */
let seedPromise = null;

export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = withLock('campus-seed', async () => {
      const existing = await storage.get('meta', 'seedVersion');
      if (existing?.value === SEED_VERSION) return false;
      return seedNow();
    }).catch((err) => {
      seedPromise = null; // allow a retry on failure
      throw err;
    });
  }
  return seedPromise;
}

async function seedNow() {

  // wipe for a clean rebuild (handles version upgrades too)
  for (const table of ['users', 'sessions', 'queues', 'tokens', 'counters', 'prebooks', 'feedback', 'announcements', 'auditLog', 'predictions']) {
    await storage.table(table).clear();
  }

  // 1) accounts
  const users = {};
  for (const def of SEED_USERS) {
    users[def.key] = await createUser(def);
  }
  const simUsers = SEED_USERS.filter((u) => u.key.startsWith('sim')).map((u) => users[u.key]);
  const userDirs = ['CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'MBA'];

  // 2) queues + counters
  const queues = [];
  for (const def of SEED_QUEUES) {
    const status = def.key === 'lab' ? QUEUE_STATUS.SCHEDULED : QUEUE_STATUS.ACTIVE;
    const q = {
      id: uid('q-'),
      code: def.code,
      name: def.name,
      department: def.department,
      description: def.description.trim(),
      status,
      countersCount: def.countersCount,
      maxSlots: def.maxSlots,
      serviceWindow: def.serviceWindow,
      scheduledFor: def.scheduledFor === 'tomorrow' ? dayStart(1) : null,
      avgServiceMin: def.avgServiceMin,
      requiredDocs: def.requiredDocs,
      priorityRatio: 4,
      pausedReason: null,
      createdAt: dayStart(-8),
      createdBy: users.admin.id,
    };
    await storage.put('queues', q);
    for (let i = 0; i < def.countersCount; i++) {
      await storage.put('counters', {
        id: uid('cnt-'),
        queueId: q.id,
        label: `Counter ${i + 1}`,
        status: 'open',
        currentTokenId: null,
        servingSince: null,
        servedCount: 0,
        createdAt: dayStart(-8),
      });
    }
    queues.push({ def, q });
  }

  // 3) history for the last 2 days + today, live tokens for today
  const now = Date.now();
  for (const { def, q } of queues) {
    const counters = await storage.table('counters').where('queueId').equals(q.id).toArray();
    const allTokens = [];
    const allSamples = [];
    let nextNumber = TOKEN_NUMBER_START;

    for (const offset of [-2, -1]) {
      const day = generateDayHistory({
        queue: q,
        counters,
        dayStartTs: dayStart(offset),
        nextNumber,
        weights: def.hourlyWeights,
        simUsers,
        userDirs,
      });
      allTokens.push(...day.tokens);
      allSamples.push(...day.samples);
      nextNumber = day.nextNumber;
    }
    // today (partial, only up to a couple of minutes ago)
    const today = generateDayHistory({
      queue: q,
      counters,
      dayStartTs: dayStart(0),
      nextNumber,
      untilTs: now - 120000,
      weights: def.hourlyWeights,
      simUsers,
      userDirs,
    });
    allTokens.push(...today.tokens);
    allSamples.push(...today.samples);
    nextNumber = today.nextNumber;

    if (allTokens.length) await storage.bulkPut('tokens', allTokens);

    // 4) prediction state from history: EWMA + learned per-hour factors +
    //    a realistic prediction-error record so the accuracy KPI is live
    try {
      const st = defaultState(q.id);
      for (const s of allSamples) observeService(st, s.serviceSec, s.hour);
      const completed = allTokens
        .filter((t) => t.status === TOKEN_STATUS.COMPLETED && t.predictedWaitMin != null && t.waitSeconds != null)
        .slice(-50);
      for (const t of completed) observeOutcome(st, t.predictedWaitMin, t.waitSeconds);
      st.samples = allSamples.length;
      st.updatedAt = Date.now();
      await storage.put('predictions', st);
    } catch (err) {
      console.error('[seed] prediction seeding failed', err);
    }

    // 5) live tokens so the board is alive on first open
    if (q.status === QUEUE_STATUS.ACTIVE) {
      const liveCount = randInt(rng, 4, 7);
      const live = [];
      for (let i = 0; i < liveCount; i++) {
        const owner = pick(rng, simUsers);
        live.push({
          id: uid('tok-'),
          code: `${q.code}-${nextNumber}`,
          number: nextNumber,
          queueId: q.id,
          queueName: q.name,
          userId: owner.id,
          department: owner.department,
          year: owner.year,
          status: TOKEN_STATUS.WAITING,
          priority: chance(rng, 0.07) ? 'differently-abled' : 'none',
          priorityVerified: false,
          issuedAt: now - randInt(rng, 2, 45) * 60000 - i * 60000,
          calledAt: null,
          servingSince: null,
          completedAt: null,
          counterId: null,
          waitSeconds: null,
          serviceSeconds: null,
          predictedWaitMin: randInt(rng, 6, 18),
          joinedRemote: chance(rng, 0.6),
          prebookId: null,
          stepAwayUntil: 0,
          arrived: false,
        });
        nextNumber += 1;
      }
      await storage.bulkPut('tokens', live);

      // first counter: one token already called (grace running), maybe one serving
      const firstCounter = counters[0];
      if (live[0] && firstCounter) {
        const calledPatch = {
          status: TOKEN_STATUS.CALLED,
          counterId: firstCounter.id,
          calledAt: now - 40000,
          graceUntil: now - 40000 + CALL_GRACE_MS + 60000,
          waitSeconds: Math.round((now - 40000 - live[0].issuedAt) / 1000),
        };
        await storage.table('tokens').update(live[0].id, calledPatch);
        await storage.table('counters').update(firstCounter.id, {
          status: 'serving',
          currentTokenId: live[0].id,
          servingSince: now - 40000,
        });
      }
      const secondCounter = counters[1];
      if (secondCounter && live[1] && chance(rng, 0.7)) {
        await storage.table('tokens').update(live[1].id, {
          status: TOKEN_STATUS.SERVING,
          counterId: secondCounter.id,
          calledAt: now - 300000,
          servingSince: now - 240000,
          arrived: true,
          waitSeconds: 300,
        });
        await storage.table('counters').update(secondCounter.id, {
          status: 'serving',
          currentTokenId: live[1].id,
          servingSince: now - 240000,
        });
      }
    }
  }

  // 6) prebooks: the demo student has one tomorrow (Exam Cell, off-peak)
  const examQ = queues.find((x) => x.def.key === 'exf')?.q;
  if (examQ) {
    const tomorrow = dateStrOf(dayStart(1)); // local calendar date (never UTC-shifted)
    await storage.put('prebooks', {
      id: uid('pb-'),
      queueId: examQ.id,
      queueName: examQ.name,
      userId: users.student.id,
      date: tomorrow,
      time: '11:00',
      status: 'booked',
      offpeak: true,
      createdAt: now,
    });
  }
  const todayStr = dateStrOf(dayStart(0));
  const feeQ = queues.find((x) => x.def.key === 'fee')?.q;
  if (feeQ) {
    for (let i = 0; i < 3; i++) {
      await storage.put('prebooks', {
        id: uid('pb-'),
        queueId: feeQ.id,
        queueName: feeQ.name,
        userId: pick(rng, simUsers).id,
        date: todayStr,
        time: pick(rng, ['10:00', '10:30', '11:30', '12:00']),
        status: 'booked',
        offpeak: i === 0,
        createdAt: now - i * 3600000,
      });
    }
  }

  // 7) feedback on some of yesterday's completed tokens
  const yesterdayTokens = (await storage.getAll('tokens')).filter(
    (t) => t.status === TOKEN_STATUS.COMPLETED && t.completedAt && t.completedAt < now - 6 * 3600000 && t.completedAt > dayStart(-2)
  );
  const seen = new Set();
  for (let i = 0; i < 12 && i < yesterdayTokens.length; i++) {
    const t = pick(rng, yesterdayTokens);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    const sample = pick(rng, FEEDBACK_POOL);
    const local = classifyLocally(sample.comment, sample.rating);
    await storage.put('feedback', {
      id: uid('fb-'),
      tokenId: t.id,
      queueId: t.queueId,
      userId: t.userId,
      rating: sample.rating,
      comment: sample.comment,
      sentiment: local.sentiment,
      theme: local.theme,
      aiRefined: false,
      createdAt: t.completedAt + 600000,
    });
  }

  // 8) announcements
  const feeQueue = queues.find((x) => x.def.key === 'fee')?.q;
  if (feeQueue) {
    await storage.put('announcements', {
      id: uid('ann-'),
      queueId: feeQueue.id,
      severity: 'warning',
      messageEn: 'Counter 2 will be closed for lunch between 13:00 and 13:45. Counter 1 and 3 remain open.',
      messageHi: 'काउंटर 2 दोपहर 13:00 से 13:45 तक भोजन अवकाश के लिए बंद रहेगा। काउंटर 1 और 3 खुले रहेंगे।',
      messageMr: 'काउंटर 2 दुपारी 1:00 ते 1:45 पर्यंत जेवणाच्या सुट्टीसाठी बंद राहील. काउंटर 1 आणि 3 सुरू राहतील.',
      createdBy: users.admin.id,
      createdAt: now - 2 * 3600000,
    });
  }
  const bonQueue = queues.find((x) => x.def.key === 'bon')?.q;
  if (bonQueue) {
    await storage.put('announcements', {
      id: uid('ann-'),
      queueId: bonQueue.id,
      severity: 'info',
      messageEn: 'Bonafide applications need the fee receipt photocopy — keep it ready to avoid re-queueing.',
      messageHi: 'बोनाफाइड हेतु फीस रसीद की फोटोकॉपी अनिवार्य है — तैयाद रखें।',
      messageMr: 'बोनाफाइडसाठी फी पावतीची झेरॉक्स आवश्यक आहे — तयार ठेवा.',
      createdBy: users.admin.id,
      createdAt: now - 5 * 3600000,
    });
  }

  // 9) audit trail + seed stamp
  await storage.put('auditLog', {
    id: uid('aud-'),
    ts: now,
    actorId: users.admin.id,
    actorEmail: users.admin.email,
    action: 'queue.create',
    targetType: 'queue',
    targetId: queues[0]?.q.id || 'seed',
    details: { seeded: `${queues.length} queues, ${SEED_USERS.length}+ accounts` },
  });
  await storage.put('meta', { key: 'seedVersion', value: SEED_VERSION });
  return true;
}
