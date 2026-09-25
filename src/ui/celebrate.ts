/**
 * Big moments: level-ups, and the recovery screen when the money runs out.
 */
import type { Ctx } from './app';
import { h, modal, toast } from './dom';
import { COMPANY_LEVELS, EVENT_BY_ID } from '../data/game';
import { money } from '../sim/format';
import { quickSell, wholesalePrice } from '../sim/trading';
import { takeLoan, LOAN_PRODUCTS, creditLimit, debt } from '../sim/finance';
import { vehicleName } from '../sim/state';
import { fire } from '../sim/staff';

export function showLevelUp(ctx: Ctx, level: number): void {
  const def = COMPANY_LEVELS[level - 1];
  if (!def) return;
  ctx.engine.setSpeed(0);
  const { body, footer, close } = modal({ title: 'Level up!', width: 460, cls: 'celebrate' });
  body.appendChild(h('div', { class: 'levelup' },
    h('div', { class: 'levelup-badge', text: String(level) }),
    h('h3', { class: 'levelup-name', text: def.name }),
    h('p', { class: 'muted', text: 'Your dealership has grown. New options are open to you:' }),
    h('ul', { class: 'unlock-list' }, ...def.unlocks.map((u) => h('li', { text: u })))));
  footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Keep building'));
}

/** Shown when the overdraft has run for 30 days. The player gets real ways out. */
export function showBankruptcy(ctx: Ctx, onExit: () => void): void {
  if (document.querySelector('.bankrupt-modal')) return;
  ctx.engine.setSpeed(0);
  const state = ctx.state;
  const { body, footer, close } = modal({ title: 'The bank is calling', width: 560, cls: 'bankrupt-modal' });
  const draw = (): void => {
    body.replaceChildren();
    footer.replaceChildren();
    body.appendChild(h('p', { class: 'confirm-text', text: `Your account has been overdrawn for ${state.overdraftDays} days. Cash: ${money(state.cash)}. Get back above zero to keep trading.` }));
    const stock = state.vehicles.filter((v) => v.status === 'listed' || v.status === 'yard' || v.status === 'prep');
    const liquidation = stock.reduce((s, v) => s + wholesalePrice(state, v), 0);
    const options = h('div', { class: 'list' });
    options.appendChild(h('button', {
      class: 'decision-option', disabled: stock.length === 0,
      on: {
        click: () => {
          for (const v of [...stock]) quickSell(state, v.id);
          toast(`Sold ${stock.length} vehicles to the trade.`, 'good');
          check();
        },
      },
    }, h('span', { class: 'decision-option-label', text: `Liquidate stock (${stock.length} cars, about ${money(liquidation)})` }),
    h('span', { class: 'decision-option-detail', text: 'Trade buyers pay ~80% of retail value. Fast, painful, effective.' })));
    const loan = LOAN_PRODUCTS.filter((p) => p.minLevel <= state.companyLevel && debt(state) + p.amount <= creditLimit(state)).sort((a, b) => b.amount - a.amount)[0];
    options.appendChild(h('button', {
      class: 'decision-option', disabled: !loan,
      on: { click: () => { if (loan) { const r = takeLoan(state, loan.id); toast(r.message, r.ok ? 'good' : 'bad'); check(); } } },
    }, h('span', { class: 'decision-option-label', text: loan ? `Emergency ${loan.name} (${money(loan.amount)})` : 'No loan available' }),
    h('span', { class: 'decision-option-detail', text: loan ? 'Buys time, but adds monthly repayments.' : 'The bank will not extend more credit.' })));
    const staff = state.employees.filter((e) => e.role !== 'sales');
    options.appendChild(h('button', {
      class: 'decision-option', disabled: staff.length === 0,
      on: { click: () => { for (const e of staff) fire(state, e.id); toast('Support staff let go. Salaries fall from next month.', 'info'); check(); } },
    }, h('span', { class: 'decision-option-label', text: `Cut staff (${staff.length} non-sales staff)` }),
    h('span', { class: 'decision-option-detail', text: 'Reduces monthly costs; severance is paid now.' })));
    body.appendChild(options);
    if (stock.length) body.appendChild(h('p', { class: 'tiny muted', text: `Most valuable: ${stock.slice().sort((a, b) => b.askingPrice - a.askingPrice).slice(0, 3).map(vehicleName).join(', ')}.` }));
    footer.appendChild(h('button', { class: 'btn ghost', on: { click: () => { close(); onExit(); } } }, 'Quit to title'));
  };
  const check = (): void => {
    if (state.cash >= 0) {
      state.bankrupt = false;
      state.overdraftDays = 0;
      close();
      toast('Back in the black. Keep trading!', 'good');
      ctx.refresh();
    } else draw();
  };
  draw();
}

/** Closing time: how the day went, and what tomorrow brings. */
export function showDailyReport(ctx: Ctx): void {
  const state = ctx.state;
  const d = state.history[state.history.length - 1];
  if (!d || document.querySelector('.daily-modal')) return;
  const prev = state.history[state.history.length - 2];
  const lost = state.lostLeads.filter((l) => l.day === d.day).length;
  const arriving = state.vehicles.filter((v) => (v.status === 'transit' || v.status === 'transfer') && v.arrivalDay <= state.day);
  const ready = state.vehicles.filter((v) => v.status === 'prep' && v.prep.length === 1 && v.prep[0].daysLeft <= 1);
  const yard = state.vehicles.filter((v) => v.status === 'yard').length;
  const events = state.events.filter((e) => e.endDay >= state.day).map((e) => `${EVENT_BY_ID[e.defId]?.icon ?? ''} ${EVENT_BY_ID[e.defId]?.name ?? ''}`.trim());
  const { body, footer, close } = modal({ title: `Day ${d.day} — closing time`, sub: 'The doors are locked and the lights go down. Here is how today went.', width: 520, cls: 'daily-modal' });
  const fig = (label: string, value: string, tone = ''): HTMLElement => h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: label }), h('span', { class: `neg-fig-value ${tone}`, text: value }));
  const cashDiff = prev ? d.cash - prev.cash : 0;
  body.appendChild(h('div', { class: 'daily-figs' },
    fig('Cars sold', String(d.sold)),
    fig('Revenue', money(d.revenue)),
    fig('Result', `${d.profit >= 0 ? '+' : '−'}${money(Math.abs(d.profit))}`, d.profit >= 0 ? 'good' : 'bad'),
    fig('Visitors', String(d.leads)),
    fig('Left without buying', String(lost), lost ? 'warn' : ''),
    fig('Cash', `${money(d.cash)}`, cashDiff >= 0 ? 'good' : 'bad')));
  const tomorrow: string[] = [];
  if (arriving.length) tomorrow.push(`🚚 ${arriving.length} car${arriving.length > 1 ? 's' : ''} arrived this morning: ${arriving.slice(0, 3).map((v) => vehicleName(v)).join(', ')}.`);
  if (ready.length) tomorrow.push(`🔧 ${ready.length} car${ready.length > 1 ? 's' : ''} almost ready in the workshop.`);
  if (yard) tomorrow.push(`🅿️ ${yard} car${yard > 1 ? 's are' : ' is'} not for sale yet — list them to attract buyers.`);
  for (const e of events.slice(0, 2)) tomorrow.push(`In the news: ${e}`);
  if (!tomorrow.length) tomorrow.push('A quiet start. Buy stock, list cars or improve the dealership.');
  body.appendChild(h('div', { class: 'sub-head', text: 'Tomorrow' }));
  body.appendChild(h('ul', { class: 'unlock-list' }, ...tomorrow.map((t) => h('li', { text: t }))));
  const again = h('input', { type: 'checkbox', checked: true });
  footer.appendChild(h('label', { class: 'switch compact' }, again, h('span', { text: 'Show every evening' })));
  footer.appendChild(h('button', {
    class: 'btn primary',
    on: { click: () => { state.settings.dailyReport = again.checked; close(); } },
  }, 'Open the doors'));
  void toast;
}
