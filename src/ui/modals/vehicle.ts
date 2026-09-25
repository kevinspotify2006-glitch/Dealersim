/**
 * Vehicle detail: everything you can know and do with one car in stock.
 */
import type { Ctx } from '../app';
import type { Vehicle } from '../../sim/types';
import { confirmDialog, h, modal, toast } from '../dom';
import { km, money, moneySigned, shortDate } from '../../sim/format';
import { PREP_ACTIONS } from '../../data/game';
import { bookValue, conditionLabel, knownCondition, riskScore, roundPrice, suggestedPrice, totalCost } from '../../sim/market';
import { canPrep, inspectOwned, inspectionCost, listingQuality, startPrep, detectionChance } from '../../sim/vehicles';
import { listVehicle, quickSell, setPrice, toggleOnline, transferVehicle, unlistVehicle, wholesalePrice } from '../../sim/trading';
import { locationName, vehicleFullName } from '../../sim/state';
import { carArt } from '../art';
import { conditionTag, demandTag, helpButton, kv, moneyFx, progressBar, riskTag, segmented, statusTag, tipped } from '../kit';
import { play } from '../../platform/sound';

type Tab = 'overview' | 'inspect' | 'prep' | 'price' | 'history';

export function openVehicle(ctx: Ctx, vehicleId: string, startTab: Tab = 'overview'): void {
  let tab: Tab = startTab;
  const state = ctx.state;
  const find = (): Vehicle | undefined => state.vehicles.find((v) => v.id === vehicleId);
  const v0 = find();
  if (!v0) {
    toast('That vehicle is no longer in stock.', 'bad');
    return;
  }
  const { body, footer, close } = modal({ title: vehicleFullName(v0), sub: `${v0.generation} · ${locationName(state, v0.locationId)}`, width: 820, cls: 'vehicle-modal', onClose: () => ctx.refresh() });

  const run = (r: { ok: boolean; message: string }, sound: 'success' | 'buy' | 'cash' = 'success'): void => {
    toast(r.message, r.ok ? 'good' : 'bad');
    play(r.ok ? sound : 'error');
    draw();
  };

  const draw = (): void => {
    const v = find();
    body.replaceChildren();
    footer.replaceChildren();
    if (!v) {
      body.appendChild(h('p', { class: 'empty', text: 'This vehicle has been sold.' }));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Close'));
      return;
    }
    const top = h('div', { class: 'vm-top' });
    const art = h('div', { class: 'vm-art' });
    art.appendChild(carArt(v, 300));
    top.appendChild(art);
    const cost = totalCost(v);
    const book = bookValue(state, v);
    top.appendChild(h('div', { class: 'vm-summary' },
      h('div', { class: 'vcard-tags' }, statusTag(v.status), conditionTag(v), demandTag(state, v), riskTag(v)),
      h('div', { class: 'vm-prices' },
        h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Asking' }), h('span', { class: 'neg-fig-value', text: v.askingPrice ? money(v.askingPrice) : '—' })),
        tipped(h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Retail value (est.)' }), h('span', { class: 'neg-fig-value', text: money(book) })), 'What cars like this sell for, based on what you know. Hidden defects make the true value lower.'),
        h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Invested' }), h('span', { class: 'neg-fig-value', text: money(cost) })),
        h('div', { class: 'neg-fig' }, h('span', { class: 'clue-label', text: 'Margin at asking' }), h('span', { class: `neg-fig-value ${v.askingPrice - cost >= 0 ? 'good' : 'bad'}`, text: v.askingPrice ? moneySigned(v.askingPrice - cost) : '—' }))),
      h('div', { class: 'vm-meters' },
        meterRow('Condition', knownCondition(v) / 100, `${Math.round(knownCondition(v))}`, conditionLabel(knownCondition(v)).tone === 'good' ? 'good' : conditionLabel(knownCondition(v)).tone === 'bad' ? 'bad' : 'warn'),
        meterRow('Presentation', v.presentation / 100, `${Math.round(v.presentation)}`, v.presentation >= 70 ? 'good' : v.presentation >= 45 ? 'warn' : 'bad'),
        v.status === 'listed' && v.listedOnline ? meterRow('Listing quality', listingQuality(state, v), `${Math.round(listingQuality(state, v) * 100)}`, 'info') : null)));
    body.appendChild(top);

    const discovered = v.issues.filter((i) => i.discovered && !i.fixed).length;
    body.appendChild(segmented<Tab>([
      { value: 'overview', label: 'Overview' },
      { value: 'inspect', label: 'Inspection', count: discovered },
      { value: 'prep', label: 'Prep', count: v.prep.length },
      { value: 'price', label: 'Price & sale' },
      { value: 'history', label: 'History' },
    ], tab, (t) => { tab = t; draw(); }, 'vm-tabs scroll-x'));

    const pane = h('div', { class: 'vm-pane' });
    if (tab === 'overview') pane.appendChild(overview(v));
    if (tab === 'inspect') pane.appendChild(inspection(v));
    if (tab === 'prep') pane.appendChild(prep(v));
    if (tab === 'price') pane.appendChild(pricing(v));
    if (tab === 'history') pane.appendChild(historyTab(v));
    body.appendChild(pane);

    // Primary action in the footer, depending on status.
    if (v.status === 'yard') {
      footer.appendChild(h('button', { class: 'btn', on: { click: () => { tab = 'prep'; draw(); } } }, 'Prepare'));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: () => run(listVehicle(state, v.id, true)) } }, `List for ${money(v.askingPrice || suggestedPrice(state, v))}`));
    } else if (v.status === 'listed') {
      footer.appendChild(h('button', { class: 'btn', on: { click: () => run(unlistVehicle(state, v.id)) } }, 'Take off sale'));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Done'));
    } else {
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Close'));
    }
  };

  const overview = (v: Vehicle): HTMLElement => {
    const specs = h('div', { class: 'spec-grid' },
      spec('Year', String(v.year)), spec('Mileage', km(v.mileage)), spec('Fuel', v.fuel), spec('Gearbox', v.transmission),
      spec('Engine', `${v.engine} · ${v.hp} hp`), spec('Body', v.body), spec('Category', v.category), spec('Colour', v.color),
      spec('Trim', v.trim), spec('Source', v.seller), spec('Days in stock', String(v.daysInStock)), spec('Reliability', `${Math.round(v.reliability * 100)}%`));
    const opts = h('div', { class: 'vcard-tags' }, ...(v.options.length ? v.options.map((o) => h('span', { class: 'chip', text: o })) : [h('span', { class: 'tiny muted', text: 'No notable options' })]));
    const c = v.costs;
    const costs = h('div', {},
      kv('Purchase', money(v.purchasePrice)), kv('Transport', money(c.transport)), kv('Inspection', money(c.inspection)),
      kv('Repairs', money(c.repairs)), kv('Detailing', money(c.detailing)), kv('Total invested', money(totalCost(v))));
    return h('div', { class: 'grid cols-2' },
      h('div', {}, h('h4', { class: 'sub-head', text: 'Specification' }), specs, h('h4', { class: 'sub-head', text: 'Options' }), opts),
      h('div', {}, h('h4', { class: 'sub-head', text: 'Costs' }), costs));
  };

  const inspection = (v: Vehicle): HTMLElement => {
    const wrap = h('div', {});
    const found = v.issues.filter((i) => i.discovered);
    const levelText = ['Not inspected', 'Basic look-over (on arrival)', 'Advanced inspection done'][v.inspectionLevel];
    wrap.appendChild(h('div', { class: 'inspect-head' },
      h('div', {}, h('div', { class: 'card-title', text: levelText }),
        h('div', { class: 'tiny muted', text: v.inspectionLevel >= 2 ? 'Any remaining problems are well hidden.' : `Advanced inspection finds each hidden defect with ~${Math.round(detectionChance(state, v.locationId, true) * 100)}% certainty.` })),
      helpButton('inspection')));
    if (v.inspectionLevel < 2 && v.status !== 'transit' && v.status !== 'transfer') {
      const cost = inspectionCost(state, v, true);
      wrap.appendChild(h('button', {
        class: 'btn primary',
        on: {
          click: () => {
            const r = inspectOwned(state, v);
            run(r);
            if (r.ok && r.found.length) moneyFx(-r.found.reduce((s, i) => s + i.valueImpact, 0));
          },
        },
      }, `Run advanced inspection (${money(cost)})`));
    }
    if (!found.length) {
      wrap.appendChild(h('p', { class: 'empty', text: v.inspectionLevel >= 1 ? 'No defects found so far.' : 'Nothing checked yet.' }));
    } else {
      const list = h('div', { class: 'issue-list' });
      for (const i of found) {
        list.appendChild(h('div', { class: `issue${i.fixed ? ' fixed' : ''}` },
          h('span', { class: `sev sev-${i.severity}`, text: i.fixed ? '✓' : ['', 'Minor', 'Moderate', 'Major'][i.severity] }),
          h('div', { class: 'issue-body' }, h('div', { class: 'issue-name', text: `${i.system}: ${i.name}` }),
            h('div', { class: 'tiny muted', text: i.fixed ? 'Repaired' : i.repairCost > 0 ? `Repair ~${money(i.repairCost)} · lowers value by ~${money(i.valueImpact)}` : 'Cannot be repaired — reflected in the price' }))));
      }
      wrap.appendChild(list);
    }
    const risk = riskScore(v);
    wrap.appendChild(h('div', { class: 'tiny muted', style: 'margin-top:8px', text: `Estimated chance of further hidden problems: ${Math.round(risk * 100)}%.` }));
    return wrap;
  };

  const prep = (v: Vehicle): HTMLElement => {
    const wrap = h('div', {});
    wrap.appendChild(h('div', { class: 'inspect-head' }, h('div', { class: 'tiny muted', text: 'Same-day jobs happen at once. Longer jobs take the car off sale until they are done.' }), helpButton('prep')));
    if (v.prep.length) {
      wrap.appendChild(h('div', { class: 'prep-queue' }, ...v.prep.map((p, i) => {
        const def = PREP_ACTIONS.find((a) => a.id === p.actionId);
        return h('div', { class: 'prep-job' }, h('span', { text: `${def?.icon ?? ''} ${def?.name ?? p.actionId}` }), progressBar(1 - p.daysLeft / Math.max(1, p.totalDays), 'good'),
          h('span', { class: 'tiny muted', text: i === 0 ? `${p.daysLeft} day(s) left` : 'queued' }));
      })));
    }
    const grid = h('div', { class: 'prep-grid' });
    for (const a of PREP_ACTIONS) {
      const check = canPrep(state, v, a.id);
      grid.appendChild(h('div', { class: `prep-card${check.ok ? '' : ' disabled'}` },
        h('div', { class: 'prep-head' }, h('span', { class: 'prep-icon', text: a.icon }), h('span', { class: 'prep-name', text: a.name })),
        h('div', { class: 'tiny muted', text: a.description }),
        h('div', { class: 'prep-meta' }, h('span', { text: money(check.cost) }), h('span', { text: check.days === 0 ? 'Same day' : `${check.days} day${check.days > 1 ? 's' : ''}` })),
        h('button', {
          class: `btn small ${check.ok ? 'primary' : ''}`,
          disabled: !check.ok,
          title: check.reason ?? '',
          on: { click: () => run(startPrep(state, v, a.id), 'buy') },
        }, check.ok ? 'Book' : check.reason ?? 'Unavailable')));
    }
    wrap.appendChild(grid);
    return wrap;
  };

  const pricing = (v: Vehicle): HTMLElement => {
    const wrap = h('div', {});
    const suggested = suggestedPrice(state, v);
    const cost = totalCost(v);
    let asking = v.askingPrice || suggested;
    let floor = v.floorPrice || roundPrice(asking * 0.92);
    const askIn = h('input', { type: 'number', value: String(asking), step: 50, min: 100, inputmode: 'numeric', aria: { label: 'Asking price' } });
    const floorIn = h('input', { type: 'number', value: String(floor), step: 50, min: 0, inputmode: 'numeric', aria: { label: 'Floor price' } });
    const note = h('div', { class: 'tiny' });
    const refreshNote = (): void => {
      const margin = asking - cost;
      note.textContent = `Margin at asking ${moneySigned(margin)} · at floor ${moneySigned(floor - cost)} · suggested ${money(suggested)}`;
      note.className = `tiny ${margin >= 0 ? 'good' : 'bad'}`;
    };
    askIn.addEventListener('input', () => { asking = Number(askIn.value) || 0; refreshNote(); });
    floorIn.addEventListener('input', () => { floor = Number(floorIn.value) || 0; refreshNote(); });
    refreshNote();
    wrap.appendChild(h('div', { class: 'inspect-head' }, h('div', { class: 'card-title', text: 'Pricing' }), helpButton('pricing')));
    wrap.appendChild(h('div', { class: 'grid cols-2' },
      h('label', { class: 'field' }, h('span', { text: 'Asking price' }), askIn),
      tipped(h('label', { class: 'field' }, h('span', { text: 'Floor (staff minimum)' }), floorIn), 'Your salespeople will never sell below this.')));
    wrap.appendChild(note);
    wrap.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px' },
      h('button', { class: 'btn', on: { click: () => { asking = suggested; floor = roundPrice(suggested * 0.92); askIn.value = String(asking); floorIn.value = String(floor); refreshNote(); } } }, 'Use suggested'),
      h('button', { class: 'btn', on: { click: () => { asking = roundPrice(asking * 0.95); askIn.value = String(asking); refreshNote(); } } }, '−5%'),
      h('button', { class: 'btn primary', on: { click: () => run(setPrice(state, v.id, asking, floor)) } }, 'Save price')));

    const sale = h('div', { class: 'vm-sale' });
    if (v.status === 'listed') {
      sale.appendChild(h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: v.listedOnline, on: { change: () => { toggleOnline(state, v.id); draw(); } } }),
        h('span', { text: `Advertise online (€3/day) — listing quality ${Math.round(listingQuality(state, v) * 100)}/100` })));
      if (!v.photosPro) sale.appendChild(h('div', { class: 'tiny muted', text: 'Tip: a pro photo shoot (Prep tab) makes online listings much stronger.' }));
    }
    const ws = wholesalePrice(state, v);
    sale.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' },
      h('button', {
        class: 'btn danger',
        disabled: v.status === 'transit' || v.status === 'transfer',
        on: {
          click: async () => {
            const ok = v.category === 'Rare' || v.category === 'Classic' || ws > 15000
              ? await confirmDialog('Sell to the trade?', `A trade buyer will pay ${money(ws)} today (${moneySigned(ws - cost)} on what you have put in). This cannot be undone.`, 'Sell to trade', true)
              : true;
            if (!ok) return;
            const r = quickSell(state, v.id);
            if (r.ok) moneyFx(r.profit ?? 0);
            run(r, 'cash');
          },
        },
      }, `Sell to trade now (${money(ws)})`)));
    if (state.locations.length > 1 && (v.status === 'yard' || v.status === 'listed')) {
      sale.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px' },
        h('span', { class: 'tiny muted', text: 'Move to:' }),
        ...state.locations.filter((l) => l.id !== v.locationId).map((l) => h('button', { class: 'btn small', on: { click: () => run(transferVehicle(state, v.id, l.id)) } }, l.name))));
    }
    wrap.appendChild(sale);
    return wrap;
  };

  const historyTab = (v: Vehicle): HTMLElement => h('div', {},
    h('div', { class: 'list' }, ...v.history.map((line) => h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: line })))),
    kv('Bought', v.boughtDay ? `Day ${v.boughtDay} (${shortDate(v.boughtDay)})` : 'Starting stock'),
    kv('Seller', v.seller),
    kv('Previous claimed condition', String(v.apparentCondition)));

  draw();
}

function spec(label: string, value: string): HTMLElement {
  return h('div', { class: 'spec' }, h('span', { class: 'spec-label', text: label }), h('span', { class: 'spec-value', text: value }));
}

function meterRow(name: string, value: number, label: string, tone: string): HTMLElement {
  return h('div', { class: 'meter' }, h('span', { class: `meter-dot ${tone}` }), h('span', { class: 'meter-name', text: name }), h('div', { class: 'meter-bar' }, progressBar(value, tone)), h('span', { class: 'meter-value', text: label }));
}
