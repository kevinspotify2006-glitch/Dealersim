import type { Ctx, View } from '../app';
import { empty, h, icon, table } from '../dom';
import { money, shortDate } from '../../sim/format';
import { ARCHETYPE_BY_ID, ARCHETYPES } from '../../data/game';
import { waitingCustomers, interestLabel, expectedLeads } from '../../sim/customers';
import { locationName, vehicleName, activeLocation, staffAt } from '../../sim/state';
import { carArt } from '../art';
import { helpButton, pageHead, panel, panelTitle, tipped } from '../kit';
import { shareBars } from '../chart';
import { isWide } from '../layout';

let q = '';

export function customersView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const waiting = waitingCustomers(s);
  const loc = activeLocation(s);
  const sellers = staffAt(s, loc.id).filter((e) => e.role === 'sales').length;
  view.appendChild(pageHead('Customers', `${waiting.length} waiting · ${s.stats.customersTotal} visitors so far · ${sellers} salesperson${sellers === 1 ? '' : 's'} at ${loc.name}`,
    helpButton('negotiation'),
    h('label', { class: 'switch compact' },
      h('input', { type: 'checkbox', checked: s.settings.autoStaffDeals, on: { change: (e: Event) => { s.settings.autoStaffDeals = (e.target as HTMLInputElement).checked; ctx.refresh(); } } }),
      h('span', { text: 'Staff serve customers I miss' })),
    h('label', { class: 'switch compact' },
      h('input', { type: 'checkbox', checked: s.settings.pauseOnCustomer, on: { change: (e: Event) => { s.settings.pauseOnCustomer = (e.target as HTMLInputElement).checked; ctx.refresh(); } } }),
      h('span', { text: 'Pause when someone walks in' }))));

  if (!waiting.length) {
    view.appendChild(empty(s.vehicles.some((v) => v.status === 'listed')
      ? 'Nobody is waiting right now. Run the clock — customers arrive between 08:00 and 20:00.'
      : 'Customers only come for cars that are on sale. List a vehicle from your Inventory.', {
      title: 'No customers waiting', icon: 'customer',
      action: s.vehicles.some((v) => v.status === 'listed') ? undefined : h('button', { class: 'btn primary', on: { click: () => ctx.go('inventory') } }, 'Open inventory'),
    }));
  } else {
    const grid = h('div', { class: 'customer-grid' });
    for (const c of waiting) {
      const v = s.vehicles.find((x) => x.id === c.vehicleId);
      const a = ARCHETYPE_BY_ID[c.archetype];
      const il = interestLabel(c.interest);
      const hoursLeft = Math.max(0, c.leaveHour - (s.day * 24 + s.hour));
      const art = h('div', { class: 'cust-art' });
      if (v) art.appendChild(carArt(v, 130));
      grid.appendChild(h('article', { class: 'cust-card' },
        h('div', { class: 'cust-head' }, h('span', { class: 'cust-icon', text: a.icon }),
          h('div', { style: 'min-width:0' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: `${a.name} · ${c.channel}` })),
          h('span', { class: `tag ${il.tone}`, text: il.label })),
        art,
        h('div', { class: 'tiny', text: v ? `Interested in the ${vehicleName(v)} — asking ${money(v.askingPrice)}` : '' }),
        h('div', { class: 'cust-meta' },
          tipped(h('span', { class: `tag ${hoursLeft <= 1 ? 'bad' : 'warn'}`, text: hoursLeft <= 1 ? 'Leaving soon' : `Waits ~${hoursLeft}h` }), 'If nobody serves them in time a salesperson steps in — or they leave.'),
          c.tradeIn ? h('span', { class: 'tag info', text: 'Has a trade-in' }) : null,
          s.locations.length > 1 ? h('span', { class: 'tag plain', text: locationName(s, c.locationId) }) : null),
        h('button', { class: 'btn primary block', on: { click: () => ctx.serve(c.id) } }, icon('handshake', 15), 'Serve customer')));
    }
    view.appendChild(grid);
  }

  const leads = expectedLeads(s, loc);
  const lost = s.lostLeads;
  const reasons = new Map<string, number>();
  for (const l of lost) reasons.set(l.reason, (reasons.get(l.reason) ?? 0) + 1);
  const wants = new Map<string, number>();
  for (const l of lost) wants.set(ARCHETYPE_BY_ID[l.archetype].name, (wants.get(ARCHETYPE_BY_ID[l.archetype].name) ?? 0) + 1);

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const search = h('input', { type: 'search', placeholder: 'Search lost customers…', value: q, aria: { label: 'Search customers' } });
  const lostHost = h('div', {});
  const drawLost = (): void => {
    const list = lost.filter((l) => !q || `${l.wanted} ${l.reason} ${ARCHETYPE_BY_ID[l.archetype].name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    if (list.length && !isWide()) {
      lostHost.replaceChildren(h('div', { class: 'compact-list' }, ...list.map((l) => h('div', { class: 'compact-row' },
        h('span', { text: ARCHETYPE_BY_ID[l.archetype].icon }),
        h('div', { class: 'compact-main' }, h('div', { class: 'compact-title', text: `${ARCHETYPE_BY_ID[l.archetype].name} — ${l.wanted}` }), h('div', { class: 'compact-sub', text: l.reason })),
        h('div', { class: 'compact-side' }, h('span', { class: 'tiny muted', text: shortDate(l.day) }))))));
      return;
    }
    lostHost.replaceChildren(list.length ? table(['Customer type', 'Wanted', 'Why they left', 'Day'], list.map((l) => [
      h('span', { text: `${ARCHETYPE_BY_ID[l.archetype].icon} ${ARCHETYPE_BY_ID[l.archetype].name}` }),
      h('span', { class: 'tiny', text: l.wanted }),
      h('span', { class: 'tiny muted', text: l.reason }),
      h('span', { class: 'num', text: shortDate(l.day) }),
    ])) : h('p', { class: 'empty', text: 'No missed customers. Nice work.' }));
  };
  search.addEventListener('input', () => { q = search.value; drawLost(); });
  drawLost();
  left.appendChild(panel(panelTitle('Customers who left without buying', h('span', { class: 'sub', text: 'what they wanted tells you what to stock' })), h('div', { class: 'search wide' }, icon('search', 15), search), lostHost));

  right.appendChild(panel('Footfall',
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Expected per day' }), h('span', { class: 'stat-value', text: leads.total.toFixed(1) })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Walk-in / online' }), h('span', { class: 'stat-value', text: `${leads.walkIn.toFixed(1)} / ${leads.online.toFixed(1)}` })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Conversion (lifetime)' }), h('span', { class: 'stat-value', text: s.stats.customersTotal ? `${Math.round((s.stats.sold / s.stats.customersTotal) * 100)}%` : '—' }))));
  if (reasons.size) right.appendChild(panel('Why customers left', shareBars([...reasons.entries()].map(([label, value]) => ({ label, value })))));
  if (wants.size) right.appendChild(panel('Who you are missing', shareBars([...wants.entries()].map(([label, value]) => ({ label, value })))));
  right.appendChild(panel('Customer types', h('div', { class: 'archetypes' }, ...ARCHETYPES.map((a) => tipped(h('div', { class: 'arch' }, h('span', { class: 'arch-icon', text: a.icon }), h('div', {}, h('div', { class: 'tiny', text: a.name }), h('div', { class: 'tiny muted', text: `${money(a.budget[0])}–${money(a.budget[1])}` }))),
    `Likes: ${a.categories.join(', ')} · ${a.bodies.join(', ')}. Price sensitivity ${Math.round(a.priceSensitivity * 100)}%.`)))));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
