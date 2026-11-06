import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

const MEDIA = '(prefers-color-scheme: dark)';

/** Applies theme + eco flags to <html>; keeps system mode reactive. */
export function useTheme() {
  const theme = useUiStore((s) => s.theme);
  const eco = useUiStore((s) => s.eco);

  useEffect(() => {
    const mq = window.matchMedia(MEDIA);
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#042f2e' : '#0d9488');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.eco = eco ? 'on' : 'off';
  }, [eco]);
}
