/**
 * Build Mode 2.0 — the room views of the build drawer.
 *
 *   rooms  "What do you want to build in?" — the room types (with how many of
 *          each the lot has), plus the whole-lot tools (rooms, style, land,
 *          templates, every item). Tapping a floor on the map does the same.
 *   room   One room: its name and state, its own categories, and a tray of
 *          item cards — only what belongs in that room.
 *
 * Both are pure views over the shared build state in the world view (tool,
 * context, sheet size); placement, validation, money and saving are the same
 * code paths the rest of Build Mode uses.
 */
import type { Location, ZoneCode } from '../../sim/types';
import { h } from '../dom';
import { icon } from '../icons';
import { money } from '../../sim/format';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import type { ObjDef } from '../../data/lot';
import { BUILD_ROOMS, BUILD_ROOM_BY_ID, placementOf, roomEntries, roomTypeOfZone } from '../../data/buildrooms';
import type { RoomTypeId } from '../../data/buildrooms';
import { roomsOf, unlockReason } from '../../sim/lot';
import type { Room } from '../../sim/lot';
import { haptic } from '../../platform/platform';
import { richTipped } from '../kit';
import { effectLines, objectInfo } from './info';
import { lockLabel, openLocked, paletteTop } from './build';
import type { BuildContext, BuildHost } from './build';

/** The rooms on the lot, grouped by room type (largest first). */
export function roomsByType(loc: Location): Record<RoomTypeId, Room[]> {
  const out = Object.fromEntries(BUILD_ROOMS.map((r) => [r.id, [] as Room[]])) as Record<RoomTypeId, Room[]>;
  for (const r of roomsOf(loc.lot)) {
    if (r.tiles < 2) continue;
    out[roomTypeOfZone(r.code)].push(r);
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.tiles - a.tiles);
  return out;
}

/** A context for a room type: its first category and, when it exists on the lot, its largest room. */
export function contextFor(loc: Location, room: RoomTypeId, instance?: Room): BuildContext {
  const r = instance ?? roomsByType(loc)[room][0];
  return {
    room,
    category: BUILD_ROOM_BY_ID[room].categories[0].id,
    rect: r ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } : undefined,
    code: r?.code,
  };
}

/** The context for a tapped floor tile. */
export function contextAt(loc: Location, x: number, y: number, code: ZoneCode): BuildContext {
  const room = roomTypeOfZone(code);
  if (room === 'outdoor') return contextFor(loc, 'outdoor', undefined);
  const inst = roomsOf(loc.lot).find((r) => r.code === code && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  return contextFor(loc, room, inst);
}

// ------------------------------------------------------------ rooms view --

export function roomChooser(host: BuildHost): HTMLElement {
  const loc = host.loc();
  const root = h('div', { class: 'build-palette br-view br-rooms' });
  paletteTop(host, root);
  const byType = roomsByType(loc);
  const body = h('div', { class: 'bp-body br-body' });
  body.appendChild(h('div', { class: 'br-intro' },
    h('div', { class: 't-section', text: 'Where do you want to build?' }),
    h('div', { class: 't-secondary', text: 'Tap a room on the map, or pick one here. You only see what belongs in it.' })));
  body.appendChild(h('div', { class: 'br-roomgrid' }, ...BUILD_ROOMS.map((r) => {
    const list = byType[r.id];
    const sub = r.id === 'outdoor' ? `${loc.lot.w} × ${loc.lot.h} m lot` : list.length ? `${list.length} room${list.length === 1 ? '' : 's'} · ${list.reduce((n, x) => n + x.tiles, 0)} m²` : 'Not built yet';
    return h('button', {
      class: `br-room${list.length || r.id === 'outdoor' ? '' : ' empty'}`, data: { ctx: r.id },
      on: { click: () => { haptic(8); host.setContext?.(contextFor(loc, r.id)); } },
    }, h('span', { class: 'br-room-ic' }, icon(r.icon, 22)), h('span', { class: 'br-room-name', text: r.name }), h('span', { class: 'br-room-sub', text: sub }));
  })));
  body.appendChild(h('div', { class: 't-label', text: 'Whole dealership' }));
  const tool = (id: string, label: string, ic: string, sub: string, run: () => void): HTMLElement =>
    h('button', { class: 'list-row br-tool', data: { ctx: id }, on: { click: () => { haptic(6); run(); } } }, icon(ic, 18), h('span', { class: 'list-title' }, label, h('span', { class: 't-secondary br-tool-sub', text: sub })), icon('chevron', 14));
  body.appendChild(h('div', { class: 'list-m' },
    tool('newroom', 'Rooms & floors', 'garage', 'Create a room, paint floors, ready-made rooms', () => { host.setCategory('zones'); host.setView?.('catalog'); }),
    tool('style', 'Style & focus', 'palette', 'Dealership style, floors, walls, ceilings', () => { host.setCategory('style'); host.setView?.('catalog'); }),
    tool('land', 'Land', 'map', 'Expand the plot', () => { host.setCategory('land'); host.setView?.('catalog'); }),
    tool('templates', 'Templates', 'ruler', 'Place ready-made rooms and areas', () => { host.setCategory('templates'); host.setView?.('catalog'); }),
    tool('catalog', 'All items', 'grid', 'Search and filter the whole catalogue', () => { host.setCategory('all'); host.setView?.('catalog'); })));
  root.appendChild(body);
  return root;
}

// ------------------------------------------------------------- room view --

export function roomMenu(host: BuildHost, ctx: BuildContext): HTMLElement {
  const s = host.ctx.state;
  const loc = host.loc();
  const def = BUILD_ROOM_BY_ID[ctx.room];
  const root = h('div', { class: `build-palette br-view br-room-view room-${ctx.room}` });
  paletteTop(host, root);

  // Which room, and how it is doing.
  const instances = roomsByType(loc)[ctx.room];
  const inst = ctx.rect ? instances.find((r) => r.x0 === ctx.rect!.x0 && r.y0 === ctx.rect!.y0) : undefined;
  const status = ctx.room === 'outdoor'
    ? `${loc.lot.w} × ${loc.lot.h} m lot`
    : inst
      ? `${ZONE_BY_CODE[inst.code]?.name ?? def.name} · ${inst.tiles} m² · ${inst.complete ? ['', 'basic', 'good', 'excellent'][inst.quality] ?? 'working' : `needs ${inst.needs[0] ?? 'furnishing'}`}`
      : instances.length ? `${instances.length} room${instances.length === 1 ? '' : 's'}` : 'Not built yet';
  const idx = inst ? instances.indexOf(inst) : -1;
  root.appendChild(h('div', { class: 'br-head' },
    h('button', { class: 'br-back', data: { ctx: 'rooms' }, aria: { label: 'All rooms' }, on: { click: () => { haptic(6); host.setView?.('rooms'); } } }, icon('back', 18)),
    h('span', { class: 'br-head-ic' }, icon(def.icon, 20)),
    h('div', { class: 'br-head-txt' }, h('div', { class: 'br-head-name', text: def.name }), h('div', { class: `br-head-sub${inst && !inst.complete ? ' warn' : ''}`, text: status })),
    instances.length > 1 ? h('button', {
      class: 'btn small ghost br-next', data: { ctx: 'next' }, title: 'Next room of this type',
      on: { click: () => { const n = instances[(idx + 1) % instances.length]; host.setContext?.({ ...ctx, rect: { x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 }, code: n.code }); } },
    }, `${idx + 1}/${instances.length}`, icon('chevron', 13)) : null));

  // Categories of this room only.
  const cats = h('div', { class: 'br-cats', role: 'tablist' }, ...def.categories.map((c) => {
    const n = roomEntries(ctx.room, c.id).length;
    return h('button', {
      class: `br-cat${c.id === ctx.category ? ' active' : ''}`, data: { rcat: c.id }, role: 'tab', aria: { selected: String(c.id === ctx.category) },
      on: { click: () => { haptic(6); host.setContext?.({ ...ctx, category: c.id }); } },
    }, icon(c.icon, 16), h('span', { text: c.name }), h('span', { class: 'br-cat-n', text: String(n) }));
  }));
  root.appendChild(cats);
  requestAnimationFrame(() => cats.querySelector<HTMLElement>('.br-cat.active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));

  // The tray: this category's items as cards.
  const tray = h('div', { class: 'bp-body br-tray' });
  const entries = roomEntries(ctx.room, ctx.category);
  if (!instances.length && ctx.room !== 'outdoor') {
    tray.appendChild(h('div', { class: 'br-empty' },
      h('div', { class: 't-body', text: `You have no ${def.name.toLowerCase()} yet.` }),
      h('div', { class: 't-secondary', text: 'Create one first: drag a rectangle on the map and pick the room type.' }),
      h('button', { class: 'btn small primary', data: { ctx: 'create' }, on: { click: () => host.setTool({ kind: 'room' }) } }, icon('garage', 14), 'Create a room')));
  }
  if (!entries.length) {
    tray.appendChild(h('div', { class: 'br-empty' }, h('div', { class: 't-body', text: 'No items available here yet.' }), h('div', { class: 't-secondary', text: 'Reach higher dealership levels to unlock more.' })));
  }
  const tool = host.tool();
  for (const e of entries) tray.appendChild(e.startsWith('zone:') ? surfaceCard(host, e.slice(5) as ZoneCode, tool.kind === 'paint' && tool.code === e.slice(5)) : itemCard(host, OBJ_BY_ID[e], (tool.kind === 'place' || tool.kind === 'move') && tool.defId === e));
  root.appendChild(tray);
  void s;
  return root;
}

function shortEffect(def: ObjDef): string {
  const fx = effectLines(def)[0];
  if (fx) return fx.text;
  if (def.slot) return '+1 car space';
  if (def.station) return 'Workstation';
  return '';
}

function itemCard(host: BuildHost, def: ObjDef, active: boolean): HTMLElement {
  const s = host.ctx.state;
  const reason = unlockReason(s, def, host.loc());
  const poor = !reason && s.cash < def.cost;
  const place = placementOf(def);
  const card = h('button', {
    class: `br-card${active ? ' active' : ''}${reason ? ' locked' : ''}${poor ? ' poor' : ''}`,
    data: { obj: def.id, place },
    aria: { label: `${def.name}, ${money(def.cost)}${reason ? `. Locked: ${reason}` : ''}`, pressed: String(active) },
    on: { click: () => { if (reason) { openLocked(host, def, reason); return; } haptic(8); host.setTool({ kind: 'place', defId: def.id, rot: 0 }); } },
  },
  h('span', { class: 'br-art', style: `--c:${def.color}` }, h('span', { class: 'br-emoji', text: def.icon }), reason ? h('span', { class: 'br-lock' }, icon('lock', 13)) : null,
    place === 'wall' ? h('span', { class: 'br-badge', text: 'Wall' }) : place === 'line' ? h('span', { class: 'br-badge', text: 'Line' }) : null),
  h('span', { class: 'br-name', text: def.name }),
  h('span', { class: 'br-price', text: reason ? lockLabel(reason) : money(def.cost) }),
  h('span', { class: 'br-meta', text: [`${def.w}×${def.h}`, shortEffect(def)].filter(Boolean).join(' · ') }));
  card.addEventListener('pointerdown', (e) => { if (!reason && e.button === 0) host.paletteDrag(e, { defId: def.id }); });
  return richTipped(card, () => objectInfo(s, def), def.name);
}

function surfaceCard(host: BuildHost, code: ZoneCode, active: boolean): HTMLElement {
  const z = ZONE_BY_CODE[code];
  return h('button', {
    class: `br-card surface${active ? ' active' : ''}`, data: { zone: code, place: 'surface' },
    aria: { label: `${z.name}, ${money(z.costPerTile)} per m². Drag on the map to draw.` },
    on: { click: () => { haptic(8); host.setTool({ kind: 'paint', code }); } },
  },
  h('span', { class: 'br-art', style: `--c:${z.color};background:${z.color}` }, h('span', { class: 'br-emoji', text: z.icon })),
  h('span', { class: 'br-name', text: z.name }),
  h('span', { class: 'br-price', text: `${money(z.costPerTile)}/m²` }),
  h('span', { class: 'br-meta', text: 'Drag to draw' }));
}
