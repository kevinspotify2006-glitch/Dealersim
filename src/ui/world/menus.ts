/**
 * Context menus for things you tap in the dealership: a car, a customer, an
 * employee, a fixture or a room. Each is a compact card of facts and the
 * actions that make sense right there.
 */
import type { Ctx } from '../app';
import type { Customer, Employee, Location, LotObject, Vehicle } from '../../sim/types';
import { h, confirmDialog } from '../dom';
import { icon } from '../icons';
import { money, moneySigned } from '../../sim/format';
import { ARCHETYPE_BY_ID, PREP_BY_ID, ROLE_BY_ID } from '../../data/game';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import { absHour, activeLocation, vehicleName } from '../../sim/state';
import { canTestDrive, customerNeeds, interestLabel, matchScore, onShow, recommendations, recommendCar, talkTo, testDrive } from '../../sim/customers';
import { conditionLabel, knownCondition, suggestedPrice, totalCost } from '../../sim/market';
import { listVehicle, quickSell, unlistVehicle, wholesalePrice } from '../../sim/trading';
import { prepActive } from '../../sim/vehicles';
import { canPromote, promote, train, trainingCost } from '../../sim/staff';
import { footprint, lotStats, moveObject, removeObject, slotKindOf, stationName, zoneAt } from '../../sim/lot';
import type { ZoneCode } from '../../sim/types';
import { openVehicle } from '../modals/vehicle';
import { progressBar, statusTag } from '../kit';
import type { Selection } from './render';

export interface WorldActions {
  ctx: Ctx;
  close: () => void;
  redraw: () => void;
  select: (sel: Selection) => void;
  moveCar: (vehicleId: string) => void;
  moveObject: (objId: string) => void;
  panel: (id: string) => void;
  build: (category?: string) => void;
  animateTestDrive: (v: Vehicle) => void;
}

/** Talk results are remembered for as long as the customer is here. */
const notes = new Map<string, string[]>();
let showRecs: string | null = null;

function head(iconText: string, title: string, sub: string, extra?: HTMLElement | null): HTMLElement {
  return h('div', { class: 'wm-head' }, h('span', { class: 'wm-icon', text: iconText }),
    h('div', { class: 'wm-titles' }, h('div', { class: 'wm-title', text: title }), h('div', { class: 'wm-sub', text: sub })), extra ?? null);
}

function btn(label: string, run: () => void, cls = '', ic?: string, disabled = false, title?: string): HTMLButtonElement {
  return h('button', { class: `btn small ${cls}`, disabled, title: title ?? '', on: { click: run } }, ic ? icon(ic, 14) : null, label);
}

function facts(...rows: [string, string, string?][]): HTMLElement {
  return h('div', { class: 'wm-facts' }, ...rows.map(([k, v, tone]) => h('div', { class: 'wm-fact' }, h('span', { class: 'wm-k', text: k }), h('span', { class: `wm-v ${tone ?? ''}`, text: v }))));
}

export function entityMenu(a: WorldActions, sel: Selection): HTMLElement | null {
  if (!sel) return null;
  const s = a.ctx.state;
  const loc = activeLocation(s);
  if (sel.kind === 'vehicle') {
    const v = s.vehicles.find((x) => x.id === sel.id);
    return v ? vehicleMenu(a, loc, v) : null;
  }
  if (sel.kind === 'agent') {
    if (sel.id.startsWith('c:')) {
      const c = s.customers.find((x) => x.id === sel.id.slice(2));
      return c ? customerMenu(a, loc, c) : null;
    }
    if (sel.id.startsWith('e:')) {
      const e = s.employees.find((x) => x.id === sel.id.slice(2));
      return e ? staffMenu(a, loc, e) : null;
    }
    return null;
  }
  if (sel.kind === 'object') {
    const o = loc.lot.objects.find((x) => x.id === sel.id);
    return o ? objectMenu(a, loc, o) : null;
  }
  if (sel.kind === 'zone') return zoneMenu(a, loc, sel.x ?? 0, sel.y ?? 0);
  return null;
}

// ----------------------------------------------------------------- car --

function vehicleMenu(a: WorldActions, loc: Location, v: Vehicle): HTMLElement {
  const s = a.ctx.state;
  const act = (r: { ok: boolean; message: string }, sound?: 'buy' | 'success' | 'cash' | 'sale'): void => {
    a.ctx.act(r, { sound });
    a.redraw();
  };
  const cond = knownCondition(v);
  const cost = totalCost(v);
  const where = slotKindOf(loc, v.slotId);
  const wanted = s.customers.find((c) => c.vehicleId === v.id && (c.status === 'waiting' || c.status === 'negotiating'));
  const job = v.prep[0];
  const mode = prepActive(s, v);
  const el = h('div', { class: 'wm' },
    head('🚗', vehicleName(v), `${v.trim} · ${Math.round(v.mileage / 1000)}k km · ${where ? { parking: 'on the lot', display: 'in the showroom', storage: 'in storage', lift: 'on a lift', bay: 'in the detailing bay' }[where] : 'parked on the street'}`, statusTag(v.status)),
    facts(
      ['Asking', v.askingPrice ? money(v.askingPrice) : '—'],
      ['Invested', money(cost)],
      ['Margin', v.askingPrice ? moneySigned(v.askingPrice - cost) : '—', v.askingPrice - cost >= 0 ? 'good' : 'bad'],
      ['Condition', `${Math.round(cond)} · ${conditionLabel(cond).label}`],
      ['Presentation', `${Math.round(v.presentation)}`],
      ['In stock', `${v.daysInStock} days`],
    ));
  if (job) {
    const def = PREP_BY_ID[job.actionId];
    el.appendChild(h('div', { class: 'wm-job' }, h('span', { text: `${def?.icon ?? '🔧'} ${def?.name ?? 'Work'} · ${mode === 'working' ? 'being worked on' : mode === 'waiting' ? 'waiting for a free bay' : 'outsourced'}` }),
      progressBar(1 - job.daysLeft / Math.max(1, job.totalDays), mode === 'waiting' ? 'warn' : 'good'), h('span', { class: 'tiny muted', text: `${job.daysLeft} day${job.daysLeft === 1 ? '' : 's'} left` })));
  }
  if (wanted) {
    el.appendChild(h('button', { class: 'wm-note good clickable', on: { click: () => a.select({ kind: 'agent', id: `c:${wanted.id}` }) } }, `★ ${wanted.name} is interested — tap to talk`));
  }
  if (v.status === 'listed' && !onShow(s, v)) el.appendChild(h('div', { class: 'wm-note bad', text: 'Customers cannot walk to this space. Move the car or fix the layout.' }));
  const actions = h('div', { class: 'wm-actions' });
  if (v.status === 'yard') {
    actions.appendChild(btn(`List for ${money(v.askingPrice || suggestedPrice(s, v))}`, () => act(listVehicle(s, v.id, true), 'success'), 'primary', 'tag'));
  } else if (v.status === 'listed') {
    actions.appendChild(btn('Take off sale', () => act(unlistVehicle(s, v.id)), '', 'close'));
  }
  actions.appendChild(btn('Price', () => openVehicle(a.ctx, v.id, 'price'), '', 'cash'));
  actions.appendChild(btn('Prep', () => openVehicle(a.ctx, v.id, 'prep'), '', 'wrench', v.status === 'transit'));
  actions.appendChild(btn('Inspect', () => openVehicle(a.ctx, v.id, 'inspect'), '', 'eye'));
  if (v.status === 'yard' || v.status === 'listed') actions.appendChild(btn('Move', () => a.moveCar(v.id), '', 'move'));
  actions.appendChild(btn('Details', () => openVehicle(a.ctx, v.id, 'overview'), '', 'info'));
  actions.appendChild(btn(`Trade sale ${money(wholesalePrice(s, v))}`, async () => {
    if (!(await confirmDialog('Sell to the trade?', `A trade buyer takes the ${vehicleName(v)} today for ${money(wholesalePrice(s, v))} (${moneySigned(wholesalePrice(s, v) - cost)}).`, 'Sell', true))) return;
    a.ctx.act(quickSell(s, v.id), { sound: 'cash' });
    a.close();
  }, 'ghost', undefined, v.status === 'prep' || !!wanted));
  el.appendChild(actions);
  return el;
}

// ------------------------------------------------------------ customer --

function customerMenu(a: WorldActions, loc: Location, c: Customer): HTMLElement {
  const s = a.ctx.state;
  const arche = ARCHETYPE_BY_ID[c.archetype];
  const v = s.vehicles.find((x) => x.id === c.vehicleId);
  const hoursLeft = Math.max(0, c.leaveHour - absHour(s));
  const il = interestLabel(c.interest);
  const el = h('div', { class: 'wm' },
    head(arche.icon, c.name, `${arche.name} · ${c.channel === 'Online' ? 'saw you online' : c.campaignId ? 'saw your advert' : 'walk-in'}`, h('span', { class: `tag ${il.tone}`, text: il.label })));
  el.appendChild(facts(
    ['Looking at', v ? vehicleName(v) : '—'],
    ['Asking', v ? money(v.askingPrice) : '—'],
    ['Patience', c.status === 'negotiating' ? 'talking to you' : hoursLeft <= 1 ? 'leaving soon!' : `~${hoursLeft} h`, hoursLeft <= 1 ? 'bad' : ''],
    ['Test drive', c.testDrive ? 'done' : 'not yet'],
  ));
  if (c.tradeIn) el.appendChild(h('div', { class: 'wm-note', text: `Has a trade-in: ${vehicleName(c.tradeIn)}` }));
  const known = notes.get(c.id);
  if (known) el.appendChild(h('ul', { class: 'wm-needs' }, ...known.map((line) => h('li', { text: line }))));
  if (showRecs === c.id) {
    const recs = recommendations(s, c);
    el.appendChild(h('div', { class: 'wm-recs' },
      h('div', { class: 'wm-k', text: (c.recommended ?? 0) >= 2 ? 'They have seen enough alternatives.' : 'Suggest another car on show:' }),
      ...((c.recommended ?? 0) >= 2 ? [] : recs.map(({ v: r, score }) => h('button', {
        class: 'wm-rec',
        on: { click: () => { a.ctx.act(recommendCar(s, c.id, r.id)); showRecs = null; a.redraw(); } },
      }, h('span', { class: 'mini-dot', style: `background:${r.colorHex}` }), h('span', { class: 'wm-rec-name', text: vehicleName(r) }), h('span', { class: 'tiny muted', text: money(r.askingPrice) }),
      h('span', { class: `tag ${score > 0.55 ? 'good' : score > 0.35 ? 'info' : 'warn'}`, text: `${Math.round(score * 100)}% match` })))),
      recs.length === 0 && (c.recommended ?? 0) < 2 ? h('p', { class: 'tiny muted', text: 'Nothing else on show suits them.' }) : null));
  }
  const actions = h('div', { class: 'wm-actions' });
  const neg = s.negotiation && !s.negotiation.done ? s.negotiation.customerId : null;
  actions.appendChild(btn(c.status === 'negotiating' ? 'Continue deal' : 'Negotiate', () => { a.close(); a.ctx.serve(c.id); }, 'primary', 'handshake', !!neg && neg !== c.id));
  actions.appendChild(btn(known ? 'Talked' : 'Talk', () => {
    const r = talkTo(s, c.id);
    if (r.ok) notes.set(c.id, r.needs.length ? r.needs : customerNeeds(s, c));
    a.redraw();
  }, '', 'customer'));
  const td = canTestDrive(s, c);
  actions.appendChild(btn('Test drive', () => {
    const car = s.vehicles.find((x) => x.id === c.vehicleId);
    const r = testDrive(s, c.id);
    if (r.ok && car) a.animateTestDrive(car);
    a.ctx.act(r);
    a.redraw();
  }, '', 'key', !td.ok, td.reason));
  actions.appendChild(btn('Recommend', () => { showRecs = showRecs === c.id ? null : c.id; a.redraw(); }, '', 'swap', c.status !== 'waiting'));
  if (v) actions.appendChild(btn('Their car', () => a.select({ kind: 'vehicle', id: v.id }), 'ghost', 'car'));
  el.appendChild(actions);
  // How well does their current car fit?
  if (v) el.appendChild(h('p', { class: 'tiny muted', text: `Match with this car: ${Math.round(matchScore(s, c, v) * 100)}%. A test drive usually warms people up — unless the car is tired.` }));
  void loc;
  return el;
}

// --------------------------------------------------------------- staff --

function staffMenu(a: WorldActions, loc: Location, e: Employee): HTMLElement {
  const s = a.ctx.state;
  const role = ROLE_BY_ID[e.role];
  const station = e.stationId ? loc.lot.objects.find((o) => o.id === e.stationId) : undefined;
  const el = h('div', { class: 'wm' },
    head(role.icon, e.name, `${role.name} · level ${e.level} · ${e.specialization}`, h('span', { class: `tag ${e.morale >= 60 ? 'good' : e.morale >= 35 ? 'warn' : 'bad'}`, text: `Morale ${Math.round(e.morale)}` })));
  el.appendChild(facts(
    ['Skill', `${Math.round(e.skill)}`],
    ['Salary', `${money(e.salary)}/mo`],
    ['Works at', station ? OBJ_BY_ID[station.defId]?.name ?? '—' : 'nowhere — needs a workstation', station ? '' : 'bad'],
    ['Deals closed', `${e.dealsClosed}`],
    ['Status', e.trainingDaysLeft > 0 ? `training (${e.trainingDaysLeft}d)` : 'working'],
  ));
  if (!station) el.appendChild(h('div', { class: 'wm-note bad', text: `Without ${stationName(e.role)} ${e.name.split(' ')[0]} works at 60% effectiveness. Build one.` }));
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn(`Train · ${money(trainingCost(e))}`, () => { a.ctx.act(train(s, e.id), { sound: 'buy' }); a.redraw(); }, '', 'upgrade', e.trainingDaysLeft > 0));
  if (canPromote(e)) actions.appendChild(btn('Promote', () => { a.ctx.act(promote(s, e.id)); a.redraw(); }, 'primary', 'level'));
  if (!station) actions.appendChild(btn('Build a workstation', () => a.build(e.role === 'sales' || e.role === 'mechanic' || e.role === 'detailer' ? 'work' : 'zones'), 'primary', 'hammer'));
  actions.appendChild(btn('Staff', () => a.panel('staff'), 'ghost', 'people'));
  el.appendChild(actions);
  return el;
}

// ------------------------------------------------------------- fixture --

function objectMenu(a: WorldActions, loc: Location, o: LotObject): HTMLElement {
  const s = a.ctx.state;
  const def = OBJ_BY_ID[o.defId];
  const f = footprint(o);
  const el = h('div', { class: 'wm' }, head(def.icon, def.name, `${f.w}×${f.h} m · ${money(def.upkeep)}/mo upkeep`));
  el.appendChild(h('p', { class: 'wm-desc', text: def.description }));
  if (def.slot) {
    const car = s.vehicles.find((v) => v.slotId === o.id && v.status !== 'sold');
    const reach = lotStats(loc.lot).reachable.has(o.id);
    el.appendChild(car
      ? h('button', { class: 'wm-note clickable', on: { click: () => a.select({ kind: 'vehicle', id: car.id }) } }, `🚗 ${vehicleName(car)} — tap to open`)
      : h('div', { class: 'wm-note', text: 'Empty.' }));
    if ((def.slot === 'parking' || def.slot === 'display') && !reach) el.appendChild(h('div', { class: 'wm-note bad', text: 'Customers cannot reach this space.' }));
  }
  if (def.station) {
    const who = s.employees.find((e) => e.stationId === o.id);
    el.appendChild(h('div', { class: 'wm-note', text: who ? `${ROLE_BY_ID[who.role].icon} ${who.name} works here.` : `Free — hire a ${def.station.map((r) => ROLE_BY_ID[r].name.toLowerCase()).join(' / ')}.` }));
  }
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn('Move', () => a.moveObject(o.id), '', 'move'));
  actions.appendChild(btn('Rotate', () => {
    const r = moveObject(s, loc, o.id, o.x, o.y, o.rot ? 0 : 1);
    a.ctx.act(r);
    a.redraw();
  }, '', 'rotate', f.w === f.h));
  actions.appendChild(btn(`Sell · +${money(Math.round(def.cost * 0.5))}`, async () => {
    if (def.cost >= 2000 && !(await confirmDialog(`Remove the ${def.name.toLowerCase()}?`, `You get ${money(Math.round(def.cost * 0.5))} back.`, 'Remove', true))) return;
    a.ctx.act(removeObject(s, loc, o.id), { sound: 'cash' });
    a.close();
  }, 'ghost', 'trash'));
  el.appendChild(actions);
  return el;
}

// ---------------------------------------------------------------- room --

const ROOM_TIPS: Partial<Record<ZoneCode, string>> = {
  s: 'Displays, a better floor, walls and lighting, windows and decoration raise the showroom level: more interest and better offers.',
  w: 'Each lift is a repair bay and a place for a mechanic. A tool wall or tyre machine makes repairs cheaper.',
  d: 'Each detailing bay cleans one car and seats one detailer. A paint booth or photo studio improves results.',
  l: 'Sofas, coffee and a TV make customers wait longer and leave happier.',
  r: 'A reception desk makes customers more patient. Sales desks can stand here too.',
  o: 'Office desks let you hire managers, buyers, accountants and marketing staff.',
  t: 'Storage spaces are cheap spots for cars that are not for sale yet.',
  a: 'Outdoor paving for parking spaces and walkways.',
  g: 'Trees and flowers raise curb appeal: more people stop by.',
  '.': 'Bare land. Paint a room or area on it in Build mode.',
};

function zoneMenu(a: WorldActions, loc: Location, x: number, y: number): HTMLElement {
  const code = zoneAt(loc.lot, Math.floor(x), Math.floor(y));
  const zone = ZONE_BY_CODE[code];
  const ls = lotStats(loc.lot);
  const level = code === 's' ? ls.levels.showroom : code === 'w' ? ls.levels.workshop : code === 'd' ? ls.levels.detailing : code === 'l' ? ls.levels.lounge : null;
  const el = h('div', { class: 'wm' }, head(zone.icon, zone.name, level !== null ? `Level ${level}` : `${ls.tiles[code] ?? 0} m² in total`));
  el.appendChild(h('p', { class: 'wm-desc', text: ROOM_TIPS[code] ?? zone.description }));
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn('Build here', () => a.build(code === '.' || code === 'a' || code === 'g' ? 'zones' : code === 's' ? 'vehicles' : code === 'w' || code === 'd' || code === 'o' ? 'work' : code === 'l' || code === 'r' ? 'furniture' : 'zones'), 'primary', 'hammer'));
  actions.appendChild(btn('Dealership info', () => a.panel('lot'), 'ghost', 'garage'));
  el.appendChild(actions);
  return el;
}

/** Forget talk notes for customers who have gone. */
export function pruneNotes(alive: Set<string>): void {
  for (const id of [...notes.keys()]) if (!alive.has(id)) notes.delete(id);
}
