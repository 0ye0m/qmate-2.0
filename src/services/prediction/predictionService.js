/**
 * Prediction state service — persists EWMA/TOD/bias per queue in IndexedDB
 * and exposes student-facing ETA snapshots. All math lives in
 * waitTimeEngine (pure); this module only loads/saves and reads live data.
 */
import { storage } from '../storage';
import { defaultState, predict, observeService, observeOutcome, accuracyOf, seedFromSamples } from './waitTimeEngine';

export async function getState(queueId) {
  const st = await storage.get('predictions', queueId);
  return st || defaultState(queueId);
}

export async function saveState(st) {
  await storage.put('predictions', st);
  return st;
}

/**
 * Live ETA for a would-be joiner or an existing token.
 * @param {object} queue queue record
 * @param {number} aheadCount people ahead (0 if joining now)
 */
export async function predictForQueue(queue, aheadCount, openCounters, now = Date.now()) {
  const st = await getState(queue.id);
  const p = predict({ state: st, queue, aheadCount, openCounters, now });
  return { ...p, accuracyPct: accuracyOf(st) };
}

/** Called by queueService inside completion flow (outside the txn). */
export async function onCompletion(queue, token) {
  if (!token.serviceSeconds) return;
  const st = await getState(queue.id);
  observeService(st, token.serviceSeconds, new Date(token.completedAt || Date.now()).getHours());
  if (token.predictedWaitMin != null && token.waitSeconds != null) {
    observeOutcome(st, token.predictedWaitMin, token.waitSeconds);
  }
  await saveState(st);
  return st;
}

/** Seed engine from history: [{serviceSeconds, hour}] */
export async function seedFromHistory(queueId, samples) {
  const st = seedFromSamples(defaultState(queueId), samples);
  st.samples = samples.length;
  await saveState(st);
  return st;
}

export async function accuracyForQueue(queueId) {
  const st = await getState(queueId);
  return accuracyOf(st);
}
