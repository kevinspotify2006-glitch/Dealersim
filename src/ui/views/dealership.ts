import type { Ctx, View } from '../app';
import { h, kpi } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { CITY_BY_ID, ROLE_BY_ID, PREP_BY_ID, STRATEGIES } from '../../data/game';
import { activeLocation, capacityOf, occupying, staffAt, staffCapacity, vehicleName } from '../../sim/state';
import { lotStats } from '../../sim/lot';
import { prepActive, prepSlots } from '../../sim/vehicles';
import { expectedLeads, visitorCapacity } from '../../sim/customers';
import { EFFECTS } from '../../data/lot';
import type { EffectKey } from '../../data/lot';
import { competitorPressure } from '../../sim/world';
import { kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { openVehicle } from '../modals/vehicle';

export function locationPicker(ctx: Ctx): HTMLElement | null {
  const s = ctx.state;
  if (s.locations.length < 2) return null;
  return h('div', { class: 'pill-row scroll-x' }, ...s.locations.map((l) => h('button', {
    class: `pill${l.id === s.activeLocationId ? ' active' : ''}`,
    on: { click: () => { s.activeLocationId = l.id; ctx.refresh(); } },
  }, l.name)));
}

/** Facts about the physical dealership: what the building gives you, and what it costs. */
export function dealershipView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const city = CITY_BY_ID[loc.cityId];
  const ls = lotStats(loc.lot);
  const view = h('div', { class: 'view' });
  view.appendChild(pageHead(`${loc.name}`, `${city.region} · ${city.difficulty} market · ${loc.lot.w}×${loc.lot.h} m plot`,
    h('button', { class: 'btn primary', on: { click: () => ctx.go('dealership', { build: '1' }) } }, 'Build mode')));
  const picker = locationPicker(ctx);
  if (picker) view.appendChild(picker);

  const cap = capacityOf(loc);
  const used = occupying(s, loc.id);
  const here = s.vehicles.filter((v) => v.locationId === loc.id);
  const staff = staffAt(s, loc.id);
  const leads = expectedLeads(s, loc);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Spaces', value: `${used} / ${cap}`, sub: `${ls.slots.parking.length} parking · ${ls.slots.display.length} display · ${ls.slots.storage.length} storage`, icon: 'garage', tone: used >= cap ? 'warn' : 'info' }),
    kpi({ label: 'On sale', value: String(here.filter((v) => v.status === 'listed').length), sub: `${here.filter((v) => v.status === 'yard').length} not for sale yet`, icon: 'tag', tone: 'good' }),
    kpi({ label: 'Workstations', value: `${staff.length} / ${staffCapacity(loc)}`, sub: 'people / desks, lifts & bays', icon: 'people', tone: 'tech' }),
    tipped(kpi({ label: 'Customer flow', value: `${Math.round(ls.flow * 100)}%`, sub: `~${leads.total.toFixed(1)} visitors/day`, icon: 'customer', tone: ls.flow >= 0.7 ? 'good' : 'warn' }), 'How easily customers get from the entrance to your cars: reachable spaces, room to walk, distance and a reception.')));

  if (ls.issues.length) {
    view.appendChild(panel('Layout problems', ...ls.issues.slice(0, 8).map((i) => h('div', { class: `alert-row` }, h('span', { class: `alert-dot ${i.level === 'bad' ? 'critical' : 'warning'}` }), h('div', { class: 'alert-title', text: i.text })))));
  }

  const facilities: [string, string, number, number, string][] = [
    ['✨', 'Showroom', ls.levels.showroom, 5, 'Displays, floor, walls, lighting, windows and decoration in the showroom. Raises interest, offers and slows dust.'],
    ['🔧', 'Workshop', ls.levels.workshop, 4, 'Lifts, tool wall and tyre machine. Cheaper, faster repairs; level 2 unlocks major repairs.'],
    ['🧽', 'Detailing', ls.levels.detailing, 3, 'Detailing bays, paint booth, photo studio. Cheaper, better cleaning.'],
    ['☕', 'Lounge', ls.levels.lounge, 3, 'Sofas, coffee, TV and kids corner in the lounge or reception. Customers wait longer and leave happier.'],
    ['🩺', 'Diagnostics', ls.levels.equipment, 3, 'Scanner, diagnostics bench or dealer-grade kit in the workshop. Finds hidden faults.'],
  ];
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  left.appendChild(panel(panelTitle('What your building gives you', h('span', { class: 'sub', text: 'levels come from what is physically built' })),
    ...facilities.map(([ic, name, lvl, max, tip]) => tipped(h('div', { class: 'meter' }, h('span', { class: 'meter-name', text: `${ic} ${name}` }), h('div', { class: 'meter-bar' }, progressBar(lvl / max, lvl ? 'good' : '')), h('span', { class: 'meter-value', text: `${lvl}/${max}` })), tip)),
    kv('Sales desks', `${ls.stations.sales.length}`), kv('Lifts (mechanics)', `${ls.stations.mechanic.length}`), kv('Detailing bays', `${ls.stations.detailer.length}`), kv('Office desks', `${ls.stations.office.length}`)));

  // Every gameplay effect the layout gives, straight from the object data.
  const fx = (Object.keys(EFFECTS) as EffectKey[]).filter((k) => (ls.effects[k] ?? 0) > 0);
  left.appendChild(panel(panelTitle('Layout effects', h('span', { class: 'sub', text: 'from the objects you placed' })),
    kv('Visitor capacity', `${visitorCapacity(loc)} customers/day`, leads.total > visitorCapacity(loc) ? 'warn' : undefined),
    ...(fx.length ? fx.map((k) => {
      const e = EFFECTS[k];
      const v = Math.round((ls.effects[k] ?? 0) * 10) / 10;
      return tipped(kv(e.label, e.cap ? `${Math.min(v, e.cap)} / ${e.cap}${v > e.cap ? ' (max)' : ''}` : String(v), 'good'), `${e.label}: ${e.per}.`);
    }) : [h('p', { class: 'empty', text: 'Place furniture, lighting, chargers and cameras to add effects.' })])));

  // Strategy
  const current = loc.strategy ?? 'balanced';
  left.appendChild(panel(panelTitle('Dealership strategy', h('span', { class: 'sub', text: 'shapes who visits and how you price' })),
    h('div', { class: 'strategy-grid' }, ...STRATEGIES.map((st) => tipped(h('button', {
      class: `strategy${st.id === current ? ' chosen' : ''}`,
      aria: { pressed: String(st.id === current) },
      on: { click: () => { loc.strategy = st.id; ctx.act({ ok: true, message: `${loc.name} now focuses on: ${st.name}.` }); } },
    }, h('span', { class: 'card-title', text: `${st.icon} ${st.name}` }),
    h('span', { class: 'tiny muted', text: `Traffic ${st.footfall >= 1 ? '+' : ''}${Math.round((st.footfall - 1) * 100)}% · prices ${st.priceBias >= 1 ? '+' : ''}${Math.round((st.priceBias - 1) * 100)}%` })), st.description)))));

  // Workshop status
  const inPrep = here.filter((v) => v.status === 'prep');
  right.appendChild(panel(panelTitle('Workshop & detailing jobs', h('span', { class: 'sub', text: `${prepSlots(s, loc.id, 'mechanic')} repair · ${prepSlots(s, loc.id, 'detailer')} detailing at once` })),
    inPrep.length ? h('div', { class: 'list' }, ...inPrep.map((v) => {
      const job = v.prep[0];
      const def = job ? PREP_BY_ID[job.actionId] : undefined;
      const mode = prepActive(s, v);
      return h('button', { class: 'prep-job clickable-row', on: { click: () => openVehicle(ctx, v.id, 'prep') } },
        h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }),
        h('span', { class: 'mini-name', text: `${vehicleName(v)} — ${def?.name ?? ''}${mode === 'waiting' ? ' (waiting for a bay)' : mode === 'outsourced' ? ' (outsourced)' : ''}` }),
        progressBar(job ? 1 - job.daysLeft / Math.max(1, job.totalDays) : 1, mode === 'waiting' ? 'warn' : 'good'),
        h('span', { class: 'tiny muted', text: job ? `${job.daysLeft}d` : '' }));
    })) : h('p', { class: 'empty', text: 'No jobs in the workshop. Tap a car and choose Prep.' })));

  const manager = staff.some((e) => e.role === 'manager');
  right.appendChild(panel('Automation',
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: !!s.autoList[loc.id], disabled: !manager, on: { change: (e: Event) => { s.autoList[loc.id] = (e.target as HTMLInputElement).checked; ctx.refresh(); } } }),
      h('span', { text: 'Manager lists cars at the suggested price as soon as prep finishes' })),
    !manager ? h('p', { class: 'tiny muted', text: 'Hire a Manager (needs an office desk) to enable automation.' }) : null,
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: s.settings.autoStaffDeals, on: { change: (e: Event) => { s.settings.autoStaffDeals = (e.target as HTMLInputElement).checked; ctx.refresh(); } } }),
      h('span', { text: 'Salespeople serve customers you do not get to' }))));

  right.appendChild(panel('Running costs & performance',
    kv('Rent', `${money(loc.rentMonthly)}/month`),
    kv('Maintenance of fixtures', `${money(ls.upkeep)}/month`),
    kv('Power for equipment', `${money(ls.power)}/day`),
    kv('Revenue this month', money(loc.month.revenue)),
    kv('Gross profit this month', moneySigned(loc.month.profit), loc.month.profit >= 0 ? 'good' : 'bad'),
    kv('Sold this month', String(loc.month.sold)),
    kv('Local reputation', String(Math.round(loc.reputation))),
    kv('Competition pressure', `${Math.round(competitorPressure(s, loc.cityId) * 100)}%`)));
  right.appendChild(panel('Team here', staff.length ? h('div', {}, ...staff.map((e) => kv(`${ROLE_BY_ID[e.role].icon} ${e.name}`, e.stationId ? `skill ${Math.round(e.skill)}` : 'no workstation!', e.stationId ? undefined : 'warn'))) : h('p', { class: 'empty', text: 'Nobody works here yet.' })));

  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
