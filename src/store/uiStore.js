/**
 * UI STORE — device-level preferences, persisted to localStorage.
 * (demo student's travel time lives here too — "enter once, notified right".)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as simulator from '../services/simulator/demoSimulator';

export const useUiStore = create(
  persist(
    (set, get) => ({
      theme: 'dark', // 'light' | 'dark' | 'system' — dark by default (better contrast)
      lang: 'en',
      eco: false,
      sound: true,
      emailAlerts: true,
      travelMinutes: 10,
      simulator: false,
      notifAsked: false,

      setTheme(theme) {
        set({ theme });
      },
      setLang(lang) {
        set({ lang });
        document.documentElement.lang = lang;
      },
      setEco(eco) {
        set({ eco });
        if (eco && get().simulator) {
          set({ simulator: false });
          simulator.stop();
        }
      },
      setSound(sound) {
        set({ sound });
      },
      setEmailAlerts(on) {
        set({ emailAlerts: !!on });
      },
      setTravelMinutes(minutes) {
        set({ travelMinutes: Math.max(1, Math.min(120, Number(minutes) || 1)) });
      },
      setSimulator(on) {
        set({ simulator: !!on });
        if (on && !get().eco) simulator.start();
        else simulator.stop();
      },
      setNotifAsked() {
        set({ notifAsked: true });
      },
    }),
    {
      name: 'qmate-ui',
      partialize: (s) => ({
        theme: s.theme,
        lang: s.lang,
        eco: s.eco,
        sound: s.sound,
        emailAlerts: s.emailAlerts,
        travelMinutes: s.travelMinutes,
        simulator: s.simulator,
        notifAsked: s.notifAsked,
      }),
    }
  )
);
