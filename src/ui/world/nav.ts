/**
 * Walking routes over the lot grid for the visual people and cars. Uses the
 * same passability rules as the simulation (walls, doors, staff-only rooms).
 */
import type { Location, Lot } from '../../sim/types';
import { footprint, isDoor, lotStats, occupancy, passable, zoneAt } from '../../sim/lot';
import { OBJ_BY_ID } from '../../data/lot';

export interface Pt { x: number; y: number }

interface Grid {
  version: number;
  lot: Lot;
  occ: ReturnType<typeof occupancy>;
  doors: Set<number>;
}

let grid: Grid | null = null;

function gridFor(lot: Lot): Grid {
  if (grid && grid.lot === lot && grid.version === lot.version) return grid;
  const doors = new Set<number>();
  for (const o of lot.objects) {
    if (!isDoor(o.defId)) continue;
    const f = footprint(o);
    for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) doors.add(y * lot.w + x);
  }
  grid = { version: lot.version, lot, occ: occupancy(lot), doors };
  return grid;
}

export function walkable(lot: Lot, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= lot.w || y >= lot.h) return false;
  return !gridFor(lot).occ.solid[y * lot.w + x];
}

/** Breadth-first route between two tiles. Returns tile centres, or null. */
export function route(lot: Lot, from: Pt, to: Pt, customer: boolean): Pt[] | null {
  const g = gridFor(lot);
  const fx = Math.floor(from.x);
  const fy = Math.floor(from.y);
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  if (fx === tx && fy === ty) return [{ x: tx + 0.5, y: ty + 0.5 }];
  const w = lot.w;
  const n = w * lot.h;
  if (fx < 0 || fy < 0 || fx >= w || fy >= lot.h || tx < 0 || ty < 0 || tx >= w || ty >= lot.h) return null;
  const prev = new Int32Array(n).fill(-1);
  const start = fy * w + fx;
  const goal = ty * w + tx;
  prev[start] = start;
  const q = [start];
  for (let qi = 0; qi < q.length; qi += 1) {
    const i = q[qi];
    if (i === goal) break;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= lot.h) continue;
      const ni = ny * w + nx;
      if (prev[ni] >= 0) continue;
      // The start tile may be inside furniture (someone sitting down); leaving it is always allowed.
      if (ni !== goal && !passable(lot, g.occ, g.doors, x, y, nx, ny, customer)) continue;
      if (ni === goal && g.occ.solid[ni]) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  if (prev[goal] < 0) return null;
  const out: Pt[] = [];
  for (let i = goal; i !== start; i = prev[i]) out.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  out.reverse();
  return smooth(out);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Drops intermediate points on straight runs so movement looks less robotic. */
function smooth(path: Pt[]): Pt[] {
  if (path.length < 3) return path;
  const out: Pt[] = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

/** A free tile next to an object where a person can stand (for customers: one they can reach). */
export function standSpot(loc: Location, objId: string, customer: boolean, seed = 0): Pt | null {
  const lot = loc.lot;
  const o = lot.objects.find((x) => x.id === objId);
  if (!o) return null;
  const f = footprint(o);
  const stats = lotStats(lot);
  const g = gridFor(lot);
  const spots: Pt[] = [];
  const zoneOf = zoneAt(lot, f.x, f.y);
  for (let x = f.x - 1; x <= f.x + f.w; x += 1) {
    for (let y = f.y - 1; y <= f.y + f.h; y += 1) {
      const edge = x === f.x - 1 || x === f.x + f.w || y === f.y - 1 || y === f.y + f.h;
      if (!edge || x < 0 || y < 0 || x >= lot.w || y >= lot.h) continue;
      const corner = (x === f.x - 1 || x === f.x + f.w) && (y === f.y - 1 || y === f.y + f.h);
      if (corner) continue;
      const i = y * lot.w + x;
      if (g.occ.solid[i]) continue;
      if (customer && stats.dist[i] < 0) continue;
      // Staff stand in the same room as their workstation.
      if (!customer && zoneAt(lot, x, y) !== zoneOf && !!OBJ_BY_ID[o.defId]?.station) continue;
      spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  if (!spots.length) return null;
  return spots[Math.abs(seed) % spots.length];
}

/** Random reachable tile near a point (for browsing and idling). */
export function nearbySpot(loc: Location, around: Pt, radius: number, customer: boolean, rnd: () => number): Pt | null {
  const lot = loc.lot;
  const stats = lotStats(lot);
  const g = gridFor(lot);
  for (let tries = 0; tries < 14; tries += 1) {
    const x = Math.floor(around.x + (rnd() * 2 - 1) * radius);
    const y = Math.floor(around.y + (rnd() * 2 - 1) * radius);
    if (x < 0 || y < 0 || x >= lot.w || y >= lot.h) continue;
    const i = y * lot.w + x;
    if (g.occ.solid[i]) continue;
    if (customer && stats.dist[i] < 0) continue;
    return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

/** Route for a car leaving its space: over open ground to the entrance and out onto the road. */
export function driveRoute(loc: Location, slotId: string): Pt[] | null {
  const lot = loc.lot;
  const stats = lotStats(lot);
  const o = lot.objects.find((x) => x.id === slotId);
  if (!o || !stats.entrance) return null;
  const f = footprint(o);
  const g = gridFor(lot);
  const w = lot.w;
  const start = { x: f.x + Math.floor(f.w / 2), y: f.y + Math.floor(f.h / 2) };
  const own = new Set<number>();
  for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) own.add(y * w + x);
  const prev = new Int32Array(w * lot.h).fill(-1);
  const s = start.y * w + start.x;
  const goal = stats.entrance.y * w + stats.entrance.x;
  prev[s] = s;
  const q = [s];
  for (let qi = 0; qi < q.length; qi += 1) {
    const i = q[qi];
    if (i === goal) break;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= lot.h) continue;
      const ni = ny * w + nx;
      if (prev[ni] >= 0) continue;
      if (g.occ.solid[ni] && !own.has(ni)) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  const out: Pt[] = [];
  if (prev[goal] < 0) {
    // Boxed in: it is craned out, straight to the gate.
    out.push({ x: start.x + 0.5, y: start.y + 0.5 }, { x: stats.entrance.x + 0.5, y: stats.entrance.y + 0.5 });
  } else {
    for (let i = goal; i !== s; i = prev[i]) out.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
    out.push({ x: start.x + 0.5, y: start.y + 0.5 });
    out.reverse();
  }
  out.push({ x: stats.entrance.x + 0.5, y: lot.h + 1.2 });
  return smooth(out);
}
