/**
 * Arcade car handling for the test drive. Simple, but every car feels
 * different: power-to-weight sets the pull, weight and body the steering,
 * the tyres and drivetrain the grip, the condition takes the edge off.
 */
import type { Vehicle } from '../sim/types';
import type { Box, Circle, Track } from './track';
import { nearestOnPath, obstaclesNear, roadGap } from './track';

export interface Handling {
  mass: number;          // kg
  accel: number;         // m/s² at low speed
  maxSpeed: number;      // m/s
  braking: number;       // m/s²
  steer: number;         // max wheel angle (rad)
  steerRate: number;     // how fast the wheel turns (rad/s)
  wheelbase: number;     // m
  grip: number;          // lateral grip in g
  length: number;
  width: number;
  turningRadius: number; // m
  instantTorque: boolean;
  label: string;         // a word or two for the result screen
}

const MASS: Record<string, number> = { Hatchback: 1200, Sedan: 1450, Wagon: 1500, Coupe: 1400, Convertible: 1450, Roadster: 1250, SUV: 1900, Crossover: 1600, Offroader: 2150, Van: 2100, Pickup: 2050 };
const WHEELBASE: Record<string, number> = { Hatchback: 2.55, Sedan: 2.8, Wagon: 2.8, Coupe: 2.65, Convertible: 2.65, Roadster: 2.4, SUV: 2.85, Crossover: 2.7, Offroader: 2.8, Van: 3.3, Pickup: 3.2 };

/** Driving characteristics from the car's own data. */
export function handlingOf(v: Pick<Vehicle, 'body' | 'hp' | 'category' | 'fuel' | 'transmission' | 'condition'> & { drivetrain?: string }): Handling {
  const body = v.body ?? 'Sedan';
  let mass = MASS[body] ?? 1450;
  if (v.fuel === 'Electric') mass += 250;
  const hp = Math.max(60, v.hp || 120);
  const pw = hp / mass;
  const cond = Math.max(20, Math.min(100, v.condition ?? 70)) / 100;
  const sporty = v.category === 'Sport' || v.category === 'Performance' || body === 'Coupe' || body === 'Roadster';
  const heavy = body === 'Van' || body === 'Pickup' || body === 'Offroader';
  let accel = (2.4 + 22 * pw) * (0.85 + cond * 0.15);
  if (v.fuel === 'Electric') accel *= 1.12;
  if (v.transmission === 'Manual') accel *= 0.96;
  if (v.drivetrain === 'AWD' || v.drivetrain === '4x4') accel *= 1.05;
  accel = Math.max(2, Math.min(9.5, accel));
  let vmax = (150 + hp * 0.33) / 3.6;
  if (heavy) vmax = Math.min(vmax, 170 / 3.6);
  if (v.fuel === 'Electric') vmax = Math.min(vmax, 200 / 3.6);
  vmax = Math.max(120 / 3.6, Math.min(300 / 3.6, vmax));
  const braking = (sporty ? 10.5 : heavy ? 7.2 : 8.6) * (0.8 + cond * 0.2);
  const wheelbase = WHEELBASE[body] ?? 2.7;
  const steer = heavy ? 0.52 : sporty ? 0.6 : 0.56;
  const steerRate = (sporty ? 3.6 : heavy ? 1.9 : 2.8) * (1450 / mass) ** 0.35;
  let grip = sporty ? 1.08 : heavy ? 0.76 : body === 'SUV' || body === 'Crossover' ? 0.84 : 0.92;
  if (v.drivetrain === 'AWD' || v.drivetrain === '4x4') grip += 0.05;
  if (v.category === 'Luxury' || v.category === 'Premium') grip += 0.03;
  grip *= 0.85 + cond * 0.15;
  const length = body === 'Van' || body === 'Pickup' ? 4.7 : body === 'SUV' || body === 'Crossover' || body === 'Wagon' || body === 'Offroader' ? 4.4 : body === 'Coupe' || body === 'Convertible' ? 4.2 : 4.0;
  const width = body === 'Van' || body === 'SUV' || body === 'Pickup' || body === 'Crossover' ? 1.9 : body === 'Offroader' ? 1.96 : 1.78;
  const label = sporty ? 'sharp and fast' : heavy ? 'big and steady' : v.category === 'Luxury' || v.category === 'Premium' ? 'smooth and quiet' : body === 'SUV' || body === 'Crossover' ? 'stable and high' : v.fuel === 'Electric' ? 'instant and silent' : 'balanced';
  return { mass, accel, maxSpeed: vmax, braking, steer, steerRate, wheelbase, grip, length, width, turningRadius: wheelbase / Math.tan(steer), instantTorque: v.fuel === 'Electric', label };
}

export interface CarState {
  x: number; y: number; a: number;
  v: number;             // forward speed m/s (negative = reverse)
  vl: number;            // sideways slide m/s
  steer: number;         // current wheel angle
  onRoad: boolean;
  slip: number;          // 0..1 how much it is sliding (for skid marks)
}

export interface Input { throttle: number; brake: number; steer: number }

export interface Contact { impact: number; x: number; y: number }

const G = 9.81;

/** One physics step. Returns the hardest contact this step (0 if none). */
export function stepCar(car: CarState, hd: Handling, input: Input, dt: number, track: Track): Contact {
  const gap = roadGap(track, car.x, car.y);
  car.onRoad = gap <= 0.6;
  const surfaceGrip = car.onRoad ? 1 : 0.62;
  const surfaceDrag = car.onRoad ? 0 : 3.2;
  // Steering: the wheel turns at the car's own pace, less lock at speed.
  const speed = Math.abs(car.v);
  const lock = hd.steer / (1 + speed / 22);
  const target = Math.max(-1, Math.min(1, input.steer)) * lock;
  const ds = target - car.steer;
  const maxStep = hd.steerRate * dt;
  car.steer += Math.max(-maxStep, Math.min(maxStep, ds));
  // Pull and brakes.
  let acc = 0;
  const vmax = hd.maxSpeed * (car.onRoad ? 1 : 0.55);
  if (input.throttle > 0) {
    const torque = hd.instantTorque ? 1 : Math.min(1, 0.7 + speed / 15);
    if (car.v >= -0.5) acc += hd.accel * input.throttle * torque * Math.max(0, 1 - (car.v / vmax) ** 2);
    else acc += hd.braking * input.throttle;          // throttle while rolling back = brake
  }
  if (input.brake > 0) {
    if (car.v > 0.4) acc -= hd.braking * input.brake;
    else if (car.v > -18 / 3.6) acc -= hd.accel * 0.45 * input.brake;   // reverse gear
  }
  if (!input.throttle && !input.brake) acc -= Math.sign(car.v) * Math.min(Math.abs(car.v) / dt, 1.1);
  acc -= Math.sign(car.v) * (surfaceDrag + 0.00045 * car.v * car.v);
  const before = car.v;
  car.v += acc * dt;
  if (Math.sign(before) !== Math.sign(car.v) && before !== 0 && !input.brake && !input.throttle) car.v = 0;
  // Turning with a grip limit: push too hard and the car slides wide.
  const wanted = (car.v / hd.wheelbase) * Math.tan(car.steer);
  const limit = (hd.grip * surfaceGrip * G) / Math.max(1, speed);
  const yaw = Math.max(-limit, Math.min(limit, wanted));
  const excess = (wanted - yaw) * car.v;
  car.vl += excess * dt * 0.35 - car.vl * Math.min(1, hd.grip * surfaceGrip * 7 * dt);
  car.slip = Math.min(1, Math.abs(car.vl) / 3 + Math.abs(wanted - yaw) * 0.5);
  car.a += yaw * dt;
  car.x += (Math.cos(car.a) * car.v - Math.sin(car.a) * car.vl) * dt;
  car.y += (Math.sin(car.a) * car.v + Math.cos(car.a) * car.vl) * dt;
  return collide(car, hd, track);
}

// --------------------------------------------------------------- collisions --

function obbAxes(a: number): [number, number][] {
  return [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]];
}

function project(cx: number, cy: number, hw: number, hh: number, a: number, ax: number, ay: number): [number, number] {
  const c = cx * ax + cy * ay;
  const [u, v] = obbAxes(a);
  const r = Math.abs(hw * (u[0] * ax + u[1] * ay)) + Math.abs(hh * (v[0] * ax + v[1] * ay));
  return [c - r, c + r];
}

/** Separating axis test between the car and a box: the push-out vector, or null. */
function boxHit(car: CarState, hd: Handling, b: Box): { nx: number; ny: number; depth: number } | null {
  const chw = hd.length / 2;
  const chh = hd.width / 2;
  let best = { nx: 0, ny: 0, depth: Infinity };
  for (const [ax, ay] of [...obbAxes(car.a), ...obbAxes(b.a)]) {
    const [a0, a1] = project(car.x, car.y, chw, chh, car.a, ax, ay);
    const [b0, b1] = project(b.x, b.y, b.hw, b.hh, b.a, ax, ay);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return null;
    if (overlap < best.depth) {
      const dir = (car.x - b.x) * ax + (car.y - b.y) * ay >= 0 ? 1 : -1;
      best = { nx: ax * dir, ny: ay * dir, depth: overlap };
    }
  }
  return best;
}

function circleHit(car: CarState, hd: Handling, c: Circle): { nx: number; ny: number; depth: number } | null {
  const dx = c.x - car.x;
  const dy = c.y - car.y;
  const co = Math.cos(-car.a);
  const si = Math.sin(-car.a);
  const lx = dx * co - dy * si;
  const ly = dx * si + dy * co;
  const px = Math.max(-hd.length / 2, Math.min(hd.length / 2, lx));
  const py = Math.max(-hd.width / 2, Math.min(hd.width / 2, ly));
  const ddx = lx - px;
  const ddy = ly - py;
  const d = Math.hypot(ddx, ddy);
  if (d >= c.r) return null;
  // Normal from the circle towards the car, in world space.
  let nx = -(ddx * Math.cos(car.a) - ddy * Math.sin(car.a));
  let ny = -(ddx * Math.sin(car.a) + ddy * Math.cos(car.a));
  const n = Math.hypot(nx, ny);
  if (n < 1e-6) { nx = car.x - c.x; ny = car.y - c.y; }
  const m = Math.hypot(nx, ny) || 1;
  return { nx: nx / m, ny: ny / m, depth: c.r - d + 0.01 };
}

function collide(car: CarState, hd: Handling, track: Track): Contact {
  const near = obstaclesNear(track, car.x, car.y, hd.length);
  let hardest: Contact = { impact: 0, x: car.x, y: car.y };
  const respond = (hit: { nx: number; ny: number; depth: number } | null, soft: boolean): void => {
    if (!hit) return;
    car.x += hit.nx * hit.depth;
    car.y += hit.ny * hit.depth;
    // Velocity into the obstacle is removed (with a little bounce).
    const vx = Math.cos(car.a) * car.v - Math.sin(car.a) * car.vl;
    const vy = Math.sin(car.a) * car.v + Math.cos(car.a) * car.vl;
    const into = vx * hit.nx + vy * hit.ny;
    if (into >= 0) return;
    const bounce = soft ? 0.05 : 0.25;
    const nvx = vx - (1 + bounce) * into * hit.nx;
    const nvy = vy - (1 + bounce) * into * hit.ny;
    const damp = soft ? 0.8 : 0.55;
    car.v = (nvx * Math.cos(car.a) + nvy * Math.sin(car.a)) * damp;
    car.vl = (-nvx * Math.sin(car.a) + nvy * Math.cos(car.a)) * damp * 0.5;
    const impact = -into * (soft ? 0.25 : 1);
    if (impact > hardest.impact) hardest = { impact, x: car.x - hit.nx * hd.width / 2, y: car.y - hit.ny * hd.width / 2 };
  };
  for (const b of near.boxes) respond(boxHit(car, hd, b), false);
  for (const c of near.circles) respond(circleHit(car, hd, c), c.kind === 'cone' || c.kind === 'bush' || c.kind === 'tyres');
  return hardest;
}

/** Puts the car back on the route, pointing the right way. */
export function resetToRoute(car: CarState, track: Track, at: number): void {
  const n = nearestOnPath(track, car.x, car.y);
  const d = Math.max(4, Math.min(track.length - 2, Math.max(at, n.at)));
  let lo = 0;
  while (lo < track.cum.length - 2 && track.cum[lo + 1] < d) lo += 1;
  const a = track.path[lo];
  const b = track.path[lo + 1];
  car.x = a.x;
  car.y = a.y;
  car.a = Math.atan2(b.y - a.y, b.x - a.x);
  car.v = 0;
  car.vl = 0;
  car.steer = 0;
}
