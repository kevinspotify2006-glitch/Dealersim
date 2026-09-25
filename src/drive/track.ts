/**
 * Test-drive tracks: a small top-down town built from a route recipe.
 *
 * A recipe is a list of turtle steps (straight, curve, crossing, roundabout,
 * car park, cone slalom). From it we get the route the player must follow,
 * the roads, checkpoints, and scenery placed beside the roads (buildings,
 * trees, parked cars) that you can crash into. Units are metres; x runs
 * right and y runs down, like the dealership map. No DOM here.
 */

export interface Pt { x: number; y: number }
export interface Road { pts: Pt[]; width: number; kind: 'road' | 'ring' | 'side' | 'highway' }
/** An oriented rectangle: centre, half sizes and heading. */
export interface Box { x: number; y: number; hw: number; hh: number; a: number; kind: 'building' | 'car' | 'rail' | 'wall' | 'container'; color: string; roof?: string; body?: string; label?: string }
export interface Circle { x: number; y: number; r: number; kind: 'tree' | 'cone' | 'lake' | 'pillar' | 'bush' | 'tyres' }
export interface Lot { x: number; y: number; hw: number; hh: number; a: number }
export interface Checkpoint { x: number; y: number; a: number; r: number; at: number; label: string }
export interface Decor { kind: 'crossing' | 'arrow' | 'kerb' | 'charger' | 'sign' | 'flag'; x: number; y: number; a: number; text?: string }

export type Step =
  | ['S', number]
  | ['L' | 'R', number, number]
  | ['X']
  | ['O', number]
  | ['P', number]
  | ['C', number];

export type Scenery = 'town' | 'suburb' | 'industrial' | 'highway' | 'scenic' | 'premium' | 'circuit' | 'ev';

export interface TrackRecipe { seed: number; width: number; scenery: Scenery; steps: Step[]; checkpoints?: string[] }

export interface Track {
  path: Pt[];
  cum: number[];               // distance along the path at each point
  length: number;
  roads: Road[];
  lots: Lot[];
  boxes: Box[];
  circles: Circle[];
  decor: Decor[];
  checkpoints: Checkpoint[];
  start: { x: number; y: number; a: number };
  bounds: { x0: number; y0: number; x1: number; y1: number };
  dealership: Box;
  width: number;
  scenery: Scenery;
  grid: Grid;
}

// ------------------------------------------------------------------ rng --

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- geometry --

export function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function inLot(l: Lot, x: number, y: number, pad = 0): boolean {
  const dx = x - l.x;
  const dy = y - l.y;
  const c = Math.cos(-l.a);
  const s = Math.sin(-l.a);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= l.hw + pad && Math.abs(ly) <= l.hh + pad;
}

// ------------------------------------------------------------ spatial grid --

const CELL = 12;

interface Grid {
  x0: number; y0: number; cols: number; rows: number;
  segs: Map<number, { r: number; i: number }[]>;
  obs: Map<number, { box?: number; circle?: number }[]>;
}

function cellKey(g: Grid, cx: number, cy: number): number { return cy * g.cols + cx; }

function gridCells(g: Grid, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const cx0 = Math.max(0, Math.floor((x0 - g.x0) / CELL));
  const cy0 = Math.max(0, Math.floor((y0 - g.y0) / CELL));
  const cx1 = Math.min(g.cols - 1, Math.floor((x1 - g.x0) / CELL));
  const cy1 = Math.min(g.rows - 1, Math.floor((y1 - g.y0) / CELL));
  for (let cy = cy0; cy <= cy1; cy += 1) for (let cx = cx0; cx <= cx1; cx += 1) out.push(cellKey(g, cx, cy));
  return out;
}

function indexRoads(g: Grid, roads: Road[]): void {
  g.segs.clear();
  roads.forEach((road, r) => {
    for (let i = 0; i + 1 < road.pts.length; i += 1) {
      const a = road.pts[i];
      const b = road.pts[i + 1];
      const pad = road.width / 2 + 2;
      for (const k of gridCells(g, Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.max(a.x, b.x) + pad, Math.max(a.y, b.y) + pad)) {
        let list = g.segs.get(k);
        if (!list) { list = []; g.segs.set(k, list); }
        list.push({ r, i });
      }
    }
  });
}

function indexObstacles(g: Grid, boxes: Box[], circles: Circle[]): void {
  g.obs.clear();
  const add = (k: number, v: { box?: number; circle?: number }): void => {
    let list = g.obs.get(k);
    if (!list) { list = []; g.obs.set(k, list); }
    list.push(v);
  };
  boxes.forEach((b, i) => {
    const r = Math.hypot(b.hw, b.hh);
    for (const k of gridCells(g, b.x - r, b.y - r, b.x + r, b.y + r)) add(k, { box: i });
  });
  circles.forEach((c, i) => {
    for (const k of gridCells(g, c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r)) add(k, { circle: i });
  });
}

/** How far a point is from the nearest road edge (negative = on the road). */
export function roadGap(t: Track, x: number, y: number): number {
  for (const l of t.lots) if (inLot(l, x, y)) return -1;
  const cx = Math.floor((x - t.grid.x0) / CELL);
  const cy = Math.floor((y - t.grid.y0) / CELL);
  if (cx < 0 || cy < 0 || cx >= t.grid.cols || cy >= t.grid.rows) return 999;
  const list = t.grid.segs.get(cellKey(t.grid, cx, cy));
  if (!list) return 999;
  let best = 999;
  for (const { r, i } of list) {
    const road = t.roads[r];
    const d = segDist(x, y, road.pts[i], road.pts[i + 1]) - road.width / 2;
    if (d < best) best = d;
  }
  return best;
}

/** Obstacles near a point (for collisions). */
export function obstaclesNear(t: Track, x: number, y: number, r: number): { boxes: Box[]; circles: Circle[] } {
  const seenB = new Set<number>();
  const seenC = new Set<number>();
  for (const k of gridCells(t.grid, x - r, y - r, x + r, y + r)) {
    for (const o of t.grid.obs.get(k) ?? []) {
      if (o.box !== undefined) seenB.add(o.box);
      if (o.circle !== undefined) seenC.add(o.circle);
    }
  }
  return { boxes: [...seenB].map((i) => t.boxes[i]), circles: [...seenC].map((i) => t.circles[i]) };
}

/** Nearest point on the route: distance along it, how far off it you are and the heading there. */
export function nearestOnPath(t: Track, x: number, y: number, hint = -1, window = 60): { at: number; off: number; a: number; i: number } {
  let best = { at: 0, off: Infinity, a: 0, i: 0 };
  const from = hint >= 0 ? Math.max(0, hint - window) : 0;
  const to = hint >= 0 ? Math.min(t.path.length - 1, hint + window) : t.path.length - 1;
  for (let i = from; i < to; i += 1) {
    const a = t.path[i];
    const b = t.path[i + 1];
    const d = segDist(x, y, a, b);
    if (d < best.off) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      best = { at: t.cum[i] + k * Math.sqrt(l2), off: d, a: Math.atan2(dy, dx), i };
    }
  }
  return best;
}

export function pointAt(t: Track, at: number): { x: number; y: number; a: number; i: number } {
  const d = Math.max(0, Math.min(t.length, at));
  let lo = 0;
  let hi = t.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid] <= d) lo = mid; else hi = mid;
  }
  const a = t.path[lo];
  const b = t.path[Math.min(t.path.length - 1, lo + 1)];
  const seg = t.cum[Math.min(t.cum.length - 1, lo + 1)] - t.cum[lo] || 1;
  const k = (d - t.cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x), i: lo };
}

// ------------------------------------------------------------- builder --

const CAR_COLORS = ['#b3202a', '#1f3b73', '#e9ecef', '#2c3036', '#5b6e4f', '#8a6a4a', '#3a5a8c', '#c8ccd2', '#d4af37', '#6b7480'];
const BODIES = ['Hatchback', 'Sedan', 'SUV', 'Wagon', 'Crossover', 'Van'];
const ROOFS: Record<Scenery, string[]> = {
  town: ['#8d949c', '#a3876b', '#6b7480', '#9a5a44', '#c8ccd2'],
  suburb: ['#9a5a44', '#b3202a', '#6b4a32', '#8a6a4a', '#51606f'],
  industrial: ['#6b7480', '#51606f', '#8d949c', '#3f5d6e'],
  highway: ['#6b7480', '#8d949c'],
  scenic: ['#6b4a32', '#9a5a44'],
  premium: ['#e6dccb', '#c8ccd2', '#f2efe9'],
  circuit: ['#51606f', '#ff7a1a'],
  ev: ['#e9ecef', '#c8ccd2', '#9fd8ff'],
};

export function buildTrack(recipe: TrackRecipe, dealerName = 'Your dealership'): Track {
  const rand = rng(recipe.seed);
  const W = recipe.width;
  const path: Pt[] = [];
  const roads: Road[] = [];
  const lots: Lot[] = [];
  const boxes: Box[] = [];
  const circles: Circle[] = [];
  const decor: Decor[] = [];
  let x = 0;
  let y = 0;
  let h = 0;
  let current: Pt[] = [{ x, y }];
  path.push({ x, y });
  const push = (px: number, py: number): void => { path.push({ x: px, y: py }); current.push({ x: px, y: py }); };
  const flush = (): void => {
    if (current.length > 1) roads.push({ pts: current, width: W, kind: recipe.scenery === 'highway' ? 'highway' : 'road' });
    current = [{ x, y }];
  };
  const straight = (len: number): void => {
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 1; i <= n; i += 1) push(x + Math.cos(h) * (len * i) / n, y + Math.sin(h) * (len * i) / n);
    x += Math.cos(h) * len;
    y += Math.sin(h) * len;
  };
  const turn = (right: boolean, r: number, deg: number): void => {
    const sgn = right ? 1 : -1;
    const cx = x + Math.cos(h + sgn * Math.PI / 2) * r;
    const cy = y + Math.sin(h + sgn * Math.PI / 2) * r;
    const start = Math.atan2(y - cy, x - cx);
    const total = (deg * Math.PI) / 180;
    const n = Math.max(4, Math.round((r * total) / 3));
    for (let i = 1; i <= n; i += 1) {
      const a = start + sgn * (total * i) / n;
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    x = cx + Math.cos(start + sgn * total) * r;
    y = cy + Math.sin(start + sgn * total) * r;
    h += sgn * total;
  };
  const labels = recipe.checkpoints ?? [];

  // The dealership at the start: a showroom by the road with cars outside.
  const dealership: Box = { x: x - 6, y: y - (W / 2 + 16), hw: 22, hh: 9, a: 0, kind: 'building', color: '#c9ced6', roof: '#eef1f4', label: dealerName };
  boxes.push(dealership);
  lots.push({ x: x - 6, y: y - (W / 2 + 4), hw: 20, hh: 3.5, a: 0 });
  for (let i = 0; i < 6; i += 1) boxes.push({ x: x - 22 + i * 6, y: y - (W / 2 + 4), hw: 2.2, hh: 1.0, a: Math.PI / 2, kind: 'car', color: CAR_COLORS[i % CAR_COLORS.length], body: BODIES[i % BODIES.length] });
  decor.push({ kind: 'flag', x: x + 18, y: y - W / 2 - 2, a: 0 });
  // Road behind the start so you can reverse a little.
  roads.push({ pts: [{ x: x - 40, y }, { x, y }], width: W, kind: 'road' });

  for (const step of recipe.steps) {
    switch (step[0]) {
      case 'S': straight(step[1]); break;
      case 'L': turn(false, step[1], step[2]); break;
      case 'R': turn(true, step[1], step[2]); break;
      case 'X': {
        // A crossroads: a side road straight across the route.
        const nx = Math.cos(h + Math.PI / 2);
        const ny = Math.sin(h + Math.PI / 2);
        roads.push({ pts: [{ x: x - nx * 80, y: y - ny * 80 }, { x: x + nx * 80, y: y + ny * 80 }], width: W, kind: 'side' });
        decor.push({ kind: 'crossing', x: x - Math.cos(h) * (W / 2 + 2), y: y - Math.sin(h) * (W / 2 + 2), a: h });
        decor.push({ kind: 'crossing', x: x + Math.cos(h) * (W / 2 + 2), y: y + Math.sin(h) * (W / 2 + 2), a: h });
        straight(W / 2 + 4);
        break;
      }
      case 'O': {
        // Roundabout: keep the island on your left and go straight across.
        const r = step[1];
        const cx = x + Math.cos(h) * r;
        const cy = y + Math.sin(h) * r;
        flush();
        const ring: Pt[] = [];
        for (let i = 0; i <= 48; i += 1) { const a = (i / 48) * Math.PI * 2; ring.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
        roads.push({ pts: ring, width: W, kind: 'ring' });
        circles.push({ x: cx, y: cy, r: Math.max(3, r - W / 2 - 1.2), kind: 'bush' });
        // Side arms.
        for (const side of [-1, 1]) {
          const a = h + side * Math.PI / 2;
          roads.push({ pts: [{ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, { x: cx + Math.cos(a) * (r + 60), y: cy + Math.sin(a) * (r + 60) }], width: W, kind: 'side' });
        }
        const a0 = Math.atan2(y - cy, x - cx);
        const n = 24;
        for (let i = 1; i <= n; i += 1) { const a = a0 - (Math.PI * i) / n; push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        x = cx + Math.cos(a0 - Math.PI) * r;
        y = cy + Math.sin(a0 - Math.PI) * r;
        current = [{ x, y }];
        break;
      }
      case 'P': {
        // A car park the route runs through, with parked cars both sides.
        const len = step[1];
        const mx = x + Math.cos(h) * len / 2;
        const my = y + Math.sin(h) * len / 2;
        lots.push({ x: mx, y: my, hw: len / 2 + 2, hh: 10, a: h });
        const nx = Math.cos(h + Math.PI / 2);
        const ny = Math.sin(h + Math.PI / 2);
        for (let d = 4; d < len - 3; d += 3.2) {
          for (const side of [-1, 1]) {
            if (rand() < 0.35) continue;
            const off = side * 6.4;
            boxes.push({ x: x + Math.cos(h) * d + nx * off, y: y + Math.sin(h) * d + ny * off, hw: 2.2, hh: 0.95, a: h + Math.PI / 2, kind: 'car', color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], body: BODIES[Math.floor(rand() * BODIES.length)] });
          }
        }
        straight(len);
        break;
      }
      case 'C': {
        // Cone slalom along the next stretch: the route weaves between them.
        const len = step[1];
        const nx = Math.cos(h + Math.PI / 2);
        const ny = Math.sin(h + Math.PI / 2);
        const gap = 14;
        const amp = Math.min(2.4, W / 2 - 1.8);
        const sx = x;
        const sy = y;
        const end = Math.floor((len - 6) / gap) * gap;
        for (let d = gap; d <= end; d += gap) {
          const side = (d / gap) % 2 ? -1 : 1;   // cones on the opposite side of the weave
          circles.push({ x: sx + Math.cos(h) * d + nx * side * 0.5, y: sy + Math.sin(h) * d + ny * side * 0.5, r: 0.4, kind: 'cone' });
          circles.push({ x: sx + Math.cos(h) * d + nx * side * 1.5, y: sy + Math.sin(h) * d + ny * side * 1.5, r: 0.4, kind: 'cone' });
        }
        for (let d = 1.5; d <= len; d += 1.5) {
          const off = d > gap / 2 && d < end + gap / 2 ? -amp * Math.sin((Math.PI * (d - gap / 2)) / gap) * -1 : 0;
          path.push({ x: sx + Math.cos(h) * d + nx * off, y: sy + Math.sin(h) * d + ny * off });
        }
        x = sx + Math.cos(h) * len;
        y = sy + Math.sin(h) * len;
        current.push({ x, y });
        path.push({ x, y });
        break;
      }
      default: break;
    }
  }
  flush();
  // Finish area.
  decor.push({ kind: 'flag', x: x + Math.cos(h + Math.PI / 2) * (W / 2 + 2), y: y + Math.sin(h + Math.PI / 2) * (W / 2 + 2), a: h });

  // Distances along the route.
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const length = cum[cum.length - 1];

  // Bounds and the spatial grid.
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of roads) for (const p of r.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const margin = 90;
  const bounds = { x0: x0 - margin, y0: y0 - margin, x1: x1 + margin, y1: y1 + margin };
  const grid: Grid = { x0: bounds.x0, y0: bounds.y0, cols: Math.ceil((bounds.x1 - bounds.x0) / CELL) + 1, rows: Math.ceil((bounds.y1 - bounds.y0) / CELL) + 1, segs: new Map(), obs: new Map() };
  indexRoads(grid, roads);
  const track: Track = { path, cum, length, roads, lots, boxes, circles, decor, checkpoints: [], start: { x: 0, y: 0, a: 0 }, bounds, dealership, width: W, scenery: recipe.scenery, grid };

  // Scenery beside the roads, never on them.
  const clear = (px: number, py: number, pad: number): boolean => roadGap(track, px, py) > pad;
  const overlapsBox = (bx: number, by: number, r: number): boolean => boxes.some((b) => Math.hypot(b.x - bx, b.y - by) < r + Math.hypot(b.hw, b.hh) * 0.9) || circles.some((c) => Math.hypot(c.x - bx, c.y - by) < r + c.r);
  const sc = recipe.scenery;
  const buildingEvery = sc === 'industrial' ? 38 : sc === 'highway' || sc === 'scenic' || sc === 'circuit' ? 70 : sc === 'suburb' ? 20 : 24;
  const roofs = ROOFS[sc];
  for (const road of roads) {
    if (road.kind === 'ring') continue;
    let acc = 0;
    for (let i = 1; i < road.pts.length; i += 1) {
      const a = road.pts[i - 1];
      const b = road.pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      acc += seg;
      if (acc < buildingEvery) continue;
      acc = 0;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (const side of [-1, 1]) {
        const nx = Math.cos(ang + side * Math.PI / 2);
        const ny = Math.sin(ang + side * Math.PI / 2);
        if (rand() < (sc === 'scenic' || sc === 'highway' ? 0.25 : 0.8)) {
          const big = sc === 'industrial';
          const hw = big ? 10 + rand() * 8 : sc === 'suburb' ? 4 + rand() * 2 : 5 + rand() * 5;
          const hh = big ? 7 + rand() * 6 : sc === 'suburb' ? 4 + rand() * 1.5 : 4 + rand() * 4;
          const off = road.width / 2 + 5 + hh + rand() * 3;
          const bx = b.x + nx * off;
          const by = b.y + ny * off;
          const corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh], [0, 0]].map(([u, v]) => ({ x: bx + Math.cos(ang) * u - Math.sin(ang) * v, y: by + Math.sin(ang) * u + Math.cos(ang) * v }));
          if (corners.every((c) => clear(c.x, c.y, 2.5)) && !overlapsBox(bx, by, Math.hypot(hw, hh) * 0.9)) {
            boxes.push({ x: bx, y: by, hw, hh, a: ang, kind: big && rand() < 0.3 ? 'container' : 'building', color: roofs[Math.floor(rand() * roofs.length)], roof: roofs[Math.floor(rand() * roofs.length)] });
            continue;
          }
        }
        // A tree or two instead.
        const trees = sc === 'scenic' || sc === 'suburb' || sc === 'premium' ? 3 : 1;
        for (let k = 0; k < trees; k += 1) {
          const off = road.width / 2 + 3 + rand() * (sc === 'scenic' ? 14 : 5);
          const tx = b.x + nx * off + Math.cos(ang) * (rand() - 0.5) * 12;
          const ty = b.y + ny * off + Math.sin(ang) * (rand() - 0.5) * 12;
          const r = 1.4 + rand() * 1.2;
          if (clear(tx, ty, r + 1) && !overlapsBox(tx, ty, r)) circles.push({ x: tx, y: ty, r, kind: 'tree' });
        }
      }
    }
  }
  // Highways get crash barriers along the outside; circuits get tyre walls.
  if (sc === 'highway' || sc === 'circuit') {
    for (const road of roads) {
      if (road.kind !== 'highway' && road.kind !== 'road') continue;
      for (let i = 4; i + 1 < road.pts.length; i += 5) {
        const a = road.pts[i];
        const b = road.pts[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (const side of [-1, 1]) {
          const nx = Math.cos(ang + side * Math.PI / 2);
          const ny = Math.sin(ang + side * Math.PI / 2);
          const off = road.width / 2 + 2.2;
          const px = a.x + nx * off;
          const py = a.y + ny * off;
          if (!clear(px, py, 1.2)) continue;
          if (sc === 'highway') boxes.push({ x: px, y: py, hw: 2.4, hh: 0.18, a: ang, kind: 'rail', color: '#c8ccd2' });
          else if (rand() < 0.5) circles.push({ x: px, y: py, r: 0.9, kind: 'tyres' });
        }
      }
    }
  }
  if (sc === 'scenic') {
    // A lake beside the road.
    const mid = path[Math.floor(path.length * 0.55)];
    for (let tries = 0; tries < 20; tries += 1) {
      const lx = mid.x + (rand() - 0.5) * 160;
      const ly = mid.y + (rand() - 0.5) * 160;
      const r = 18 + rand() * 10;
      if (clear(lx, ly, r + 4) && !overlapsBox(lx, ly, r)) { circles.push({ x: lx, y: ly, r, kind: 'lake' }); break; }
    }
  }

  // Checkpoints: three on the way and the finish.
  const cps = [0.27, 0.52, 0.77, 1];
  track.checkpoints = cps.map((f, i) => {
    const p = pointAt(track, Math.min(length - 1, length * f));
    return { x: p.x, y: p.y, a: p.a, r: W / 2 + 3, at: length * f, label: i === cps.length - 1 ? 'Finish' : labels[i] ?? `Checkpoint ${i + 1}` };
  });
  if (sc === 'ev') decor.push({ kind: 'charger', x: track.checkpoints[1].x + Math.cos(track.checkpoints[1].a + Math.PI / 2) * (W / 2 + 3), y: track.checkpoints[1].y + Math.sin(track.checkpoints[1].a + Math.PI / 2) * (W / 2 + 3), a: track.checkpoints[1].a });
  const s0 = pointAt(track, 6);
  track.start = { x: s0.x, y: s0.y, a: s0.a };
  // Nothing may stand on the route itself (cones excepted).
  track.boxes = boxes.filter((b) => b.kind === 'car' && lots.some((l) => inLot(l, b.x, b.y, 1)) || b === dealership || roadGap(track, b.x, b.y) > 0.5);
  track.circles = circles.filter((c) => c.kind === 'cone' || c.kind === 'bush' || roadGap(track, c.x, c.y) > c.r * 0.5);
  indexObstacles(grid, track.boxes, track.circles);
  return track;
}
