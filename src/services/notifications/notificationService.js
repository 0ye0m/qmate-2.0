/**
 * NOTIFICATIONS — event-driven alerts (replaces the broken "every 3 min"
 * polling). Channels: Web Notification + short WebAudio chime + vibration
 * + in-app toast (toast fired by the caller so UI stays decoupled).
 * All calls are feature-detected and wrapped — a missing API never throws.
 */

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function vibrate(pattern = [120, 60, 120]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported */
  }
}

let audioCtx = null;
export function beep({ freq = 880, duration = 0.14, times = 1, gap = 0.12 } = {}) {
  try {
    const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    for (let i = 0; i < times; i++) {
      const t0 = audioCtx.currentTime + i * (duration + gap);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }
  } catch {
    /* audio blocked — silent fallback */
  }
}

export function pushNotification({ title, body, tag }) {
  try {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      renotify: true,
    });
    setTimeout(() => n.close().catch?.(() => {}), 8000);
  } catch {
    /* notification API failure is never fatal */
  }
}

/** Fire all channels at once. Returns 'toast' hint for the caller. */
export function alertAll({ title, body, tag, sound = true, vibr = true }) {
  pushNotification({ title, body, tag });
  if (sound) beep({ times: tag === 'called' ? 3 : 1 });
  if (vibr) vibrate();
}
