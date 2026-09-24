/**
 * The sales floor: an interactive negotiation with one customer.
 */
import type { Ctx } from '../app';
import { h, modal, toast } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { acceptOffer, acceptRequest, clues, closeNegotiation, counterOffer, negotiationParties, rejectCustomer, startNegotiation, toggleExtra, tradeInOffer } from '../../sim/negotiation';
import { EXTRA_DEFS, extrasIncome } from '../../sim/sales';
import type { SaleResult } from '../../sim/sales';
import { totalCost, roundPrice } from '../../sim/market';
import { vehicleFullName, vehicleName, locationById, upgradeLevel } from '../../sim/state';
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
    const loc = locationById(state, v.locationId);

    // Left: the car and the numbers.
    const art = h('div', { class: 'neg-art' });
    art.appendChild(carArt(v, 240));
    const left = h('div', { class: 'neg-left' },
      art,
      h('div', { class: 'neg-car', text: vehicleFullName(v) }),
      h('div', { class: 'tiny muted', text: `${Math.round(v.mileage).toLocaleString('en-GB')} km · ${v.fuel} · ${v.transmission} · ${v.color}` }),
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
      const extraCost = req.extra === 'service' ? EXTRA_DEFS.service.cost : EXTRA_DEFS.accessory.cost;
      right.appendChild(h('div', { class: 'neg-request' },
        h('div', {}, h('div', { class: 'clue-label', text: 'Their request' }),
          h('div', { class: 'tiny', text: `Free ${req.extra === 'service' ? 'service plan' : 'accessory pack'} (costs you ${money(extraCost)}) and they pay ${money(req.price)}` }),
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
      const ex = extrasIncome(state, counter, n.extras, v.locationId);
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

    // Extras.
    const financeLevel = loc ? upgradeLevel(loc, 'finance') : 0;
    const warrantyPrice = Math.round((counter * EXTRA_DEFS.warranty.priceRate) / 10) * 10;
    const extra = (key: 'warranty' | 'service' | 'accessory' | 'finance', label: string, sub: string, disabled = false): HTMLElement =>
      h('button', {
        class: `extra-chip${n.extras[key] ? ' on' : ''}`,
        disabled,
        aria: { pressed: String(n.extras[key]) },
        on: { click: () => { const msg = toggleExtra(state, key); if (msg) toast(msg, n.extras[key] ? 'good' : 'info'); draw(); } },
      }, h('span', { class: 'extra-name', text: label }), h('span', { class: 'extra-sub', text: sub }));
    right.appendChild(h('div', { class: 'neg-extras' },
      h('span', { class: 'clue-label', text: 'Add to the deal' }),
      h('div', { class: 'extra-row' },
        extra('warranty', 'Warranty', `+${money(warrantyPrice)}`),
        extra('service', 'Service plan', `+${money(EXTRA_DEFS.service.price)}`),
        extra('accessory', 'Accessories', `+${money(EXTRA_DEFS.accessory.price)}`),
        extra('finance', 'Finance', financeLevel ? `${[0, 2, 3, 4][financeLevel]}% commission` : 'Needs Finance Desk', financeLevel === 0))));

    // Trade-in.
    if (c.tradeIn) {
      const t = c.tradeIn;
      let allowance = n.tradeInOffer ?? roundPrice(((cl.tradeInLow ?? 0) + (cl.tradeInHigh ?? 0)) / 2 * 0.8);
      const input = h('input', { type: 'number', value: String(allowance), step: 100, min: 0, inputmode: 'numeric', aria: { label: 'Trade-in allowance' } });
      input.addEventListener('change', () => { allowance = Number(input.value) || 0; });
      const tart = h('div', { class: 'tradein-art' });
      tart.appendChild(carArt(t, 110));
      right.appendChild(h('div', { class: `neg-tradein${n.tradeInIncluded ? ' included' : ''}` },
        tart,
        h('div', { class: 'tradein-body' },
          h('div', { class: 'tradein-name', text: `Trade-in: ${vehicleName(t)}` }),
          h('div', { class: 'tiny muted', text: `${Math.round(t.mileage / 1000)}k km · claimed condition ${t.apparentCondition} · they expect ~${money(c.tradeInExpectation ?? 0)}` }),
          tipped(h('div', { class: 'tiny', text: `Your retail estimate: ${money(cl.tradeInLow ?? 0)} – ${money(cl.tradeInHigh ?? 0)}` }), 'Retail value of the trade-in. Offer below it — you will need margin to resell. A Trade-in Center narrows the estimate.'),
          h('div', { class: 'neg-counter-row' }, input,
            h('button', { class: 'btn small', on: { click: () => { const msg = tradeInOffer(state, allowance); toast(msg, n.tradeInIncluded ? 'good' : 'bad'); draw(); } } }, n.tradeInIncluded ? 'Change offer' : 'Offer allowance')),
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
        fig('Profit (incl. extras)', moneySigned(r.profit), undefined, r.profit >= 0 ? 'good' : 'bad')),
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
