import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Leaf, UserPlus, ShieldAlert, ShieldCheck, MailCheck, ArrowLeft } from 'lucide-react';
import { Input, Select } from '../components/common/Input';
import Button from '../components/common/Button';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/I18nProvider';
import { describeError, AppError } from '../utils/errors';
import { APP, DEPARTMENTS, YEARS } from '../utils/constants';
import { sendOtp, verifyOtp } from '../services/mail/mailService';

const RESEND_SECONDS = 45;

/** Friendly text for any OTP-tier failure. */
function otpErrorText(err, t) {
  const code = String(err?.message || '');
  if (/^(OTP_TOO_SOON|OTP_RATE_LIMITED)$/.test(code)) return t('errors.OTP_TOO_SOON');
  if (/^OTP_MAX_ATTEMPTS$/.test(code)) return t('errors.OTP_MAX_ATTEMPTS');
  if (/^(OTP_NOT_FOUND|OTP_INVALID|RECEIPT_INVALID|BAD_REQUEST)$/.test(code)) return t('errors.OTP_INVALID');
  if (/^(SMTP_UNAVAILABLE|MAIL_UNREACHABLE|MAIL_\d+)$/.test(code)) return t('errors.SMTP_UNAVAILABLE');
  if (/^BAD_EMAIL$/.test(code)) return t('errors.BAD_EMAIL');
  return t(`errors.${describeError(err)}`);
}

export default function Signup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', department: 'CSE', year: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [code, setCode] = useState('');
  const [onscreenCode, setOnscreenCode] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'verify') codeRef.current?.focus?.();
  }, [step]);

  const validateLocal = () => {
    const fe = {};
    if (form.name.trim().length < 2) fe.name = t('errors.VALIDATION');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) fe.email = t('errors.BAD_EMAIL');
    const pw = form.password;
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) fe.password = t('errors.WEAK_PASSWORD');
    if (pw !== form.confirm) fe.confirm = t('auth.passwordMismatch');
    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  };

  const requestCode = async ({ silent } = {}) => {
    setError(null);
    setBusy(true);
    try {
      const out = await sendOtp(form.email.trim().toLowerCase(), 'signup', form.name.trim());
      setOnscreenCode(out.delivery === 'onscreen' ? out.onscreenCode : null);
      setResendIn(RESEND_SECONDS);
      setStep('verify');
      if (!silent) toast.success(t('auth.codeSentTo', { email: form.email.trim().toLowerCase() }), { icon: '📬' });
    } catch (err) {
      if (err instanceof AppError && err.code === 'VALIDATION' && err.meta?.field) {
        setFieldErrors({ [err.meta.field]: t('errors.VALIDATION') });
      } else {
        setError(otpErrorText(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = (e) => {
    e.preventDefault();
    setError(null);
    if (!validateLocal()) return;
    requestCode();
  };

  const submitVerify = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError(t('errors.OTP_INVALID'));
      return;
    }
    setBusy(true);
    try {
      const { receipt } = await verifyOtp(form.email.trim().toLowerCase(), 'signup', code);
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        department: form.department,
        year: form.year,
        verification: { email: form.email.trim().toLowerCase(), receipt },
      });
      toast.success(t('auth.verifiedToast') + ' 🌱');
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(otpErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const backToDetails = () => {
    setStep('details');
    setCode('');
    setOnscreenCode(null);
    setError(null);
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

          {step === 'details' ? (
            <>
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

              <form onSubmit={submitDetails} className="mt-5 space-y-4" noValidate>
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
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={set('email')}
                  error={fieldErrors.email}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </>
          ) : (
            <>
              <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20">
                <MailCheck size={22} aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-white">{t('auth.verifyTitle')}</h1>
              <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                {t('auth.verifySub', { email: form.email.trim().toLowerCase() })}
              </p>

              {onscreenCode && (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 text-center ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-800">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('auth.onscreenNotice')}</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-[0.35em] text-slate-900 dark:text-white">{onscreenCode}</p>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800"
                >
                  <ShieldAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <form onSubmit={submitVerify} className="mt-5 space-y-4" noValidate>
                <Input
                  ref={codeRef}
                  label={t('auth.otpLabel')}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-lg font-bold tracking-[0.4em]"
                />
                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  <ShieldCheck size={17} aria-hidden="true" />
                  {t('auth.verifyBtn')}
                </Button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => requestCode({ silent: true })}
                  disabled={busy || resendIn > 0}
                  className="font-bold text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
                >
                  {resendIn > 0 ? t('auth.resendIn', { n: resendIn }) : t('auth.resendCode')}
                </button>
                <button
                  type="button"
                  onClick={backToDetails}
                  className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  {t('auth.changeEmail')}
                </button>
              </div>
            </>
          )}

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
