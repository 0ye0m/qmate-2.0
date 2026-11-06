import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Animated count-up for the landing "Green Impact" counters.
 * Respects Eco Mode + prefers-reduced-motion (jumps straight to value).
 */
export function useCountUp(target, duration = 1200) {
  const eco = useUiStore((s) => s.eco);
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (eco || reduced) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, eco]);

  return value;
}
