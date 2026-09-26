/**
 * Inventory → Buyers: brief your vehicle buyers, see what they find and what
 * each one earns you.
 */
import type { Ctx, View } from '../app';
import type { BuyMandate, BuyProposal, Category, Employee, FuelType, RiskAppetite } from '../../sim/types';
import { avatar, confirmDialog, empty, h, kpi, modal } from '../dom';
import { money, moneyShort } from '../../sim/format';
import { CATEGORIES, FUELS, MANUFACTURERS } from '../../data/vehicles';
import { ROLE_BY_ID } from '../../data/game';
import { vehicleName, freeSpaces } from '../../sim/state';
import { approveProposal, buyerScore, buyerStats, buyers, declineProposal, defaultMandate, mandateFor, pushProposal, RISK_NAMES, saveMandate, topUpBudget } from '../../sim/systems/procurement';
import { skillOf, titleOf } from '../../sim/staff';
import { carArt } from '../art';
import { helpButton, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { currentTask } from './staff';

export function procurementView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const team = buyers(s);
  const props = s.procurement.proposals;
  view.appendChild(pageHead('Buyers', team.length ? `${team.length} buyer${team.length === 1 ? '' : 's'} · ${props.length} deal${props.length === 1 ? '' : 's'} waiting for you` : 'Let vehicle buyers find, check and haggle for stock while you run the showroom', helpButton('buyers')));
  if (!team.length) {
    view.appendChild(panel('No buyers yet', empty('A vehicle buyer searches the trade, auctions and private sellers for cars that fit your brief, checks them, haggles and brings you the deals. A good one finds better cars for less and spots the bad ones. They work from an office desk.', {
      title: 'Hire a vehicle buyer', icon: 'search',
      action: h('button', { class: 'btn primary', on: { click: () => ctx.go('people', { tab: 'hire' }) } }, 'Recruit a buyer'),
    })));
    return { el: view };
  }
  // Deals first: this is what needs you.
  view.appendChild(panel(panelTitle('Deals to approve', h('span', { class: 'sub', text: props.length ? 'sellers do not wait long — decide within two days' : 'your buyers bring deals here' })),
    props.length ? h('div', { class: 'deal-grid' }, ...props.map((p) => dealCard(ctx, p))) : h('p', { class: 'empty', text: team.some((e) => mandateFor(s, e.id)?.active) ? 'Nothing yet — your buyers are searching.' : 'Give a buyer a brief below to start.' })));

  const month = team.reduce((a, e) => a + buyerStats(s, e.id, 30).realised, 0);
  const salaries = team.reduce((a, e) => a + e.salary, 0);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Margin from buyers (30 d)', value: moneyShort(month), sub: 'on the cars they found that are sold', icon: 'profit', tone: 'good' }),
    kpi({ label: 'Buyer salaries', value: moneyShort(salaries), sub: 'per month', icon: 'people', tone: 'warn' }),
    kpi({ label: 'Cars bought (30 d)', value: String(team.reduce((a, e) => a + buyerStats(s, e.id, 30).bought, 0)), sub: `${freeSpaces(s, s.activeLocationId)} free spaces`, icon: 'car', tone: 'info' }),
    kpi({ label: 'Deals missed (30 d)', value: String(team.reduce((a, e) => a + buyerStats(s, e.id, 30).missed, 0)), sub: 'not answered in time', icon: 'clock', tone: 'tech' })));

  for (const e of team) view.appendChild(buyerPanel(ctx, e));
  return { el: view };
}

function dealCard(ctx: Ctx, p: BuyProposal): HTMLElement {
  const s = ctx.state;
  const v = p.vehicle;
  const e = s.employees.find((x) => x.id === p.buyerId);
  const art = h('div', { class: 'deal-art' });
  art.appendChild(carArt(v, 220));
  const saving = p.asking - p.price;
  return h('article', { class: `deal-card risk-${p.risk}`, data: { proposal: p.id } },
    art,
    h('div', { class: 'deal-body' },
      h('div', { class: 'deal-title', text: vehicleName(v) }),
      h('div', { class: 'tiny muted', text: `${v.trim} · ${Math.round(v.mileage / 1000)}k km · ${v.fuel} · ${v.transmission} · via ${e?.name.split(' ')[0] ?? 'buyer'}` }),
      h('div', { class: 'deal-price' }, h('span', { class: 'deal-big', text: money(p.price) }), saving > 0 ? h('span', { class: 'tag good', text: `−${money(saving)} haggled` }) : null),
      h('div', { class: 'deal-margin' }, h('span', { text: '🟢' }), h('span', { text: `${money(p.estMargin)} expected margin` })),
      h('div', { class: 'tiny muted', text: `Sells for ~${money(p.estRetail)} · prep ~${money(p.estPrep)} · risk ${p.risk}` }),
      h('ul', { class: 'deal-notes' }, ...p.notes.map((n) => h('li', { text: n }))),
      h('div', { class: 'tiny muted', text: p.expires <= s.day ? 'Seller wants an answer today' : `Seller waits ${p.expires - s.day + 1} days` })),
    h('div', { class: 'deal-actions' },
      h('button', { class: 'btn', data: { act: 'decline' }, on: { click: () => ctx.act(declineProposal(s, p.id)) } }, 'Decline'),
      h('button', { class: 'btn', data: { act: 'push' }, disabled: p.rounds >= 2, title: 'Ask the buyer to go back for a better price (the seller may walk)', on: { click: () => ctx.act(pushProposal(s, p.id)) } }, 'Negotiate'),
      h('button', { class: 'btn primary', data: { act: 'approve' }, on: { click: () => ctx.act(approveProposal(s, p.id), { sound: 'buy', money: -p.price }) } }, 'Approve')));
}

function buyerPanel(ctx: Ctx, e: Employee): HTMLElement {
  const s = ctx.state;
  const m = mandateFor(s, e.id);
  const st = buyerStats(s, e.id, 30);
  const sk = buyerScore(s, e);
  const value = st.realised - e.salary;
  const left = m ? m.budget - m.spent : 0;
  return panel(panelTitle(`${ROLE_BY_ID[e.role].icon} ${e.name}`, h('span', { class: 'sub', text: titleOf(e) })),
    h('div', { class: 'buyer-head' },
      avatar(e.name),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'pc-task busy', text: currentTask(ctx, e) }),
        h('div', { class: 'buyer-skills' }, ...(['buying', 'appraisal', 'negotiation', 'detail'] as const).map((k) => tipped(h('div', { class: 'skill-row' }, h('span', { class: 'tiny', text: k === 'buying' ? 'Buying' : k === 'appraisal' ? 'Appraisal' : k === 'negotiation' ? 'Negotiation' : 'Detail' }), progressBar(sk[k] / 100, sk[k] >= 60 ? 'good' : sk[k] >= 40 ? 'info' : 'warn'), h('span', { class: 'tiny num', text: String(Math.round(sk[k])) })),
          k === 'buying' ? 'How much ground they cover: more cars looked at, more deals found.' : k === 'appraisal' ? 'How close their value estimates are — weak buyers are optimistic.' : k === 'negotiation' ? 'How much they take off the asking price.' : 'Finding hidden damage before you buy.')))),
      h('div', { class: `buyer-value ${value >= 0 ? 'good' : 'bad'}` },
        h('div', { class: 'deal-big', text: `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}` }),
        h('div', { class: 'tiny muted', text: `a month: ${money(st.realised)} margin − ${money(e.salary)} salary` }),
        h('div', { class: 'tiny muted', text: `${st.bought} bought · ${st.sold} sold · ${st.missed} missed (30 d)` }))),
    m ? h('div', { class: 'mandate-sum' },
      h('span', { class: `tag ${m.active ? 'good' : ''}`, text: m.active ? 'Searching' : 'Paused' }),
      h('span', { class: 'tiny', text: `${m.brands.length ? m.brands.map((b) => MANUFACTURERS.find((x) => x.id === b)?.name ?? b).join(', ') : 'Any brand'} · ${m.categories.length ? m.categories.join(', ') : 'any segment'} · ${m.yearMin}–${m.yearMax} · <${Math.round(m.kmMax / 1000)}k km · max ${money(m.maxPrice)} · margin ≥ ${money(m.minMargin)} · ${m.risk} risk${m.autoApprove ? ' · auto-approve' : ''}` }),
      h('div', { class: 'budget-line' }, h('span', { class: 'tiny', text: `Budget ${money(left)} left of ${money(m.budget)}` }), progressBar(m.budget ? left / m.budget : 0, left > m.maxPrice ? 'good' : 'warn'))) : h('p', { class: 'tiny muted', text: 'No brief yet.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', data: { brief: e.id }, on: { click: () => openBrief(ctx, e) } }, m ? 'Edit brief' : 'Give a brief'),
      m ? h('button', { class: 'btn', data: { toggle: e.id }, on: { click: () => { m.active = !m.active; ctx.act(saveMandate(s, m)); } } }, m.active ? 'Pause' : 'Resume') : null,
      m ? h('button', { class: 'btn', on: { click: async () => { if (await confirmDialog('Add budget?', `Give ${e.name.split(' ')[0]} another ${money(50000)} to spend?`, 'Add €50,000')) ctx.act(topUpBudget(s, e.id, 50000)); } } }, '+ €50k budget') : null));
}

/** The brief editor: everything the buyer should look for. */
export function openBrief(ctx: Ctx, e: Employee): void {
  const s = ctx.state;
  const existing = mandateFor(s, e.id);
  const m: BuyMandate = existing ? { ...existing, brands: [...existing.brands], categories: [...existing.categories], fuels: [...existing.fuels] } : defaultMandate(s, e);
  const { body, footer, close } = modal({ title: `Brief for ${e.name}`, sub: `${titleOf(e)} · buying ${Math.round(skillOf(e, 'buying'))} · appraisal ${Math.round(skillOf(e, 'appraisal'))}`, width: 640, onClose: () => ctx.refresh() });
  const num = (label: string, key: 'budget' | 'maxPrice' | 'minMargin' | 'kmMax' | 'yearMin' | 'yearMax', step: number): HTMLElement => {
    const input = h('input', { type: 'number', value: String(m[key]), step, inputmode: 'numeric', data: { field: key }, aria: { label } });
    input.addEventListener('change', () => { m[key] = Math.max(0, Math.round(Number(input.value) || 0)); });
    return h('label', { class: 'field' }, h('span', { text: label }), input);
  };
  const chips = <T extends string>(label: string, all: { id: T; name: string }[], list: T[]): HTMLElement => {
    const wrap = h('div', { class: 'chip-pick' });
    const paint = (): void => {
      wrap.replaceChildren(
        h('button', { class: `bp-chip${list.length === 0 ? ' active' : ''}`, on: { click: () => { list.length = 0; paint(); } } }, 'Any'),
        ...all.map((x) => h('button', { class: `bp-chip${list.includes(x.id) ? ' active' : ''}`, data: { pick: x.id }, on: { click: () => { const i = list.indexOf(x.id); if (i >= 0) list.splice(i, 1); else list.push(x.id); paint(); } } }, x.name)));
    };
    paint();
    return h('div', { class: 'field' }, h('span', { text: label }), wrap);
  };
  body.appendChild(h('div', { class: 'grid cols-3' }, num('Budget (€)', 'budget', 5000), num('Max price per car (€)', 'maxPrice', 1000), num('Min expected margin (€)', 'minMargin', 250)));
  body.appendChild(h('div', { class: 'grid cols-3' }, num('Oldest year', 'yearMin', 1), num('Newest year', 'yearMax', 1), num('Max mileage (km)', 'kmMax', 10000)));
  body.appendChild(chips('Brands', MANUFACTURERS.map((b) => ({ id: b.id, name: b.name })), m.brands));
  body.appendChild(chips<Category>('Segments', CATEGORIES.map((c) => ({ id: c, name: c })), m.categories));
  body.appendChild(chips<FuelType>('Fuel', FUELS.map((f) => ({ id: f, name: f })), m.fuels));
  const gear = h('div', { class: 'seg' });
  const paintGear = (): void => gear.replaceChildren(...([undefined, 'Manual', 'Automatic'] as const).map((g) => h('button', { class: `seg-btn${m.transmission === g ? ' active' : ''}`, on: { click: () => { m.transmission = g; paintGear(); } } }, g ?? 'Any gearbox')));
  paintGear();
  body.appendChild(h('div', { class: 'field' }, h('span', { text: 'Gearbox' }), gear));
  const risk = h('div', { class: 'choice-list' });
  const paintRisk = (): void => risk.replaceChildren(...(['low', 'medium', 'high'] as RiskAppetite[]).map((r) => h('button', { class: `choice${m.risk === r ? ' active' : ''}`, data: { risk: r }, on: { click: () => { m.risk = r; paintRisk(); } } }, h('div', { class: 'card-title', text: r[0].toUpperCase() + r.slice(1) }), h('div', { class: 'tiny muted', text: RISK_NAMES[r] }))));
  paintRisk();
  body.appendChild(h('div', { class: 'field' }, h('span', { text: 'Risk' }), risk));
  const auto = h('input', { type: 'checkbox', checked: m.autoApprove, data: { field: 'auto' } });
  auto.addEventListener('change', () => { m.autoApprove = auto.checked; });
  body.appendChild(h('label', { class: 'toggle-row' }, auto, h('div', {}, h('div', { class: 'card-title', text: 'Auto-approve great deals' }), h('div', { class: 'tiny muted', text: 'Buy straight away when the expected margin is 30% above your minimum and the risk is not high. You get a notification.' }))));
  footer.appendChild(h('button', { class: 'btn', on: { click: close } }, 'Cancel'));
  footer.appendChild(h('button', { class: 'btn', on: { click: () => { m.active = false; const r = saveMandate(s, m); ctx.act(r); if (r.ok) close(); } } }, 'Save, paused'));
  footer.appendChild(h('button', { class: 'btn primary', data: { act: 'start-search' }, on: { click: () => { m.active = true; const r = saveMandate(s, m); ctx.act(r, { sound: 'success' }); if (r.ok) close(); } } }, 'Start searching'));
}
