import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Menu, Sun, Moon, Monitor, LogOut, Languages, Leaf, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { useI18n, LANGS } from '../../i18n/I18nProvider';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useOnline } from '../../hooks/useEventBus';
import AiStatusBadge from '../common/AiStatusBadge';
import { initialsOf } from '../../utils/format';
import { ROLE_LABELS } from './roleLabels';

export default function TopBar({ onMenu }) {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const eco = useUiStore((s) => s.eco);
  const setEco = useUiStore((s) => s.setEco);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const online = useOnline();
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const langRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  const doLogout = async () => {
    await logout();
    toast.success(t('nav.logout'));
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85">
      <button
        type="button"
        onClick={onMenu}
        aria-label={t('nav.menu')}
        className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
      >
        <Menu size={20} />
      </button>

      <span className="flex items-center gap-1.5 lg:hidden">
        <span className="text-sm font-extrabold text-brand-700 dark:text-brand-400">Q-Mate</span>
      </span>

      <span className="hidden items-center gap-1.5 sm:flex" title={online ? t('common.online') : t('common.offline')}>
        {online ? (
          <Wifi size={15} className="text-emerald-500" aria-hidden="true" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <WifiOff size={11} aria-hidden="true" />
            {t('common.offline')}
          </span>
        )}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden md:inline-flex">
          <AiStatusBadge compact />
        </span>
        <button
          type="button"
          onClick={() => setEco(!eco)}
          aria-pressed={eco}
          aria-label={t('a11y.eco')}
          title={t('green.ecoDesc')}
          className={`rounded-xl p-2 transition ${
            eco
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Leaf size={18} />
        </button>
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={t('a11y.theme')}
          title={t('settings.theme')}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ThemeIcon size={18} />
        </button>

        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={langOpen}
            aria-label={t('a11y.lang')}
            className="rounded-xl px-2 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="inline-flex items-center gap-1">
              <Languages size={16} aria-hidden="true" />
              {lang}
              <ChevronDown size={12} aria-hidden="true" />
            </span>
          </button>
          {langOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-30 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className={`block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-brand-50 dark:hover:bg-slate-700 ${
                    lang === l.code ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {user && (
          <div className="relative" ref={userRef}>
            <button
              type="button"
              onClick={() => setUserOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              className="ml-1 flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-left md:block">
                <span className="block max-w-[120px] truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                  {user.name}
                </span>
                <span className="block text-[10px] font-semibold uppercase text-brand-600 dark:text-brand-400">
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              </span>
              <ChevronDown size={13} className="hidden text-slate-400 md:block" aria-hidden="true" />
            </button>
            {userOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{user.email}</p>
                  <p className="text-xs text-slate-400">{user.department}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={doLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  <LogOut size={15} aria-hidden="true" />
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
