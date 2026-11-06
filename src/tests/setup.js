import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom lacks WebCrypto subtle — borrow Node's for PBKDF2 in tests.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

// jsdom lacks matchMedia — react-hot-toast + theme code need it.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom lacks scrollTo on elements
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom lacks navigator.locks — the mutex falls back to localStorage (by design).
