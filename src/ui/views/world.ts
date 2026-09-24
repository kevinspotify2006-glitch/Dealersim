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
import { h, toast } from '../dom';
import { icon } from '../icons';
import { money, moneyShort } from '../../sim/format';
import { SPEEDS, SPEED_LABELS, activeLocation, absHour, capacityOf, occupying, vehicleName } from '../../sim/state';
import { canPlace, footprint, lotStats, moveObject, moveVehicleTo, paintZone, placeObject, removeObject, zoneAt, zoneCost } from '../../sim/lot';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import { expectedLeads, interestLabel, waitingCustomers, canTestDrive, testDrive } from '../../sim/customers';
import { on } from '../../sim/bus';
import { Camera } from '../world/camera';
import { Crowd } from '../world/agents';
import { carPose, renderScene } from '../world/render';
import type { Ghost, PaintPreview, Selection } from '../world/render';
import { entityMenu, pruneNotes } from '../world/menus';
import type { WorldActions } from '../world/menus';
import { buildPalette, buildStats } from '../world/build';
import type { Tool } from '../world/build';
import { isPhone, setCompact } from '../layout';
import { pushBackHandler, haptic } from '../../platform/platform';
import { play } from '../../platform/sound';
import { inventoryView } from './inventory';
import { marketView } from './market';
import { staffView } from './staff';
import { financesView } from './finances';
import { dealershipView } from './dealership';
import { reputationStars } from '../kit';

type PanelId = 'cars' | 'buy' | 'customers' | 'staff' | 'finances' | 'notices' | 'lot' | 'time';

interface Ui {
  build: boolean;
  tool: Tool;
  category: string;
  panel: PanelId | null;
  selected: Selection;
  moveCar: string | null;
  flow: boolean;
  cams: Record<string, { x: number; y: number; zoom: number }>;
}

// Kept between visits so the dealership looks the way you left it.
const ui: Ui = { build: false, tool: { kind: 'select' }, category: 'zones', panel: null, selected: null, moveCar: null, flow: false, cams: {} };
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
  const banner = h('div', { class: 'world-banner' });
  const zoomBtns = h('div', { class: 'world-zoom' },
    h('button', { class: 'icon-btn', title: 'Zoom in', aria: { label: 'Zoom in' }, on: { click: () => zoomBy(1.25) } }, icon('plus', 16)),
    h('button', { class: 'icon-btn', title: 'Zoom out', aria: { label: 'Zoom out' }, on: { click: () => zoomBy(0.8) } }, h('span', { class: 'minus', text: '−' })),
    h('button', { class: 'icon-btn', title: 'Show the whole lot', aria: { label: 'Show the whole lot' }, on: { click: () => fitLot() } }, icon('locate', 16)));
  const root = h('div', { class: 'view world' }, canvas, hud, buildStrip, zoomBtns, banner, pop, paletteHost, confirmBar, actionBar, panelHost);

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
  const setBounds = (): void => cam.setBounds(-4, -4, loc.lot.w + 4, loc.lot.h + 6);
  const fitLot = (): void => {
    const phone = isPhone();
    cam.fit(-1, -1, loc.lot.w + 1, loc.lot.h + 4.5, {
      top: phone ? 56 : 64,
      bottom: phone ? (ui.build ? Math.round(cam.height * 0.45) : 86) : 92,
      left: !phone && ui.build ? 340 : 16,
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
      state: ctx.state, loc, cam, crowd, time, build: ui.build, selected: ui.selected, ghost: ghost(), paint: paintPreview(), moveCar: ui.moveCar, flow: ui.flow || (ui.build && ui.tool.kind === 'paint'), dpr,
    });
    if (popAnchor && !isPhone()) placePop();
    raf = requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------- build tools --
  const ghost = (): Ghost | null => {
    const t = ui.tool;
    if (!ui.build || (t.kind !== 'place' && t.kind !== 'move')) return null;
    const def = OBJ_BY_ID[t.defId];
    let x = t.x;
    let y = t.y;
    if (x === undefined || y === undefined) {
      if (!hover) return null;
      const w = t.rot ? def.h : def.w;
      const hh = t.rot ? def.w : def.h;
      x = Math.round(hover.x - w / 2);
      y = Math.round(hover.y - hh / 2);
    }
    const check = canPlace(ctx.state, loc, t.defId, x, y, t.rot, t.kind === 'move' ? t.objId : undefined, t.kind === 'move');
    const fee = t.kind === 'move' ? Math.min(250, Math.round(def.cost * 0.05)) : def.cost;
    return { defId: t.defId, x, y, rot: t.rot, ok: check.ok, label: check.ok ? `${def.name} · ${money(fee)}` : check.reason };
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
  const tileAt = (p: { x: number; y: number }): { x: number; y: number } => ({ x: Math.max(0, Math.min(loc.lot.w - 1, Math.floor(p.x))), y: Math.max(0, Math.min(loc.lot.h - 1, Math.floor(p.y))) });

  const commitPlace = (): void => {
    const t = ui.tool;
    const gh = ghost();
    if (!gh || (t.kind !== 'place' && t.kind !== 'move')) return;
    if (!gh.ok) { toast(gh.label ?? 'Cannot build here.', 'bad'); play('error'); return; }
    if (t.kind === 'place') {
      const r = placeObject(ctx.state, loc, t.defId, gh.x, gh.y, gh.rot);
      if (r.ok) { play('buy'); haptic(10); } else { toast(r.message, 'bad'); play('error'); }
      // Stay in the tool so rows of spaces are quick to lay out.
      ui.tool = { kind: 'place', defId: t.defId, rot: t.rot };
    } else {
      const r = moveObject(ctx.state, loc, t.objId, gh.x, gh.y, gh.rot);
      if (r.ok) { play('click'); ui.selected = { kind: 'object', id: t.objId }; ui.tool = { kind: 'select' }; } else { toast(r.message, 'bad'); play('error'); }
    }
    afterChange();
  };
  const commitPaint = (): void => {
    const r = paintRect();
    if (!r || ui.tool.kind !== 'paint') return;
    const code = ui.tool.code;
    const res = paintZone(ctx.state, loc, r.x0, r.y0, r.x1, r.y1, code);
    if (res.ok) { play('buy'); haptic(10); } else { toast(res.message, 'bad'); play('error'); }
    ui.tool = { kind: 'paint', code };
    afterChange();
  };
  const cancelTool = (): void => {
    ui.tool = { kind: 'select' };
    paintBuild();
  };
  const rotateTool = (): void => {
    const t = ui.tool;
    if (t.kind === 'place' || t.kind === 'move') { t.rot = t.rot ? 0 : 1; paintConfirm(); }
  };

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
      const f = footprint(o);
      return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h && (slotsToo || !OBJ_BY_ID[o.defId]?.slot);
    }).sort((a, b) => footprint(a).w * footprint(a).h - footprint(b).w * footprint(b).h);
    return hits[0]?.id;
  };

  // -------------------------------------------------------------- gestures --
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; type: string }>();
  let gesture: 'none' | 'pan' | 'pinch' | 'paint' | 'ghost' = 'none';
  let moved = false;
  let downAt = 0;
  let longTimer = 0;
  let longFired = false;
  let pinch = { d: 0, mx: 0, my: 0 };
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button === 2) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType });
    if (pointers.size === 2) {
      window.clearTimeout(longTimer);
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      // A pinch cancels an unfinished paint stroke.
      if (gesture === 'paint' && ui.tool.kind === 'paint') { ui.tool.start = undefined; ui.tool.end = undefined; }
      gesture = 'pinch';
      moved = true;
      return;
    }
    moved = false;
    longFired = false;
    downAt = performance.now();
    const w = cam.toWorld(p.x, p.y);
    gesture = 'pan';
    if (ui.build && e.button === 0) {
      const t = ui.tool;
      if (t.kind === 'paint') {
        const tile = tileAt(w);
        t.start = tile;
        t.end = tile;
        gesture = 'paint';
      } else if ((t.kind === 'place' || t.kind === 'move') && (e.pointerType !== 'mouse' || t.x !== undefined)) {
        // Touch: drag the ghost with your finger.
        gesture = 'ghost';
        moveGhostTo(w);
      }
    }
    window.clearTimeout(longTimer);
    longTimer = window.setTimeout(() => {
      if (moved || pointers.size !== 1 || gesture === 'paint' || gesture === 'ghost') return;
      longFired = true;
      onLongPress(w);
    }, 480);
  };
  const moveGhostTo = (w: { x: number; y: number }): void => {
    const t = ui.tool;
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
      // Mouse hover: the ghost follows the cursor.
      hover = cam.toWorld(p.x, p.y);
      canvas.style.cursor = ui.build ? (ui.tool.kind === 'select' ? 'pointer' : 'crosshair') : hoverCursor(hover);
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
    if (!moved) return;
    if (gesture === 'paint' && ui.tool.kind === 'paint') {
      ui.tool.end = tileAt(cam.toWorld(p.x, p.y));
      return;
    }
    if (gesture === 'ghost') { moveGhostTo(cam.toWorld(p.x, p.y)); return; }
    if (gesture === 'pan') {
      cam.panBy(dxs, dys);
      saveCam();
      if (popAnchor && isPhone()) return;
    }
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
    const g = gesture;
    gesture = 'none';
    if (g === 'paint') {
      if (rec.type === 'mouse') commitPaint();
      else paintConfirm();
      return;
    }
    if (g === 'ghost') {
      if (!moved && rec.type !== 'mouse') moveGhostTo(w);
      paintConfirm();
      return;
    }
    if (longFired || moved || performance.now() - downAt > 700) return;
    onTap(w, rec.type);
  };
  const hoverCursor = (w: { x: number; y: number }): string => {
    if (ui.moveCar) return 'crosshair';
    if (crowd.hit(w.x, w.y) || vehicleAt(w) || objectAt(w, false)) return 'pointer';
    return 'grab';
  };

  const onTap = (w: { x: number; y: number }, type: string): void => {
    if (ui.moveCar) {
      const target = objectAt(w);
      const def = target ? OBJ_BY_ID[loc.lot.objects.find((o) => o.id === target)!.defId] : undefined;
      if (target && def?.slot) {
        const r = moveVehicleTo(ctx.state, loc, ui.moveCar, target);
        ctx.act(r);
        if (r.ok) stopMoveCar();
      } else stopMoveCar();
      return;
    }
    if (ui.build) {
      const t = ui.tool;
      if (t.kind === 'place' || t.kind === 'move') {
        if (type === 'mouse') { hover = w; commitPlace(); } else moveGhostTo(w);
        return;
      }
      if (t.kind === 'paint') return;
      const obj = objectAt(w);
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
    const v = ui.build ? undefined : vehicleAt(w);
    if (v && (v.status === 'yard' || v.status === 'listed')) { startMoveCar(v.id); return; }
    const obj = objectAt(w, !ui.build ? false : true) ?? objectAt(w);
    if (obj) startMoveObject(obj);
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = { x: e.offsetX, y: e.offsetY };
    cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    saveCam();
  };
  const onContext = (e: Event): void => {
    e.preventDefault();
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
    moveCar: (id) => startMoveCar(id),
    moveObject: (id) => startMoveObject(id),
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
  const closePop = (): void => {
    popAnchor = null;
    pop.replaceChildren();
    pop.classList.remove('open', 'sheet');
    releasePop?.();
    releasePop = null;
  };
  const paintPop = (): void => {
    const content = entityMenu(actions, ui.selected);
    if (!content) { closePop(); return; }
    const sheet = isPhone();
    pop.replaceChildren(h('button', { class: 'icon-btn wm-close', aria: { label: 'Close' }, on: { click: () => actions.close() } }, icon('close', 14)), content);
    pop.classList.add('open');
    pop.classList.toggle('sheet', sheet);
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
    x = Math.max(ui.build ? 330 : 12, Math.min(rightLimit - w, x));
    const y = Math.max(64, Math.min(cam.height - hh - 90, p.y - hh / 2));
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  // ------------------------------------------------------------ move modes --
  const startMoveCar = (id: string): void => {
    ui.moveCar = id;
    ui.selected = null;
    closePop();
    const v = ctx.state.vehicles.find((x) => x.id === id);
    banner.replaceChildren(h('span', { text: `Tap a space for the ${v ? vehicleName(v) : 'car'} — green is free, yellow swaps.` }), h('button', { class: 'btn small', on: { click: () => stopMoveCar() } }, 'Cancel'));
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
    closePanel();
    closePop();
    stopMoveCar();
    ui.selected = null;
    root.classList.add('building');
    paintBuild();
    if (refit && isPhone()) fitLot();
  };
  const exitBuild = (): void => {
    ui.build = false;
    ui.tool = { kind: 'select' };
    ui.selected = null;
    root.classList.remove('building');
    releaseBuild?.();
    releaseBuild = null;
    closePop();
    paintBuild();
    paintActions();
  };
  const paintBuild = (): void => {
    if (!ui.build) {
      paletteHost.replaceChildren();
      buildStrip.replaceChildren();
      confirmBar.replaceChildren();
      confirmBar.classList.remove('open');
      return;
    }
    const scroll = paletteHost.querySelector('.bp-body')?.scrollTop ?? 0;
    const tabsScroll = paletteHost.querySelector('.bp-tabs')?.scrollLeft ?? 0;
    paletteHost.replaceChildren(buildPalette({
      ctx,
      loc: () => loc,
      tool: () => ui.tool,
      setTool: (t) => { ui.tool = t; ui.selected = null; closePop(); paintBuild(); if (isPhone() && t.kind !== 'select') collapsePalette(true); },
      category: () => ui.category,
      setCategory: (c) => { ui.category = c; collapsePalette(false); paintBuild(); },
      done: () => exitBuild(),
      flow: () => ui.flow,
      toggleFlow: () => { ui.flow = !ui.flow; paintBuild(); },
      after: () => afterChange(),
    }));
    const body = paletteHost.querySelector('.bp-body');
    if (body) body.scrollTop = scroll;
    const tabs = paletteHost.querySelector('.bp-tabs');
    if (tabs) tabs.scrollLeft = tabsScroll;
    buildStrip.replaceChildren(buildStats(ctx, loc, () => openPanel('lot')));
    paintConfirm();
  };
  const collapsePalette = (on: boolean): void => { paletteHost.classList.toggle('collapsed', on); };
  const paintConfirm = (): void => {
    const t = ui.tool;
    confirmBar.replaceChildren();
    if (!ui.build || t.kind === 'select') { confirmBar.classList.remove('open'); return; }
    const phone = isPhone();
    let label = '';
    let ok = true;
    let doIt: (() => void) | null = null;
    if (t.kind === 'place' || t.kind === 'move') {
      const def = OBJ_BY_ID[t.defId];
      const gh = ghost();
      label = t.kind === 'move' ? `Moving: ${def.name}` : `${def.icon} ${def.name} · ${money(def.cost)}`;
      if (gh && !gh.ok) label += ` — ${gh.label}`;
      ok = !!gh && gh.ok;
      doIt = gh && (phone || t.x !== undefined) ? commitPlace : null;
      if (!phone && t.x === undefined) label += ' — click to place, R to rotate, right-click to stop';
    } else {
      const pv = paintPreview();
      label = pv ? pv.label : `${ZONE_BY_CODE[t.code].icon} ${ZONE_BY_CODE[t.code].name} — ${phone ? 'drag on the map to paint' : 'drag to paint'}`;
      ok = !!pv && pv.ok;
      doIt = pv && phone ? commitPaint : null;
    }
    confirmBar.appendChild(h('span', { class: 'wc-label', text: label }));
    if (t.kind === 'place' || t.kind === 'move') confirmBar.appendChild(h('button', { class: 'btn small', title: 'Rotate (R)', on: { click: rotateTool } }, icon('rotate', 14), phone ? '' : 'Rotate'));
    if (doIt) confirmBar.appendChild(h('button', { class: 'btn small primary', disabled: !ok, on: { click: doIt } }, icon('check', 14), t.kind === 'paint' ? 'Build' : t.kind === 'move' ? 'Move here' : 'Place'));
    confirmBar.appendChild(h('button', { class: 'btn small ghost', on: { click: () => { cancelTool(); collapsePalette(false); } } }, icon('close', 14), phone ? '' : 'Stop'));
    confirmBar.classList.add('open');
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
          h('button', { class: 'btn small', disabled: !td.ok, title: td.reason ?? '', on: { click: () => { const car = v; const r = testDrive(s, c.id); if (r.ok && car) crowd.testDrive(loc, car); ctx.act(r); } } }, icon('key', 14), 'Test drive'),
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
  const hudToday = chip('', 'Today so far');
  const hudCust = chip('', 'Customers in the dealership', () => openPanel('customers'));
  const hudCars = chip('', 'Cars here / spaces', () => openPanel('cars'));
  const hudTime = chip('phone-only', 'Time', () => openPanel('time'));
  const hudRep = chip('phone-only', 'Reputation');
  const hudIssues = chip('bad', 'Layout problems', () => openPanel('lot'));
  hud.append(hudOpen, hudToday, hudCust, hudCars, hudTime, hudRep, hudIssues);
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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (e.code === 'KeyR') rotateTool();
    else if (e.code === 'KeyB') (ui.build ? exitBuild() : enterBuild());
    else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'KeyE') zoomBy(1.2);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'KeyQ') zoomBy(1 / 1.2);
    else if (e.code === 'KeyF') fitLot();
    else if (e.code === 'Delete' && ui.build && ui.selected?.kind === 'object') {
      const obj = ui.selected.id;
      ctx.act(removeObject(ctx.state, loc, obj), { sound: 'cash' });
      ui.selected = null;
      closePop();
    }
    // Esc is the back button (platform.ts): it closes the topmost thing — card, panel, tool, build mode.
  };
  const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.code); };
  const onBlur = (): void => keys.clear();

  // ------------------------------------------------------------------ wire --
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => { if (!pointers.size) hover = null; });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  unsubs.push(on('sale', ({ vehicle }) => {
    if (vehicle.locationId === loc.id) crowd.departCar(loc, vehicle, lastSlot.get(vehicle.id));
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
  if (ui.build) { root.classList.add('building'); releaseBuild = pushBackHandler(() => { exitBuild(); return true; }); }
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
    ui: () => ({ build: ui.build, panel: ui.panel, tool: ui.tool.kind, selected: ui.selected, moveCar: ui.moveCar }),
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
      setCompact(false);
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
