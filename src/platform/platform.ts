/**
 * Platform glue. The game is one web app; this file is the only place that
 * knows whether it is running in a desktop browser, a phone browser or the
 * Android APK's WebView.
 *
 * Back button (Android hardware/gesture back, browser back, Esc): the game keeps
 * exactly one extra browser-history entry while it has something to go back to
 * (a dialog, a sheet, a previous screen). The APK's native shell calls
 * WebView.goBack() when that entry exists and closes the app when it does not,
 * so "back" always does the natural thing. When the app is paused the shell
 * calls window.cdmSave() so progress is never lost.
 */

export const isAndroidApp = /CDMTAndroid|; wv\)/.test(navigator.userAgent) || location.protocol === 'file:' && /Android/.test(navigator.userAgent);
export const isTouch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

type BackHandler = () => boolean;
const handlers: BackHandler[] = [];
let baseTitle = 'Car Dealership Manager Tycoon';

/** Registers something that can consume a back press (topmost first). Returns an unregister function. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  updateTitle();
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
    updateTitle();
  };
}

let routeCanGoBack: () => boolean = () => false;
let routeBack: () => void = () => undefined;

export function setRouteBack(can: () => boolean, back: () => void): void {
  routeCanGoBack = can;
  routeBack = back;
  updateTitle();
}

export function canGoBack(): boolean {
  return handlers.length > 0 || routeCanGoBack();
}

export function handleBack(): boolean {
  while (handlers.length) {
    const h = handlers[handlers.length - 1];
    if (h()) {
      updateTitle();
      return true;
    }
    handlers.pop();
  }
  if (routeCanGoBack()) {
    routeBack();
    updateTitle();
    return true;
  }
  updateTitle();
  return false;
}

export function setBaseTitle(title: string): void {
  baseTitle = title;
  updateTitle();
}

let armed = false;
let ignorePop = 0;

/** Keeps one history entry while there is somewhere to go back to, none otherwise. */
function syncHistory(): void {
  try {
    if (canGoBack() && !armed) {
      history.pushState({ cdmt: 1 }, '');
      armed = true;
    } else if (!canGoBack() && armed) {
      armed = false;
      // Only step back off our own entry — never off the page itself.
      if ((history.state as { cdmt?: number } | null)?.cdmt) {
        ignorePop += 1;
        history.back();
      }
    }
  } catch {
    /* history API unavailable: in-game back buttons still work */
  }
}

export function updateTitle(): void {
  document.title = baseTitle;
  syncHistory();
}

let saveHook: () => void = () => undefined;
export function setSaveHook(fn: () => void): void {
  saveHook = fn;
}

export function installPlatform(): void {
  const w = window as unknown as { cdmBack?: () => void; cdmSave?: () => void };
  w.cdmBack = () => {
    handleBack();
  };
  w.cdmSave = () => saveHook();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveHook();
  });
  window.addEventListener('pagehide', () => saveHook());
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) {
      ignorePop -= 1;
      return;
    }
    armed = false;
    handleBack();
    syncHistory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) handleBack();
  });
  if (isAndroidApp) document.documentElement.classList.add('is-android');
  if (isTouch) document.documentElement.classList.add('is-touch');
}

let hapticsOn = true;
export function setHaptics(on: boolean): void {
  hapticsOn = on;
}

export function haptic(ms = 12): void {
  if (!hapticsOn) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* no vibration motor */
  }
}
