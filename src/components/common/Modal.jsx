import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Accessible modal: role=dialog, Esc to close, backdrop click, autofocus
 * of first focusable element, focus return on close.
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('input, select, textarea, button:not([data-close])');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && node) {
        const focusables = node.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const list = [...focusables].filter((el) => !el.disabled);
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={`relative w-full ${width} max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-800 sm:rounded-3xl`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            data-close
            aria-label={t('a11y.close')}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
