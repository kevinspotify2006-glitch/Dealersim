/** Layout decisions that change structure (not just styling) by screen size. */

let compact = false;

/**
 * True on desktop-width screens. Views drawn inside a side panel over the
 * dealership are narrow even on a PC, so they ask for the compact layout.
 */
export function isWide(): boolean {
  if (compact) return false;
  return window.matchMedia('(min-width: 901px)').matches;
}

/** While a side panel is open, screens inside it lay out as on a phone (lists instead of tables). */
export function setCompact(on: boolean): void {
  compact = on;
}

/** Phone-sized screen (bottom sheets instead of popovers). */
export function isPhone(): boolean {
  return window.matchMedia('(max-width: 900px)').matches;
}

/** Calls `fn` when the layout crosses the phone/desktop breakpoint. */
export function onLayoutChange(fn: () => void): () => void {
  const mq = window.matchMedia('(min-width: 901px)');
  const handler = (): void => fn();
  mq.addEventListener?.('change', handler);
  return () => mq.removeEventListener?.('change', handler);
}
