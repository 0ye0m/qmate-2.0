/** Collision-safe id generator (crypto UUID when available). */
export function uid(prefix = '') {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return `${prefix}${c.randomUUID()}`;
  const rnd = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}${rnd}`;
}
