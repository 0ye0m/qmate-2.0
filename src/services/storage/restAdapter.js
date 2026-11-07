/**
 * MongoRestStorageAdapter — the StorageAdapter contract over HTTP,
 * backed by MongoDB Atlas through the Express data API (server/index.js).
 *
 * The rest of the app cannot tell the difference between this and the
 * Dexie adapter — same methods, same table handles, same transaction
 * semantics:
 *
 *   • Boot: GET /api/db/health ping (3 tries). If the API / Atlas is
 *     unreachable, transparently falls back to IndexedDB (Dexie) so the
 *     app stays 100% functional offline.
 *   • table() returns a Dexie-shaped handle:
 *       where('f').equals(v) → toArray() / first()
 *       where('[a+b]').equals([va, vb])            (compound filters)
 *       orderBy('f')[.reverse()][.limit(n)].toArray()
 *       get / put / bulkPut / update / delete / clear / count / toArray
 *   • transaction(tables, fn) buffers writes client-side with a
 *     read-your-writes overlay, then commits the whole op list as ONE
 *     atomic multi-document MongoDB transaction.
 */
import { DexieStorageAdapter } from './dexieAdapter';
import { StorageAdapter } from './StorageAdapter';

const BASE = '/api/db';
const PK = { sessions: 'token', meta: 'key' };
const pkOf = (t) => PK[t] || 'id';

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('DATA_API_UNREACHABLE');
  }
  if (!res.ok) {
    let msg = `DATA_API_${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = b.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Build a query string; `eq` is always JSON-encoded so scalars and
 *  compound arrays survive the round trip identically. */
function buildQs(p) {
  const u = new URLSearchParams();
  if (p.where != null) u.set('where', p.where);
  if (p.eq !== undefined) u.set('eq', JSON.stringify(p.eq));
  if (p.orderBy) u.set('orderBy', p.orderBy);
  if (p.dir) u.set('dir', p.dir);
  if (p.limit != null) u.set('limit', String(p.limit));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export class MongoRestAdapter extends StorageAdapter {
  kind = 'mongodb';
  _fallback = null;
  _tx = null;

  constructor(...args) {
    super(...args);
    // Deterministic non-browser environments (unit tests / SSR) start on
    // Dexie immediately — there is no data API to reach there.
    const isTest =
      typeof process !== 'undefined' &&
      Boolean(process.env?.VITEST || process.env?.NODE_ENV === 'test');
    if (isTest) {
      this._fallback = new DexieStorageAdapter();
      this.kind = this._fallback.kind;
    }
  }

  /* ── boot ─────────────────────────────────────────────────────────── */

  async init() {
    if (this._fallback) return this._fallback.init();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 2500) : null;
        try {
          const res = await fetch(`${BASE}/health`, { signal: ctl ? ctl.signal : undefined });
          const body = await res.json();
          if (body?.ok && body?.storage === 'mongodb') {
            console.info(`[storage] MongoDB Atlas connected via data API → db "${body.db}"`);
            return true;
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        /* retry, then fall back */
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    console.info('[storage] data API unreachable — falling back to IndexedDB (Dexie)');
    this._fallback = new DexieStorageAdapter();
    this.kind = this._fallback.kind;
    return this._fallback.init();
  }

  /* ── transaction plumbing (read-your-writes overlay + op buffer) ──── */

  _scope(table) {
    if (!this._tx) return null;
    if (!this._tx.overlay.has(table)) this._tx.overlay.set(table, new Map());
    if (!this._tx.cache.has(table)) this._tx.cache.set(table, new Map());
    return this._tx;
  }

  _bufPut(table, entity) {
    const tx = this._scope(table);
    const pk = pkOf(table);
    const doc = { ...entity, [pk]: entity[pk] };
    tx.overlay.get(table).set(entity[pk], doc);
    tx.ops.push({ op: 'put', coll: table, pk, doc });
  }

  async _bufUpdate(table, key, patch) {
    const tx = this._scope(table);
    const pk = pkOf(table);
    const ov = tx.overlay.get(table);
    const cache = tx.cache.get(table);
    let cur = ov.has(key) ? ov.get(key) : cache.get(key);
    if (cur === undefined || cur === null) {
      cur = await this.get(table, key);
    }
    if (!cur) return 0;
    const merged = { ...cur, ...patch, [pk]: key };
    ov.set(key, merged);
    tx.ops.push({ op: 'update', coll: table, pk, id: key, patch });
    return 1;
  }

  _bufDelete(table, key) {
    const tx = this._scope(table);
    if (!tx.overlay.has(table)) tx.overlay.set(table, new Map());
    tx.overlay.get(table).set(key, null);
    tx.ops.push({ op: 'delete', coll: table, pk: pkOf(table), id: key });
  }

  /** Apply pending overlay writes on top of server query results. */
  _applyOverlay(table, docs) {
    const ov = this._tx?.overlay.get(table);
    if (!ov || !ov.size) return docs;
    const pk = pkOf(table);
    const map = new Map(docs.map((d) => [d[pk], d]));
    for (const [k, v] of ov) {
      if (v === null) map.delete(k);
      else map.set(k, v);
    }
    return [...map.values()];
  }

  _remember(table, docs) {
    const cache = this._tx?.cache.get(table);
    if (cache) for (const d of docs) cache.set(d[pkOf(table)], d);
    return docs;
  }

  _query(table, params) {
    return api(`/${table}${buildQs(params)}`).then((b) =>
      this._remember(table, this._applyOverlay(table, b.docs || []))
    );
  }

  /* ── adapter contract ─────────────────────────────────────────────── */

  async get(table, key) {
    if (this._fallback) return this._fallback.get(table, key);
    const ov = this._tx?.overlay.get(table);
    if (ov && ov.has(key)) {
      const v = ov.get(key);
      return v === null ? undefined : v;
    }
    const b = await api(`/${table}/${encodeURIComponent(String(key))}`);
    const doc = b.doc || null;
    const cache = this._tx?.cache.get(table);
    if (cache) {
      if (doc) cache.set(doc[pkOf(table)], doc);
      else cache.delete(key);
    }
    return doc || undefined;
  }

  async getAll(table) {
    if (this._fallback) return this._fallback.getAll(table);
    return this._query(table, {});
  }

  async put(table, entity) {
    if (this._fallback) return this._fallback.put(table, entity);
    const pk = pkOf(table);
    if (this._tx) {
      this._bufPut(table, entity);
      return entity[pk];
    }
    await api(`/${table}/${encodeURIComponent(String(entity[pk]))}`, { method: 'PUT', body: entity });
    return entity[pk];
  }

  async bulkPut(table, entities) {
    if (this._fallback) return this._fallback.bulkPut(table, entities);
    const pk = pkOf(table);
    if (this._tx) {
      entities.forEach((e) => this._bufPut(table, e));
      return entities.map((e) => e[pk]);
    }
    await api(`/${table}/bulk`, { method: 'POST', body: { docs: entities } });
    return entities.map((e) => e[pk]);
  }

  async delete(table, key) {
    if (this._fallback) return this._fallback.delete(table, key);
    if (this._tx) {
      this._bufDelete(table, key);
      return;
    }
    await api(`/${table}/${encodeURIComponent(String(key))}`, { method: 'DELETE' });
  }

  async count(table) {
    if (this._fallback) return this._fallback.count(table);
    if (this._tx) return (await this._query(table, {})).length;
    const b = await api(`/${table}/count`);
    return b.count;
  }

  /**
   * Buffered transaction. `fn` runs client-side with read-your-writes;
   * on success the recorded ops commit as ONE MongoDB transaction
   * (all-or-nothing). On failure nothing is written.
   */
  async transaction(tableNames, fn) {
    if (this._fallback) return this._fallback.transaction(tableNames, fn);
    const tx = { overlay: new Map(), cache: new Map(), ops: [] };
    for (const t of tableNames) {
      tx.overlay.set(t, new Map());
      tx.cache.set(t, new Map());
    }
    const prev = this._tx;
    this._tx = tx;
    try {
      const result = await fn(tx);
      if (tx.ops.length) {
        await api('/transaction', { method: 'POST', body: { ops: tx.ops } });
      }
      return result;
    } finally {
      this._tx = prev;
    }
  }

  /** Dexie-shaped queryable handle over REST. */
  table(name) {
    if (this._fallback) return this._fallback.table(name);
    const pk = pkOf(name);
    const self = this;

    const fetchOne = async (key) => {
      const doc = await self.get(name, key);
      return doc || undefined;
    };

    const handle = {
      get: (key) => fetchOne(key),

      put: async (entity) => {
        if (self._tx) {
          self._bufPut(name, entity);
          return entity[pk];
        }
        await api(`/${name}/${encodeURIComponent(String(entity[pk]))}`, { method: 'PUT', body: entity });
        return entity[pk];
      },

      bulkPut: async (entities) => {
        if (self._tx) {
          entities.forEach((e) => self._bufPut(name, e));
          return entities.map((e) => e[pk]);
        }
        await api(`/${name}/bulk`, { method: 'POST', body: { docs: entities } });
        return entities.map((e) => e[pk]);
      },

      update: async (key, patch) => {
        if (self._tx) return self._bufUpdate(name, key, patch);
        const b = await api(`/${name}/${encodeURIComponent(String(key))}`, {
          method: 'PATCH',
          body: { patch },
        });
        return b.modified ? 1 : 0;
      },

      delete: async (key) => {
        if (self._tx) {
          self._bufDelete(name, key);
          return;
        }
        await api(`/${name}/${encodeURIComponent(String(key))}`, { method: 'DELETE' });
      },

      clear: async () => {
        if (self._tx) throw new Error('clear() inside a transaction is unsupported');
        await api(`/${name}?confirm=qmate-clear`, { method: 'DELETE' });
      },

      count: async () => {
        if (self._tx) return (await self._query(name, {})).length;
        const b = await api(`/${name}/count`);
        return b.count;
      },

      where: (field) => ({
        equals: (v) => ({
          toArray: () => self._query(name, { where: field, eq: v }),
          first: async () => (await self._query(name, { where: field, eq: v, limit: 1 }))[0],
        }),
      }),

      orderBy: (field) => {
        const run = (dir, limit) => self._query(name, { orderBy: field, dir, limit });
        const asc = {
          toArray: () => run('asc'),
          limit: (n) => ({ toArray: () => run('asc', n) }),
        };
        return {
          ...asc,
          reverse: () => ({
            toArray: () => run('desc'),
            limit: (n) => ({ toArray: () => run('desc', n) }),
          }),
        };
      },

      toArray: () => self._query(name, {}),
      first: async () => (await self._query(name, { limit: 1 }))[0],
    };
    return handle;
  }

  raw() {
    if (this._fallback) return this._fallback.raw();
    return { mode: 'mongodb', base: BASE, inTransaction: Boolean(this._tx) };
  }
}

export default MongoRestAdapter;
