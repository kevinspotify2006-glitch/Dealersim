/**
 * Draws the dealership: a clean top-down (2.5D-shaded) view of the land,
 * rooms, walls, furniture, cars and people. The static parts (floors, walls,
 * fixtures) are cached per layout version; cars, people and light are drawn
 * every frame.
 */
import type { GameState, Location, Lot, LotObject, Vehicle, ZoneCode } from '../../sim/types';
import { footprint, isDoor, isIndoor, lotStats, styleFor, zoneAt } from '../../sim/lot';
import { prepActive } from '../../sim/vehicles';
import { FLOOR_STYLES, LIGHT_STYLES, OBJ_BY_ID, WALL_STYLES, ZONE_BY_CODE } from '../../data/lot';
import { PREP_BY_ID } from '../../data/game';
import { MODELS } from '../../data/vehicles';
import { carsInWorkshop } from '../../sim/systems/planning';

const MODEL_BY_NAME: Record<string, (typeof MODELS)[number]> = Object.fromEntries(MODELS.map((m) => [m.name, m]));
const SERVICE_COLORS = ['#6b7480', '#b3202a', '#1f3b73', '#e9ecef', '#2c3036', '#5b6e4f', '#8a6a4a', '#3a5a8c'];
function hashStr(t: string): number {
  let x = 0;
  for (let i = 0; i < t.length; i += 1) x = (x * 31 + t.charCodeAt(i)) >>> 0;
  return x;
}
import type { Camera } from './camera';
import type { Agent, Crowd, MovingCar } from './agents';

export interface Ghost { defId: string; x: number; y: number; rot: 0 | 1; ok: boolean; warn?: boolean; label?: string }
export interface LineGhost { defId: string; tiles: { x: number; y: number; ok: boolean }[]; ok: boolean; label: string }
export interface CarGhost { x: number; y: number; angle: number; rect: { x: number; y: number; w: number; h: number }; color: string; body: string; ok: boolean; warn: boolean; label: string }
export interface PaintPreview { x0: number; y0: number; x1: number; y1: number; code: ZoneCode; ok: boolean; label: string }
export type Selection = { kind: 'object' | 'vehicle' | 'agent' | 'zone'; id: string; x?: number; y?: number } | null;
export interface RectPreview { x0: number; y0: number; x1: number; y1: number; label: string; ok: boolean }
export interface StampGhost { plan: { w: number; h: number; zones: [number, number, number, number, ZoneCode][]; objects: [string, number, number, 0 | 1][] }; x: number; y: number; ok: boolean; label: string }
export interface LockedLand { w: number; h: number; dy: number; label: string }
export interface ExpandFx { p: number; oldW: number; dy: number }

export interface Scene {
  state: GameState;
  loc: Location;
  cam: Camera;
  crowd: Crowd;
  time: number;
  build: boolean;
  grid?: boolean;
  selected: Selection;
  ghost?: Ghost | null;
  line?: LineGhost | null;
  car?: CarGhost | null;
  dragging?: string | null;
  paint?: PaintPreview | null;
  moveCar?: string | null;
  flow?: boolean;
  dpr: number;
  /** Bulldoze mode: what would be demolished (red). */
  bulldoze?: { ids: string[]; label?: string } | null;
  /** Area bulldoze and create-room rectangles. */
  area?: RectPreview | null;
  room?: RectPreview | null;
  stamp?: StampGhost | null;
  /** The land for sale around the lot, and the expansion animation. */
  locked?: LockedLand | null;
  expand?: ExpandFx | null;
}

const PX = 28; // cache resolution: pixels per tile

interface StaticCache {
  lot: Lot;
  version: number;
  styleKey: string;
  canvas: HTMLCanvasElement;
  shade: HTMLCanvasElement;
  rooms: { code: ZoneCode; x: number; y: number; tiles: number; w: number; h: number }[];
}

let cache: StaticCache | null = null;
/** Positions of line pieces (walls, fences, hedges) so neighbours join up. */
let lineIndex = new Set<string>();

function rand(x: number, y: number, k = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
  const g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
  const bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function floorColor(code: ZoneCode, lot: Lot): string {
  const st = isIndoor(code) ? styleFor(lot, code) : lot.style;
  const floor = FLOOR_STYLES.find((s) => s.id === st.floor) ?? FLOOR_STYLES[0];
  // A room with its own floor shows it as chosen; otherwise rooms are tinted so they read apart.
  const own = !!lot.roomStyles?.[code]?.floor;
  switch (code) {
    case 's': return floor.color;
    case 'r': return own ? floor.color : mix(floor.color, '#b9a88f', 0.35);
    case 'l': return own ? floor.color : mix(floor.color, '#8a6a4a', 0.45);
    case 'o': return own ? floor.color : mix(floor.color, '#51606f', 0.5);
    case 'm': return own ? floor.color : mix(floor.color, '#5b5470', 0.45);
    case 'b': return own ? floor.color : mix(floor.color, '#a8c4cc', 0.5);
    case 'v': return own ? floor.color : mix(floor.color, '#8f9aa6', 0.4);
    case 'k': return own ? floor.color : mix(floor.color, '#6d6a52', 0.5);
    case 'p': return own ? floor.color : '#5a5048';
    case 'w': return own ? floor.color : '#5b5f66';
    case 'd': return own ? floor.color : '#3e5968';
    case 'f': return own ? floor.color : mix(floor.color, '#4f6b5a', 0.45);
    case 'e': return own ? floor.color : mix(floor.color, '#6f6497', 0.4);
    default: return ZONE_BY_CODE[code]?.color ?? '#3b342c';
  }
}

// ---------------------------------------------------------------- static --

function buildStatic(state: GameState, loc: Location): StaticCache {
  const lot = loc.lot;
  const canvas = document.createElement('canvas');
  canvas.width = lot.w * PX;
  canvas.height = lot.h * PX;
  const g = canvas.getContext('2d')!;
  g.scale(PX, PX);
  // Floors.
  for (let y = 0; y < lot.h; y += 1) {
    for (let x = 0; x < lot.w; x += 1) {
      const z = zoneAt(lot, x, y);
      const base = floorColor(z, lot);
      g.fillStyle = base;
      g.fillRect(x, y, 1.02, 1.02);
      const r = rand(x, y);
      if (z === 'a') {
        g.fillStyle = `rgba(255,255,255,${0.015 + r * 0.03})`;
        g.fillRect(x + r * 0.7, y + rand(y, x) * 0.7, 0.08, 0.08);
      } else if (z === 'g') {
        g.fillStyle = r < 0.5 ? 'rgba(90,150,90,0.35)' : 'rgba(20,50,25,0.35)';
        for (let i = 0; i < 3; i += 1) g.fillRect(x + rand(x, y, i) * 0.9, y + rand(y, x, i) * 0.9, 0.07, 0.16);
      } else if (z === 't' || z === '.') {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let i = 0; i < 2; i += 1) g.fillRect(x + rand(x, y, i + 3) * 0.9, y + rand(y, x, i + 5) * 0.9, 0.1, 0.1);
      } else if (z === 'x') {
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.lineWidth = 0.04;
        g.strokeRect(x + (y % 2 ? 0.5 : 0), y, 1, 0.5);
        g.strokeRect(x + (y % 2 ? 0 : 0.5), y + 0.5, 1, 0.5);
      } else if (isIndoor(z)) {
        const floor = FLOOR_STYLES.find((st) => st.id === styleFor(lot, z).floor) ?? FLOOR_STYLES[0];
        if (floor.id === 'wood') {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x, y + ((x % 3) * 0.33) % 1, 1, 0.03);
          g.fillRect(x, y + 0.5, 1, 0.02);
        } else if (floor.id === 'marble') {
          g.strokeStyle = `rgba(120,110,100,${0.08 + r * 0.1})`;
          g.lineWidth = 0.02;
          g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + rand(y, x), y + 1); g.stroke();
          g.strokeStyle = 'rgba(0,0,0,0.05)';
          g.strokeRect(x, y, 1, 1);
        } else if (floor.id === 'tile' || floor.id === 'premium' || z === 'w' || z === 'd') {
          g.strokeStyle = z === 'w' || z === 'd' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)';
          g.lineWidth = 0.03;
          g.strokeRect(x, y, 1, 1);
        } else if (floor.id === 'dark') {
          g.fillStyle = `rgba(255,255,255,${0.02 + r * 0.03})`;
          g.fillRect(x, y, 1, 1);
        } else {
          g.fillStyle = `rgba(0,0,0,${r * 0.05})`;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  lineIndex = new Set(lot.objects.filter((o) => OBJ_BY_ID[o.defId]?.line).map((o) => `${o.defId}:${o.x}:${o.y}`));
  // Objects standing on the floor (vehicle spaces first, then everything else).
  const objs = [...lot.objects].sort((a, b) => layer(a) - layer(b) || a.y - b.y);
  for (const o of objs) drawObject(g, o, loc, state, 0, false);

  // Walls with doors and windows.
  drawWalls(g, lot);

  // Outdoor darkness mask (white = outside, gets darkened at dusk).
  const shade = document.createElement('canvas');
  shade.width = lot.w * 4;
  shade.height = lot.h * 4;
  const sg = shade.getContext('2d')!;
  sg.scale(4, 4);
  for (let y = 0; y < lot.h; y += 1) {
    for (let x = 0; x < lot.w; x += 1) {
      const z = zoneAt(lot, x, y);
      sg.fillStyle = isIndoor(z) ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,1)';
      sg.fillRect(x, y, 1, 1);
    }
  }

  return { lot, version: lot.version, styleKey: styleKey(lot, state), canvas, shade, rooms: findRooms(lot) };
}

function styleKey(lot: Lot, state: GameState): string {
  return `${lot.style.floor}|${lot.style.walls}|${lot.style.lighting}|${JSON.stringify(lot.roomStyles ?? {})}|${state.companyName}`;
}

function layer(o: LotObject): number {
  const def = OBJ_BY_ID[o.defId];
  if (!def) return 5;
  if (def.id === 'rug') return 0;
  if (def.slot) return 1;
  if (def.id === 'door' || def.id === 'window') return 9;
  if (def.walkable && !def.edge && def.effects?.lighting) return 10;
  if (def.id === 'tree' || def.id === 'palm' || def.id === 'pylon' || def.id === 'lamp' || def.id === 'flag' || def.id === 'floodlight' || def.id === 'billboard') return 8;
  return 4;
}

function findRooms(lot: Lot): StaticCache['rooms'] {
  const seen = new Uint8Array(lot.w * lot.h);
  const rooms: StaticCache['rooms'] = [];
  for (let i = 0; i < lot.zones.length; i += 1) {
    if (seen[i]) continue;
    const code = lot.zones[i] as ZoneCode;
    if (code === '.' || code === 'g' || code === 'a') { seen[i] = 1; continue; }
    const q = [i];
    seen[i] = 1;
    let sx = 0;
    let sy = 0;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (let k = 0; k < q.length; k += 1) {
      const j = q[k];
      const x = j % lot.w;
      const y = Math.floor(j / lot.w);
      sx += x; sy += y;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= lot.w || ny >= lot.h) continue;
        const ni = ny * lot.w + nx;
        if (seen[ni] || lot.zones[ni] !== code) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    rooms.push({ code, x: sx / q.length + 0.5, y: y0 + 0.9, tiles: q.length, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return rooms;
}

function drawWalls(g: CanvasRenderingContext2D, lot: Lot): void {
  const doors = new Set<number>();
  const windows = new Set<number>();
  for (const o of lot.objects) {
    const door = isDoor(o.defId) && OBJ_BY_ID[o.defId]?.edge === 'boundary';
    const win = o.defId === 'window' || o.defId === 'bigwindow' || o.defId === 'glassdoor';
    if (!door && !win) continue;
    const f = footprint(o);
    for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) (door ? doors : windows).add(y * lot.w + x);
  }
  const T = 0.24;
  const segs: { x: number; y: number; w: number; h: number; kind: 'wall' | 'glass' | 'door'; room: ZoneCode }[] = [];
  const idx = (x: number, y: number): number => (x < 0 || y < 0 || x >= lot.w || y >= lot.h ? -1 : y * lot.w + x);
  const edge = (ax: number, ay: number, bx: number, by: number, vertical: boolean): void => {
    const za = zoneAt(lot, ax, ay);
    const zb = zoneAt(lot, bx, by);
    const outA = idx(ax, ay) < 0;
    const outB = idx(bx, by) < 0;
    const ia = !outA && isIndoor(za);
    const ib = !outB && isIndoor(zb);
    if (!(ia || ib)) return;
    if (!outA && !outB && za === zb) return;
    const i = idx(ax, ay);
    const j = idx(bx, by);
    const kind = (i >= 0 && doors.has(i)) || (j >= 0 && doors.has(j)) ? 'door' : (i >= 0 && windows.has(i)) || (j >= 0 && windows.has(j)) ? 'glass' : 'wall';
    // The wall takes the finish of the room it belongs to (the indoor side).
    const room = ia ? za : zb;
    if (vertical) segs.push({ x: bx - T / 2, y: by - 0.02, w: T, h: 1.04, kind, room });
    else segs.push({ x: bx - 0.02, y: by - T / 2, w: 1.04, h: T, kind, room });
  };
  for (let y = -1; y < lot.h; y += 1) {
    for (let x = -1; x < lot.w; x += 1) {
      if (y >= 0) edge(x, y, x + 1, y, true);
      if (x >= 0) edge(x, y, x, y + 1, false);
    }
  }
  // Shadow, then the wall body, then a top highlight.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (const s of segs) if (s.kind === 'wall') g.fillRect(s.x + 0.1, s.y + 0.14, s.w, s.h);
  for (const s of segs) {
    if (s.kind === 'door') {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(s.x, s.y, s.w, s.h);
      continue;
    }
    if (s.kind === 'glass') {
      g.fillStyle = 'rgba(159,216,255,0.75)';
      g.fillRect(s.x + (s.w > s.h ? 0 : s.w * 0.25), s.y + (s.h > s.w ? 0 : s.h * 0.25), s.w > s.h ? s.w : s.w * 0.5, s.h > s.w ? s.h : s.h * 0.5);
      continue;
    }
    const wall = WALL_STYLES.find((w) => w.id === styleFor(lot, s.room).walls) ?? WALL_STYLES[0];
    g.fillStyle = shadeHex(wall.color, -35);
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = wall.color;
    g.fillRect(s.x + 0.03, s.y + 0.03, s.w - 0.06, s.h - 0.06);
    if (wall.id === 'glass') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(s.x + s.w * 0.4, s.y + s.h * 0.4, Math.max(0.03, s.w * 0.2), Math.max(0.03, s.h * 0.2));
    }
  }
}

// ------------------------------------------------------------- objects --

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

const BRANDED = new Set(['logowall', 'brandbanner', 'brandportal', 'flagrow', 'digitalpylon']);

/** Draws one fixture in tile units. `t` animates screens and turntables. */
export function drawObject(g: CanvasRenderingContext2D, o: LotObject, loc: Location | null, state: GameState | null, t: number, ghost: boolean): void {
  const def = OBJ_BY_ID[o.defId];
  if (!def) return;
  const f = footprint(o);
  const { x, y, w, h } = f;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const shadow = (): void => {
    if (ghost) return;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(g, x + 0.12, y + 0.16, w - 0.1, h - 0.1, 0.15);
    g.fill();
  };
  g.save();
  switch (def.id) {
    case 'parking':
    case 'frontrow':
    case 'occasion':
    case 'evparking':
    case 'visitorparking':
    case 'prepspot':
    case 'solarcarport':
    case 'storage': {
      if (def.id === 'solarcarport') {
        // A translucent solar roof over the bay.
        g.fillStyle = 'rgba(40,70,120,0.35)';
        g.fillRect(x + 0.1, y + 0.1, w - 0.2, h - 0.2);
        g.strokeStyle = 'rgba(160,200,255,0.35)';
        g.lineWidth = 0.03;
        for (let i = 1; i < 4; i += 1) { g.beginPath(); if (h >= w) { g.moveTo(x + 0.1, y + (h * i) / 4); g.lineTo(x + w - 0.1, y + (h * i) / 4); } else { g.moveTo(x + (w * i) / 4, y + 0.1); g.lineTo(x + (w * i) / 4, y + h - 0.1); } g.stroke(); }
      }
      const tint: Record<string, string> = { solarcarport: 'rgba(47,209,139,0.9)', parking: 'rgba(238,241,244,0.85)', frontrow: 'rgba(255,194,51,0.95)', occasion: 'rgba(47,209,139,0.9)', evparking: 'rgba(47,209,139,0.9)', visitorparking: 'rgba(60,199,255,0.9)', prepspot: 'rgba(163,171,182,0.7)', storage: 'rgba(210,190,120,0.55)' };
      g.strokeStyle = tint[def.id] ?? tint.parking;
      if (def.id !== 'parking' && def.id !== 'storage') {
        // A painted symbol at the back of the bay says what kind of space it is.
        g.font = `${Math.min(w, h) * 0.34}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.globalAlpha = 0.85;
        g.fillText(def.id === 'visitorparking' ? '🅿️' : def.icon, h >= w ? cx : x + 0.7, h >= w ? y + 0.7 : cy);
        g.globalAlpha = 1;
      }
      g.lineWidth = 0.1;
      g.beginPath();
      if (h >= w) {
        g.moveTo(x + 0.05, y + h); g.lineTo(x + 0.05, y + 0.05); g.lineTo(x + w - 0.05, y + 0.05); g.lineTo(x + w - 0.05, y + h);
      } else {
        g.moveTo(x + w, y + 0.05); g.lineTo(x + 0.05, y + 0.05); g.lineTo(x + 0.05, y + h - 0.05); g.lineTo(x + w, y + h - 0.05);
      }
      g.stroke();
      break;
    }
    case 'display':
    case 'premiumdisplay':
    case 'evdisplay':
    case 'premiumparking': {
      const rgb = def.id === 'premiumdisplay' || def.id === 'premiumparking' ? '255,194,51' : def.id === 'evdisplay' ? '47,209,139' : '255,154,77';
      const grd = g.createRadialGradient(cx, cy, 0.3, cx, cy, Math.max(w, h) * 0.65);
      grd.addColorStop(0, `rgba(${rgb},0.28)`);
      grd.addColorStop(1, `rgba(${rgb},0.02)`);
      g.fillStyle = grd;
      roundRect(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.5);
      g.fill();
      g.strokeStyle = `rgba(${rgb},0.9)`;
      g.lineWidth = def.id === 'premiumdisplay' ? 0.12 : 0.07;
      g.stroke();
      if (def.id === 'premiumdisplay') {
        g.strokeStyle = `rgba(${rgb},0.45)`;
        g.lineWidth = 0.04;
        roundRect(g, x + 0.35, y + 0.35, w - 0.7, h - 0.7, 0.4);
        g.stroke();
      }
      if (def.id === 'evdisplay') { g.fillStyle = '#2fd18b'; g.fillRect(x + w - 0.5, y + 0.2, 0.3, 0.3); }
      break;
    }
    case 'carpos': {
      if (ghost) break;
      break;
    }
    case 'wall':
    case 'glasswall':
    case 'fence':
    case 'hedge': {
      // Connects to its neighbours so a drawn line reads as one wall.
      const n = (dx: number, dy: number): boolean => lineIndex.has(`${def.id}:${o.x + dx}:${o.y + dy}`);
      const t = def.id === 'hedge' ? 0.7 : def.id === 'fence' ? 0.14 : 0.3;
      const col = def.id === 'glasswall' ? 'rgba(159,216,255,0.8)' : def.id === 'hedge' ? '#2f6a3a' : def.id === 'fence' ? '#8d949c' : def.color;
      const bar = (bx: number, by: number, bw: number, bh: number): void => { g.fillRect(bx, by, bw, bh); };
      if (!ghost && def.id !== 'glasswall' && def.id !== 'fence') { g.fillStyle = 'rgba(0,0,0,0.28)'; bar(cx - t / 2 + 0.08, cy - t / 2 + 0.1, t, t); }
      g.fillStyle = col;
      bar(cx - t / 2, cy - t / 2, t, t);
      if (n(1, 0)) bar(cx, cy - t / 2, 0.51, t);
      if (n(-1, 0)) bar(x - 0.01, cy - t / 2, 0.51, t);
      if (n(0, 1)) bar(cx - t / 2, cy, t, 0.51);
      if (n(0, -1)) bar(cx - t / 2, y - 0.01, t, 0.51);
      if (def.id === 'hedge') { g.fillStyle = 'rgba(90,160,90,0.5)'; g.beginPath(); g.arc(cx - 0.1, cy - 0.1, 0.18, 0, Math.PI * 2); g.fill(); }
      if (def.id === 'fence') { g.fillStyle = '#51606f'; g.fillRect(cx - 0.08, cy - 0.08, 0.16, 0.16); }
      break;
    }
    case 'walldoor': {
      g.fillStyle = 'rgba(200,204,210,0.35)';
      g.fillRect(x + 0.1, y + 0.1, 0.8, 0.8);
      g.strokeStyle = 'rgba(200,204,210,0.8)';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(x + 0.1, y + 0.1, 0.75, 0, Math.PI / 2); g.stroke();
      break;
    }
    case 'spotlight':
    case 'pendant':
    case 'ledstrip': {
      // Hangs from the ceiling: seen from above as small lights.
      g.fillStyle = def.id === 'ledstrip' ? 'rgba(255,255,255,0.8)' : 'rgba(255,240,200,0.85)';
      if (def.id === 'ledstrip') g.fillRect(x + 0.1, cy - 0.06, w - 0.2, 0.12);
      else for (const [dx, dy] of def.id === 'spotlight' ? [[0.3, 0.3], [0.7, 0.3], [0.5, 0.7]] : [[0.5, 0.5]]) { g.beginPath(); g.arc(x + dx, y + dy, def.id === 'pendant' ? 0.25 : 0.1, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'turntable': {
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.arc(cx, cy, Math.min(w, h) / 2 - 0.1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffc233';
      g.lineWidth = 0.1;
      g.stroke();
      g.strokeStyle = 'rgba(255,194,51,0.35)';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(cx, cy, Math.min(w, h) / 2 - 0.6, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'charger':
    case 'hpcharger': {
      shadow();
      g.fillStyle = def.id === 'hpcharger' ? '#12241d' : '#1d2b25';
      roundRect(g, x + 0.15, y + 0.1, w - 0.3, h - 0.2, 0.12); g.fill();
      g.fillStyle = '#2fd18b';
      g.fillRect(x + 0.35, y + 0.25, Math.max(0.3, w - 0.7), 0.2);
      if (def.id === 'hpcharger') {
        // Pulsing light: it is charging.
        g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + o.x);
        g.fillStyle = '#9dffd6';
        g.beginPath(); g.arc(cx, y + h - 0.35, 0.12, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
      break;
    }
    case 'deliverybay': {
      // A lit reveal pad with a bow.
      const grd = g.createRadialGradient(cx, cy, 0.2, cx, cy, Math.max(w, h) * 0.6);
      grd.addColorStop(0, 'rgba(155,140,255,0.35)');
      grd.addColorStop(1, 'rgba(155,140,255,0.03)');
      g.fillStyle = grd;
      roundRect(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.5); g.fill();
      g.strokeStyle = 'rgba(190,180,255,0.8)';
      g.lineWidth = 0.08;
      g.setLineDash([0.4, 0.25]);
      g.stroke();
      g.setLineDash([]);
      g.font = `${Math.min(w, h) * 0.35}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🎁', cx, cy);
      break;
    }
    case 'carwash': {
      g.fillStyle = 'rgba(60,199,255,0.14)';
      g.fillRect(x + 0.1, y + 0.1, w - 0.2, h - 0.2);
      g.strokeStyle = 'rgba(60,199,255,0.75)';
      g.lineWidth = 0.08;
      g.strokeRect(x + 0.1, y + 0.1, w - 0.2, h - 0.2);
      // Rotating brushes.
      const spin = t * 4;
      for (const [bx, by] of h >= w ? [[x + 0.5, cy], [x + w - 0.5, cy]] : [[cx, y + 0.5], [cx, y + h - 0.5]]) {
        g.fillStyle = '#3cc7ff';
        g.beginPath(); g.arc(bx, by, 0.32, spin, spin + Math.PI * 1.5); g.lineTo(bx, by); g.fill();
      }
      break;
    }
    case 'lift': {
      g.fillStyle = 'rgba(255,194,51,0.10)';
      g.fillRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
      g.strokeStyle = 'rgba(255,194,51,0.55)';
      g.setLineDash([0.3, 0.2]);
      g.lineWidth = 0.06;
      g.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
      g.setLineDash([]);
      g.fillStyle = '#ffc233';
      const posts = h >= w ? [[x + 0.15, y + h * 0.35], [x + w - 0.45, y + h * 0.35]] : [[x + w * 0.35, y + 0.15], [x + w * 0.35, y + h - 0.45]];
      for (const [px, py] of posts) g.fillRect(px, py, 0.3, 0.3);
      g.fillStyle = '#6b7480';
      if (h >= w) { g.fillRect(x + 0.45, y + h * 0.35 + 0.1, w - 0.9, 0.1); } else { g.fillRect(x + w * 0.35 + 0.1, y + 0.45, 0.1, h - 0.9); }
      break;
    }
    case 'washbay': {
      g.fillStyle = 'rgba(60,199,255,0.12)';
      g.fillRect(x + 0.15, y + 0.15, w - 0.3, h - 0.3);
      g.strokeStyle = 'rgba(60,199,255,0.6)';
      g.lineWidth = 0.06;
      g.strokeRect(x + 0.15, y + 0.15, w - 0.3, h - 0.3);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.05;
      for (let i = 0; i < 5; i += 1) {
        g.beginPath();
        if (h >= w) { g.moveTo(cx - 0.6, cy - 0.4 + i * 0.2); g.lineTo(cx + 0.6, cy - 0.4 + i * 0.2); } else { g.moveTo(cx - 0.4 + i * 0.2, cy - 0.6); g.lineTo(cx - 0.4 + i * 0.2, cy + 0.6); }
        g.stroke();
      }
      break;
    }
    case 'paintbooth':
    case 'photostudio': {
      shadow();
      g.fillStyle = def.id === 'paintbooth' ? 'rgba(231,76,60,0.18)' : 'rgba(238,241,244,0.85)';
      roundRect(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.3); g.fill();
      g.strokeStyle = def.id === 'paintbooth' ? '#e74c3c' : '#9aa3ad';
      g.lineWidth = 0.08;
      g.stroke();
      if (def.id === 'photostudio') {
        g.fillStyle = '#ffe8a8';
        for (const [px, py] of [[x + 0.4, y + 0.4], [x + w - 0.7, y + 0.4]]) { g.beginPath(); g.arc(px + 0.15, py + 0.15, 0.22, 0, Math.PI * 2); g.fill(); }
      } else {
        g.strokeStyle = 'rgba(0,0,0,0.3)';
        g.beginPath(); g.arc(cx, cy, 0.6, 0, Math.PI * 2); g.stroke();
      }
      break;
    }
    case 'salesdesk':
    case 'officedesk': {
      shadow();
      g.fillStyle = def.id === 'salesdesk' ? '#d9d2c4' : '#b8bec6';
      roundRect(g, x + 0.1, y + 0.15, w - 0.2, h * 0.55, 0.1); g.fill();
      g.fillStyle = '#1a1d22';
      g.fillRect(cx - 0.35, y + 0.28, 0.7, 0.12);
      g.fillStyle = def.id === 'salesdesk' ? '#ff7a1a' : '#51606f';
      g.beginPath(); g.arc(cx, y + h - 0.45, 0.32, 0, Math.PI * 2); g.fill();
      if (def.id === 'salesdesk') {
        g.fillStyle = '#6b7480';
        g.beginPath(); g.arc(x + 0.45, y + 0.05 + 0.02, 0.2, 0, Math.PI); g.fill();
      }
      break;
    }
    case 'receptiondesk': {
      shadow();
      g.fillStyle = '#d9c7a8';
      roundRect(g, x + 0.05, y + 0.1, w - 0.1, h - 0.2, 0.4); g.fill();
      g.fillStyle = '#8a6a4a';
      g.fillRect(x + 0.2, y + h - 0.3, w - 0.4, 0.12);
      break;
    }
    case 'sofa':
    case 'armchair':
    case 'bench': {
      shadow();
      g.fillStyle = def.color;
      roundRect(g, x + 0.05, y + 0.08, w - 0.1, h - 0.16, 0.22); g.fill();
      g.fillStyle = shadeHex(def.color, 30);
      const n = Math.max(1, Math.round(Math.max(w, h)));
      for (let i = 0; i < n; i += 1) {
        if (w >= h) roundRect(g, x + 0.15 + (i * (w - 0.3)) / n, y + 0.25, (w - 0.3) / n - 0.08, h - 0.45, 0.12);
        else roundRect(g, x + 0.25, y + 0.15 + (i * (h - 0.3)) / n, w - 0.45, (h - 0.3) / n - 0.08, 0.12);
        g.fill();
      }
      break;
    }
    case 'coffeetable': {
      shadow();
      g.fillStyle = '#8a6a4a';
      roundRect(g, x + 0.15, y + 0.2, w - 0.3, h - 0.4, 0.15); g.fill();
      g.fillStyle = '#eef1f4';
      g.fillRect(cx - 0.25, cy - 0.12, 0.3, 0.2);
      break;
    }
    case 'coffee': {
      shadow();
      g.fillStyle = '#3a2a20';
      roundRect(g, x + 0.15, y + 0.12, w - 0.3, h - 0.24, 0.1); g.fill();
      g.fillStyle = '#ff9a4d';
      g.beginPath(); g.arc(cx, cy + 0.05, 0.12, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'tv':
    case 'ledwall':
    case 'neon': {
      shadow();
      g.fillStyle = '#0c0e11';
      roundRect(g, x + 0.05, y + 0.25, w - 0.1, h - 0.5, 0.08); g.fill();
      const col = def.id === 'neon' ? '#ff4dd2' : def.id === 'ledwall' ? '#3cc7ff' : '#9b8cff';
      g.fillStyle = col;
      g.globalAlpha = ghost ? 0.5 : 0.85;
      g.fillRect(x + 0.18, y + 0.35, w - 0.36, h - 0.7);
      g.globalAlpha = 1;
      break;
    }
    case 'kids': {
      g.fillStyle = '#ff6b81';
      roundRect(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.4); g.fill();
      for (const [dx, dy, c] of [[0.8, 0.8, '#ffc233'], [2, 1.1, '#3cc7ff'], [1.3, 2, '#2fd18b']] as [number, number, string][]) {
        g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, 0.28, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'plant':
    case 'planter': {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.arc(cx + 0.1, cy + 0.12, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = def.id === 'plant' ? '#6b4a32' : '#8a6a4a';
      g.beginPath(); g.arc(cx, cy, 0.34, 0, Math.PI * 2); g.fill();
      g.fillStyle = def.id === 'plant' ? '#2f8a4a' : '#e1a84a';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath(); g.arc(cx + Math.cos(a) * 0.16, cy + Math.sin(a) * 0.16, 0.17, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'tree': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(cx + 0.35, cy + 0.4, 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#23603a';
      g.beginPath(); g.arc(cx, cy, 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f7a4a';
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath(); g.arc(cx + Math.cos(a) * 0.45, cy + Math.sin(a) * 0.45, 0.42, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.arc(cx - 0.3, cy - 0.3, 0.35, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'poster': {
      g.fillStyle = '#ff7a1a';
      g.fillRect(x + 0.15, y + 0.2, 0.7, 0.55);
      g.fillStyle = '#fff';
      g.fillRect(x + 0.25, y + 0.3, 0.5, 0.12);
      break;
    }
    case 'infoboard': {
      shadow();
      g.fillStyle = '#eef1f4';
      g.fillRect(x + 0.2, y + 0.2, 0.6, 0.6);
      g.fillStyle = '#51606f';
      for (let i = 0; i < 3; i += 1) g.fillRect(x + 0.28, y + 0.3 + i * 0.15, 0.44, 0.06);
      break;
    }
    case 'rug': {
      g.fillStyle = '#7a2a2a';
      g.fillRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
      g.strokeStyle = '#c9a36b';
      g.lineWidth = 0.06;
      g.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
      break;
    }
    case 'gate': {
      g.fillStyle = 'rgba(255,122,26,0.18)';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#e9ecef';
      for (let i = 0; i < 4; i += 1) g.fillRect(x + 0.3 + i * (w - 0.6) / 4, y + h - 0.35, (w - 0.6) / 8, 0.2);
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.moveTo(cx, y + 0.25); g.lineTo(cx + 0.45, y + 0.8); g.lineTo(cx - 0.45, y + 0.8); g.closePath(); g.fill();
      g.fillStyle = '#6b7480';
      g.fillRect(x - 0.05, y + 0.2, 0.25, h - 0.3);
      g.fillRect(x + w - 0.2, y + 0.2, 0.25, h - 0.3);
      break;
    }
    case 'pylon': {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 0.5, y + 0.6, w - 0.4, h - 0.4);
      g.fillStyle = '#51606f';
      g.fillRect(cx - 0.12, y + 0.8, 0.24, h - 0.8);
      g.fillStyle = state?.branding?.color ?? '#ff7a1a';
      roundRect(g, x + 0.05, y - 0.6, w - 0.1, 1.5, 0.15); g.fill();
      g.fillStyle = '#1a0a00';
      g.font = 'bold 0.8px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(initials(state?.companyName ?? 'CD'), cx, y + 0.15);
      break;
    }
    case 'banner': {
      g.fillStyle = '#ffc233';
      g.fillRect(x + 0.05, y + 0.25, w - 0.1, h - 0.5);
      g.fillStyle = '#c85400';
      g.font = 'bold 0.4px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SALE', cx, cy + 0.02);
      break;
    }
    case 'flag': {
      g.fillStyle = '#9aa3ad';
      g.beginPath(); g.arc(cx, cy, 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = ((o.x + o.y) % 2 ? '#3cc7ff' : (state?.branding?.color ?? '#ff7a1a'));
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 0.9, cy - 0.25); g.lineTo(cx + 0.1, cy - 0.55); g.closePath(); g.fill();
      break;
    }
    case 'lamp':
    case 'camera': {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.arc(cx + 0.08, cy + 0.1, 0.25, 0, Math.PI * 2); g.fill();
      g.fillStyle = def.id === 'lamp' ? '#ffe8a8' : '#6b7480';
      g.beginPath(); g.arc(cx, cy, def.id === 'lamp' ? 0.22 : 0.18, 0, Math.PI * 2); g.fill();
      if (def.id === 'camera') { g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(cx + 0.06, cy - 0.05, 0.05, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'door':
    case 'glassdoor':
    case 'window':
    case 'bigwindow': {
      if (!ghost) break;
      g.fillStyle = def.id === 'door' ? 'rgba(163,171,182,0.8)' : 'rgba(159,216,255,0.8)';
      g.fillRect(x + 0.05, y + 0.3, w - 0.1, h - 0.6);
      break;
    }
    case 'arrows': {
      g.fillStyle = 'rgba(233,236,239,0.8)';
      const vert = h >= w;
      g.save(); g.translate(cx, cy); if (!vert) g.rotate(Math.PI / 2);
      g.fillRect(-0.12, -0.2, 0.24, 0.9);
      g.beginPath(); g.moveTo(0, -0.8); g.lineTo(0.38, -0.2); g.lineTo(-0.38, -0.2); g.closePath(); g.fill();
      g.restore();
      break;
    }
    case 'crossing': {
      g.fillStyle = 'rgba(240,240,240,0.85)';
      if (w >= h) for (let i = 0; i < w * 2 - 1; i += 2) g.fillRect(x + 0.1 + i * 0.5, y + 0.1, 0.45, h - 0.2);
      else for (let i = 0; i < h * 2 - 1; i += 2) g.fillRect(x + 0.1, y + 0.1 + i * 0.5, w - 0.2, 0.45);
      break;
    }
    case 'tdlane': {
      g.fillStyle = 'rgba(255,194,51,0.75)';
      g.fillRect(x + 0.1, cy - 0.08, 0.8, 0.16);
      g.fillRect(cx - 0.08, y + 0.1, 0.16, 0.8);
      break;
    }
    case 'canopy':
    case 'roofcanopy': {
      g.fillStyle = 'rgba(200,204,210,0.28)';
      roundRect(g, x + 0.05, y + 0.05, w - 0.1, h - 0.1, 0.2); g.fill();
      g.strokeStyle = 'rgba(238,241,244,0.7)';
      g.lineWidth = 0.08;
      g.stroke();
      g.fillStyle = '#8d949c';
      for (const [px, py] of [[x + 0.2, y + 0.2], [x + w - 0.4, y + 0.2], [x + 0.2, y + h - 0.4], [x + w - 0.4, y + h - 0.4]]) g.fillRect(px, py, 0.2, 0.2);
      break;
    }
    case 'staffparking':
    case 'vipparking': {
      g.strokeStyle = def.id === 'vipparking' ? 'rgba(212,175,55,0.9)' : 'rgba(142,124,195,0.85)';
      g.lineWidth = 0.1;
      g.strokeRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
      g.font = `${Math.min(w, h) * 0.4}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.icon, cx, cy);
      break;
    }
    case 'rug':
    case 'runner': {
      g.fillStyle = def.color;
      g.fillRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
      g.strokeStyle = '#c9a36b';
      g.lineWidth = 0.06;
      g.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
      break;
    }
    default: {
      // Everything else: a solid piece in its colour with its symbol on top.
      // Branded pieces (logo wall, banners, flags, portals) carry your colours and logo.
      shadow();
      const branded = BRANDED.has(def.id) && state?.branding;
      g.fillStyle = branded ? state!.branding.color : def.color;
      roundRect(g, x + 0.08, y + 0.08, w - 0.16, h - 0.16, Math.min(0.3, Math.min(w, h) * 0.25)); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x + 0.2, y + 0.18, w - 0.4, 0.1);
      g.font = `${Math.min(w, h) * 0.62}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(branded ? state!.branding.logo : def.icon, cx, cy + 0.04);
    }
  }
  g.restore();
  // Upgraded fixtures carry a small level badge.
  if (!ghost && (o.level ?? 1) > 1) {
    g.fillStyle = (o.level ?? 1) >= 3 ? '#ffc233' : '#3cc7ff';
    g.beginPath(); g.arc(x + w - 0.3, y + 0.3, 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c0e11';
    g.font = 'bold 0.34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(o.level), x + w - 0.3, y + 0.31);
  }
  void loc; void t;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// ---------------------------------------------------------------- cars --

export function drawCar(g: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, body: string, alpha = 1): void {
  const long = body === 'Van' || body === 'Pickup' ? 4.7 : body === 'SUV' || body === 'Crossover' || body === 'Wagon' || body === 'Offroader' ? 4.4 : body === 'Coupe' || body === 'Convertible' ? 4.2 : 4.0;
  const wide = body === 'Van' || body === 'SUV' || body === 'Pickup' || body === 'Crossover' ? 1.9 : body === 'Offroader' ? 1.96 : 1.78;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(angle);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(g, -long / 2 + 0.15, -wide / 2 + 0.2, long, wide, 0.45);
  g.fill();
  // Wheels.
  g.fillStyle = '#0d0f12';
  for (const [wx, wy] of [[-long * 0.3, -wide / 2 - 0.04], [long * 0.28, -wide / 2 - 0.04], [-long * 0.3, wide / 2 - 0.2], [long * 0.28, wide / 2 - 0.2]]) g.fillRect(wx - 0.3, wy, 0.6, 0.24);
  // Body.
  const grd = g.createLinearGradient(0, -wide / 2, 0, wide / 2);
  grd.addColorStop(0, shadeHex(color, 40));
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, shadeHex(color, -45));
  g.fillStyle = grd;
  roundRect(g, -long / 2, -wide / 2, long, wide, 0.45);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 0.05;
  g.stroke();
  // Glass: windscreen at the front (+x), rear window, roof.
  const pickup = body === 'Pickup';
  g.fillStyle = 'rgba(20,28,38,0.92)';
  const cabin = pickup ? [-0.1, 1.3] : body === 'Van' ? [-long / 2 + 0.3, long * 0.3] : [-long * 0.28, long * 0.22];
  roundRect(g, cabin[0], -wide / 2 + 0.18, cabin[1] - cabin[0], wide - 0.36, 0.3);
  g.fill();
  g.fillStyle = shadeHex(color, 18);
  roundRect(g, cabin[0] + 0.35, -wide / 2 + 0.28, cabin[1] - cabin[0] - 0.8, wide - 0.56, 0.2);
  g.fill();
  if (body === 'Convertible') {
    g.fillStyle = '#2a2320';
    roundRect(g, cabin[0] + 0.3, -wide / 2 + 0.3, cabin[1] - cabin[0] - 0.6, wide - 0.6, 0.2);
    g.fill();
  }
  if (body === 'Offroader') {
    // Roof rack and a spare wheel on the tailgate.
    g.strokeStyle = 'rgba(20,20,20,0.7)';
    g.lineWidth = 0.06;
    for (let i = 0; i < 4; i += 1) { const rx = cabin[0] + 0.4 + i * (cabin[1] - cabin[0] - 0.8) / 3; g.beginPath(); g.moveTo(rx, -wide / 2 + 0.3); g.lineTo(rx, wide / 2 - 0.3); g.stroke(); }
    g.fillStyle = '#0d0f12';
    g.beginPath(); g.arc(-long / 2 - 0.08, 0, 0.36, 0, Math.PI * 2); g.fill();
  }
  if (pickup) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(-long / 2 + 0.25, -wide / 2 + 0.25, long * 0.4, wide - 0.5);
  }
  // Lights.
  g.fillStyle = '#fff6d8';
  g.fillRect(long / 2 - 0.12, -wide / 2 + 0.2, 0.1, 0.35);
  g.fillRect(long / 2 - 0.12, wide / 2 - 0.55, 0.1, 0.35);
  g.fillStyle = '#ff4d5e';
  g.fillRect(-long / 2 + 0.02, -wide / 2 + 0.2, 0.1, 0.3);
  g.fillRect(-long / 2 + 0.02, wide / 2 - 0.5, 0.1, 0.3);
  // Sheen.
  g.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(g, -long / 2 + 0.3, -wide / 2 + 0.08, long - 0.6, 0.18, 0.08);
  g.fill();
  g.restore();
}

/** Where a car sits in its space: centre and heading. */
export function carPose(loc: Location, slotId: string, t: number): { x: number; y: number; angle: number } | null {
  const o = loc.lot.objects.find((x) => x.id === slotId);
  if (!o) return null;
  const f = footprint(o);
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  if (o.defId === 'turntable') return { x: cx, y: cy, angle: t * 0.25 };
  return { x: cx, y: cy, angle: f.h >= f.w ? Math.PI / 2 : 0 };
}

// --------------------------------------------------------------- people --

function drawPerson(g: CanvasRenderingContext2D, a: Agent, t: number, selected: boolean): void {
  g.save();
  g.globalAlpha = a.alpha;
  const bob = a.path.length ? Math.sin(a.walk) * 0.04 : a.state === 'work' ? Math.sin(t * 5 + a.x) * 0.03 : 0;
  g.translate(a.x, a.y + bob);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0.08, 0.12, 0.34, 0.26, 0, 0, Math.PI * 2); g.fill();
  if (selected) {
    g.strokeStyle = '#ff9a4d';
    g.lineWidth = 0.08;
    g.beginPath(); g.arc(0, 0, 0.55 + Math.sin(t * 6) * 0.04, 0, Math.PI * 2); g.stroke();
  }
  // Shoulders.
  g.rotate(a.path.length ? a.dir + Math.PI / 2 : 0);
  g.fillStyle = a.color;
  g.beginPath(); g.ellipse(0, 0, 0.36, 0.22, 0, 0, Math.PI * 2); g.fill();
  if (a.kind === 'staff') {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-0.05, -0.2, 0.1, 0.4);
  }
  g.fillStyle = a.skin;
  g.beginPath(); g.arc(0, 0, 0.17, 0, Math.PI * 2); g.fill();
  g.restore();
  if (a.kind === 'customer' && a.mood && a.alpha > 0.5) {
    // A coloured ring on the floor and a dot over the head: readable at any zoom.
    const col = a.mood === 'good' ? '#2fd18b' : a.mood === 'warn' ? '#ffc233' : '#ff4d5e';
    const pulse = a.mood === 'bad' ? 0.06 * Math.sin(t * 7) : 0;
    g.strokeStyle = col;
    g.globalAlpha = 0.85;
    g.lineWidth = 0.08;
    g.beginPath(); g.ellipse(a.x, a.y + 0.05, 0.5 + pulse, 0.38 + pulse, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = col;
    g.beginPath(); g.arc(a.x + 0.34, a.y - 0.46, 0.15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 0.04;
    g.stroke();
  }
}

// ---------------------------------------------------------------- frame --

export interface Hud { label: string; x: number; y: number; tone?: string; icon?: string; progress?: number; car?: boolean }

export function renderScene(canvas: HTMLCanvasElement, s: Scene): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const { cam, loc, state, dpr } = s;
  const lot = loc.lot;
  if (!cache || cache.lot !== lot || cache.version !== lot.version || cache.styleKey !== styleKey(lot, state)) cache = buildStatic(state, loc);
  const W = canvas.width;
  const H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#1b2a1f';
  g.fillRect(0, 0, W, H);
  const z = cam.zoom * dpr;
  const ox = W / 2 - cam.x * z;
  const oy = H / 2 - cam.y * z;
  g.setTransform(z, 0, 0, z, ox, oy);
  const view = { x0: cam.x - cam.width / 2 / cam.zoom - 2, y0: cam.y - cam.height / 2 / cam.zoom - 2, x1: cam.x + cam.width / 2 / cam.zoom + 2, y1: cam.y + cam.height / 2 / cam.zoom + 2 };

  // Surroundings: neighbouring land, the pavement and the road.
  g.fillStyle = '#243326';
  g.fillRect(view.x0, view.y0, view.x1 - view.x0, lot.h - view.y0);
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = Math.floor(view.x0 / 4) * 4; x < view.x1; x += 4) for (let y = Math.floor(view.y0 / 4) * 4; y < lot.h; y += 4) if (rand(x, y) < 0.35) g.fillRect(x, y, 0.2, 0.2);
  g.fillStyle = '#8d949c';
  g.fillRect(view.x0, lot.h, view.x1 - view.x0, 1);
  g.fillStyle = '#23262b';
  g.fillRect(view.x0, lot.h + 1, view.x1 - view.x0, 3.2);
  g.fillStyle = '#e9ecef';
  for (let x = Math.floor(view.x0 / 3) * 3; x < view.x1; x += 3) g.fillRect(x, lot.h + 2.55, 1.5, 0.1);
  g.fillStyle = '#8d949c';
  g.fillRect(view.x0, lot.h + 4.2, view.x1 - view.x0, 0.8);
  g.fillStyle = '#243326';
  g.fillRect(view.x0, lot.h + 5, view.x1 - view.x0, Math.max(0, view.y1 - lot.h - 5));
  // Property line.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-0.3, -0.3, lot.w + 0.6, lot.h + 0.3);

  // Land for sale next to the lot: hatched, with a lock and the price.
  const lockedHud: Hud[] = [];
  if (s.locked) {
    const L = s.locked;
    g.save();
    g.beginPath();
    g.rect(0, -L.dy, L.w, L.h);
    g.rect(0, 0, lot.w, lot.h);
    g.clip('evenodd');
    g.fillStyle = 'rgba(20,24,28,0.55)';
    g.fillRect(0, -L.dy, L.w, L.h);
    g.strokeStyle = 'rgba(255,194,51,0.16)';
    g.lineWidth = 0.25;
    g.beginPath();
    for (let k = -L.h; k < L.w + L.h; k += 2.2) { g.moveTo(k, -L.dy); g.lineTo(k - L.h, -L.dy + L.h); }
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,194,51,0.7)';
    g.lineWidth = 0.14;
    g.setLineDash([0.7, 0.45]);
    g.strokeRect(0, -L.dy, L.w, L.h);
    g.setLineDash([]);
    // Label over the biggest locked strip.
    const top = L.dy >= 3;
    lockedHud.push({ label: L.label, x: top ? L.w / 2 : lot.w + (L.w - lot.w) / 2, y: top ? -L.dy / 2 : lot.h / 2, tone: 'warn', icon: '🔒' });
  }

  // The lot itself.
  g.imageSmoothingEnabled = true;
  g.drawImage(cache.canvas, 0, 0, lot.w, lot.h);
  // Just bought: the new land lights up and fades in.
  if (s.expand && s.expand.p < 1) {
    const e = s.expand;
    const a = 1 - e.p;
    g.save();
    g.fillStyle = `rgba(255,194,51,${0.4 * a})`;
    g.fillRect(0, 0, lot.w, e.dy);
    g.fillRect(e.oldW, e.dy, lot.w - e.oldW, lot.h - e.dy);
    const sweep = e.p * (lot.w + lot.h);
    g.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
    g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(sweep, 0); g.lineTo(sweep - lot.h, lot.h); g.stroke();
    g.restore();
  }

  // Build mode: zone tint and grid.
  if (s.build) {
    g.globalAlpha = 0.18;
    for (let y = Math.max(0, Math.floor(view.y0)); y < Math.min(lot.h, view.y1); y += 1) {
      for (let x = Math.max(0, Math.floor(view.x0)); x < Math.min(lot.w, view.x1); x += 1) {
        const code = zoneAt(lot, x, y);
        if (code === '.' || code === 'a' || code === 'g') continue;
        g.fillStyle = ZONE_BY_CODE[code].color;
        g.fillRect(x, y, 1, 1);
      }
    }
    g.globalAlpha = 1;
    if (s.grid !== false && cam.zoom >= 8) {
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1 / z * dpr;
      g.beginPath();
      for (let x = 0; x <= lot.w; x += 1) { g.moveTo(x, 0); g.lineTo(x, lot.h); }
      for (let y = 0; y <= lot.h; y += 1) { g.moveTo(0, y); g.lineTo(lot.w, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,154,77,0.7)';
    g.lineWidth = 0.08;
    g.setLineDash([0.5, 0.3]);
    g.strokeRect(0, 0, lot.w, lot.h);
    g.setLineDash([]);
  }

  // Customer reach heat map.
  if (s.flow) {
    const st = lotStats(lot);
    for (let y = 0; y < lot.h; y += 1) {
      for (let x = 0; x < lot.w; x += 1) {
        const d = st.dist[y * lot.w + x];
        if (d < 0) continue;
        g.fillStyle = `rgba(47,209,139,${Math.max(0.05, 0.2 - d / 250)})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  const hud: Hud[] = [];
  const stats = lotStats(lot);

  // Turntables spin; screens glow.
  for (const o of lot.objects) {
    if (o.defId === 'turntable') {
      const f = footprint(o);
      g.save();
      g.translate(f.x + f.w / 2, f.y + f.h / 2);
      g.rotate(s.time * 0.25);
      g.strokeStyle = 'rgba(255,194,51,0.5)';
      g.lineWidth = 0.05;
      for (let i = 0; i < 6; i += 1) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0.4, 0); g.lineTo(2.4, 0); g.stroke(); }
      g.restore();
    }
  }

  // Parked cars.
  const hiddenIds = s.crowd.away;
  const cars = state.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'yard' || v.status === 'listed' || v.status === 'prep'));
  let curb = 0;
  for (const v of cars) {
    if (hiddenIds.has(v.id)) continue;
    let pose = v.slotId ? carPose(loc, v.slotId, s.time) : null;
    if (!pose) {
      // No space for it: parked on the street outside, which the neighbours hate.
      pose = { x: 2.5 + curb * 4.6, y: lot.h + 1.6, angle: 0 };
      curb += 1;
      hud.push({ label: 'No space', x: pose.x, y: pose.y - 1.2, tone: 'bad', icon: '!' });
    }
    const selected = s.selected?.kind === 'vehicle' && s.selected.id === v.id;
    if (selected) {
      g.strokeStyle = '#3cc7ff';
      g.lineWidth = 0.12;
      g.save();
      g.translate(pose.x, pose.y);
      g.rotate(pose.angle);
      roundRect(g, -2.45, -1.2, 4.9, 2.4, 0.6);
      g.stroke();
      g.restore();
    }
    drawCar(g, pose.x, pose.y, pose.angle, v.colorHex, v.body, s.moveCar === v.id ? 0.55 : 1);
    carBadge(state, loc, v, pose, hud, cam.zoom >= 34);
  }

  // Customers' cars in for service: at reception, waiting, on a lift, ready to collect.
  const serviceCars = carsInWorkshop(state, loc.id);
  if (serviceCars.length) {
    const taken = new Set(cars.map((v) => v.slotId).filter((x): x is string => !!x));
    const free = [...stats.slots.parking, ...stats.slots.storage].filter((o) => !taken.has(o.id));
    let fi = 0;
    for (const j of serviceCars) {
      let pose: { x: number; y: number; angle: number } | null = null;
      if ((j.stage === 'lift' || j.stage === 'check') && j.liftId) pose = carPose(loc, j.liftId, s.time);
      if (!pose) {
        const o = free[fi];
        fi += 1;
        if (o) pose = carPose(loc, o.id, s.time);
      }
      if (!pose) { pose = { x: 2.5 + curb * 4.6, y: lot.h + 1.6, angle: 0 }; curb += 1; }
      const model = MODEL_BY_NAME[j.vehicle];
      drawCar(g, pose.x, pose.y, pose.angle, SERVICE_COLORS[hashStr(j.id) % SERVICE_COLORS.length], model?.body ?? 'Hatchback', 1);
      const stage = j.stage === 'lift' ? { icon: '🔧', label: 'Being serviced', tone: 'info' } : j.stage === 'ready' ? { icon: '🟢', label: 'Ready', tone: 'good' } : j.stage === 'reception' ? { icon: '📋', label: 'Awaiting inspection', tone: 'warn' } : j.status === 'parts' ? { icon: '📦', label: 'Waiting for parts', tone: 'bad' } : { icon: '⏳', label: 'Waiting', tone: 'warn' };
      const progress = j.stage === 'lift' ? Math.max(0.08, 1 - j.hours / Math.max(0.1, j.totalHours)) : undefined;
      hud.push({ car: true, label: cam.zoom >= 34 ? stage.label : '', x: pose.x, y: pose.y - 1.5, tone: stage.tone, icon: stage.icon, progress });
    }
  }

  // Moving cars (sold, test drives) and road traffic.
  for (const c of [...s.crowd.cars, ...s.crowd.roadCars]) drawCar(g, c.x, c.y, c.angle, c.color, c.body, c.alpha);

  // People, sorted so nearer ones overlap farther ones.
  const people = [...s.crowd.agents.values()].sort((a, b) => a.y - b.y);
  for (const a of people) drawPerson(g, a, s.time, s.selected?.kind === 'agent' && s.selected.id === a.id);

  // Cars placed by hand: faint markings in build mode.
  if (s.build) {
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 0.05;
    g.setLineDash([0.25, 0.2]);
    for (const o of stats.slots.floor) { const f = footprint(o); g.strokeRect(f.x + 0.05, f.y + 0.05, f.w - 0.1, f.h - 0.1); }
    g.setLineDash([]);
  }

  // Selected fixture (blue), and where a dragged one came from.
  if (s.selected?.kind === 'object') {
    const o = lot.objects.find((x) => x.id === s.selected!.id);
    if (o) {
      const f = footprint(o);
      if (s.dragging === o.id) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(f.x, f.y, f.w, f.h);
      }
      g.strokeStyle = '#3cc7ff';
      g.lineWidth = 0.1 + Math.sin(s.time * 6) * 0.02;
      g.strokeRect(f.x - 0.1, f.y - 0.1, f.w + 0.2, f.h + 0.2);
    }
  }

  // Where can this car go?
  if (s.moveCar) {
    const used = new Map(state.vehicles.filter((v) => v.slotId && v.status !== 'sold').map((v) => [v.slotId as string, v.id]));
    for (const kind of ['parking', 'display', 'storage'] as const) {
      for (const o of stats.slots[kind]) {
        const f = footprint(o);
        const who = used.get(o.id);
        if (who === s.moveCar) continue;
        g.fillStyle = who ? 'rgba(255,194,51,0.22)' : 'rgba(47,209,139,0.28)';
        g.fillRect(f.x + 0.1, f.y + 0.1, f.w - 0.2, f.h - 0.2);
        g.strokeStyle = who ? '#ffc233' : '#2fd18b';
        g.lineWidth = 0.08;
        g.strokeRect(f.x + 0.1, f.y + 0.1, f.w - 0.2, f.h - 0.2);
      }
    }
  }

  // Layout problems in build mode.
  if (s.build) {
    for (const o of [...stats.slots.parking, ...stats.slots.display]) {
      if (stats.reachable.has(o.id)) continue;
      const f = footprint(o);
      hud.push({ label: 'Unreachable', x: f.x + f.w / 2, y: f.y + 0.6, tone: 'bad', icon: '⛔' });
    }
  }

  // Bulldoze: everything that would go is red.
  if (s.bulldoze && s.bulldoze.ids.length) {
    const pulse = 0.25 + 0.12 * Math.sin(s.time * 8);
    for (const id of s.bulldoze.ids) {
      const o = lot.objects.find((x) => x.id === id);
      if (!o) continue;
      const f = footprint(o);
      g.fillStyle = `rgba(255,77,94,${pulse})`;
      g.fillRect(f.x, f.y, f.w, f.h);
      g.strokeStyle = '#ff4d5e';
      g.lineWidth = 0.12;
      g.strokeRect(f.x - 0.05, f.y - 0.05, f.w + 0.1, f.h + 0.1);
    }
    const first = lot.objects.find((x) => x.id === s.bulldoze!.ids[0]);
    if (first && s.bulldoze.label) { const f = footprint(first); hud.push({ label: s.bulldoze.label, x: f.x + f.w / 2, y: f.y - 0.6, tone: 'bad', icon: '💥' }); }
  }
  for (const [r, col, fill] of [[s.area, '#ff4d5e', 'rgba(255,77,94,0.12)'], [s.room, '#3cc7ff', 'rgba(60,199,255,0.14)']] as [RectPreview | null | undefined, string, string][]) {
    if (!r) continue;
    const x0 = Math.min(r.x0, r.x1);
    const y0 = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0) + 1;
    const hh = Math.abs(r.y1 - r.y0) + 1;
    g.fillStyle = fill;
    g.fillRect(x0, y0, w, hh);
    g.strokeStyle = r.ok ? col : '#ff4d5e';
    g.lineWidth = 0.14;
    g.setLineDash([0.45, 0.3]);
    g.strokeRect(x0, y0, w, hh);
    g.setLineDash([]);
    hud.push({ label: r.label, x: x0 + w / 2, y: y0 - 0.6, tone: r.ok ? (col === '#3cc7ff' ? 'info' : 'bad') : 'bad' });
  }
  if (s.stamp) {
    const st = s.stamp;
    for (const [x0, y0, x1, y1, code] of st.plan.zones) {
      g.fillStyle = `${ZONE_BY_CODE[code]?.color ?? '#888888'}aa`;
      g.fillRect(st.x + x0, st.y + y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    g.globalAlpha = 0.75;
    for (const [id, ox, oy, rot] of st.plan.objects) drawObject(g, { id: 'stamp', defId: id, x: st.x + ox, y: st.y + oy, rot }, loc, state, s.time, true);
    g.globalAlpha = 1;
    g.strokeStyle = st.ok ? '#2fd18b' : '#ff4d5e';
    g.lineWidth = 0.14;
    g.strokeRect(st.x, st.y, st.plan.w, st.plan.h);
    hud.push({ label: st.label, x: st.x + st.plan.w / 2, y: st.y - 0.6, tone: st.ok ? 'good' : 'bad' });
  }

  // Zone painting preview.
  if (s.paint) {
    const p = s.paint;
    const x0 = Math.min(p.x0, p.x1);
    const y0 = Math.min(p.y0, p.y1);
    const w = Math.abs(p.x1 - p.x0) + 1;
    const h = Math.abs(p.y1 - p.y0) + 1;
    g.fillStyle = p.code === '.' ? 'rgba(255,77,94,0.25)' : `${ZONE_BY_CODE[p.code].color}88`;
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = p.ok ? '#2fd18b' : '#ff4d5e';
    g.lineWidth = 0.12;
    g.setLineDash([0.4, 0.25]);
    g.strokeRect(x0, y0, w, h);
    g.setLineDash([]);
    hud.push({ label: p.label, x: x0 + w / 2, y: y0 - 0.6, tone: p.ok ? 'good' : 'bad' });
  }

  // Placement ghost.
  if (s.ghost) {
    const gh = s.ghost;
    const def = OBJ_BY_ID[gh.defId];
    if (def) {
      const w = gh.rot ? def.h : def.w;
      const h = gh.rot ? def.w : def.h;
      const col = !gh.ok ? ['rgba(255,77,94,0.28)', '#ff4d5e', 'bad'] : gh.warn ? ['rgba(255,194,51,0.25)', '#ffc233', 'warn'] : ['rgba(47,209,139,0.22)', '#2fd18b', 'good'];
      g.fillStyle = col[0];
      g.fillRect(gh.x, gh.y, w, h);
      g.globalAlpha = 0.7;
      drawObject(g, { id: 'ghost', defId: gh.defId, x: gh.x, y: gh.y, rot: gh.rot }, loc, state, s.time, true);
      g.globalAlpha = 1;
      g.strokeStyle = col[1];
      g.lineWidth = 0.1;
      g.strokeRect(gh.x, gh.y, w, h);
      if (gh.label) hud.push({ label: gh.label, x: gh.x + w / 2, y: gh.y - 0.6, tone: col[2] });
    }
  }

  // A line of walls / fences / hedges being drawn.
  if (s.line) {
    for (const t of s.line.tiles) {
      g.fillStyle = t.ok ? 'rgba(47,209,139,0.3)' : 'rgba(255,77,94,0.35)';
      g.fillRect(t.x, t.y, 1, 1);
      if (t.ok) { g.globalAlpha = 0.7; drawObject(g, { id: 'ghost', defId: s.line.defId, x: t.x, y: t.y, rot: 0 }, loc, state, s.time, true); g.globalAlpha = 1; }
    }
    const first = s.line.tiles[0];
    if (first) hud.push({ label: s.line.label, x: first.x + 0.5, y: first.y - 0.6, tone: s.line.ok ? 'good' : 'bad' });
  }

  // A car being dragged: where it would stand, green / yellow (swap) / red.
  if (s.car) {
    const c = s.car;
    const col = !c.ok ? ['rgba(255,77,94,0.25)', '#ff4d5e', 'bad'] : c.warn ? ['rgba(255,194,51,0.25)', '#ffc233', 'warn'] : ['rgba(47,209,139,0.22)', '#2fd18b', 'good'];
    g.fillStyle = col[0];
    g.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    g.strokeStyle = col[1];
    g.lineWidth = 0.1;
    g.setLineDash([0.35, 0.2]);
    g.strokeRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    g.setLineDash([]);
    drawCar(g, c.x, c.y, c.angle, c.color, c.body, 0.72);
    hud.push({ label: c.label, x: c.rect.x + c.rect.w / 2, y: c.rect.y - 0.7, tone: col[2] });
  }

  // Light: dusk falls outside; inside stays lit while you are open.
  const dark = darkness(state.hour);
  const lightTier = (LIGHT_STYLES.find((l) => l.id === lot.style.lighting)?.tier ?? 0);
  if (dark > 0 || !lot.open) {
    const a = Math.min(0.62, dark);
    g.save();
    g.fillStyle = '#060a1a';
    if (a > 0) {
      // Outside the lot: plain dusk.
      g.globalAlpha = a;
      g.beginPath();
      g.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      g.rect(0, 0, lot.w, lot.h);
      g.fill('evenodd');
      // On the lot: outdoor areas darken, lit rooms mostly stay bright.
      g.globalAlpha = a * (1 - lightTier * 0.15);
      g.drawImage(cache.shade, 0, 0, lot.w, lot.h);
    }
    if (!lot.open) {
      // Closed: the lights are off inside too.
      g.globalAlpha = 0.28;
      g.fillRect(0, 0, lot.w, lot.h);
    }
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const o of lot.objects) {
      if (o.defId !== 'lamp' && o.defId !== 'pylon' && o.defId !== 'neon' && o.defId !== 'ledwall') continue;
      const f = footprint(o);
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      const r = o.defId === 'lamp' ? 5 : 3;
      const col = o.defId === 'lamp' ? '255,232,168' : o.defId === 'neon' ? '255,77,210' : o.defId === 'ledwall' ? '60,199,255' : '255,122,26';
      const grd = g.createRadialGradient(cx, cy, 0.2, cx, cy, r);
      grd.addColorStop(0, `rgba(${col},${0.5 * Math.max(dark, 0.25)})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }

  // Screen-space labels.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toScreen = (wx: number, wy: number): { x: number; y: number } => cam.toScreen(wx, wy);
  if (cam.zoom >= 9) {
    g.font = `600 ${Math.max(10, Math.min(13, cam.zoom * 0.45))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of cache.rooms) {
      if (r.tiles < 8) continue;
      const p = toScreen(r.x, r.y);
      const zone = ZONE_BY_CODE[r.code];
      const level = r.code === 's' ? stats.levels.showroom : r.code === 'w' ? stats.levels.workshop : r.code === 'd' ? stats.levels.detailing : r.code === 'l' ? stats.levels.lounge : -1;
      const text = `${zone.name.toUpperCase()}${level > 0 ? ` · LV ${level}` : ''}`;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      const tw = g.measureText(text).width + 12;
      roundRectPx(g, p.x - tw / 2, p.y - 9, tw, 18, 9);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(text, p.x, p.y + 0.5);
    }
  }
  drawHud(g, hud, cam, toScreen);
  if (lockedHud.length) drawHud(g, lockedHud, cam, toScreen);
  // Name tag for the selected person.
  if (s.selected?.kind === 'agent') {
    const a = s.crowd.agents.get(s.selected.id);
    if (a) drawHud(g, [{ label: a.label, x: a.x, y: a.y - 0.9, tone: 'info' }], cam, toScreen);
  }
}

function carBadge(state: GameState, loc: Location, v: Vehicle, pose: { x: number; y: number }, hud: Hud[], detailed: boolean): void {
  if (v.status === 'prep') {
    const job = v.prep[0];
    const def = job ? PREP_BY_ID[job.actionId] : undefined;
    const mode = prepActive(state, v);
    const progress = job ? 1 - job.daysLeft / Math.max(1, job.totalDays) : 0;
    const label = detailed ? (mode === 'waiting' ? 'Waiting for a bay' : def?.name ?? 'In prep') : mode === 'waiting' ? 'wait' : `${job?.daysLeft ?? 0}d`;
    hud.push({ car: true, label, x: pose.x, y: pose.y - 1.5, tone: mode === 'waiting' ? 'warn' : 'info', icon: def?.icon ?? '🔧', progress: mode === 'waiting' ? undefined : Math.max(0.08, progress) });
  } else if (v.status === 'yard') {
    hud.push({ car: true, label: detailed ? 'Not for sale' : 'List', x: pose.x, y: pose.y - 1.5, tone: 'warn', icon: '!' });
  } else if (v.status === 'listed') {
    const k = v.askingPrice >= 100000 ? `€${Math.round(v.askingPrice / 1000)}k` : `€${(v.askingPrice / 1000).toFixed(1)}k`;
    const wanted = state.customers.some((c) => c.vehicleId === v.id && (c.status === 'waiting' || c.status === 'negotiating'));
    hud.push({ car: true, label: k, x: pose.x, y: pose.y - 1.5, tone: wanted ? 'good' : 'price', icon: wanted ? '★' : undefined });
  }
  void loc;
}

function roundRectPx(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  roundRect(g, x, y, w, h, r);
}

const TONES: Record<string, [string, string]> = {
  good: ['#10271c', '#2fd18b'], bad: ['#2d0f14', '#ff4d5e'], warn: ['#2b2310', '#ffc233'], info: ['#0e2230', '#3cc7ff'], price: ['#14171b', '#eef1f4'],
};

function drawHud(g: CanvasRenderingContext2D, items: Hud[], cam: Camera, toScreen: (x: number, y: number) => { x: number; y: number }): void {
  if (cam.zoom < 11 && items.length > 3) {
    // Zoomed out: small dots instead of labels.
    for (const it of items) {
      const p = toScreen(it.x, it.y);
      g.fillStyle = (TONES[it.tone ?? 'info'] ?? TONES.info)[1];
      g.beginPath(); g.arc(p.x, p.y + 6, 3.5, 0, Math.PI * 2); g.fill();
    }
    return;
  }
  g.font = '600 11px system-ui, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  for (const it of items) {
    const p = toScreen(it.x, it.y);
    const [bg, fg] = TONES[it.tone ?? 'info'] ?? TONES.info;
    // Medium zoom: just the symbol, so neighbouring cars' badges do not collide.
    const tiny = !!it.car && cam.zoom < 22;
    let text = tiny ? (it.icon ?? (it.tone === 'price' ? '€' : it.label.slice(0, 1))) : it.icon ? `${it.icon} ${it.label}` : it.label;
    // Long messages (the full reason is in the action bar) are cut to fit the screen.
    const maxW = Math.min(360, cam.width * 0.7);
    if (g.measureText(text).width > maxW) {
      while (text.length > 4 && g.measureText(`${text}…`).width > maxW) text = text.slice(0, -1);
      text = `${text.trimEnd()}…`;
    }
    const tw = Math.max(it.progress !== undefined ? 34 : 0, g.measureText(text).width + 12);
    const hgt = it.progress !== undefined ? 22 : 18;
    g.fillStyle = bg;
    g.globalAlpha = 0.92;
    roundRect(g, p.x - tw / 2, p.y - 9, tw, hgt, 9);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = fg;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = fg;
    g.fillText(text, p.x - tw / 2 + 6, p.y);
    if (it.progress !== undefined) {
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(p.x - tw / 2 + 6, p.y + 7, tw - 12, 3);
      g.fillStyle = fg;
      g.fillRect(p.x - tw / 2 + 6, p.y + 7, (tw - 12) * Math.min(1, it.progress), 3);
    }
  }
}

export function darkness(hour: number): number {
  if (hour >= 19) return 0.42;
  if (hour >= 18) return 0.28;
  if (hour >= 17) return 0.14;
  if (hour <= 8) return 0.08;
  return 0;
}

/** Forces the static layer to rebuild (after a style change that keeps the version). */
export function invalidateStatic(): void {
  cache = null;
}

export type { MovingCar };
