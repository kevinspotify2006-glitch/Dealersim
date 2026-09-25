/**
 * The people and moving cars you see on the lot. They mirror the simulation
 * (a waiting customer in the sim is a person standing by the car they want,
 * an employee stands at their workstation) but their walking is purely visual.
 */
import { customerMood } from '../../sim/customers';
import type { GameState, Location, Role, Vehicle } from '../../sim/types';
import { absHour } from '../../sim/state';
import { footprint, lotStats } from '../../sim/lot';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { OBJ_BY_ID } from '../../data/lot';
import { driveRoute, nearbySpot, route, standSpot } from './nav';
import type { Pt } from './nav';

export type AgentKind = 'customer' | 'staff' | 'browser';

export interface Agent {
  id: string;
  kind: AgentKind;
  x: number;
  y: number;
  path: Pt[];
  state: 'arrive' | 'browse' | 'desk' | 'lounge' | 'leave' | 'gone' | 'station' | 'visit' | 'wander' | 'work';
  timer: number;
  color: string;
  skin: string;
  role?: Role;
  refId: string;
  target?: string;
  alpha: number;
  dir: number;
  walk: number;
  label: string;
  mood?: 'good' | 'warn' | 'bad';
}

export interface MovingCar {
  id: string;
  x: number;
  y: number;
  angle: number;
  path: Pt[];
  color: string;
  body: string;
  alpha: number;
  back?: Pt[];
  slotId?: string;
  vehicleId?: string;
  wait: number;
  speed: number;
}

const SKINS = ['#f1c7a5', '#e0ac85', '#c68b61', '#8d5a3b', '#5e3b26', '#f3d5c0'];
const CLOTHES = ['#3cc7ff', '#ff7a1a', '#2fd18b', '#9b8cff', '#ff4d5e', '#ffc233', '#eef1f4', '#5b6b7c', '#c85400'];
export const ROLE_COLORS: Record<Role, string> = {
  sales: '#ff7a1a', mechanic: '#ffc233', detailer: '#3cc7ff', buyer: '#2fd18b', manager: '#eef1f4', accountant: '#9b8cff', marketing: '#ff4dd2',
  finance: '#6fb08a', reception: '#f7b267', advisor: '#8f9aa6', technician: '#ffd166', inventory: '#a3876b', delivery: '#b8a6f0', security: '#2b3a4a', cleaner: '#7a8a99',
  photographer: '#eef1f4',
  prep: '#c9a36b',
  procurement: '#5ad1c4',
  admin: '#a3abb6',
};

function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i += 1) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

export class Crowd {
  agents = new Map<string, Agent>();
  cars: MovingCar[] = [];
  /** Cars currently away on a test drive (hidden from their space). */
  away = new Set<string>();
  private seenVisitors = -1;
  private seed = 1;
  private locId = '';
  private traffic: MovingCar[] = [];
  private trafficTimer = 0;

  private rnd = (): number => {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };

  reset(): void {
    this.agents.clear();
    this.cars = [];
    this.away.clear();
    this.seenVisitors = -1;
    this.traffic = [];
  }

  get roadCars(): MovingCar[] {
    return this.traffic;
  }

  /** Brings the visual crowd in line with the simulation. Cheap; called every frame. */
  sync(state: GameState, loc: Location): void {
    if (loc.id !== this.locId) {
      this.reset();
      this.locId = loc.id;
    }
    const stats = lotStats(loc.lot);
    const entrance = stats.entrance;
    const live = new Set<string>();
    let newCustomers = 0;
    // Customers inside the dealership.
    for (const c of state.customers) {
      if (c.locationId !== loc.id || (c.status !== 'waiting' && c.status !== 'negotiating')) continue;
      const id = `c:${c.id}`;
      live.add(id);
      let a = this.agents.get(id);
      if (!a) {
        const h = hash(c.id);
        const start = entrance ? { x: entrance.x + 0.5 + ((h % 3) - 1) * 0.6, y: loc.lot.h + 1.4 } : { x: loc.lot.w / 2, y: loc.lot.h - 0.5 };
        a = {
          id, kind: 'customer', x: start.x, y: start.y, path: [], state: 'arrive', timer: 0,
          color: CLOTHES[h % CLOTHES.length], skin: SKINS[(h >> 4) % SKINS.length], refId: c.id, alpha: 0, dir: 0, walk: 0,
          label: `${ARCHETYPE_BY_ID[c.archetype]?.icon ?? ''} ${c.name}`,
        };
        if (entrance) a.path = [{ x: entrance.x + 0.5, y: entrance.y + 0.5 }];
        this.agents.set(id, a);
        newCustomers += 1;
      }
      // 🟢 likely to buy · 🟡 doubting · 🔴 about to walk out.
      const m = c.status === 'negotiating' ? 'green' : customerMood(state, c);
      a.mood = m === 'green' ? 'good' : m === 'amber' ? 'warn' : 'bad';
      void absHour;
    }
    // Staff at this location.
    for (const e of state.employees) {
      if (e.locationId !== loc.id) continue;
      const id = `e:${e.id}`;
      live.add(id);
      if (!this.agents.has(id)) {
        const h = hash(e.id);
        const spot = e.stationId ? standSpot(loc, e.stationId, false, h) : null;
        const p = spot ?? (entrance ? { x: entrance.x + 0.5, y: entrance.y - 0.5 } : { x: 1.5, y: 1.5 });
        this.agents.set(id, {
          id, kind: 'staff', x: p.x, y: p.y, path: [], state: 'station', timer: this.rnd() * 3, color: ROLE_COLORS[e.role],
          skin: SKINS[h % SKINS.length], role: e.role, refId: e.id, alpha: 1, dir: 0, walk: 0, label: e.name,
        });
      } else {
        const a = this.agents.get(id)!;
        if (a.role !== e.role) { a.role = e.role; a.color = ROLE_COLORS[e.role]; }
      }
    }
    // Walk-ins who looked around and found nothing (visual only).
    const visitors = state.stats.customersTotal;
    if (this.seenVisitors < 0) this.seenVisitors = visitors;
    if (visitors > this.seenVisitors) {
      const extra = Math.max(0, Math.min(3, visitors - this.seenVisitors - newCustomers));
      for (let i = 0; i < extra && entrance; i += 1) this.spawnBrowser(loc, entrance);
      this.seenVisitors = visitors;
    }
    for (const a of this.agents.values()) {
      if (a.kind === 'browser') continue;
      if (!live.has(a.id) && a.state !== 'leave' && a.state !== 'gone') this.leave(loc, a);
    }
  }

  private spawnBrowser(loc: Location, entrance: Pt): void {
    const id = `b:${this.rnd().toString(36).slice(2, 8)}`;
    const h = hash(id);
    this.agents.set(id, {
      id, kind: 'browser', x: entrance.x + 0.5, y: loc.lot.h + 1.4, path: [{ x: entrance.x + 0.5, y: entrance.y + 0.5 }], state: 'arrive', timer: 6 + this.rnd() * 6,
      color: CLOTHES[h % CLOTHES.length], skin: SKINS[(h >> 3) % SKINS.length], refId: '', alpha: 0, dir: 0, walk: 0, label: 'Passer-by',
    });
  }

  private leave(loc: Location, a: Agent): void {
    const entrance = lotStats(loc.lot).entrance;
    a.state = 'leave';
    const p = entrance ? route(loc.lot, a, entrance, a.kind !== 'staff') : null;
    a.path = [...(p ?? []), ...(entrance ? [{ x: entrance.x + 0.5, y: loc.lot.h + 1.6 }] : [])];
    if (!a.path.length) a.state = 'gone';
  }

  /** A sold car drives out of its space and away down the road. */
  departCar(loc: Location, v: Vehicle, slotId: string | undefined): void {
    if (!slotId) return;
    const path = driveRoute(loc, slotId);
    const o = loc.lot.objects.find((x) => x.id === slotId);
    if (!path || !o) return;
    const f = footprint(o);
    this.cars.push({
      id: `d:${v.id}`, x: f.x + f.w / 2, y: f.y + f.h / 2, angle: f.h >= f.w ? Math.PI / 2 : 0, path: [...path, { x: -8, y: loc.lot.h + 2.2 }],
      color: v.colorHex, body: v.body, alpha: 1, wait: 0.6, speed: 4.5,
    });
  }

  /** Test drive: out onto the road and back again. */
  testDrive(loc: Location, v: Vehicle): void {
    const slotId = v.slotId;
    if (!slotId) return;
    const path = driveRoute(loc, slotId);
    const o = loc.lot.objects.find((x) => x.id === slotId);
    if (!path || !o) return;
    const f = footprint(o);
    const out = [...path, { x: loc.lot.w + 10, y: loc.lot.h + 2.2 }];
    const back = [{ x: -10, y: loc.lot.h + 3.2 }, ...[...path].reverse(), { x: f.x + f.w / 2, y: f.y + f.h / 2 }];
    this.away.add(v.id);
    this.cars.push({
      id: `t:${v.id}`, x: f.x + f.w / 2, y: f.y + f.h / 2, angle: f.h >= f.w ? Math.PI / 2 : 0, path: out, back, slotId, vehicleId: v.id,
      color: v.colorHex, body: v.body, alpha: 1, wait: 0.3, speed: 5,
    });
  }

  /** Advances every person and car. `pace` is 0 while the game is paused. */
  step(dt: number, pace: number, state: GameState, loc: Location): void {
    const walkSpeed = 2.6 * Math.max(0.6, Math.min(2.2, pace));
    const moving = pace > 0;
    for (const a of [...this.agents.values()]) {
      if (a.state === 'gone') {
        a.alpha -= dt * 2;
        if (a.alpha <= 0) this.agents.delete(a.id);
        continue;
      }
      if (a.alpha < 1) a.alpha = Math.min(1, a.alpha + dt * 2.5);
      if (!moving) continue;
      if (a.path.length) {
        const t = a.path[0];
        const dx = t.x - a.x;
        const dy = t.y - a.y;
        const d = Math.hypot(dx, dy);
        const step = walkSpeed * dt;
        if (d <= step) {
          a.x = t.x;
          a.y = t.y;
          a.path.shift();
        } else {
          a.x += (dx / d) * step;
          a.y += (dy / d) * step;
          a.dir = Math.atan2(dy, dx);
        }
        a.walk += dt * 9;
        continue;
      }
      a.timer -= dt * pace;
      this.think(a, state, loc);
    }
    for (const c of [...this.cars]) {
      if (!moving) break;
      if (c.wait > 0) { c.wait -= dt; continue; }
      if (!c.path.length) {
        if (c.back) {
          // Parked round the corner for a while, then back.
          c.path = c.back;
          c.back = undefined;
          c.wait = 2.2;
          c.x = c.path[0].x;
          c.y = c.path[0].y;
          continue;
        }
        if (c.vehicleId) this.away.delete(c.vehicleId);
        this.cars = this.cars.filter((x) => x !== c);
        continue;
      }
      const t = c.path[0];
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      const d = Math.hypot(dx, dy);
      const step = c.speed * dt * Math.max(0.7, Math.min(2, pace));
      if (d > 0.01) c.angle = turn(c.angle, Math.atan2(dy, dx), dt * 7);
      if (d <= step) {
        c.x = t.x;
        c.y = t.y;
        c.path.shift();
      } else {
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
      }
    }
    // Passing traffic on the road.
    if (moving) {
      this.trafficTimer -= dt * pace;
      if (this.trafficTimer <= 0) {
        this.trafficTimer = 2 + this.rnd() * 5;
        const ltr = this.rnd() < 0.5;
        const y = loc.lot.h + (ltr ? 3.1 : 2.1);
        this.traffic.push({
          id: `r${this.rnd()}`, x: ltr ? -12 : loc.lot.w + 12, y, angle: ltr ? 0 : Math.PI, path: [{ x: ltr ? loc.lot.w + 14 : -14, y }],
          color: CLOTHES[Math.floor(this.rnd() * CLOTHES.length)], body: this.rnd() < 0.3 ? 'SUV' : 'Hatchback', alpha: 1, wait: 0, speed: 5 + this.rnd() * 3,
        });
      }
      for (const c of [...this.traffic]) {
        const t = c.path[0];
        const dx = t.x - c.x;
        const step = c.speed * dt * Math.min(2, pace);
        if (Math.abs(dx) <= step) this.traffic = this.traffic.filter((x) => x !== c);
        else c.x += Math.sign(dx) * step;
      }
    }
  }

  private think(a: Agent, state: GameState, loc: Location): void {
    if (a.state === 'leave') {
      a.state = 'gone';
      return;
    }
    if (a.kind === 'browser') {
      if (a.state === 'arrive' || a.state === 'browse') {
        if (a.timer <= 0) { this.leave(loc, a); return; }
        const cars = lotStats(loc.lot).reachable;
        const ids = [...cars];
        const pick = ids.length ? ids[Math.floor(this.rnd() * ids.length)] : undefined;
        const spot = pick ? standSpot(loc, pick, true, Math.floor(this.rnd() * 20)) : nearbySpot(loc, a, 4, true, this.rnd);
        const p = spot ? route(loc.lot, a, spot, true) : null;
        a.path = p ?? [];
        a.state = 'browse';
        if (!p) a.timer -= 3;
      }
      return;
    }
    if (a.kind === 'customer') {
      const c = state.customers.find((x) => x.id === a.refId);
      if (!c) return;
      const v = state.vehicles.find((x) => x.id === c.vehicleId);
      const negotiating = state.negotiation && !state.negotiation.done && state.negotiation.customerId === c.id;
      if (negotiating) {
        if (a.state !== 'desk') {
          const desk = lotStats(loc.lot).stations.sales[0];
          const spot = desk ? standSpot(loc, desk.id, true, hash(c.id)) : null;
          const p = spot ? route(loc.lot, a, spot, true) : null;
          a.path = p ?? [];
          a.state = 'desk';
        }
        return;
      }
      const waited = state.day * 24 + state.hour - c.arrivalHour;
      const lounge = loungeSeat(loc, hash(c.id));
      if (waited >= 2 && lounge && a.state !== 'lounge' && this.rnd() < 0.5) {
        const p = route(loc.lot, a, lounge, true);
        if (p) { a.path = p; a.state = 'lounge'; a.timer = 12; return; }
      }
      if (a.state === 'lounge' && a.timer > 0) return;
      if (a.timer > 0 && a.target === v?.id) return;
      // Browse around the car they want.
      a.target = v?.id;
      const slot = v?.slotId;
      const spot = slot ? standSpot(loc, slot, true, Math.floor(this.rnd() * 20)) : null;
      const p = spot ? route(loc.lot, a, spot, true) : null;
      a.path = p ?? [];
      a.state = 'browse';
      a.timer = 3 + this.rnd() * 5;
      return;
    }
    // Staff.
    const e = state.employees.find((x) => x.id === a.refId);
    if (!e) return;
    if (a.timer > 0) return;
    if (e.role === 'sales' && a.state !== 'visit') {
      // Salespeople go and greet customers nobody is talking to.
      const waiting = [...this.agents.values()].filter((x) => x.kind === 'customer' && x.state === 'browse' && !x.path.length);
      const busy = new Set([...this.agents.values()].filter((x) => x.kind === 'staff' && x.state === 'visit').map((x) => x.target));
      const free = waiting.find((x) => !busy.has(x.id));
      if (free && this.rnd() < 0.55) {
        const spot = nearbySpot(loc, free, 1.4, false, this.rnd);
        const p = spot ? route(loc.lot, a, spot, false) : null;
        if (p) { a.path = p; a.state = 'visit'; a.target = free.id; a.timer = 5 + this.rnd() * 4; return; }
      }
    }
    const spot = e.stationId ? standSpot(loc, e.stationId, false, hash(e.id)) : nearbySpot(loc, a, 5, true, this.rnd);
    if (spot && (Math.abs(spot.x - a.x) > 0.3 || Math.abs(spot.y - a.y) > 0.3)) {
      const p = route(loc.lot, a, spot, false);
      a.path = p ?? [];
    }
    a.state = e.stationId ? (e.role === 'mechanic' || e.role === 'detailer' ? 'work' : 'station') : 'wander';
    a.target = undefined;
    a.timer = 4 + this.rnd() * 6;
  }

  /** The person under a world point, if any. */
  hit(x: number, y: number): Agent | undefined {
    let best: Agent | undefined;
    let bestD = 0.75;
    for (const a of this.agents.values()) {
      if (a.state === 'gone' || a.kind === 'browser') continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }
}

function loungeSeat(loc: Location, seed: number): Pt | null {
  const seats = loc.lot.objects.filter((o) => (o.defId === 'sofa' || o.defId === 'armchair' || o.defId === 'bench') && OBJ_BY_ID[o.defId]);
  if (!seats.length) return null;
  const o = seats[seed % seats.length];
  return standSpot(loc, o.id, true, seed);
}

function turn(from: number, to: number, max: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}
