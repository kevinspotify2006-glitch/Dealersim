/**
 * Build mode: the palette of rooms, fixtures, styles, land and templates, and
 * the strip of numbers that tells you what your layout does.
 */
import type { Ctx } from '../app';
import type { Location, ZoneCode } from '../../sim/types';
import { confirmDialog, h } from '../dom';
import { icon } from '../icons';
import { money } from '../../sim/format';
import { BUILD_CATEGORIES, FLOOR_STYLES, LAND_TIERS, LIGHT_STYLES, OBJECTS, WALL_STYLES, ZONES } from '../../data/lot';
import type { ObjDef, StyleOption } from '../../data/lot';
import { QUICK_ROOMS, TEMPLATES, applyTemplate, buildQuickRoom, buyLand, lotStats, nextLandTier, quickRoomCost, rentFor, setStyle, styleChangeCost, templateCost } from '../../sim/lot';
import { CITY_BY_ID } from '../../data/game';
import { capacityOf, occupying, staffAt } from '../../sim/state';

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; defId: string; rot: 0 | 1; x?: number; y?: number }
  | { kind: 'move'; objId: string; defId: string; rot: 0 | 1; x: number; y: number }
  | { kind: 'paint'; code: ZoneCode; start?: { x: number; y: number }; end?: { x: number; y: number } };

export interface BuildHost {
  ctx: Ctx;
  loc: () => Location;
  tool: () => Tool;
  setTool: (t: Tool) => void;
  category: () => string;
  setCategory: (c: string) => void;
  done: () => void;
  flow: () => boolean;
  toggleFlow: () => void;
  after: () => void;
}

const EFFECT_NAMES: Record<string, string> = {
  appeal: 'showroom appeal', decor: 'decor', curb: 'curb appeal', lounge: 'comfort', footfall: 'walk-ins', workshop: 'workshop', detailing: 'detailing',
  equipment: 'diagnostics', reception: 'patience', photo: 'free pro photos', ev: 'EV buyers pay more', security: 'cheaper insurance',
};

export function effectText(def: ObjDef): string {
  const parts: string[] = [];
  if (def.slot) parts.push(def.slot === 'lift' ? 'holds a car being repaired' : def.slot === 'bay' ? 'holds a car being cleaned' : def.slot === 'storage' ? '+1 space (hidden)' : '+1 space for sale');
  if (def.station) parts.push(`workstation: ${def.station.join('/')}`);
  for (const [k, v] of Object.entries(def.effects ?? {})) if (v) parts.push(`+${v} ${EFFECT_NAMES[k] ?? k}`);
  return parts.join(' · ');
}

export function buildPalette(host: BuildHost): HTMLElement {
  const s = host.ctx.state;
  const loc = host.loc();
  const cat = host.category();
  const tool = host.tool();
  const root = h('div', { class: 'build-palette' });
  root.appendChild(h('div', { class: 'bp-head' },
    h('span', { class: 'bp-title' }, icon('hammer', 16), 'Build'),
    h('span', { class: 'bp-cash', text: money(s.cash) }),
    h('button', { class: `btn small icon-only ${tool.kind === 'select' ? 'active' : ''}`, title: 'Select, move, rotate or sell what is built', aria: { label: 'Select tool' }, on: { click: () => host.setTool({ kind: 'select' }) } }, icon('move', 15)),
    h('button', { class: `btn small icon-only ${host.flow() ? 'active' : ''}`, title: 'Show where customers can walk', aria: { label: 'Customer flow overlay' }, on: { click: host.toggleFlow } }, icon('customer', 15)),
    h('button', { class: 'btn small primary', on: { click: host.done } }, icon('check', 14), 'Done')));
  const tabs = h('div', { class: 'bp-tabs scroll-x' });
  for (const c of BUILD_CATEGORIES) {
    tabs.appendChild(h('button', { class: `bp-tab${c.id === cat ? ' active' : ''}`, data: { cat: c.id }, on: { click: () => host.setCategory(c.id) } }, c.name));
  }
  root.appendChild(tabs);
  const body = h('div', { class: 'bp-body' });
  root.appendChild(body);
  const searchWrap = h('label', { class: 'bp-search', aria: { label: 'Search build items' } },
    icon('search', 14),
    h('input', { type: 'search', placeholder: 'Search buildings, furniture, equipment…', aria: { label: 'Search build items' } })
  );
  root.insertBefore(searchWrap, body);
  const search = searchWrap.querySelector('input') as HTMLInputElement;
  search.addEventListener('input', () => renderObjects());

  if (cat === 'zones') {
    body.appendChild(h('div', { class: 'bp-hint', text: 'Pick an area, then drag on the map to paint it. Indoor rooms get walls automatically — add a door so people can get in.' }));
    const grid = h('div', { class: 'bp-grid' });
    for (const z of ZONES) {
      if (z.code === '.') continue;
      const active = tool.kind === 'paint' && tool.code === z.code;
      grid.appendChild(h('button', {
        class: `bp-item${active ? ' active' : ''}`,
        data: { zone: z.code },
        title: z.description,
        on: { click: () => host.setTool({ kind: 'paint', code: z.code }) },
      }, h('span', { class: 'bp-swatch', style: `background:${z.color}` }, z.icon), h('span', { class: 'bp-name', text: z.name }), h('span', { class: 'bp-cost', text: `${money(z.costPerTile)}/m²` })));
    }
    const demolish = tool.kind === 'paint' && tool.code === '.';
    grid.appendChild(h('button', { class: `bp-item${demolish ? ' active' : ''}`, data: { zone: '.' }, title: 'Clear back to bare land (30% salvage).', on: { click: () => host.setTool({ kind: 'paint', code: '.' }) } },
      h('span', { class: 'bp-swatch', style: 'background:#3b342c' }, '🧹'), h('span', { class: 'bp-name', text: 'Clear land' }), h('span', { class: 'bp-cost', text: 'salvage' })));
    body.appendChild(grid);
    body.appendChild(h('div', { class: 'bp-sub', text: 'Ready-made rooms (one tap, placed on free land)' }));
    const rooms = h('div', { class: 'bp-grid' });
    for (const [id, r] of Object.entries(QUICK_ROOMS)) {
      const cost = quickRoomCost(loc, id);
      rooms.appendChild(h('button', {
        class: 'bp-item',
        data: { room: id },
        title: r.description,
        disabled: s.cash < cost,
        on: {
          click: async () => {
            if (cost >= s.settings.confirmBigSpend && !(await confirmDialog(`Build a ${r.name.toLowerCase()}?`, `${r.description} Cost about ${money(cost)}.`, 'Build'))) return;
            host.ctx.act(buildQuickRoom(s, loc, id), { sound: 'buy' });
            host.after();
          },
        },
      }, h('span', { class: 'bp-swatch' }, r.icon), h('span', { class: 'bp-name', text: r.name }), h('span', { class: 'bp-cost', text: money(cost) })));
    }
    body.appendChild(rooms);
  } else if (cat === 'style') {
    const section = (title: string, kind: 'floor' | 'walls' | 'lighting', list: StyleOption[]): void => {
      body.appendChild(h('div', { class: 'bp-sub', text: title }));
      const grid = h('div', { class: 'bp-grid' });
      for (const o of list) {
        const current = loc.lot.style[kind] === o.id;
        const locked = (o.minLevel ?? 1) > s.companyLevel;
        const cost = styleChangeCost(loc.lot, kind, o.id);
        grid.appendChild(h('button', {
          class: `bp-item${current ? ' active' : ''}${locked ? ' locked' : ''}`,
          disabled: current || locked,
          on: {
            click: async () => {
              if (cost >= s.settings.confirmBigSpend && !(await confirmDialog('Refit the building?', `${o.name} throughout: ${money(cost)}.`, 'Refit'))) return;
              host.ctx.act(setStyle(s, loc, kind, o.id), { sound: 'buy' });
              host.after();
            },
          },
        }, h('span', { class: 'bp-swatch', style: `background:${o.color}` }, current ? '✓' : ''), h('span', { class: 'bp-name', text: o.name }),
        h('span', { class: 'bp-cost', text: current ? 'current' : locked ? `level ${o.minLevel}` : money(cost) })));
      }
      body.appendChild(grid);
    };
    body.appendChild(h('div', { class: 'bp-hint', text: 'Styles apply to every indoor room. Better finishes raise the showroom level — at a price per square metre.' }));
    section('Floor', 'floor', FLOOR_STYLES);
    section('Walls', 'walls', WALL_STYLES);
    section('Lighting', 'lighting', LIGHT_STYLES);
  } else if (cat === 'land') {
    const next = nextLandTier(s, loc);
    const city = CITY_BY_ID[loc.cityId];
    body.appendChild(h('div', { class: 'bp-hint', text: `You own ${loc.lot.w} × ${loc.lot.h} m (${loc.lot.w * loc.lot.h} m²) in ${city.name}. Rent is ${money(loc.rentMonthly)}/month and grows with the size of the plot and your indoor space.` }));
    if (next) {
      const cost = Math.round(next.cost * (city?.rent ?? 1500) / 1500);
      const newRent = rentFor(loc, next.w, next.h);
      const locked = s.companyLevel < next.minLevel;
      body.appendChild(h('div', { class: 'bp-card' },
        h('div', { class: 'card-title', text: `Expand to ${next.w} × ${next.h} m` }),
        h('p', { class: 'tiny muted', text: `+${next.w * next.h - loc.lot.w * loc.lot.h} m² of bare land behind your lot. Rent becomes about ${money(newRent)}/month.` }),
        h('button', {
          class: 'btn primary block',
          disabled: locked || s.cash < cost,
          on: {
            click: async () => {
              if (!(await confirmDialog('Buy the land?', `Expand to ${next.w} × ${next.h} m for ${money(cost)}. Rent goes up to about ${money(newRent)}/month.`, 'Buy land'))) return;
              host.ctx.act(buyLand(s, loc), { sound: 'buy' });
              host.after();
            },
          },
        }, locked ? `Company level ${next.minLevel} needed` : `Buy land · ${money(cost)}`)));
    } else body.appendChild(h('p', { class: 'empty', text: 'You own the largest plot available here. Open another location to keep growing.' }));
    body.appendChild(h('div', { class: 'bp-sub', text: 'All plot sizes' }));
    body.appendChild(h('div', { class: 'bp-list' }, ...LAND_TIERS.map((t, i) => h('div', { class: `bp-row${i === loc.lot.landTier ? ' active' : ''}` },
      h('span', { text: `${t.w} × ${t.h} m` }), h('span', { class: 'tiny muted', text: i <= loc.lot.landTier ? 'owned' : `level ${t.minLevel}` })))));
  } else if (cat === 'templates') {
    body.appendChild(h('div', { class: 'bp-hint', text: 'Replace the whole layout with a ready-made design. What is built now is sold for half its price. You can change everything afterwards.' }));
    const salvage = Math.round(loc.lot.objects.reduce((sum, o) => sum + (OBJECTS.find((d) => d.id === o.defId)?.cost ?? 0), 0) * 0.5);
    for (const t of TEMPLATES) {
      const cost = templateCost(t.id, loc.lot.landTier, s.companyLevel) - salvage;
      body.appendChild(h('div', { class: 'bp-card' },
        h('div', { class: 'card-title', text: t.name }),
        h('p', { class: 'tiny muted', text: t.description }),
        h('button', {
          class: 'btn block',
          data: { template: t.id },
          disabled: cost > s.cash,
          on: {
            click: async () => {
              if (!(await confirmDialog(`Rebuild as "${t.name}"?`, `Everything currently built is replaced. Net cost ${cost >= 0 ? money(cost) : `+${money(-cost)} back`}. Cars and staff move to the new spaces.`, 'Rebuild', true))) return;
              host.ctx.act(applyTemplate(s, loc, t.id), { sound: 'buy' });
              host.after();
            },
          },
        }, cost >= 0 ? `Rebuild · ${money(cost)}` : `Rebuild · +${money(-cost)}`)));
    }
  } else {
    renderObjects();
  }

  function renderObjects(): void {
    if (cat === 'zones' || cat === 'style' || cat === 'land' || cat === 'templates') return;
    body.querySelector('.bp-object-list')?.remove();
    const q = search.value.trim().toLowerCase();
    const defs = OBJECTS.filter((o) => o.category === cat && (!q || [o.name, o.description, effectText(o)].join(' ').toLowerCase().includes(q)));
    const wrap = h('div', { class: 'bp-object-list' });
    const grid = h('div', { class: 'bp-grid' });
    if (!defs.length) wrap.appendChild(h('p', { class: 'empty', text: 'Geen items gevonden.' }));
    for (const def of defs) {
      const locked = (def.minLevel ?? 1) > s.companyLevel;
      const active = (tool.kind === 'place' || tool.kind === 'move') && tool.defId === def.id;
      const explanation = effectText(def) || 'Vooral visueel / decoratief.';
      const card = h('button', {
        class: `bp-item build-tip${active ? ' active' : ''}${locked ? ' locked' : ''}`,
        data: { obj: def.id },
        disabled: locked,
        title: `${def.description}\n\n${explanation}\nFormaat: ${def.w}×${def.h} m\nOnderhoud: ${money(def.upkeep)}/maand`,
        on: { click: () => host.setTool({ kind: 'place', defId: def.id, rot: 0 }) },
      },
        h('span', { class: 'bp-swatch', style: `border-color:${def.color}` }, def.icon),
        h('span', { class: 'bp-name', text: def.name }),
        h('span', { class: 'bp-cost', text: locked ? `level ${def.minLevel}` : money(def.cost) }),
        h('span', { class: 'bp-eff', text: `${def.w}×${def.h} m · ${explanation}` }),
        h('span', { class: 'bp-tooltip' },
          h('strong', { text: def.name }),
          h('span', { text: def.description }),
          h('span', { text: explanation }),
          h('span', { class: 'tiny muted', text: `${def.w}×${def.h} m · ${money(def.cost)} · ${money(def.upkeep)}/mo` })
        )
      );
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    body.appendChild(wrap);
  }
  return root;
}

/** The numbers that show what the layout does. */
export function buildStats(ctx: Ctx, loc: Location, onIssues: () => void): HTMLElement {
  const s = ctx.state;
  const ls = lotStats(loc.lot);
  const chip = (label: string, value: string, tone = ''): HTMLElement => h('div', { class: `bs-chip ${tone}` }, h('span', { class: 'bs-k', text: label }), h('span', { class: 'bs-v', text: value }));
  const staff = staffAt(s, loc.id).length;
  const stations = ls.stations.sales.length + ls.stations.mechanic.length + ls.stations.detailer.length + ls.stations.office.length;
  return h('div', { class: 'build-stats' },
    chip('Spaces', `${occupying(s, loc.id)}/${capacityOf(loc)}`, occupying(s, loc.id) >= capacityOf(loc) ? 'warn' : ''),
    chip('Workstations', `${staff}/${stations}`),
    chip('Showroom', `Lv ${ls.levels.showroom}`),
    chip('Workshop', `Lv ${ls.levels.workshop}`),
    chip('Lounge', `Lv ${ls.levels.lounge}`),
    chip('Flow', `${Math.round(ls.flow * 100)}%`, ls.flow >= 0.7 ? 'good' : ls.flow >= 0.45 ? 'warn' : 'bad'),
    chip('Upkeep', `${money(ls.upkeep)}/mo`),
    ls.issues.length ? h('button', { class: 'bs-chip bad clickable', on: { click: onIssues } }, h('span', { class: 'bs-k', text: 'Problems' }), h('span', { class: 'bs-v', text: String(ls.issues.length) })) : chip('Layout', 'OK', 'good'));
}
