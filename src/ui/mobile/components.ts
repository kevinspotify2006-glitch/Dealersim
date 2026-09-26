/**
 * The mobile design system: small, reusable building blocks shared by the
 * phone screens (HUD, sheets, cards). Everything here renders real game data;
 * the styling lives in src/styles/mobile.css under the same class names.
 *
 *   BottomSheet    sheet()        — a dialog that is a draggable bottom sheet on phones
 *   StatsCard      statCard()     — icon, label, big value, sub line; optionally a shortcut
 *   Meter          meterRow()     — label, bar and value (performance, capacity…)
 *   SummaryRow     summaryRow()   — the one-line "what is this" under a card title
 *   KeyValueGrid   kvGrid()       — two-column facts (purchase, market value, profit…)
 *   SectionLabel   sectionLabel() — the small uppercase heading between groups
 *   EmptyState     emptyState()   — icon, title, one line of help and an optional action
 */
import { h, modal } from '../dom';
import type { ModalOptions } from '../dom';
import { icon } from '../icons';
import { haptic } from '../../platform/platform';

export type Tone = '' | 'good' | 'bad' | 'warn' | 'info';

/** A bottom sheet on phones, a centred dialog on wide screens (same API as `modal`). */
export function sheet(options: ModalOptions): ReturnType<typeof modal> {
  return modal({ ...options, cls: `sheet-m${options.cls ? ` ${options.cls}` : ''}` });
}

export function statCard(o: { icon: string; label: string; value: string; sub?: string; tone?: Tone; key?: string; onClick?: () => void }): HTMLElement {
  const inner = [
    h('span', { class: 'stat-ic' }, icon(o.icon, 18)),
    h('span', { class: 'stat-txt' },
      h('span', { class: 't-secondary', text: o.label }),
      h('span', { class: 'stat-val', text: o.value }),
      o.sub ? h('span', { class: 't-secondary', text: o.sub }) : null),
  ];
  const cls = `stat-tile${o.tone ? ` ${o.tone}` : ''}`;
  const data: Record<string, string> = o.key ? { hud: o.key } : {};
  return o.onClick
    ? h('button', { class: cls, data, on: { click: () => { haptic(6); o.onClick!(); } } }, ...inner)
    : h('div', { class: `${cls} static`, data }, ...inner);
}

export function meterRow(label: string, frac: number, text: string, tone: Tone = ''): HTMLElement {
  const f = Math.max(0, Math.min(1, frac));
  return h('div', { class: `m-meter ${tone}` },
    h('span', { class: 'm-meter-k', text: label }),
    h('span', { class: 'm-meter-bar' }, h('i', { style: `width:${Math.round(f * 100)}%` })),
    h('span', { class: 'm-meter-v', text }));
}

export function summaryRow(...parts: (string | { text: string; tone?: Tone; strong?: boolean } | null)[]): HTMLElement {
  return h('div', { class: 'wm-summary' }, ...parts.filter(Boolean).map((p) => (typeof p === 'string'
    ? h('span', { text: p })
    : h(p!.strong ? 'strong' : 'span', { class: p!.tone ?? '', text: p!.text }))));
}

export function kvGrid(rows: [string, string, Tone?][]): HTMLElement {
  return h('div', { class: 'kv-grid' }, ...rows.map(([k, v, tone]) => h('div', { class: 'kv' }, h('span', { class: 'kv-k', text: k }), h('span', { class: `kv-v ${tone ?? ''}`, text: v }))));
}

export function sectionLabel(text: string): HTMLElement {
  return h('div', { class: 't-label', text });
}

export function emptyState(title: string, text: string, ic = 'info', action?: HTMLElement): HTMLElement {
  return h('div', { class: 'empty-state' }, h('span', { class: 'empty-ic' }, icon(ic, 26)), h('div', { class: 't-section', text: title }), h('p', { class: 't-secondary', text }), action ?? null);
}

/** Animates a money figure from its previous value (a short count, not a slot machine). */
const tweens = new WeakMap<HTMLElement, { from: number; to: number; start: number; raf: number }>();
export function tweenNumber(el: HTMLElement, to: number, format: (n: number) => string, ms = 420): void {
  const prev = Number(el.dataset.num ?? NaN);
  el.dataset.num = String(to);
  if (!Number.isFinite(prev) || prev === to || document.documentElement.classList.contains('reduced-motion') || Math.abs(to - prev) < 1) {
    el.textContent = format(to);
    return;
  }
  const running = tweens.get(el);
  if (running) cancelAnimationFrame(running.raf);
  const t = { from: prev, to, start: performance.now(), raf: 0 };
  tweens.set(el, t);
  const step = (now: number): void => {
    const k = Math.min(1, (now - t.start) / ms);
    const e = 1 - (1 - k) ** 3;
    el.textContent = format(t.from + (t.to - t.from) * e);
    el.classList.toggle('up', to > prev);
    el.classList.toggle('down', to < prev);
    if (k < 1) t.raf = requestAnimationFrame(step);
    else { el.classList.remove('up', 'down'); tweens.delete(el); }
  };
  t.raf = requestAnimationFrame(step);
}
