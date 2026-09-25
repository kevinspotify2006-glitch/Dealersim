// Headless checks for the v6 build systems: catalogue sanity, bulldoze and
// refunds, area bulldoze, upgrades, land expansion, room templates, create
// room, styles, flows, and undo-safety of the numbers. Run: npm test
const path = require('path');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, key(i) { return Object.keys(this._d)[i] ?? null; }, get length() { return Object.keys(this._d).length; } };
global.window = { localStorage: global.localStorage };
const { createGame } = js('sim/newgame.js');
const lot = js('sim/lot.js');
const bp = js('sim/buildplus.js');
const { OBJECTS, OBJ_BY_ID, ZONE_BY_CODE, LAND_TIERS, EFFECTS } = js('data/lot.js');
const { ROOM_TEMPLATES, OBJ_UPGRADES, DEALER_STYLES } = js('data/buildplus.js');
const { BUILD_TABS } = js('data/buildcats.js');
const save = js('sim/save.js');

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

// ---- catalogue
const ids = new Set();
for (const o of OBJECTS) {
  assert(!ids.has(o.id), `duplicate object id ${o.id}`);
  ids.add(o.id);
  for (const z of o.zones) assert(ZONE_BY_CODE[z], `${o.id}: unknown zone ${z}`);
  for (const k of Object.keys(o.effects ?? {})) assert(EFFECTS[k], `${o.id}: unknown effect ${k}`);
  if (!o.hidden) assert(BUILD_TABS.some((t) => t.test && t.id !== 'all' && t.test(o)), `${o.id} is in no build tab`);
}
for (const id of Object.keys(OBJ_UPGRADES)) assert(OBJ_BY_ID[id], `upgrade for unknown object ${id}`);
assert(OBJECTS.filter((o) => !o.hidden).length >= 170, `expected 170+ buildable objects, got ${OBJECTS.filter((o) => !o.hidden).length}`);
for (const t of LAND_TIERS) assert(t.name, 'land tier without a name');

function rich(seed = 5) {
  const s = createGame({ companyName: 'Build QA', ownerName: 'QA', challenge: 'standard', seed });
  s.cash = 5_000_000;
  s.companyLevel = 5;
  s.reputation = 90;
  s.stats.sold = 200; s.stats.lifetimeProfit = 2_000_000; s.stats.testDrives = 50; s.stats.evSold = 20;
  for (let i = 0; i < 10; i += 1) s.employees.push({ ...s.employees[0], id: `qa${i}`, stationId: undefined });
  return s;
}

// ---- land: every tier grows the plot and keeps everything built
{
  const s = rich();
  const loc = s.locations[0];
  const before = loc.lot.objects.length;
  const tiers = [];
  let r;
  while ((r = lot.buyLand(s, loc)).ok) tiers.push(`${loc.lot.w}x${loc.lot.h}`);
  assert(tiers.length >= 3, `land expansions possible: ${tiers.join(', ')} (${r.message})`);
  assert(loc.lot.objects.length === before, 'land expansion lost objects');
  assert(loc.lot.zones.length === loc.lot.w * loc.lot.h, 'zones string does not match the new size');
  assert(LAND_TIERS[1].w === 40 && LAND_TIERS[1].h === 26, 'land tier table was mutated');
}

// ---- room templates: each one fits on a big empty plot, both rotations
{
  for (const t of ROOM_TEMPLATES) {
    for (const rot of [0, 1]) {
      const s = rich();
      const loc = s.locations[0];
      while (lot.buyLand(s, loc).ok);
      // Find a spot anywhere on open land.
      let placed = null;
      for (let y = 0; y < loc.lot.h && !placed; y += 2) for (let x = 0; x < loc.lot.w && !placed; x += 2) {
        const c = bp.stampCheck(s, loc, t.id, x, y, rot);
        if (c.ok) placed = { x, y, c };
      }
      assert(placed, `template ${t.id} rot ${rot} fits nowhere`);
      if (!placed) continue;
      assert(placed.c.skipped.length === 0, `template ${t.id} rot ${rot} skips: ${placed.c.skipped.join(', ')}`);
      const cash = s.cash;
      const n = loc.lot.objects.length;
      const res = bp.stampTemplate(s, loc, t.id, placed.x, placed.y, rot);
      assert(res.ok, `stamp ${t.id}: ${res.message}`);
      assert(loc.lot.objects.length - n === t.objects.length, `template ${t.id} rot ${rot} placed ${loc.lot.objects.length - n}/${t.objects.length}`);
      assert(Math.abs((cash - s.cash) - placed.c.cost) < 1, `template ${t.id} cost mismatch`);
      const rooms = lot.roomsOf(loc.lot).filter((rm) => rm.code === t.zone && rm.x0 >= placed.x && rm.y0 >= placed.y);
      if (ZONE_BY_CODE[t.zone].indoor) assert(rooms.some((rm) => rm.complete), `template ${t.id} rot ${rot} makes no complete room (needs: ${rooms.map((rm) => rm.needs.join('/')).join(' | ')})`);
    }
  }
}

// ---- bulldoze: refund 50–70%, critical warnings, area bulldoze, cars re-homed
{
  const s = rich();
  const loc = s.locations[0];
  const objs = loc.lot.objects.filter((o) => !OBJ_BY_ID[o.defId].hidden);
  for (const o of objs) {
    const r = lot.refundFor(s, o);
    if (r.build > 0) assert(r.rate >= 0.5 && r.rate <= 0.7, `refund rate out of range for ${o.defId}: ${r.rate}`);
  }
  const gate = loc.lot.objects.find((o) => o.defId === 'gate' || o.defId === 'grandgate');
  if (gate) assert(bp.criticalOf(s, loc, gate).some((c) => c.level === 'required'), 'the only entrance is not marked required');
  const plant = loc.lot.objects.find((o) => !OBJ_BY_ID[o.defId].slot && !OBJ_BY_ID[o.defId].station && o.defId !== 'gate' && OBJ_BY_ID[o.defId].cost > 0);
  if (plant) {
    const cash = s.cash;
    const want = lot.refundFor(s, plant).refund;
    const res = bp.bulldoze(s, loc, [plant.id]);
    assert(res.ok, `bulldoze failed: ${res.message}`);
    assert(Math.abs(s.cash - cash - want) < 1, `bulldoze refund ${s.cash - cash} != ${want}`);
    assert(!loc.lot.objects.some((o) => o.id === plant.id), 'bulldozed object still there');
  }
  // Area bulldoze over parking with cars on it.
  const cars = s.vehicles.filter((v) => v.locationId === loc.id && v.slotId).length;
  const area = bp.objectsInRect(loc.lot, 0, 0, loc.lot.w - 1, Math.floor(loc.lot.h / 2));
  const plan = bp.bulldozePlan(s, loc, area.map((o) => o.id));
  assert(plan.refund <= plan.build + plan.upgrades, 'area refund above build cost');
  const res = bp.bulldoze(s, loc, area.map((o) => o.id));
  assert(res.ok || area.length === 0, `area bulldoze: ${res.message}`);
  const stillParked = s.vehicles.filter((v) => v.locationId === loc.id && v.slotId && loc.lot.objects.some((o) => o.id === v.slotId)).length;
  assert(stillParked <= cars, 'cars multiplied');
  for (const v of s.vehicles) if (v.slotId) assert(loc.lot.objects.some((o) => o.id === v.slotId) || v.locationId !== loc.id, `car ${v.id} points at a bulldozed space`);
}

// ---- upgrades change effects and cost money
{
  const s = rich();
  const loc = s.locations[0];
  const desk = loc.lot.objects.find((o) => OBJ_UPGRADES[o.defId]);
  assert(desk, 'starter lot has nothing upgradable');
  if (desk) {
    const before = JSON.stringify(lot.objectEffects(desk));
    const cash = s.cash;
    const r1 = bp.upgradeObject(s, loc, desk.id);
    const r2 = bp.upgradeObject(s, loc, desk.id);
    const r3 = bp.upgradeObject(s, loc, desk.id);
    assert(r1.ok && r2.ok && !r3.ok, `upgrade sequence: ${r1.message} / ${r2.message} / ${r3.message}`);
    assert(desk.level === 3, 'level not 3');
    assert(JSON.stringify(lot.objectEffects(desk)) !== before, 'upgrade did not change effects');
    assert(cash - s.cash === desk.upgradeSpent, 'upgrade spend not recorded');
  }
}

// ---- create room + suggestion, styles, flows, capacity, identity
{
  const s = rich();
  const loc = s.locations[0];
  while (lot.buyLand(s, loc).ok);
  const r = bp.createRoom(s, loc, 2, 2, 8, 6, 'o');
  assert(r.ok, `create room: ${r.message}`);
  const office = lot.roomsOf(loc.lot).find((rm) => rm.code === 'o');
  assert(office && office.doors >= 1, 'created room has no door');
  for (const st of DEALER_STYLES) {
    const res = bp.applyDealerStyle(s, loc, st.id);
    assert(res.ok, `style ${st.id}: ${res.message}`);
    assert(loc.lot.theme === st.id, 'style not stored');
  }
  const flows = bp.siteFlows(loc);
  assert(flows.length >= 2 && flows.every((f) => f.steps.length >= 3), 'flows missing');
  const cap = bp.siteCapacity(s, loc);
  assert(cap.vehicles >= 1 && cap.customers >= 1, 'capacity numbers missing');
  assert(bp.dealershipIdentity(loc).length >= 5, 'identity missing');
}

// ---- unlocks
{
  const s = createGame({ companyName: 'Fresh', ownerName: 'QA', challenge: 'standard', seed: 3 });
  const locked = OBJECTS.filter((o) => o.unlock && lot.unlockReason(s, o, s.locations[0]));
  assert(locked.length >= 5, 'extra unlock conditions do nothing on a fresh game');
}

// ---- save round trip keeps v6 fields
{
  const s = rich();
  const loc = s.locations[0];
  const o = loc.lot.objects.find((x) => OBJ_UPGRADES[x.defId]);
  bp.upgradeObject(s, loc, o.id);
  bp.applyDealerStyle(s, loc, 'modern');
  const back = save.migrate(JSON.parse(JSON.stringify(s)));
  assert(back.locations[0].lot.theme === 'modern', 'theme lost on save');
  assert(back.locations[0].lot.objects.find((x) => x.id === o.id).level === 2, 'upgrade level lost on save');
}

if (failures.length) {
  console.error('BUILD CHECKS FAILED');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('build checks passed');
