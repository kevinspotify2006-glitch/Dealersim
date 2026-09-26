/**
 * The shared furniture.
 *
 * Every screen in the game is built from what is in this file: one card, one
 * KPI, one badge, one row, one table, one dialog, one empty state. A view that
 * needs something new adds it here rather than inventing it locally — that rule
 * is the difference between a design system and the sixteen parallel card
 * styles this replaced.
 */
import { icon } from './icons';
import { pushBackHandler } from '../platform/platform';

export { icon };

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  id?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  href?: string;
  style?: string;
  role?: string;
  inputmode?: string;
  maxlength?: number;
  data?: Record<string, string>;
  aria?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.title) el.title = props.title;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.style) el.setAttribute('style', props.style);
  if (props.role) el.setAttribute('role', props.role);
  if (props.href && el instanceof HTMLAnchorElement) el.href = props.href;
  if (props.inputmode) el.setAttribute('inputmode', props.inputmode);
  if (props.maxlength !== undefined) el.setAttribute('maxlength', String(props.maxlength));

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (props.type && el instanceof HTMLInputElement) el.type = props.type;
    if (props.value !== undefined) el.value = String(props.value);
    if (props.placeholder && !(el instanceof HTMLSelectElement)) {
      (el as HTMLInputElement).placeholder = props.placeholder;
    }
    if (props.disabled) el.disabled = true;
    if (el instanceof HTMLInputElement) {
      if (props.min !== undefined) el.min = String(props.min);
      if (props.max !== undefined) el.max = String(props.max);
      if (props.step !== undefined) el.step = String(props.step);
      if (props.checked) el.checked = true;
    }
  } else if (el instanceof HTMLButtonElement) {
    if (props.disabled) el.disabled = true;
    if (props.value !== undefined) el.value = String(props.value);
  } else if (el instanceof HTMLOptionElement) {
    if (props.value !== undefined) el.value = String(props.value);
    if (props.selected) el.selected = true;
  }

  if (props.data) {
    for (const [key, value] of Object.entries(props.data)) el.dataset[key] = value;
  }
  if (props.aria) {
    for (const [key, value] of Object.entries(props.aria)) el.setAttribute(`aria-${key}`, value);
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (typeof handler === 'function') {
        el.addEventListener(event, handler as EventListener);
      }
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/**
 * Runs a piece of rebuilding without moving the player.
 *
 * Emptying a tall element collapses the page, and the browser clamps the scroll
 * position to the height that is left — so by the time the new content is in,
 * the reader is at the top of a page they were halfway down. Anything that
 * repaints a screen already on display goes through here.
 *
 * The page is held at the height it already had for the length of the rebuild,
 * so there is nothing for the browser to clamp to and nothing to put back
 * afterwards. Restoring the offset afterwards was the old approach and it
 * failed in the one case that matters most: when the new content is shorter
 * than the old, the position it is being restored to no longer exists.
 */
export function keepingScroll(run: () => void): void {
  const inner = document.querySelector('.main-inner') as HTMLElement | null;
  if (!inner) {
    run();
    return;
  }
  const held = inner.offsetHeight;
  if (held > 0) inner.style.minHeight = `${held}px`;
  run();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inner.style.minHeight = '';
    });
  });
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function button(label: string, onClick: () => void, variant = 'btn'): HTMLButtonElement {
  return h('button', { class: variant, on: { click: onClick } }, label);
}

/** A label/value pair, the workhorse of every panel in the game. */
export function stat(label: string, value: string, tone?: 'good' | 'bad' | 'muted'): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h('span', { class: `stat-value${tone ? ` ${tone}` : ''}`, text: value }),
  );
}

/**
 * A small "what does this mean" marker.
 *
 * Native `title` tooltips never appear on a phone, so this is a real button:
 * hovering shows the tooltip, tapping says the same thing in a toast. Every
 * number that takes a sentence to explain gets one.
 */
export function hint(text: string): HTMLElement {
  return h(
    'button',
    {
      class: 'hint',
      title: text,
      aria: { label: text },
      on: {
        click: (event: MouseEvent) => {
          event.stopPropagation();
          toast(text, 'info');
        },
      },
    },
    '?',
  );
}

/** A stat row with an explanation attached to the label. */
export function statWithHint(
  label: string,
  value: string,
  explanation: string,
  tone?: 'good' | 'bad' | 'muted',
): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label, hint(explanation)),
    h('span', { class: `stat-value${tone ? ` ${tone}` : ''}`, text: value }),
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h3', { class: 'panel-title', text: title }), ...children);
}

export type Tone = 'good' | 'bad' | 'warn' | 'accent' | 'tech' | 'info' | 'muted';

/**
 * A KPI card: what it is, what it reads, and what it has done lately.
 *
 * The tile is not decoration — its colour says which part of the company the
 * figure belongs to, so a row of four is scannable before any of it is read.
 */
export function kpi(options: {
  label: string;
  value: string;
  sub?: string;
  icon?: string;
  tone?: Tone;
  subTone?: 'good' | 'bad' | 'warn';
  valueTone?: 'good' | 'bad';
}): HTMLElement {
  const tile = h('div', { class: `kpi-tile${options.tone && options.tone !== 'muted' ? ` ${options.tone}` : ''}` });
  tile.appendChild(icon(options.icon ?? 'cash', 19));
  return h(
    'div',
    { class: 'kpi' },
    tile,
    h(
      'div',
      { class: 'kpi-figures' },
      h('span', { class: 'kpi-label', text: options.label }),
      h('span', { class: `kpi-value${options.valueTone ? ` ${options.valueTone}` : ''}`, text: options.value }),
      options.sub ? h('span', { class: `kpi-sub${options.subTone ? ` ${options.subTone}` : ''}`, text: options.sub }) : null,
    ),
  );
}

/** A status pill. The one badge in the game. */
export function tag(label: string, tone?: Tone, plain = false): HTMLElement {
  const classes = ['tag'];
  if (tone && tone !== 'muted') classes.push(tone);
  if (plain) classes.push('plain');
  return h('span', { class: classes.join(' '), text: label });
}

/** A labelled meter — a name, a bar and a figure, aligned down a column. */
export function meter(name: string, value: number, label: string, tone?: 'good' | 'bad' | 'warn' | 'tech'): HTMLElement {
  return h(
    'div',
    { class: 'meter' },
    h('span', { class: `meter-dot${tone ? ` ${tone}` : ''}` }),
    h('span', { class: 'meter-name', text: name }),
    h('div', { class: 'meter-bar' }, bar(value, tone === 'tech' ? '' : (tone ?? ''))),
    h('span', { class: 'meter-value', text: label }),
  );
}

/** Somebody's initials, for a table of people. */
export function avatar(name: string, tone?: 'tech' | 'good' | 'warn', small = false): HTMLElement {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return h('span', { class: `avatar${tone ? ` ${tone}` : ''}${small ? ' sm' : ''}`, text: initials || '?' });
}

/**
 * An empty section.
 *
 * Never a blank panel: it says what is missing, why, and — where there is one —
 * offers the way out of it.
 */
export function empty(message: string, options?: { title?: string; icon?: string; action?: HTMLElement }): HTMLElement {
  if (!options) return h('p', { class: 'empty', text: message });
  const wrap = h('div', { class: 'empty-state' });
  const badge = h('div', { class: 'empty-icon' });
  badge.appendChild(icon(options.icon ?? 'info', 18));
  wrap.appendChild(badge);
  if (options.title) wrap.appendChild(h('h4', { text: options.title }));
  wrap.appendChild(h('p', { text: message }));
  if (options.action) wrap.appendChild(options.action);
  return wrap;
}

/**
 * The tile that carries a severity: an advice row, a finding, an alert.
 *
 * Which picture goes with which severity is decided here and nowhere else, so
 * a warning looks like a warning on every screen that raises one.
 */
export function severityTile(
  level: 'critical' | 'warning' | 'opportunity' | 'good' | 'bad' | 'warn' | 'info',
  cls = 'advice-dot',
): HTMLElement {
  const glyph: Record<string, string> = {
    critical: 'critical', bad: 'critical',
    warning: 'warning', warn: 'warning',
    opportunity: 'opportunity', good: 'good', info: 'info',
  };
  const tile = h('div', { class: `${cls} ${level}` });
  tile.appendChild(icon(glyph[level] ?? 'info', 15));
  return tile;
}

/** A group of pills used as tabs or filters. Returns the row; caller keeps state. */
export function pills(
  options: { value: string; label: string; count?: number }[],
  current: string,
  onPick: (value: string) => void,
): HTMLElement {
  const row = h('div', { class: 'pill-row' });
  for (const option of options) {
    const el = h(
      'button',
      {
        class: `pill${option.value === current ? ' active' : ''}`,
        on: { click: () => onPick(option.value) },
      },
      option.label,
    );
    if (option.count !== undefined) el.appendChild(h('span', { class: 'pill-count', text: String(option.count) }));
    row.appendChild(el);
  }
  return row;
}

/** A horizontal bar, 0..1. */
export function bar(value: number, tone = ''): HTMLElement {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return h(
    'div',
    { class: 'bar' },
    h('div', { class: `bar-fill ${tone}`, style: `width:${width.toFixed(1)}%` }),
  );
}

export function table(
  headers: string[],
  rows: Child[][],
  options?: { onRowClick?: (index: number) => void; rowIds?: string[] },
): HTMLElement {
  const thead = h('thead', {}, h('tr', {}, ...headers.map((label) => h('th', { text: label }))));
  const tbody = h(
    'tbody',
    {},
    ...rows.map((cells, index) => {
      // Every cell carries the name of its column. On a wide screen that is
      // unused; on a phone it is what lets the same table become a stack of
      // cards with the heading beside each value, instead of a grid with its
      // headings scrolled off somewhere to the left. One table, two shapes —
      // rather than a table and a separate mobile list to keep in step.
      const tr = h('tr', {}, ...cells.map((cell, column) => {
        const td = h('td', {}, cell);
        const label = headers[column];
        if (label) td.dataset.label = label;
        return td;
      }));
      if (options?.rowIds?.[index]) tr.dataset.id = options.rowIds[index];
      // A row that does something says so, and can be reached from a keyboard —
      // this is a table, so the row is the control rather than a link inside it.
      if (options?.onRowClick) {
        tr.classList.add('row-clickable');
        tr.tabIndex = 0;
        tr.addEventListener('click', (event) => {
          // Buttons inside a row do their own thing; they must not also open the row.
          if ((event.target as HTMLElement).closest('button, a, input, select, label')) return;
          options.onRowClick?.(index);
        });
        tr.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            options.onRowClick?.(index);
          }
        });
      }
      return tr;
    }),
  );
  return h('div', { class: 'table-wrap' }, h('table', {}, thead, tbody));
}

/**
 * Transient feedback for an action the player just took.
 *
 * Toasts stack (newest at the bottom, at most three) so a sale announced by a
 * salesperson never hides the result of the button the player just pressed.
 */
export function toast(message: string, tone: 'info' | 'good' | 'bad' | 'warn' = 'info', action?: { label: string; run: () => void }, key?: string): void {
  if (!message) return;
  let host = document.getElementById('toast-stack');
  if (!host) {
    host = h('div', { id: 'toast-stack', class: 'toast-stack', role: 'status', aria: { live: 'polite' } });
    document.body.appendChild(host);
  }
  const item = h('div', { class: `toast ${tone}`, data: key ? { key } : {} }, h('span', { class: 'toast-text', text: message }));
  if (action) {
    item.appendChild(h('button', { class: 'toast-action', on: { click: () => { action.run(); item.remove(); } } }, action.label));
  }
  host.appendChild(item);
  while (host.children.length > (window.innerWidth <= 900 ? 2 : 3)) host.firstElementChild?.remove();
  requestAnimationFrame(() => item.classList.add('show'));
  window.setTimeout(() => {
    item.classList.remove('show');
    window.setTimeout(() => item.remove(), 250);
  }, action ? 5200 : 3200);
}

export interface ModalOptions {
  title: string;
  width?: number;
  onClose?: () => void;
  /** Extra class on the card, e.g. 'wide' or 'negotiation'. */
  cls?: string;
  /** Subtitle under the title. */
  sub?: string;
}

/** Opens a modal and returns its body element for the caller to fill. */
export function modal(options: ModalOptions): { body: HTMLElement; close: () => void; footer: HTMLElement } {
  const body = h('div', { class: 'modal-body' });
  const footer = h('div', { class: 'modal-footer' });
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    releaseBack();
    options.onClose?.();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const card = h(
    'div',
    { class: `modal-card${options.cls ? ` ${options.cls}` : ''}`, style: options.width ? `max-width:${options.width}px` : '', role: 'dialog', aria: { modal: 'true', label: options.title } },
    h(
      'div',
      { class: 'modal-head' },
      h('div', { class: 'modal-titles' }, h('h2', { text: options.title }), options.sub ? h('p', { class: 'modal-sub', text: options.sub }) : null),
      h('button', { class: 'icon-btn', title: 'Close', aria: { label: 'Close' }, on: { click: close } }, icon('close', 16)),
    ),
    body,
    footer,
  );
  // On a phone the dialog is a bottom sheet: a grip on top, dragged down to dismiss.
  const grip = h('div', { class: 'sheet-grip', aria: { hidden: 'true' } });
  card.insertBefore(grip, card.firstChild);
  attachSheetDrag(card, card.querySelector('.modal-head') as HTMLElement, grip, () => close());
  const openedAt = performance.now();
  const overlay = h(
    'div',
    {
      class: 'modal-overlay',
      on: {
        click: (event: MouseEvent) => {
          // A tap that opened this dialog also fires a click where the finger was: ignore it.
          if (event.target === overlay && performance.now() - openedAt > 400) close();
        },
      },
    },
    card,
  );
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  const releaseBack = pushBackHandler(() => {
    close();
    return true;
  });
  return { body, close, footer };
}

/**
 * Drag-to-dismiss for a bottom sheet. Only active while the sheet is laid out
 * as one (phone widths); on desktop the handle does nothing.
 */
export function attachSheetDrag(card: HTMLElement, head: HTMLElement | null, grip: HTMLElement, dismiss: () => void): void {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  let startT = 0;
  const isSheet = (): boolean => window.matchMedia('(max-width: 900px)').matches;
  const down = (event: PointerEvent): void => {
    if (!isSheet()) return;
    const t = event.target as HTMLElement;
    if (t.closest('button, input, select, textarea, a')) return;
    dragging = true;
    startY = event.clientY;
    startT = performance.now();
    dy = 0;
    card.style.transition = 'none';
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (!dragging) return;
    dy = Math.max(0, event.clientY - startY);
    card.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const up = (): void => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = '';
    const fast = dy > 40 && performance.now() - startT < 250;
    if (dy > Math.min(160, card.offsetHeight * 0.3) || fast) {
      card.style.transform = 'translateY(110%)';
      window.setTimeout(dismiss, 160);
    } else card.style.transform = '';
  };
  for (const el of [grip, head]) {
    if (!el) continue;
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}

/** Yes/no confirmation used before anything expensive or destructive. */
export function confirmDialog(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };
    const { body, footer, close } = modal({ title, width: 460, onClose: () => finish(false) });
    body.appendChild(h('p', { class: 'confirm-text', text: message }));
    footer.appendChild(button('Cancel', () => finish(false), 'btn ghost'));
    footer.appendChild(button(confirmLabel, () => finish(true), danger ? 'btn danger' : 'btn primary'));
  });
}

export function numberInput(value: number, onChange: (value: number) => void, props: Props = {}): HTMLInputElement {
  const input = h('input', {
    type: 'number',
    value: String(value),
    inputmode: 'decimal',
    ...props,
    on: {
      change: () => {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      },
    },
  });
  return input;
}

export function select(
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const el = h(
    'select',
    {
      on: {
        change: () => onChange(el.value),
      },
    },
    ...options.map((option) =>
      h('option', { value: option.value, selected: option.value === current }, option.label),
    ),
  );
  return el;
}

/** Removes a keyed toast (e.g. a "customer waiting" prompt once they are served). */
export function dismissToast(key: string): void {
  document.querySelectorAll(`.toast[data-key="${key}"]`).forEach((el) => el.remove());
}
