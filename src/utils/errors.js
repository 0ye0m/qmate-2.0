/**
 * Application error with a stable code. UI translates codes through i18n
 * (`errors.<CODE>`) so the same message works in English/Hindi/Marathi.
 */
export class AppError extends Error {
  constructor(code, meta = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

export const ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  BAD_EMAIL: 'BAD_EMAIL',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  QUEUE_NOT_FOUND: 'QUEUE_NOT_FOUND',
  QUEUE_NOT_ACTIVE: 'QUEUE_NOT_ACTIVE',
  QUEUE_FULL: 'QUEUE_FULL',
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  NO_FREE_COUNTER: 'NO_FREE_COUNTER',
  NO_WAITING_TOKENS: 'NO_WAITING_TOKENS',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  COUNTER_BUSY: 'COUNTER_BUSY',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  PREBOOK_DUPLICATE: 'PREBOOK_DUPLICATE',
  PREBOOK_FULL: 'PREBOOK_FULL',
  PREBOOK_NOT_FOUND: 'PREBOOK_NOT_FOUND',
  VALIDATION: 'VALIDATION',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  NETWORK: 'NETWORK',
  GENERIC: 'GENERIC',
};

export function describeError(err) {
  if (err instanceof AppError) return err.code;
  if (err && typeof err.message === 'string' && err.message.length < 64) return err.message;
  return 'GENERIC';
}

export function isAppError(err) {
  return err instanceof AppError;
}
