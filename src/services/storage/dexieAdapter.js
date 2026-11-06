import { getDb } from './db';
import { StorageAdapter } from './StorageAdapter';

/** Dexie (IndexedDB) implementation of the StorageAdapter contract. */
export class DexieStorageAdapter extends StorageAdapter {
  kind = 'indexeddb';

  async init() {
    const db = getDb();
    await db.open();
    return true;
  }

  async get(table, key) {
    return getDb().table(table).get(key);
  }

  async getAll(table) {
    return getDb().table(table).toArray();
  }

  async put(table, entity) {
    return getDb().table(table).put(entity);
  }

  async bulkPut(table, entities) {
    return getDb().table(table).bulkPut(entities);
  }

  async delete(table, key) {
    return getDb().table(table).delete(key);
  }

  async count(table) {
    return getDb().table(table).count();
  }

  /**
   * Atomic transaction across the named tables. `fn` receives the Dexie
   * transaction handle. Dexie auto-commits on resolve, rolls back on throw.
   */
  async transaction(tableNames, fn) {
    const db = getDb();
    const tables = tableNames.map((t) => db.table(t));
    return db.transaction('rw', tables, async (tx) => fn(tx));
  }

  table(name) {
    return getDb().table(name);
  }

  raw() {
    return getDb();
  }
}

export default DexieStorageAdapter;
