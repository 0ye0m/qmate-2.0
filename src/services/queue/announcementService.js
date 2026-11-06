/**
 * ANNOUNCEMENTS — admin broadcasts ("Counter 2 closed for lunch") that land
 * instantly on every affected student's screen via the EventBus, stored in
 * three languages (AI-polished when available).
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { uid } from '../../utils/id';
import { ANNOUNCEMENT_FEED_MAX } from '../../utils/constants';
import { log as audit } from './auditService';

export async function publish(actor, { queueId, severity = 'info', messageEn, messageHi = '', messageMr = '' }) {
  if (!messageEn || !String(messageEn).trim()) throw new Error('Message required');
  const record = {
    id: uid('ann-'),
    queueId,
    severity,
    messageEn: String(messageEn).trim().slice(0, 300),
    messageHi: String(messageHi || '').slice(0, 300),
    messageMr: String(messageMr || '').slice(0, 300),
    createdBy: actor?.id || 'system',
    createdAt: Date.now(),
  };
  await storage.put('announcements', record);
  await audit(actor, 'announcement.publish', 'queue', queueId, { severity });
  eventBus.publish(EVENTS.ANNOUNCEMENT, {
    queueId,
    announcementId: record.id,
    severity,
    messageEn: record.messageEn,
  });
  return record;
}

export async function recent(queueId = null, limit = ANNOUNCEMENT_FEED_MAX) {
  let rows = await storage.table('announcements').orderBy('createdAt').reverse().limit(limit * 2).toArray();
  if (queueId) rows = rows.filter((r) => r.queueId === queueId || r.queueId === 'campus');
  return rows.slice(0, limit);
}

export function localizedText(record, lang = 'en') {
  if (!record) return '';
  if (lang === 'hi' && record.messageHi) return record.messageHi;
  if (lang === 'mr' && record.messageMr) return record.messageMr;
  return record.messageEn;
}
