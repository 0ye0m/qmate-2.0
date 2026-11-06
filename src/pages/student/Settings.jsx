import { useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, UserRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useI18n, LANGS } from '../../i18n/I18nProvider';
import { updateProfile } from '../../services/auth/authService';
import {
  notificationPermission,
  requestNotificationPermission,
} from '../../services/notifications/notificationService';
import Card, { SectionTitle } from '../../components/common/Card';
import { Input, Select } from '../../components/common/Input';
import Toggle from '../../components/common/Toggle';
import Button from '../../components/common/Button';
import { DEPARTMENTS, YEARS } from '../../utils/constants';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const ui = useUiStore();
  const [form, setForm] = useState({ name: user.name, department: user.department, year: user.year });
  const [busy, setBusy] = useState(false);
  const perm = notificationPermission();

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateProfile(user.id, form);
      await refreshUser();
      toast.success(t('settings.saved'));
    } catch (err) {
      toast.error(t('errors.GENERIC'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('settings.title')}</h1>

      <Card>
        <SectionTitle title={t('settings.profile')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label={t('auth.name')}
            name="profileName"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label={t('auth.department')}
            name="profileDept"
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
          <Select
            label={t('auth.year')}
            name="profileYear"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
            options={YEARS.map((y) => ({ value: y, label: `Year ${y}` }))}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={saveProfile} loading={busy}>
            <UserRound size={14} aria-hidden="true" />
            {t('common.save')}
          </Button>
          <span className="text-xs text-slate-400">{user.email} · {user.role}</span>
        </div>
      </Card>

      <Card>
        <SectionTitle title={t('settings.prefs')} />
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('settings.language')}</span>
            <Select
              name="langSetting"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              options={LANGS}
              className="w-40"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('settings.theme')}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('settings.theme')}>
              {[['light', t('settings.themeLight')], ['dark', t('settings.themeDark')], ['system', t('settings.themeSystem')]].map(
                ([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={ui.theme === val}
                    onClick={() => ui.setTheme(val)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 transition ${
                      ui.theme === val
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('settings.eco')}</span>
            <Toggle checked={ui.eco} onChange={ui.setEco} id="eco-setting" label={ui.eco ? 'ON' : 'OFF'} />
          </div>
          <p className="-mt-3 text-xs text-slate-400 dark:text-slate-500">{t('green.ecoDesc')}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('settings.sound')}</span>
            <Toggle checked={ui.sound} onChange={ui.setSound} id="sound-setting" label={ui.sound ? 'ON' : 'OFF'} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t('settings.travel')}
              <span className="block text-xs font-normal text-slate-400">{t('settings.travelHint')}</span>
            </span>
            <input
              type="number"
              min={1}
              max={120}
              value={ui.travelMinutes}
              onChange={(e) => ui.setTravelMinutes(e.target.value)}
              aria-label={t('settings.travel')}
              className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('settings.notifications')}</span>
            <Button
              size="sm"
              variant={perm === 'granted' ? 'secondary' : 'primary'}
              disabled={perm === 'denied' || perm === 'granted'}
              onClick={() => requestNotificationPermission()}
            >
              <BellRing size={14} aria-hidden="true" />
              {perm === 'granted' ? t('settings.enabled') : perm === 'denied' ? t('settings.blocked') : t('settings.enable')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title={t('settings.pwa')} />
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.pwaHint')}</p>
      </Card>
    </div>
  );
}
