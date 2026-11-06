import { TABLES } from './db';
import { StorageAdapter } from './StorageAdapter';

/**
 * localStorage fallback for browsers without IndexedDB (rare, private-mode
 * edge cases). Transaction is best-effort snapshot/rollback — good enough
 * for the fallback path; Dexie remains the primary engine.
 */
export class LocalStorageAdapter extends StorageAdapter {
  kind = 'localstorage';

  _key(table) {
    return `qmate-ls:${table}`;
  }

  _read(table) {
    try {
      return JSON.parse(localStorage.getItem(this._key(table)) || '[]');
    } catch {
      return [];
    }
  }

  _write(table, rows) {
    localStorage.setItem(this._key(table), JSON.stringify(rows));
  }

  async init() {
    return true;
  }

  async get(table, key) {
    return this._read(table).find((r) => r.id === key || r.key === key);
  }

  async getAll(table) {
    return this._read(table);
  }

  async put(table, entity) {
    const rows = this._read(table);
    const idx = rows.findIndex((r) => (r.id ?? r.key) === (entity.id ?? entity.key));
    if (idx >= 0) rows[idx] = entity;
    else rows.push(entity);
    this._write(table, rows);
    return entity.id ?? entity.key;
  }

  async bulkPut(table, entities) {
    this._write(table, entities);
    return entities.map((e) => e.id ?? e.key);
  }

  async delete(table, key) {
    this._write(
      table,
      this._read(table).filter((r) => (r.id ?? r.key) !== key)
    );
  }

  async count(table) {
    return this._read(table).length;
  }

  async transaction(tableNames, fn) {
    const snapshots = new Map();
    for (const t of tableNames) snapshots.set(t, JSON.stringify(this._read(t)));
    try {
      return await fn(null);
    } catch (err) {
      for (const [t, snap] of snapshots) {
        try {
          localStorage.setItem(this._key(t), snap);
        } catch {
          /* best effort rollback */
        }
      }
      throw err;
    }
  }

  table(name) {
    const self = this;
    return {
      name,
      get: (k) => self.get(name, k),
      toArray: () => self.getAll(name),
      put: (o) => self.put(name, o),
      bulkPut: (arr) => self.bulkPut(name, arr),
      delete: (k) => self.delete(name, k),
      count: () => self.count(name),
      where: () => {
        throw new Error('LocalStorageAdapter.table().where() unsupported — use getAll + filter');
      },
    };
  }

  raw() {
    return { tables: TABLES, adapter: this };
  }
}

export default LocalStorageAdapter;
