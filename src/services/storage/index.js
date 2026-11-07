import { MongoRestAdapter } from './restAdapter';
import { DexieStorageAdapter } from './dexieAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import { StorageAdapter } from './StorageAdapter';

/**
 * Adapter factory — Q-Mate 2.0 now has a real persistence tier:
 *   1. MongoDB Atlas via the Express data API (cloud, shared across every
 *      device and browser — the primary store),
 *   2. IndexedDB (Dexie) — automatic offline fallback when the API or
 *      Atlas cannot be reached,
 *   3. localStorage — last resort for blocked environments.
 * The rest of the app imports `storage` and never cares which engine is
 * underneath.
 */
export const storage = new MongoRestAdapter();

export async function initStorage() {
  try {
    await storage.init();
    return true;
  } catch (err) {
    console.error('[storage] init failed', err);
    return false;
  }
}

export { StorageAdapter, MongoRestAdapter, DexieStorageAdapter, LocalStorageAdapter };
