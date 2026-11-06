import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuthStore } from '../../store/authStore';
import { useQueueStore } from '../../store/queueStore';
import { useUiStore } from '../../store/uiStore';
import { eventBus, EVENTS } from '../../services/realtime/EventBus';
import {
  alertAll,
  notificationPermission,
  requestNotificationPermission,
} from '../../services/notifications/notificationService';
import { autoSkipExpired } from '../../services/queue/queueService';
import { ROLE_RANK } from '../../utils/constants';
import { localizedText } from '../../services/queue/announcementService';
import { recent as recentAnnouncements } from '../../services/queue/announcementService';
import { storage } from '../../services/storage';
import { predictForQueue } from '../../services/prediction/predictionService';
import { activeTokensForUser, waitingTokens } from '../../services/queue/queueService';

/**
 * NOTIFICATION WATCHER — the event-driven alert brain (replaces the broken
 * "poll every 3 min" approach). Reacts to EventBus events only:
 *   • your token called → sound + vibration + notification + toast
 *   • 3/2/1 people ahead → heads-up alerts (deduped per token)
 *   • queue paused/resumed/closed, announcements, counter change
 *   • "Leave Now": ETA ≤ travel time → single alert per token
 * Admin sessions additionally run the no-show grace-timer enforcement.
 */
export default function NotificationWatcher() {
  const { t, lang } = useI18n();
  const firedRef = useRef(new Map());
  const leaveNowRef = useRef(new Set());

  const user = useAuthStore((s) => s.user);
  const sound = useUiStore((s) => s.sound);
  const travelMinutes = useUiStore((s) => s.travelMinutes);
  const notifAsked = useUiStore((s) => s.notifAsked);
  const setNotifAsked = useUiStore((s) => s.setNotifAsked);

  // One-time notification permission ask (after first login).
  useEffect(() => {
    if (!user || notifAsked) return;
    const id = setTimeout(() => {
      if (notificationPermission() === 'default') {
        requestNotificationPermission();
      }
      setNotifAsked();
    }, 4000);
    return () => clearTimeout(id);
  }, [user, notifAsked, setNotifAsked]);

  useEffect(() => {
    if (!user) return undefined;
    const isAdmin = ROLE_RANK[user.role] >= ROLE_RANK.admin;

    const myTokenIds = new Set();
    activeTokensForUser(user.id)
      .then((toks) => toks.forEach((tk) => myTokenIds.add(tk.id)))
      .catch(() => {});

    const fire = (key, title, body, opts = {}) => {
      const now = Date.now();
      if ((firedRef.current.get(key) || 0) > now - 5000) return; // dedupe 5s
      firedRef.current.set(key, now);
      if (firedRef.current.size > 200) firedRef.current.clear();
      alertAll({ title, body, tag: opts.tag || key, sound: opts.sound ?? sound });
      toast(title, { icon: opts.icon || '🔔', duration: 6000 });
    };

    // periodic leave-now + ahead-count checks (cheap, local only)
    const interval = setInterval(async () => {
      try {
        if (document.hidden) return;
        const toks = await activeTokensForUser(user.id);
        for (const tok of toks) {
          if (tok.status === 'called' || tok.status === 'serving') continue;
          const [queue, waiting] = await Promise.all([storage.get('queues', tok.queueId), waitingTokens(tok.queueId)]);
          if (!queue || queue.status !== 'active') continue;
          const ahead = waiting.filter((w) => w.number < tok.number && (!w.stepAwayUntil || w.stepAwayUntil < Date.now())).length;
          if ([3, 2, 1].includes(ahead) && !leaveNowRef.current.has(`${tok.id}:near${ahead}`)) {
            leaveNowRef.current.add(`${tok.id}:near${ahead}`);
            fire(`near-${tok.id}-${ahead}`, t('notif.nearT', { n: ahead }), t('notif.nearB', { queue: queue.name }), {
              tag: 'near',
              icon: '⏳',
            });
          }
          const open = (queue.countersCount || 1) > 0 ? queue.countersCount : 1;
          const eta = await predictForQueue(queue, ahead, open);
          if (eta.etaMin <= travelMinutes && !leaveNowRef.current.has(`${tok.id}:leave`)) {
            leaveNowRef.current.add(`${tok.id}:leave`);
            fire(`leave-${tok.id}`, t('notif.leaveNowT'), t('notif.leaveNowB', { min: travelMinutes, queue: queue.name }), {
              tag: 'leave-now',
              icon: '🚶',
            });
          }
        }
      } catch {
        /* background check must never throw */
      }
    }, 20000);

    const unsub = eventBus.on(async (msg) => {
      try {
        const p = msg.payload || {};
        switch (msg.type) {
          case EVENTS.TOKEN_ISSUED:
            if (p.userId === user.id) {
              myTokenIds.add(p.tokenId);
              toast.success(t('notif.issuedT', { n: p.number, queue: '' }), { icon: '🎟️' });
            }
            break;
          case EVENTS.TOKEN_CALLED:
            if (p.userId === user.id) {
              fire(
                `called-${p.tokenId}`,
                t('notif.calledT', { code: p.code || `#${p.number}` }),
                t('notif.calledB', { counter: p.counterLabel || 'the counter' }),
                { tag: 'called', icon: '🎉' }
              );
            }
            break;
          case EVENTS.TOKEN_RECALLED:
            if (p.userId === user.id) {
              fire(`recall-${p.tokenId}`, t('notif.recallT', { code: '' }), t('notif.recallB'), {
                tag: 'called',
                icon: '📣',
              });
            }
            break;
          case EVENTS.TOKEN_COMPLETED:
          case EVENTS.TOKEN_SKIPPED:
          case EVENTS.TOKEN_CANCELLED:
            myTokenIds.delete(p.tokenId);
            break;
          case EVENTS.TOKEN_NO_SHOW:
            if (p.userId === user.id) {
              myTokenIds.delete(p.tokenId);
              fire(`noshow-${p.tokenId}`, t('notif.noShowT'), t('notif.noShowB'), { tag: 'no-show', icon: '⚠️' });
            }
            break;
          case EVENTS.QUEUE_PAUSED:
          case EVENTS.QUEUE_RESUMED:
          case EVENTS.QUEUE_CLOSED: {
            const myTok = [...myTokenIds].length
              ? (await activeTokensForUser(user.id)).find((x) => x.queueId === p.queueId)
              : null;
            if (myTok) {
              const key = `${msg.type}-${p.queueId}`;
              const title =
                msg.type === EVENTS.QUEUE_PAUSED
                  ? t('notif.pausedT')
                  : msg.type === EVENTS.QUEUE_RESUMED
                    ? t('notif.resumedT')
                    : t('notif.closedT');
              const body =
                msg.type === EVENTS.QUEUE_PAUSED
                  ? t('notif.pausedB')
                  : msg.type === EVENTS.QUEUE_RESUMED
                    ? t('notif.resumedB')
                    : t('notif.closedB');
              // translated body needs queue name
              const q = await storage.get('queues', p.queueId);
              fire(key, title, body.replace('{queue}', q?.name || ''), { tag: 'queue-status', icon: 'ℹ️' });
            }
            break;
          }
          case EVENTS.ANNOUNCEMENT: {
            const myTok = (await activeTokensForUser(user.id)).find((x) => x.queueId === p.queueId);
            if (myTok || isAdmin) {
              const anns = await recentAnnouncements(p.queueId, 1);
              const text = anns[0] ? localizedText(anns[0], lang) : p.messageEn;
              fire(`ann-${p.announcementId}`, t('notif.annT'), text, { tag: 'announcement', icon: '📢' });
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('[watcher]', err);
      }
    });

    // Admin: enforce the no-show grace timer once at boot + after calls.
    let noShowTimer = null;
    if (isAdmin) {
      autoSkipExpired().catch(() => {});
      noShowTimer = setInterval(() => {
        if (!document.hidden) autoSkipExpired().catch(() => {});
      }, 30000);
    }

    return () => {
      unsub();
      clearInterval(interval);
      if (noShowTimer) clearInterval(noShowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sound, travelMinutes, lang, t]);

  return null;
}
