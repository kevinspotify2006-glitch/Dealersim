/**
 * One test drive: the clock, checkpoints, staying on the route, crashes,
 * and the scores at the end. The view feeds it input and draws it; nothing
 * here touches the DOM or the saved game.
 */
import type { CarState, Handling, Input } from './physics';
import { resetToRoute, stepCar } from './physics';
import type { Track } from './track';
import { nearestOnPath } from './track';

export type DriveState = 'idle' | 'starting' | 'driving' | 'checkpoint' | 'crashed' | 'finished' | 'exiting' | 'complete';

export interface DriveResult {
  finished: boolean;
  stoppedEarly: boolean;
  time: number;              // seconds driven
  distance: number;          // metres
  topSpeed: number;          // km/h
  avgSpeed: number;          // km/h
  smoothness: number;        // 0..100
  route: number;             // 0..100 checkpoints and staying on the route
  overall: number;           // 0..100
  stars: number;             // 1..5
  checkpoints: number;
  totalCheckpoints: number;
  collisions: number;
  damage: number;            // test-drive damage 0..100 (reset afterwards)
  offRoadSeconds: number;
  bonusTime: boolean;
}

export interface Message { text: string; tone: 'good' | 'bad' | 'info'; until: number }

export const START_TIME = 90;
export const BONUS_TIME = 30;
const FIXED = 1 / 120;

export class DriveSession {
  state: DriveState = 'idle';
  car: CarState;
  timeLeft = START_TIME;
  elapsed = 0;
  countdown = 3;
  next = 0;                   // index of the next checkpoint
  distance = 0;
  topSpeed = 0;
  collisions = 0;
  damage = 0;
  offRoad = 0;
  harsh = 0;                  // penalty points for harsh inputs and sliding
  bonusUsed = false;
  crashTimer = 0;
  stuckTimer = 0;
  offRouteTimer = 0;
  lastCheckpointAt = 0;
  pathHint = 0;
  progressAt = 0;             // best distance reached along the route
  message: Message | null = null;
  result: DriveResult | null = null;
  skids: { x: number; y: number; a: number; t: number }[] = [];
  private acc = 0;
  private lastSteer = 0;
  private lastAcc = 0;

  constructor(public track: Track, public handling: Handling) {
    this.car = { x: track.start.x, y: track.start.y, a: track.start.a, v: 0, vl: 0, steer: 0, onRoad: true, slip: 0 };
  }

  start(): void {
    if (this.state === 'idle') this.state = 'starting';
  }

  say(text: string, tone: Message['tone'], seconds = 1.6): void {
    this.message = { text, tone, until: this.elapsed + seconds + (this.state === 'starting' ? 3 : 0) };
  }

  /** Manual reset (R): back on the route, a second lost. */
  reset(): void {
    if (this.state !== 'driving' && this.state !== 'checkpoint' && this.state !== 'crashed') return;
    resetToRoute(this.car, this.track, this.lastCheckpointAt);
    this.pathHint = nearestOnPath(this.track, this.car.x, this.car.y).i;
    this.timeLeft = Math.max(0, this.timeLeft - 1);
    this.state = 'driving';
    this.say('Back on the route', 'info', 1.2);
  }

  /** Stop now (Esc / exit): the drive ends with what you have done so far. */
  stop(): void {
    if (this.state === 'finished' || this.state === 'complete') return;
    this.finish(false, true);
  }

  update(dt: number, input: Input): void {
    dt = Math.min(0.1, dt);
    if (this.state === 'idle' || this.state === 'complete' || this.state === 'finished' || this.state === 'exiting') return;
    if (this.state === 'starting') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.state = 'driving'; this.say('GO!', 'good', 0.9); }
      return;
    }
    this.acc += dt;
    while (this.acc >= FIXED) {
      this.acc -= FIXED;
      this.tick(FIXED, input);
      if ((this.state as DriveState) === 'finished') break;
    }
  }

  private tick(dt: number, input: Input): void {
    this.elapsed += dt;
    if (this.state === 'crashed') {
      this.crashTimer -= dt;
      this.car.v *= 0.9;
      if (this.crashTimer <= 0) {
        resetToRoute(this.car, this.track, this.lastCheckpointAt);
        this.pathHint = nearestOnPath(this.track, this.car.x, this.car.y).i;
        this.state = 'driving';
        this.say('Car reset — carry on', 'info', 1.2);
      }
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      const done = this.next / this.track.checkpoints.length;
      if (!this.bonusUsed && done >= 0.5) {
        this.bonusUsed = true;
        this.timeLeft += BONUS_TIME;
        this.say(`+${BONUS_TIME} s — almost there!`, 'good', 2);
      } else {
        this.timeLeft = 0;
        this.finish(false, false);
        return;
      }
    }
    const x0 = this.car.x;
    const y0 = this.car.y;
    const contact = stepCar(this.car, this.handling, input, dt, this.track);
    const moved = Math.hypot(this.car.x - x0, this.car.y - y0);
    this.distance += moved;
    const kmh = Math.abs(this.car.v) * 3.6;
    if (kmh > this.topSpeed) this.topSpeed = kmh;
    // Smooth driving: gentle steering, no stamping on pedals, no sliding.
    const steerJerk = Math.abs(input.steer - this.lastSteer);
    const pedal = input.throttle - input.brake;
    const pedalJerk = Math.abs(pedal - this.lastAcc);
    if (kmh > 15) this.harsh += (steerJerk > 0.6 ? 0.25 : 0) + (pedalJerk > 1.2 ? 0.2 : 0) + this.car.slip * dt * 1.5;
    this.lastSteer = input.steer;
    this.lastAcc = pedal;
    if (this.car.slip > 0.45 && kmh > 20 && (this.skids.length === 0 || Math.hypot(this.skids[this.skids.length - 1].x - this.car.x, this.skids[this.skids.length - 1].y - this.car.y) > 0.8)) {
      this.skids.push({ x: this.car.x, y: this.car.y, a: this.car.a, t: this.elapsed });
      if (this.skids.length > 240) this.skids.shift();
    }
    if (!this.car.onRoad) this.offRoad += dt;
    // Knocks: small ones cost smoothness, big ones stop the drive for a moment.
    if (contact.impact > 1.2) {
      this.collisions += 1;
      this.damage = Math.min(100, this.damage + contact.impact * 1.6);
      this.harsh += contact.impact * 0.6;
      if (contact.impact > 7) {
        this.state = 'crashed';
        this.crashTimer = 1.1;
        this.say('💥 Crash! Resetting the car…', 'bad', 1.4);
        return;
      }
      this.say('Bump!', 'bad', 0.7);
    }
    // Stuck against something with the throttle down: help out.
    if (Math.abs(this.car.v) < 0.6 && (input.throttle > 0.5 || input.brake > 0.5)) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > 2.5) { this.stuckTimer = 0; this.reset(); }
    // Where are we on the route?
    const n = nearestOnPath(this.track, this.car.x, this.car.y, this.pathHint, 50);
    let near = n;
    if (n.off > 30) near = nearestOnPath(this.track, this.car.x, this.car.y);
    this.pathHint = near.i;
    if (near.off < this.track.width) this.progressAt = Math.max(this.progressAt, near.at);
    const out = this.car.x < this.track.bounds.x0 || this.car.y < this.track.bounds.y0 || this.car.x > this.track.bounds.x1 || this.car.y > this.track.bounds.y1;
    if (near.off > this.track.width * 1.4) {
      this.offRouteTimer += dt;
      if (this.offRouteTimer > 1 && (!this.message || this.message.text !== 'Return to route')) this.say('Return to route', 'bad', 1.5);
    } else this.offRouteTimer = 0;
    if (out || near.off > 55 || this.offRouteTimer > 9) {
      this.offRouteTimer = 0;
      resetToRoute(this.car, this.track, this.lastCheckpointAt);
      this.pathHint = nearestOnPath(this.track, this.car.x, this.car.y).i;
      this.say('Returned to the route', 'info', 1.4);
      return;
    }
    // Checkpoints, in order.
    const cp = this.track.checkpoints[this.next];
    if (cp && Math.hypot(this.car.x - cp.x, this.car.y - cp.y) <= cp.r) {
      this.next += 1;
      this.lastCheckpointAt = cp.at;
      if (this.next >= this.track.checkpoints.length) { this.finish(true, false); return; }
      this.say(`✓ Checkpoint reached · ${this.next}/${this.track.checkpoints.length - 1}`, 'good', 1.5);
      this.state = 'checkpoint';
    } else if (this.state === 'checkpoint' && this.message && this.elapsed > this.message.until) this.state = 'driving';
  }

  private finish(finished: boolean, stoppedEarly: boolean): void {
    const total = this.track.checkpoints.length;
    const reached = this.next;
    const progress = Math.min(1, this.progressAt / this.track.length);
    const onRouteShare = this.elapsed > 0 ? Math.max(0, 1 - this.offRoad / this.elapsed) : 1;
    const route = Math.round(Math.max(0, Math.min(100, (finished ? 70 : (reached / total) * 55 + progress * 15) + onRouteShare * 30)));
    const smoothness = Math.round(Math.max(0, Math.min(100, 100 - this.harsh * 2.2 - this.collisions * 4 - this.offRoad * 1.5)));
    const par = this.track.length / 17;   // ~60 km/h average
    const timeScore = finished ? Math.max(0, Math.min(100, 100 - Math.max(0, this.elapsed - par) * 1.2)) : progress * 60;
    const overall = Math.round(route * 0.45 + smoothness * 0.35 + timeScore * 0.2);
    const stars = Math.max(1, Math.min(5, Math.round(overall / 20)));
    this.result = {
      finished, stoppedEarly, time: this.elapsed, distance: this.distance, topSpeed: Math.round(this.topSpeed),
      avgSpeed: this.elapsed > 0 ? Math.round((this.distance / this.elapsed) * 3.6) : 0,
      smoothness, route, overall, stars, checkpoints: Math.min(reached, total - 1), totalCheckpoints: total - 1,
      collisions: this.collisions, damage: Math.round(this.damage), offRoadSeconds: Math.round(this.offRoad), bonusTime: this.bonusUsed,
    };
    this.state = 'finished';
  }
}

/** A simple autopilot that follows the route (used by the tests and the demo). */
export function autopilot(s: DriveSession, lookAhead = 14, cruise = 62): Input {
  const t = s.track;
  const n = nearestOnPath(t, s.car.x, s.car.y, s.pathHint, 50);
  let target = n.at + lookAhead + Math.abs(s.car.v) * 0.6;
  target = Math.min(t.length - 0.5, target);
  let lo = n.i;
  while (lo < t.cum.length - 2 && t.cum[lo + 1] < target) lo += 1;
  const p = t.path[Math.min(t.path.length - 1, lo + 1)];
  const want = Math.atan2(p.y - s.car.y, p.x - s.car.x);
  let d = want - s.car.a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  // Slow down for bends coming up.
  let bend = 0;
  for (let k = lo; k < Math.min(t.path.length - 2, lo + 12); k += 1) {
    const a1 = Math.atan2(t.path[k + 1].y - t.path[k].y, t.path[k + 1].x - t.path[k].x);
    const a2 = Math.atan2(t.path[k + 2].y - t.path[k + 1].y, t.path[k + 2].x - t.path[k + 1].x);
    let e = a2 - a1;
    while (e > Math.PI) e -= Math.PI * 2;
    while (e < -Math.PI) e += Math.PI * 2;
    bend += Math.abs(e);
  }
  const speedTarget = Math.max(18, cruise - bend * 22) / 3.6;
  const v = s.car.v;
  return { steer: Math.max(-1, Math.min(1, d * 2.2)), throttle: v < speedTarget ? 1 : 0, brake: v > speedTarget + 2 ? 0.6 : 0 };
}
