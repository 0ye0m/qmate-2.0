import { useState } from 'react';
import { ChevronDown, LifeBuoy, BellRing } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { notificationPermission, requestNotificationPermission } from '../../services/notifications/notificationService';
import Card, { SectionTitle } from '../../components/common/Card';
import Button from '../../components/common/Button';

const FAQ = ['help.q1', 'help.q2', 'help.q3', 'help.q4', 'help.q5'];

export default function Help() {
  const { t } = useI18n();
  const [openIdx, setOpenIdx] = useState(0);
  const perm = notificationPermission();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('help.title')}</h1>

      <Card>
        <SectionTitle title="🔔 Notifications" />
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Q-Mate alerts you the moment your token is near (3 ahead), called, or a queue you're in changes — no more
          "check every 3 minutes". Enable browser notifications for sound + vibration + system alerts.
        </p>
        <Button
          variant={perm === 'granted' ? 'secondary' : 'primary'}
          size="sm"
          disabled={perm === 'denied' || perm === 'granted'}
          onClick={() => requestNotificationPermission()}
        >
          <BellRing size={14} aria-hidden="true" />
          {perm === 'granted' ? t('settings.enabled') : perm === 'denied' ? t('settings.blocked') : t('settings.enable')}
        </Button>
      </Card>

      <div className="space-y-2.5">
        {FAQ.map((key, i) => (
          <Card key={key} className="p-0">
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
              aria-expanded={openIdx === i}
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left"
            >
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{t(key)}</span>
              <ChevronDown
                size={17}
                className={`shrink-0 text-slate-400 transition-transform ${openIdx === i ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {openIdx === i && (
              <p className="px-5 pb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t(key.replace('.q', '.a'))}</p>
            )}
          </Card>
        ))}
      </div>

      <Card className="flex items-start gap-3">
        <span className="rounded-xl bg-brand-100 p-2.5 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <LifeBuoy size={20} aria-hidden="true" />
        </span>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('help.contact')}</p>
      </Card>
    </div>
  );
}
