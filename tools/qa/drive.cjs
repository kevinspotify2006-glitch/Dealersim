// Headless checks for the test-drive minigame: every route can be driven to
// the finish, cars handle differently, brakes and steering work, collisions
// and resets work, and the scores make sense. Run: npm test
const path = require('path');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
const { buildTrack, roadGap } = js('drive/track.js');
const { handlingOf, stepCar } = js('drive/physics.js');
const { DriveSession, autopilot, START_TIME } = js('drive/session.js');
const { ROUTES } = js('drive/routes.js');

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

const CARS = {
  hatch: { body: 'Hatchback', hp: 110, category: 'Compact', fuel: 'Petrol', transmission: 'Manual', condition: 75, drivetrain: 'FWD' },
  sports: { body: 'Coupe', hp: 450, category: 'Performance', fuel: 'Petrol', transmission: 'Automatic', condition: 90, drivetrain: 'RWD' },
  suv: { body: 'SUV', hp: 190, category: 'SUV', fuel: 'Diesel', transmission: 'Automatic', condition: 70, drivetrain: 'AWD' },
  van: { body: 'Van', hp: 130, category: 'Van', fuel: 'Diesel', transmission: 'Manual', condition: 60, drivetrain: 'FWD' },
  ev: { body: 'Sedan', hp: 300, category: 'Electric', fuel: 'Electric', transmission: 'Automatic', condition: 95, drivetrain: 'AWD' },
  luxury: { body: 'Sedan', hp: 340, category: 'Luxury', fuel: 'Petrol', transmission: 'Automatic', condition: 88, drivetrain: 'AWD' },
};
const H = Object.fromEntries(Object.entries(CARS).map(([k, v]) => [k, handlingOf(v)]));

// Handling differs the way it should.
assert(H.sports.accel > H.hatch.accel * 1.6, `sports car should pull much harder (${H.sports.accel} vs ${H.hatch.accel})`);
assert(H.sports.maxSpeed > H.van.maxSpeed, 'sports car should be faster than a van');
assert(H.van.turningRadius > H.hatch.turningRadius, 'van should need more room to turn');
assert(H.sports.grip > H.suv.grip && H.suv.grip > H.van.grip * 0.99, 'grip order sports > SUV >= van');
assert(H.suv.mass > H.hatch.mass, 'SUV heavier than a hatchback');
assert(H.sports.braking > H.van.braking, 'sports car brakes harder');

// Every route: generated sanely and drivable to the finish by the autopilot.
for (const rt of ROUTES) {
  const t = buildTrack(rt.recipe, 'QA Motors');
  assert(t.length > 700 && t.length < 2600, `${rt.id}: route length ${Math.round(t.length)} m out of range`);
  assert(t.checkpoints.length === 4, `${rt.id}: expected 3 checkpoints + finish`);
  assert(roadGap(t, t.start.x, t.start.y) <= 0, `${rt.id}: start is not on the road`);
  for (const c of t.checkpoints) assert(roadGap(t, c.x, c.y) <= 0, `${rt.id}: checkpoint off the road`);
  assert(t.boxes.length > 8, `${rt.id}: too little scenery (${t.boxes.length} boxes)`);
  for (const car of ['hatch', 'sports', 'van', 'ev']) {
    const s = new DriveSession(t, H[car]);
    s.start();
    let steps = 0;
    while (s.state !== 'finished' && steps < 60 * 400) {
      s.update(1 / 60, s.state === 'driving' || s.state === 'checkpoint' ? autopilot(s) : { throttle: 0, brake: 0, steer: 0 });
      steps += 1;
    }
    const r = s.result;
    assert(r && r.finished, `${rt.id} / ${car}: autopilot did not finish (checkpoint ${s.next}/4, ${Math.round(s.progressAt)}/${Math.round(t.length)} m, time left ${s.timeLeft.toFixed(1)})`);
    if (r) {
      assert(r.distance > t.length * 0.9, `${rt.id} / ${car}: distance ${Math.round(r.distance)} too short`);
      assert(r.stars >= 3, `${rt.id} / ${car}: a clean autopilot drive should score 3+ stars (got ${r.stars}, overall ${r.overall}, smooth ${r.smoothness}, collisions ${r.collisions})`);
      assert(r.time < START_TIME + 30, `${rt.id} / ${car}: took ${r.time.toFixed(0)} s`);
    }
  }
}

// Controls: throttle, brake, steering, reverse.
{
  const t = buildTrack(ROUTES[0].recipe);
  const s = new DriveSession(t, H.hatch);
  s.state = 'driving';
  for (let i = 0; i < 180; i += 1) s.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  const v1 = s.car.v;
  assert(v1 > 10, `3 s full throttle should pass 36 km/h (got ${(v1 * 3.6).toFixed(0)})`);
  for (let i = 0; i < 60; i += 1) s.update(1 / 60, { throttle: 0, brake: 1, steer: 0 });
  assert(s.car.v < v1 - 6, 'brakes do not slow the car');
  const a0 = s.car.a;
  for (let i = 0; i < 60; i += 1) s.update(1 / 60, { throttle: 0.4, brake: 0, steer: 1 });
  assert(s.car.a > a0 + 0.3, 'steering right does not turn the car');
  for (let i = 0; i < 240; i += 1) s.update(1 / 60, { throttle: 0, brake: 1, steer: 0 });
  assert(s.car.v < -0.5, 'holding brake at a stop should reverse');
}

// Collisions: drive into the dealership building and bounce off; big crashes reset.
{
  const t = buildTrack(ROUTES[0].recipe);
  const s = new DriveSession(t, H.sports);
  s.state = 'driving';
  s.car.x = t.dealership.x; s.car.y = t.dealership.y + t.dealership.hh + 12; s.car.a = -Math.PI / 2;
  for (let i = 0; i < 240; i += 1) s.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  assert(s.collisions > 0, 'driving into a building registers no collision');
  assert(s.car.y > t.dealership.y - t.dealership.hh, 'car drove through a building');
  assert(s.damage > 0, 'no test-drive damage from a crash');
}

// Off the map: returned to the route.
{
  const t = buildTrack(ROUTES[0].recipe);
  const s = new DriveSession(t, H.hatch);
  s.state = 'driving';
  s.car.x = t.bounds.x1 + 50; s.car.y = t.bounds.y1 + 50;
  s.update(1 / 30, { throttle: 0, brake: 0, steer: 0 });
  assert(s.car.x < t.bounds.x1 && s.car.y < t.bounds.y1, 'car outside the map was not returned to the route');
}

// Time runs out: the drive ends (with the +30 s bonus when close to the end).
{
  const t = buildTrack(ROUTES[0].recipe);
  const s = new DriveSession(t, H.hatch);
  s.state = 'driving';
  s.next = 2;
  s.timeLeft = 0.5;
  for (let i = 0; i < 60; i += 1) s.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
  assert(s.bonusUsed && s.timeLeft > 20, 'no bonus time when most checkpoints are done');
  const s2 = new DriveSession(t, H.hatch);
  s2.state = 'driving';
  s2.timeLeft = 0.2;
  for (let i = 0; i < 60; i += 1) s2.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
  assert(s2.state === 'finished' && s2.result && !s2.result.finished, 'time-out does not end the drive');
  const s3 = new DriveSession(t, H.hatch);
  s3.start();
  s3.stop();
  assert(s3.result && s3.result.stoppedEarly && s3.result.stars >= 1, 'stopping early gives a result');
}

// Physics sanity: a car never goes NaN.
{
  const t = buildTrack(ROUTES[2].recipe);
  const car = { x: t.start.x, y: t.start.y, a: t.start.a, v: 0, vl: 0, steer: 0, onRoad: true, slip: 0 };
  for (let i = 0; i < 5000; i += 1) stepCar(car, H.suv, { throttle: Math.random(), brake: Math.random() < 0.1 ? 1 : 0, steer: Math.sin(i / 50) }, 1 / 120, t);
  assert(Number.isFinite(car.x) && Number.isFinite(car.v), 'physics produced NaN');
}

if (failures.length) {
  console.error('DRIVE CHECKS FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(`drive checks passed (${ROUTES.length} routes × 4 cars)`);
