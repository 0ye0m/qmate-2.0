import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="text-center">
        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <Compass size={30} aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('notfound.title')}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('notfound.sub')}</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"
        >
          {t('notfound.home')}
        </Link>
      </div>
    </div>
  );
}
