/**
 * QUEUE STORE — shared live snapshot (queues + stats, my tokens,
 * announcements). Event-driven refresh with trailing throttle: EventBus
 * events trigger targeted reloads, never timers.
 */
import { create } from 'zustand';
import { eventBus, EVENTS } from '../services/realtime/EventBus';
import * as queueService from '../services/queue/queueService';
import { recent as recentAnnouncements } from '../services/queue/announcementService';
import { useAuthStore } from './authStore';
import { storage } from '../services/storage';

const RELEVANT = new Set([
  EVENTS.TOKEN_ISSUED,
  EVENTS.TOKEN_CALLED,
  EVENTS.TOKEN_SERVING,
  EVENTS.TOKEN_COMPLETED,
  EVENTS.TOKEN_SKIPPED,
  EVENTS.TOKEN_NO_SHOW,
  EVENTS.TOKEN_RECALLED,
  EVENTS.TOKEN_CANCELLED,
  EVENTS.TOKEN_UPDATED,
  EVENTS.QUEUE_CREATED,
  EVENTS.QUEUE_UPDATED,
  EVENTS.QUEUE_STATUS,
  EVENTS.QUEUE_PAUSED,
  EVENTS.QUEUE_RESUMED,
  EVENTS.QUEUE_CLOSED,
  EVENTS.COUNTER_OPENED,
  EVENTS.COUNTER_CLOSED,
  EVENTS.PREBOOK_CREATED,
  EVENTS.PREBOOK_CANCELLED,
  EVENTS.FEEDBACK_ADDED,
  EVENTS.ANNOUNCEMENT,
  EVENTS.DATA_SEEDED,
]);

let refreshTimer = null;
let pending = { queues: false, mine: false, announcements: false };
let unsubEvents = null;
let cloudPollTimer = null;
const CLOUD_POLL_MS = 10000;

export const useQueueStore = create((set, get) => ({
  queues: [],
  stats: {}, // queueId → {waiting, called, serving, slotsUsed, etaMin, bandMin, openCounters}
  myTokens: [],
  announcements: [],
  version: 0,
  loaded: false,

  async loadQueues() {
    try {
      const queues = await queueService.listQueues();
      const stats = {};
      await Promise.all(
        queues.map(async (q) => {
          try {
            stats[q.id] = await queueService.queueEta(q);
          } catch {
            stats[q.id] = { waiting: 0, called: 0, serving: 0, slotsUsed: 0, etaMin: null, bandMin: 0, openCounters: 1 };
          }
        })
      );
      set({ queues, stats, loaded: true, version: get().version + 1 });
    } catch (err) {
      console.error('[queueStore] loadQueues failed', err);
      set({ loaded: true });
    }
  },

  async loadMyTokens() {
    const user = useAuthStore.getState().user;
    if (!user) {
      set({ myTokens: [] });
      return;
    }
    try {
      const myTokens = await queueService.activeTokensForUser(user.id);
      set({ myTokens, version: get().version + 1 });
    } catch (err) {
      console.error('[queueStore] loadMyTokens failed', err);
    }
  },

  async loadAnnouncements() {
    try {
      const announcements = await recentAnnouncements(null, 15);
      set({ announcements });
    } catch (err) {
      console.error('[queueStore] announcements failed', err);
    }
  },

  async refresh({ queues = true, mine = true, announcements = false } = {}) {
    const jobs = [];
    if (queues) jobs.push(get().loadQueues());
    if (mine) jobs.push(get().loadMyTokens());
    if (announcements) jobs.push(get().loadAnnouncements());
    await Promise.all(jobs);
  },

  /** Called by the app-level event subscription. */
  handleEvent(msg) {
    if (!RELEVANT.has(msg.type)) return;
    pending.queues = true;
    pending.mine = true;
    if (msg.type === EVENTS.ANNOUNCEMENT) pending.announcements = true;
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const todo = { ...pending };
      pending = { queues: false, mine: false, announcements: false };
      get().refresh(todo);
    }, 120);
  },

  reset() {
    set({ queues: [], stats: {}, myTokens: [], announcements: [], loaded: false });
  },
}));

/** Attach/detach the global event listener once the user is known.
 *  Cloud mode (MongoDB Atlas): BroadcastChannel only reaches tabs in this
 *  browser, so a gentle poll folds in actions taken on other devices.
 *  Local Dexie mode stays purely event-driven. */
export function bindQueueStore() {
  if (unsubEvents) unsubEvents();
  // ANNOUNCEMENT is part of RELEVANT — one subscription handles every event.
  unsubEvents = eventBus.on((msg) => {
    useQueueStore.getState().handleEvent(msg);
  });
  if (storage.kind === 'mongodb' && !cloudPollTimer && typeof document !== 'undefined') {
    cloudPollTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      useQueueStore
        .getState()
        .refresh({ queues: true, mine: true, announcements: true })
        .catch(() => {});
    }, CLOUD_POLL_MS);
  }
  return () => {
    if (unsubEvents) unsubEvents();
    unsubEvents = null;
  };
}
