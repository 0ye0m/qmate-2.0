/**
 * Safe JSON extraction from LLM output: strips code fences, slices to the
 * first balanced object/array, fixes trailing commas, and never throws.
 * @returns {any|null} parsed value or null
 */
export function repairJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();

  const candidates = [];
  const obj = s.indexOf('{');
  const arr = s.indexOf('[');
  const start = Math.min(obj === -1 ? Infinity : obj, arr === -1 ? Infinity : arr);
  if (start !== Infinity) candidates.push(s.slice(start));

  for (const raw of candidates) {
    // slice to first balanced close
    let depth = 0;
    let inStr = false;
    let esc = false;
    let lastGood = -1;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          lastGood = i;
          break;
        }
      }
    }
    const sliced = lastGood > 0 ? raw.slice(0, lastGood + 1) : raw;
    const attempts = [
      sliced,
      sliced.replace(/,\s*([}\]])/g, '$1'), // trailing commas
      sliced.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' '),
    ];
    for (const t of attempts) {
      try {
        return JSON.parse(t);
      } catch {
        /* try next */
      }
    }
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** djb2-style string hash — used for AI cache keys (not cryptographic). */
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
