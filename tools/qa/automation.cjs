// Headless checks for v7.3 management & automation: headhunter levels and
// searches, HR capacity / assignment / training / promotion / recruitment,
// procurement thresholds, inventory listing / repricing / clearance, sales
// policy and approvals, logistics fleet, parts reordering, player rules with
// priorities and cooldowns, exceptions, costs, and save round trips.
// Run: npm test (after npm run build)
const path = require('path');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, key(i) { return Object.keys(this._d)[i] ?? null; }, get length() { return Object.keys(this._d).length; } };
global.window = { localStorage: global.localStorage };

const { createGame } = js('sim/newgame.js');
const { Engine } = js('sim/engine.js');
const staff = js('sim/staff.js');
const save = js('sim/save.js');
const core = js('sim/systems/autocore.js');
const hh = js('sim/systems/headhunter.js');
const hr = js('sim/systems/hr.js');
const auto = js('sim/systems/automation.js');
const logi = js('sim/systems/logistics.js');
const trading = js('sim/trading.js');
const vehicles = js('sim/vehicles.js');
const { HR_CAPACITY, HEADHUNTER_LEVELS, LOGI_ASSETS } = js('data/automation.js');
const { reseedGameRng } = js('sim/rng.js');

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };
let n = 0;
const check = (cond, msg) => { n += 1; assert(cond, msg); };

let deskN = 0;
function desks(s, loc, defId, count) {
  for (let i = 0; i < count; i += 1) loc.lot.objects.push({ id: `qa-${defId}-${deskN += 1}`, defId, x: 0, y: 0, rot: 0 });
  loc.lot.version = (loc.lot.version ?? 0) + 1;
}
function person(s, role, loc, skill = 60, extra = {}) {
  const e = staff.makeEmployee(s, role, loc.id, [skill, skill]);
  e.skill = skill;
  if (e.skills) e.skills[js('data/game.js').ROLE_BY_ID[role].skill] = skill;
  Object.assign(e, { hiredDay: 1, trainingDaysLeft: 0, absentDay: undefined, morale: 70 }, extra);
  s.employees.push(e);
  return e;
}
function rich(seed = 7) {
  reseedGameRng(seed);
  const s = createGame({ companyName: 'Auto QA', ownerName: 'QA', challenge: 'standard', seed });
  s.cash = 5_000_000;
  s.companyLevel = 5;
  s.reputation = 80;
  s.day = 200;
  return s;
}
function car(s, loc, extra = {}) {
  const v = vehicles.createOffer(s, 'wholesale', loc.id);
  v.purchasePrice = v.offerPrice || 8000;
  v.askingPrice = js('sim/market.js').suggestedPrice(s, v);
  v.floorPrice = Math.round(v.askingPrice * 0.92);
  return Object.assign(v, { id: `qv${n += 1}`, locationId: loc.id, status: 'listed', prep: [], daysInStock: 1, boughtDay: s.day - 1, arrivalDay: s.day - 1 }, extra);
}

// ------------------------------------------------------------ headhunter --
{
  const s = rich();
  const loc = s.locations[0];
  desks(s, loc, 'cubicle', 4);
  desks(s, loc, 'salesdesk', 4);
  check(!hh.startSearch(s, 'sales', loc.id, hh.defaultCriteria('sales')).ok, 'headhunter: a search without an agency must fail');
  for (let i = 1; i < HEADHUNTER_LEVELS.length; i += 1) {
    const a = HEADHUNTER_LEVELS[i - 1], b = HEADHUNTER_LEVELS[i];
    check(b.cost > a.cost && b.retainer > a.retainer && b.fit > a.fit && b.searches >= a.searches && b.candidates >= a.candidates, `headhunter: level ${b.level} must be better and dearer than ${a.level}`);
  }
  const cash0 = s.cash;
  check(hh.upgradeHeadhunter(s).ok && s.headhunter.level === 1 && s.cash === cash0 - HEADHUNTER_LEVELS[0].cost, 'headhunter: signing level 1 costs its price');
  const crit = { ...hh.defaultCriteria('sales'), minSkill: 60, maxSalary: 4000 };
  const r = hh.startSearch(s, 'sales', loc.id, crit);
  check(r.ok && r.search.status === 'searching', `headhunter: search starts (${r.message})`);
  check(!hh.startSearch(s, 'mechanic', loc.id, hh.defaultCriteria('mechanic')).ok, 'headhunter: level 1 runs one search at a time');
  s.day = r.search.readyDay;
  hh.headhunterDaily(s);
  const sr = s.headhunter.searches[0];
  check(sr.status === 'ready' && sr.candidates.length === HEADHUNTER_LEVELS[0].candidates, `headhunter: ${HEADHUNTER_LEVELS[0].candidates} candidates when ready (got ${sr.candidates.length})`);
  const ms = sr.candidates.map((c) => hh.misses(c, sr.criteria).length);
  check(ms.every((m, i) => i === 0 || ms[i - 1] <= m), 'headhunter: candidates sorted by fit');
  check(sr.candidates.every((c) => c.role === 'sales' && typeof c.experience === 'number'), 'headhunter: candidates have the role and experience');
  const before = s.employees.length;
  const cand = sr.candidates[0];
  const cashH = s.cash;
  const hres = hh.hireCandidate(s, sr.id, cand.id);
  check(hres.ok && s.employees.length === before + 1 && s.cash < cashH && s.headhunter.placed === 1, `headhunter: hire pays the success fee (${hres.message})`);
  // Upgrade to the top: executive searches bring seniors.
  while (s.headhunter.level < 5) check(hh.upgradeHeadhunter(s).ok, `headhunter: upgrade to ${s.headhunter.level + 1}`);
  check(!hh.upgradeHeadhunter(s).ok, 'headhunter: nothing above level 5');
  const ex = hh.startSearch(s, 'manager', loc.id, hh.defaultCriteria('manager'));
  s.day = ex.search.readyDay;
  hh.headhunterDaily(s);
  check(ex.search.candidates.length === 6 && ex.search.candidates.every((c) => c.level >= 3), 'headhunter: executive search brings level 3+ managers');
  check(ex.search.candidates.some((c) => c.source), 'headhunter: level 4+ approaches people at rivals');
  s.day = ex.search.expires + 1;
  hh.headhunterDaily(s);
  check(ex.search.status === 'closed', 'headhunter: old results lapse');
  // Low company level can't sign higher agencies.
  const t = rich(8); t.companyLevel = 1; hh.upgradeHeadhunter(t);
  check(!hh.upgradeHeadhunter(t).ok, 'headhunter: level 2 needs company level 2');
}

// -------------------------------------------------------------------- HR --
{
  check(HR_CAPACITY.length === 10 && HR_CAPACITY[0] === 10 && HR_CAPACITY[9] === 1000, 'hr: capacity table 10..1000');
  const s = rich(9);
  const loc = s.locations[0];
  const grades = [];
  for (let lv = 1; lv <= 5; lv += 1) for (const mg of [40, 80]) {
    const e = person(s, 'hr', loc, 60, { level: lv });
    e.skills.management = mg;
    grades.push([core.hrGrade(e), core.hrCapacity(e)]);
  }
  check(grades[0][0] === 1 && grades[0][1] === 10 && grades[9][0] === 10 && grades[9][1] === 1000, `hr: grade mapping (got ${JSON.stringify(grades)})`);
  for (let i = 1; i < grades.length; i += 1) check(grades[i][1] >= grades[i - 1][1], 'hr: capacity grows with grade');
  s.employees = s.employees.filter((e) => e.role !== 'hr');
  const m = person(s, 'hr', loc, 60, { level: 1 });
  m.skills.management = 40;
  const team = [];
  for (let i = 0; i < 12; i += 1) team.push(person(s, 'sales', loc, 40));
  let ok = 0;
  for (const e of team) if (hr.assignHr(s, e.id, m.id).ok) ok += 1;
  check(ok === 10 && hr.managedBy(s, m.id).length === 10, `hr: a grade-1 HR manager takes 10 people (took ${ok})`);
  check(!hr.assignHr(s, team[11].id, m.id).ok, 'hr: capacity limit refuses the 11th');
  const m2 = person(s, 'hr', loc, 70, { level: 3 });
  m2.skills.management = 80;
  check(hr.autoAssignHr(s) >= 2 && s.employees.every((e) => e.role === 'hr' || e.hrBy), 'hr: auto-assign covers everyone with room');
  // Training within budget.
  s.automation.policies.modes.hr = 'auto';
  s.automation.policies.hr.trainingBudget = 6000;
  s.automation.policies.hr.trainBelow = 90;
  hr.hrDaily(s);
  const inTraining = s.employees.filter((e) => e.trainingDaysLeft > 0).length;
  check(inTraining > 0, 'hr: auto manage sends people on courses');
  check(s.automation.spent.training > 0 && s.automation.spent.training <= 6000, `hr: training stays within budget (spent ${s.automation.spent.training})`);
  const spent = s.automation.spent.training;
  hr.hrDaily(s);
  check(s.automation.spent.training <= 6000, 'hr: budget respected on the next day');
  void spent;
  // Promotions against the thresholds.
  const star = person(s, 'sales', loc, 85, { level: 1, xp: 5000, performance: 90, hiredDay: 1, hrBy: m2.id });
  s.automation.policies.hr.promoteSkill = 60; s.automation.policies.hr.promotePerf = 60; s.automation.policies.hr.promoteMonths = 1;
  s.automation.policies.hr.trainBelow = 0;
  hr.hrDaily(s);
  check(star.level >= 2, 'hr: promotes someone who meets the thresholds');
  // Assisted: suggestions, no actions.
  const a = rich(10); const al = a.locations[0];
  const am = person(a, 'hr', al, 70, { level: 3 });
  const low = person(a, 'sales', al, 30, { hrBy: am.id });
  a.automation.policies.modes.hr = 'assisted';
  a.automation.policies.hr.trainBelow = 90;
  hr.hrDaily(a);
  check(low.trainingDaysLeft === 0 && a.automation.exceptions.some((x) => x.dept === 'hr' && x.key.startsWith('hr:train')), 'hr: assisted suggests training instead of doing it');
  // Leavers are replaced; targets are recruited through the headhunter.
  const f = rich(11); const fl = f.locations[0];
  desks(f, fl, 'salesdesk', 6); desks(f, fl, 'cubicle', 2);
  const fm = person(f, 'hr', fl, 70, { level: 3 });
  const leaver = person(f, 'sales', fl, 50);
  staff.fire(f, leaver.id);
  check(f.automation.left.length === 1 && f.automation.left[0].role === 'sales', 'hr: someone leaving is noted for replacement');
  check(hr.vacancies(f).some((v) => v.reason === 'left' && v.role === 'sales'), 'hr: the leaver shows as a vacancy');
  f.automation.policies.modes.hr = 'auto';
  f.automation.policies.hr.targets = { sales: 4 };
  hh.upgradeHeadhunter(f); hh.upgradeHeadhunter(f); hh.upgradeHeadhunter(f);
  hr.hrDaily(f);
  const autos = f.headhunter.searches.filter((x) => x.auto);
  check(autos.length >= 1, `hr: recruitment starts automatic headhunter searches (${autos.length})`);
  for (const x of autos) f.day = Math.max(f.day, x.readyDay);
  const staffBefore = f.employees.length;
  hh.headhunterDaily(f);
  hr.hrDaily(f);
  check(f.employees.length > staffBefore, 'hr: ready automatic searches are hired');
  check(hr.hrKpi(f).managers === 1 && typeof hr.hrKpi(f).avgMorale === 'number', 'hr: KPIs');
  // AUTO MANAGE toggle turns HR on locally.
  const g = rich(12); const gm = person(g, 'hr', g.locations[0], 60);
  hr.setHrAuto(g, gm.id, true);
  check(core.modeFor(g, g.locations[0].id, 'hr') === 'auto', 'hr: AUTO MANAGE switches the location to automated');
  hr.setHrAuto(g, gm.id, false);
  check(gm.hrAuto === false, 'hr: AUTO MANAGE off');
}

// ---------------------------------------------------- managers & errors --
{
  check(core.errorRate(0) === 0.25 && core.errorRate(100) < 0.05 && core.errorRate(100) > 0, 'automation: error rate falls with quality but never reaches zero');
  const s = rich(13); const loc = s.locations[0];
  check(!core.managerFor(s, loc.id, 'inventory'), 'automation: no inventory manager at the start');
  const good = person(s, 'inventory', loc, 90, { level: 4 });
  const mg = core.managerFor(s, loc.id, 'inventory');
  check(mg && mg.e.id === good.id && mg.actions > 5, 'automation: the inventory manager runs inventory');
}

// ------------------------------------------------------- procurement --
{
  const s = rich(14); const loc = s.locations[0];
  const b = person(s, 'buyer', loc, 70);
  s.automation.policies.modes.procurement = 'auto';
  s.automation.policies.procurement.stockMin = 60;
  s.automation.policies.procurement.stockTarget = 80;
  s.automation.policies.procurement.autoBuyUnder = 12000;
  auto.automationDaily(s);
  const m = s.procurement.mandates.find((x) => x.buyerId === b.id);
  check(m && m.active && m.autoApprove && m.autoLimit === 12000 && m.maxPrice === s.automation.policies.procurement.maxPrice, 'procurement: low stock activates the buyer on the policy brief');
  s.automation.policies.procurement.stockMin = 0;
  s.automation.policies.procurement.stockTarget = 0;
  auto.automationDaily(s);
  check(!m.active, 'procurement: at target the buyer is paused');
  s.automation.policies.modes.procurement = 'assisted';
  s.automation.policies.procurement.stockMin = 60; s.automation.policies.procurement.stockTarget = 80;
  auto.automationDaily(s);
  check(m.active && !m.autoApprove, 'procurement: assisted buyers search but you approve');
  // No buyer: exception.
  const t = rich(15);
  t.automation.policies.modes.procurement = 'auto';
  t.automation.policies.procurement.stockMin = 60;
  auto.automationDaily(t);
  check(t.automation.exceptions.some((x) => x.key.startsWith('pr:nobuyer') && (x.priority === 'critical' || x.priority === 'high')), 'procurement: no buyer raises an exception');
  // Monthly budget exhausted: buyers stop.
  s.automation.spent.procurement = s.automation.policies.procurement.monthlyBudget;
  s.automation.policies.modes.procurement = 'auto';
  auto.automationDaily(s);
  check(!m.active, 'procurement: spent budget pauses buying');
}

// ----------------------------------------------------------- inventory --
{
  const s = rich(16); const loc = s.locations[0];
  person(s, 'inventory', loc, 80, { level: 3 });
  s.automation.policies.modes.inventory = 'auto';
  s.automation.policies.inventory.pricing = 'fast';
  const yard = car(s, loc, { status: 'yard', askingPrice: 0, floorPrice: 0, slotId: undefined });
  s.vehicles.push(yard);
  const aged = car(s, loc, { daysInStock: 80 });
  aged.askingPrice = Math.round(js('sim/market.js').totalCost(aged) * 1.6);
  const manual = car(s, loc, { daysInStock: 80, manualPrice: true });
  manual.askingPrice = Math.round(js('sim/market.js').totalCost(manual) * 1.6);
  const ancient = car(s, loc, { daysInStock: 400 });
  s.vehicles.push(aged, manual, ancient);
  const a0 = aged.askingPrice, m0 = manual.askingPrice;
  auto.automationDaily(s);
  check(loc.pricing === 'fast', 'inventory: the pricing policy is applied to the location');
  check(yard.status === 'listed' || s.automation.exceptions.some((x) => x.key.startsWith('inv:space')), `inventory: ready yard cars are listed (status ${yard.status})`);
  check(aged.askingPrice < a0, 'inventory: ageing stock is repriced');
  check(manual.askingPrice === m0, 'inventory: a hand-priced car keeps its price');
  check(!s.vehicles.includes(ancient), 'inventory: very old stock is cleared to the trade');
  check(auto.releasePrice(s, manual.id).ok && !manual.manualPrice, 'inventory: a price can be handed back to automation');
  // Without a manager, automated inventory raises an exception.
  const t = rich(17); t.automation.policies.modes.inventory = 'auto';
  t.employees = t.employees.filter((e) => e.role !== 'manager' && e.role !== 'inventory');
  auto.automationDaily(t);
  check(t.automation.exceptions.some((x) => x.key.startsWith('mgr:inventory')), 'inventory: nobody to run it → exception');
}

// ---------------------------------------------------------------- sales --
{
  const s = rich(18); const loc = s.locations[0];
  const seller = s.employees.find((e) => e.role === 'sales');
  const v = car(s, loc);
  const cost = js('sim/market.js').totalCost(v);
  v.askingPrice = cost + 5000;
  s.vehicles.push(v);
  s.automation.policies.sales.minMargin = 1000;
  s.automation.policies.sales.maxDiscount = 0.05;
  const floor = core.salesFloor(s, v, cost);
  check(floor === Math.max(cost + 1000, Math.round(v.askingPrice * 0.95)), 'sales: policy floor = max(cost + margin, asking − discount)');
  const c = { id: 'qc1', name: 'Q. Buyer', archetype: 'family', locationId: loc.id, status: 'waiting', vehicleId: v.id };
  core.requestApproval(s, c, v, seller.id, v.askingPrice, 5000, 'test');
  check(s.automation.approvals.length === 1 && v.reservedBy === 'qc1' && c.status === 'left', 'sales: an approval reserves the car');
  const soldBefore = s.stats.sold;
  const ap = auto.approveSale(s, s.automation.approvals[0].id);
  check(ap.ok && s.stats.sold === soldBefore + 1 && !s.vehicles.includes(v), `sales: approving completes the sale (${ap.message})`);
  const v2 = car(s, loc); s.vehicles.push(v2);
  core.requestApproval(s, { ...c, id: 'qc2', status: 'waiting', vehicleId: v2.id }, v2, seller.id, v2.askingPrice, 100, 'test');
  const lost = s.lostLeads.length;
  check(auto.declineSale(s, s.automation.approvals[0].id).ok && s.lostLeads.length === lost + 1 && !v2.reservedBy, 'sales: declining releases the car');
  core.requestApproval(s, { ...c, id: 'qc3', status: 'waiting', vehicleId: v2.id }, v2, seller.id, v2.askingPrice, 100, 'test');
  s.day += 3;
  auto.automationDaily(s);
  check(s.automation.approvals.length === 0 && !v2.reservedBy, 'sales: unanswered approvals expire');
  // Played: automated sales with a low approval limit create approvals, not silent sales.
  const p = rich(19);
  p.day = 1;
  p.automation.policies.modes.sales = 'auto';
  p.automation.policies.sales.approveAbove = 1000;
  const eng = new Engine(p);
  for (let d = 0; d < 12; d += 1) eng.skipToNextDay();
  const tot = core.reportTotals(eng.state, 30);
  check((tot.sales?.approvals ?? 0) + (tot.sales?.refused ?? 0) + (tot.sales?.sold ?? 0) > 0, `sales: automated advisors handle customers (${JSON.stringify(tot.sales ?? {})})`);
  const staffSaleNotices = eng.state.notices.filter((x) => x.kind === 'sale' && / sold the /.test(x.text) && x.tag !== 'auto').length;
  check(staffSaleNotices === 0, `sales: individual staff-sale notices suppressed in auto mode (${staffSaleNotices})`);
}

// ------------------------------------------------------------ logistics --
{
  const s = rich(20); const loc = s.locations[0];
  check(LOGI_ASSETS.every((a, i) => i === 0 || a.capacity > LOGI_ASSETS[i - 1].capacity), 'logistics: bigger vehicles carry more');
  const low = rich(21); low.companyLevel = 1;
  check(!logi.buyAsset(low, 'carrier', low.locations[0].id).ok, 'logistics: a car carrier needs company level 4');
  const cash0 = s.cash;
  check(logi.buyAsset(s, 'van', loc.id).ok && logi.buyAsset(s, 'truck', loc.id).ok && s.cash === cash0 - 16000 - 42000, 'logistics: buying vans and trucks');
  check(logi.buyAsset(s, 'hub', loc.id).ok && !logi.buyAsset(s, 'hub', loc.id).ok, 'logistics: one logistics centre');
  check(logi.fleetCapacity(s) === 1 + 3 + 12, 'logistics: fleet capacity');
  s.automation.policies.modes.logistics = 'auto';
  const tv = car(s, loc, { status: 'transit', arrivalDay: s.day + 6 });
  s.vehicles.push(tv);
  for (const a of s.logistics.fleet) a.condition = 100;
  const origRel = js('data/automation.js').LOGI_BY_TYPE;
  for (const k of Object.keys(origRel)) origRel[k].reliability = 1;   // no breakdowns in this check
  logi.logisticsDaily(s);
  check(tv.pickedUp && tv.arrivalDay <= s.day + 4, `logistics: own fleet collects bought cars sooner (arrives day ${tv.arrivalDay - s.day})`);
  const free = core.fleetFree(s);
  const cost = core.fleetSlot(s);
  check(cost === 35 && core.fleetFree(s) === free - 1, 'logistics: a fleet move uses capacity at the cheapest rate');
  const monthCost = logi.fleetMonthlyCost(s);
  const c1 = s.cash;
  logi.logisticsMonthly(s);
  check(s.cash === c1 - monthCost && s.logistics.movedMonth === 0, 'logistics: monthly running costs');
  const id = s.logistics.fleet[0].id; s.logistics.fleet[0].condition = 30;
  check(logi.serviceAsset(s, id).ok && s.logistics.fleet[0].condition === 100, 'logistics: servicing restores condition');
  check(logi.sellAsset(s, id).ok && s.logistics.fleet.length === 2, 'logistics: selling a vehicle');
}

// ---------------------------------------------------------------- parts --
{
  const s = rich(22); const loc = s.locations[0];
  const lotStats = js('sim/lot.js').lotStats;
  if (!lotStats(loc.lot).slots.lift.length) { desks(s, loc, 'lift', 1); }
  person(s, 'inventory', loc, 70, { level: 2 });
  s.automation.policies.modes.parts = 'auto';
  loc.parts = {}; loc.partsOrders = [];
  auto.automationDaily(s);
  check((loc.partsOrders ?? []).length > 0, `parts: empty shelves are reordered (${(loc.partsOrders ?? []).length} orders)`);
  const t = rich(23); const tl = t.locations[0];
  if (!lotStats(tl.lot).slots.lift.length) desks(t, tl, 'lift', 1);
  person(t, 'inventory', tl, 70);
  t.automation.policies.modes.parts = 'assisted';
  tl.parts = {}; tl.partsOrders = [];
  auto.automationDaily(t);
  check(!tl.partsOrders.length && t.automation.exceptions.some((x) => x.key.startsWith('parts:low')), 'parts: assisted flags low stock');
}

// ------------------------------------------------------ rules & exceptions --
{
  const s = rich(24);
  check(!auto.addRule(s, { name: 'x', enabled: true, metric: 'stock', op: '<', value: NaN, action: 'notify', priority: 'low', cooldown: 1 }).ok, 'rules: invalid number refused');
  check(auto.addRule(s, { name: 'Low stock alarm', enabled: true, metric: 'stock', op: '<', value: 999, action: 'notify', priority: 'critical', cooldown: 3 }).ok, 'rules: add a rule');
  check(auto.addRule(s, { name: 'Info', enabled: true, metric: 'cash', op: '>', value: 0, action: 'notify', priority: 'low', cooldown: 1 }).ok, 'rules: add a second rule');
  auto.automationDaily(s);
  const ex = core.sortedExceptions(s);
  check(ex.length >= 2 && ex[0].priority === 'critical', 'rules: exceptions sorted by priority');
  check(s.notices.some((x) => x.tag === 'auto' && x.text.includes('Low stock alarm')), 'rules: critical exceptions reach the notifications');
  const r = s.automation.rules[0];
  const fired = r.fired;
  s.day += 1;
  auto.automationDaily(s);
  check(r.fired === fired, 'rules: cooldown respected');
  check(s.automation.exceptions.some((x) => x.key.startsWith(`rule:${r.id}:`)), 'rules: exception stays during cooldown');
  auto.toggleRule(s, r.id);
  s.day += 5;
  auto.automationDaily(s);
  check(!s.automation.exceptions.some((x) => x.key.startsWith(`rule:${r.id}:`)), 'rules: switched-off rule clears its exception');
  check(auto.removeRule(s, r.id).ok && s.automation.rules.length === 1, 'rules: remove');
  // Built-in rules sorted by priority in the engine and all have text.
  check(auto.RULES.every((x) => x.name && x.when && x.then), 'rules: built-in rules describe themselves');
  check(auto.describeRule({ metric: 'aged', arg: '60', op: '>', value: 3, action: 'reprice', param: '5', priority: 'normal', cooldown: 7 }).startsWith('IF Cars on sale > 60 days > 3 THEN cut prices 5%'), 'rules: description');
  // Reprice rule acts on aged cars.
  const loc = s.locations[0];
  const old = car(s, loc, { daysInStock: 100 });
  old.askingPrice = js('sim/market.js').totalCost(old) + 6000;
  s.vehicles.push(old);
  const p0 = old.askingPrice;
  auto.addRule(s, { name: 'Cut old', enabled: true, metric: 'aged', arg: '60', op: '>', value: 0, action: 'reprice', param: '5', priority: 'high', cooldown: 7 });
  auto.automationDaily(s);
  check(old.askingPrice < p0, 'rules: reprice action cuts aged cars');
  // Dismiss.
  const one = s.automation.exceptions[0];
  check(core.dismissException(s, one.id).ok, 'exceptions: dismiss');
}

// -------------------------------------------------------- modes & costs --
{
  const s = rich(25);
  check(auto.setAllModes(s, 'auto').ok && Object.values(s.automation.policies.modes).every((m) => m === 'auto'), 'modes: everything automated at once');
  check(auto.setMode(s, 'sales', 'manual', s.locations[0].id).ok && core.modeFor(s, s.locations[0].id, 'sales') === 'manual', 'modes: local override');
  check(core.applyHqPolicy(s).ok && core.modeFor(s, s.locations[0].id, 'sales') === 'auto', 'modes: HQ policy spreads to every location');
  const c = auto.automationMonthlyCost(s);
  const cash = s.cash;
  auto.automationMonthly(s);
  check(c.overhead > 0 && s.cash === cash - c.overhead - c.retainer, 'costs: automation overhead is paid monthly');
  check(s.automation.spent.training === 0, 'costs: budgets reset monthly');
}

// ------------------------------------------------- play & save round trip --
{
  const s = rich(26);
  s.day = 1;
  const loc = s.locations[0];
  desks(s, loc, 'cubicle', 3);
  person(s, 'hr', loc, 70, { level: 3 });
  person(s, 'inventory', loc, 70, { level: 2 });
  person(s, 'buyer', loc, 65);
  auto.setAllModes(s, 'auto');
  hh.upgradeHeadhunter(s);
  logi.buyAsset(s, 'van', loc.id);
  auto.addRule(s, { name: 'Busy', enabled: true, metric: 'waiting', op: '>', value: 2, action: 'notify', priority: 'normal', cooldown: 1 });
  const eng = new Engine(s);
  let crash;
  try { for (let d = 0; d < 45; d += 1) eng.skipToNextDay(); } catch (e) { crash = e; }
  check(!crash, `play: 45 fully automated days without errors ${crash ? crash.stack : ''}`);
  check(Number.isFinite(eng.state.cash), 'play: cash stays a number');
  check(eng.state.automation.reports.length > 10, 'play: daily management reports are kept');
  check(eng.state.notices.some((x) => x.text.startsWith('📋 Weekly management report')), 'play: weekly management report');
  const again = save.importSave(save.exportSave(eng.state));
  check(again && again.automation.rules.length === 1 && again.headhunter.level === 1 && again.logistics.fleet.length === 1, 'save: automation survives a round trip');
  // A save from before v7.3 (no automation fields) loads with defaults.
  const old = JSON.parse(save.exportSave(eng.state));
  const root = old.state ?? old;
  delete root.automation; delete root.headhunter; delete root.logistics;
  for (const e of root.employees ?? []) { delete e.hrBy; delete e.hrAuto; }
  const mig = save.importSave(JSON.stringify(old));
  check(mig && mig.automation && mig.automation.policies.modes.sales === 'manual' && mig.headhunter.level === 0 && Array.isArray(mig.logistics.fleet), 'save: pre-7.3 saves get manual automation defaults');
}

if (failures.length) {
  console.log(`AUTOMATION CHECKS FAILED (${failures.length}/${n}):\n` + failures.join('\n'));
  process.exit(1);
}
console.log(`automation checks passed (${n} checks: headhunter, HR, procurement, inventory, sales, logistics, parts, rules, costs, saves)`);
