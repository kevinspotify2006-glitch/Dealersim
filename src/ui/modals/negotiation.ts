/**
 * The sales floor: an interactive negotiation with one customer.
 */
import type { Ctx } from '../app';
import { h, modal, toast } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { acceptOffer, acceptRequest, applyForFinance, availableFinance, clues, closeNegotiation, counterOffer, declineTradeIn, financeQuote, inspectTradeIn, negotiationParties, rejectCustomer, startNegotiation, toggleExtra, tradeInOffer, tradeInSuggestions } from '../../sim/negotiation';
import type { SaleResult } from '../../sim/sales';
import { conditionGrade, totalCost, roundPrice } from '../../sim/market';
import { hasTech, vehicleFullName, vehicleName } from '../../sim/state';
import { PRODUCT_BY_ID, FINANCE_BY_ID } from '../../data/products';
import { creditBand, productPrice, productsFor, productsIncome } from '../../sim/systems/retail';
import type { FinanceKind } from '../../sim/types';
import { carArt } from '../art';
import { helpButton, moneyFx, stars, tipped } from '../kit';
import { interestLabel } from '../../sim/customers';
import { play } from '../../platform/sound';
import { haptic } from '../../platform/platform';

export function openNegotiation(ctx: Ctx, customerId: string): void {
  const state = ctx.state;
  const start = startNegotiation(state, customerId);
  if (!start.ok) {
    toast(start.message, 'bad');
    ctx.refresh();
    return;
  }
  const p0 = negotiationParties(state);
  if (!p0) return;
  const wasSpeed = state.speed;
  ctx.engine.hold = true;
  const { body, footer, close } = modal({
    title: `${p0.c.name}`,
    sub: `${ARCHETYPE_BY_ID[p0.c.archetype].name} · ${p0.c.channel === 'Online' ? 'Came from your online listing' : p0.c.campaignId ? 'Saw your advertising' : 'Walk-in'}`,
    width: 880,
    cls: 'negotiation',
    onClose: () => {
      closeNegotiation(state);
      ctx.engine.hold = false;
      if (wasSpeed > 0 && !state.settings.pauseOnCustomer) ctx.engine.setSpeed(wasSpeed);
      ctx.refresh();
    },
  });

  let counter = 0;
  let result: SaleResult | null = null;

  const draw = (): void => {
    body.replaceChildren();
    footer.replaceChildren();
    const p = negotiationParties(state);
    const n = state.negotiation;
    if (result && n) {
      drawResult(result);
      return;
    }
    if (!p || !n) {
      body.appendChild(h('p', { class: 'empty', text: 'This conversation is over.' }));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Close'));
      return;
    }
    const { c, v } = p;
    const cl = clues(state);
    if (!cl) return;
    if (n.done) {
      body.appendChild(h('div', { class: 'neg-outcome bad' },
        h('h3', { text: n.outcome === 'walked' ? `${c.name.split(' ')[0]} walked out` : 'No deal' }),
        h('p', { class: 'muted', text: n.outcome === 'walked' ? 'You pushed too hard. They have gone to look elsewhere.' : 'You ended the conversation. The car stays on sale.' })));
      body.appendChild(chatLog(n.log));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Back to the floor'));
      return;
    }
    if (!counter || counter < n.lastCustomerOffer) counter = Math.max(n.lastCustomerOffer, roundPrice((n.lastCustomerOffer + Math.min(v.askingPrice, n.lastPlayerPrice)) / 2));

    const cost = totalCost(v);
    const interest = interestLabel(cl.interest);

    // Left: the car and the numbers.
    const art = h('div', { class: 'neg-art' });
    art.appendChild(carArt(v, 240));
    const left = h('div', { class: 'neg-left' },
      art,
      h('div', { class: 'neg-car', text: vehicleFullName(v) }),
      h('div', { class: 'tiny muted', text: `${Math.round(v.mileage).toLocaleString('en-GB')} km · ${v.fuel} · ${v.transmission} · ${v.drivetrain ?? ''} · ${v.color}` }),
      h('div', { class: 'pill-row' },
        h('span', { class: 'tag info', text: conditionGrade(v) }),
        v.certified ? h('span', { class: 'tag good', text: '✅ Certified' }) : null,
        v.isNew ? h('span', { class: 'tag good', text: '🆕 New' }) : null,
        v.serviceHistory ? h('span', { class: `tag ${v.serviceHistory === 'Full' ? 'good' : v.serviceHistory === 'None' ? 'warn' : 'muted'}`, text: `${v.serviceHistory} service history` }) : null),
      h('div', { class: 'neg-figures' },
        fig('Asking', money(v.askingPrice)),
        fig('Retail value (est.)', money(cl.bookValue), 'Your price guide, based on what you know about the car.'),
        fig('Your cost', money(cost), 'Purchase price plus transport, inspection, repairs and cleaning.'),
        fig('Margin at asking', moneySigned(v.askingPrice - cost), 'What you make if they pay the full asking price.', v.askingPrice - cost >= 0 ? 'good' : 'bad')),
      h('div', { class: 'neg-clues' },
        h('h4', {}, 'What you can read ', helpButton('negotiation')),
        clue('Interest', interest.label, interest.tone),
        clue('Budget', `${money(cl.budgetLow)} – ${money(cl.budgetHigh)}`, 'info', 'A read on their budget. Analytics upgrades and a good salesperson make it more precise.'),
        cl.wtpLow ? clue('Will pay (analytics)', `${money(cl.wtpLow)} – ${money(cl.wtpHigh ?? cl.wtpLow)}`, 'good') : null,
        clue('Mood', cl.mood, cl.moodTone),
        c.style ? clue('Style', c.style === 'haggler' ? 'Haggler' : c.style === 'decisive' ? 'Decisive' : c.style === 'analytical' ? 'Analytical' : 'Fair', 'info', c.style === 'haggler' ? 'Moves slowly and asks for extras. Needs patience.' : c.style === 'decisive' ? 'Moves fast; leaves quickly if the gap is big.' : c.style === 'analytical' ? 'Accepts any price that is fair against the market value.' : 'Straightforward: meets you halfway.') : null,
        c.wantsFinance ? clue('Pays monthly', `≤ ${money(c.monthlyLimit ?? 0)}/month`, 'info') : null,
        hasTech(state, 'creditscoring') && c.credit ? clue('Credit', creditBand(c.credit).label, creditBand(c.credit).tone) : null,
        h('div', { class: 'patience' }, h('span', { class: 'clue-label', text: 'Patience' }),
          h('span', { class: 'patience-dots' }, ...Array.from({ length: c.patience }, (_, i) => h('span', { class: `pdot${i < n.patienceLeft ? ' on' : ''}` }))),
          h('span', { class: 'tiny muted', text: cl.patience }))),
    );

    // Right: conversation and actions.
    const right = h('div', { class: 'neg-right' });
    right.appendChild(chatLog(n.log));

    const theirs = h('div', { class: 'neg-theirs' },
      h('span', { class: 'clue-label', text: 'Their offer' }),
      h('span', { class: 'neg-theirs-value', text: money(n.lastCustomerOffer) }),
      h('span', { class: `tiny ${n.lastCustomerOffer - cost >= 0 ? 'good' : 'bad'}`, text: `profit ${moneySigned(n.lastCustomerOffer - cost)}` }));
    right.appendChild(theirs);
    if (n.request) {
      const req = n.request;
      const pdef = PRODUCT_BY_ID[req.extra];
      const extraCost = pdef ? Math.round(productPrice(pdef, req.price) * pdef.costShare) : 0;
      right.appendChild(h('div', { class: 'neg-request' },
        h('div', {}, h('div', { class: 'clue-label', text: 'Their request' }),
          h('div', { class: 'tiny', text: `Free ${pdef?.name.toLowerCase() ?? req.extra} (costs you ${money(extraCost)}) and they pay ${money(req.price)}` }),
          h('div', { class: `tiny ${req.price - cost - extraCost >= 0 ? 'good' : 'bad'}`, text: `profit ${moneySigned(req.price - cost - extraCost)}` })),
        h('button', { class: 'btn success small', on: { click: () => { const r = acceptRequest(state); if (r) finish(r); } } }, 'Agree')));
    }

    // Counter controls.
    const max = Math.max(v.askingPrice, n.lastCustomerOffer + 100);
    const min = n.lastCustomerOffer;
    const step = max < 5000 ? 50 : max < 50000 ? 100 : 500;
    const valueLabel = h('span', { class: 'neg-counter-value', text: money(counter) });
    const profitLabel = h('span', { class: 'tiny', text: '' });
    const numberInput = h('input', { type: 'number', value: String(counter), min, max, step, inputmode: 'numeric', aria: { label: 'Your price' } });
    const slider = h('input', { type: 'range', min, max, step, value: String(counter), aria: { label: 'Your price' }, class: 'neg-slider' });
    const setCounter = (x: number): void => {
      counter = Math.round(Math.max(min, Math.min(max * 1.2, x)));
      valueLabel.textContent = money(counter);
      const ex = productsIncome(state, counter, n.extras, undefined, v.isNew);
      const pr = counter - cost + ex.income - ex.cost;
      profitLabel.textContent = `profit if accepted ${moneySigned(pr)}`;
      profitLabel.className = `tiny ${pr >= 0 ? 'good' : 'bad'}`;
      slider.value = String(Math.min(max, counter));
      if (document.activeElement !== numberInput) numberInput.value = String(counter);
    };
    slider.addEventListener('input', () => setCounter(Number(slider.value)));
    numberInput.addEventListener('change', () => setCounter(Number(numberInput.value)));
    setCounter(counter);
    const quick = h('div', { class: 'pill-row' },
      h('button', { class: 'pill', on: { click: () => setCounter(roundPrice((n.lastCustomerOffer + Math.min(n.lastPlayerPrice, v.askingPrice)) / 2)) } }, 'Meet halfway'),
      h('button', { class: 'pill', on: { click: () => setCounter(roundPrice(v.askingPrice * 0.97)) } }, '−3%'),
      h('button', { class: 'pill', on: { click: () => setCounter(roundPrice(v.askingPrice * 0.94)) } }, '−6%'),
      h('button', { class: 'pill', on: { click: () => setCounter(v.askingPrice) } }, 'Asking'));
    right.appendChild(h('div', { class: 'neg-counter' },
      h('div', { class: 'neg-counter-head' }, h('span', { class: 'clue-label', text: 'Your price' }), valueLabel, profitLabel),
      slider, h('div', { class: 'neg-counter-row' }, numberInput, quick)));

    // Products (F&I).
    const offered = productsFor(state, v, !!n.plan?.approved);
    right.appendChild(h('div', { class: 'neg-extras' },
      h('span', { class: 'clue-label', text: 'Products' }),
      h('div', { class: 'extra-row' }, ...offered.map((pd) => tipped(h('button', {
        class: `extra-chip${n.extras[pd.id] ? ' on' : ''}`,
        data: { product: pd.id },
        aria: { pressed: String(!!n.extras[pd.id]) },
        on: { click: () => { const msg = toggleExtra(state, pd.id); if (msg) toast(msg, n.extras[pd.id] ? 'good' : 'info'); draw(); } },
      }, h('span', { class: 'extra-name', text: `${pd.icon} ${pd.name}` }), h('span', { class: 'extra-sub', text: `+${money(productPrice(pd, counter))} · you keep ${Math.round((1 - pd.costShare) * 100)}%` })), pd.description)))));

    // Finance.
    const kinds = availableFinance(state);
    if (kinds.length > 1) {
      const plan = n.plan;
      let kind: FinanceKind = plan && plan.kind !== 'cash' ? plan.kind : kinds.includes('loan') ? 'loan' : kinds[0];
      let term = plan?.term || 48;
      let deposit = plan?.deposit !== undefined && plan.kind !== 'cash' ? plan.deposit : 0.1;
      const quoteLine = h('div', { class: 'tiny' });
      const paint = (): void => {
        const q = financeQuote(state, kind, term, deposit);
        if (!q) return;
        const fits = q.plan.monthly <= (c.monthlyLimit ?? 300);
        quoteLine.replaceChildren(
          h('span', { class: fits ? 'good' : 'warn', text: `${money(q.plan.monthly)}/month` }),
          h('span', { class: 'muted', text: ` · ${(q.plan.apr * 100).toFixed(1)}% APR · approval ${Math.round(q.chance * 100)}%${FINANCE_BY_ID[kind].residual ? ` · final payment ${money(Math.round(Math.max(n.lastCustomerOffer, counter) * FINANCE_BY_ID[kind].residual))}` : ''}` }));
      };
      const sel = <T extends string | number>(label: string, opts: [T, string][], cur: T, set: (x: T) => void): HTMLElement => {
        const el = h('select', { aria: { label } }, ...opts.map(([val, l]) => h('option', { value: String(val), selected: val === cur }, l)));
        el.addEventListener('change', () => { const raw = (el as HTMLSelectElement).value; set((typeof cur === 'number' ? Number(raw) : raw) as T); paint(); });
        return el;
      };
      paint();
      right.appendChild(h('div', { class: `neg-finance${plan?.approved ? ' included' : ''}` },
        h('span', { class: 'clue-label', text: plan?.approved ? `Finance approved · ${FINANCE_BY_ID[plan.kind].name}` : plan?.declined ? 'Finance declined' : 'Finance' }),
        h('div', { class: 'neg-counter-row' },
          sel<FinanceKind>('Finance type', kinds.filter((k) => k !== 'cash').map((k) => [k, `${FINANCE_BY_ID[k].icon} ${FINANCE_BY_ID[k].name}`]), kind, (x) => { kind = x; }),
          sel<number>('Term', FINANCE_BY_ID[kind].terms.map((t) => [t, `${t} months`]), FINANCE_BY_ID[kind].terms.includes(term) ? term : FINANCE_BY_ID[kind].terms[1] ?? 36, (x) => { term = x; }),
          sel<number>('Deposit', [[0, 'No deposit'], [0.1, '10% down'], [0.2, '20% down'], [0.3, '30% down']], deposit, (x) => { deposit = x; })),
        quoteLine,
        h('div', { class: 'pill-row' },
          h('button', { class: 'btn small', data: { act: 'apply-finance' }, disabled: !!plan?.approved, on: { click: () => { if (!FINANCE_BY_ID[kind].terms.includes(term)) term = FINANCE_BY_ID[kind].terms[1] ?? 36; const r = applyForFinance(state, kind, term, deposit); toast(r.message, r.ok ? 'good' : 'bad'); draw(); } } }, plan?.approved ? 'Approved' : 'Submit application'),
          plan?.approved ? h('button', { class: 'btn small ghost', on: { click: () => { applyForFinance(state, 'cash', 0, 1); draw(); } } }, 'Switch to cash') : null)));
    }

    // Trade-in.
    if (c.tradeIn) {
      const t = c.tradeIn;
      const sug = tradeInSuggestions(state);
      let allowance = n.tradeInOffer ?? sug?.fair ?? 0;
      const input = h('input', { type: 'number', value: String(allowance), step: 100, min: 0, inputmode: 'numeric', aria: { label: 'Trade-in allowance' } });
      input.addEventListener('change', () => { allowance = Number(input.value) || 0; });
      const offer = (amount: number, repairs = false): void => { const msg = tradeInOffer(state, amount, repairs); toast(msg, n.tradeInIncluded ? 'good' : 'bad'); draw(); };
      const tart = h('div', { class: 'tradein-art' });
      tart.appendChild(carArt(t, 110));
      right.appendChild(h('div', { class: `neg-tradein${n.tradeInIncluded ? ' included' : ''}` },
        tart,
        h('div', { class: 'tradein-body' },
          h('div', { class: 'tradein-name', text: `Trade-in: ${vehicleName(t)}` }),
          h('div', { class: 'tiny muted', text: `${Math.round(t.mileage / 1000)}k km · ${t.inspectionLevel >= 2 ? `condition ${t.condition}` : `claimed condition ${t.apparentCondition}`} · they expect ~${money(c.tradeInExpectation ?? 0)}` }),
          tipped(h('div', { class: 'tiny', text: `Your retail estimate: ${money(cl.tradeInLow ?? 0)} – ${money(cl.tradeInHigh ?? 0)}${cl.tradeInRepairs ? ` · known repairs ${money(cl.tradeInRepairs)}` : ''}` }), 'Retail value of the trade-in. Offer below it — you will need margin to resell. Inspecting it or a Trade-in Center narrows the estimate.'),
          h('div', { class: 'pill-row' },
            t.inspectionLevel < 2 ? h('button', { class: 'pill', data: { act: 'inspect-tradein' }, on: { click: () => { toast(inspectTradeIn(state), 'info'); draw(); } } }, '🔍 Inspect') : null,
            sug ? h('button', { class: 'pill', on: { click: () => offer(sug.low) } }, `Low ${money(sug.low)}`) : null,
            sug ? h('button', { class: 'pill', data: { act: 'fair-tradein' }, on: { click: () => offer(sug.fair) } }, `Fair ${money(sug.fair)}`) : null,
            sug ? h('button', { class: 'pill', on: { click: () => offer(sug.high) } }, `High ${money(sug.high)}`) : null,
            sug && sug.repairs > 0 ? h('button', { class: 'pill', on: { click: () => offer(Math.max(0, roundPrice(sug.fair - sug.repairs)), true) } }, `Minus repairs ${money(Math.max(0, sug.fair - sug.repairs))}`) : null,
            h('button', { class: 'pill', on: { click: () => { toast(declineTradeIn(state), 'info'); draw(); } } }, 'Refuse')),
          h('div', { class: 'neg-counter-row' }, input,
            h('button', { class: 'btn small', on: { click: () => offer(allowance) } }, n.tradeInIncluded ? 'Change offer' : 'Offer allowance')),
          n.tradeInIncluded ? h('div', { class: 'tiny good', text: `Included: ${money(n.tradeInOffer ?? 0)} — the car joins your stock when the deal closes.` }) : null)));
    }

    body.appendChild(h('div', { class: 'neg-grid' }, left, right));

    footer.appendChild(h('button', { class: 'btn ghost', on: { click: () => { rejectCustomer(state); draw(); } } }, 'End talk'));
    footer.appendChild(h('button', { class: 'btn', on: { click: () => close() } }, 'Step away'));
    footer.appendChild(h('button', {
      class: 'btn success',
      on: { click: () => { const r = acceptOffer(state); if (r) finish(r); } },
    }, `Accept ${money(n.lastCustomerOffer)}`));
    footer.appendChild(h('button', {
      class: 'btn primary',
      on: {
        click: () => {
          const out = counterOffer(state, counter);
          if (out.outcome === 'accepted' && out.sale) finish(out.sale);
          else {
            play(out.outcome === 'walked' ? 'error' : 'click');
            draw();
          }
        },
      },
    }, `Counter ${money(counter)}`));
  };

  const finish = (r: SaleResult): void => {
    result = r;
    play('sale');
    haptic(30);
    moneyFx(r.profit, document.querySelector('.negotiation .modal-footer'));
    draw();
  };

  const drawResult = (r: SaleResult): void => {
    const n = state.negotiation;
    const v = state.soldArchive.find((x) => x.id === n?.vehicleId);
    body.appendChild(h('div', { class: 'neg-outcome good' },
      h('div', { class: 'sold-stamp', text: 'SOLD' }),
      h('h3', { text: v ? vehicleFullName(v) : 'Vehicle sold' }),
      h('div', { class: 'neg-figures' },
        fig('Sale price', money(r.price)),
        fig('Profit (incl. products & finance)', moneySigned(r.profit), undefined, r.profit >= 0 ? 'good' : 'bad'),
        r.finance ? fig('Finance commission', money(r.finance), undefined, 'good') : null,
        r.products ? fig('Products', money(r.products), undefined, 'good') : null),
      h('div', { class: 'review-row' },
        h('span', { class: `review-row-stars ${r.stars >= 4 ? 'good' : r.stars <= 2 ? 'bad' : ''}`, text: stars(r.stars) }),
        h('span', { class: 'review-text', text: `“${r.review.text}” — ${r.review.customer}` }))));
    if (n?.tradeInIncluded) body.appendChild(h('p', { class: 'tiny muted', text: 'The trade-in is now in your yard. Inspect, prep and list it.' }));
    footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Back to the floor'));
  };

  draw();
}

function fig(label: string, value: string, tip?: string, tone?: string): HTMLElement {
  const el = h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: label }), h('span', { class: `neg-fig-value${tone ? ` ${tone}` : ''}`, text: value }));
  return tip ? tipped(el, tip) : el;
}

function clue(label: string, value: string, tone: string, tip?: string): HTMLElement {
  const el = h('div', { class: 'clue' }, h('span', { class: 'clue-label', text: label }), h('span', { class: `tag ${tone}`, text: value }));
  return tip ? tipped(el, tip) : el;
}

function chatLog(log: { who: string; text: string }[]): HTMLElement {
  const box = h('div', { class: 'chat', aria: { live: 'polite' } }, ...log.map((m) => h('div', { class: `chat-msg ${m.who}` }, m.text)));
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  return box;
}
