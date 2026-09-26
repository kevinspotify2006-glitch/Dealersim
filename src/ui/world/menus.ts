/**
 * Context menus for things you tap in the dealership: a car, a customer, an
 * employee, a fixture or a room. Each is a compact card of facts and the
 * actions that make sense right there.
 */
import { openTestDrive } from '../modals/testdrive';
import type { Ctx } from '../app';
import type { Customer, Employee, Location, LotObject, Vehicle } from '../../sim/types';
import { h, confirmDialog } from '../dom';
import { icon } from '../icons';
import { money, moneySigned } from '../../sim/format';
import { ARCHETYPE_BY_ID, PREP_BY_ID, ROLE_BY_ID } from '../../data/game';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import { absHour, activeLocation, vehicleName } from '../../sim/state';
import { assignSeller, canTestDrive, customerMood, customerNeeds, interestLabel, matchScore, onShow, recommendations, recommendCar, talkTo } from '../../sim/customers';
import { conditionGrade, conditionLabel, demandLabel, demandScore, knownCondition, suggestedPrice, totalCost } from '../../sim/market';
import { listVehicle, quickSell, unlistVehicle, wholesalePrice } from '../../sim/trading';
import { prepActive } from '../../sim/vehicles';
import { canPromote, promote, skillOf, titleOf } from '../../sim/staff';
import { SKILL_NAMES } from '../../data/game';
import { currentTask, openEmployee } from '../views/staff';
import { footprint, lotStats, refundFor, roomsOf, slotKindOf, stationName, zoneAt } from '../../sim/lot';
import { upgradeInfo } from '../../sim/buildplus';
import type { ZoneCode } from '../../sim/types';
import { openVehicle } from '../modals/vehicle';
import { progressBar, statusTag } from '../kit';
import type { Selection } from './render';
import { objectInfo } from './info';
import { meterRow, summaryRow } from '../mobile/components';

export interface WorldActions {
  ctx: Ctx;
  close: () => void;
  redraw: () => void;
  select: (sel: Selection) => void;
  moveCar: (vehicleId: string) => void;
  moveObject: (objId: string) => void;
  rotateObject: (objId: string) => void;
  deleteObject: (objId: string) => void;
  duplicate: (objId: string) => void;
  copy: (objId: string) => void;
  upgrade: (objId: string) => void;
  /** Drive one of your own cars in the test-drive game. */
  testDrive: (vehicleId: string) => void;
  /** Take a customer out yourself in the test-drive game. */
  driveCustomer: (customerId: string) => void;
  track: <T extends { ok: boolean }>(label: string, run: () => T) => T;
  panel: (id: string) => void;
  build: (category?: string) => void;
  animateTestDrive: (v: Vehicle) => void;
}

function demandText(d: number): string {
  const l = demandLabel(d);
  return `${l.tone === 'good' ? '🔥 ' : l.tone === 'bad' || l.tone === 'warn' ? '❄️ ' : ''}${l.label}`;
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
  const interested = s.customers.filter((c) => c.vehicleId === v.id && (c.status === 'waiting' || c.status === 'negotiating'));
  const el = h('div', { class: 'wm' },
    head('🚗', vehicleName(v), `${v.trim} · ${Math.round(v.mileage / 1000)}k km · ${where ? { parking: 'on the lot', display: 'in the showroom', storage: 'in storage', lift: 'on a lift', bay: 'in the detailing bay', floor: 'parked by hand' }[where] : 'parked on the street'}`, statusTag(v.status)),
    facts(
      ['Asking', v.askingPrice ? money(v.askingPrice) : `~${money(suggestedPrice(s, v))}`],
      ['Bought for', money(v.purchasePrice)],
      ['Invested', money(cost)],
      ['Margin', moneySigned((v.askingPrice || suggestedPrice(s, v)) - cost), (v.askingPrice || suggestedPrice(s, v)) - cost >= 0 ? 'good' : 'bad'],
      ['Condition', `${Math.round(cond)} · ${conditionGrade(v)}`],
      ['Presentation', `${Math.round(v.presentation)}`],
      ['In stock', `${v.daysInStock} days`],
      ['Demand', demandText(demandScore(s, v))],
      ['Interest', `${interested.length} customer${interested.length === 1 ? '' : 's'}`, interested.length ? 'good' : ''],
    ));
  // The one line a phone shows before "Manage": price, state and what it earns.
  const price = v.askingPrice || suggestedPrice(s, v);
  const statusText: Record<string, string> = { yard: 'Ready to list', listed: 'For sale', prep: 'In preparation', transit: 'On its way', sold: 'Sold' };
  el.insertBefore(summaryRow({ text: money(price), strong: true }, { text: statusText[v.status] ?? v.status, tone: v.status === 'listed' ? 'good' : v.status === 'yard' ? 'warn' : 'info' },
    { text: `${moneySigned(price - cost)} margin`, tone: price - cost >= 0 ? 'good' : 'bad' }), el.children[1] ?? null);
  if (v.options.length || v.certified || v.demo || v.boughtBy) el.appendChild(h('div', { class: 'wm-chips' },
    ...v.options.slice(0, 6).map((o) => h('span', { class: 'tag plain', text: o })),
    v.certified ? h('span', { class: 'tag good', text: '✔ Certified' }) : null,
    v.demo ? h('span', { class: 'tag info', text: 'Demo car' }) : null,
    v.boughtBy ? h('span', { class: 'tag plain', text: `🔎 found by ${s.employees.find((e) => e.id === v.boughtBy)?.name.split(' ')[0] ?? 'a buyer'}` }) : null));
  void conditionLabel;
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
  if (v.status === 'yard' || v.status === 'listed') actions.appendChild(btn('Test drive', () => { a.close(); a.testDrive(v.id); }, '', 'key', false, 'Drive it yourself on a test route'));
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
  const mood = customerMood(s, c);
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
  const appt = c.appointment ? s.appointments.find((x) => x.id === c.appointment) : undefined;
  const best = recommendations(s, c)[0];
  el.appendChild(h('div', { class: `wm-mood ${mood}` }, h('span', { text: mood === 'green' ? '🟢' : mood === 'amber' ? '🟡' : '🔴' }), h('span', { text: mood === 'green' ? 'Keen to buy' : mood === 'amber' ? 'Doubting' : 'About to leave' })));
  el.appendChild(facts(
    ['Looking at', v ? vehicleName(v) : '—'],
    ['Asking', v ? money(v.askingPrice) : '—'],
    ['Budget', c.talked ? `~${money(Math.round(c.budget / 500) * 500)}` : 'talk to find out'],
    ['Finance', c.wantsFinance ? `wants monthly (≤ ${money(c.monthlyLimit ?? 0)}/mo)` : c.talked ? 'pays cash' : '?'],
    ['Household', c.household ?? '—'],
    ['Brands', c.favBrands?.length ? c.favBrands.slice(0, 2).join(', ') : 'open'],
    ['Patience', c.status === 'negotiating' ? 'talking to you' : hoursLeft <= 1 ? 'leaving soon!' : `~${hoursLeft} h`, hoursLeft <= 1 ? 'bad' : ''],
    ['Test drive', c.testDrive ? 'done' : 'not yet'],
    ['Appointment', appt ? `${appt.title.replace(/^\S+\s/, '')} ${String(Math.floor(appt.start)).padStart(2, '0')}:${appt.start % 1 ? '30' : '00'}` : 'walk-in'],
    ['History', client ? `${client.purchases} car${client.purchases === 1 ? '' : 's'} · ${client.satisfaction.toFixed(1)}★` : 'new customer'],
  ));
  if (best && best.v.id !== v?.id) el.appendChild(h('button', { class: 'wm-note clickable', on: { click: () => a.select({ kind: 'vehicle', id: best.v.id }) } }, `💡 Might buy: ${vehicleName(best.v)} (${Math.round(best.score * 100)}% match)`));
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
  actions.appendChild(btn('Test drive', () => openTestDrive(a.ctx, c.id, (car) => a.animateTestDrive(car), () => a.redraw(), () => { a.close(); a.driveCustomer(c.id); }), '', 'key', !td.ok, td.reason));
  actions.appendChild(btn('Recommend', () => { showRecs = showRecs === c.id ? null : c.id; a.redraw(); }, '', 'swap', c.status !== 'waiting'));
  if (c.status === 'waiting') actions.appendChild(btn('Assign advisor', () => { a.ctx.act(assignSeller(s, c.id), { sound: 'success' }); a.redraw(); }, '', 'people'));
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
  const main = role.skill;
  const top = (['sales', 'negotiation', 'finance', 'service', 'technical', 'ev', 'luxury', 'management', 'speed', 'buying', 'appraisal', 'detail'] as const)
    .filter((k) => k !== main).map((k) => ({ k, v: skillOf(e, k) })).sort((x, y) => y.v - x.v).slice(0, 2);
  const el = h('div', { class: 'wm' },
    head(role.icon, e.name, `${titleOf(e)} · level ${e.level} · ${e.specialization}`, h('span', { class: `tag ${e.morale >= 60 ? 'good' : e.morale >= 35 ? 'warn' : 'bad'}`, text: `😊 ${Math.round(e.morale)}` })));
  const perf = e.performance ?? 50;
  el.appendChild(h('div', { class: 'wm-summary col' }, meterRow('Performance', perf / 100, `${Math.round(perf)}%`, perf >= 60 ? 'good' : perf < 40 ? 'bad' : 'warn'),
    h('span', { class: 't-secondary', text: `${ROLE_BY_ID[e.role].name} · ${money(e.salary)}/month · ${e.absentDay === s.day ? 'absent today' : e.trainingDaysLeft > 0 ? 'in training' : 'working'}` })));
  el.appendChild(h('div', { class: 'pc-task busy', text: currentTask(a.ctx, e) }));
  el.appendChild(facts(
    [SKILL_NAMES[main], `${Math.round(skillOf(e, main))}`],
    ...top.map((t) => [SKILL_NAMES[t.k], `${Math.round(t.v)}`] as [string, string]),
    ['Performance', `${Math.round(e.performance ?? 50)}/100`, (e.performance ?? 50) >= 60 ? 'good' : (e.performance ?? 50) < 40 ? 'bad' : ''],
    ['Stress', `${Math.round(e.stress ?? 0)}/100`, (e.stress ?? 0) > 70 ? 'bad' : ''],
    ['Salary', `${money(e.salary)}/mo`],
    ['Works at', station ? OBJ_BY_ID[station.defId]?.name ?? '—' : 'nowhere — needs a workstation', station ? '' : 'bad'],
  ));
  const today = s.appointments.filter((x) => x.staffId === e.id && x.day === s.day && x.status !== 'cancelled' && x.status !== 'done').sort((x, y) => x.start - y.start).slice(0, 3);
  if (today.length) el.appendChild(h('div', { class: 'mini-plan' }, ...today.map((x) => h('div', { class: `mini-appt ${x.kind} ${x.status}` }, h('span', { class: 'num', text: `${String(Math.floor(x.start)).padStart(2, '0')}:${x.start % 1 ? '30' : '00'}` }), h('span', { text: `${x.title} · ${x.vehicle}` })))));
  if (!station) el.appendChild(h('div', { class: 'wm-note bad', text: `Without ${stationName(e.role)} ${e.name.split(' ')[0]} works at 60% effectiveness. Build one.` }));
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn('Profile', () => openEmployee(a.ctx, e.id), 'primary', 'people'));
  if (canPromote(e)) actions.appendChild(btn('Promote', () => { a.ctx.act(promote(s, e.id)); a.redraw(); }, 'primary', 'level'));
  if (!station) actions.appendChild(btn('Build a workstation', () => a.build('staff'), 'primary', 'hammer'));
  actions.appendChild(btn('Planning', () => a.ctx.go(['mechanic', 'technician', 'detailer', 'prep'].includes(e.role) ? 'service' : 'people', { tab: 'planning' }), 'ghost', 'clock'));
  if (e.role === 'buyer' || e.role === 'procurement') actions.appendChild(btn('Brief', () => a.ctx.go('inventory', { tab: 'buyers' }), 'ghost', 'search'));
  el.appendChild(actions);
  return el;
}

// ------------------------------------------------------------- fixture --

function objectMenu(a: WorldActions, loc: Location, o: LotObject): HTMLElement {
  const s = a.ctx.state;
  const def = OBJ_BY_ID[o.defId];
  const f = footprint(o);
  const el = h('div', { class: 'wm' }, head(def.icon, `Selected: ${def.name}`, `${f.w}×${f.h} m · X ${f.x} · Y ${f.y} · ${o.rot ? 90 : 0}°`));
  {
    const lv = upgradeInfo(o);
    const car = def.slot ? s.vehicles.find((v) => v.slotId === o.id && v.status !== 'sold') : undefined;
    const who = def.station ? s.employees.find((e) => e.stationId === o.id) : undefined;
    el.appendChild(summaryRow(lv.steps ? { text: `Level ${lv.level}/3`, strong: true } : { text: money(def.cost), strong: true },
      def.slot ? { text: car ? vehicleName(car) : 'Empty space', tone: car ? 'good' : '' } : def.station ? { text: who ? who.name : 'No one working here', tone: who ? 'good' : 'warn' } : { text: def.category }));
  }
  const info = objectInfo(s, def, { loc, o });
  info.classList.add('wm-info', 'collapsible');
  el.appendChild(info);
  if (def.slot) {
    const car = s.vehicles.find((v) => v.slotId === o.id && v.status !== 'sold');
    const reach = lotStats(loc.lot).reachable.has(o.id);
    if (car) el.appendChild(h('button', { class: 'wm-note clickable', on: { click: () => a.select({ kind: 'vehicle', id: car.id }) } }, `🚗 ${vehicleName(car)} — tap to open`));
    if ((def.slot === 'parking' || def.slot === 'display') && !reach) el.appendChild(h('div', { class: 'wm-note bad', text: 'Customers cannot reach this space.' }));
  }
  if (def.station) {
    const who = s.employees.find((e) => e.stationId === o.id);
    if (!who) el.appendChild(h('div', { class: 'wm-note', text: `Free — hire a ${def.station.map((r) => ROLE_BY_ID[r].name.toLowerCase()).join(' / ')}.` }));
  }
  const up = upgradeInfo(o);
  if (up.steps) {
    el.appendChild(h('div', { class: 'wm-levels' }, ...[1, 2, 3].map((l) => h('span', { class: `wm-lv${l <= up.level ? ' on' : ''}`, title: l === 1 ? def.name : up.steps![l - 2].name, text: `Lv ${l}` })),
      h('span', { class: 'tiny muted', text: up.next ? `Next: ${up.next.name} — ${up.next.text}` : `Fully upgraded: ${up.steps[1].name}` })));
  }
  const refund = refundFor(s, o);
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn('Move', () => a.moveObject(o.id), '', 'move'));
  actions.appendChild(btn('Rotate', () => a.rotateObject(o.id), '', 'rotate', f.w === f.h));
  actions.appendChild(btn('Duplicate', () => a.duplicate(o.id), '', 'plus', false, 'Place a copy (Ctrl+D)'));
  if (up.next) actions.appendChild(btn(`Upgrade · ${money(up.next.cost)}`, () => a.upgrade(o.id), 'primary', 'upgrade', s.cash < up.next.cost, up.next.text));
  actions.appendChild(btn(`Bulldoze · +${money(refund.refund)}`, () => a.deleteObject(o.id), 'danger-ghost', 'trash', false, 'Demolish and get part of the cost back (Delete)'));
  actions.appendChild(btn('Info', () => { info.classList.toggle('open'); }, 'ghost', 'info'));
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
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const room = roomsOf(loc.lot).find((r) => r.code === code && tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1);
  if (room) el.appendChild(h('div', { class: `wm-note ${room.complete ? 'good' : ''}`, text: room.complete ? `✓ Working room (${['', 'basic', 'good', 'excellent'][room.quality]}): ${room.purpose}${Object.keys(room.bonus).length ? ` · ${Object.entries(room.bonus).map(([k, v]) => `+${v} ${k}`).join(', ')}` : ''}` : `Needs ${room.needs.join(' and ')} to work: ${room.purpose.toLowerCase()}.` }));
  const actions = h('div', { class: 'wm-actions' });
  actions.appendChild(btn('Build here', () => a.build(code === '.' || code === 'a' || code === 'g' ? 'zones' : code === 's' ? 'showroom' : code === 'w' || code === 'd' || code === 'p' ? 'service' : code === 'o' || code === 'm' || code === 'k' ? 'staff' : code === 'l' || code === 'r' || code === 'b' ? 'customers' : code === 'f' ? 'finance' : 'zones'), 'primary', 'hammer'));
  actions.appendChild(btn('Dealership info', () => a.panel('lot'), 'ghost', 'garage'));
  el.appendChild(actions);
  return el;
}

/** Forget talk notes for customers who have gone. */
export function pruneNotes(alive: Set<string>): void {
  for (const id of [...notes.keys()]) if (!alive.has(id)) notes.delete(id);
}
