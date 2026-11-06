/**
 * AI health metrics store — mirrored from the Gemini client after each call.
 * Powers the admin "AI Health" panel. Never contains key values.
 */
import { create } from 'zustand';
import { STORAGE_KEYS } from '../utils/constants';

const EMPTY = {
  callsMade: 0,
  cacheHits: 0,
  failures: 0,
  cooldowns: 0,
  lastLatencyMs: null,
  lastError: null,
  byKey: [],
};

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.AI_STATS) || 'null');
    if (raw && typeof raw === 'object') return { ...EMPTY, ...raw };
  } catch {
    /* corrupted — reset */
  }
  return { ...EMPTY };
}

export const useAiStore = create((set, get) => ({
  snapshot: loadStats(),
  mode: 'off',
  model: 'gemini-2.5-flash',

  /** Called by geminiClient after every request/miss. */
  sync(snapshot, mode, model) {
    try {
      localStorage.setItem(STORAGE_KEYS.AI_STATS, JSON.stringify(snapshot));
    } catch {
      /* quota */
    }
    set({ snapshot, mode, model });
  },

  reset() {
    try {
      localStorage.removeItem(STORAGE_KEYS.AI_STATS);
    } catch {
      /* ignore */
    }
    set({ snapshot: { ...EMPTY } });
  },

  get snapshotNow() {
    return get().snapshot;
  },
}));
