/**
 * THE DEALERSHIP — the game's home screen.
 *
 * A live, pannable, zoomable view of your lot. Everything that can be done
 * from the floor is done here: tap a car to list, price, prep or move it; tap
 * a customer to talk, recommend, test drive and negotiate; tap an employee or
 * a fixture; switch to Build mode to shape the place. Management screens open
 * as side panels (bottom sheets on a phone) over the dealership.
 */
import type { Ctx, View } from '../app';
import type { Location, Vehicle, ZoneCode } from '../../sim/types';
import { confirmDialog, h, toast } from '../dom';
import { icon } from '../icons';
import { money, moneyShort } from '../../sim/format';
import { SPEEDS, SPEED_LABELS, activeLocation, absHour, capacityOf, occupying, vehicleName } from '../../sim/state';
import { buyLand, canPlace, findSpot, carDropCheck, carSize, duplicateSpot, footprint, lineCheck, lotStats, moveObject, nextPlot, paintZone, placeLine, placeObject, placeVehicle, zoneAt, zoneCost } from '../../sim/lot';
import { bulldoze, bulldozePlan, createRoom, objectsInRect, stampCheck, stampTemplate, suggestRoom, upgradeObject, upgradeInfo } from '../../sim/buildplus';
import { ROOM_TEMPLATE_BY_ID } from '../../data/buildplus';
import { openDrive } from '../drive/driveview';
import { modal } from '../dom';
import type { StyleTarget } from '../../sim/lot';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import { expectedLeads, interestLabel, waitingCustomers, canTestDrive } from '../../sim/customers';
import { on } from '../../sim/bus';
import { Camera } from '../world/camera';
import { Crowd } from '../world/agents';
import { carPose, renderScene } from '../world/render';
import type { CarGhost, Ghost, LineGhost, PaintPreview, RectPreview, Selection, StampGhost } from '../world/render';
import { entityMenu, pruneNotes } from '../world/menus';
import type { WorldActions } from '../world/menus';
import { buildPalette, buildStats, setTracker } from '../world/build';
import type { Filter, SheetSize, Tool } from '../world/build';
import { openDecisions } from './growth';
import { openTestDrive } from '../modals/testdrive';
import { MISSION_BY_ID } from '../../data/missions';
import { missionProgress } from '../../sim/systems/missions';
import { canRedo, canUndo, redo, redoLabel, track as trackHistory, undo, undoLabel } from '../world/history';
import { objectInfo, vehicleInfo } from '../world/info';
import { isPhone, setCompact } from '../layout';
import { gameMode, setGameMode } from '../mode';
import { pushBackHandler, haptic } from '../../platform/platform';
import { play } from '../../platform/sound';
import { inventoryView } from './inventory';
import { marketView } from './market';
import { staffView } from './staff';
import { financesView } from './finances';
import { dealershipView } from './dealership';
import { hideTipNow, reputationStars, showTipAt } from '../kit';

type PanelId = 'cars' | 'buy' | 'customers' | 'staff' | 'finances' | 'notices' | 'lot' | 'time';

interface Ui {
  build: boolean;
  tool: Tool;
  category: string;
  search: string;
  filter: Filter;
  styleTarget: StyleTarget;
  grid: boolean;
  snap: boolean;
  panel: PanelId | null;
  selected: Selection;
  moveCar: string | null;
  flow: boolean;
  cams: Record<string, { x: number; y: number; zoom: number }>;
  /** Phone build sheet height. */
  sheet: SheetSize;
}

// Kept between visits so the dealership looks the way you left it.
const ui: Ui = { build: false, tool: { kind: 'select' }, category: 'zones', search: '', filter: 'all', styleTarget: 'all', grid: true, snap: true, panel: null, selected: null, moveCar: null, flow: false, cams: {}, sheet: 'half' };
const crowd = new Crowd();

const PANELS: Record<Exclude<PanelId, 'time'>, { title: string; icon: string }> = {
  cars: { title: 'Your cars', icon: 'car' },
  buy: { title: 'Buy cars', icon: 'store' },
  customers: { title: 'Customers', icon: 'customer' },
  staff: { title: 'Staff', icon: 'people' },
  finances: { title: 'Finances', icon: 'finance' },
  notices: { title: 'Notifications', icon: 'bell' },
  lot: { title: 'Dealership info', icon: 'garage' },
};

export function worldView(ctx: Ctx): View {
  const cam = new Camera();
  const canvas = h('canvas', { class: 'world-canvas', aria: { label: 'Your dealership. Drag to look around, pinch or scroll to zoom, tap anything to interact.' } });
  const hud = h('div', { class: 'world-hud' });
  const buildStrip = h('div', { class: 'world-buildstats' });
  const actionBar = h('div', { class: 'world-actions' });
  const panelHost = h('aside', { class: 'world-panel', aria: { label: 'Management panel' } });
  const pop = h('div', { class: 'world-pop' });
  const paletteHost = h('div', { class: 'world-palette' });
  const confirmBar = h('div', { class: 'world-confirm' });
  // Phone build mode's own top bar: ← · Build · cash · undo · redo · ⋯ · ✓ Done.
  const buildBar = h('div', { class: 'world-buildbar', role: 'toolbar', aria: { label: 'Build' } });
  const banner = h('div', { class: 'world-banner' });
  const zoomBtns = h('div', { class: 'world-zoom' },
    h('button', { class: 'icon-btn', title: 'Zoom in', aria: { label: 'Zoom in' }, on: { click: () => zoomBy(1.25) } }, icon('plus', 16)),
    h('button', { class: 'icon-btn', title: 'Zoom out', aria: { label: 'Zoom out' }, on: { click: () => zoomBy(0.8) } }, h('span', { class: 'minus', text: '−' })),
    h('button', { class: 'icon-btn', title: 'Show the whole lot', aria: { label: 'Show the whole lot' }, on: { click: () => fitLot() } }, icon('locate', 16)));
  const root = h('div', { class: 'view world' }, canvas, hud, buildStrip, zoomBtns, banner, pop, paletteHost, buildBar, confirmBar, actionBar, panelHost);

  let loc: Location = activeLocation(ctx.state);
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let dpr = 1;
  let destroyed = false;
  let hover: { x: number; y: number } | null = null;
  let releasePanel: (() => void) | null = null;
  let releasePop: (() => void) | null = null;
  let releaseBuild: (() => void) | null = null;
  let releaseMove: (() => void) | null = null;
  let popAnchor: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  const unsubs: (() => void)[] = [];

  // --------------------------------------------------------------- camera --
  const setBounds = (): void => {
    const np = nextPlot(ctx.state, loc);
    const dy = np ? np.h - loc.lot.h : 0;
    cam.setBounds(-4, -4 - dy, (np ? np.w : loc.lot.w) + 4, loc.lot.h + 6);
  };
  /** The land for sale around the lot (drawn hatched with a lock and the price). */
  const lockedLand = (): { w: number; h: number; dy: number; label: string } | null => {
    const np = nextPlot(ctx.state, loc);
    if (!np || ui.tool.kind === 'car') return null;
    const locked = ctx.state.companyLevel < np.minLevel;
    return { w: np.w, h: np.h, dy: np.h - loc.lot.h, label: `Expand dealership · ${np.name} · ${locked ? `level ${np.minLevel}` : money(np.cost)}` };
  };
  const inLocked = (p: { x: number; y: number }): boolean => {
    const L = lockedLand();
    if (!L) return false;
    const inside = p.x >= 0 && p.x < L.w && p.y >= -L.dy && p.y < loc.lot.h;
    const owned = p.x >= 0 && p.x < loc.lot.w && p.y >= 0 && p.y < loc.lot.h;
    return inside && !owned;
  };
  let expandFx: { start: number; oldW: number; dy: number } | null = null;
  let bullHover: string | null = null;
  let pickReturn = false;
  const fitLot = (): void => {
    const phone = isPhone();
    const side = phone && window.matchMedia('(max-height: 560px) and (orientation: landscape)').matches;
    cam.fit(-1, -1, loc.lot.w + 1, loc.lot.h + 4.5, {
      top: phone ? (ui.build ? 72 : 56) : 64,
      bottom: phone ? (ui.build && !side ? Math.round((paletteHost.offsetHeight || cam.height * 0.52) + 8) : side ? 16 : 86) : 92,
      left: (!phone || side) && ui.build ? (paletteHost.offsetWidth || 340) + 12 : 16,
      right: !phone && ui.panel && ui.panel !== 'time' ? 460 : 16,
    });
  };
  const saveCam = (): void => { ui.cams[loc.id] = { x: cam.x, y: cam.y, zoom: cam.zoom }; };
  const zoomBy = (f: number): void => { cam.zoomAt(f, cam.width / 2, cam.height / 2); saveCam(); };
  const centerOn = (x: number, y: number): void => {
    // Keep what you tapped clear of the panel on the right.
    const shift = !isPhone() && ui.panel && ui.panel !== 'time' ? 230 / cam.zoom : 0;
    cam.x = x + shift;
    cam.y = y + (isPhone() ? cam.height * 0.12 / cam.zoom : 0);
    cam.clamp();
    saveCam();
  };

  const resize = (): void => {
    const r = root.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    const first = cam.width === 800 && cam.height === 600;
    cam.resize(r.width, r.height);
    if (first) {
      setBounds();
      const saved = ui.cams[loc.id];
      if (saved) { cam.x = saved.x; cam.y = saved.y; cam.zoom = saved.zoom; cam.clamp(); } else fitLot();
    }
  };
  const ro = new ResizeObserver(() => resize());

  // ---------------------------------------------------------------- frame --
  const pace = (): number => {
    const st = ctx.state;
    if (st.speed === 0 || ctx.engine.hold) return 0;
    return (SPEEDS[st.speed] ?? 0) / SPEEDS[1];
  };
  let syncTimer = 0;
  /** Floating feedback labels (drift up and fade over two seconds). */
  const floaters: { text: string; x: number; y: number; born: number; tone: string }[] = [];
  const drawFloaters = (): void => {
    if (!floaters.length || document.documentElement.classList.contains('reduced-motion')) { floaters.length = 0; return; }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = '700 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      const age = time - f.born;
      if (age > 2.4) { floaters.splice(i, 1); continue; }
      const p = cam.toScreen(f.x, f.y);
      const yy = p.y - 18 - age * 26;
      const alpha = age < 0.2 ? age / 0.2 : Math.max(0, 1 - (age - 1.4));
      const w = g.measureText(f.text).width + 18;
      g.globalAlpha = alpha * 0.92;
      g.fillStyle = 'rgba(10,12,15,0.88)';
      g.beginPath(); g.roundRect(p.x - w / 2, yy - 13, w, 26, 13); g.fill();
      g.strokeStyle = f.tone;
      g.lineWidth = 1.5;
      g.stroke();
      g.globalAlpha = alpha;
      g.fillStyle = f.tone;
      g.fillText(f.text, p.x, yy + 1);
    }
    g.restore();
  };
  const frame = (now: number): void => {
    if (destroyed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    const current = activeLocation(ctx.state);
    if (current !== loc) {
      saveCam();
      loc = current;
      setBounds();
      const saved = ui.cams[loc.id];
      if (saved) { cam.x = saved.x; cam.y = saved.y; cam.zoom = saved.zoom; cam.clamp(); } else fitLot();
      ui.selected = null;
      closePop();
      paintAll();
    }
    // Keyboard panning.
    const speed = 22 * dt;
    let dx = 0; let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= speed;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += speed;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= speed;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += speed;
    if (dx || dy) { cam.x += dx * 24 / cam.zoom * 1.4; cam.y += dy * 24 / cam.zoom * 1.4; cam.clamp(); saveCam(); }
    syncTimer -= dt;
    if (syncTimer <= 0) {
      crowd.sync(ctx.state, loc);
      syncTimer = 0.25;
    }
    crowd.step(dt, pace(), ctx.state, loc);
    renderScene(canvas, {
      state: ctx.state, loc, cam, crowd, time, build: ui.build, grid: ui.grid, selected: ui.selected, ghost: ghost(), line: lineGhost(), car: carGhost(),
      dragging: ui.tool.kind === 'car' ? ui.tool.vehicleId : ui.tool.kind === 'move' ? ui.tool.objId : null,
      paint: paintPreview(), moveCar: ui.moveCar ?? (ui.tool.kind === 'car' ? ui.tool.vehicleId : null), flow: ui.flow || (ui.build && ui.tool.kind === 'paint'), dpr,
      bulldoze: bulldozePreview(), area: areaPreview(), room: roomPreview(), stamp: stampGhost(), locked: lockedLand(),
      expand: expandFx ? { p: Math.min(1, (time - expandFx.start) / 1.6), oldW: expandFx.oldW, dy: expandFx.dy } : null,
    });
    if (expandFx && time - expandFx.start > 1.7) expandFx = null;
    drawFloaters();
    if (popAnchor && !isPhone()) placePop();
    raf = requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------- build tools --
  /** Every build action goes through undo history. */
  const track = <T extends { ok: boolean }>(label: string, run: () => T): T => trackHistory(ctx.state, loc, label, run);
  setTracker(track);
  let altHeld = false;
  const snapOn = (): boolean => ui.snap && !altHeld;
  const warnCache = new Map<string, string>();

  /** Would this solid object cut customers off from cars? Cached per spot. */
  const blockWarning = (defId: string, x: number, y: number, rot: 0 | 1, ignore?: string): string => {
    const def = OBJ_BY_ID[defId];
    if (def.walkable || def.slot) return '';
    const key = `${defId}:${x}:${y}:${rot}:${ignore ?? ''}:${loc.lot.version}`;
    const hit = warnCache.get(key);
    if (hit !== undefined) return hit;
    const before = lotStats(loc.lot);
    const objects = loc.lot.objects.filter((o) => o.id !== ignore);
    const trial = { ...loc.lot, objects: [...objects, { id: '__probe', defId, x, y, rot }], version: -Math.random() };
    const after = lotStats(trial);
    const lost = before.reachable.size - after.reachable.size;
    const msg = lost > 0 ? `Blocks customers from ${lost} car space${lost > 1 ? 's' : ''}` : before.entrance && !after.entrance ? 'Blocks the entrance' : '';
    if (warnCache.size > 400) warnCache.clear();
    warnCache.set(key, msg);
    return msg;
  };

  /** With snapping on, thin furniture slides flush against a nearby wall. */
  const wallSnap = (defId: string, x: number, y: number, rot: 0 | 1, ignore?: string): { x: number; y: number } => {
    const def = OBJ_BY_ID[defId];
    if (!snapOn() || def.slot || def.line || def.edge || Math.min(def.w, def.h) > 1 || !ZONE_BY_CODE[zoneAt(loc.lot, x, y)]?.indoor) return { x, y };
    const w = rot ? def.h : def.w;
    const hh = rot ? def.w : def.h;
    const touches = (px: number, py: number): boolean => {
      const z = zoneAt(loc.lot, px, py);
      for (let ty = py; ty < py + hh; ty += 1) for (let tx = px; tx < px + w; tx += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (zoneAt(loc.lot, tx + dx, ty + dy) !== z) return true;
      }
      return false;
    };
    if (touches(x, y)) return { x, y };
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (touches(x + dx, y + dy) && canPlace(ctx.state, loc, defId, x + dx, y + dy, rot, ignore, true).ok) return { x: x + dx, y: y + dy };
    }
    return { x, y };
  };

  const ghost = (): Ghost | null => {
    const t = ui.tool;
    if (!ui.build || (t.kind !== 'place' && t.kind !== 'move')) return null;
    const def = OBJ_BY_ID[t.defId];
    if (t.kind === 'place' && def.line && t.line) return null;
    const w = t.rot ? def.h : def.w;
    const hh = t.rot ? def.w : def.h;
    let x = t.x;
    let y = t.y;
    if (t.kind === 'move' && t.dragging && hover) {
      x = Math.round(hover.x - (t.grab?.dx ?? w / 2));
      y = Math.round(hover.y - (t.grab?.dy ?? hh / 2));
    } else if (x === undefined || y === undefined) {
      if (!hover) return null;
      x = Math.round(hover.x - w / 2);
      y = Math.round(hover.y - hh / 2);
    }
    const ignore = t.kind === 'move' ? t.objId : undefined;
    ({ x, y } = wallSnap(t.defId, x, y, t.rot, ignore));
    const check = canPlace(ctx.state, loc, t.defId, x, y, t.rot, ignore, t.kind === 'move');
    const fee = t.kind === 'move' ? Math.min(250, Math.round(def.cost * 0.05)) : def.cost;
    const warn = check.ok ? blockWarning(t.defId, x, y, t.rot, ignore) : '';
    return { defId: t.defId, x, y, rot: t.rot, ok: check.ok, warn: !!warn, label: check.ok ? `✓ ${def.name} · ${money(fee)}${warn ? ` — ${warn}` : ''}` : `✕ Blocked: ${check.reason}` };
  };

  const lineGhost = (): LineGhost | null => {
    const t = ui.tool;
    if (!ui.build || t.kind !== 'place' || !t.line) return null;
    const def = OBJ_BY_ID[t.defId];
    const c = lineCheck(ctx.state, loc, t.defId, t.line.x0, t.line.y0, t.line.x1, t.line.y1);
    return { defId: t.defId, tiles: c.tiles, ok: c.count > 0 && c.cost <= ctx.state.cash, label: `${c.count} × ${def.name} · ${money(c.cost)}` };
  };

  const carGhost = (): CarGhost | null => {
    const t = ui.tool;
    if (t.kind !== 'car') return null;
    const v = ctx.state.vehicles.find((x) => x.id === t.vehicleId);
    if (!v) return null;
    const cx = t.dragging || t.cx === undefined ? hover?.x : t.cx;
    const cy = t.dragging || t.cy === undefined ? hover?.y : t.cy;
    if (cx === undefined || cy === undefined) return null;
    const drop = carDropCheck(ctx.state, loc, v.id, cx, cy, t.rot, snapOn());
    let pose: { x: number; y: number; angle: number };
    let rect: { x: number; y: number; w: number; h: number };
    if (drop.slotId) {
      const o = loc.lot.objects.find((x) => x.id === drop.slotId)!;
      const f = footprint(o);
      pose = carPose(loc, o.id, time) ?? { x: f.x + f.w / 2, y: f.y + f.h / 2, angle: 0 };
      rect = f;
    } else {
      const sz = carSize(t.rot);
      rect = { x: drop.x, y: drop.y, w: sz.w, h: sz.h };
      pose = { x: drop.x + sz.w / 2, y: drop.y + sz.h / 2, angle: t.rot ? 0 : Math.PI / 2 };
    }
    const target = drop.slotId ? OBJ_BY_ID[loc.lot.objects.find((x) => x.id === drop.slotId)!.defId]?.name : 'open floor';
    const swap = drop.swap ? ctx.state.vehicles.find((x) => x.id === drop.swap) : undefined;
    return {
      ...pose, rect, color: v.colorHex, body: v.body, ok: drop.ok, warn: !!swap,
      label: drop.ok ? `${vehicleName(v)} → ${target}${swap ? ` (swaps with the ${swap.model})` : ''}` : drop.reason ?? 'Does not fit',
    };
  };

  const paintRect = (): { x0: number; y0: number; x1: number; y1: number } | null => {
    const t = ui.tool;
    if (!ui.build || t.kind !== 'paint' || !t.start) return null;
    const end = t.end ?? t.start;
    return { x0: Math.min(t.start.x, end.x), y0: Math.min(t.start.y, end.y), x1: Math.max(t.start.x, end.x), y1: Math.max(t.start.y, end.y) };
  };
  const paintPreview = (): PaintPreview | null => {
    const r = paintRect();
    if (!r || ui.tool.kind !== 'paint') return null;
    const code = ui.tool.code;
    const cost = zoneCost(loc.lot, r.x0, r.y0, r.x1, r.y1, code);
    const w = r.x1 - r.x0 + 1;
    const hh = r.y1 - r.y0 + 1;
    return { ...r, code, ok: cost <= ctx.state.cash, label: `${ZONE_BY_CODE[code].name} ${w}×${hh} m · ${code === '.' ? 'clear' : money(cost)}` };
  };
  /** Area bulldoze and create-room rectangles (tiles). */
  const dragRect = (): { x0: number; y0: number; x1: number; y1: number } | null => {
    const t = ui.tool;
    if (!ui.build || (t.kind !== 'area' && t.kind !== 'room') || !t.start) return null;
    const end = t.end ?? t.start;
    return { x0: Math.min(t.start.x, end.x), y0: Math.min(t.start.y, end.y), x1: Math.max(t.start.x, end.x), y1: Math.max(t.start.y, end.y) };
  };
  const areaIds = (): string[] => {
    const r = dragRect();
    return r && ui.tool.kind === 'area' ? objectsInRect(loc.lot, r.x0, r.y0, r.x1, r.y1).map((o) => o.id) : [];
  };
  const areaPreview = (): RectPreview | null => {
    const r = dragRect();
    if (!r || ui.tool.kind !== 'area') return null;
    const plan = bulldozePlan(ctx.state, loc, areaIds());
    return { ...r, ok: plan.items.length > 0, label: plan.items.length ? `💥 ${plan.items.length} object${plan.items.length === 1 ? '' : 's'} · +${money(plan.refund)} back` : 'Nothing to bulldoze here' };
  };
  const roomPreview = (): RectPreview | null => {
    const r = dragRect();
    if (!r || ui.tool.kind !== 'room') return null;
    const w = r.x1 - r.x0 + 1;
    const hh = r.y1 - r.y0 + 1;
    const sug = suggestRoom(loc.lot, r.x0, r.y0, r.x1, r.y1);
    return { ...r, ok: w * hh >= 4, label: `Room ${w}×${hh} m${sug ? ` · looks like a ${ZONE_BY_CODE[sug].name.toLowerCase()}` : ''}` };
  };
  const bulldozePreview = (): { ids: string[]; label?: string } | null => {
    if (!ui.build) return null;
    if (ui.tool.kind === 'area') { const ids = areaIds(); return ids.length ? { ids } : null; }
    if (ui.tool.kind !== 'bulldoze' || !bullHover) return null;
    const o = loc.lot.objects.find((x) => x.id === bullHover);
    if (!o) return null;
    const plan = bulldozePlan(ctx.state, loc, [o.id]);
    return { ids: [o.id], label: `${OBJ_BY_ID[o.defId]?.name} · +${money(plan.refund)}` };
  };
  const stampAt = (): { x: number; y: number } | null => {
    const t = ui.tool;
    if (t.kind !== 'stamp') return null;
    if (t.x !== undefined && t.y !== undefined) return { x: t.x, y: t.y };
    if (!hover) return null;
    const tpl = ROOM_TEMPLATE_BY_ID[t.templateId];
    const w = t.rot ? tpl.h : tpl.w;
    const hh = t.rot ? tpl.w : tpl.h;
    return { x: Math.round(hover.x - w / 2), y: Math.round(hover.y - hh / 2) };
  };
  const stampGhost = (): StampGhost | null => {
    const t = ui.tool;
    if (!ui.build || t.kind !== 'stamp') return null;
    const at = stampAt();
    if (!at) return null;
    const c = stampCheck(ctx.state, loc, t.templateId, at.x, at.y, t.rot);
    const tpl = ROOM_TEMPLATE_BY_ID[t.templateId];
    return { plan: c.plan, x: at.x, y: at.y, ok: c.ok, label: c.ok ? `✓ ${tpl.name} · ${money(c.cost)}${c.skipped.length ? ` · ${c.skipped.length} locked` : ''}` : `✕ ${c.reason}` };
  };
  const commitStamp = (): void => {
    const t = ui.tool;
    const at = stampAt();
    if (t.kind !== 'stamp' || !at) return;
    const tpl = ROOM_TEMPLATE_BY_ID[t.templateId];
    const r = track(`Place ${tpl.name.toLowerCase()}`, () => stampTemplate(ctx.state, loc, t.templateId, at.x, at.y, t.rot));
    feedback(r);
    if (r.ok) { toast(r.message, 'good'); ui.tool = { kind: 'select' }; collapsePalette(false); }
    afterChange();
  };
  const tileAt = (p: { x: number; y: number }): { x: number; y: number } => ({ x: Math.max(0, Math.min(loc.lot.w - 1, Math.floor(p.x))), y: Math.max(0, Math.min(loc.lot.h - 1, Math.floor(p.y))) });

  const feedback = (r: { ok: boolean; message: string }, sound: 'buy' | 'click' = 'buy'): void => {
    if (r.ok) { play(sound); haptic(10); } else { toast(r.message, 'bad'); play('error'); }
  };

  const commitPlace = (): void => {
    const t = ui.tool;
    const gh = ghost();
    if (!gh || (t.kind !== 'place' && t.kind !== 'move')) return;
    const def = OBJ_BY_ID[t.defId];
    if (!gh.ok) {
      toast(gh.label ?? 'Cannot build here.', 'bad');
      play('error');
      if (t.kind === 'move' && t.dragging) { ui.tool = pickReturn ? { kind: 'pick' } : { kind: 'select' }; if (!pickReturn) select({ kind: 'object', id: t.objId }); pickReturn = false; }
      return;
    }
    if (t.kind === 'place') {
      const r = track(`Place ${def.name.toLowerCase()}`, () => placeObject(ctx.state, loc, t.defId, gh.x, gh.y, gh.rot));
      feedback(r);
      if (r.ok) placedFx(def.name, gh.x + (gh.rot ? def.h : def.w) / 2, gh.y + (gh.rot ? def.w : def.h) / 2);
      // Stay in the tool so rows of spaces are quick to lay out; on a phone the
      // next preview waits on a free spot, and Cancel becomes Done.
      const next: Tool = { kind: 'place', defId: t.defId, rot: t.rot, placed: (t.placed ?? 0) + (r.ok ? 1 : 0) };
      if (isPhone() && next.kind === 'place') {
        const spot = findSpot(ctx.state, loc, t.defId);
        if (spot && ctx.state.cash >= def.cost) { next.x = spot.x; next.y = spot.y; next.rot = spot.rot; }
      }
      ui.tool = next;
    } else {
      const r = track(`Move ${def.name.toLowerCase()}`, () => moveObject(ctx.state, loc, t.objId, gh.x, gh.y, gh.rot));
      feedback(r, 'click');
      ui.tool = pickReturn ? { kind: 'pick' } : { kind: 'select' };
      if (r.ok && !pickReturn) select({ kind: 'object', id: t.objId });
      pickReturn = false;
    }
    afterChange();
  };
  /** A short "placed" label that rises from what was just built. */
  const placedFx = (name: string, x: number, y: number): void => {
    floaters.push({ text: `✓ ${name}`, x, y, born: time, tone: '#2fd18b' });
  };
  const commitLine = (): void => {
    const t = ui.tool;
    if (t.kind !== 'place' || !t.line) return;
    const def = OBJ_BY_ID[t.defId];
    const { x0, y0, x1, y1 } = t.line;
    t.line = undefined;
    const r = track(`Build ${def.name.toLowerCase()}`, () => placeLine(ctx.state, loc, t.defId, x0, y0, x1, y1));
    feedback(r);
    if (r.ok) toast(r.message, 'good');
    afterChange();
  };
  const commitPaint = (): void => {
    const r = paintRect();
    if (!r || ui.tool.kind !== 'paint') return;
    const code = ui.tool.code;
    feedback(track(`Paint ${ZONE_BY_CODE[code].name.toLowerCase()}`, () => paintZone(ctx.state, loc, r.x0, r.y0, r.x1, r.y1, code)));
    ui.tool = { kind: 'paint', code };
    afterChange();
  };
  const commitCar = (): void => {
    const t = ui.tool;
    if (t.kind !== 'car') return;
    const g = carGhost();
    const v = ctx.state.vehicles.find((x) => x.id === t.vehicleId);
    const cx = t.dragging || t.cx === undefined ? hover?.x : t.cx;
    const cy = t.dragging || t.cy === undefined ? hover?.y : t.cy;
    ui.tool = { kind: 'select' };
    if (!g || !v || cx === undefined || cy === undefined) { paintBuild(); return; }
    if (!g.ok) { toast(g.label, 'bad'); play('error'); paintBuild(); return; }
    const r = track(`Move ${vehicleName(v)}`, () => placeVehicle(ctx.state, loc, v.id, cx, cy, t.rot, snapOn()));
    feedback(r, 'click');
    if (r.ok && r.message !== 'Parked.' && r.message !== 'Moved.') toast(r.message, 'info');
    afterChange();
  };
  const cancelTool = (): void => {
    ui.tool = pickReturn ? { kind: 'pick' } : { kind: 'select' };
    pickReturn = false;
    bullHover = null;
    paintBuild();
  };
  const rotateTool = (): void => {
    const t = ui.tool;
    if (t.kind === 'place' || t.kind === 'move' || t.kind === 'car' || t.kind === 'stamp') { t.rot = t.rot ? 0 : 1; paintConfirm(); return; }
    if (ui.build && ui.selected?.kind === 'object') rotateObject(ui.selected.id);
  };
  const rotateObject = (id: string): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    const def = OBJ_BY_ID[o.defId];
    const r = track(`Rotate ${def.name.toLowerCase()}`, () => moveObject(ctx.state, loc, o.id, o.x, o.y, o.rot ? 0 : 1));
    feedback(r, 'click');
    afterChange();
  };
  /**
   * "Bulldoze this object?" — shows what it cost, what comes back and what
   * it would break, then demolishes through undo history.
   */
  const confirmBulldoze = (ids: string[], rect?: { x0: number; y0: number; x1: number; y1: number }): void => {
    const plan = bulldozePlan(ctx.state, loc, ids);
    if (!plan.items.length && !rect) { toast('Nothing to bulldoze here.', 'info'); return; }
    const one = plan.items.length === 1 ? plan.items[0] : null;
    const title = one ? `Bulldoze this ${one.def.name.toLowerCase()}?` : `Bulldoze ${plan.items.length} objects?`;
    const { body, footer, close } = modal({ title, sub: one ? `${one.def.icon} ${one.def.name}${(one.o.level ?? 1) > 1 ? ` · level ${one.o.level}` : ''} · condition ${one.refund.condition}%` : 'Everything marked red on the map', width: 440 });
    const row = (k: string, v: string, cls = ''): HTMLElement => h('div', { class: 'bz-row' }, h('span', { text: k }), h('strong', { class: cls, text: v }));
    body.appendChild(h('div', { class: 'bz-table', data: { bz: 'table' } },
      row('Build cost', money(plan.build)),
      plan.upgrades ? row('Upgrades', money(plan.upgrades)) : null,
      row(`Refund${one ? ` (${Math.round(one.refund.rate * 100)}%)` : ''}`, `+${money(plan.refund)}`, 'good'),
      row('Net cost', money(plan.net), 'bad')));
    if (!one && plan.items.length) {
      const counts = new Map<string, number>();
      for (const it of plan.items) counts.set(it.def.name, (counts.get(it.def.name) ?? 0) + 1);
      body.appendChild(h('p', { class: 'tiny muted', text: [...counts.entries()].slice(0, 8).map(([n, c]) => `${c}× ${n}`).join(' · ') + (counts.size > 8 ? ' …' : '') }));
    }
    for (const w of plan.warnings) body.appendChild(h('div', { class: `bz-warn ${w.level}`, text: `${w.level === 'required' ? '⛔' : '⚠️'} ${w.text}` }));
    let clear = false;
    if (rect) {
      const cb = h('input', { type: 'checkbox', data: { bz: 'clear' } });
      cb.addEventListener('change', () => { clear = cb.checked; });
      body.appendChild(h('label', { class: 'bz-clear' }, cb, h('span', { text: 'Also clear the floor (rooms back to bare land, 30% salvage)' })));
    }
    body.appendChild(h('p', { class: 'tiny muted', text: 'Changed your mind later? Undo (Ctrl+Z) puts it back and returns the money.' }));
    footer.appendChild(h('button', { class: 'btn', data: { bz: 'cancel' }, on: { click: close } }, 'Cancel'));
    footer.appendChild(h('button', { class: 'btn danger', data: { bz: 'confirm' }, on: {
      click: () => {
        close();
        const label = one ? `Bulldoze ${one.def.name.toLowerCase()}` : `Bulldoze ${plan.items.length} objects`;
        const r = track(label, () => bulldoze(ctx.state, loc, ids, clear ? rect : undefined));
        feedback(r, 'click');
        if (r.ok) { toast(r.message, 'good'); haptic(30); ui.selected = null; closePop(); bullHover = null; }
        if (ui.tool.kind === 'area') ui.tool = { kind: 'area' };
        afterChange();
      },
    } }, plan.required ? 'Bulldoze anyway' : one ? 'Bulldoze' : 'Confirm'));
  };
  const deleteObject = async (id: string): Promise<void> => { confirmBulldoze([id]); };
  const duplicate = (id: string): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    const def = OBJ_BY_ID[o.defId];
    if (!def || def.hidden) return;
    // The copy follows the cursor (or starts next to the original on a phone); tap to place it.
    const spot = isPhone() ? duplicateSpot(ctx.state, loc, id) : undefined;
    ui.tool = { kind: 'place', defId: o.defId, rot: o.rot, x: spot?.x, y: spot?.y };
    ui.selected = null;
    closePop();
    toast(`Copy of ${def.name}: ${isPhone() ? 'drag it where you want and tap Place' : 'click where it should go'}.`, 'info');
    paintBuild();
  };
  const upgrade = (id: string): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    const info = upgradeInfo(o);
    const def = OBJ_BY_ID[o.defId];
    const r = track(`Upgrade ${def.name.toLowerCase()}`, () => upgradeObject(ctx.state, loc, id));
    feedback(r);
    if (r.ok) toast(`${r.message}${info.next ? ` ${info.next.text}` : ''}`, 'good');
    afterChange();
    if (r.ok) select({ kind: 'object', id });
  };
  const buyLandHere = async (): Promise<void> => {
    const np = nextPlot(ctx.state, loc);
    if (!np) return;
    if (ctx.state.companyLevel < np.minLevel) { toast(`The ${np.name.toLowerCase()} needs company level ${np.minLevel}.`, 'bad'); return; }
    if (!(await confirmDialog(`${np.icon} Expand to ${np.name}?`, `${np.w} × ${np.h} m for ${money(np.cost)}. Everything you built stays where it is.`, 'Expand dealership'))) return;
    const oldW = loc.lot.w;
    const oldH = loc.lot.h;
    const r = track('Buy land', () => buyLand(ctx.state, loc));
    ctx.act(r, { sound: 'buy' });
    if (!r.ok) return;
    const dy = loc.lot.h - oldH;
    cam.y += dy;
    cam.clamp();
    setBounds();
    saveCam();
    crowd.reset();
    expandFx = { start: time, oldW, dy };
    haptic(40);
    afterChange();
  };
  let clipboard: { defId: string; rot: 0 | 1 } | null = null;
  const copy = (id: string): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    clipboard = { defId: o.defId, rot: o.rot };
    toast(`Copied: ${OBJ_BY_ID[o.defId].name}. Ctrl+V to place another.`, 'info');
  };
  const paste = (): void => {
    if (!clipboard) return;
    if (!ui.build) enterBuild(undefined, false);
    ui.tool = { kind: 'place', defId: clipboard.defId, rot: clipboard.rot };
    ui.selected = null;
    closePop();
    paintBuild();
  };
  const historyStep = (run: () => { ok: boolean; message: string }): void => {
    const h0 = loc.lot.h;
    const r = run();
    ctx.act(r);
    warnCache.clear();
    loc = activeLocation(ctx.state);
    if (loc.lot.h !== h0) { cam.y += loc.lot.h - h0; setBounds(); cam.clamp(); saveCam(); crowd.reset(); }
    afterChange();
  };
  const undoAct = (): void => historyStep(() => undo(ctx.state));
  const redoAct = (): void => historyStep(() => redo(ctx.state));

  const afterChange = (): void => {
    // The layout changed: re-home cars and staff, then redraw the chrome.
    ctx.refresh();
  };

  // ------------------------------------------------------------- hit test --
  const vehicleAt = (p: { x: number; y: number }): Vehicle | undefined => {
    for (const v of ctx.state.vehicles) {
      if (v.locationId !== loc.id || !v.slotId || crowd.away.has(v.id)) continue;
      if (v.status !== 'yard' && v.status !== 'listed' && v.status !== 'prep') continue;
      const pose = carPose(loc, v.slotId, time);
      if (!pose) continue;
      const dx = p.x - pose.x;
      const dy = p.y - pose.y;
      const lx = dx * Math.cos(-pose.angle) - dy * Math.sin(-pose.angle);
      const ly = dx * Math.sin(-pose.angle) + dy * Math.cos(-pose.angle);
      if (Math.abs(lx) < 2.2 && Math.abs(ly) < 1.05) return v;
    }
    return undefined;
  };
  const objectAt = (p: { x: number; y: number }, slotsToo = true): string | undefined => {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    // Smallest thing first, so a plant on a rug is picked over the rug.
    const hits = loc.lot.objects.filter((o) => {
      const def = OBJ_BY_ID[o.defId];
      if (!def || def.hidden) return false;
      const f = footprint(o);
      return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h && (slotsToo || !def.slot);
    }).sort((a, b) => footprint(a).w * footprint(a).h - footprint(b).w * footprint(b).h);
    return hits[0]?.id;
  };

  // -------------------------------------------------------------- gestures --
  type Gesture = 'none' | 'pan' | 'pinch' | 'paint' | 'ghost' | 'ghostTap' | 'line' | 'pressObj' | 'pressCar' | 'dragObj' | 'dragCar' | 'armCar';
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; type: string }>();
  let gesture: Gesture = 'none';
  let pressId = '';
  let pressAt = { x: 0, y: 0 };
  let moved = false;
  let downAt = 0;
  let longTimer = 0;
  let longFired = false;
  let pinch = { d: 0, mx: 0, my: 0 };
  let hoverTimer = 0;
  let hoverKey = '';
  const local = (e: PointerEvent | MouseEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Starts dragging a fixture from where it stands (grab point is kept). */
  const beginObjectDrag = (id: string, at: { x: number; y: number }): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    const f = footprint(o);
    ui.tool = { kind: 'move', objId: id, defId: o.defId, rot: o.rot, x: o.x, y: o.y, grab: { dx: at.x - f.x, dy: at.y - f.y }, dragging: true };
    ui.selected = { kind: 'object', id };
    closePop();
    hideTipNow();
    paintConfirm();
  };
  let carAim = false;
  const beginCarDrag = (id: string): void => {
    carAim = false;
    const v = ctx.state.vehicles.find((x) => x.id === id);
    if (!v || (v.status !== 'yard' && v.status !== 'listed')) {
      if (v?.status === 'prep') toast('That car is booked in for work.', 'info');
      return;
    }
    const o = v.slotId ? loc.lot.objects.find((x) => x.id === v.slotId) : undefined;
    const f = o ? footprint(o) : null;
    ui.tool = { kind: 'car', vehicleId: id, rot: f && f.w > f.h ? 1 : 0, dragging: true };
    ui.selected = null;
    closePop();
    hideTipNow();
    haptic(15);
    paintConfirm();
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button === 2) return;
    canvas.setPointerCapture?.(e.pointerId);
    hideTipNow();
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType });
    if (pointers.size === 2) {
      window.clearTimeout(longTimer);
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      // A second finger means "zoom": unfinished strokes and drags are dropped.
      const t = ui.tool;
      if (gesture === 'paint' && (t.kind === 'paint' || t.kind === 'area' || t.kind === 'room')) { t.start = undefined; t.end = undefined; }
      if (gesture === 'line' && t.kind === 'place') t.line = undefined;
      if ((gesture === 'dragObj' && t.kind === 'move') || (gesture === 'dragCar' && t.kind === 'car')) ui.tool = { kind: 'select' };
      gesture = 'pinch';
      moved = true;
      return;
    }
    moved = false;
    longFired = false;
    // Working on the map takes the keyboard back from the search box, so R, Delete and Ctrl+Z work at once.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body && (focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement || focused instanceof HTMLTextAreaElement)) focused.blur();
    downAt = performance.now();
    const w = cam.toWorld(p.x, p.y);
    hover = w;
    gesture = 'pan';
    const t = ui.tool;
    if (ui.build && e.button === 0) {
      if (t.kind === 'move' && t.dragging && e.pointerType === 'mouse') {
        // A picked-up fixture follows the mouse: the click drops it.
        gesture = 'dragObj';
      } else if (t.kind === 'area' || t.kind === 'room') {
        const tile = tileAt(w);
        t.start = tile;
        t.end = tile;
        gesture = 'paint';
      } else if (t.kind === 'stamp') {
        if (e.pointerType !== 'mouse') { gesture = 'ghost'; moveStampTo(w); }
      } else if (t.kind === 'pick') {
        const obj = objectAt(w, false) ?? objectAt(w);
        if (obj && OBJ_BY_ID[loc.lot.objects.find((o) => o.id === obj)?.defId ?? '']) { gesture = 'pressObj'; pressId = obj; pressAt = w; pickReturn = true; }
      } else if (t.kind === 'paint') {
        const tile = tileAt(w);
        t.start = tile;
        t.end = tile;
        gesture = 'paint';
      } else if (t.kind === 'place' && OBJ_BY_ID[t.defId]?.line) {
        const tile = tileAt(w);
        t.line = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y };
        gesture = 'line';
      } else if ((t.kind === 'place' || t.kind === 'move') && (e.pointerType !== 'mouse' || t.x !== undefined)) {
        // Touch: press on the preview and drag it with your finger (it keeps
        // where you grabbed it); press elsewhere to pan, tap elsewhere to move it there.
        const def = OBJ_BY_ID[t.defId];
        const ww = t.rot ? def.h : def.w;
        const hh = t.rot ? def.w : def.h;
        const onGhost = t.x === undefined || t.y === undefined || e.pointerType === 'mouse'
          || (w.x >= t.x - 0.8 && w.x <= t.x + ww + 0.8 && w.y >= t.y - 0.8 && w.y <= t.y + hh + 0.8);
        if (onGhost) {
          gesture = 'ghost';
          ghostGrab = t.x !== undefined && t.y !== undefined && e.pointerType !== 'mouse' ? { dx: w.x - (t.x + ww / 2), dy: w.y - (t.y + hh / 2) } : null;
          if (!ghostGrab) moveGhostTo(w);
        } else gesture = 'ghostTap';
      } else if (t.kind === 'car') {
        // A finger aims the ghost and the bar confirms; the mouse drops on release.
        t.dragging = true;
        carAim = e.pointerType !== 'mouse';
        gesture = 'dragCar';
      } else if (t.kind === 'select') {
        const v = vehicleAt(w);
        const obj = v ? undefined : objectAt(w, false) ?? objectAt(w);
        if (v) { gesture = 'pressCar'; pressId = v.id; } else if (obj) { gesture = 'pressObj'; pressId = obj; }
        pressAt = w;
      }
    } else if (!ui.build && e.button === 0 && !ui.moveCar) {
      const v = vehicleAt(w);
      if (v) { gesture = e.pointerType === 'mouse' ? 'pressCar' : 'pan'; pressId = v.id; pressAt = w; }
    }
    window.clearTimeout(longTimer);
    longTimer = window.setTimeout(() => {
      if (moved || pointers.size !== 1 || gesture === 'paint' || gesture === 'ghost' || gesture === 'line' || gesture === 'dragObj' || gesture === 'dragCar' || (ui.build && ui.tool.kind !== 'select')) return;
      longFired = true;
      onLongPress(w);
    }, 480);
  };
  const moveStampTo = (w: { x: number; y: number }): void => {
    const t = ui.tool;
    if (t.kind !== 'stamp') return;
    const tpl = ROOM_TEMPLATE_BY_ID[t.templateId];
    t.x = Math.round(w.x - (t.rot ? tpl.h : tpl.w) / 2);
    t.y = Math.round(w.y - (t.rot ? tpl.w : tpl.h) / 2);
    paintConfirm();
  };
  let ghostGrab: { dx: number; dy: number } | null = null;
  const moveGhostTo = (at: { x: number; y: number }): void => {
    const w = ghostGrab ? { x: at.x - ghostGrab.dx, y: at.y - ghostGrab.dy } : at;
    const t = ui.tool;
    if (t.kind === 'stamp') { moveStampTo(w); return; }
    if (t.kind !== 'place' && t.kind !== 'move') return;
    const def = OBJ_BY_ID[t.defId];
    const ww = t.rot ? def.h : def.w;
    const hh = t.rot ? def.w : def.h;
    t.x = Math.round(w.x - ww / 2);
    t.y = Math.round(w.y - hh / 2);
    paintConfirm();
  };
  const onMove = (e: PointerEvent): void => {
    const p = local(e);
    const rec = pointers.get(e.pointerId);
    if (!rec) {
      // Mouse hover: the ghost follows the cursor, and a tooltip explains what is under it.
      hover = cam.toWorld(p.x, p.y);
      canvas.style.cursor = ui.build ? (ui.tool.kind === 'select' ? (objectAt(hover) || vehicleAt(hover) ? 'grab' : 'default') : 'crosshair') : hoverCursor(hover);
      if (ui.tool.kind === 'car' || (ui.tool.kind === 'place' && !ui.tool.line) || ui.tool.kind === 'stamp') paintConfirm();
      if (ui.build && ui.tool.kind === 'bulldoze') {
        const obj = objectAt(hover, false) ?? objectAt(hover);
        if (obj !== bullHover) { bullHover = obj ?? null; paintConfirm(); }
        canvas.style.cursor = obj ? 'pointer' : 'not-allowed';
      }
      if (ui.build && ui.tool.kind === 'pick') canvas.style.cursor = objectAt(hover) ? 'grab' : 'default';
      if (inLocked(hover)) canvas.style.cursor = 'pointer';
      scheduleHoverTip(e, hover);
      return;
    }
    const dxs = p.x - rec.x;
    const dys = p.y - rec.y;
    rec.x = p.x;
    rec.y = p.y;
    if (Math.hypot(p.x - rec.sx, p.y - rec.sy) > (rec.type === 'mouse' ? 4 : 9)) moved = true;
    hover = cam.toWorld(p.x, p.y);
    if (gesture === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (pinch.d > 0) cam.zoomAt(d / pinch.d, mx, my);
      cam.panBy(mx - pinch.mx, my - pinch.my);
      pinch = { d, mx, my };
      saveCam();
      return;
    }
    if (gesture === 'armCar' && moved) { beginCarDrag(pressId); gesture = 'dragCar'; return; }
    if (!moved) return;
    if (gesture === 'pressObj') { beginObjectDrag(pressId, pressAt); gesture = 'dragObj'; return; }
    if (gesture === 'pressCar') { beginCarDrag(pressId); gesture = ui.tool.kind === 'car' ? 'dragCar' : 'pan'; return; }
    if (gesture === 'paint' && (ui.tool.kind === 'paint' || ui.tool.kind === 'area' || ui.tool.kind === 'room')) { ui.tool.end = tileAt(hover); paintConfirm(); return; }
    if (gesture === 'line' && ui.tool.kind === 'place' && ui.tool.line) {
      const tile = tileAt(hover);
      ui.tool.line.x1 = tile.x;
      ui.tool.line.y1 = tile.y;
      return;
    }
    if (gesture === 'ghost') { moveGhostTo(hover); return; }
    if (gesture === 'ghostTap') { cam.panBy(dxs, dys); saveCam(); return; }
    if (gesture === 'dragObj' || gesture === 'dragCar') {
      edgePan(p);
      return;
    }
    if (gesture === 'pan') {
      cam.panBy(dxs, dys);
      saveCam();
    }
  };
  /** Dragging something towards the edge of the screen scrolls the view. */
  const edgePan = (p: { x: number; y: number }): void => {
    const m = 36;
    const s = 6;
    let dx = 0;
    let dy = 0;
    if (p.x < m) dx = s; else if (p.x > cam.width - m) dx = -s;
    if (p.y < m) dy = s; else if (p.y > cam.height - m) dy = -s;
    if (dx || dy) { cam.panBy(dx, dy); saveCam(); }
  };
  const onUp = (e: PointerEvent): void => {
    const rec = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    window.clearTimeout(longTimer);
    if (!rec) return;
    if (gesture === 'pinch') {
      if (pointers.size === 0) gesture = 'none';
      return;
    }
    const p = local(e);
    const w = cam.toWorld(p.x, p.y);
    hover = w;
    const g = gesture;
    gesture = 'none';
    if (g === 'paint') {
      if (ui.tool.kind === 'area') {
        const r = dragRect();
        if (r && rec.type === 'mouse') confirmBulldoze(areaIds(), r);
        paintConfirm();
        return;
      }
      if (ui.tool.kind === 'room') { confirmKey = ''; paintConfirm(); return; }
      if (rec.type === 'mouse') commitPaint();
      else paintConfirm();
      return;
    }
    if (g === 'line') { commitLine(); return; }
    if (g === 'ghost') {
      if (!moved && rec.type !== 'mouse' && !ghostGrab) moveGhostTo(w);
      ghostGrab = null;
      paintConfirm();
      return;
    }
    if (g === 'ghostTap') {
      if (!moved) { ghostGrab = null; moveGhostTo(w); }
      paintConfirm();
      return;
    }
    if (g === 'dragObj') { commitPlace(); return; }
    if (g === 'dragCar') {
      const t = ui.tool;
      if (carAim && t.kind === 'car') { t.dragging = false; t.cx = w.x; t.cy = w.y; carAim = false; paintConfirm(); return; }
      commitCar();
      return;
    }
    if (g === 'armCar') { startMoveCar(pressId); return; }
    if (longFired || moved || performance.now() - downAt > 700) return;
    onTap(w, rec.type);
  };
  const hoverCursor = (w: { x: number; y: number }): string => {
    if (ui.moveCar) return 'crosshair';
    if (vehicleAt(w)) return 'grab';
    if (crowd.hit(w.x, w.y) || objectAt(w, false)) return 'pointer';
    return 'default';
  };

  /** Desktop: hovering over something for a moment shows what it is and does. */
  const scheduleHoverTip = (e: PointerEvent, w: { x: number; y: number }): void => {
    if (e.pointerType !== 'mouse' || ui.tool.kind === 'car' || (ui.tool.kind === 'move' && ui.tool.dragging)) { hideTipNow(); return; }
    const v = vehicleAt(w);
    const obj = v ? undefined : objectAt(w, false) ?? objectAt(w);
    const key = v ? `v:${v.id}` : obj ? `o:${obj}` : '';
    if (key !== hoverKey) {
      hoverKey = key;
      hideTipNow();
      window.clearTimeout(hoverTimer);
      if (!key) return;
      const at = { x: e.clientX, y: e.clientY };
      hoverTimer = window.setTimeout(() => {
        if (hoverKey !== key || pointers.size) return;
        if (v) showTipAt(vehicleInfo(ctx.state, loc, v), at.x, at.y);
        else if (obj) {
          const o = loc.lot.objects.find((x) => x.id === obj);
          if (o) showTipAt(objectInfo(ctx.state, OBJ_BY_ID[o.defId], { loc, o }), at.x, at.y);
        }
      }, 420);
    }
  };

  const onTap = (w: { x: number; y: number }, type: string): void => {
    if (ui.moveCar) {
      // Tap anywhere: a space (swapping if taken) or open floor.
      const v = ctx.state.vehicles.find((x) => x.id === ui.moveCar);
      if (v) {
        const drop = carDropCheck(ctx.state, loc, v.id, w.x, w.y, 0, true);
        if (drop.ok) {
          const r = track(`Move ${vehicleName(v)}`, () => placeVehicle(ctx.state, loc, v.id, w.x, w.y, drop.slotId ? drop.rot : 0, true));
          ctx.act(r);
          if (r.ok) stopMoveCar();
        } else toast(drop.reason ?? 'It does not fit there.', 'bad');
      } else stopMoveCar();
      return;
    }
    if (inLocked(w)) { void buyLandHere(); return; }
    if (ui.build) {
      const t = ui.tool;
      if (t.kind === 'stamp') {
        if (type === 'mouse') { hover = w; commitStamp(); } else moveStampTo(w);
        return;
      }
      if (t.kind === 'bulldoze') {
        const obj = objectAt(w, false) ?? objectAt(w);
        if (obj) { bullHover = obj; confirmBulldoze([obj]); } else toast('Tap something built to bulldoze it.', 'info');
        return;
      }
      if (t.kind === 'pick') {
        const obj = objectAt(w, false) ?? objectAt(w);
        if (!obj) return;
        pickReturn = true;
        if (type === 'mouse') { beginObjectDrag(obj, w); } else startMoveObject(obj);
        return;
      }
      if (t.kind === 'area' || t.kind === 'room') return;
      if (t.kind === 'place' || t.kind === 'move') {
        if (type === 'mouse') { hover = w; commitPlace(); } else moveGhostTo(w);
        return;
      }
      if (t.kind === 'car') {
        if (type === 'mouse') { hover = w; t.dragging = false; t.cx = w.x; t.cy = w.y; commitCar(); } else { t.cx = w.x; t.cy = w.y; t.dragging = false; paintConfirm(); }
        return;
      }
      if (t.kind === 'paint') return;
      const v = vehicleAt(w);
      if (v) { select({ kind: 'vehicle', id: v.id }, w); return; }
      const obj = objectAt(w, false) ?? objectAt(w);
      if (obj) select({ kind: 'object', id: obj }, w);
      else { ui.selected = null; closePop(); }
      return;
    }
    const agent = crowd.hit(w.x, w.y);
    if (agent) { select({ kind: 'agent', id: agent.id }, w); return; }
    const v = vehicleAt(w);
    if (v) { select({ kind: 'vehicle', id: v.id }, w); return; }
    const obj = objectAt(w, false) ?? objectAt(w);
    if (obj) { select({ kind: 'object', id: obj }, w); return; }
    if (w.x >= 0 && w.y >= 0 && w.x < loc.lot.w && w.y < loc.lot.h) {
      const code = zoneAt(loc.lot, Math.floor(w.x), Math.floor(w.y));
      if (code !== 'a' && code !== '.' && code !== 'g') { select({ kind: 'zone', id: code, x: w.x, y: w.y }, w); return; }
    }
    ui.selected = null;
    closePop();
  };
  const onLongPress = (w: { x: number; y: number }): void => {
    haptic(25);
    const v = vehicleAt(w);
    if (v && (v.status === 'yard' || v.status === 'listed')) {
      // Keep holding and drag the car; let go without moving to tap a destination instead.
      pressId = v.id;
      gesture = 'armCar';
      moved = false;
      const rec = [...pointers.values()][0];
      if (rec) { rec.sx = rec.x; rec.sy = rec.y; }
      return;
    }
    const obj = objectAt(w, false) ?? objectAt(w);
    if (!obj) return;
    if (ui.build) select({ kind: 'object', id: obj }, w);
    else startMoveObject(obj);
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    hideTipNow();
    const p = { x: e.offsetX, y: e.offsetY };
    cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    saveCam();
  };
  const onContext = (e: Event): void => {
    e.preventDefault();
    if (gesture === 'dragObj' || gesture === 'dragCar') { gesture = 'none'; ui.tool = { kind: 'select' }; paintBuild(); return; }
    if (ui.build && ui.tool.kind !== 'select') cancelTool();
    else if (ui.moveCar) stopMoveCar();
  };

  // ---------------------------------------------------------- selection --
  const actions: WorldActions = {
    ctx,
    close: () => { ui.selected = null; closePop(); },
    redraw: () => paintPop(),
    select: (sel) => {
      const p = selPoint(sel);
      select(sel, p ?? undefined);
      if (p) centerOn(p.x, p.y);
    },
    moveCar: (id) => {
      if (isPhone()) startMoveCar(id);
      else { if (!ui.build) enterBuild('vehicles', false); ui.tool = { kind: 'car', vehicleId: id, rot: 0 }; ui.selected = null; closePop(); paintBuild(); }
    },
    moveObject: (id) => startMoveObject(id),
    rotateObject: (id) => rotateObject(id),
    deleteObject: (id) => { void deleteObject(id); },
    duplicate: (id) => duplicate(id),
    upgrade: (id) => upgrade(id),
    testDrive: (vehicleId) => openDrive(ctx, { kind: 'stock', vehicleId, locationId: loc.id }),
    driveCustomer: (customerId) => {
      const c = ctx.state.customers.find((x) => x.id === customerId);
      if (c?.vehicleId) openDrive(ctx, { kind: 'customer', vehicleId: c.vehicleId, customerId, locationId: loc.id });
    },
    copy: (id) => copy(id),
    track,
    panel: (id) => openPanel(id as PanelId),
    build: (category) => enterBuild(category),
    animateTestDrive: (v) => crowd.testDrive(loc, v),
  };
  const selPoint = (sel: Selection): { x: number; y: number } | null => {
    if (!sel) return null;
    if (sel.kind === 'vehicle') {
      const v = ctx.state.vehicles.find((x) => x.id === sel.id);
      return v?.slotId ? carPose(loc, v.slotId, time) : null;
    }
    if (sel.kind === 'agent') {
      const a = crowd.agents.get(sel.id);
      return a ? { x: a.x, y: a.y } : null;
    }
    if (sel.kind === 'object') {
      const o = loc.lot.objects.find((x) => x.id === sel.id);
      if (!o) return null;
      const f = footprint(o);
      return { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    }
    return sel.x !== undefined && sel.y !== undefined ? { x: sel.x, y: sel.y } : null;
  };
  const select = (sel: Selection, at?: { x: number; y: number }): void => {
    ui.selected = sel;
    play('click');
    popAnchor = at ?? selPoint(sel);
    paintPop();
  };
  let popKey = '';
  let popExpanded = false;
  const closePop = (): void => {
    popAnchor = null;
    popKey = '';
    pop.replaceChildren();
    pop.classList.remove('open', 'sheet');
    releasePop?.();
    releasePop = null;
  };
  const paintPop = (): void => {
    const content = entityMenu(actions, ui.selected);
    if (!content) { closePop(); return; }
    const sheet = isPhone();
    // Phones: a compact contextual card (what it is, its key line, its actions);
    // "Manage" opens the full details in the same sheet.
    const key = ui.selected ? `${ui.selected.kind}:${'id' in ui.selected ? ui.selected.id : ''}` : '';
    if (key !== popKey) { popKey = key; popExpanded = false; }
    const actionsRow = content.querySelector('.wm-actions');
    if (sheet && actionsRow && content.querySelector('.wm-facts, .wm-info, .wm-desc, .mini-plan, .wm-levels')) {
      actionsRow.insertBefore(h('button', {
        class: `btn small wm-manage${popExpanded ? ' on' : ''}`, data: { act: 'manage' }, aria: { expanded: String(popExpanded) },
        on: { click: () => { popExpanded = !popExpanded; haptic(6); paintPop(); } },
      }, icon(popExpanded ? 'close' : 'more', 14), popExpanded ? 'Less' : 'Manage'), actionsRow.firstChild);
    }
    pop.replaceChildren(h('button', { class: 'icon-btn wm-close', aria: { label: 'Close' }, on: { click: () => actions.close() } }, icon('close', 14)), content);
    pop.classList.add('open');
    pop.classList.toggle('sheet', sheet);
    pop.classList.toggle('compact', sheet && !popExpanded);
    if (!releasePop) releasePop = pushBackHandler(() => { ui.selected = null; closePop(); return true; });
    if (!sheet) placePop();
  };
  const placePop = (): void => {
    if (!popAnchor) return;
    const p = cam.toScreen(popAnchor.x, popAnchor.y);
    const w = pop.offsetWidth || 320;
    const hh = pop.offsetHeight || 200;
    const rightLimit = cam.width - (ui.panel && ui.panel !== 'time' ? 460 : 12);
    let x = p.x + 26;
    if (x + w > rightLimit) x = p.x - w - 26;
    x = Math.max(ui.build && !isPhone() ? 344 : 12, Math.min(rightLimit - w, x));
    const y = Math.max(64, Math.min(cam.height - hh - 90, p.y - hh / 2));
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  // ------------------------------------------------------------ move modes --
  const startMoveCar = (id: string): void => {
    ui.moveCar = id;
    ui.selected = null;
    closePop();
    const v = ctx.state.vehicles.find((x) => x.id === id);
    banner.replaceChildren(h('span', { text: `Tap where the ${v ? vehicleName(v) : 'car'} should go: a space (green is free, yellow swaps) or open floor.` }), h('button', { class: 'btn small', on: { click: () => stopMoveCar() } }, 'Cancel'));
    banner.classList.add('open');
    releaseMove?.();
    releaseMove = pushBackHandler(() => { stopMoveCar(); return true; });
  };
  const stopMoveCar = (): void => {
    ui.moveCar = null;
    banner.classList.remove('open');
    banner.replaceChildren();
    releaseMove?.();
    releaseMove = null;
  };
  const startMoveObject = (id: string): void => {
    const o = loc.lot.objects.find((x) => x.id === id);
    if (!o) return;
    if (!ui.build) enterBuild(undefined, false);
    ui.tool = { kind: 'move', objId: id, defId: o.defId, rot: o.rot, x: o.x, y: o.y };
    ui.selected = null;
    closePop();
    paintBuild();
  };

  // ---------------------------------------------------------------- build --
  const enterBuild = (category?: string, refit = true): void => {
    if (!ui.build) {
      ui.build = true;
      releaseBuild = pushBackHandler(() => {
        if (ui.tool.kind !== 'select') { cancelTool(); return true; }
        exitBuild();
        return true;
      });
    }
    if (category) ui.category = category;
    setGameMode('build');
    closePanel();
    closePop();
    stopMoveCar();
    ui.selected = null;
    root.classList.add('building');
    paintBuild();
    // Keep the lot clear of the palette: refit if part of it sits underneath.
    if (refit && isPhone()) requestAnimationFrame(() => fitLot());
    else if (!isPhone()) {
      const edge = cam.toScreen(0, 0).x;
      if (edge < paletteHost.offsetWidth + 4) fitLot();
    }
  };
  const exitBuild = (): void => {
    ui.build = false;
    ui.tool = { kind: 'select' };
    ui.selected = null;
    root.classList.remove('building');
    setGameMode('play');
    releaseBuild?.();
    releaseBuild = null;
    closePop();
    paintBuild();
    paintActions();
  };

  /** Press on a palette card and drag it onto the map (mouse or finger). */
  const paletteDrag = (e: PointerEvent, what: { defId?: string; vehicleId?: string }): void => {
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const moveH = (ev: PointerEvent): void => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
      const r = canvas.getBoundingClientRect();
      const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom && !(document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest?.('.world-palette');
      if (!started) {
        // A vertical finger swipe on a phone scrolls the list instead.
        if (ev.pointerType !== 'mouse' && Math.abs(ev.clientY - sy) > Math.abs(ev.clientX - sx) && !over) { cleanup(); return; }
        started = true;
        hideTipNow();
        if (what.vehicleId) ui.tool = { kind: 'car', vehicleId: what.vehicleId, rot: 0, dragging: true };
        else if (what.defId) ui.tool = { kind: 'place', defId: what.defId, rot: 0 };
        ui.selected = null;
        closePop();
        paintConfirm();
        if (isPhone()) collapsePalette(true);
      }
      hover = cam.toWorld(ev.clientX - r.left, ev.clientY - r.top);
      if (ui.tool.kind === 'place') { ui.tool.x = undefined; ui.tool.y = undefined; }
    };
    const upH = (ev: PointerEvent): void => {
      cleanup();
      if (!started) return;
      const r = canvas.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      const onPalette = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest?.('.world-palette');
      if (!inside || onPalette) { if (ui.tool.kind === 'car') ui.tool = { kind: 'select' }; paintBuild(); return; }
      hover = cam.toWorld(ev.clientX - r.left, ev.clientY - r.top);
      if (ui.tool.kind === 'car') commitCar();
      else if (ui.tool.kind === 'place') commitPlace();
    };
    const cleanup = (): void => {
      document.removeEventListener('pointermove', moveH);
      document.removeEventListener('pointerup', upH);
      document.removeEventListener('pointercancel', cleanup);
    };
    document.addEventListener('pointermove', moveH);
    document.addEventListener('pointerup', upH);
    document.addEventListener('pointercancel', cleanup);
  };

  const paintBuild = (): void => {
    if (!ui.build) {
      paletteHost.replaceChildren();
      buildStrip.replaceChildren();
      confirmBar.replaceChildren();
      confirmBar.classList.remove('open');
      return;
    }
    // Phones: the sheet folds away while placing and comes back when you are done.
    if (ui.tool.kind === 'select' && paletteHost.classList.contains('collapsed')) paletteHost.classList.remove('collapsed');
    paletteHost.dataset.sheet = ui.sheet;
    const scroll = paletteHost.querySelector('.bp-body')?.scrollTop ?? 0;
    const tabsScroll = paletteHost.querySelector('.bp-tabs')?.scrollLeft ?? 0;
    const focused = document.activeElement?.classList.contains('bp-search-input');
    paletteHost.replaceChildren(buildPalette({
      ctx,
      loc: () => loc,
      tool: () => ui.tool,
      setTool: (t) => {
        ui.tool = t; ui.selected = null; bullHover = null; pickReturn = false; closePop();
        // Phones: Move and Remove work on the map, so the sheet drops to its peek.
        if (isPhone()) {
          const onMap = t.kind === 'bulldoze' || t.kind === 'pick' || t.kind === 'area';
          if (onMap && ui.sheet !== 'peek') { sheetBefore = ui.sheet; ui.sheet = 'peek'; } else if (t.kind === 'select' && sheetBefore) { ui.sheet = sheetBefore; sheetBefore = null; }
        }
        // Phones: a new item starts as a live preview on a free spot, with Place ready.
        if (isPhone() && t.kind === 'place' && !OBJ_BY_ID[t.defId]?.line && t.x === undefined) {
          const spot = findSpot(ctx.state, loc, t.defId);
          if (spot) { t.x = spot.x; t.y = spot.y; t.rot = spot.rot; centerOn(spot.x + 0.5, spot.y + 0.5); }
        }
        paintBuild();
        if (isPhone() && t.kind !== 'select' && t.kind !== 'bulldoze' && t.kind !== 'pick' && t.kind !== 'area') collapsePalette(true);
      },
      category: () => ui.category,
      setCategory: (c) => { ui.category = c; collapsePalette(false); paintBuild(); },
      search: () => ui.search,
      setSearch: (q) => { ui.search = q; },
      filter: () => ui.filter,
      setFilter: (f) => { ui.filter = f; },
      styleTarget: () => ui.styleTarget,
      setStyleTarget: (t) => { ui.styleTarget = t; paintBuild(); },
      grid: () => ui.grid,
      toggleGrid: () => { ui.grid = !ui.grid; paintBuild(); },
      snap: () => ui.snap,
      toggleSnap: () => { ui.snap = !ui.snap; paintBuild(); },
      flow: () => ui.flow,
      toggleFlow: () => { ui.flow = !ui.flow; paintBuild(); },
      undo: undoAct,
      redo: redoAct,
      done: () => exitBuild(),
      after: () => afterChange(),
      paletteDrag,
      focus: (x, y) => { centerOn(x, y); if (isPhone()) collapsePalette(true); },
      buyLand: () => { void buyLandHere(); },
      sheet: () => ui.sheet,
      setSheet: (size) => {
        // Resize in place (no rebuild), and swallow the tap's own click: after the
        // sheet moves, something else sits under the finger.
        ui.sheet = size;
        sheetMovedAt = performance.now();
        paletteHost.dataset.sheet = size;
        const pal = paletteHost.querySelector<HTMLElement>('.build-palette');
        if (pal) pal.dataset.sheet = size;
        requestAnimationFrame(() => placeConfirm());
      },
    }));
    const body = paletteHost.querySelector('.bp-body');
    if (body) body.scrollTop = scroll;
    const tabs = paletteHost.querySelector('.bp-tabs');
    if (tabs) tabs.scrollLeft = tabsScroll;
    if (focused) {
      const input = paletteHost.querySelector('.bp-search-input') as HTMLInputElement | null;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    buildStrip.replaceChildren(buildStats(ctx, loc, () => openPanel('lot')));
    paintBuildBar();
    paintConfirm();
  };
  /** The phone build top bar (hidden on wide screens, where the palette has its own head). */
  const paintBuildBar = (): void => {
    const s = ctx.state;
    const placing = ui.tool.kind !== 'select' && ui.tool.kind !== 'pick' && ui.tool.kind !== 'bulldoze' && ui.tool.kind !== 'area';
    const btn = (bt: string, ic: string, label: string, run: () => void, disabled = false, cls = ''): HTMLElement =>
      h('button', { class: `bp-tool wb-btn ${cls}`.trim(), data: { bt }, aria: { label }, title: label, disabled, on: { click: () => { haptic(6); run(); } } }, icon(ic, 18));
    buildBar.replaceChildren(
      h('button', { class: 'wb-back', data: { bt: 'exit' }, aria: { label: placing ? 'Cancel placing' : 'Leave build mode' }, on: { click: () => { haptic(6); if (ui.tool.kind !== 'select') { cancelTool(); collapsePalette(false); } else exitBuild(); } } }, icon('back', 20)),
      h('div', { class: 'wb-title' }, h('span', { class: 'wb-name', text: 'Build' }), h('span', { class: `wb-cash${s.cash < 0 ? ' bad' : ''}`, text: money(s.cash) })),
      btn('undo', 'undo', canUndo(s) ? `Undo: ${undoLabel(s)}` : 'Nothing to undo', undoAct, !canUndo(s), 'wb-undo'),
      btn('redo', 'redo', canRedo(s) ? `Redo: ${redoLabel(s)}` : 'Nothing to redo', redoAct, !canRedo(s), 'wb-redo'),
      btn('more', 'more', 'Build options and site stats', openBuildMore),
      h('button', { class: 'wb-done', data: { bt: 'done' }, aria: { label: 'Done building' }, on: { click: () => { haptic(10); exitBuild(); } } }, icon('check', 17), h('span', { text: 'Done' })));
  };
  /** ⋯ in the build bar: grid, snap, walking routes, camera and the site's numbers. */
  const openBuildMore = (): void => {
    const { body, close } = modal({ title: 'Build options', cls: 'build-more' });
    const toggleRow = (id: string, label: string, sub: string, on: () => boolean, flip: () => void): HTMLElement => {
      const sw = h('button', { class: `tgl${on() ? ' on' : ''}`, data: { bt: id }, role: 'switch', aria: { checked: String(on()), label },
        on: { click: () => { flip(); sw.classList.toggle('on', on()); sw.setAttribute('aria-checked', String(on())); haptic(6); } } }, h('span', { class: 'tgl-knob' }));
      return h('div', { class: 'set-row' }, h('div', { class: 'set-txt' }, h('div', { class: 't-body', text: label }), h('div', { class: 't-secondary', text: sub })), sw);
    };
    body.appendChild(h('div', { class: 'card-m set-list' },
      toggleRow('grid', 'Grid', 'Show the 1 m grid while building', () => ui.grid, () => { ui.grid = !ui.grid; }),
      toggleRow('snap', 'Snap', 'Line items up against walls; cars drop into the nearest space', () => ui.snap, () => { ui.snap = !ui.snap; }),
      toggleRow('flow', 'Walking routes', 'Show where customers can walk', () => ui.flow, () => { ui.flow = !ui.flow; })));
    body.appendChild(h('div', { class: 'btn-grid' },
      h('button', { class: 'btn ghost', on: { click: () => { close(); fitLot(); } } }, icon('locate', 15), 'Fit dealership'),
      h('button', { class: 'btn ghost', on: { click: () => { close(); ui.category = 'land'; ui.sheet = 'half'; paintBuild(); } } }, icon('expand', 15), 'Expand land')));
    body.appendChild(h('div', { class: 't-label', text: 'Site' }));
    body.appendChild(h('div', { class: 'site-stats' }, buildStats(ctx, loc, () => { close(); exitBuild(); openPanel('lot'); })));
  };
  /** On phones the action bar floats just above the (collapsed) build sheet. */
  const placeConfirm = (): void => {
    const side = window.matchMedia('(max-height: 560px) and (orientation: landscape)').matches;
    const above = isPhone() && ui.build && !side && !paletteHost.classList.contains('collapsed');
    confirmBar.style.bottom = above ? `${paletteHost.offsetHeight + 8}px` : '';
  };
  const collapsePalette = (on: boolean): void => { paletteHost.classList.toggle('collapsed', on); placeConfirm(); };
  let confirmKey = '';
  let sheetBefore: SheetSize | null = null;
  let sheetMovedAt = 0;
  paletteHost.addEventListener('click', (e) => {
    if (performance.now() - sheetMovedAt < 350 && !(e.target as HTMLElement).closest('.bp-grip')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  const paintConfirm = (): void => {
    const t = ui.tool;
    if (!ui.build || t.kind === 'select') {
      if (confirmKey || confirmBar.classList.contains('open')) { confirmBar.replaceChildren(); confirmBar.classList.remove('open'); confirmKey = ''; }
      return;
    }
    const phone = isPhone();
    let title = '';
    let glyph: string | null = null;
    let status = '';
    let tone: 'good' | 'warn' | 'bad' | 'info' = 'info';
    let ok = true;
    let doIt: (() => void) | null = null;
    let doLabel = 'Place';
    if (t.kind === 'place' || t.kind === 'move') {
      const def = OBJ_BY_ID[t.defId];
      const gh = ghost();
      glyph = def.icon;
      title = t.kind === 'move' ? `Moving ${def.name}` : `${def.name} · ${money(def.cost)}`;
      if (def.line && t.kind === 'place') status = phone ? 'Drag a line on the map' : 'Drag to draw a line, right-click to stop';
      else if (gh && !gh.ok) { status = gh.label ?? 'Can’t go here'; tone = 'bad'; }
      else if (gh?.warn) { status = gh.label?.split(' — ')[1] ?? gh.label ?? ''; tone = 'warn'; }
      else if (gh && (phone || t.x !== undefined)) { status = t.kind === 'move' ? 'Fits here' : 'Fits here — ready to place'; tone = 'good'; }
      else status = phone ? 'Drag the map to aim, or tap where it should go' : 'Click to place · R rotate · right-click to stop';
      ok = !!gh && gh.ok;
      doIt = gh && !def.line && (phone || t.x !== undefined) && !(t.kind === 'move' && t.dragging) ? commitPlace : null;
      doLabel = t.kind === 'move' ? 'Move here' : 'Place';
    } else if (t.kind === 'car') {
      const g = carGhost();
      const v = ctx.state.vehicles.find((x) => x.id === t.vehicleId);
      title = v ? vehicleName(v) : 'Car';
      status = g ? g.label : phone ? 'Tap where it should stand' : 'Click where it should stand · R rotate';
      ok = !!g && g.ok;
      tone = g ? (g.ok ? 'good' : 'bad') : 'info';
      doIt = g && phone && !t.dragging ? commitCar : null;
      doLabel = 'Park here';
    } else if (t.kind === 'stamp') {
      const sg = stampGhost();
      const tpl = ROOM_TEMPLATE_BY_ID[t.templateId];
      glyph = tpl.icon;
      title = tpl.name;
      status = sg ? sg.label : phone ? 'Tap where it should go' : 'Click to place · R rotate';
      ok = !!sg && sg.ok;
      tone = sg ? (sg.ok ? 'good' : 'bad') : 'info';
      doIt = sg && (phone || t.x !== undefined) ? commitStamp : null;
      doLabel = 'Place';
    } else if (t.kind === 'bulldoze') {
      const b = bulldozePreview();
      title = 'Remove one object';
      status = b?.label ? `${b.label} — ${phone ? 'tap' : 'click'} to bulldoze` : `${phone ? 'Tap' : 'Click'} an object on the map${phone ? '' : ' (Delete also works)'}`;
      tone = b?.label ? 'warn' : 'info';
    } else if (t.kind === 'pick') {
      title = 'Move';
      status = `${phone ? 'Tap' : 'Click'} anything built to pick it up`;
    } else if (t.kind === 'area') {
      const ap = areaPreview();
      title = 'Remove an area';
      status = ap ? ap.label : 'Drag a rectangle over the map';
      ok = !!ap && ap.ok;
      tone = ap ? (ap.ok ? 'warn' : 'bad') : 'info';
      const r = dragRect();
      doIt = ap && ap.ok && r && phone ? () => confirmBulldoze(areaIds(), r) : null;
      doLabel = 'Bulldoze…';
    } else if (t.kind === 'room') {
      const rp = roomPreview();
      title = 'Create room';
      status = rp ? rp.label : 'Drag a rectangle where the room should be';
      ok = !!rp && rp.ok;
      tone = rp ? (rp.ok ? 'good' : 'bad') : 'info';
    } else {
      const pv = paintPreview();
      const z = ZONE_BY_CODE[t.code];
      glyph = z.icon;
      title = z.name;
      status = pv ? pv.label : phone ? 'Drag on the map to paint' : 'Drag to paint';
      ok = !!pv && pv.ok;
      tone = pv ? (pv.ok ? 'good' : 'bad') : 'info';
      doIt = pv && phone ? commitPaint : null;
      doLabel = 'Build';
    }
    const roomRect = t.kind === 'room' && gesture !== 'paint' ? dragRect() : null;
    const key = `${title}|${status}|${tone}|${ok}|${!!doIt}|${doLabel}|${roomRect ? 'r' : ''}|${t.kind === 'place' ? t.placed ?? 0 : ''}`;
    if (key === confirmKey) return;
    confirmKey = key;
    const placing = t.kind === 'place' || t.kind === 'move' || t.kind === 'car' || t.kind === 'stamp';
    confirmBar.classList.toggle('placing', placing || !!doIt);
    confirmBar.replaceChildren(h('div', { class: 'wc-main' },
      glyph ? h('span', { class: 'wc-ic', text: glyph }) : h('span', { class: 'wc-ic' }, icon(t.kind === 'bulldoze' || t.kind === 'area' ? 'trash' : t.kind === 'pick' ? 'move' : t.kind === 'car' ? 'car' : 'hammer', 18)),
      h('div', { class: 'wc-texts' },
        h('span', { class: 'wc-label', text: title }),
        h('span', { class: `wc-status ${tone}` }, tone === 'good' ? icon('check', 13) : tone === 'bad' ? icon('warning', 13) : null, h('span', { text: status })))));
    const btns = h('div', { class: 'wc-btns' });
    if (placing) btns.appendChild(h('button', { class: 'btn wc-rot', title: 'Rotate (R)', aria: { label: 'Rotate' }, data: { cb: 'rotate' }, on: { click: () => { haptic(6); rotateTool(); } } }, icon('rotate', 17), h('span', { text: 'Rotate' })));
    const doneAfter = t.kind === 'place' && (t.placed ?? 0) > 0;
    btns.appendChild(h('button', { class: `btn ghost wc-stop${doneAfter ? ' done' : ''}`, data: { cb: 'stop' }, aria: { label: doneAfter ? 'Done placing' : 'Cancel' }, on: { click: () => { haptic(6); cancelTool(); collapsePalette(false); } } }, icon(doneAfter ? 'check' : 'close', 17), h('span', { text: doneAfter ? 'Done' : phone ? 'Cancel' : 'Stop' })));
    if (doIt) btns.appendChild(h('button', { class: 'btn primary wc-ok', data: { cb: 'ok' }, disabled: !ok, on: { click: () => { haptic(12); doIt!(); } } }, icon('check', 17), h('span', { text: doLabel })));
    if (roomRect) {
      // Which room? The one the furniture suggests comes first.
      const sug = suggestRoom(loc.lot, roomRect.x0, roomRect.y0, roomRect.x1, roomRect.y1);
      const codes = ['s', 'r', 'l', 'o', 'm', 'w', 'd', 'v', 'f', 'e', 'k', 'p', 'b', 'q', 'n', 'u', 't', 'a'] as ZoneCode[];
      const order = sug ? [sug, ...codes.filter((c) => c !== sug)] : codes;
      const chips = h('div', { class: 'wc-rooms scroll-x' }, ...order.map((c) => h('button', {
        class: `btn small${c === sug ? ' primary' : ''}`, data: { roomtype: c }, title: ZONE_BY_CODE[c].description,
        on: { click: () => {
          const code = c;
          const r = track(`Create ${ZONE_BY_CODE[c].name.toLowerCase()}`, () => createRoom(ctx.state, loc, roomRect.x0, roomRect.y0, roomRect.x1, roomRect.y1, c));
          feedback(r);
          if (r.ok) toast(r.message, 'good');
          // Done: back to building, so the new room can be furnished straight away.
          ui.tool = r.ok ? { kind: 'select' } : { kind: 'room' };
          if (r.ok) { ui.category = code === 'k' || code === 'o' || code === 'm' || code === 'u' ? 'staff' : code === 'w' || code === 'd' || code === 'v' || code === 'p' ? 'service' : code === 'q' ? 'testdrive' : code === 's' ? 'showroom' : 'customers'; collapsePalette(false); }
          confirmKey = '';
          afterChange();
        } },
      }, `${ZONE_BY_CODE[c].icon} ${ZONE_BY_CODE[c].name}`)));
      confirmBar.appendChild(chips);
    }
    confirmBar.appendChild(btns);
    confirmBar.classList.add('open');
    placeConfirm();
  };

  // ---------------------------------------------------------------- panels --
  const openPanel = (id: PanelId | null): void => {
    if (id === null) { closePanel(); return; }
    if (ui.build && id !== 'lot') exitBuild();
    ui.panel = id;
    if (!releasePanel) releasePanel = pushBackHandler(() => { closePanel(); return true; });
    if (id !== 'time') closePop();
    setCompact(id !== 'time');
    paintPanel();
    paintActions();
  };
  const closePanel = (): void => {
    ui.panel = null;
    setCompact(false);
    panelHost.replaceChildren();
    panelHost.classList.remove('open', 'time');
    releasePanel?.();
    releasePanel = null;
    paintActions();
  };
  const paintPanel = (): void => {
    const id = ui.panel;
    if (!id) { panelHost.classList.remove('open'); return; }
    const scroller = panelHost.querySelector('.wp-body');
    const scroll = scroller?.scrollTop ?? 0;
    if (id === 'time') {
      panelHost.replaceChildren(timePanel());
      panelHost.classList.add('open', 'time');
      return;
    }
    panelHost.classList.remove('time');
    const meta = PANELS[id];
    const sub: Ctx = { ...ctx, params: { compact: '1' } };
    let content: HTMLElement;
    try {
      if (id === 'cars') content = inventoryView(sub).el;
      else if (id === 'buy') content = marketView(sub).el;
      else if (id === 'staff') content = staffView(sub).el;
      else if (id === 'finances') content = financesView(sub).el;
      else if (id === 'lot') content = dealershipView(sub).el;
      else if (id === 'notices') content = noticesPanel();
      else content = customersPanel();
    } catch (error) {
      console.error('[cdmt] panel failed', error);
      content = h('p', { class: 'empty', text: 'This panel could not be drawn. Your game is safe.' });
    }
    const body = h('div', { class: 'wp-body' }, content);
    panelHost.replaceChildren(
      h('div', { class: 'wp-head' }, h('span', { class: 'wp-grip' }), icon(meta.icon, 16), h('span', { class: 'wp-title', text: meta.title }),
        h('button', { class: 'icon-btn', aria: { label: 'Close panel' }, title: 'Close (Esc)', on: { click: () => closePanel() } }, icon('close', 15))),
      body);
    panelHost.classList.add('open');
    body.scrollTop = scroll;
  };

  const customersPanel = (): HTMLElement => {
    const s = ctx.state;
    const el = h('div', { class: 'view' });
    const waiting = s.customers.filter((c) => c.locationId === loc.id && (c.status === 'waiting' || c.status === 'negotiating'));
    const leads = expectedLeads(s, loc);
    el.appendChild(h('div', { class: 'wp-kpis' },
      h('div', {}, h('span', { class: 'wm-k', text: 'In the dealership' }), h('strong', { text: String(waiting.length) })),
      h('div', {}, h('span', { class: 'wm-k', text: 'Expected today' }), h('strong', { text: leads.total.toFixed(1) })),
      h('div', {}, h('span', { class: 'wm-k', text: 'Doors' }), h('strong', { class: loc.lot.open ? 'good' : 'bad', text: loc.lot.open ? 'Open' : 'Closed' }))));
    if (!waiting.length) {
      el.appendChild(h('p', { class: 'empty', text: loc.lot.open ? (s.vehicles.some((v) => v.status === 'listed' && v.locationId === loc.id) ? 'Nobody is here right now. Run the clock — customers come between 08:00 and 20:00.' : 'Customers only come for cars that are for sale. Tap a car and list it.') : 'You are closed. Open the doors to let customers in.' }));
    }
    for (const c of waiting) {
      const a = ARCHETYPE_BY_ID[c.archetype];
      const v = s.vehicles.find((x) => x.id === c.vehicleId);
      const il = interestLabel(c.interest);
      const left = Math.max(0, c.leaveHour - absHour(s));
      const td = canTestDrive(s, c);
      el.appendChild(h('div', { class: 'wp-cust' },
        h('div', { class: 'wp-cust-head' }, h('span', { class: 'wm-icon', text: a.icon }), h('div', { class: 'wm-titles' }, h('div', { class: 'wm-title', text: c.name }), h('div', { class: 'wm-sub', text: `${a.name} · ${v ? vehicleName(v) : ''}` })),
          h('span', { class: `tag ${il.tone}`, text: il.label })),
        h('div', { class: 'tiny muted', text: c.status === 'negotiating' ? 'Talking to you' : `${left <= 1 ? 'Leaving soon' : `Waits ~${left} h`}${c.testDrive ? ' · test-driven' : ''}${c.tradeIn ? ' · has a trade-in' : ''}` }),
        h('div', { class: 'wm-actions' },
          h('button', { class: 'btn small primary', on: { click: () => ctx.serve(c.id) } }, icon('handshake', 14), 'Negotiate'),
          h('button', { class: 'btn small', disabled: !td.ok, title: td.reason ?? '', on: { click: () => openTestDrive(ctx, c.id, (car) => crowd.testDrive(loc, car), undefined, () => { if (c.vehicleId) openDrive(ctx, { kind: 'customer', vehicleId: c.vehicleId, customerId: c.id, locationId: loc.id }); }) } }, icon('key', 14), 'Test drive'),
          h('button', { class: 'btn small ghost', on: { click: () => { if (isPhone()) closePanel(); actions.select({ kind: 'agent', id: `c:${c.id}` }); } } }, icon('locate', 14), 'Find'))));
    }
    el.appendChild(h('button', { class: 'btn block ghost', on: { click: () => ctx.go('reports', { tab: 'customers' }) } }, 'Who left without buying, and why →'));
    return el;
  };

  const noticesPanel = (): HTMLElement => {
    const s = ctx.state;
    const el = h('div', { class: 'view' });
    if (!s.notices.length) el.appendChild(h('p', { class: 'empty', text: 'Nothing new. Sales, arrivals, events and warnings show up here.' }));
    for (const n of s.notices.slice(0, 60)) {
      el.appendChild(h('div', { class: `alert-row notice-${n.kind}${n.read ? '' : ' unread'}` },
        h('span', { class: `alert-dot ${n.kind === 'bad' ? 'critical' : n.kind === 'event' ? 'warning' : n.kind === 'good' || n.kind === 'sale' ? 'success' : ''}` }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'alert-title', text: n.text })),
        h('span', { class: 'alert-time', text: `Day ${n.day}` })));
    }
    for (const n of s.notices) n.read = true;
    return el;
  };

  const timePanel = (): HTMLElement => {
    const s = ctx.state;
    const el = h('div', { class: 'wt' });
    el.appendChild(h('div', { class: 'wt-row' }, ...SPEEDS.map((_, i) => h('button', {
      class: `btn small${s.speed === i ? ' primary' : ''}`,
      on: { click: () => { ctx.engine.setSpeed(i); paintPanel(); paintActions(); } },
    }, i === 0 ? icon('pause', 14) : null, i === 0 ? 'Pause' : SPEED_LABELS[i]))));
    el.appendChild(h('button', { class: 'btn block', on: { click: () => ctx.nextDay() } }, icon('next', 14), 'Close up and go to the next day'));
    el.appendChild(h('button', {
      class: `btn block ${loc.lot.open ? 'ghost' : 'primary'}`,
      on: { click: () => toggleOpen() },
    }, icon('door', 14), loc.lot.open ? 'Close the doors (no customers)' : 'Open the doors'));
    return el;
  };

  const toggleOpen = (): void => {
    loc.lot.open = !loc.lot.open;
    ctx.act({ ok: true, message: loc.lot.open ? `${loc.name} is open for business.` : `${loc.name} is closed. No new customers until you open again; the team rests.` });
  };

  // ------------------------------------------------------------ HUD & bar --
  // The HUD and the action bar are built once and updated in place, so they
  // never flicker or swallow a click while the clock runs.
  const chip = (cls: string, title: string, run?: () => void): HTMLElement => (run
    ? h('button', { class: `wh-chip ${cls}`, title, on: { click: run } })
    : h('div', { class: `wh-chip ${cls}`, title }));
  const hudOpen = chip('open-chip', 'Open or close the doors', () => toggleOpen());
  const hudToday = chip('m-dup', 'Today so far');
  const hudCust = chip('', 'Customers in the dealership', () => openPanel('customers'));
  const hudCars = chip('', 'Cars here / spaces', () => openPanel('cars'));
  const hudTime = chip('m-dup', 'Time', () => openPanel('time'));
  const hudRep = chip('m-dup', 'Reputation');
  const hudIssues = chip('bad', 'Layout problems', () => openPanel('lot'));
  const hudDecision = chip('hud-chip-decision', 'A decision needs you', () => openDecisions(ctx));
  const hudMission = chip('m-dup', 'Closest mission', () => ctx.go('missions'));
  const hudService = chip('', 'Workshop jobs today', () => ctx.go('service'));
  const hudFleet = chip('m-dup', 'Fleet orders', () => ctx.go('fleet'));
  hud.append(hudOpen, hudDecision, hudToday, hudCust, hudCars, hudMission, hudService, hudFleet, hudIssues);
  const setChip = (el: HTMLElement, key: string, ...parts: (Node | string)[]): void => {
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.replaceChildren(...parts);
  };
  const paintHud = (): void => {
    const s = ctx.state;
    const waiting = waitingCustomers(s).filter((c) => c.locationId === loc.id).length;
    const cap = capacityOf(loc);
    const used = occupying(s, loc.id);
    const issues = lotStats(loc.lot).issues.filter((i) => i.level === 'bad').length;
    const profit = s.today.profit - s.today.expenses;
    hudOpen.classList.toggle('is-open', loc.lot.open);
    hudOpen.classList.toggle('is-closed', !loc.lot.open);
    setChip(hudOpen, String(loc.lot.open), h('span', { class: 'dot' }), loc.lot.open ? 'OPEN' : 'CLOSED');
    setChip(hudToday, `${s.today.sold}|${Math.round(profit)}`, h('span', { class: 'wh-k', text: 'Today' }), h('span', { class: 'wh-v', text: `${s.today.sold} sold` }), h('span', { class: `wh-v ${profit >= 0 ? 'good' : 'bad'}`, text: `${profit >= 0 ? '+' : '−'}${moneyShort(Math.abs(profit))}` }));
    hudCust.classList.toggle('hot', waiting > 0);
    setChip(hudCust, String(waiting), icon('customer', 14), h('span', { class: 'wh-v', text: String(waiting) }));
    hudCars.classList.toggle('warn', used >= cap);
    setChip(hudCars, `${used}/${cap}`, icon('car', 14), h('span', { class: 'wh-v', text: `${used}/${cap}` }));
    setChip(hudTime, `${s.day}|${s.hour}|${s.speed}`, icon(s.speed === 0 ? 'pause' : 'clock', 14), h('span', { class: 'wh-v', text: `D${s.day} ${String(s.hour).padStart(2, '0')}:00` }));
    setChip(hudRep, reputationStars(s.reputation), h('span', { class: 'wh-k', text: 'Rep' }), h('span', { class: 'wh-v', text: reputationStars(s.reputation) }));
    hudIssues.style.display = issues ? '' : 'none';
    const dec = s.decisions.length;
    hudDecision.style.display = dec ? '' : 'none';
    setChip(hudDecision, String(dec), icon('gavel', 14), h('span', { class: 'wh-v', text: dec > 1 ? `${dec} decisions` : 'Decision' }));
    const best = s.missions.active.map((id) => MISSION_BY_ID[id]).filter(Boolean).map((m) => ({ m, p: missionProgress(s, m) })).sort((a, b) => b.p - a.p)[0];
    hudMission.style.display = best ? '' : 'none';
    if (best) setChip(hudMission, `${best.m.id}|${Math.round(best.p * 20)}`, icon('trophy', 14), h('span', { class: 'wh-v', text: `${Math.round(best.p * 100)}%` }));
    const jobs = s.serviceJobs.filter((j) => j.locationId === loc.id && j.status !== 'done');
    const stuck = jobs.filter((j) => j.status === 'parts').length;
    hudService.style.display = jobs.length ? '' : 'none';
    hudService.classList.toggle('warn', stuck > 0);
    setChip(hudService, `${jobs.length}|${stuck}`, icon('wrench', 14), h('span', { class: 'wh-v', text: stuck ? `${jobs.length} · ${stuck} need parts` : String(jobs.length) }));
    const fleetOpen = s.fleet.filter((r) => r.status === 'open' || r.status === 'accepted').length;
    hudFleet.style.display = fleetOpen ? '' : 'none';
    setChip(hudFleet, String(fleetOpen), icon('car', 14), h('span', { class: 'wh-v', text: String(fleetOpen) }));
    setChip(hudIssues, String(issues), icon('warning', 14), h('span', { class: 'wh-v', text: String(issues) }));
  };

  const barItems = new Map<string, { el: HTMLElement; label: HTMLElement; badge: HTMLElement; glyph: HTMLElement; key: string }>();
  const toggle = (id: PanelId): (() => void) => () => (ui.panel === id ? closePanel() : openPanel(id));
  const addItem = (id: string, label: string, ic: string, run: () => void): void => {
    const glyph = h('span', { class: 'wa-glyph' }, icon(ic, 19));
    const lab = h('span', { class: 'wa-label', text: label });
    const badge = h('span', { class: 'wa-badge' });
    const el = h('button', { class: 'wa-item', data: { action: id }, aria: { label }, title: label, on: { click: run } }, glyph, lab, badge);
    barItems.set(id, { el, label: lab, badge, glyph, key: ic });
    actionBar.appendChild(el);
  };
  addItem('build', 'Build', 'hammer', () => (ui.build ? exitBuild() : enterBuild()));
  addItem('buy', 'Buy cars', 'store', toggle('buy'));
  addItem('cars', 'Cars', 'car', toggle('cars'));
  addItem('customers', 'Customers', 'customer', toggle('customers'));
  addItem('staff', 'Staff', 'people', toggle('staff'));
  addItem('finances', 'Finances', 'finance', toggle('finances'));
  addItem('time', 'Time', 'clock', toggle('time'));
  addItem('notices', 'Alerts', 'bell', toggle('notices'));
  const paintActions = (): void => {
    const s = ctx.state;
    const counts: Record<string, number> = {
      cars: s.vehicles.filter((v) => v.locationId === loc.id && v.status === 'yard').length,
      customers: waitingCustomers(s).filter((c) => c.locationId === loc.id).length,
      finances: s.cash < 0 ? 1 : 0,
      notices: s.notices.filter((n) => !n.read).length,
    };
    for (const [id, it] of barItems) {
      it.el.classList.toggle('active', id === 'build' ? ui.build : ui.panel === id);
      const n = counts[id] ?? 0;
      const text = n > 9 ? '9+' : n > 0 ? String(n) : '';
      if (it.badge.textContent !== text) it.badge.textContent = text;
      it.badge.style.display = text ? '' : 'none';
    }
    const time = barItems.get('time');
    if (time) {
      const label = s.speed === 0 ? 'Paused' : `Time ${SPEED_LABELS[s.speed]}`;
      if (time.label.textContent !== label) time.label.textContent = label;
      const ic = s.speed === 0 ? 'pause' : 'clock';
      if (time.key !== ic) { time.key = ic; time.glyph.replaceChildren(icon(ic, 19)); }
    }
    root.classList.toggle('has-panel', !!ui.panel && ui.panel !== 'time' && !isPhone());
    document.body.classList.toggle('world-panel-open', !!ui.panel && ui.panel !== 'time');
  };

  const paintAll = (): void => {
    paintHud();
    paintActions();
    paintBuild();
    if (ui.panel) paintPanel();
    if (ui.selected) paintPop();
  };

  // ------------------------------------------------------------- keyboard --
  const typing = (e: KeyboardEvent): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (typing(e) || document.querySelector('.modal-overlay')) return;
    if (!e.ctrlKey && !e.metaKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (e.key === 'Alt') { altHeld = true; return; }
    const mod = e.ctrlKey || e.metaKey;
    const sel = ui.selected?.kind === 'object' ? ui.selected.id : null;
    if (mod && e.code === 'KeyZ' && ui.build) { e.preventDefault(); if (e.shiftKey) redoAct(); else undoAct(); return; }
    if (mod && e.code === 'KeyY' && ui.build) { e.preventDefault(); redoAct(); return; }
    if (mod && e.code === 'KeyC' && ui.build && sel) { e.preventDefault(); copy(sel); return; }
    if (mod && e.code === 'KeyV' && ui.build) { e.preventDefault(); paste(); return; }
    if (mod && e.code === 'KeyD' && ui.build && sel) { e.preventDefault(); duplicate(sel); return; }
    if (mod) return;
    if (e.code === 'KeyR') rotateTool();
    else if (e.code === 'KeyB') (ui.build ? exitBuild() : enterBuild());
    else if (e.code === 'KeyG' && ui.build) { ui.grid = !ui.grid; paintBuild(); }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'KeyE') zoomBy(1.2);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'KeyQ') zoomBy(1 / 1.2);
    else if (e.code === 'KeyF') fitLot();
    else if ((e.code === 'Delete' || e.code === 'Backspace') && ui.build) {
      e.preventDefault();
      if (sel) confirmBulldoze([sel]);
      else if (ui.tool.kind === 'bulldoze' && bullHover) confirmBulldoze([bullHover]);
      else { ui.tool = { kind: 'bulldoze' }; paintBuild(); }
    }
    else if (e.code === 'KeyX' && ui.build) { ui.tool = { kind: 'bulldoze' }; ui.selected = null; closePop(); paintBuild(); }
    else if (e.code === 'KeyM' && ui.build) { ui.tool = { kind: 'pick' }; ui.selected = null; closePop(); paintBuild(); }
    // Esc is the back button (platform.ts): it closes the topmost thing — card, panel, tool, build mode.
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); if (e.key === 'Alt') altHeld = false; };
  const onBlur = (): void => { keys.clear(); altHeld = false; };

  // ------------------------------------------------------------------ wire --
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => { if (!pointers.size && ui.tool.kind !== 'car') hover = null; hoverKey = ''; window.clearTimeout(hoverTimer); hideTipNow(); });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  unsubs.push(on('sale', ({ vehicle, price }) => {
    if (vehicle.locationId === loc.id) {
      crowd.departCar(loc, vehicle, lastSlot.get(vehicle.id));
      const slot = lastSlot.get(vehicle.id);
      const p = slot ? carPose(loc, slot, time) : null;
      floaters.push({ text: `🚗 → 💰 €${Math.round(price / 100) / 10}k`, x: p?.x ?? loc.lot.w / 2, y: p?.y ?? loc.lot.h - 3, born: time, tone: '#2fd18b' });
    }
  }));
  // Little signs of life: a service car going onto a lift, a car ready, a booking, a bought car.
  unsubs.push(on('fx', (f) => {
    if (f.locationId !== loc.id) return;
    let x = loc.lot.w / 2;
    let y = loc.lot.h - 3;
    const job = f.ref ? ctx.state.serviceJobs.find((j) => j.id === f.ref) : undefined;
    const veh = f.ref ? ctx.state.vehicles.find((v) => v.id === f.ref) : undefined;
    const p = job?.liftId ? carPose(loc, job.liftId, time) : veh?.slotId ? carPose(loc, veh.slotId, time) : null;
    if (p) { x = p.x; y = p.y; }
    else {
      const ls = lotStats(loc.lot);
      const desk = f.kind === 'appointment' || f.kind === 'arrived' ? [...ls.stations.advisor ?? [], ...ls.stations.reception ?? [], ...ls.stations.sales ?? []][0] : undefined;
      if (desk) { const fp = footprint(desk); x = fp.x + fp.w / 2; y = fp.y; }
    }
    const tone = f.kind === 'service-ready' ? '#2fd18b' : f.kind === 'service-start' ? '#3cc7ff' : f.kind === 'bought' ? '#ffc233' : '#eef1f4';
    floaters.push({ text: f.kind === 'service-start' ? `🚗 → 🔧 ${f.label.replace(/^\S+\s/, '')}` : f.kind === 'service-ready' ? `🔧 → 🟢 ${f.label.replace(/^\S+\s/, '')}` : f.kind === 'appointment' ? `👤 → 📅 ${f.label.replace(/^\S+\s/, '')}` : f.label, x, y, born: time, tone });
    if (floaters.length > 12) floaters.shift();
  }));
  // Remember where each car stood, so a sold car can drive out of the right space.
  const lastSlot = new Map<string, string>();
  const rememberSlots = (): void => {
    for (const v of ctx.state.vehicles) if (v.slotId) lastSlot.set(v.id, v.slotId);
  };

  requestAnimationFrame(() => {
    if (destroyed) return;
    ro.observe(root);
    resize();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  });
  if (ui.build) { root.classList.add('building'); setGameMode('build'); releaseBuild = pushBackHandler(() => { exitBuild(); return true; }); }
  paintAll();
  rememberSlots();
  applyParams(ctx.params);

  function applyParams(params: Record<string, string>): void {
    if (params.build === '1') enterBuild(params.cat);
    const map: Record<string, PanelId> = { cars: 'cars', inventory: 'cars', buy: 'buy', market: 'buy', customers: 'customers', staff: 'staff', finances: 'finances', notices: 'notices', lot: 'lot' };
    if (params.panel && map[params.panel]) openPanel(map[params.panel]);
    if (params.vehicle) {
      const v = ctx.state.vehicles.find((x) => x.id === params.vehicle);
      if (v) actions.select({ kind: 'vehicle', id: v.id });
    }
  }

  // Test handle: lets automated tests find things on the map (same as a player looking).
  (window as unknown as { __CDMT_WORLD__?: unknown }).__CDMT_WORLD__ = {
    toScreen: (x: number, y: number) => cam.toScreen(x, y),
    select: (sel: Selection) => actions.select(sel),
    carScreen: (id: string) => {
      const v = ctx.state.vehicles.find((x) => x.id === id);
      const p = v?.slotId ? carPose(loc, v.slotId, time) : null;
      return p ? cam.toScreen(p.x, p.y) : null;
    },
    agentScreen: (id: string) => {
      const a = crowd.agents.get(id);
      return a ? cam.toScreen(a.x, a.y) : null;
    },
    agents: () => [...crowd.agents.values()].map((a) => ({ id: a.id, kind: a.kind, x: a.x, y: a.y, state: a.state })),
    zoom: () => cam.zoom,
    /** Scrolls the view so a world point sits in the upper third (like a player dragging the map). */
    panTo: (x: number, y: number) => {
      const p = cam.toScreen(x, y);
      cam.panBy(cam.width / 2 - p.x, cam.height * 0.3 - p.y);
      saveCam();
      return cam.toScreen(x, y);
    },
    ui: () => ({ build: ui.build, panel: ui.panel, tool: ui.tool.kind, rot: 'rot' in ui.tool ? ui.tool.rot : undefined, selected: ui.selected, moveCar: ui.moveCar, grid: ui.grid, snap: ui.snap }),
    objScreen: (id: string) => {
      const o = loc.lot.objects.find((x) => x.id === id);
      if (!o) return null;
      const f = footprint(o);
      return cam.toScreen(f.x + f.w / 2, f.y + f.h / 2);
    },
  };

  let lastDay = ctx.state.day;
  return {
    el: root,
    fullBleed: true,
    update: () => {
      rememberSlots();
      paintHud();
      paintActions();
      if (ui.panel === 'time') paintPanel();
      // Keep an open card live (patience ticking, jobs progressing).
      if (ui.selected && !pop.contains(document.activeElement)) {
        const alive = new Set(ctx.state.customers.map((c) => c.id));
        pruneNotes(alive);
        if (ui.selected.kind === 'agent' && ui.selected.id.startsWith('c:') && !alive.has(ui.selected.id.slice(2))) actions.close();
        else if (ui.selected.kind === 'vehicle' && !ctx.state.vehicles.some((v) => v.id === ui.selected!.id)) actions.close();
      }
      if (ctx.state.day !== lastDay) {
        lastDay = ctx.state.day;
        if (ui.selected) paintPop();
      }
    },
    refresh: () => {
      rememberSlots();
      paintAll();
      return true;
    },
    setParams: (params) => applyParams(params),
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const u of unsubs) u();
      releasePanel?.();
      releasePop?.();
      releaseBuild?.();
      releaseMove?.();
      if (gameMode() === 'build') setGameMode('play');
      setCompact(false);
      hideTipNow();
      window.clearTimeout(hoverTimer);
      document.body.classList.remove('world-panel-open');
      saveCam();
      // Panels and modes stay as they were for next time, except transient ones.
      ui.moveCar = null;
      ui.selected = null;
    },
  };
}

/** For tests and the tutorial: is the player in build mode? */
export function worldState(): { build: boolean; panel: string | null; tool: string } {
  return { build: ui.build, panel: ui.panel, tool: ui.tool.kind };
}

export type { ZoneCode };
