import { useEffect, useRef, useState } from 'react';
import { Keyboard, QrCode, RefreshCw, ShieldAlert } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Input } from '../common/Input';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * QR check-in scanner (admin) — TWO SEPARATE modes, never both at once:
 *   • "Scan QR"      → camera only. No text input is rendered, so the
 *                      mobile keyboard can never pop up over the viewfinder
 *                      (the old combined view fought the camera and made
 *                      the keyboard bounce up/down on phones).
 *   • "Enter code"   → keyboard only. Camera is fully stopped first.
 * Modes are explicit tabs with large touch targets (mobile-first); the
 * camera stream is stopped and cleared on every mode switch and on close.
 */
export default function ScannerModal({ open, onClose, onResult }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('scan'); // 'scan' | 'manual'
  const [manual, setManual] = useState('');
  const [camError, setCamError] = useState(null);
  const [starting, setStarting] = useState(false);
  const scannerRef = useRef(null);
  const manualRef = useRef(null);
  const divId = 'qmate-qr-region';
  const cameraActive = open && mode === 'scan';

  // Manual mode = user explicitly asked for the keyboard: focus the field
  // once the mode is active (never while the camera view is shown).
  useEffect(() => {
    if (mode === 'manual') {
      const id = setTimeout(() => manualRef.current?.focus?.(), 50);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [mode]);

  // Every open starts clean: Scan tab, empty field, no stale camera error.
  useEffect(() => {
    if (open) {
      setMode('scan');
      setManual('');
      setCamError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!cameraActive) {
      // Leaving scan mode (or closing): stop the stream, release the camera.
      try {
        const s = scannerRef.current;
        if (s) {
          const done = s.stop?.();
          done?.then?.(() => s.clear?.()).catch(() => {
            try { s.clear?.(); } catch { /* ignore */ }
          });
        }
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
      setStarting(false);
      return undefined;
    }
    let cancelled = false;
    setCamError(null);
    setStarting(true);
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(divId, { verbose: false });
        scannerRef.current = scanner;
        // Responsive qrbox: ~70% of the viewfinder, clamped for phones.
        const box = (vw, vh) => {
          const side = Math.max(140, Math.min(260, Math.floor(Math.min(vw, vh) * 0.7)));
          return { width: side, height: side };
        };
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: box },
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
        if (!cancelled) setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setCamError(err?.message || 'Camera unavailable');
          setStarting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        const s = scannerRef.current;
        if (s) {
          const done = s.stop?.();
          done?.then?.(() => s.clear?.()).catch(() => {
            try { s.clear?.(); } catch { /* ignore */ }
          });
        }
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  const submitManual = () => {
    if (!manual.trim()) return;
    onResult?.(null, manual.trim());
    onClose?.();
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setManual('');
    setCamError(null);
    setMode(next);
  };

  const tabs = [
    { id: 'scan', label: t('scanner.tabScan'), icon: QrCode },
    { id: 'manual', label: t('scanner.tabManual'), icon: Keyboard },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('console.scan')}>
      {/* mode switch — the ONLY entry points, deliberately separate */}
      <div
        role="tablist"
        aria-label={t('console.scan')}
        className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-900/60"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
              mode === id
                ? 'bg-brand-600 text-white shadow'
                : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'scan' ? (
        <div className="space-y-3">
          <div
            id={divId}
            className="mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl bg-slate-900/5 dark:bg-slate-900/40"
            aria-label="QR scanner viewport"
          />
          {starting && !camError && (
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              {t('scanner.startingCamera')}
            </p>
          )}
          {camError && (
            <div className="space-y-3 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <p className="flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {t('scanner.cameraError')} — {camError}
              </p>
              <Button size="sm" variant="secondary" onClick={() => switchMode('manual')}>
                <Keyboard size={14} aria-hidden="true" />
                {t('scanner.useManualInstead')}
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">{t('scanner.scanHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('scanner.manualHint')}</p>
          <Input
            ref={manualRef}
            name="manualToken"
            label={t('console.manual')}
            placeholder={t('console.manualPh')}
            autoComplete="off"
            inputMode="text"
            enterKeyHint="go"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitManual()}
          />
          <Button className="w-full" size="lg" disabled={!manual.trim()} onClick={submitManual}>
            {t('common.confirm')}
          </Button>
        </div>
      )}
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
