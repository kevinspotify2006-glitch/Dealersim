// Headless simulation test (no browser needed): plays several companies for a
// year with a simple strategy and asserts that the economy stays sane.
// Run with: npm test
const path = require('path');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
const { createGame } = js('sim/newgame.js');
const { Engine } = js('sim/engine.js');
const trading = js('sim/trading.js');
const vehicles = js('sim/vehicles.js');
const staff = js('sim/staff.js');
const progress = js('sim/progress.js');
const finance = js('sim/finance.js');
const market = js('sim/market.js');
const neg = js('sim/negotiation.js');
const save = js('sim/save.js');
const { capacityOf, occupying } = js('sim/state.js');
const lot = js('sim/lot.js');
const { PREP_BY_ID } = js('data/game.js');

global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, key(i) { return Object.keys(this._d)[i] ?? null; }, get length() { return Object.keys(this._d).length; } };
global.window = { localStorage: global.localStorage };

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

function play(challenge, seed, days) {
  const eng = new Engine(createGame({ companyName: `Test ${seed}`, ownerName: 'QA', challenge, seed }));
  const s = () => eng.state;
  for (let d = 0; d < days && !s().bankrupt; d += 1) {
    for (let h = 8; h < 20; h += 1) {
      const st = s();
      const c = st.customers.find((x) => x.status === 'waiting');
      if (c && neg.startNegotiation(st, c.id).ok) {
        const v = st.vehicles.find((x) => x.id === c.vehicleId);
        let out = neg.counterOffer(st, Math.round(v.askingPrice * 0.98));
        if (out.outcome === 'countered') neg.acceptOffer(st);
        neg.closeNegotiation(st);
      }
      const day = st.day;
      eng.stepHour();
      if (s().day !== day) break;
    }
    const t = s();
    for (const v of t.vehicles) {
      if (v.status !== 'yard') continue;
      for (const a of ['minor', 'tyres', 'brakes', 'cosmetic']) if (vehicles.fixableIssues(v, PREP_BY_ID[a]).length && vehicles.canPrep(t, v, a).ok) vehicles.startPrep(t, v, a);
      if (v.status === 'yard' && v.presentation < 55 && vehicles.canPrep(t, v, 'wash').ok) vehicles.startPrep(t, v, 'wash');
      if (v.status === 'yard') trading.listVehicle(t, v.id, true);
    }
    const loc = t.locations[0];
    const offers = t.offers.filter((o) => !o.auction && trading.offerPotential(t, o).profit > 500 && o.offerPrice < t.cash * 0.4);
    for (const o of offers) if (!trading.buyOffer(t, o.id, loc.id).ok) break;
    // Grow the lot physically: more spaces when nearly full, then land, then a workshop.
    if (occupying(t, loc.id) >= capacityOf(loc) - 1 && t.cash > 15000) {
      const r = lot.autoPlace(t, loc, 'parking');
      if (!r.ok && t.cash > 60000) lot.buyLand(t, loc);
    }
    if (t.day % 10 === 0 && t.cash > 40000 && !lot.lotStats(loc.lot).slots.lift.length) lot.buildQuickRoom(t, loc, 'workshop');
    if (t.day % 14 === 0 && t.employees.length < 3 && t.cash > 30000) { const c = t.candidates.find((x) => x.role === 'mechanic'); if (c) staff.hire(t, c.id, loc.id); }
    // Physical invariants: one car per space, listed cars on customer-facing spaces.
    for (const l of t.locations) {
      const used = new Set();
      for (const v of t.vehicles.filter((x) => x.locationId === l.id && x.slotId)) { assert(!used.has(v.slotId), `${challenge}/${seed}: two cars on one space`); used.add(v.slotId); }
      for (const v of t.vehicles.filter((x) => x.status === 'listed' && x.locationId === l.id)) assert(lot.isVisibleSlot(l, v.slotId), `${challenge}/${seed}: listed car not on show (day ${t.day})`);
    }

    // invariants
    assert(Number.isFinite(t.cash), `${challenge}/${seed}: cash is not a number on day ${t.day}`);
    assert(t.reputation >= 0 && t.reputation <= 100, `${challenge}/${seed}: reputation out of range`);
    const ids = new Set();
    for (const v of t.vehicles) { assert(!ids.has(v.id), `${challenge}/${seed}: duplicate vehicle ${v.id}`); ids.add(v.id); assert(v.status !== 'sold', 'sold car in stock'); }
    for (const l of t.locations) assert(t.vehicles.filter((v) => v.locationId === l.id && v.status !== 'transfer').length <= capacityOf(l), `${challenge}/${seed}: over capacity`);
    for (const v of t.vehicles) assert(Number.isFinite(market.trueValue(t, v)) && market.trueValue(t, v) > 0, 'vehicle value invalid');
  }
  // Save round trip.
  const r = save.saveGame(s(), 'test');
  assert(r.ok, 'save failed');
  const back = save.loadGame('test');
  assert(back && back.day === s().day && Math.round(back.cash) === Math.round(s().cash) && back.vehicles.length === s().vehicles.length, 'save/load round trip mismatch');
  const t = s();
  return { challenge, seed, day: t.day, cap: capacityOf(t.locations[0]), land: t.locations[0].lot.landTier, level: t.companyLevel, cash: Math.round(t.cash), value: finance.companyValue(t), sold: t.stats.sold, rep: Math.round(t.reputation), bankrupt: t.bankrupt };
}

const results = [];
const t0 = Date.now();
for (const [ch, seed] of [['standard', 1], ['standard', 2], ['standard', 3], ['shoestring', 4], ['ev', 5], ['luxury', 6]]) results.push(play(ch, seed, 240));
console.table(results);
console.log(`simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const alive = results.filter((r) => !r.bankrupt).length;
assert(alive >= results.length - 1, 'too many test companies went bankrupt — economy too harsh');
assert(results.some((r) => r.level >= 2), 'no test company reached level 2 — progression too slow');
assert(results.filter((r) => r.challenge !== 'shoestring').every((r) => r.sold > 20), 'a test company sold almost nothing — demand broken');
if (failures.length) { console.error('FAIL\n' + [...new Set(failures)].slice(0, 30).join('\n')); process.exit(1); }
console.log('simulation checks passed');
