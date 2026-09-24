/**
 * Game-specific UI building blocks on top of the shared dom kit.
 */
import type { GameState, Vehicle, VehicleStatus } from '../sim/types';
import { h, icon, modal, tag } from './dom';
import type { Tone } from './dom';
import { money } from '../sim/format';
import { conditionLabel, demandLabel, demandScore, knownCondition, riskLabel, riskScore } from '../sim/market';
import { carArt } from './art';

// ------------------------------------------------------------------ status --

const STATUS: Record<VehicleStatus, { label: string; tone: Tone }> = {
  offer: { label: 'For sale', tone: 'info' },
  transit: { label: 'In transit', tone: 'tech' },
  yard: { label: 'In yard', tone: 'warn' },
  prep: { label: 'In prep', tone: 'accent' },
  listed: { label: 'On sale', tone: 'good' },
  transfer: { label: 'Transferring', tone: 'tech' },
  sold: { label: 'Sold', tone: 'muted' },
};

export function statusTag(status: VehicleStatus): HTMLElement {
  const s = STATUS[status];
  return tag(s.label, s.tone);
}

export function conditionTag(v: Vehicle): HTMLElement {
  const c = knownCondition(v);
  const l = conditionLabel(c);
  return tipped(tag(`${l.label} ${Math.round(c)}`, l.tone), 'Condition as far as you know it. An advanced inspection reveals the true figure.');
}

export function demandTag(state: GameState, v: Vehicle): HTMLElement {
  const d = demandLabel(demandScore(state, v));
  return tipped(tag(`Demand: ${d.label}`, d.tone, true), 'How many buyers want this kind of car right now. Driven by the category, fuel, season and market events.');
}

export function riskTag(v: Vehicle): HTMLElement {
  const r = riskLabel(riskScore(v));
  return tipped(tag(r.label, r.tone, true), 'Chance of hidden defects, from the source, age, mileage, brand reliability and how thoroughly it was inspected.');
}

// ----------------------------------------------------------------- tooltip --

let tipEl: HTMLElement | null = null;
let tipTimer: number | null = null;

/** Attaches a tooltip: hover on desktop, long-press or tap on touch. */
export function tipped<T extends HTMLElement>(el: T, text: string): T {
  el.dataset.tip = text;
  el.setAttribute('aria-label', el.getAttribute('aria-label') ?? text);
  return el;
}

const richTips = new WeakMap<HTMLElement, () => HTMLElement>();

/**
 * A tooltip with structured content (name, purpose, effects, costs…), built
 * when shown so it always reflects the current game data.
 */
export function richTipped<T extends HTMLElement>(el: T, build: () => HTMLElement, label?: string): T {
  richTips.set(el, build);
  el.dataset.tip = label ?? el.dataset.tip ?? ' ';
  return el;
}

function tipHost(): HTMLElement {
  if (!tipEl) {
    tipEl = h('div', { class: 'tooltip', role: 'tooltip' });
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

/** Shows a rich tooltip at a screen point (used over the dealership canvas). */
export function showTipAt(content: HTMLElement, x: number, y: number): void {
  const el = tipHost();
  el.replaceChildren(content);
  el.classList.add('show', 'rich');
  el.style.maxWidth = `${Math.min(320, window.innerWidth - 24)}px`;
  const tr = el.getBoundingClientRect();
  let left = x + 18;
  if (left + tr.width > window.innerWidth - 12) left = x - tr.width - 18;
  let top = y - tr.height / 2;
  top = Math.max(8, Math.min(window.innerHeight - tr.height - 8, top));
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${top}px`;
}

export function hideTipNow(): void {
  tipEl?.classList.remove('show');
}

function showTip(target: HTMLElement): void {
  const text = target.dataset.tip;
  if (!text) return;
  const tip = tipHost();
  const rich = richTips.get(target);
  if (rich) {
    tip.replaceChildren(rich());
    tip.classList.add('rich');
  } else {
    tip.textContent = text;
    tip.classList.remove('rich');
  }
  tipEl = tip;
  tipEl.classList.add('show');
  const r = target.getBoundingClientRect();
  const tw = Math.min(rich ? 320 : 280, window.innerWidth - 24);
  tipEl.style.maxWidth = `${tw}px`;
  const tr = tipEl.getBoundingClientRect();
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(12, Math.min(window.innerWidth - tr.width - 12, left));
  let top = r.top - tr.height - 8;
  if (top < 8) top = r.bottom + 8;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function hideTip(): void {
  tipEl?.classList.remove('show');
}

export function installTooltips(): void {
  document.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (t) showTip(t);
    else hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (t) showTip(t);
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('touchstart', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (tipTimer !== null) window.clearTimeout(tipTimer);
    if (t) {
      showTip(t);
      tipTimer = window.setTimeout(hideTip, 2600);
    } else hideTip();
  }, { passive: true });
  document.addEventListener('scroll', hideTip, true);
}

// -------------------------------------------------------------------- help --

export const HELP: Record<string, { title: string; what: string; why: string; how: string }> = {
  market: {
    title: 'Buying vehicles',
    what: 'The market lists cars from different sources. Each source has its own prices, risk and quality.',
    why: 'Your profit is made when you buy. A car bought too dear can never be sold at a profit.',
    how: 'Compare the asking price with the estimated retail value. Private sellers and auctions are cheaper but hide more defects — a pre-purchase inspection finds most of them.',
  },
  inspection: {
    title: 'Inspections & hidden defects',
    what: 'Every car may have hidden problems. A basic look on arrival finds the obvious ones; an advanced inspection finds most of the rest.',
    why: 'Undiscovered defects lower the true value. Sell a car with one and the buyer may come back with a complaint — and a bad review.',
    how: 'Mechanics and diagnostic equipment raise the chance of finding problems. Repair what you find, or price the car accordingly.',
  },
  prep: {
    title: 'Preparation',
    what: 'Cleaning, detailing and repairs raise condition and presentation.',
    why: 'Presentation makes customers more interested and willing to pay more. Condition raises the market value.',
    how: 'Cheap cleaning almost always pays for itself. Big repairs only pay on cars worth enough. Jobs taking days hold the car off sale.',
  },
  pricing: {
    title: 'Pricing',
    what: 'The asking price is what customers see. The floor price is the lowest your staff may accept.',
    why: 'Price too high and nobody bites; too low and you give profit away. Cars that sit for weeks cost you money every day.',
    how: 'Start near the suggested retail price. Lower it a little if a car has been on the lot more than a month.',
  },
  negotiation: {
    title: 'Negotiation',
    what: 'Each customer has a secret maximum they are willing to pay. You see clues: their interest, a budget range and their mood.',
    why: 'Every euro above your cost is profit. Asking too much burns their patience and they walk out.',
    how: 'Counter a little below your asking price, watch how far they move, and accept once their offers stop climbing. Extras like a warranty can warm them up.',
  },
  reputation: {
    title: 'Reputation',
    what: 'Your reputation (0–100) follows what customers say in reviews.',
    why: 'Higher reputation brings more customers, raises what they will pay and attracts better staff and bank terms.',
    how: 'Sell clean, honest cars at fair prices. Hidden defects that surface later and pushy negotiating hurt it.',
  },
  staff: {
    title: 'Staff',
    what: 'Salespeople serve customers you do not; mechanics and detailers work faster and cheaper; buyers find better deals; managers keep morale up and list cars automatically.',
    why: 'You cannot personally talk to every customer once the lot grows.',
    how: 'Everyone needs a workstation: a sales desk, a lift, a detailing bay or an office desk. Hire from the candidate list, train them, and promote them when they have enough experience. Low morale makes people quit.',
  },
  finance: {
    title: 'Finances',
    what: 'Cash is what you have; company value adds your stock, premises and goodwill and subtracts debt.',
    why: 'Running out of cash for 30 days ends the game. Loans buy time and stock but cost interest.',
    how: 'Watch monthly fixed costs (rent, salaries, insurance) and keep enough cash to cover them.',
  },
  demand: {
    title: 'Demand',
    what: 'How strongly the market wants a type of car right now.',
    why: 'High-demand cars sell faster and for more.',
    how: 'Watch events on the dashboard — an EV boom or fuel spike moves demand for weeks.',
  },
  upgrades: {
    title: 'Building & services',
    what: 'Facilities are physical: parking spaces, showroom displays, lifts, detailing bays, desks, sofas and signs you place in Build mode. Services (digital marketing, finance desk, trade-in centre, analytics) are bought here.',
    why: 'Every car needs a space, every employee a workstation, and what stands in a room sets its level. Everything built also costs upkeep, power and rent.',
    how: 'Add spaces before you run out, build a workshop to hire a mechanic, then a showroom. Keep walkways open so customers can reach your cars.',
  },
  build: {
    title: 'Build mode',
    what: 'Design the dealership yourself: paint rooms, draw walls, place doors, windows, desks, displays, lounges, lighting, chargers and cameras, and drag your cars to where you want them. Hover (or tap) anything to see what it does.',
    why: 'Layout is gameplay. Lighting and decor raise the showroom level, premium cars on premium displays and EVs by chargers attract more attention, visitor parking caps daily customers, a coffee bar keeps them happy, a manager office lifts morale — and customers must be able to walk to every car.',
    how: 'Drag an item from the list onto the map, or pick it and click. Drag placed items to move them; R rotates, Delete removes, Ctrl+C / Ctrl+V copies, Ctrl+D duplicates, Ctrl+Z / Ctrl+Y undo and redo, G toggles the grid, hold Alt to place without snapping. On a phone: long-press a car to drag it, tap an item for Move / Rotate / Duplicate / Delete, and confirm placements in the bar.',
  },
  models: {
    title: 'Model browser',
    what: 'Every model on the market with its type, segment, typical purchase and sale price, estimated margin, demand, popularity and the customers who want it.',
    why: 'Buying the right model is half the profit: a high-demand model with a healthy margin sells fast.',
    how: 'Filter by brand, type or segment and sort by margin or demand. "For sale" shows the offers for that model; "Find one" pays your buyer a finder\'s fee to track one down today (three requests a day).',
  },
};

export function helpButton(topic: string): HTMLElement {
  const t = HELP[topic];
  return h('button', {
    class: 'hint help-btn',
    title: t ? `Help: ${t.title}` : 'Help',
    aria: { label: t ? `Help: ${t.title}` : 'Help' },
    on: { click: (e: MouseEvent) => { e.stopPropagation(); openHelp(topic); } },
  }, '?');
}

export function openHelp(topic: string): void {
  const t = HELP[topic];
  if (!t) return;
  const { body } = modal({ title: t.title, width: 480 });
  body.appendChild(h('div', { class: 'help-block' }, h('h4', { text: 'What it is' }), h('p', { text: t.what })));
  body.appendChild(h('div', { class: 'help-block' }, h('h4', { text: 'Why it matters' }), h('p', { text: t.why })));
  body.appendChild(h('div', { class: 'help-block' }, h('h4', { text: 'How to use it' }), h('p', { text: t.how })));
}

// ------------------------------------------------------------------ layout --

export function pageHead(title: string, sub: string, ...actions: (HTMLElement | null | false)[]): HTMLElement {
  return h('div', { class: 'view-head' },
    h('div', { class: 'view-head-text' }, h('h1', { text: title }), sub ? h('p', { text: sub }) : null),
    h('div', { class: 'btn-row' }, ...actions));
}

export function panel(title: string | HTMLElement, ...children: (Node | string | null | false | undefined)[]): HTMLElement {
  const head = typeof title === 'string' ? h('h3', { class: 'panel-title', text: title }) : title;
  return h('section', { class: 'panel' }, head, ...children);
}

export function panelTitle(title: string, ...extra: (Node | string | null | false | undefined)[]): HTMLElement {
  return h('h3', { class: 'panel-title' }, h('span', { text: title }), ...extra);
}

export function iconBtn(name: string, label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  return h('button', { class: cls, title: label, aria: { label }, on: { click: onClick } }, icon(name, 15), h('span', { text: label }));
}

/** Compact vehicle card used in lists on phones and in grids on desktop. */
export function vehicleCard(state: GameState, v: Vehicle, opts: { price?: string; priceSub?: string; badges?: HTMLElement[]; onClick?: () => void; footer?: HTMLElement | null }): HTMLElement {
  const card = h('article', { class: `vcard${opts.onClick ? ' clickable' : ''}`, data: { id: v.id } });
  const art = h('div', { class: 'vcard-art' });
  art.appendChild(carArt(v, 150));
  card.appendChild(art);
  const body = h('div', { class: 'vcard-body' },
    h('div', { class: 'vcard-title' }, h('span', { class: 'vcard-name', text: `${v.year} ${v.brand} ${v.model}` })),
    h('div', { class: 'vcard-sub', text: `${v.trim} · ${v.engine} · ${v.transmission} · ${Math.round(v.mileage / 1000)}k km` }),
    h('div', { class: 'vcard-tags' }, ...(opts.badges ?? [])),
  );
  card.appendChild(body);
  if (opts.price) {
    card.appendChild(h('div', { class: 'vcard-price' }, h('span', { class: 'vcard-price-main', text: opts.price }), opts.priceSub ? h('span', { class: 'vcard-price-sub', text: opts.priceSub }) : null));
  }
  if (opts.footer) card.appendChild(opts.footer);
  if (opts.onClick) {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, a, input, select')) return;
      opts.onClick?.();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opts.onClick?.();
      }
    });
  }
  void state;
  return card;
}

// ------------------------------------------------------------------- fx --

/** A floating "+€1,234" rising from an element (or the centre of the screen). */
export function moneyFx(amount: number, from?: Element | null): void {
  if (document.documentElement.classList.contains('reduced-motion')) return;
  const fx = h('div', { class: `money-fx ${amount >= 0 ? 'good' : 'bad'}`, text: `${amount >= 0 ? '+' : ''}${money(amount)}` });
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top : window.innerHeight / 2;
  fx.style.left = `${x}px`;
  fx.style.top = `${y}px`;
  document.body.appendChild(fx);
  window.setTimeout(() => fx.remove(), 1400);
}

export function flash(el: Element | null, cls = 'flash'): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function stars(n: number): string {
  const full = Math.round(n);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

export function reputationStars(rep: number): string {
  return stars(Math.max(1, Math.min(5, rep / 20)));
}

export function progressBar(value: number, tone = ''): HTMLElement {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return h('div', { class: 'bar' }, h('div', { class: `bar-fill ${tone}`, style: `width:${w.toFixed(1)}%` }));
}

export function kv(label: string, value: string | HTMLElement, tone?: 'good' | 'bad' | 'muted' | 'warn'): HTMLElement {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    typeof value === 'string' ? h('span', { class: `stat-value${tone ? ` ${tone}` : ''}`, text: value }) : h('span', { class: `stat-value${tone ? ` ${tone}` : ''}` }, value));
}

export function segmented<T extends string>(options: { value: T; label: string; count?: number }[], current: T, onPick: (v: T) => void, cls = ''): HTMLElement {
  const row = h('div', { class: `seg ${cls}`, role: 'tablist' });
  for (const o of options) {
    const b = h('button', {
      class: `seg-btn${o.value === current ? ' active' : ''}`,
      role: 'tab',
      aria: { selected: String(o.value === current) },
      on: { click: () => onPick(o.value) },
    }, o.label);
    if (o.count !== undefined && o.count > 0) b.appendChild(h('span', { class: 'seg-count', text: String(o.count) }));
    row.appendChild(b);
  }
  return row;
}
