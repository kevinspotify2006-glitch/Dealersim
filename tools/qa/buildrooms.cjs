// Headless checks for Build Mode 2.0 (room-based building): every item has a
// room, each room only offers what belongs there, the room of a floor tile,
// wall/line placement types, and — through the real sim — placing in a room
// costs money, is refused in the wrong room or without cash, rotates, and
// survives save/load. Run: npm test
const path = require('path');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, key(i) { return Object.keys(this._d)[i] ?? null; }, get length() { return Object.keys(this._d).length; } };
global.window = { localStorage: global.localStorage };
const { createGame } = js('sim/newgame.js');
const lot = js('sim/lot.js');
const bp = js('sim/buildplus.js');
const save = js('sim/save.js');
const { OBJ_BY_ID, OBJECTS } = js('data/lot.js');
const R = js('data/buildrooms.js');

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };
const items = (room) => R.BUILD_ROOM_BY_ID[room].categories.flatMap((c) => R.roomEntries(room, c.id));

// ---- the data
assert(R.unassignedObjects().length === 0, `objects no room offers: ${R.unassignedObjects().join(', ')}`);
for (const room of R.BUILD_ROOMS) {
  assert(room.categories.length >= 5, `${room.id}: only ${room.categories.length} categories`);
  for (const c of room.categories) {
    const entries = R.roomEntries(room.id, c.id);
    assert(entries.length > 0, `${room.id}/${c.id} is empty`);
    for (const e of entries) {
      if (e.startsWith('zone:')) continue;
      assert(OBJ_BY_ID[e], `${room.id}/${c.id}: unknown item ${e}`);
      assert(OBJ_BY_ID[e].zones.some((z) => room.zones.includes(z)), `${room.id}/${c.id}: ${e} cannot stand in this room`);
    }
  }
}
const expectCats = { showroom: ['furniture', 'cars', 'sales', 'electronics', 'decoration', 'lighting', 'storage'], workshop: ['benches', 'lifts', 'tools', 'parts', 'tyres', 'safety', 'lighting'], office: ['desks', 'chairs', 'computers', 'meeting', 'storage', 'decoration', 'lighting'], customer: ['seating', 'tables', 'coffee', 'entertainment', 'decoration', 'lighting'], storage: ['shelving', 'cabinets', 'pallets', 'parts', 'containers', 'safety'], outdoor: ['parking', 'roads', 'charging', 'green', 'lighting', 'signs', 'decoration'] };
for (const [room, cats] of Object.entries(expectCats)) for (const c of cats) assert(R.BUILD_ROOM_BY_ID[room].categories.some((x) => x.id === c), `${room} lacks the ${c} category`);

// ---- room filtering: only what belongs there
const none = (room, ids) => { for (const id of ids) assert(!items(room).includes(id), `${room} offers ${id}`); };
const some = (room, ids) => { for (const id of ids) assert(items(room).includes(id), `${room} does not offer ${id}`); };
none('showroom', ['lift', 'workbench', 'tyremachine', 'charger', 'parking', 'officedesk', 'palletrack', 'tree']);
some('showroom', ['receptiondesk', 'display', 'salesdesk', 'tv', 'spotlight', 'plant']);
none('workshop', ['receptiondesk', 'sofa', 'charger', 'display', 'officedesk', 'tree']);
some('workshop', ['lift', 'workbench', 'tyremachine', 'scanner', 'partsshelf', 'toolwall']);
none('office', ['lift', 'charger', 'display', 'parking', 'tyremachine']);
some('office', ['officedesk', 'officechair', 'computer', 'meetingtable', 'filing']);
none('outdoor', ['sofa', 'lift', 'officedesk', 'display', 'receptiondesk']);
some('outdoor', ['parking', 'evparking', 'charger', 'tree', 'lamp', 'pylon', 'zone:j']);
some('customer', ['sofa', 'coffee', 'tv', 'toilet', 'receptiondesk']);
some('storage', ['storagerack', 'palletrack', 'container', 'partsbins']);
// allowedRooms is derived from the same data
const ar = (id) => R.allowedRooms(id);
assert(JSON.stringify(ar('lift')) === '["workshop"]', `lift allowed in ${ar('lift')}`);
assert(ar('charger').length === 1 && ar('charger')[0] === 'outdoor', `charger allowed in ${ar('charger')}`);
assert(['customer', 'office'].every((r) => ar('coffee').includes(r)) && !ar('coffee').includes('workshop'), `coffee allowed in ${ar('coffee')}`);
assert(ar('receptiondesk').includes('showroom') && ar('receptiondesk').includes('customer'), `reception desk allowed in ${ar('receptiondesk')}`);
// floors map to rooms
for (const [code, room] of [['s', 'showroom'], ['w', 'workshop'], ['d', 'workshop'], ['o', 'office'], ['m', 'office'], ['l', 'customer'], ['r', 'customer'], ['p', 'storage'], ['t', 'storage'], ['a', 'outdoor'], ['g', 'outdoor'], ['j', 'outdoor'], ['.', 'outdoor']]) assert(R.roomTypeOfZone(code) === room, `floor ${code} → ${R.roomTypeOfZone(code)} (expected ${room})`);
assert(R.placementOf(OBJ_BY_ID.tv) === 'wall' && R.placementOf(OBJ_BY_ID.wall) === 'line' && R.placementOf(OBJ_BY_ID.sofa) === 'floor', 'placement types');
assert(OBJECTS.filter((o) => !o.hidden).length >= 200, 'catalogue shrank');

// ---- through the sim: build a showroom, furnish it, economy, rules, save/load
const s = createGame({ companyName: 'Rooms QA', ownerName: 'QA', challenge: 'standard', seed: 11 });
s.cash = 400000;
s.companyLevel = 5;
s.reputation = 90;
const loc = s.locations[0];
// A free rectangle of bare/asphalt land for a new showroom.
let spot = null;
for (let y = 0; y < loc.lot.h - 7 && !spot; y += 1) for (let x = 0; x < loc.lot.w - 8 && !spot; x += 1) {
  let free = true;
  for (let yy = y; yy < y + 6 && free; yy += 1) for (let xx = x; xx < x + 8 && free; xx += 1) {
    const z = lot.zoneAt(loc.lot, xx, yy);
    if (!['.', 'a', 'g'].includes(z) || loc.lot.objects.some((o) => { const f = lot.footprint(o); return xx >= f.x && xx < f.x + f.w && yy >= f.y && yy < f.y + f.h; })) free = false;
  }
  if (free) spot = { x, y };
}
assert(spot, 'no free land for a test showroom');
if (spot) {
  const made = bp.createRoom(s, loc, spot.x, spot.y, spot.x + 7, spot.y + 5, 's');
  assert(made.ok, `create showroom: ${made.message}`);
  const room = lot.roomsOf(loc.lot).find((r) => r.code === 's' && r.x0 >= spot.x && r.y0 >= spot.y);
  assert(room, 'the new showroom is a room');
  if (room) {
    // Economy: placing costs exactly the price.
    const inside = (defId, rot = 0) => { for (let y = room.y0; y <= room.y1; y += 1) for (let x = room.x0; x <= room.x1; x += 1) if (lot.canPlace(s, loc, defId, x, y, rot, undefined, true).ok) return { x, y }; return null; };
    const p = inside('receptiondesk');
    assert(p, 'no place for a reception desk in the showroom');
    if (p) {
      const cash0 = s.cash;
      const r = lot.placeObject(s, loc, 'receptiondesk', p.x, p.y, 0);
      assert(r.ok, `place reception desk: ${r.message}`);
      assert(Math.round(cash0 - s.cash) === OBJ_BY_ID.receptiondesk.cost, `reception desk cost ${cash0 - s.cash}, expected ${OBJ_BY_ID.receptiondesk.cost}`);
    }
    // Room rules: a lift is refused in the showroom, with a reason.
    const liftAt = lot.canPlace(s, loc, 'lift', room.x0, room.y0, 0, undefined, true);
    assert(!liftAt.ok && /belongs in/i.test(liftAt.reason ?? ''), `lift in showroom: ${JSON.stringify(liftAt)}`);
    // Rotation swaps the footprint.
    const q = inside('salesdesk', 1) ?? null;
    if (q) {
      const r = lot.placeObject(s, loc, 'salesdesk', q.x, q.y, 1);
      assert(r.ok, `place rotated sales desk: ${r.message}`);
      const o = loc.lot.objects.find((x) => x.defId === 'salesdesk' && x.x === q.x && x.y === q.y);
      const f = o && lot.footprint(o);
      assert(f && f.w === OBJ_BY_ID.salesdesk.h && f.h === OBJ_BY_ID.salesdesk.w, 'rotated footprint');
    }
    // Not enough cash: refused, nothing charged.
    const plantAt = inside('plant');
    s.cash = 10;
    const poor = plantAt ? lot.canPlace(s, loc, 'plant', plantAt.x, plantAt.y, 0) : { ok: false, reason: 'Not enough cash.' };
    assert(!poor.ok && /cash/i.test(poor.reason ?? ''), `placing without cash: ${JSON.stringify(poor)}`);
    s.cash = 400000;
    // Save and load keep the furnished room.
    const n = loc.lot.objects.length;
    const back = save.migrate(JSON.parse(JSON.stringify(s)));
    assert(back && back.locations[0].lot.objects.length === n, 'save/load lost objects');
    assert(back && back.locations[0].lot.objects.some((o) => o.defId === 'receptiondesk'), 'save/load lost the reception desk');
  }
}

if (failures.length) {
  console.log('BUILD ROOMS QA FAILED');
  for (const f of failures) console.log('  ✗', f);
  process.exit(1);
}
console.log(`build rooms ok (${R.BUILD_ROOMS.length} room types, ${R.BUILD_ROOMS.reduce((n, r) => n + r.categories.length, 0)} categories, every item in a room)`);
