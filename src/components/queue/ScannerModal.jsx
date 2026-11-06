import { useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Input } from '../common/Input';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * QR check-in scanner (admin). Lazy-loads html5-qrcode only when opened;
 * manual code entry always available (demo rooms rarely have webcams).
 */
export default function ScannerModal({ open, onClose, onResult }) {
  const { t } = useI18n();
  const [manual, setManual] = useState('');
  const [camError, setCamError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const divId = 'qmate-qr-region';

  useEffect(() => {
    if (!open) {
      try {
        scannerRef.current?.stop?.().catch(() => {});
        scannerRef.current?.clear?.();
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
      setScanning(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(divId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            const tokenId = parseQr(decodedText);
            if (tokenId) {
              onResult?.(tokenId, decodedText);
              onClose?.();
            }
          },
          () => {
            /* per-frame decode misses — ignore */
          }
        );
        if (!cancelled) setScanning(true);
      } catch (err) {
        if (!cancelled) setCamError(err?.message || 'Camera unavailable');
      }
    })();
    return () => {
      cancelled = true;
      try {
        scannerRef.current
          ?.stop?.()
          .then(() => scannerRef.current?.clear?.())
          .catch(() => {});
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submitManual = () => {
    if (!manual.trim()) return;
    onResult?.(null, manual.trim());
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('console.scan')}>
      <div className="space-y-4">
        <div
          id={divId}
          className="mx-auto min-h-[180px] w-full overflow-hidden rounded-xl bg-slate-900/5 dark:bg-slate-900/40"
          aria-label="QR scanner viewport"
        />
        {!scanning && !camError && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        )}
        {camError && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {t('errors.GENERIC')} — {camError}
          </p>
        )}
        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{t('console.manual')}</p>
          <div className="flex gap-2">
            <Input
              name="manualToken"
              placeholder={t('console.manualPh')}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              className="flex-1"
            />
            <Button onClick={submitManual}>{t('common.confirm')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Accepts full "QMT:<tokenId>:<code>" payloads or bare codes like EXF-104. */
export function parseQr(text) {
  if (typeof text !== 'string') return null;
  if (text.startsWith('QMT:')) {
    const parts = text.split(':');
    return parts[1] || null;
  }
  return null;
}

export function findTokenByCode(tokens, raw) {
  const clean = String(raw).trim().toUpperCase();
  return tokens.find((t) => t.code.toUpperCase() === clean || t.id === clean);
}
