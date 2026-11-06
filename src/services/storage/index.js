import { DexieStorageAdapter } from './dexieAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import { StorageAdapter } from './StorageAdapter';

/**
 * Adapter factory. Prefers IndexedDB (Dexie); falls back to localStorage
 * when IndexedDB is missing/blocked. The rest of the app imports `storage`
 * and never cares which engine is underneath.
 */
export const storage = (() => {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB !== null) {
      return new DexieStorageAdapter();
    }
  } catch {
    /* fall through */
  }
  return new LocalStorageAdapter();
})();

export async function initStorage() {
  try {
    await storage.init();
    return true;
  } catch (err) {
    console.error('[storage] init failed', err);
    return false;
  }
}

export { StorageAdapter, DexieStorageAdapter, LocalStorageAdapter };
