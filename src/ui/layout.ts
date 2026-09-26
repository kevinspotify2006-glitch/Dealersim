/**
 * Layout decisions that change structure (not just styling) by screen size and
 * orientation — the one place the UI asks "what kind of screen is this?".
 *
 *   isMobilePortrait()   phone held upright: bottom navigation, bottom sheets
 *   isMobileLandscape()  phone held sideways (an S25 Ultra is ~915×412): a nav
 *                        rail on the left, the world in the middle, a context
 *                        panel on the right, quick actions along the bottom and
 *                        dialogs as a right-hand drawer
 *   isTablet()           a bigger touch screen (both sides over 560 px)
 *   isDesktop()          mouse and keyboard, a wide window
 *
 * The answer is mirrored on <body> as one of the classes lay-portrait,
 * lay-landscape, lay-tablet or lay-desktop (plus data-layout), so CSS and tests
 * see the same decision. Rotating the phone re-evaluates it and re-renders the
 * current screen — no reload.
 */

let compact = false;

export type LayoutKind = 'portrait' | 'landscape' | 'tablet' | 'desktop';

const mq = (q: string): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;

function size(): { w: number; h: number } {
  return { w: window.innerWidth || 1280, h: window.innerHeight || 800 };
}

function coarse(): boolean {
  return mq('(pointer: coarse)');
}

/** A phone held sideways: short and wider than tall, on a touch screen (or small enough to be one). */
export function isMobileLandscape(): boolean {
  const { w, h } = size();
  return w > h && h <= 560 && (coarse() || w <= 960);
}

/** A phone held upright. */
export function isMobilePortrait(): boolean {
  const { w, h } = size();
  return h >= w && w <= 620;
}

/** A tablet: touch, and both sides comfortably larger than a phone's short side. */
export function isTablet(): boolean {
  const { w, h } = size();
  if (isMobileLandscape() || isMobilePortrait()) return false;
  return (coarse() && Math.min(w, h) > 560 && Math.max(w, h) <= 1400) || (w <= 900 && h > w);
}

export function isDesktop(): boolean {
  return !isMobileLandscape() && !isMobilePortrait() && !isTablet();
}

export function layoutKind(): LayoutKind {
  if (isMobileLandscape()) return 'landscape';
  if (isMobilePortrait()) return 'portrait';
  if (isTablet()) return 'tablet';
  return 'desktop';
}

/**
 * True on desktop-width screens. Views drawn inside a side panel over the
 * dealership are narrow even on a PC, so they ask for the compact layout.
 */
export function isWide(): boolean {
  if (compact) return false;
  return mq('(min-width: 901px)');
}

/** While a side panel is open, screens inside it lay out as on a phone (lists instead of tables). */
export function setCompact(on: boolean): void {
  compact = on;
}

/** Phone-sized screen (bottom sheets instead of popovers). */
export function isPhone(): boolean {
  return mq('(max-width: 900px)');
}

let applied: LayoutKind | null = null;

/** Puts the current layout on <body>; returns true when it changed. */
export function applyLayoutClass(): boolean {
  if (typeof document === 'undefined') return false;
  const kind = layoutKind();
  const b = document.body;
  if (!b) return false;
  for (const k of ['portrait', 'landscape', 'tablet', 'desktop'] as LayoutKind[]) b.classList.toggle(`lay-${k}`, k === kind);
  b.dataset.layout = kind;
  const changed = applied !== null && applied !== kind;
  applied = kind;
  return changed;
}

/**
 * Calls `fn` when the layout changes: crossing the phone/desktop breakpoint,
 * or turning the phone between portrait and landscape.
 */
export function onLayoutChange(fn: () => void): () => void {
  applyLayoutClass();
  const wide = window.matchMedia('(min-width: 901px)');
  const orient = window.matchMedia('(orientation: landscape)');
  let timer = 0;
  const fire = (): void => {
    window.clearTimeout(timer);
    // Rotation fires resize several times while the browser settles; act once.
    timer = window.setTimeout(() => {
      const changed = applyLayoutClass();
      if (changed) window.dispatchEvent(new CustomEvent('layoutchange', { detail: layoutKind() }));
      fn();
    }, 120);
  };
  const onResize = (): void => {
    if (applied !== layoutKind()) fire();
  };
  wide.addEventListener?.('change', fire);
  orient.addEventListener?.('change', fire);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', fire);
  return () => {
    wide.removeEventListener?.('change', fire);
    orient.removeEventListener?.('change', fire);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', fire);
  };
}
