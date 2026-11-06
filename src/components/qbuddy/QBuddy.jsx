import { useEffect, useRef, useState } from 'react';
import { Bot, Mic, Send, X, Sparkles } from 'lucide-react';
import { qbuddyAnswer } from '../../services/ai/aiFeatures';
import { useQueueStore } from '../../store/queueStore';
import { useUiStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/I18nProvider';
import { suggestForQueue } from '../../services/green/peakFlattener';
import AiStatusBadge from '../common/AiStatusBadge';

function SpeechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Q-Buddy — floating assistant. Knows the live queue list + documents +
 * low-crowd windows. Gemini when keys exist, keyword engine otherwise.
 * Voice input via Web Speech API (feature-detected).
 */
export default function QBuddy() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chips, setChips] = useState([]);
  const scrollRef = useRef(null);
  const recogRef = useRef(null);
  const windowsRef = useRef({});
  const queues = useQueueStore((s) => s.queues);
  const stats = useQueueStore((s) => s.stats);
  const version = useQueueStore((s) => s.version);
  const eco = useUiStore((s) => s.eco);

  useEffect(() => {
    setMessages([{ role: 'assistant', text: t('qbuddy.sub') + ' 🌿' }]);
    setChips([t('qbuddy.chip1'), t('qbuddy.chip2'), t('qbuddy.chip3')]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // refresh best-window cache when the queue list changes (not per message)
  useEffect(() => {
    if (!version) return;
    let alive = true;
    (async () => {
      const next = {};
      for (const q of queues.filter((x) => x.status === 'active').slice(0, 6)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const sug = await suggestForQueue(q);
          next[q.id] = sug.windows;
        } catch {
          next[q.id] = [];
        }
      }
      if (alive) windowsRef.current = next;
    })();
    return () => {
      alive = false;
    };
  }, [version, queues]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: eco ? 'auto' : 'smooth' });
  }, [messages, open, eco]);

  const ask = async (question) => {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const ctx = queues.map((queue) => ({
        id: queue.id,
        name: queue.name,
        department: queue.department,
        status: queue.status,
        requiredDocs: queue.requiredDocs,
        etaMin: stats[queue.id]?.etaMin ?? null,
      }));
      const res = await qbuddyAnswer({ question: q, queues: ctx, lang, windows: windowsRef.current });
      setMessages((m) => [...m, { role: 'assistant', text: res.answer, mode: res.mode }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: t('errors.AI_UNAVAILABLE'), mode: 'fallback' }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) {
      setMessages((m) => [...m, { role: 'assistant', text: '🎙️ ' + t('qbuddy.voice') + ' — not supported in this browser' }]);
      return;
    }
    if (listening) {
      recogRef.current?.stop?.();
      setListening(false);
      return;
    }
    try {
      const recog = new Ctor();
      recogRef.current = recog;
      recog.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.onresult = (e) => {
        const said = e.results?.[0]?.[0]?.transcript || '';
        if (said) ask(said);
      };
      recog.onend = () => setListening(false);
      recog.onerror = () => setListening(false);
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('qbuddy.title')}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/30 transition hover:scale-105 lg:bottom-6 lg:right-6"
        >
          <Bot size={26} aria-hidden="true" />
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-[10px] text-white">
            <Sparkles size={11} aria-hidden="true" />
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 lg:bottom-6"
          role="dialog"
          aria-label={t('qbuddy.title')}
        >
          <div className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-white">
            <Bot size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold leading-none">{t('qbuddy.title')}</p>
              <p className="text-[11px] text-brand-100">{t('qbuddy.sub')}</p>
            </div>
            <AiStatusBadge compact />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('a11y.close')}
              className="rounded-lg p-1.5 hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-slate-900/50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-brand-600 text-white'
                      : 'rounded-bl-sm bg-white text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="animate-pulseSoft rounded-2xl bg-white px-3.5 py-2 text-sm text-slate-400 shadow-sm dark:bg-slate-700">
                  •••
                </div>
              </div>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 dark:border-slate-700">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => ask(c)}
                  className="whitespace-nowrap rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={t('qbuddy.voice')}
              aria-pressed={listening}
              className={`rounded-xl p-2.5 transition ${
                listening
                  ? 'animate-pulseSoft bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              <Mic size={17} aria-hidden="true" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? t('qbuddy.listening') : t('qbuddy.ph')}
              aria-label={t('qbuddy.ph')}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900/60 dark:text-white"
            />
            <button
              type="submit"
              aria-label={t('qbuddy.send')}
              disabled={!input.trim() || busy}
              className="rounded-xl bg-brand-600 p-2.5 text-white transition hover:bg-brand-700 disabled:opacity-40"
            >
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
