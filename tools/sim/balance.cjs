// Headless balance run: a simple bot plays N days. Usage: node tools/sim/balance.cjs [days] [seed]
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
const world = js('sim/world.js');
const state0 = createGame({ companyName: 'Bot Motors', ownerName: 'Bot', challenge: process.argv[4] || 'standard', seed: Number(process.argv[3] || 42) });
const eng = new Engine(state0);
const s = () => eng.state;
const days = Number(process.argv[2] || 360);
let negotiated = 0, negWon = 0;
for (let d = 0; d < days; d++) {
  const st = s();
  // Serve some customers personally: counter at asking*0.97 then accept.
  for (let h = 8; h < 20; h++) {
    for (const c of st.customers.filter((c) => c.status === 'waiting').slice(0, 2)) {
      const r = neg.startNegotiation(st, c.id);
      if (!r.ok) continue;
      negotiated++;
      const v = st.vehicles.find((x) => x.id === c.vehicleId);
      let out = neg.counterOffer(st, Math.round(v.askingPrice * 0.98));
      if (out.outcome === 'countered') out = neg.counterOffer(st, Math.round((st.negotiation.lastCustomerOffer + v.askingPrice * 0.98) / 2));
      if (out.outcome === 'countered') { neg.acceptOffer(st); out = { outcome: 'accepted' }; }
      if (out.outcome === 'accepted') negWon++;
      neg.closeNegotiation(st);
    }
    eng.stepHour();
    if (st.day !== s().day) break;
  }
  const t = s();
  // prep + list
  for (const v of t.vehicles) {
    if (v.status === 'yard') {
      if (v.inspectionLevel < 2 && t.cash > 5000) vehicles.inspectOwned(t, v);
      const PREP = require(path.join(__dirname, '../../build/js/data/game.js')).PREP_BY_ID;
      for (const a of ['minor', 'major', 'tyres', 'brakes', 'cosmetic', 'interior']) {
        if (vehicles.fixableIssues(v, PREP[a]).length && vehicles.canPrep(t, v, a).ok && t.cash > 5000) vehicles.startPrep(t, v, a);
      }
      if (v.status === 'yard' && v.presentation < 70 && vehicles.canPrep(t, v, 'deepclean').ok) vehicles.startPrep(t, v, 'deepclean');
      if (v.status === 'yard') { v.askingPrice = market.suggestedPrice(t, v); v.floorPrice = market.roundPrice(v.askingPrice * 0.9); trading.listVehicle(t, v.id, true); }
    }
    if (v.status === 'listed' && v.daysInStock > 25 && v.daysInStock % 10 === 0) { v.askingPrice = market.roundPrice(v.askingPrice * 0.96); v.floorPrice = market.roundPrice(v.askingPrice * 0.9); }
  }
  // buy good offers
  for (const loc of t.locations) {
    const offers = t.offers.filter((o) => !o.auction).map((o) => ({ o, p: trading.offerPotential(t, o) })).filter((x) => x.p.profit > 600 && x.o.offerPrice < t.cash * 0.45).sort((a, b) => b.p.profit / b.o.offerPrice - a.p.profit / a.o.offerPrice);
    for (const { o } of offers) { if (trading.freeSpaces ? 0 : 0); const r = trading.buyOffer(t, o.id, loc.id); if (!r.ok) break; }
  }
  // upgrades & hires
  const loc = t.locations[0];
  // Physical growth: spaces when nearly full (land when out of room), then rooms, then services.
  const lot = js('sim/lot.js');
  const S = js('sim/state.js');
  if (S.occupying(t, loc.id) >= S.capacityOf(loc) - 1 && t.cash > 15000 && !lot.autoPlace(t, loc, 'parking').ok && t.cash > 60000) lot.buyLand(t, loc);
  const ls = lot.lotStats(loc.lot);
  for (const [room, need] of [['workshop', ls.slots.lift.length === 0], ['detailing', ls.slots.bay.length === 0 && t.day > 40], ['lounge', ls.levels.lounge < 2 && t.day > 60], ['showroom', ls.slots.display.length === 0 && t.day > 90], ['office', ls.stations.office.length === 0 && t.day > 50]]) {
    if (need && t.cash > 40000) lot.buildQuickRoom(t, loc, room);
  }
  for (const up of ['marketing', 'finance']) {
    const c = progress.upgradeCheck(t, loc, up);
    if (c.ok && c.cost < t.cash * 0.25) progress.buyUpgrade(t, loc.id, up);
  }
  if (d % 7 === 0) {
    const want = t.vehicles.length > 8 ? ['sales', 'mechanic', 'detailer', 'manager', 'sales', 'buyer'] : ['mechanic'];
    for (const role of want) {
      if (t.employees.filter((e) => e.role === role).length >= Math.ceil(t.vehicles.length / 10)) continue;
      const c = t.candidates.find((x) => x.role === role);
      if (c && t.cash > c.salary * 4) staff.hire(t, c.id, loc.id);
    }
    if (t.day > 30 && t.cash > 20000 && !t.campaigns.some((c) => c.endDay >= t.day)) world.launchCampaign(t, 'social', loc.id);
  }
  if (t.cash < 0 && t.loans.length === 0) finance.takeLoan(t, 'stock');
  if (t.day % 30 === 1) {
    console.log(`day ${t.day} lvl ${t.companyLevel} cash ${Math.round(t.cash)} value ${finance.companyValue(t)} stock ${t.vehicles.length}/${t.locations.map(l=>require(path.join(__dirname,'../../build/js/sim/state.js')).capacityOf(l)).join('+')} sold ${t.stats.sold} rep ${t.reputation.toFixed(1)} staff ${t.employees.length} monthNet ${Math.round(t.history.slice(-30).reduce((a,b)=>a+b.profit,0))} leads30 ${t.history.slice(-30).reduce((a,b)=>a+b.leads,0)} lost ${t.lostLeads.length}`);
  }
}
const t = s();
console.log('negotiated', negotiated, 'won', negWon, 'bankrupt', t.bankrupt, 'events', t.eventLog.length, 'reviews', t.reviews.length, 'avg stars', (t.reviews.reduce((a,r)=>a+r.stars,0)/Math.max(1,t.reviews.length)).toFixed(2));
console.log('lost reasons', Object.entries(t.lostLeads.reduce((m,l)=>(m[l.reason]=(m[l.reason]||0)+1,m),{})));
console.log('achievements', Object.keys(t.achievements).join(','));
const sold = t.soldArchive;
const avg = (f) => Math.round(sold.reduce((a, v) => a + f(v), 0) / Math.max(1, sold.length));
console.log('sold n', sold.length, 'avg price', avg(v=>v.soldPrice), 'avg cost', avg(v=>market.totalCost(v)), 'avg purchase', avg(v=>v.purchasePrice), 'avg repairs', avg(v=>v.costs.repairs), 'detail', avg(v=>v.costs.detailing), 'insp', avg(v=>v.costs.inspection), 'transport', avg(v=>v.costs.transport));
const cats = finance.categoryTotals(t, 0);
console.log(cats);
