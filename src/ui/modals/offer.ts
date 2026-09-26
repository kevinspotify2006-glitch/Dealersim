/**
 * A market offer: look it over, inspect it, haggle or bid, and buy.
 */
import type { Ctx } from '../app';
import type { Vehicle } from '../../sim/types';
import { confirmDialog, h, modal, toast } from '../dom';
import { km, money, moneySigned } from '../../sim/format';
import { SOURCE_BY_ID } from '../../data/game';
import { bookValue, roundPrice, suggestedPrice } from '../../sim/market';
import { inspectionCost, prePurchaseInspect } from '../../sim/vehicles';
import { buyOffer, haggle, offerPotential, placeBid } from '../../sim/trading';
import { freeSpaces, locationName } from '../../sim/state';
import { carArt } from '../art';
import { conditionTag, demandTag, helpButton, moneyFx, riskTag, tipped } from '../kit';
import { play } from '../../platform/sound';
import { openDrive } from '../drive/driveview';

export function openOffer(ctx: Ctx, offerId: string): void {
  const state = ctx.state;
  const find = (): Vehicle | undefined => state.offers.find((o) => o.id === offerId);
  const o0 = find();
  if (!o0) {
    toast('That offer has gone.', 'bad');
    return;
  }
  const source = SOURCE_BY_ID[o0.source as keyof typeof SOURCE_BY_ID];
  const { body, footer, close } = modal({ title: `${o0.year} ${o0.brand} ${o0.model} ${o0.trim}`, sub: `${source?.name ?? ''} · ${o0.seller}`, width: 760, cls: 'offer-modal', onClose: () => ctx.refresh() });
  let bid = 0;
  let haggleTo = 0;

  const draw = (): void => {
    const o = find();
    body.replaceChildren();
    footer.replaceChildren();
    if (!o) {
      body.appendChild(h('p', { class: 'empty', text: 'This vehicle is no longer available.' }));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Close'));
      return;
    }
    const pot = offerPotential(state, o);
    const art = h('div', { class: 'vm-art' });
    art.appendChild(carArt(o, 280));
    const price = o.auction ? Math.max(o.auction.currentBid, o.auction.myBid) : o.offerPrice;
    body.appendChild(h('div', { class: 'vm-top' }, art, h('div', { class: 'vm-summary' },
      h('div', { class: 'vcard-tags' }, conditionTag(o), demandTag(state, o), riskTag(o), o.preInspected ? h('span', { class: 'tag good', text: 'Inspected' }) : null),
      h('div', { class: 'vm-prices' },
        h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: o.auction ? 'Current bid' : 'Asking' }), h('span', { class: 'neg-fig-value', text: money(price) })),
        tipped(h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Retail value (est.)' }), h('span', { class: 'neg-fig-value', text: money(bookValue(state, o)) })), 'Estimated retail value from the seller\'s description and anything your inspection found.'),
        tipped(h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Potential profit' }), h('span', { class: `neg-fig-value ${pot.profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(pot.profit) })), 'Suggested retail price minus purchase, transport and a typical clean-up. Hidden defects can wipe this out.'),
        h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Deal quality' }), h('span', { class: `tag ${pot.tone}`, text: pot.label }))),
      h('div', { class: 'spec-grid' },
        spec('Mileage', km(o.mileage)), spec('Fuel', o.fuel), spec('Gearbox', o.transmission), spec('Engine', `${o.engine} · ${o.hp} hp`),
        spec('Claimed condition', String(o.apparentCondition)), spec('Colour', o.color), spec('Category', o.category),
        spec(o.auction ? 'Closes' : 'Available', o.expiresDay === state.day ? 'Today' : `${(o.expiresDay ?? state.day) - state.day} day(s)`)))));

    const issues = o.issues.filter((i) => i.discovered);
    const known = h('div', { class: 'issue-list' }, ...(issues.length ? issues.map((i) => h('div', { class: 'issue' },
      h('span', { class: `sev sev-${i.severity}`, text: ['', 'Minor', 'Moderate', 'Major'][i.severity] }),
      h('div', { class: 'issue-body' }, h('div', { class: 'issue-name', text: `${i.system}: ${i.name}` }), h('div', { class: 'tiny muted', text: i.repairCost ? `Repair ~${money(i.repairCost)}` : 'Affects value' })))) : [h('p', { class: 'tiny muted', text: o.preInspected ? 'Inspection found nothing wrong.' : 'No visible problems. Hidden ones may exist.' })]));
    body.appendChild(h('div', { class: 'panel flat' },
      h('div', { class: 'inspect-head' }, h('h4', { class: 'sub-head', text: 'Known problems' }), helpButton('inspection')),
      known,
      !o.preInspected ? h('button', {
        class: 'btn', on: {
          click: () => {
            const r = prePurchaseInspect(state, o);
            toast(r.message, r.ok ? (r.found.length ? 'bad' : 'good') : 'bad');
            play(r.ok ? 'success' : 'error');
            draw();
          },
        },
      }, `Pre-purchase inspection (${money(inspectionCost(state, o, true))})`) : null,
      h('div', { class: 'tiny muted', style: 'margin-top:6px', text: `${source?.name}: ${source?.description} Transport ~${money(((source?.transport[0] ?? 0) + (source?.transport[1] ?? 0)) / 2)}. Delivery ${source?.arrivalDays[0]}–${source?.arrivalDays[1]} days to ${locationName(state, state.activeLocationId)}.` })));

    const space = freeSpaces(state, state.activeLocationId);
    if (space <= 0) body.appendChild(h('p', { class: 'warn tiny', text: `${locationName(state, state.activeLocationId)} is full. Sell something or build more parking spaces first.` }));

    if (o.auction) {
      const a = o.auction;
      const min = a.currentBid + (a.currentBid < 10000 ? 100 : 250);
      if (!bid || bid < min) bid = Math.max(min, a.myBid || roundPrice(suggestedPrice(state, o) * 0.72));
      const inp = h('input', { type: 'number', value: String(bid), min, step: 100, inputmode: 'numeric', aria: { label: 'Maximum bid' } });
      inp.addEventListener('input', () => { bid = Number(inp.value) || 0; });
      body.appendChild(h('div', { class: 'panel flat' },
        h('h4', { class: 'sub-head', text: 'Auction' }),
        h('div', { class: 'tiny muted', text: `${a.bids} bids so far. Set the most you are willing to pay; the auction closes at the end of ${o.expiresDay === state.day ? 'today' : `day ${o.expiresDay}`}. You pay just enough to beat the other dealers.` }),
        a.myBid ? h('div', { class: 'tiny good', text: `Your max bid: ${money(a.myBid)}` }) : null,
        h('div', { class: 'neg-counter-row' }, inp)));
      footer.appendChild(h('button', { class: 'btn ghost', on: { click: close } }, 'Close'));
      footer.appendChild(h('button', {
        class: 'btn primary', disabled: space <= 0,
        on: {
          click: async () => {
            if (bid >= state.settings.confirmBigSpend && !(await confirmDialog('Place a big bid?', `Bid up to ${money(bid)} on this lot?`, 'Place bid'))) return;
            const r = placeBid(state, o.id, bid);
            toast(r.message, r.ok ? 'good' : 'bad');
            play(r.ok ? 'buy' : 'error');
            draw();
          },
        },
      }, a.myBid ? 'Raise max bid' : 'Place bid'));
      return;
    }

    if (!haggleTo) haggleTo = roundPrice(o.offerPrice * 0.92);
    const hin = h('input', { type: 'number', value: String(haggleTo), step: 100, inputmode: 'numeric', aria: { label: 'Your offer to the seller' } });
    hin.addEventListener('input', () => { haggleTo = Number(hin.value) || 0; });
    const haggles = o.haggled ?? 0;
    body.appendChild(h('div', { class: 'panel flat' },
      h('h4', { class: 'sub-head', text: 'Make an offer' }),
      h('div', { class: 'tiny muted', text: haggles >= 2 ? 'The seller will not negotiate any further.' : `Sellers usually have a little room. ${2 - haggles} attempt(s) left — lowball them and they may refuse to talk.` }),
      h('div', { class: 'neg-counter-row' }, hin,
        h('button', {
          class: 'btn', disabled: haggles >= 2,
          on: {
            click: () => {
              const r = haggle(state, o.id, haggleTo);
              toast(r.message, r.accepted ? 'good' : r.ok ? 'info' : 'bad');
              draw();
            },
          },
        }, 'Offer'))));

    footer.appendChild(h('button', { class: 'btn ghost', on: { click: close } }, 'Close'));
    footer.appendChild(h('button', {
      class: 'btn', data: { act: 'offer-testdrive' }, title: 'Drive it yourself on a test route: you may feel faults an inspection misses',
      on: { click: () => { close(); openDrive(ctx, { kind: 'offer', vehicleId: o.id, locationId: state.activeLocationId }, () => { if (state.offers.some((x) => x.id === o.id)) openOffer(ctx, o.id); }); } },
    }, '🗝️ Test drive'));
    footer.appendChild(h('button', {
      class: 'btn primary', disabled: space <= 0,
      on: {
        click: async () => {
          const total = o.offerPrice;
          if (total >= state.settings.confirmBigSpend && !(await confirmDialog('Confirm purchase', `Buy the ${o.year} ${o.brand} ${o.model} for ${money(total)} plus transport?`, 'Buy it'))) return;
          const r = buyOffer(state, o.id);
          toast(r.message, r.ok ? 'good' : 'bad');
          play(r.ok ? 'buy' : 'error');
          if (r.ok) {
            moneyFx(-total);
            close();
          } else draw();
        },
      },
    }, `Buy for ${money(o.offerPrice)}`));
  };
  draw();
}

function spec(label: string, value: string): HTMLElement {
  return h('div', { class: 'spec' }, h('span', { class: 'spec-label', text: label }), h('span', { class: 'spec-value', text: value }));
}
