import type { Ctx, View } from '../app';
import { confirmDialog, h, table } from '../dom';
import { money, moneySigned, pct } from '../../sim/format';
import { CHANNELS, CHANNEL_BY_ID } from '../../data/game';
import { campaignCost, campaignRoi, launchCampaign } from '../../sim/world';
import { expectedLeads, listedAt } from '../../sim/customers';
import { listingQuality } from '../../sim/vehicles';
import { activeLocation, locationName, upgradeLevel } from '../../sim/state';
import { pageHead, panel, panelTitle, progressBar, tipped } from '../kit';

export function marketingView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const running = s.campaigns.filter((c) => c.endDay >= s.day);
  view.appendChild(pageHead('Marketing', `${running.length} campaign${running.length === 1 ? '' : 's'} running · ${loc.name}: ~${expectedLeads(s, loc).total.toFixed(1)} customers a day`));

  if (s.locations.length > 1) {
    view.appendChild(h('div', { class: 'pill-row' }, h('span', { class: 'tiny muted', text: 'Campaign location:' }),
      ...s.locations.map((l) => h('button', { class: `pill${l.id === loc.id ? ' active' : ''}`, on: { click: () => { s.activeLocationId = l.id; ctx.refresh(); } } }, l.name))));
  }

  const grid = h('div', { class: 'grid cols-3' });
  for (const ch of CHANNELS) {
    const cost = campaignCost(s, ch.id);
    const locked = s.companyLevel < ch.minLevel;
    const active = running.find((c) => c.channelId === ch.id && c.locationId === loc.id);
    grid.appendChild(h('article', { class: `card channel${locked ? ' muted-card' : ''}` },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: `${ch.icon} ${ch.name}` }), h('div', { class: 'card-sub', text: ch.reach })),
        active ? h('span', { class: 'tag good', text: `${active.endDay - s.day + 1}d left` }) : locked ? h('span', { class: 'tag', text: `Level ${ch.minLevel}` }) : null),
      h('p', { class: 'tiny muted', text: ch.description }),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Cost' }), h('span', { class: 'stat-value', text: `${money(cost)} / ${ch.days} days` })),
      tipped(h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Extra customers' }), h('span', { class: 'stat-value good', text: `+${Math.round(ch.leadBoost * 100)}%` })), 'Boost to walk-in traffic while the campaign runs (more with a marketing specialist).'),
      h('button', {
        class: 'btn primary block', disabled: locked || !!active,
        on: {
          click: async () => {
            if (cost >= s.settings.confirmBigSpend && !(await confirmDialog('Launch campaign?', `Spend ${money(cost)} on ${ch.name} at ${loc.name}?`, 'Launch'))) return;
            ctx.act(launchCampaign(s, ch.id, loc.id), { sound: 'buy', money: -cost });
          },
        },
      }, active ? 'Running' : locked ? 'Locked' : 'Launch')));
  }
  view.appendChild(panel('Campaigns', grid));

  const past = s.campaigns.slice(0, 20);
  view.appendChild(panel(panelTitle('Campaign results', h('span', { class: 'sub', text: 'revenue from customers the campaign brought in' })),
    past.length ? table(['Campaign', 'Location', 'Days', 'Cost', 'Customers', 'Revenue', 'ROI'], past.map((c) => {
      const def = CHANNEL_BY_ID[c.channelId];
      const roi = campaignRoi(c);
      return [
        h('span', { text: `${def?.icon ?? ''} ${def?.name ?? c.channelId}` }),
        h('span', { class: 'tiny', text: locationName(s, c.locationId) }),
        h('span', { class: 'num', text: c.endDay >= s.day ? `day ${s.day - c.startDay + 1}/${c.endDay - c.startDay + 1}` : 'done' }),
        h('span', { class: 'num', text: money(c.cost) }),
        h('span', { class: 'num', text: String(c.leads) }),
        h('span', { class: 'num', text: money(c.revenue) }),
        h('span', { class: `num ${roi >= 0 ? 'good' : 'bad'}`, text: `${roi >= 0 ? '+' : ''}${pct(roi * 100)}` }),
      ];
    })) : h('p', { class: 'empty', text: 'Launch a campaign to bring more customers through the door.' })));

  const listed = listedAt(s, loc.id);
  const online = listed.filter((v) => v.listedOnline);
  const avgQ = online.length ? online.reduce((a, v) => a + listingQuality(s, v), 0) / online.length : 0;
  view.appendChild(panel(panelTitle('Online listings', h('span', { class: 'sub', text: `${online.length} of ${listed.length} cars online · €3/day each` })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Average listing quality' }), h('span', { class: 'stat-value', text: `${Math.round(avgQ * 100)}/100` })),
    progressBar(avgQ, 'good'),
    h('p', { class: 'tiny muted', text: `Quality comes from presentation, pro photos, price versus value, reputation and your Digital Marketing upgrade (level ${upgradeLevel(loc, 'marketing')}).` }),
    online.length ? table(['Vehicle', 'Quality', 'Asking', 'Days'], online.slice(0, 20).map((v) => [
      h('span', { text: `${v.year} ${v.brand} ${v.model}` }),
      h('span', { class: 'num', text: `${Math.round(listingQuality(s, v) * 100)}` }),
      h('span', { class: 'num', text: money(v.askingPrice) }),
      h('span', { class: 'num', text: String(v.daysInStock) }),
    ])) : h('p', { class: 'empty', text: 'Tick “Advertise online” on a listed vehicle to reach buyers beyond your street.' })));
  void moneySigned;
  return { el: view };
}
