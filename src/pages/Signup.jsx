import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Leaf, UserPlus, ShieldAlert } from 'lucide-react';
import { Input, Select } from '../components/common/Input';
import Button from '../components/common/Button';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/I18nProvider';
import { describeError, AppError } from '../utils/errors';
import { APP, DEPARTMENTS, YEARS } from '../utils/constants';

export default function Signup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', department: 'CSE', year: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validateLocal = () => {
    const fe = {};
    if (form.name.trim().length < 2) fe.name = t('errors.VALIDATION');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) fe.email = t('errors.BAD_EMAIL');
    if (form.password.length < 8) fe.password = t('errors.WEAK_PASSWORD');
    if (form.password !== form.confirm) fe.confirm = t('auth.passwordMismatch');
    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validateLocal()) return;
    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        department: form.department,
        year: form.year,
      });
      toast.success(`${t('auth.signupTitle')} 🌱`);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof AppError && err.code === 'VALIDATION' && err.meta?.field) {
        setFieldErrors({ [err.meta.field]: t('errors.VALIDATION') });
      } else {
        setError(t(`errors.${describeError(err)}`));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-brand-700 to-brand-950 p-10 text-white lg:flex">
        <div aria-hidden="true" className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
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
          <h2 className="max-w-md text-3xl font-extrabold leading-snug">{t('landing.h2d')}</h2>
          <p className="mt-4 max-w-md text-sm text-brand-100">
            🌱 {t('landing.metricSheets')} · {t('landing.metricCo2')} · {t('landing.metricHours')}
          </p>
        </div>
        <p className="text-xs text-brand-300">{APP.name} · {APP.tagline}</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-900">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Leaf size={20} aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">{APP.name}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('auth.signupTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('auth.signupSub')}</p>

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
              label={t('auth.name')}
              name="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={set('name')}
              error={fieldErrors.name}
            />
            <Input
              label={t('auth.email')}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
              error={fieldErrors.email}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('auth.password')}
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={set('password')}
                error={fieldErrors.password}
              />
              <Input
                label={t('auth.confirmPassword')}
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={set('confirm')}
                error={fieldErrors.confirm}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('auth.department')}
                name="department"
                value={form.department}
                onChange={set('department')}
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              />
              <Select
                label={t('auth.year')}
                name="year"
                value={form.year}
                onChange={set('year')}
                options={YEARS.map((y) => ({ value: y, label: `Year ${y}` }))}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              <UserPlus size={17} aria-hidden="true" />
              {t('auth.signUp')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
              {t('auth.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
