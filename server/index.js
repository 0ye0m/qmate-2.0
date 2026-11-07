/**
 * Q-MATE 2.0 — DATA API (Express + MongoDB Atlas)
 * ================================================
 * The server-side persistence tier for Q-Mate 2.0. The React client keeps
 * talking to the SAME StorageAdapter contract it always had; this service
 * implements that contract over REST on top of MongoDB Atlas:
 *
 *   GET    /api/db/health                → ping + per-collection counts
 *   GET    /api/db/:table                → getAll (optional where/eq/orderBy/dir/limit)
 *   GET    /api/db/:table/count          → count()
 *   GET    /api/db/:table/:key           → get(pk)
 *   PUT    /api/db/:table/:key           → put(entity)          (replace / upsert)
 *   POST   /api/db/:table/bulk           → bulkPut(docs)        (ordered upsert)
 *   PATCH  /api/db/:table/:key           → update(pk, patch)    ($set merge)
 *   DELETE /api/db/:table/:key           → delete(pk)
 *   DELETE /api/db/:table?confirm=…      → clear()              (seed rebuild)
 *   POST   /api/db/transaction           → atomic batch of ops in ONE
 *                                           MongoDB multi-document transaction
 *
 * Tables mirror the client Dexie schema exactly (primary keys included —
 * `sessions.token` and `meta.key` are non-default primary keys).
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { connectMongo, getDb, mongoPing } from './mongo.js';
import {
  ALERT_TYPES,
  MAIL_FROM,
  checkDeviceAndAlert,
  checkReceipt,
  ensureMailIndexes,
  hashPasswordServer,
  normEmail,
  sendAlert,
  sendOtp,
  smtpAvailable,
  verifyOtp,
} from './mail.js';

const PORT = Number(process.env.QMATE_API_PORT || 4000);
const HOST = process.env.QMATE_API_HOST || '127.0.0.1';
const DB_NAME = process.env.MONGODB_DB || 'qmate';
const CLEAR_CONFIRM = process.env.QMATE_CLEAR_CONFIRM || 'qmate-clear';

/** Whitelisted tables (mirrors src/services/storage/db.js SCHEMA) + primary keys. */
const TABLES = {
  users: 'id',
  sessions: 'token',
  queues: 'id',
  tokens: 'id',
  counters: 'id',
  prebooks: 'id',
  feedback: 'id',
  announcements: 'id',
  auditLog: 'id',
  predictions: 'id',
  meta: 'key',
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

/* ── mail & verification tier (parity with the embedded app-server API) ─ */

const mailFail = (res, err) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  return res.status(status).json({ ok: false, error: err?.message || 'SERVER_ERROR', detail: err?.detail });
};

app.get('/api/mail/health', async (req, res) => {
  try {
    await ensureMailIndexes();
    const health = await smtpAvailable();
    res.json({ ok: true, smtp: health.smtp, from: MAIL_FROM.replace(/<.*>/, '').trim() || 'QMATE', modes: { otp: true, alerts: health.smtp === 'available' } });
  } catch (err) {
    mailFail(res, err);
  }
});

app.post('/api/mail/otp/send', async (req, res) => {
  try {
    await ensureMailIndexes();
    const out = await sendOtp(req.body?.email, req.body?.purpose || 'signup', req.body?.name, req.ip);
    res.json(out);
  } catch (err) {
    mailFail(res, err);
  }
});

app.post('/api/mail/otp/verify', async (req, res) => {
  try {
    await ensureMailIndexes();
    const out = await verifyOtp(req.body?.email, req.body?.purpose || 'signup', req.body?.code);
    res.json({ ok: true, ...out });
  } catch (err) {
    mailFail(res, err);
  }
});

app.post('/api/mail/register', async (req, res) => {
  try {
    await ensureMailIndexes();
    const name = String(req.body?.name || '').trim();
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const department = req.body?.department;
    const year = Number(req.body?.year) || 1;
    const receipt = req.body?.verification?.receipt;
    const verifiedEmail = normEmail(req.body?.verification?.email);

    if (name.length < 2) throw Object.assign(new Error('VALIDATION'), { status: 400, detail: 'name' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('BAD_EMAIL'), { status: 400 });
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw Object.assign(new Error('WEAK_PASSWORD'), { status: 400 });
    }
    if (!department) throw Object.assign(new Error('VALIDATION'), { status: 400, detail: 'department' });
    if (verifiedEmail !== email || !checkReceipt(email, 'signup', receipt)) {
      throw Object.assign(new Error('RECEIPT_INVALID'), { status: 401 });
    }

    const db = getDb();
    const existing = await db.collection('users').findOne({ email });
    if (existing) throw Object.assign(new Error('EMAIL_TAKEN'), { status: 409 });

    const { hash, salt } = hashPasswordServer(password);
    const user = {
      id: `usr-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      name,
      email,
      passHash: hash,
      salt,
      role: 'student',
      department,
      year,
      status: 'active',
      failedAttempts: 0,
      lockedUntil: 0,
      greenScore: 0,
      badges: [],
      prefs: { sound: true, travelMinutes: 10 },
      emailVerified: true,
      createdAt: Date.now(),
    };
    await db.collection('users').insertOne({ _id: user.id, ...user });
    await db.collection('auditLog').insertOne({
      id: `aud-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      ts: Date.now(),
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      details: { method: 'email-otp', verified: true },
    });
    sendAlert('welcome', email, { name }, `welcome:${user.id}`).catch(() => undefined);

    const { passHash: _p, salt: _s, ...pub } = user;
    res.json({ ok: true, user: pub });
  } catch (err) {
    mailFail(res, err);
  }
});

app.post('/api/mail/notify', async (req, res) => {
  try {
    await ensureMailIndexes();
    const type = String(req.body?.type || '');
    if (!ALERT_TYPES.includes(type)) return res.status(400).json({ ok: false, error: 'BAD_ALERT_TYPE' });
    if (type === 'login-new-device' && req.body?.userId) {
      const known = await checkDeviceAndAlert(String(req.body.userId), normEmail(req.body?.to), req.body?.device || {});
      return res.json({ ok: true, newDevice: !known });
    }
    const out = await sendAlert(type, req.body?.to, req.body?.data || {}, req.body?.dedupeKey ? String(req.body.dedupeKey) : undefined);
    res.json({ ok: true, ...out });
  } catch (err) {
    mailFail(res, err);
  }
});

/* ── helpers ──────────────────────────────────────────────────────────── */

const stripId = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
};

const pkOf = (table) => TABLES[table] || 'id';

function checkTable(req, res, next) {
  const table = req.params.table;
  if (!Object.hasOwn(TABLES, table)) {
    return res.status(400).json({ ok: false, error: `UNKNOWN_TABLE:${table}` });
  }
  return next();
}

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const dup = err?.code === 11000 || /E11000/i.test(err?.message || '');
    res.status(dup ? 409 : 500).json({ ok: false, error: dup ? 'DUPLICATE_KEY' : err.message });
  });
};

/** Build a Mongo filter from ?where=<field>|[a+b]&eq=<json>. */
function parseWhere(query) {
  if (!query.where) return {};
  const raw = String(query.where);
  const fields = raw.startsWith('[') && raw.endsWith(']')
    ? raw.slice(1, -1).split('+')
    : [raw];
  const vals = query.eq !== undefined ? JSON.parse(query.eq) : null;
  const filter = {};
  if (fields.length === 1) {
    filter[fields[0]] = vals;
  } else {
    fields.forEach((f, i) => {
      filter[f] = Array.isArray(vals) ? vals[i] : null;
    });
  }
  return filter;
}

/* ── routes ───────────────────────────────────────────────────────────── */

app.get('/', (req, res) => {
  res.json({
    service: 'Q-Mate 2.0 Data API',
    stack: 'Express + MongoDB Atlas',
    tables: Object.keys(TABLES),
    endpoints: [
      'GET    /api/db/health',
      'GET    /api/db/:table?where=&eq=&orderBy=&dir=&limit=',
      'GET    /api/db/:table/count',
      'GET    /api/db/:table/:key',
      'PUT    /api/db/:table/:key',
      'POST   /api/db/:table/bulk',
      'PATCH  /api/db/:table/:key',
      'DELETE /api/db/:table/:key',
      'DELETE /api/db/:table?confirm=qmate-clear',
      'POST   /api/db/transaction',
      'GET    /api/mail/health',
      'POST   /api/mail/otp/send · otp/verify · register · notify',
    ],
  });
});

app.get(
  '/api/db/health',
  wrap(async (req, res) => {
    try {
      await mongoPing();
      const db = getDb();
      const collections = {};
      for (const t of Object.keys(TABLES)) {
        collections[t] = await db.collection(t).countDocuments();
      }
      res.json({ ok: true, storage: 'mongodb', db: DB_NAME, collections });
    } catch (err) {
      res.status(503).json({ ok: false, storage: 'mongodb', error: err.message });
    }
  })
);

/** Atomic multi-document transaction: applies a client-recorded op list
 *  inside one MongoDB session. Any failure aborts the whole batch. */
app.post(
  '/api/db/transaction',
  wrap(async (req, res) => {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
    if (!ops.length) return res.json({ ok: true, applied: 0 });
    if (ops.length > 5000) return res.status(400).json({ ok: false, error: 'TOO_MANY_OPS' });
    for (const op of ops) {
      if (!op || !Object.hasOwn(TABLES, op.coll)) {
        return res.status(400).json({ ok: false, error: `BAD_OP_TABLE:${op?.coll}` });
      }
    }
    const db = getDb();
    const session = db.client.startSession();
    try {
      let applied = 0;
      await session.withTransaction(
        async () => {
          for (const op of ops) {
            const c = db.collection(op.coll);
            if (op.op === 'put') {
              const doc = { ...op.doc };
              doc[op.pk] = String(op.doc[op.pk]);
              await c.replaceOne({ _id: doc[op.pk] }, doc, { upsert: true, session });
            } else if (op.op === 'update') {
              await c.updateOne({ _id: String(op.id) }, { $set: op.patch || {} }, { session });
            } else if (op.op === 'delete') {
              await c.deleteOne({ _id: String(op.id) }, { session });
            } else {
              throw new Error(`BAD_OP:${op.op}`);
            }
            applied += 1;
          }
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
      );
      res.json({ ok: true, applied });
    } catch (err) {
      res.status(409).json({ ok: false, error: 'TRANSACTION_ABORTED', detail: err.message });
    } finally {
      session.endSession();
    }
  })
);

app.get(
  '/api/db/:table/count',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const count = await db.collection(req.params.table).countDocuments(parseWhere(req.query));
    res.json({ ok: true, count });
  })
);

app.get(
  '/api/db/:table',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const filter = parseWhere(req.query);
    const q = db.collection(req.params.table).find(filter);
    if (req.query.orderBy) {
      q.sort({ [String(req.query.orderBy)]: req.query.dir === 'desc' ? -1 : 1 });
    }
    const limit = parseInt(req.query.limit, 10);
    if (Number.isFinite(limit) && limit > 0) q.limit(limit);
    const docs = (await q.toArray()).map(stripId);
    res.json({ ok: true, docs });
  })
);

app.get(
  '/api/db/:table/:key',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const doc = await db.collection(req.params.table).findOne({ _id: req.params.key });
    res.json({ ok: true, doc: stripId(doc) || null });
  })
);

app.put(
  '/api/db/:table/:key',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const pk = pkOf(req.params.table);
    const doc = { ...(req.body || {}) };
    doc[pk] = req.params.key;
    if (doc._id) delete doc._id;
    await db
      .collection(req.params.table)
      .replaceOne({ _id: req.params.key }, doc, { upsert: true });
    res.json({ ok: true, key: req.params.key });
  })
);

app.post(
  '/api/db/:table/bulk',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const pk = pkOf(req.params.table);
    const docs = Array.isArray(req.body?.docs) ? req.body.docs : [];
    if (!docs.length) return res.json({ ok: true, count: 0 });
    const operations = docs.map((raw) => {
      const doc = { ...raw };
      const key = String(doc[pk]);
      doc[pk] = key;
      if (doc._id) delete doc._id;
      return { replaceOne: { filter: { _id: key }, replacement: doc, upsert: true } };
    });
    const out = await db
      .collection(req.params.table)
      .bulkWrite(operations, { ordered: false });
    res.json({ ok: true, count: operations.length, upserted: out.upsertedCount || 0 });
  })
);

app.patch(
  '/api/db/:table/:key',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const patch = req.body?.patch || {};
    if (patch._id) delete patch._id;
    const out = await db
      .collection(req.params.table)
      .updateOne({ _id: req.params.key }, { $set: patch });
    res.json({ ok: true, modified: out.modifiedCount || 0 });
  })
);

app.delete(
  '/api/db/:table/:key',
  checkTable,
  wrap(async (req, res) => {
    const db = getDb();
    const out = await db.collection(req.params.table).deleteOne({ _id: req.params.key });
    res.json({ ok: true, deleted: out.deletedCount || 0 });
  })
);

app.delete(
  '/api/db/:table',
  checkTable,
  wrap(async (req, res) => {
    if (req.query.confirm !== CLEAR_CONFIRM) {
      return res.status(400).json({ ok: false, error: 'CONFIRM_REQUIRED' });
    }
    const db = getDb();
    const out = await db.collection(req.params.table).deleteMany({});
    res.json({ ok: true, deleted: out.deletedCount || 0 });
  })
);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `NO_ROUTE:${req.method} ${req.path}` });
});

/* ── boot ─────────────────────────────────────────────────────────────── */

async function ensureIndexes(db) {
  const jobs = [
    (async () => {
      // users.email is intentionally NON-unique: one owner may hold several
      // provisioned roles (student + admin + super-admin) on one address.
      try { await db.collection('users').dropIndex('email_1'); } catch { /* absent */ }
      return db.collection('users').createIndex({ email: 1 });
    })(),
    db.collection('tokens').createIndex({ queueId: 1 }),
    db.collection('tokens').createIndex({ userId: 1 }),
    db.collection('tokens').createIndex({ queueId: 1, status: 1 }),
    db.collection('tokens').createIndex({ issuedAt: -1 }),
    db.collection('counters').createIndex({ queueId: 1 }),
    db.collection('prebooks').createIndex({ userId: 1 }),
    db.collection('prebooks').createIndex({ queueId: 1, date: 1 }),
    db.collection('feedback').createIndex({ tokenId: 1 }),
    db.collection('feedback').createIndex({ userId: 1 }),
    db.collection('feedback').createIndex({ queueId: 1 }),
    db.collection('announcements').createIndex({ createdAt: -1 }),
    db.collection('auditLog').createIndex({ ts: -1 }),
    db.collection('sessions').createIndex({ expiresAt: 1 }),
  ];
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.error('[api] some indexes failed:', failed.map((f) => f.reason?.message));
}

async function main() {
  const db = await connectMongo();
  await ensureIndexes(db);
  const counts = {};
  for (const t of Object.keys(TABLES)) counts[t] = await db.collection(t).countDocuments();
  console.log(`[api] MongoDB Atlas connected → db "${DB_NAME}"`, counts);
  app.listen(PORT, HOST, () => {
    console.log(`[api] Q-Mate data API listening on http://${HOST}:${PORT} (Express + MongoDB)`);
  });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  console.error('[api] fatal:', err.message);
  process.exit(1);
});
