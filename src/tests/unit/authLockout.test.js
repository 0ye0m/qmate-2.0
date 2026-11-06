import { describe, it, expect, beforeEach } from 'vitest';
import { register, login } from '../../services/auth/authService';
import { storage } from '../../services/storage';
import { AppError } from '../../utils/errors';
import { MAX_FAILED_ATTEMPTS, LOCKOUT_MS } from '../../utils/constants';
import { freshDb } from '../helpers';

describe('auth lockout (5 strikes → 15 min)', () => {
  beforeEach(freshDb);

  it('gives a clear error for wrong credentials and counts attempts', async () => {
    await register({ name: 'Lock Me', email: 'lock@test.local', password: 'Password1', department: 'CSE', year: 1 });
    await expect(login('lock@test.local', 'WrongPass1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(login('nobody@test.local', 'Whatever1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const user = await storage.table('users').where('email').equals('lock@test.local').first();
    expect(user.failedAttempts).toBe(1);
  });

  it('locks the account after MAX_FAILED_ATTEMPTS with a 15-min window', async () => {
    await register({ name: 'Lock Me', email: 'lock2@test.local', password: 'Password1', department: 'CSE', year: 1 });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(login('lock2@test.local', 'nope')).rejects.toBeInstanceOf(AppError);
    }
    const user = await storage.table('users').where('email').equals('lock2@test.local').first();
    expect(user.lockedUntil).toBeGreaterThan(Date.now());
    expect(user.lockedUntil).toBeLessThanOrEqual(Date.now() + LOCKOUT_MS + 1000);

    // even the CORRECT password is rejected while locked
    await expect(login('lock2@test.local', 'Password1')).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('reports remaining minutes in the error meta', async () => {
    await register({ name: 'Lock Me', email: 'lock3@test.local', password: 'Password1', department: 'CSE', year: 1 });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(login('lock3@test.local', 'nope')).rejects.toBeInstanceOf(AppError);
    }
    const err = await login('lock3@test.local', 'Password1').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('ACCOUNT_LOCKED');
    expect(err.meta.minutes).toBeGreaterThanOrEqual(14);
    expect(err.meta.minutes).toBeLessThanOrEqual(15);
  });

  it('unlocks after the window passes and resets the counter on success', async () => {
    await register({ name: 'Lock Me', email: 'lock4@test.local', password: 'Password1', department: 'CSE', year: 1 });
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(login('lock4@test.local', 'nope')).rejects.toBeInstanceOf(AppError);
    }
    // simulate the 15 minutes passing
    const user = await storage.table('users').where('email').equals('lock4@test.local').first();
    await storage.table('users').update(user.id, { lockedUntil: Date.now() - 1000 });
    const { user: loggedIn } = await login('lock4@test.local', 'Password1');
    expect(loggedIn.email).toBe('lock4@test.local');
    const fresh = await storage.table('users').where('email').equals('lock4@test.local').first();
    expect(fresh.failedAttempts).toBe(0);
    expect(fresh.lockedUntil).toBe(0);
  });
});
