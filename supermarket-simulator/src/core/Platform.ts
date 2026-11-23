// Native (Capacitor) integration with graceful web fallbacks.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

let vibrationEnabled = true;
export function setVibration(on: boolean) { vibrationEnabled = on; }

export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  if (!vibrationEnabled) return;
  if (isNative) {
    const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  } else if (navigator.vibrate) {
    try { navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 20 : 8); } catch { /* ignore */ }
  }
}

export async function nativeSetup(onPause: () => void, onResume: () => void, onBack: () => void) {
  if (!isNative) {
    document.addEventListener('visibilitychange', () => (document.hidden ? onPause() : onResume()));
    window.addEventListener('pagehide', onPause);
    return;
  }
  try { await StatusBar.hide(); } catch { /* not available */ }
  try { await ScreenOrientation.lock({ orientation: 'landscape' }); } catch { /* ignore */ }
  App.addListener('pause', onPause);
  App.addListener('resume', onResume);
  App.addListener('backButton', onBack);
  setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
}

/** Key-value persistence: native Preferences on device, localStorage on web. */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (isNative) {
      const r = await Preferences.get({ key });
      return r.value;
    }
    try { return localStorage.getItem(key); } catch { return memStore.get(key) ?? null; }
  },
  async set(key: string, value: string): Promise<void> {
    if (isNative) {
      await Preferences.set({ key, value });
      return;
    }
    try { localStorage.setItem(key, value); } catch { memStore.set(key, value); }
  },
  async remove(key: string): Promise<void> {
    if (isNative) {
      await Preferences.remove({ key });
      return;
    }
    try { localStorage.removeItem(key); } catch { memStore.delete(key); }
  },
};
const memStore = new Map<string, string>();

export function requestFullscreen() {
  if (isNative) return;
  const el = document.documentElement as any;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn && !document.fullscreenElement) {
    try {
      const p = fn.call(el);
      if (p && p.catch) p.catch(() => {});
      const so = (screen as any).orientation;
      if (so?.lock) so.lock('landscape').catch(() => {});
    } catch { /* ignore */ }
  }
}
