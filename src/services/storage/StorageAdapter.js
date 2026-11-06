/**
 * StorageAdapter — the ONLY data-access contract in Q-Mate 2.0.
 *
 * The whole UI talks to this interface, never to Dexie directly. Today it is
 * implemented over IndexedDB (Dexie) with a localStorage fallback; swapping
 * in `RestStorageAdapter` that implements the same methods over HTTP is the
 * entire migration path to a real backend — zero UI changes required.
 *
 * Contract:
 *   init()                       → prepare storage (idempotent)
 *   get(table, key)              → entity | undefined
 *   getAll(table)                → entity[]
 *   put(table, entity)           → key
 *   bulkPut(table, entities[])   → keys[]
 *   delete(table, key)           → void
 *   count(table)                 → number
 *   transaction(tables[], fn)    → fn() result (atomic on Dexie)
 *   table(name)                  → raw queryable handle (Dexie Table)
 *   raw()                        → underlying engine (escape hatch)
 */
export class StorageAdapter {
  async init() {
    throw new Error('StorageAdapter.init() not implemented');
  }
  async get() {
    throw new Error('StorageAdapter.get() not implemented');
  }
  async getAll() {
    throw new Error('StorageAdapter.getAll() not implemented');
  }
  async put() {
    throw new Error('StorageAdapter.put() not implemented');
  }
  async bulkPut() {
    throw new Error('StorageAdapter.bulkPut() not implemented');
  }
  async delete() {
    throw new Error('StorageAdapter.delete() not implemented');
  }
  async count() {
    throw new Error('StorageAdapter.count() not implemented');
  }
  async transaction() {
    throw new Error('StorageAdapter.transaction() not implemented');
  }
  table() {
    throw new Error('StorageAdapter.table() not implemented');
  }
  raw() {
    throw new Error('StorageAdapter.raw() not implemented');
  }
}

export default StorageAdapter;
