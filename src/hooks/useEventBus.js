import { useEffect, useState } from 'react';
import { eventBus } from '../services/realtime/EventBus';

/** Subscribe to the EventBus with automatic cleanup. */
export function useEventBus(handler, deps = []) {
  useEffect(() => {
    const unsub = eventBus.on(handler);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Ticking timestamp for countdowns/ETAs (slows down in Eco Mode). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** navigator.onLine + events — used by the offline chip and UX copy. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
