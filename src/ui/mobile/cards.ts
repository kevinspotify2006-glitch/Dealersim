/**
 * VehicleCard and EmployeeCard: the phone's list cards. Each shows the few
 * figures that decide what to do next and one clear "Manage" that opens the
 * full detail sheet (the same vehicle / employee dialog the desktop uses).
 */
import type { Ctx } from '../app';
import type { Employee, Vehicle } from '../../sim/types';
import { h } from '../dom';
import { icon } from '../icons';
import { money, moneySigned } from '../../sim/format';
import { bookValue, marketMods, suggestedPrice, totalCost } from '../../sim/market';
import { carArt } from '../art';
import { ROLE_BY_ID } from '../../data/game';
import { isAbsent, titleOf } from '../../sim/staff';
import { avatar } from '../dom';
import { kvGrid, meterRow } from './components';
import type { Tone } from './components';

const V_STATUS: Record<string, [string, Tone]> = {
  yard: ['Ready to list', 'warn'], listed: ['For sale', 'good'], prep: ['In preparation', 'info'],
  transit: ['On its way', 'info'], transfer: ['Moving location', 'info'], sold: ['Sold', ''], reserved: ['Reserved', 'good'],
};

function pill(text: string, tone: Tone): HTMLElement {
  return h('span', { class: `m-pill ${tone}` }, h('i', {}), text);
}

export function vehicleCard(ctx: Ctx, v: Vehicle, open: () => void, quick?: HTMLElement | null): HTMLElement {
  const s = ctx.state;
  const mods = marketMods(s);
  const price = v.askingPrice || suggestedPrice(s, v, mods);
  const cost = totalCost(v);
  const profit = price - cost;
  const [label, tone] = V_STATUS[v.status] ?? [v.status, ''];
  const wanted = s.customers.some((c) => c.vehicleId === v.id && (c.status === 'waiting' || c.status === 'negotiating'));
  const art = h('div', { class: 'vc-art' });
  art.appendChild(carArt(v, 120));
  const card = h('article', {
    class: `m-card vehicle-card st-${v.status}`, data: { id: v.id }, role: 'button',
    on: { click: (e: Event) => { if (!(e.target as HTMLElement).closest('button')) open(); } },
  },
  h('div', { class: 'vc-top' }, art,
    h('div', { class: 'vc-id' },
      h('div', { class: 'vc-name', text: `${v.brand} ${v.model}` }),
      h('div', { class: 't-secondary', text: `${v.year} · ${Math.round(v.mileage / 1000)}k km · ${v.fuel}` }),
      h('div', { class: 'vc-tags' }, pill(label, tone), wanted ? pill('Customer interested', 'good') : null))),
  kvGrid([
    ['Purchase', money(v.purchasePrice)],
    ['Market value', money(bookValue(s, v, mods))],
    [v.askingPrice ? 'Asking' : 'Suggested', money(price)],
    ['Potential profit', moneySigned(profit), profit >= 0 ? 'good' : 'bad'],
  ]),
  h('div', { class: 'm-card-actions' }, quick ?? null,
    h('button', { class: 'btn small ghost m-manage', data: { act: 'manage' }, on: { click: open } }, 'Manage', icon('chevron', 13))));
  return card;
}

export function employeeCard(ctx: Ctx, e: Employee, task: string, open: () => void, color: string): HTMLElement {
  const s = ctx.state;
  const perf = e.performance ?? 50;
  const status: [string, Tone] = isAbsent(s, e) ? ['Absent', 'bad'] : e.trainingDaysLeft > 0 ? ['In training', 'info'] : !e.stationId ? ['No workstation', 'warn'] : ['Working', 'good'];
  return h('article', {
    class: 'm-card person-card employee-card', data: { emp: e.id }, style: `--role:${color}`, role: 'button',
    on: { click: (ev: Event) => { if (!(ev.target as HTMLElement).closest('button')) open(); } },
  },
  h('div', { class: 'ec-top' },
    avatar(e.name, e.morale < 40 ? 'warn' : undefined),
    h('div', { class: 'ec-id' },
      h('div', { class: 'vc-name', text: e.name }),
      h('div', { class: 't-secondary', text: `${titleOf(e) === ROLE_BY_ID[e.role].name ? titleOf(e) : `${titleOf(e)} · ${ROLE_BY_ID[e.role].name}`} · level ${e.level}` })),
    pill(status[0], status[1])),
  meterRow('Performance', perf / 100, `${Math.round(perf)}%`, perf >= 60 ? 'good' : perf < 40 ? 'bad' : 'warn'),
  meterRow('Satisfaction', e.morale / 100, `${Math.round(e.morale)}%`, e.morale >= 60 ? 'good' : e.morale < 35 ? 'bad' : 'warn'),
  h('div', { class: 'ec-task t-secondary', text: task.replace(/^[^\p{L}\p{N}]+\s*/u, '') }),
  h('div', { class: 'm-card-actions' },
    h('span', { class: 'ec-salary' }, h('span', { class: 't-secondary', text: 'Salary ' }), h('strong', { text: `${money(e.salary)}/month` })),
    h('button', { class: 'btn small ghost m-manage', data: { act: 'manage' }, on: { click: open } }, 'Manage', icon('chevron', 13))));
}
