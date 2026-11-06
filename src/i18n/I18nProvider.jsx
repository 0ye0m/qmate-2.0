import { createContext, useCallback, useContext, useMemo } from 'react';
import { useUiStore } from '../store/uiStore';
import en from './en.json';
import hi from './hi.json';
import mr from './mr.json';
import { LANGS } from '../utils/constants';

const DICTS = { en, hi, mr };
const I18nContext = createContext(null);

/** Translate with dotted key + {var} interpolation. Falls back to English. */
function translate(lang, key, vars) {
  let str = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function I18nProvider({ children }) {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export { LANGS };
