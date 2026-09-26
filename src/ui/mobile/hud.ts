/**
 * CompactHUD and the dealership status sheet (phones).
 *
 * The header carries four figures — cash, today's result, cars and staff —
 * and nothing else. Tapping it opens one sheet with the money in detail
 * (revenue, expenses, profit, debt, dealership value), the clock and speed,
 * the rest of the key figures as shortcuts, and the way to Settings and the
 * notification centre (Settings is not in the phone's bottom navigation).
 */
import type { GameState } from '../../sim/types';
import type { Engine } from '../../sim/engine';
import { SPEEDS, SPEED_LABELS } from '../../sim/state';
import { calendar, money, moneyShort, seasonOf } from '../../sim/format';
import { companyValue } from '../../sim/finance';
import { waitingCustomers } from '../../sim/customers';
import { h } from '../dom';
import { icon } from '../icons';
import { reputationStars } from '../kit';
import { haptic } from '../../platform/platform';
import { play } from '../../platform/sound';
import { kvGrid, sectionLabel, sheet, statCard, tweenNumber } from './components';

export interface HudHost {
  state: () => GameState;
  engine: Engine;
  go: (route: string, params?: Record<string, string>) => void;
  nextDay: () => void;
  refresh: () => void;
  openNotices: () => void;
}

const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${moneyShort(Math.abs(n))}`;

export function compactHud(host: HudHost): HTMLElement {
  const mv = (key: string): HTMLElement => h('span', { class: 'metric-value', data: { hudv: key } });
  return h('button', {
    class: 'm-hud', id: 'm-hud', aria: { label: 'Dealership status and finances' },
    on: { click: () => { haptic(8); openStatusSheet(host); } },
  },
  h('span', { class: 'm-hud-main' },
    h('span', { class: 'm-hud-cash' }, icon('cash', 14), h('span', { class: 'metric-value', id: 'm-hud-cash', data: { hudm: 'cash' } })),
    h('span', { class: 'm-hud-today' }, mv('today'), h('span', { class: 'm-hud-today-k', text: ' today' }))),
  h('span', { class: 'm-hud-side' },
    h('span', { class: 'm-hud-mini' }, icon('car', 13), mv('stock')),
    h('span', { class: 'm-hud-mini' }, icon('people', 13), mv('staff')),
    h('span', { class: 'm-hud-time', id: 'm-hud-time' })));
}

/** Per tick: the cash figure counts to its new value; the clock line updates. */
export function updateCompactHud(state: GameState): void {
  const cash = document.getElementById('m-hud-cash');
  if (cash) {
    tweenNumber(cash, Math.round(state.cash), (n) => (Math.abs(n) >= 1_000_000 ? moneyShort(n) : money(Math.round(n))));
    cash.classList.toggle('bad', state.cash < 0);
  }
  const cal = calendar(state.day);
  const t = document.getElementById('m-hud-time');
  const text = `${cal.weekday.slice(0, 3)} ${String(state.hour).padStart(2, '0')}:00`;
  if (t && t.textContent !== text) t.textContent = text;
}

export function openStatusSheet(host: HudHost): void {
  const state = host.state();
  const { body, close } = sheet({ title: 'Dealership status', cls: 'status-sheet' });
  const go = (route: string, params?: Record<string, string>) => (): void => { close(); host.go(route, params); };

  // ---- money first
  const net = state.today.profit - state.today.expenses;
  const month = state.month.profit - state.month.expenses;
  const debt = state.loans.reduce((sum, l) => sum + l.balance, 0);
  body.appendChild(h('div', { class: 'card-m fin-card', data: { hud: 'cash' } },
    h('div', { class: 'fin-top' },
      h('div', {}, h('div', { class: 't-secondary', text: 'Cash in the bank' }), h('div', { class: `t-display${state.cash < 0 ? ' bad' : ''}`, text: money(state.cash) })),
      h('div', { class: `fin-net ${net > 0 ? 'good' : net < 0 ? 'bad' : ''}` }, h('span', { class: 't-secondary', text: 'Today' }), h('strong', { text: signed(net) }))),
    kvGrid([
      ['Revenue today', money(state.today.revenue)],
      ['Expenses today', money(state.today.expenses), state.today.expenses > 0 ? 'bad' : ''],
      ['Profit today', signed(net), net > 0 ? 'good' : net < 0 ? 'bad' : ''],
      ['This month', signed(month), month > 0 ? 'good' : month < 0 ? 'bad' : ''],
      ['Debt', debt > 0 ? money(debt) : 'none', debt > 0 ? 'warn' : ''],
      ['Dealership value', money(companyValue(state))],
    ]),
    h('button', { class: 'btn ghost block', data: { act: 'finances' }, on: { click: go('business', { tab: 'finances' }) } }, icon('finance', 15), 'Open finances')));

  // ---- time
  const cal = calendar(state.day);
  const speedRow = h('div', { class: 'seg seg-speed', role: 'group', aria: { label: 'Game speed' } });
  const paintSpeed = (): void => {
    for (const b of Array.from(speedRow.children) as HTMLElement[]) b.classList.toggle('active', b.dataset.speed === String(state.speed));
  };
  SPEEDS.forEach((_, index) => {
    const b = h('button', {
      class: 'seg-btn', data: { speed: String(index) }, aria: { label: index === 0 ? 'Pause' : `Speed ${SPEED_LABELS[index]}` },
      on: { click: () => { host.engine.setSpeed(index); paintSpeed(); host.refresh(); haptic(8); play('click'); } },
    });
    if (index === 0) b.append(icon('pause', 15), h('span', { text: 'Pause' }));
    else b.textContent = SPEED_LABELS[index];
    speedRow.appendChild(b);
  });
  paintSpeed();
  body.appendChild(sectionLabel('Time'));
  body.appendChild(h('div', { class: 'card-m status-time' },
    h('div', { class: 'status-clock' },
      h('div', { class: 't-section', text: `${cal.weekday} ${cal.dayOfMonth} ${cal.monthName}` }),
      h('div', { class: 't-secondary', text: `${String(state.hour).padStart(2, '0')}:00 · ${seasonOf(state.day)} · Year ${cal.year - 2025}` })),
    speedRow,
    h('button', { class: 'btn ghost block', data: { act: 'next-day' }, on: { click: () => { host.nextDay(); close(); } } }, icon('next', 15), 'Skip to next day')));

  // ---- the rest of the dealership, one tap each
  const stock = state.vehicles.filter((v) => v.status !== 'sold');
  const open = state.serviceJobs.filter((j) => j.status !== 'done').length;
  const inside = state.customers.filter((c) => c.status === 'waiting' || c.status === 'negotiating').length;
  const waiting = waitingCustomers(state).length;
  body.appendChild(sectionLabel('Dealership'));
  body.appendChild(h('div', { class: 'stat-grid' },
    statCard({ icon: 'car', label: 'Cars', value: String(stock.length), sub: `${stock.filter((v) => v.status === 'listed').length} for sale`, key: 'stock', onClick: go('inventory', { tab: 'stock' }) }),
    statCard({ icon: 'people', label: 'Staff', value: String(state.employees.length), sub: 'employees', key: 'staff', onClick: go('people', { tab: 'staff' }) }),
    statCard({ icon: 'wrench', label: 'Service', value: String(open), sub: 'open jobs', key: 'service', onClick: go('service', { tab: 'planning' }) }),
    statCard({ icon: 'trophy', label: 'Reputation', value: String(Math.round(state.reputation)), sub: reputationStars(state.reputation), key: 'rep', onClick: go('business', { tab: 'company' }) }),
    statCard({ icon: 'customer', label: 'Customers', value: String(inside), sub: waiting ? `${waiting} waiting` : 'in the showroom', tone: waiting ? 'warn' : '', key: 'customers', onClick: go('dealership', { panel: 'customers' }) })));

  body.appendChild(h('div', { class: 'list-m status-links' },
    h('button', { class: 'list-row', data: { act: 'notices' }, on: { click: () => { close(); host.openNotices(); } } }, icon('bell', 18), h('span', { class: 'list-title', text: 'Notifications' }),
      (() => { const n = state.notices.filter((x) => !x.read).length; return n ? h('span', { class: 'hub-badge', text: n > 9 ? '9+' : String(n) }) : null; })(), icon('chevron', 14)),
    h('button', { class: 'list-row', data: { act: 'settings' }, on: { click: go('settings') } }, icon('settings', 18), h('span', { class: 'list-title', text: 'Settings & saves' }), icon('chevron', 14))));
}
