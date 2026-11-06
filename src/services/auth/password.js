/**
 * PBKDF2-SHA256 password hashing via WebCrypto, per-user random salt.
 * Iterations and output size are fixed; compare with a constant-time-ish
 * string compare to avoid trivial timing leaks.
 */
import { PBKDF2_ITERATIONS } from '../../utils/constants';

function subtle() {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;
  if (c && c.subtle) return c.subtle;
  throw new Error('WebCrypto unavailable in this environment');
}

export function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveHex(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToHex(bits);
}

export async function hashPassword(password) {
  const salt = randomSaltHex(16);
  const hash = await deriveHex(password, salt);
  return { hash, salt };
}

export async function verifyPassword(password, expectedHash, saltHex) {
  try {
    const actual = await deriveHex(password, saltHex);
    if (actual.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
