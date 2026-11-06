import { describe, it, expect } from 'vitest';
import { repairJson, hashString } from '../../utils/jsonRepair';

describe('repairJson (safe LLM JSON extraction)', () => {
  it('parses clean JSON', () => {
    expect(repairJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown code fences', () => {
    expect(repairJson('```json\n{"answer":"hi"}\n```')).toEqual({ answer: 'hi' });
  });

  it('recovers from trailing commas', () => {
    expect(repairJson('{"items":[1,2,3,],}')).toEqual({ items: [1, 2, 3] });
  });

  it('slices leading prose before the first brace', () => {
    expect(repairJson('Sure! Here is the JSON: {"ok":true}')).toEqual({ ok: true });
  });

  it('returns null for garbage instead of throwing', () => {
    expect(repairJson('not json at all')).toBeNull();
    expect(repairJson('{"broken": ')).toBeNull();
    expect(repairJson(null)).toBeNull();
    expect(repairJson(42)).toBeNull();
  });

  it('handles nested objects and strings with braces', () => {
    const obj = repairJson('{"a":{"b":"x{y}z"},"c":[1,{"d":2}]}');
    expect(obj.a.b).toBe('x{y}z');
    expect(obj.c[1].d).toBe(2);
  });

  it('hashString is stable and distinct', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
