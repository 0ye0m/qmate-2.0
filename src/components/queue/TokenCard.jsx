import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download } from 'lucide-react';
import Button from '../common/Button';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Digital token card with QR — downloadable as a composed PNG image
 * (everything drawn locally on a canvas, no network).
 */
export default function TokenCard({ token, queue, compact = false }) {
  const { t } = useI18n();
  const qrWrapRef = useRef(null);

  const qrValue = `QMT:${token.id}:${token.code}`;

  const download = () => {
    try {
      const qrCanvas = qrWrapRef.current?.querySelector('canvas');
      if (!qrCanvas) return;
      const W = 480;
      const H = 680;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');

      // background
      ctx.fillStyle = '#f0fdfa';
      ctx.fillRect(0, 0, W, H);
      // header band
      const grad = ctx.createLinearGradient(0, 0, W, 220);
      grad.addColorStop(0, '#0d9488');
      grad.addColorStop(1, '#0f766e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText('Q-Mate 2.0', 32, 56);
      ctx.font = '500 20px system-ui, sans-serif';
      ctx.globalAlpha = 0.9;
      ctx.fillText(queue?.name || token.queueName || 'Queue', 32, 92);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(`#${token.number}`, 32, 170);

      // token code pill
      ctx.fillStyle = '#134e4a';
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.fillText(token.code, 32, 248);

      // QR
      const side = 280;
      const qrSize = Math.min(side, qrCanvas.width);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qrCanvas, (W - qrSize) / 2, 290, qrSize, qrSize);

      // footer
      ctx.fillStyle = '#0f766e';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText('Wait Less, Do More.', 32, H - 64);
      ctx.fillStyle = '#64748b';
      ctx.font = '400 14px system-ui, sans-serif';
      ctx.fillText('Show this QR at the counter for instant check-in.', 32, H - 36);

      const url = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `qmate-token-${token.code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('[token-card] download failed', err);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg dark:border-brand-800">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-200">{queue?.name || token.queueName}</p>
            <p className="mt-1 text-5xl font-extrabold leading-none tracking-tight" aria-label={`Token ${token.number}`}>
              #{token.number}
            </p>
            <p className="mt-2 font-mono text-lg font-bold text-brand-100">{token.code}</p>
          </div>
          {!compact && (
            <div ref={qrWrapRef} className="rounded-xl bg-white p-2">
              <QRCodeCanvas value={qrValue} size={96} includeMargin={false} aria-label={`QR code for token ${token.code}`} />
            </div>
          )}
        </div>
        {!compact && (
          <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={download}>
            <Download size={15} aria-hidden="true" />
            {t('status.downloadCard')}
          </Button>
        )}
      </div>
    </div>
  );
}
