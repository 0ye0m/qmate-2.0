import { storage } from '../services/storage';
import { register } from '../services/auth/authService';
import { createQueue } from '../services/queue/queueService';
import { resetDb } from '../services/storage/db';
import { uid } from '../utils/id';
import { TOKEN_STATUS } from '../utils/constants';

export async function freshDb() {
  await resetDb();
  if (typeof localStorage !== 'undefined') localStorage.clear();
}

export async function seedUser(idx = 0) {
  const { user } = await register({
    name: `Test User ${idx}`,
    email: `user${idx}@test.local`,
    password: 'Password1',
    department: 'CSE',
    year: 2,
  });
  return user;
}

export async function seedQueue(actor, overrides = {}) {
  return createQueue(actor, {
    name: 'Exam Form Queue',
    department: 'CSE',
    countersCount: 1,
    maxSlots: 50,
    serviceWindow: { from: '09:00', to: '17:00' },
    avgServiceMin: 2,
    requiredDocs: ['College ID'],
    ...overrides,
  });
}

export async function addWaitingToken(queue, user, number, extra = {}) {
  const token = {
    id: uid('tok-'),
    code: `${queue.code}-${number}`,
    number,
    queueId: queue.id,
    queueName: queue.name,
    userId: user.id,
    department: user.department || 'CSE',
    year: user.year || 1,
    status: TOKEN_STATUS.WAITING,
    priority: 'none',
    priorityVerified: false,
    issuedAt: Date.now() - number * 60000,
    calledAt: null,
    servingSince: null,
    completedAt: null,
    counterId: null,
    waitSeconds: null,
    serviceSeconds: null,
    predictedWaitMin: 5,
    joinedRemote: false,
    prebookId: null,
    stepAwayUntil: 0,
    arrived: false,
    ...extra,
  };
  await storage.put('tokens', token);
  return token;
}
