import type { Ctx, View } from '../app';
import { confirmDialog, h, icon, kpi, table } from '../dom';
import { money, moneyShort, moneySigned, shortDate } from '../../sim/format';
import { LOAN_PRODUCTS, categoryTotals, companyValue, creditLimit, debt, inventoryValue, loanRate, monthlyPayment, periodTotals, propertyValue, repayLoan, takeLoan } from '../../sim/finance';
import { helpButton, kv, pageHead, panel, panelTitle, segmented } from '../kit';
import { barChart, chartLegend, multiChart, shareBars } from '../chart';

type Period = 'day' | 'week' | 'month' | 'year';
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 360 };
let period: Period = 'month';
let q = '';
let cat = '';

export function financesView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  view.appendChild(pageHead('Finances', `Cash ${money(s.cash)} · debt ${money(debt(s))} · company value ${money(companyValue(s))}`, helpButton('finance')));

  view.appendChild(segmented<Period>([
    { value: 'day', label: 'Yesterday' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }, { value: 'year', label: '12 months' },
  ], period, (p) => { period = p; ctx.refresh(); }));
  const days = PERIOD_DAYS[period];
  const t = periodTotals(s, days);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Revenue', value: money(t.revenue), sub: `${t.sold} vehicles sold`, icon: 'revenue', tone: 'info' }),
    kpi({ label: 'Operating costs', value: money(t.expenses), sub: 'rent, salaries, marketing…', icon: 'cash', tone: 'warn' }),
    kpi({ label: 'Net profit', value: moneySigned(t.profit), sub: 'gross margin − costs', icon: 'profit', tone: t.profit >= 0 ? 'good' : 'bad', valueTone: t.profit >= 0 ? 'good' : 'bad' }),
    kpi({ label: 'Company value', value: moneyShort(companyValue(s)), sub: `peak ${moneyShort(s.stats.peakCompanyValue)}`, icon: 'worth', tone: 'accent' })));

  const hist = s.history.slice(-Math.max(14, Math.min(days, 360)));
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const series = [
    { label: 'Revenue', values: hist.map((d) => d.revenue), color: '#3cc7ff' },
    { label: 'Costs', values: hist.map((d) => d.expenses), color: '#ffc233' },
  ];
  left.appendChild(panel(panelTitle('Revenue vs costs'), multiChart(series, { height: 170 }), chartLegend(series)));
  left.appendChild(panel(panelTitle('Net profit per day'), barChart(hist.map((d) => d.profit), { height: 130 })));
  const cash = [{ label: 'Cash', values: hist.map((d) => d.cash), color: '#2fd18b', fill: true }, { label: 'Inventory value', values: hist.map((d) => d.inventoryValue), color: '#9b8cff' }];
  left.appendChild(panel(panelTitle('Cash flow & stock'), multiChart(cash, { height: 150 }), chartLegend(cash)));

  // Ledger
  const cats = categoryTotals(s, s.day - days);
  const catSel = h('select', { aria: { label: 'Category' } }, h('option', { value: '' }, 'All categories'), ...Object.keys(cats).sort().map((c) => h('option', { value: c, selected: c === cat }, c)));
  const search = h('input', { type: 'search', placeholder: 'Search transactions…', value: q, aria: { label: 'Search transactions' } });
  const ledger = h('div', {});
  const drawLedger = (): void => {
    const list = s.transactions.filter((tx) => (!cat || tx.category === cat) && (!q || tx.description.toLowerCase().includes(q.toLowerCase()))).slice(0, 120);
    ledger.replaceChildren(list.length ? table(['Day', 'Category', 'Description', 'Amount'], list.map((tx) => [
      h('span', { class: 'num', text: shortDate(tx.day) }),
      h('span', { class: 'tiny', text: tx.category }),
      h('span', { class: 'tiny', text: tx.description }),
      h('span', { class: `num ${tx.amount >= 0 ? 'good' : 'bad'}`, text: moneySigned(tx.amount) }),
    ])) : h('p', { class: 'empty', text: 'No transactions match.' }));
  };
  catSel.addEventListener('change', () => { cat = catSel.value; drawLedger(); });
  search.addEventListener('input', () => { q = search.value; drawLedger(); });
  drawLedger();
  left.appendChild(panel(panelTitle('Ledger', h('span', { class: 'sub', text: 'every euro in and out' })), h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 15), search), catSel), ledger));

  // Breakdown
  const expenses = Object.entries(cats).filter(([, v]) => v < 0).map(([label, v]) => ({ label, value: -v })).sort((a, b) => b.value - a.value);
  right.appendChild(panel(panelTitle('Where the money went', h('span', { class: 'sub', text: `last ${days === 1 ? 'day' : `${days} days`}` })), expenses.length ? shareBars(expenses.slice(0, 10)) : h('p', { class: 'empty', text: 'Nothing spent yet.' }),
    ...expenses.slice(0, 10).map((e) => kv(e.label, money(e.value)))));

  // Balance sheet
  right.appendChild(panel('Balance sheet',
    kv('Cash', money(s.cash), s.cash < 0 ? 'bad' : undefined),
    kv('Vehicles (retail est.)', money(inventoryValue(s))),
    kv('Premises & fittings', money(propertyValue(s))),
    kv('Loans', money(-debt(s)), debt(s) > 0 ? 'bad' : undefined),
    kv('Company value', money(companyValue(s)), 'good')));

  // Loans
  const loansPanel = panel(panelTitle('Loans', h('span', { class: 'sub', text: `credit limit ${money(creditLimit(s))}` })));
  for (const l of s.loans) {
    loansPanel.appendChild(h('div', { class: 'loan-card' },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: l.name }), h('div', { class: 'card-sub', text: `${(l.rate * 100).toFixed(1)}% · ${l.monthsLeft} months left` })), h('span', { class: 'num bad', text: money(l.balance) })),
      kv('Monthly payment', money(l.payment)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', disabled: s.cash < Math.min(l.balance, 10000), on: { click: () => ctx.act(repayLoan(s, l.id, Math.min(l.balance, 10000)), { sound: 'cash' }) } }, `Repay ${money(Math.min(l.balance, 10000))}`),
        h('button', { class: 'btn small primary', disabled: s.cash < l.balance, on: { click: () => ctx.act(repayLoan(s, l.id), { sound: 'cash' }) } }, 'Repay in full'))));
  }
  for (const p of LOAN_PRODUCTS) {
    const rate = loanRate(s, p);
    const locked = s.companyLevel < p.minLevel;
    const over = debt(s) + p.amount > creditLimit(s);
    loansPanel.appendChild(h('div', { class: `loan-offer${locked ? ' muted-card' : ''}` },
      h('div', { style: 'min-width:0' }, h('div', { class: 'card-title', text: `${p.name} · ${money(p.amount)}` }), h('div', { class: 'tiny muted', text: `${(rate * 100).toFixed(1)}% over ${p.months} months · ${money(Math.round(monthlyPayment(p.amount, rate, p.months)))}/month` })),
      h('button', {
        class: 'btn small', disabled: locked || over,
        title: locked ? `Requires level ${p.minLevel}` : over ? 'Above your credit limit' : '',
        on: {
          click: async () => {
            if (p.amount >= 100000 && !(await confirmDialog('Take a large loan?', `Borrow ${money(p.amount)} at ${(rate * 100).toFixed(1)}%? Repayments of ${money(Math.round(monthlyPayment(p.amount, rate, p.months)))} start next month.`, 'Borrow'))) return;
            ctx.act(takeLoan(s, p.id), { sound: 'cash', money: p.amount });
          },
        },
      }, locked ? `Level ${p.minLevel}` : over ? 'Over limit' : 'Borrow')));
  }
  right.appendChild(loansPanel);
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
