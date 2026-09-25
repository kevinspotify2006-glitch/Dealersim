import type { Ctx, View } from '../app';
import { confirmDialog, h } from '../dom';
import { money } from '../../sim/format';
import { UPGRADES } from '../../data/game';

/** Bought services. Everything physical is built on the lot instead. */
export const SERVICE_UPGRADES = ['marketing', 'finance', 'tradein', 'analytics'];
import { buyUpgrade, upgradeCheck } from '../../sim/progress';
import { activeLocation } from '../../sim/state';
import { helpButton, pageHead, progressBar } from '../kit';
import { locationPicker } from './dealership';

export function upgradesView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const view = h('div', { class: 'view' });
  view.appendChild(pageHead('Services', `Business services for ${loc.name}. Facilities like the showroom and workshop are built in the dealership itself. Cash ${money(s.cash)}.`, helpButton('upgrades'), h('button', { class: 'btn', on: { click: () => ctx.go('dealership', { build: '1' }) } }, 'Build facilities')));
  const picker = locationPicker(ctx);
  if (picker) view.appendChild(picker);
  const grid = h('div', { class: 'grid cols-2 upgrade-grid' });
  for (const u of UPGRADES.filter((x) => SERVICE_UPGRADES.includes(x.id))) {
    const c = upgradeCheck(s, loc, u.id);
    const maxed = c.level >= c.max;
    const locked = !maxed && c.reason?.startsWith('Requires');
    grid.appendChild(h('article', { class: `card upgrade${maxed ? ' maxed' : ''}${locked ? ' muted-card' : ''}` },
      h('div', { class: 'card-head' },
        h('div', {}, h('div', { class: 'card-title', text: `${u.icon} ${u.name}` }), h('div', { class: 'card-sub', text: `Level ${c.level} of ${c.max}` })),
        maxed ? h('span', { class: 'tag good', text: 'Max' }) : null),
      progressBar(c.level / c.max, 'good'),
      h('p', { class: 'tiny muted', text: u.description }),
      h('div', { class: 'upg-effects' },
        h('div', { class: 'tiny' }, h('span', { class: 'muted', text: 'Now: ' }), u.effect[c.level] ?? '—'),
        !maxed ? h('div', { class: 'tiny good' }, h('span', { class: 'muted', text: 'Next: ' }), u.effect[c.level + 1] ?? '') : null),
      !maxed ? h('button', {
        class: `btn block ${c.ok ? 'primary' : ''}`,
        disabled: !c.ok,
        on: {
          click: async () => {
            if ((c.cost ?? 0) >= s.settings.confirmBigSpend && !(await confirmDialog('Confirm upgrade', `Spend ${money(c.cost ?? 0)} on ${u.name} at ${loc.name}?`, 'Upgrade'))) return;
            ctx.act(buyUpgrade(s, loc.id, u.id), { sound: 'buy', money: -(c.cost ?? 0) });
          },
        },
      }, c.ok ? `Upgrade · ${money(c.cost ?? 0)}` : `${c.reason} ${c.cost ? `(${money(c.cost)})` : ''}`) : null));
  }
  view.appendChild(grid);
  return { el: view };
}
