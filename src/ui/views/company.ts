import type { Ctx, View } from '../app';
import { confirmDialog, h, kpi, toast } from '../dom';
import { money, moneyShort, shortDate } from '../../sim/format';
import { ACHIEVEMENTS, CITY_BY_ID, COMPANY_LEVELS, LEGACY_PERKS } from '../../data/game';
import { companyValue, debt, inventoryValue, propertyValue } from '../../sim/finance';
import { canPrestige, legacyPointsFor, perkCost } from '../../sim/progress';
import { marketShare } from '../../sim/world';
import { loadLegacy, saveLegacy } from '../../sim/newgame';
import { kv, pageHead, panel, panelTitle, tipped } from '../kit';
import { shareBars } from '../chart';
import { play } from '../../platform/sound';

export function companyView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const value = companyValue(s);
  view.appendChild(pageHead(s.companyName, `Founded by ${s.ownerName} · day ${s.day} · ${COMPANY_LEVELS[s.companyLevel - 1].name}`));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Company value', value: moneyShort(value), sub: `peak ${moneyShort(s.stats.peakCompanyValue)}`, icon: 'worth', tone: 'accent' }),
    kpi({ label: 'Lifetime revenue', value: moneyShort(s.stats.lifetimeRevenue), sub: `${s.stats.sold} vehicles`, icon: 'revenue', tone: 'info' }),
    kpi({ label: 'Lifetime gross profit', value: moneyShort(s.stats.lifetimeProfit), sub: `biggest deal ${moneyShort(s.stats.biggestDeal)}`, icon: 'profit', tone: 'good' }),
    kpi({ label: 'Dealerships', value: String(s.locations.length), sub: `${s.employees.length} employees`, icon: 'garage', tone: 'tech' })));

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  left.appendChild(panel('Assets & liabilities',
    kv('Cash', money(s.cash)), kv('Vehicles', money(inventoryValue(s))), kv('Premises', money(propertyValue(s))),
    kv('Debt', money(debt(s)), debt(s) ? 'bad' : undefined), kv('Reputation', `${Math.round(s.reputation)}/100`),
    kv('Customers welcomed', String(s.stats.customersTotal)), kv('Perfect reviews', String(s.stats.perfectReviews))));

  left.appendChild(panel('Company levels', ...COMPANY_LEVELS.map((l) => h('div', { class: `ladder-row${l.level < s.companyLevel ? ' done reached' : l.level === s.companyLevel ? ' here reached' : ''}` },
    h('span', { class: 'ladder-n', text: String(l.level) }),
    h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'ladder-name', text: l.name }), h('div', { class: 'tiny muted', text: l.level === 1 ? 'Where it starts' : `${moneyShort(l.value)} value · ${l.sold} sold · ${l.unlocks.join(', ')}` })),
    h('span', { class: 'ladder-state', text: l.level < s.companyLevel ? 'Done' : l.level === s.companyLevel ? 'You are here' : '' })))));

  const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  left.appendChild(panel(panelTitle('Achievements', h('span', { class: 'sub', text: `${got} of ${ACHIEVEMENTS.length}` })),
    h('div', { class: 'award-grid' }, ...ACHIEVEMENTS.map((a) => tipped(h('div', { class: `award${s.achievements[a.id] ? ' earned' : ''}` },
      h('span', { class: 'award-icon', text: a.icon }),
      h('div', {}, h('div', { class: 'award-name', text: a.name }), h('div', { class: 'tiny muted', text: s.achievements[a.id] ? `Day ${s.achievements[a.id]}` : a.description }))), a.description)))));

  // Competitors per city
  const cities = [...new Set([...s.locations.map((l) => l.cityId)])];
  for (const cityId of cities) {
    const share = marketShare(s, cityId);
    const rivals = s.competitors.filter((c) => c.cityId === cityId);
    right.appendChild(panel(panelTitle(`Market share · ${CITY_BY_ID[cityId]?.name ?? cityId}`),
      shareBars(share.map((r) => ({ label: r.name, value: r.share, highlight: r.mine }))),
      ...rivals.map((c) => h('div', { class: 'rival' },
        h('div', { style: 'min-width:0;flex:1' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: `${c.specialization} · ${c.pricing} pricing · ~${c.size} cars${c.promoDaysLeft ? ' · promotion running' : ''}` })),
        h('span', { class: `tag ${c.reputation >= 70 ? 'bad' : c.reputation >= 45 ? 'warn' : 'good'}`, text: `Rep ${c.reputation}` })))));
  }

  // Legacy
  const legacy = loadLegacy();
  const pts = legacyPointsFor(s);
  const legacyPanel = panel(panelTitle('Legacy', h('span', { class: 'sub', text: `${legacy.points} legacy point${legacy.points === 1 ? '' : 's'} banked · ${legacy.totalPrestiges} companies sold` })));
  legacyPanel.appendChild(h('p', { class: 'tiny muted', text: 'Sell your company to a national group and start again with permanent bonuses. Legacy perks apply to every new game.' }));
  legacyPanel.appendChild(h('button', {
    class: `btn block ${canPrestige(s) ? 'primary' : ''}`,
    disabled: !canPrestige(s),
    on: {
      click: async () => {
        if (!(await confirmDialog('Sell the company?', `A national group will buy ${s.companyName} for ${money(value)}. You earn ${pts} legacy point${pts === 1 ? '' : 's'} and start a new game. This ends the current game.`, 'Sell and start over', true))) return;
        const l = loadLegacy();
        l.points += pts;
        l.totalPrestiges += 1;
        l.bestCompanyValue = Math.max(l.bestCompanyValue, value);
        saveLegacy(l);
        s.achievements.legacy = s.day;
        play('levelup');
        toast(`Sold! +${pts} legacy points.`, 'good');
        (window as unknown as { cdmtExit?: (reason: string) => void }).cdmtExit?.('prestige');
      },
    },
  }, canPrestige(s) ? `Sell company (+${pts} points)` : 'Reach level 6 or €4.5M to sell'));
  for (const p of LEGACY_PERKS) {
    const lvl = legacy.perks[p.id] ?? 0;
    const cost = perkCost(p.id, lvl);
    legacyPanel.appendChild(h('div', { class: 'perk' },
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: `${p.name} ${lvl ? `(${lvl}/${p.max})` : ''}` }), h('div', { class: 'tiny muted', text: p.description })),
      h('button', {
        class: 'btn small', disabled: lvl >= p.max || legacy.points < cost,
        on: {
          click: () => {
            const l = loadLegacy();
            const c = perkCost(p.id, l.perks[p.id] ?? 0);
            if (l.points < c) return;
            l.points -= c;
            l.perks[p.id] = (l.perks[p.id] ?? 0) + 1;
            saveLegacy(l);
            toast(`${p.name} upgraded. Applies to your next new game.`, 'good');
            ctx.refresh();
          },
        },
      }, lvl >= p.max ? 'Max' : `${cost} pts`)));
  }
  right.appendChild(legacyPanel);

  right.appendChild(panel('Company history', s.eventLog.length ? h('div', {}, ...s.eventLog.slice(0, 20).map((e) => h('div', { class: 'alert-row' }, h('span', { class: 'alert-time', text: shortDate(e.day) }), h('div', { class: 'alert-detail', style: 'flex:1', text: e.text })))) : h('p', { class: 'empty', text: 'Market events and milestones will be recorded here.' })));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
