import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Leaf, LogIn, ShieldAlert, UserRound, Lock } from 'lucide-react';
import { Input } from '../components/common/Input';
import Button from '../components/common/Button';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/I18nProvider';
import { describeError, AppError } from '../utils/errors';
import { APP } from '../utils/constants';

export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      toast.success(`${t('auth.loginTitle')} 🌿`);
      const dest = location.state?.from || '/app';
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof AppError && err.code === 'ACCOUNT_LOCKED' && err.meta?.minutes != null) {
        setError(t('errors.ACCOUNT_LOCKED', { min: err.meta.minutes }));
      } else {
        setError(t(`errors.${describeError(err)}`));
      }
    } finally {
      setBusy(false);
    }
  };

  const fill = (who) => {
    if (who === 'admin') {
      setEmail('admin@qmate.local');
      setPassword('Admin@123');
    } else {
      setEmail('student@qmate.local');
      setPassword('Student@123');
    }
    setError(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* brand side */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-10 text-white lg:flex">
        <div aria-hidden="true" className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <Link to="/" className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Leaf size={22} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xl font-extrabold">{APP.name}</span>
            <span className="block text-sm font-semibold text-brand-200">{APP.tagline}</span>
          </span>
        </Link>
        <div>
          <h2 className="max-w-md text-3xl font-extrabold leading-snug">{t('app.sub')}</h2>
          <ul className="mt-6 space-y-3 text-sm font-semibold text-brand-100">
            <li className="flex items-center gap-2">🎟️ Virtual tokens from anywhere on campus</li>
            <li className="flex items-center gap-2">📈 Self-correcting live ETA (±band)</li>
            <li className="flex items-center gap-2">🌱 Every token saves paper, fuel & hours</li>
          </ul>
        </div>
        <p className="text-xs text-brand-300">{APP.name} · {APP.tagline}</p>
      </div>

      {/* form side */}
      <div className="flex items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-900">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Leaf size={20} aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">{APP.name}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('auth.loginSub')}</p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800"
            >
              <ShieldAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Input
              label={t('auth.email')}
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label={t('auth.password')}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              <LogIn size={17} aria-hidden="true" />
              {t('auth.signIn')}
            </Button>
          </form>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fill('student')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:ring-brand-800"
            >
              <UserRound size={14} aria-hidden="true" />
              {t('auth.demoStudent')}
            </button>
            <button
              type="button"
              onClick={() => fill('admin')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
            >
              <Lock size={14} aria-hidden="true" />
              {t('auth.demoAdmin')}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
              {t('auth.signUp')}
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            student@qmate.local / Student@123 · admin@qmate.local / Admin@123
          </p>
        </div>
      </div>
    </div>
  );
}
