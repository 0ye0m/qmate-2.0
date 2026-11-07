import { STORAGE_KEYS } from '../../utils/constants';
import { uid } from '../../utils/id';

/**
 * EventBus — the realtime backbone (event-driven, no polling loops).
 *
 * Every mutation publishes a typed event. Delivery channels:
 *   1. BroadcastChannel → instant delivery to every other tab of this app.
 *   2. localStorage `storage` event → fallback for browsers without BC.
 *   3. Local in-tab dispatch → same-tab subscribers fire immediately.
 *
 * Subscribers never poll; they react. Swap in a WebSocket bus later and the
 * UI code does not change.
 */

export const EVENTS = {
  TOKEN_ISSUED: 'TOKEN_ISSUED',
  TOKEN_CALLED: 'TOKEN_CALLED',
  TOKEN_SERVING: 'TOKEN_SERVING',
  TOKEN_COMPLETED: 'TOKEN_COMPLETED',
  TOKEN_SKIPPED: 'TOKEN_SKIPPED',
  TOKEN_NO_SHOW: 'TOKEN_NO_SHOW',
  TOKEN_RECALLED: 'TOKEN_RECALLED',
  TOKEN_CANCELLED: 'TOKEN_CANCELLED',
  TOKEN_UPDATED: 'TOKEN_UPDATED',
  QUEUE_CREATED: 'QUEUE_CREATED',
  QUEUE_UPDATED: 'QUEUE_UPDATED',
  QUEUE_STATUS: 'QUEUE_STATUS',
  QUEUE_PAUSED: 'QUEUE_PAUSED',
  QUEUE_RESUMED: 'QUEUE_RESUMED',
  QUEUE_CLOSED: 'QUEUE_CLOSED',
  COUNTER_OPENED: 'COUNTER_OPENED',
  COUNTER_CLOSED: 'COUNTER_CLOSED',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  PREBOOK_CREATED: 'PREBOOK_CREATED',
  PREBOOK_CANCELLED: 'PREBOOK_CANCELLED',
  FEEDBACK_ADDED: 'FEEDBACK_ADDED',
  USER_UPDATED: 'USER_UPDATED',
  DATA_SEEDED: 'DATA_SEEDED',
};

const SUBSCRIBERS = new Set();

class EventBus {
  constructor() {
    this.tabId = uid('tab-');
    this.bc = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('qmate-events-v2');
        this.bc.onmessage = (e) => this._receive(e.data, false);
      }
    } catch {
      this.bc = null;
    }
    this._onStorage = (e) => {
      if (e.key !== STORAGE_KEYS.LAST_EVENT || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue);
        this._receive(msg, false);
      } catch {
        /* ignore malformed */
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this._onStorage);
    }
  }

  /** Publish an event to this tab and all other tabs. */
  publish(type, payload = {}) {
    const msg = { id: uid('ev-'), src: this.tabId, type, payload, ts: Date.now() };
    this._receive(msg, true); // local handlers first — instant same-tab update
    try {
      this.bc?.postMessage(msg);
    } catch {
      /* channel closed */
    }
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_EVENT, JSON.stringify(msg));
    } catch {
      /* quota — non-fatal */
    }
    return msg;
  }

  _receive(msg, isLocal) {
    if (!msg || typeof msg.type !== 'string') return;
    if (!isLocal && msg.src === this.tabId) return; // echo of our own message
    for (const handler of SUBSCRIBERS) {
      try {
        handler(msg);
      } catch (err) {
        console.error('[eventbus] handler failed', err);
      }
    }
  }

  /** Subscribe to all events; returns unsubscribe fn. */
  on(handler) {
    SUBSCRIBERS.add(handler);
    return () => SUBSCRIBERS.delete(handler);
  }

  /** Subscribe to one event type; returns unsubscribe fn. */
  onType(type, handler) {
    const wrapped = (msg) => {
      if (msg.type === type) handler(msg);
    };
    return this.on(wrapped);
  }
}

export const eventBus = new EventBus();
export default eventBus;
