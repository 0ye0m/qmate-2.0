/**
 * AUTH STORE — wraps authService; route guards read `user`/`booted`.
 */
import { create } from 'zustand';
import * as authService from '../services/auth/authService';
import { eventBus, EVENTS } from '../services/realtime/EventBus';

let unsubEvents = null;

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  booted: false,

  async boot() {
    try {
      const res = await authService.restore();
      set({ user: res?.user || null, session: res?.session || null, booted: true });
    } catch (err) {
      console.error('[auth] boot failed', err);
      set({ user: null, session: null, booted: true });
    }
    if (unsubEvents) unsubEvents();
    unsubEvents = eventBus.on((msg) => {
      if (msg.type !== EVENTS.USER_UPDATED) return;
      const u = get().user;
      if (!u) return;
      if (msg.payload?.userId && msg.payload.userId !== u.id) return;
      authService
        .getUserById(u.id)
        .then((fresh) => {
          if (fresh) set({ user: fresh });
          else set({ user: null, session: null });
        })
        .catch(() => {});
    });
  },

  async login(email, password) {
    const { user, session } = await authService.login(email, password);
    set({ user, session });
    return user;
  },

  async register(payload) {
    const { user, session } = await authService.register(payload);
    set({ user, session });
    return user;
  },

  async logout() {
    const token = get().session?.token;
    await authService.logout(token);
    set({ user: null, session: null });
  },

  async refreshUser() {
    const u = get().user;
    if (!u) return;
    const fresh = await authService.getUserById(u.id);
    if (fresh) set({ user: fresh });
  },

  setUser(user) {
    set({ user });
  },
}));
