/**
 * The test drive: a full-screen, top-down driving game over the dealership
 * game. Pick a route, drive it (keyboard or touch controls), see how it went
 * and go back to the dealership. The management game is paused meanwhile;
 * nothing about the drive is saved, so closing the app mid-drive is safe.
 */
import { enterMode } from '../mode';
import type { Ctx } from '../app';
import type { GameState, Vehicle } from '../../sim/types';
import { h, toast } from '../dom';
import { money } from '../../sim/format';
import { vehicleName } from '../../sim/state';
import { activeLocation } from '../../sim/state';
import { buildTrack } from '../../drive/track';
import type { Box, Track } from '../../drive/track';
import { handlingOf } from '../../drive/physics';
import type { Handling, Input } from '../../drive/physics';
import { DriveSession, autopilot } from '../../drive/session';
import type { DriveResult } from '../../drive/session';
import { ROUTE_BY_ID, availableRoutes } from '../../drive/routes';
import { applyDrive, confidenceOf, driveCost, driveVehicle } from '../../sim/testdrive';
import type { DriveContext, DriveOutcome } from '../../sim/testdrive';
import { buyOffer } from '../../sim/trading';
import { drawCar } from '../world/render';
import { pushBackHandler, haptic } from '../../platform/platform';
import { play } from '../../platform/sound';

let lastRoute = 'loop';
let open = false;

export function isDriving(): boolean {
  return open;
}

/** Opens the test drive for a car: on the market, in stock, or with a customer. */
export function openDrive(ctx: Ctx, dctx: DriveContext, onClose?: () => void): void {
  if (open) return;
  const s = ctx.state;
  const v = driveVehicle(s, dctx);
  if (!v) { ctx.act({ ok: false, message: 'That car is no longer available.' }); return; }
  if (dctx.kind === 'customer') {
    const c = s.customers.find((x) => x.id === dctx.customerId);
    if (!c || (c.status !== 'waiting' && c.status !== 'negotiating')) { ctx.act({ ok: false, message: 'The customer has left.' }); return; }
    if (c.testDrive) { ctx.act({ ok: false, message: 'Already test-driven.' }); return; }
  }
  open = true;
  const wasHold = ctx.engine.hold;
  ctx.engine.hold = true;
  const overlay = h('div', { class: 'drive-overlay', role: 'dialog', aria: { label: `Test drive: ${vehicleName(v)}` } });
  document.body.appendChild(overlay);
  const leaveMode = enterMode('drive');
  let enteredFullscreen = false;
  let cleanup: (() => void) | null = null;
  let lastCanvas: HTMLCanvasElement | null = null;
  const releaseBack = pushBackHandler(() => { back(); return true; });
  let backAction: () => void = () => close();
  const back = (): void => backAction();

  const close = (): void => {
    cleanup?.();
    cleanup = null;
    overlay.remove();
    leaveMode();
    releaseBack();
    ctx.engine.hold = wasHold;
    if (enteredFullscreen && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    open = false;
    (window as unknown as { __CDMT_DRIVE__?: unknown }).__CDMT_DRIVE__ = undefined;
    ctx.refresh();
    onClose?.();
  };

  const goFullscreen = (): void => {
    const touch = matchMedia('(pointer: coarse)').matches;
    if (!touch || document.fullscreenElement || document.documentElement.classList.contains('is-android')) return;
    const req = overlay.requestFullscreen?.bind(overlay);
    if (req) req().then(() => { enteredFullscreen = true; }).catch(() => undefined);
  };

  // ---------------------------------------------------------- route picker --
  const picker = (): void => {
    cleanup?.();
    cleanup = null;
    backAction = () => close();
    const loc = s.locations.find((l) => l.id === dctx.locationId) ?? activeLocation(s);
    const routes = availableRoutes(s, loc);
    if (!routes.find((r) => r.id === lastRoute && r.unlocked)) lastRoute = 'loop';
    const hd = handlingOf(v);
    const bar = (label: string, value: number, text: string): HTMLElement => h('div', { class: 'dv-meter' }, h('span', { class: 'dv-k', text: label }), h('span', { class: 'dv-bar' }, h('i', { style: `width:${Math.round(Math.max(0.06, Math.min(1, value)) * 100)}%` })), h('span', { class: 'dv-num', text }));
    const list = h('div', { class: 'dv-routes' });
    const paint = (): void => {
      list.replaceChildren(...routes.map((r) => h('button', {
        class: `dv-route${r.id === lastRoute ? ' active' : ''}${r.unlocked ? '' : ' locked'}`,
        data: { route: r.id },
        disabled: !r.unlocked,
        title: r.unlocked ? r.description : r.requirement,
        on: { click: () => { lastRoute = r.id; paint(); } },
      }, h('span', { class: 'dv-route-ic', text: r.icon }), h('span', { class: 'dv-route-name', text: r.name }), h('span', { class: 'dv-route-sub', text: r.unlocked ? r.length : `🔒 ${r.requirement}` }))));
    };
    paint();
    const who = dctx.kind === 'customer' ? s.customers.find((c) => c.id === dctx.customerId) : undefined;
    overlay.replaceChildren(h('div', { class: 'dv-card dv-pick' },
      h('div', { class: 'dv-title' }, h('span', { text: '🗝️ TEST DRIVE' }), h('button', { class: 'icon-btn dv-x', aria: { label: 'Close' }, data: { dv: 'close' }, on: { click: close } }, '✕')),
      h('div', { class: 'dv-car' },
        h('div', {}, h('div', { class: 'dv-car-name', text: vehicleName(v) }), h('div', { class: 'dv-car-sub', text: `${v.hp} hp · ${v.body} · ${v.fuel} · ${v.transmission} · drives ${hd.label}` })),
        who ? h('div', { class: 'dv-conf' }, h('span', { class: 'dv-k', text: `${who.name}'s purchase confidence` }), h('strong', { text: `${confidenceOf(who)}%` })) : null),
      h('div', { class: 'dv-meters' },
        bar('Acceleration', hd.accel / 9.5, `${(27.8 / hd.accel).toFixed(1)} s to 100`),
        bar('Top speed', hd.maxSpeed / (300 / 3.6), `${Math.round(hd.maxSpeed * 3.6)} km/h`),
        bar('Braking', hd.braking / 11, `${hd.braking.toFixed(1)} m/s²`),
        bar('Grip', hd.grip / 1.2, `${hd.grip.toFixed(2)} g`),
        bar('Turning circle', 1 - (hd.turningRadius - 3.5) / 4, `${(hd.turningRadius * 2).toFixed(1)} m`),
        bar('Weight', hd.mass / 2500, `${Math.round(hd.mass)} kg`)),
      h('div', { class: 'dv-sub', text: 'Route' }),
      list,
      h('p', { class: 'dv-hint', text: matchMedia('(pointer: coarse)').matches ? 'Left thumb steers, right thumb: GAS and BRAKE (hold BRAKE to reverse). Turn your phone sideways for the best view.' : 'W/↑ gas · S/↓ brake & reverse · A/D or ←/→ steer · R reset · Esc exit' }),
      h('div', { class: 'dv-actions' },
        h('button', { class: 'btn', data: { dv: 'cancel' }, on: { click: close } }, 'Back'),
        h('button', { class: 'btn primary', data: { dv: 'start' }, on: { click: () => { goFullscreen(); drive(lastRoute); } } }, `Start · ${money(driveCost(v))} fuel`))));
  };

  // ---------------------------------------------------------------- drive --
  const drive = (routeId: string): void => {
    cleanup?.();
    const route = ROUTE_BY_ID[routeId] ?? ROUTE_BY_ID.loop;
    const track = buildTrack(route.recipe, s.companyName);
    const hd = handlingOf(v);
    const session = new DriveSession(track, hd);
    const canvas = h('canvas', { class: 'dv-canvas' });
    lastCanvas = canvas;
    const mini = h('canvas', { class: 'dv-mini' });
    mini.width = 132;
    mini.height = 132;
    const hudTime = h('strong', { class: 'dv-time', text: '01:30' });
    const hudSpeed = h('strong', { text: '0' });
    const hudDist = h('strong', { text: '0.00' });
    const hudCp = h('strong', { text: '0/3' });
    const hudDamage = h('span', { class: 'dv-damage' });
    const msg = h('div', { class: 'dv-msg' });
    const count = h('div', { class: 'dv-count' });
    const hud = h('div', { class: 'dv-hud' },
      h('div', { class: 'dv-hud-title' }, h('span', { text: 'TEST DRIVE' }), hudTime),
      h('div', { class: 'dv-hud-row' },
        h('div', {}, h('span', { class: 'dv-k', text: 'Speed' }), h('span', {}, hudSpeed, ' km/h')),
        h('div', {}, h('span', { class: 'dv-k', text: 'Distance' }), h('span', {}, hudDist, ' km')),
        h('div', {}, h('span', { class: 'dv-k', text: 'Checkpoint' }), hudCp)),
      hudDamage);
    const input: Input = { throttle: 0, brake: 0, steer: 0 };
    const keys = new Set<string>();
    const touch = { steer: 0, gas: false, brake: false };
    let auto = false;
    // Touch controls: a steering stick on the left, GAS and BRAKE on the right.
    const knob = h('div', { class: 'dv-knob' });
    const stick = h('div', { class: 'dv-stick', aria: { label: 'Steering' } }, h('div', { class: 'dv-stick-base' }, knob));
    const gas = h('button', { class: 'dv-pedal gas', aria: { label: 'Gas' }, data: { dv: 'gas' } }, 'GAS');
    const brake = h('button', { class: 'dv-pedal brake', aria: { label: 'Brake / reverse' }, data: { dv: 'brake' } }, 'BRAKE');
    const controls = h('div', { class: 'dv-controls' }, stick, h('div', { class: 'dv-pedals' }, brake, gas));
    const exitBtn = h('button', { class: 'icon-btn dv-exit', aria: { label: 'Exit test drive (Esc)' }, data: { dv: 'exit' }, on: { click: () => stop() } }, '✕');
    const resetBtn = h('button', { class: 'icon-btn dv-reset', aria: { label: 'Reset car (R)' }, data: { dv: 'reset' }, on: { click: () => session.reset() } }, '⟲');
    overlay.replaceChildren(canvas, hud, mini, exitBtn, resetBtn, msg, count, controls);
    backAction = () => stop();

    let stickId = -1;
    let stickX = 0;
    const stickMove = (e: PointerEvent): void => {
      if (e.pointerId !== stickId) return;
      const dx = Math.max(-56, Math.min(56, e.clientX - stickX));
      touch.steer = dx / 56;
      knob.style.transform = `translateX(${dx}px)`;
    };
    const stickUp = (e: PointerEvent): void => {
      if (e.pointerId !== stickId) return;
      stickId = -1;
      touch.steer = 0;
      knob.style.transform = '';
      stick.classList.remove('on');
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stickId = e.pointerId;
      const base = stick.querySelector('.dv-stick-base') as HTMLElement;
      const r = base.getBoundingClientRect();
      stickX = r.left + r.width / 2;
      stick.setPointerCapture?.(e.pointerId);
      stick.classList.add('on');
      stickMove(e);
    });
    stick.addEventListener('pointermove', stickMove);
    stick.addEventListener('pointerup', stickUp);
    stick.addEventListener('pointercancel', stickUp);
    const pedal = (el: HTMLElement, key: 'gas' | 'brake'): void => {
      const on = (e: PointerEvent): void => { e.preventDefault(); touch[key] = true; el.classList.add('on'); el.setPointerCapture?.(e.pointerId); haptic(6); };
      const off = (): void => { touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    pedal(gas, 'gas');
    pedal(brake, 'brake');
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    const down = (e: KeyboardEvent): void => {
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) { e.preventDefault(); keys.add(k); }
      if (k === 'KeyR') session.reset();
    };
    const up = (e: KeyboardEvent): void => { keys.delete(e.code); };
    const blur = (): void => { keys.clear(); touch.gas = false; touch.brake = false; touch.steer = 0; };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    const stop = (): void => {
      if (session.state === 'finished') return;
      session.stop();
    };

    let raf = 0;
    let last = performance.now();
    let miniTimer = 0;
    let lastState = session.state;
    let shake = 0;
    let lastCollisions = 0;
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const kb = (a: string, b: string): boolean => keys.has(a) || keys.has(b);
      if (auto && (session.state === 'driving' || session.state === 'checkpoint')) Object.assign(input, autopilot(session));
      else {
        input.throttle = kb('KeyW', 'ArrowUp') || touch.gas ? 1 : 0;
        input.brake = kb('KeyS', 'ArrowDown') || keys.has('Space') || touch.brake ? 1 : 0;
        const kSteer = (kb('KeyD', 'ArrowRight') ? 1 : 0) - (kb('KeyA', 'ArrowLeft') ? 1 : 0);
        input.steer = kSteer || touch.steer;
      }
      session.update(dt, input);
      if (session.collisions > lastCollisions) { lastCollisions = session.collisions; shake = 0.35; haptic(25); play('error'); }
      shake = Math.max(0, shake - dt);
      render(canvas, session, track, v, shake);
      // HUD (text only changes when it has to).
      const t = Math.max(0, Math.ceil(session.timeLeft));
      const tt = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      if (hudTime.textContent !== tt) hudTime.textContent = tt;
      hudTime.classList.toggle('low', session.timeLeft < 15);
      const sp = String(Math.round(Math.abs(session.car.v) * 3.6));
      if (hudSpeed.textContent !== sp) hudSpeed.textContent = sp;
      const di = (session.distance / 1000).toFixed(2);
      if (hudDist.textContent !== di) hudDist.textContent = di;
      const total = track.checkpoints.length - 1;
      const cp = session.next >= total ? 'Finish' : `${session.next}/${total}`;
      if (hudCp.textContent !== cp) hudCp.textContent = cp;
      const dmg = session.damage > 0 ? `Test-drive damage ${Math.round(session.damage)}%` : '';
      if (hudDamage.textContent !== dmg) hudDamage.textContent = dmg;
      if (session.state === 'starting') {
        const c = String(Math.ceil(session.countdown));
        if (count.textContent !== c) { count.textContent = c; play('click'); }
        count.classList.add('on');
      } else if (count.classList.contains('on')) count.classList.remove('on');
      const m = session.message && session.elapsed <= session.message.until ? session.message : null;
      const mt = m ? m.text : '';
      if (msg.textContent !== mt) { msg.textContent = mt; msg.className = `dv-msg${m ? ` on ${m.tone}` : ''}`; if (m?.tone === 'good') play('success'); }
      miniTimer -= dt;
      if (miniTimer <= 0) { miniTimer = 0.15; renderMini(mini, session, track); }
      if (session.state !== lastState) {
        lastState = session.state;
        if (session.state === 'finished' && session.result) { finish(session.result, routeId); return; }
      }
      raf = requestAnimationFrame(frame);
    };
    cleanup = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // Test handle: automated tests drive with the autopilot or read the state.
    (window as unknown as { __CDMT_DRIVE__?: unknown }).__CDMT_DRIVE__ = {
      state: () => ({ state: session.state, next: session.next, speed: session.car.v * 3.6, x: session.car.x, y: session.car.y, a: session.car.a, timeLeft: session.timeLeft, distance: session.distance, collisions: session.collisions, route: routeId }),
      autopilot: (on: boolean) => { auto = on; },
      skipCountdown: () => { session.countdown = 0; },
      /** Runs the drive forward instantly with the autopilot (tests only; same physics). */
      simulate: (seconds: number) => {
        for (let t = 0; t < seconds && session.state !== 'finished'; t += 1 / 60) session.update(1 / 60, session.state === 'driving' || session.state === 'checkpoint' ? autopilot(session) : { throttle: 0, brake: 0, steer: 0 });
      },
    };
    session.start();
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
  };

  // --------------------------------------------------------------- results --
  const finish = (r: DriveResult, routeId: string): void => {
    cleanup?.();
    cleanup = null;
    const before = s.cash;
    const out: DriveOutcome = applyDrive(s, dctx, routeId, r);
    void before;
    const route = ROUTE_BY_ID[routeId];
    const stars = '★★★★★'.slice(0, r.stars) + '☆☆☆☆☆'.slice(0, 5 - r.stars);
    const time = `${String(Math.floor(r.time / 60)).padStart(2, '0')}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    const row = (k: string, val: string, cls = ''): HTMLElement => h('div', { class: 'dv-res-row' }, h('span', { class: 'dv-k', text: k }), h('strong', { class: cls, text: val }));
    const title = r.finished ? 'TEST DRIVE COMPLETE' : r.stoppedEarly ? 'TEST DRIVE STOPPED' : 'TIME UP';
    const offer = dctx.kind === 'offer' ? s.offers.find((o) => o.id === dctx.vehicleId) : undefined;
    const customer = dctx.kind === 'customer' ? s.customers.find((c) => c.id === dctx.customerId) : undefined;
    const actions = h('div', { class: 'dv-actions' });
    if (offer) actions.appendChild(h('button', { class: 'btn primary', data: { dv: 'buy' }, on: { click: () => { const res = buyOffer(s, offer.id, dctx.locationId); ctx.act(res, { sound: 'buy' }); if (res.ok) close(); } } }, `BUY CAR · ${money(offer.offerPrice)}`));
    if (customer && (customer.status === 'waiting' || customer.status === 'negotiating')) actions.appendChild(h('button', { class: 'btn primary', data: { dv: 'negotiate' }, on: { click: () => { close(); ctx.serve(customer.id); } } }, 'Negotiate now'));
    if (dctx.kind !== 'customer' && driveVehicle(s, dctx)) actions.appendChild(h('button', { class: 'btn', data: { dv: 'again' }, on: { click: () => drive(routeId) } }, 'DRIVE AGAIN'));
    actions.appendChild(h('button', { class: 'btn ghost', data: { dv: 'back' }, on: { click: close } }, 'BACK'));
    const conf = out.confidenceBefore !== undefined && out.confidenceAfter !== undefined
      ? h('div', { class: 'dv-confbar' }, h('span', { class: 'dv-k', text: 'Purchase confidence' }),
        h('div', { class: 'dv-confline' }, h('span', { text: `${out.confidenceBefore}%` }), h('span', { class: 'dv-arrow', text: '→' }), h('strong', { class: out.confidenceAfter >= out.confidenceBefore ? 'good' : 'bad', text: `${out.confidenceAfter}%` })),
        h('span', { class: 'dv-bar wide' }, h('i', { style: `width:${out.confidenceAfter}%` })))
      : null;
    if (lastCanvas) lastCanvas.classList.add('dim');
    overlay.replaceChildren(...(lastCanvas ? [lastCanvas] : []), h('div', { class: 'dv-card dv-result', data: { dv: 'result' } },
      h('div', { class: 'dv-title' }, h('span', { text: title })),
      h('div', { class: 'dv-stars', text: stars, title: `Overall ${r.overall}/100` }),
      h('div', { class: 'dv-res' },
        row('Vehicle', vehicleName(v)),
        row('Route', `${route?.icon ?? ''} ${route?.name ?? routeId}`),
        row('Distance', `${(r.distance / 1000).toFixed(2)} km`),
        row('Time', time),
        row('Top speed', `${r.topSpeed} km/h`),
        row('Smoothness', `${r.smoothness}%`, r.smoothness >= 70 ? 'good' : r.smoothness >= 45 ? 'warn' : 'bad'),
        row('Route', `${r.route}%`, r.route >= 80 ? 'good' : r.route >= 50 ? 'warn' : 'bad'),
        row('Checkpoints', `${r.checkpoints}/${r.totalCheckpoints}${r.finished ? ' + finish' : ''}`),
        row('Test-drive damage', `${r.damage}% · reset`, r.damage ? 'warn' : ''),
        row('Fuel', money(out.cost))),
      conf,
      h('p', { class: 'dv-note', text: out.message }),
      out.record ? h('p', { class: 'dv-note good', text: `🏆 New best on the ${route?.name}!` }) : null,
      r.damage ? h('p', { class: 'dv-note tiny', text: 'The knocks were part of the test drive only — the real car’s condition is unchanged.' }) : null,
      actions));
    backAction = () => close();
    play(r.stars >= 4 ? 'success' : 'click');
    if (!out.ok) toast(out.message, 'bad');
  };

  picker();
}

// ----------------------------------------------------------------- render --

const SCENE_BG: Record<string, string> = { town: '#2f4a33', suburb: '#35573a', industrial: '#3d403f', highway: '#314d34', scenic: '#2b5233', premium: '#34583c', circuit: '#2f4f36', ev: '#2e4b3a' };

function render(canvas: HTMLCanvasElement, s: DriveSession, t: Track, v: Vehicle, shake: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  if (!g) return;
  const car = s.car;
  const speed = Math.abs(car.v);
  const ppm = Math.max(5, Math.min(13, Math.min(W, H) / 48)) / (1 + speed / 70);
  const lookX = Math.cos(car.a) * car.v * 0.9;
  const lookY = Math.sin(car.a) * car.v * 0.9;
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 18 : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * shake * 18 : 0;
  const cx = car.x + lookX;
  const cy = car.y + lookY;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = SCENE_BG[t.scenery] ?? '#2f4a33';
  g.fillRect(0, 0, W, H);
  g.setTransform(dpr * ppm, 0, 0, dpr * ppm, dpr * (W / 2 - cx * ppm + sx), dpr * (H / 2 - cy * ppm + sy));
  const vx0 = cx - W / 2 / ppm - 10;
  const vy0 = cy - H / 2 / ppm - 10;
  const vx1 = cx + W / 2 / ppm + 10;
  const vy1 = cy + H / 2 / ppm + 10;
  const visible = (x: number, y: number, r: number): boolean => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
  // Grass texture.
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = Math.floor(vx0 / 6) * 6; x < vx1; x += 6) for (let y = Math.floor(vy0 / 6) * 6; y < vy1; y += 6) if (((x * 73856093) ^ (y * 19349663)) & 4) g.fillRect(x, y, 0.4, 0.4);
  // Car parks.
  for (const l of t.lots) {
    if (!visible(l.x, l.y, Math.hypot(l.hw, l.hh))) continue;
    g.save(); g.translate(l.x, l.y); g.rotate(l.a);
    g.fillStyle = '#2c3036'; g.fillRect(-l.hw, -l.hh, l.hw * 2, l.hh * 2);
    g.strokeStyle = 'rgba(233,236,239,0.5)'; g.lineWidth = 0.12;
    for (let d = -l.hw + 2; d < l.hw - 1; d += 3.2) { g.beginPath(); g.moveTo(d, -l.hh + 0.5); g.lineTo(d, -l.hh + 5); g.moveTo(d, l.hh - 0.5); g.lineTo(d, l.hh - 5); g.stroke(); }
    g.restore();
  }
  // Roads: kerb, asphalt, markings.
  const stroke = (pts: { x: number; y: number }[], width: number, color: string, dash?: number[]): void => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.setLineDash(dash ?? []);
    g.stroke();
    g.setLineDash([]);
  };
  const roadVisible = (pts: { x: number; y: number }[]): boolean => pts.some((p) => visible(p.x, p.y, 20));
  for (const r of t.roads) if (roadVisible(r.pts)) stroke(r.pts, r.width + 2.4, t.scenery === 'circuit' ? '#b3202a' : '#8d949c');
  for (const r of t.roads) if (roadVisible(r.pts)) stroke(r.pts, r.width, '#2a2d33');
  for (const r of t.roads) {
    if (!roadVisible(r.pts)) continue;
    if (r.kind === 'highway') { stroke(r.pts, 0.18, 'rgba(255,255,255,0.7)', [3, 4]); continue; }
    stroke(r.pts, 0.15, r.kind === 'ring' ? 'rgba(255,255,255,0.5)' : 'rgba(255,214,90,0.75)', r.kind === 'ring' ? [1.5, 2] : [3, 3]);
  }
  // Decor: zebra crossings, flags, charger.
  for (const d of t.decor) {
    if (!visible(d.x, d.y, 10)) continue;
    g.save(); g.translate(d.x, d.y); g.rotate(d.a);
    if (d.kind === 'crossing') {
      g.fillStyle = 'rgba(240,240,240,0.85)';
      for (let k = -t.width / 2 + 0.6; k < t.width / 2 - 0.4; k += 1.1) g.fillRect(-1.2, k, 2.4, 0.55);
    } else if (d.kind === 'flag') {
      for (let i = 0; i < 4; i += 1) { g.fillStyle = (i % 2) ? '#111' : '#fff'; g.fillRect(-1 + i * 0.5, -1.5, 0.5, 0.5); g.fillStyle = (i % 2) ? '#fff' : '#111'; g.fillRect(-1 + i * 0.5, -1, 0.5, 0.5); }
      g.fillStyle = '#c8ccd2'; g.fillRect(-1.1, -1.6, 0.12, 2.6);
    } else if (d.kind === 'charger') {
      g.fillStyle = '#12241d'; g.fillRect(-1, -0.6, 2, 1.2);
      g.fillStyle = '#2fd18b'; g.fillRect(-0.7, -0.3, 1.4, 0.3);
    }
    g.restore();
  }
  // Route guide: a dotted line ahead to the next checkpoint.
  const next = t.checkpoints[s.next];
  if (next) {
    g.beginPath();
    let started = false;
    for (let i = Math.max(0, s.pathHint); i < t.path.length && t.cum[i] <= next.at + 2; i += 2) {
      if (t.cum[i] < t.cum[Math.max(0, s.pathHint)] + 4) continue;
      const p = t.path[i];
      if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
    }
    g.strokeStyle = 'rgba(255,194,51,0.35)';
    g.lineWidth = 0.5;
    g.setLineDash([0.8, 1.6]);
    g.stroke();
    g.setLineDash([]);
  }
  // Checkpoints: gates across the road.
  t.checkpoints.forEach((c, i) => {
    if (!visible(c.x, c.y, c.r + 2)) return;
    const done = i < s.next;
    const isNext = i === s.next;
    const finish = i === t.checkpoints.length - 1;
    g.save(); g.translate(c.x, c.y); g.rotate(c.a);
    const half = t.width / 2 + 1;
    if (finish) {
      for (let k = -half; k < half; k += 1) for (let j = 0; j < 2; j += 1) { g.fillStyle = ((Math.floor(k) + j) % 2) ? '#111' : '#f5f5f5'; g.fillRect(-0.5 + j * 0.5, k, 0.5, 1); }
    }
    const pulse = isNext ? 0.55 + 0.45 * Math.sin(s.elapsed * 6) : 1;
    g.fillStyle = done ? 'rgba(47,209,139,0.35)' : isNext ? `rgba(255,194,51,${0.35 * pulse})` : 'rgba(255,255,255,0.12)';
    g.fillRect(-1.2, -half, 2.4, half * 2);
    g.fillStyle = done ? '#2fd18b' : isNext ? '#ffc233' : '#8d949c';
    g.beginPath(); g.arc(0, -half - 0.6, 0.6, 0, Math.PI * 2); g.arc(0, half + 0.6, 0.6, 0, Math.PI * 2); g.fill();
    g.restore();
    if (isNext || finish) {
      g.save(); g.translate(c.x, c.y);
      g.font = 'bold 2.2px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(finish ? 'FINISH' : String(i + 1), 0.12, -t.width / 2 - 3 + 0.12);
      g.fillStyle = isNext ? '#ffc233' : '#fff'; g.fillText(finish ? 'FINISH' : String(i + 1), 0, -t.width / 2 - 3);
      g.restore();
    }
  });
  // Skid marks.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (const k of s.skids) {
    if (!visible(k.x, k.y, 3)) continue;
    g.save(); g.translate(k.x, k.y); g.rotate(k.a);
    g.fillRect(-1.4, -0.85, 0.9, 0.22); g.fillRect(-1.4, 0.63, 0.9, 0.22);
    g.restore();
  }
  // Scenery.
  const drawBox = (b: Box): void => {
    if (b.kind === 'car') { drawCar(g, b.x, b.y, b.a - Math.PI / 2 + Math.PI / 2, b.color, b.body ?? 'Sedan'); return; }
    g.save(); g.translate(b.x, b.y); g.rotate(b.a);
    if (b.kind === 'rail') { g.fillStyle = '#c8ccd2'; g.fillRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2); g.restore(); return; }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-b.hw + 0.8, -b.hh + 1, b.hw * 2, b.hh * 2);
    g.fillStyle = b.color; g.fillRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
    g.fillStyle = b.roof ?? b.color;
    g.fillRect(-b.hw + 0.6, -b.hh + 0.6, b.hw * 2 - 1.2, b.hh * 2 - 1.2);
    if (b.kind === 'container') {
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.15;
      for (let x = -b.hw + 1; x < b.hw; x += 1) { g.beginPath(); g.moveTo(x, -b.hh); g.lineTo(x, b.hh); g.stroke(); }
    } else {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-b.hw + 0.6, -b.hh + 0.6, b.hw * 2 - 1.2, 0.5);
    }
    g.restore();
    if (b.label) {
      g.save(); g.translate(b.x, b.y);
      g.font = 'bold 2.4px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#1a0a00'; g.fillText(b.label.toUpperCase().slice(0, 26), 0, 0);
      g.restore();
    }
  };
  for (const b of t.boxes) if (visible(b.x, b.y, Math.hypot(b.hw, b.hh))) drawBox(b);
  for (const c of t.circles) {
    if (!visible(c.x, c.y, c.r)) continue;
    if (c.kind === 'tree' || c.kind === 'bush') {
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.arc(c.x + 0.6, c.y + 0.8, c.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = c.kind === 'bush' ? '#3f7a45' : '#23603a'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(120,190,110,0.35)'; g.beginPath(); g.arc(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.45, 0, Math.PI * 2); g.fill();
    } else if (c.kind === 'cone') {
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, c.r * 0.45, 0, Math.PI * 2); g.fill();
    } else if (c.kind === 'lake') {
      g.fillStyle = '#2a6f97'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 0.3; g.beginPath(); g.arc(c.x, c.y, c.r - 1.5, 0, Math.PI * 2); g.stroke();
    } else if (c.kind === 'tyres') {
      g.fillStyle = '#111'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#333'; g.beginPath(); g.arc(c.x, c.y, c.r * 0.45, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#8d949c'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, Math.PI * 2); g.fill();
    }
  }
  // The car.
  drawCar(g, car.x, car.y, car.a, v.colorHex || '#ff7a1a', v.body);
  if (s.state === 'crashed') {
    g.strokeStyle = `rgba(255,77,94,${0.5 + 0.5 * Math.sin(s.elapsed * 20)})`;
    g.lineWidth = 0.3;
    g.beginPath(); g.arc(car.x, car.y, 3.2, 0, Math.PI * 2); g.stroke();
  }
  // An arrow at the screen edge towards the next checkpoint when it is out of view.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (next && !visible(next.x, next.y, -8)) {
    const ang = Math.atan2(next.y - cy, next.x - cx);
    const rx = W / 2 - 46;
    const ry = H / 2 - 46;
    const k = Math.min(Math.abs(rx / Math.cos(ang) || 1e9), Math.abs(ry / Math.sin(ang) || 1e9));
    const ax = W / 2 + Math.cos(ang) * k;
    const ay = H / 2 + Math.sin(ang) * k;
    g.save(); g.translate(ax, ay); g.rotate(ang);
    g.fillStyle = 'rgba(255,194,51,0.9)';
    g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
    g.restore();
  }
}

function renderMini(c: HTMLCanvasElement, s: DriveSession, t: Track): void {
  const g = c.getContext('2d');
  if (!g) return;
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,12,15,0.72)';
  g.fillRect(0, 0, W, H);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of t.path) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const sc = Math.min((W - 16) / (x1 - x0 || 1), (H - 16) / (y1 - y0 || 1));
  const px = (x: number): number => 8 + (x - x0) * sc + ((W - 16) - (x1 - x0) * sc) / 2;
  const py = (y: number): number => 8 + (y - y0) * sc + ((H - 16) - (y1 - y0) * sc) / 2;
  g.beginPath();
  t.path.forEach((p, i) => (i ? g.lineTo(px(p.x), py(p.y)) : g.moveTo(px(p.x), py(p.y))));
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2.5;
  g.stroke();
  t.checkpoints.forEach((cp, i) => {
    g.fillStyle = i < s.next ? '#2fd18b' : i === s.next ? '#ffc233' : '#8d949c';
    g.beginPath(); g.arc(px(cp.x), py(cp.y), i === t.checkpoints.length - 1 ? 4 : 3, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = '#ff4d5e';
  g.beginPath(); g.arc(px(s.car.x), py(s.car.y), 4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
}

export type { Handling, GameState };
