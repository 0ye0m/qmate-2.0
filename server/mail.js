/**
 * Q-Mate 2.0 — Mail & verification service for the Express data API.
 * (Functional parity with the embedded tier in the Next.js application
 * server — src/lib/qmate-mail.ts. Keep both in sync.)
 *
 * Provides: Gmail SMTP transport with health cache, email OTP issue/verify
 * for account creation, HMAC-signed verification receipts, server-side
 * account creation (PBKDF2-SHA256 150k — byte-compatible with the client's
 * WebCrypto), and deduped security/realtime alert emails.
 */
import { createHmac, createHash, pbkdf2Sync, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { getDb } from './mongo.js';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'mandwadeop@rknec.edu';
const SMTP_PASS = (process.env.SMTP_PASS || 'fpjo snof vqak fokr').replace(/\s+/g, '');
export const MAIL_FROM = process.env.MAIL_FROM || `QMATE <${SMTP_USER}>`;
export const APP_URL = process.env.MAIL_APP_URL || 'https://qmate.space-z.ai/qmate/';
const OTP_FALLBACK = (process.env.QMATE_OTP_FALLBACK || 'on') !== 'off';
const SECRET = process.env.MAIL_SECRET || `qmate-mail-${SMTP_USER}-9f2b7c1e-otp-pepper`;

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_GAP_MS = 45 * 1000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_FALLBACK_TTL_MS = 15 * 60 * 1000;
const NOTIFY_DEDUPE_MS = 30 * 60 * 1000;
const NOTIFY_MAX_PER_BUCKET = 8;

/* ── transport + health ────────────────────────────────────────────────── */

let _transporter = null;
let _health = null;
let _configKey = null;

/* Invalidate cached transport + health whenever the mail config changes. */
const CONFIG_KEY = `${SMTP_HOST}:${SMTP_PORT}:${SMTP_USER}:${SMTP_PASS.length}:${SECRET.length}`;
if (_configKey !== CONFIG_KEY) {
  _configKey = CONFIG_KEY;
  _transporter = null;
  _health = null;
}

function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return _transporter;
}

export async function smtpAvailable() {
  if (_health && Date.now() - _health.checkedAt < (_health.smtp === 'available' ? 120000 : 300000)) return _health;
  try {
    await transporter().verify();
    _health = { smtp: 'available', checkedAt: Date.now() };
  } catch (err) {
    _health = { smtp: 'unavailable', checkedAt: Date.now(), error: err.message };
  }
  return _health;
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normEmail = (e) => String(e || '').toLowerCase().trim();
export const isEmail = (e) => EMAIL_RE.test(normEmail(e));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (s) => createHmac('sha256', SECRET).update(s).digest('hex');

export function hashPasswordServer(password, saltHex) {
  const salt = saltHex || (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 32);
  const hash = pbkdf2Sync(String(password), salt, 150000, 32, 'sha256').toString('hex');
  return { hash, salt: salt.slice(0, 32) };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function metaGet(key) {
  const db = getDb();
  return db.collection('meta').findOne({ _id: key });
}
async function metaPut(key, value) {
  const db = getDb();
  await db.collection('meta').replaceOne({ _id: key }, { key, value }, { upsert: true });
}

export async function ensureMailIndexes() {
  try {
    const db = getDb();
    await db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('otps').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
  } catch {
    /* best-effort */
  }
}

/* ── OTP ───────────────────────────────────────────────────────────────── */

export async function sendOtp(rawEmail, purpose, name, ip) {
  const email = normEmail(rawEmail);
  if (!isEmail(email)) throw Object.assign(new Error('BAD_EMAIL'), { status: 400 });
  purpose = purpose === 'login' ? 'login' : 'signup';

  const db = getDb();
  const _id = `${email}|${purpose}`;
  const now = Date.now();
  const existing = await db.collection('otps').findOne({ _id });

  if (existing) {
    const sinceLast = now - (existing.createdAt?.getTime?.() || 0);
    if (sinceLast < OTP_RESEND_GAP_MS) {
      throw Object.assign(new Error('OTP_TOO_SOON'), { status: 429, detail: Math.ceil((OTP_RESEND_GAP_MS - sinceLast) / 1000) });
    }
    const sentCount = now - (existing.windowStart || 0) < 3600000 ? existing.sentCount || 0 : 0;
    if (sentCount >= OTP_MAX_PER_HOUR) throw Object.assign(new Error('OTP_RATE_LIMITED'), { status: 429 });
  }

  if (ip) {
    const ipKey = `mailrate:ip:${sha256(ip)}:${Math.floor(now / 3600000)}`;
    const rec = await metaGet(ipKey);
    if ((rec?.value || 0) >= 20) throw Object.assign(new Error('OTP_RATE_LIMITED'), { status: 429 });
    await metaPut(ipKey, (rec?.value || 0) + 1);
  }

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const doc = {
    _id,
    codeHash: hmac(`${email}:${purpose}:${code}`),
    attempts: 0,
    expiresAt: new Date(now + OTP_TTL_MS),
    createdAt: new Date(now),
    sentCount: existing && now - (existing.windowStart || 0) < 3600000 ? (existing.sentCount || 0) + 1 : 1,
    windowStart: existing && now - (existing.windowStart || 0) < 3600000 ? existing.windowStart : now,
  };
  await db.collection('otps').replaceOne({ _id }, doc, { upsert: true });

  const health = await smtpAvailable();
  if (health.smtp === 'available') {
    try {
      await transporter().sendMail({
        from: MAIL_FROM,
        to: email,
        subject: `${code} is your QMATE verification code`,
        text: otpText(code, name),
        html: otpHtml(code, name),
      });
      return { ok: true, delivery: 'email', expiresAt: now + OTP_TTL_MS };
    } catch (err) {
      _health = { smtp: 'unavailable', checkedAt: Date.now(), error: err.message };
    }
  }
  if (!OTP_FALLBACK) throw Object.assign(new Error('SMTP_UNAVAILABLE'), { status: 503, detail: health.error });
  return {
    ok: true,
    delivery: 'onscreen',
    onscreenCode: code,
    expiresAt: now + OTP_TTL_MS,
    reason: 'Email delivery is temporarily unavailable — the code is shown here instead.',
  };
}

export async function verifyOtp(rawEmail, purpose, code) {
  const email = normEmail(rawEmail);
  purpose = purpose === 'login' ? 'login' : 'signup';
  if (!isEmail(email) || !/^\d{6}$/.test(String(code || ''))) {
    throw Object.assign(new Error('BAD_REQUEST'), { status: 400 });
  }
  const db = getDb();
  const _id = `${email}|${purpose}`;
  const doc = await db.collection('otps').findOne({ _id });
  if (!doc) throw Object.assign(new Error('OTP_NOT_FOUND'), { status: 400 });
  if ((doc.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await db.collection('otps').deleteOne({ _id });
    throw Object.assign(new Error('OTP_MAX_ATTEMPTS'), { status: 429 });
  }
  const ok = safeEqual(doc.codeHash, hmac(`${email}:${purpose}:${String(code).trim()}`));
  if (!ok) {
    await db.collection('otps').updateOne({ _id }, { $inc: { attempts: 1 } });
    throw Object.assign(new Error('OTP_INVALID'), { status: 400 });
  }
  await db.collection('otps').deleteOne({ _id });
  const exp = Date.now() + OTP_FALLBACK_TTL_MS;
  const receipt = `${exp}.${hmac(`receipt:${email}:${purpose}:${exp}`)}`;
  return { email, purpose, receipt, expiresAt: exp };
}

export function checkReceipt(email, purpose, receipt) {
  const m = /^(\d+)\.([a-f0-9]{64})$/.exec(String(receipt || ''));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!exp || exp < Date.now()) return false;
  return safeEqual(m[2], hmac(`receipt:${normEmail(email)}:${purpose}:${exp}`));
}

/* ── alerts ────────────────────────────────────────────────────────────── */

export const ALERT_TYPES = ['login-new-device', 'account-locked', 'password-changed', 'token-called', 'queue-announcement', 'welcome'];
const SECURITY_TYPES = ['login-new-device', 'account-locked', 'password-changed'];

export async function sendAlert(type, to, data, dedupeKey) {
  if (!ALERT_TYPES.includes(type)) throw Object.assign(new Error('BAD_ALERT_TYPE'), { status: 400 });
  const email = normEmail(to);
  if (!isEmail(email)) throw Object.assign(new Error('BAD_EMAIL'), { status: 400 });

  if (dedupeKey) {
    const key = `mailq:${type}:${sha256(dedupeKey)}`;
    const seen = await metaGet(key);
    if (seen?.at && Date.now() - seen.at < NOTIFY_DEDUPE_MS) return { ok: true, skipped: 'duplicate' };
    await metaPut(key, { at: Date.now() });
  }
  if (!SECURITY_TYPES.includes(type)) {
    const bucket = `mailrate:to:${sha256(email)}:${Math.floor(Date.now() / 600000)}`;
    const rec = await metaGet(bucket);
    if ((rec?.value || 0) >= NOTIFY_MAX_PER_BUCKET) return { ok: true, skipped: 'quota' };
    await metaPut(bucket, (rec?.value || 0) + 1);
  }

  const health = await smtpAvailable();
  if (health.smtp !== 'available') return { ok: false, skipped: 'smtp-unavailable' };
  const { subject, html, text } = alertEmail(type, data || {});
  try {
    await transporter().sendMail({ from: MAIL_FROM, to: email, subject, html, text });
    return { ok: true };
  } catch (err) {
    _health = { smtp: 'unavailable', checkedAt: Date.now(), error: err.message };
    return { ok: false, skipped: 'smtp-unavailable' };
  }
}

export async function checkDeviceAndAlert(userId, email, device) {
  const fp = sha256(`${device?.ua || ''}|${device?.platform || ''}|${device?.lang || ''}`).slice(0, 24);
  const key = `devices:${userId}`;
  const rec = await metaGet(key);
  const list = Array.isArray(rec?.value) ? rec.value : [];
  const known = list.some((d) => d.f === fp);
  if (!known) {
    list.push({ f: fp, ts: Date.now() });
    await metaPut(key, list.slice(-12));
    await sendAlert('login-new-device', email, {
      device: device?.platform || device?.ua || 'Unknown device',
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    }).catch(() => undefined);
  }
  return known;
}

/* ── templates ─────────────────────────────────────────────────────────── */

const BRAND = '#0d9488';
const INK = '#0f172a';

function layout(title, bodyHtml, note) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:${BRAND};padding:20px 28px;">
        <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:2px;">Q&#8202;MATE</span>
        <span style="color:#99f6e4;font-size:12px;font-weight:600;margin-left:10px;">SMART CAMPUS QUEUE PLATFORM</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 14px;color:${INK};font-size:19px;">${title}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${note || 'This is an automated message from the Q-Mate 2.0 notification service. If you were not expecting it, please ignore this email or contact the campus administrator.'}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function otpText(code, name) {
  return `Hello ${name || 'there'},\n\nYour QMATE verification code is ${code}\n\nIt expires in 10 minutes. Never share this code with anyone.\n\n— Q-Mate 2.0 notification service`;
}
function otpHtml(code, name) {
  return layout(
    'Verify your email address',
    `<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">Hello ${name || 'there'}, use the verification code below to finish creating your QMATE account. The code expires in <strong>10 minutes</strong>.</p>
     <div style="text-align:center;margin:22px 0;">
       <span style="display:inline-block;background:#f0fdfa;border:2px solid ${BRAND};color:${INK};font-size:32px;font-weight:800;letter-spacing:10px;padding:14px 26px;border-radius:12px;">${code}</span>
     </div>
     <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Never share this code with anyone — the QMATE team will never ask for it.</p>`
  );
}

function alertEmail(type, d) {
  const row = (k, v) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;">${k}</td><td style="padding:6px 0;color:${INK};font-size:13px;font-weight:600;">${v}</td></tr>`;
  let title = 'QMATE security alert';
  let inner = '';
  if (type === 'login-new-device') {
    title = 'New device signed in to your QMATE account';
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">Your QMATE account was just signed in from a device we have not seen before. If this was you, no action is needed.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:10px;">
        ${row('Device', String(d.device || 'Unknown'))}${row('Time', String(d.time || ''))}</table>`;
  } else if (type === 'account-locked') {
    title = 'Your QMATE account was temporarily locked';
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">There were several unsuccessful sign-in attempts, so the account has been locked for <strong>${d.minutes || 15} minutes</strong> as a security measure.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:10px;">
        ${row('Time', String(d.time || ''))}${row('Unlocks in', `${d.minutes || 15} minutes`)}</table>`;
  } else if (type === 'password-changed') {
    title = 'Your QMATE password was changed';
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">The password for your QMATE account was changed successfully. If you did not make this change, please contact the campus administrator immediately.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:10px;">
        ${row('Time', String(d.time || ''))}</table>`;
  } else if (type === 'token-called') {
    title = 'It is your turn — please proceed to the counter';
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">Your token has been called. Please check in at the counter within the grace window.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:10px;">
        ${row('Token', String(d.code || ''))}${row('Queue', String(d.queue || ''))}${row('Counter', String(d.counter || '—'))}</table>
      <p style="margin:14px 0 0;color:#64748b;font-size:12px;">Open Q-Mate to check in: ${APP_URL}</p>`;
  } else if (type === 'queue-announcement') {
    title = 'New announcement for a queue you are in';
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">${String(d.message || '')}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border-radius:10px;">
        ${row('Queue', String(d.queue || ''))}</table>`;
  } else if (type === 'welcome') {
    title = `Welcome to QMATE, ${String(d.name || 'there').slice(0, 60)}!`;
    inner = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">Your account has been created and your email address is verified. You can now join campus queues, pre-book slots and track your tokens in real time.</p>
      <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6;">Security tip: your account locks for 15 minutes after five unsuccessful sign-in attempts, and we alert you by email whenever a new device signs in.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Open Q-Mate: ${APP_URL}</p>`;
  }
  return { subject: title, html: layout(title, inner), text: `${title}\n\n${JSON.stringify(d)}` };
}
