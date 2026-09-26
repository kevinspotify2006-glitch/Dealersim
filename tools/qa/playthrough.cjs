// Full gameplay QA through the real UI, dealership-first: tap cars on the map,
// inspect, prepare, list, buy, build (spaces, rooms), hire into a workstation,
// talk to / test drive / negotiate with a customer standing in the dealership,
// close for a day, play 45 days, loans, a second dealership, save and reload.
// Fails on any console error or broken invariant.
// Usage: node tools/qa/playthrough.cjs [outDir] [phone]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');
const log = (...a) => console.log('•', ...a);

(async () => {
  const browser = await chromium.launch();
  const vp = PHONE ? { viewport: { width: 412, height: 891 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  const tag = PHONE ? 'p' : 'd';
  const shot = (n) => page.screenshot({ path: `${OUT}/play-${tag}-${n}.png` });
  const press = (sel) => (PHONE ? page.tap(sel) : page.click(sel));
  const S = () => page.evaluate(() => { const s = window.__CDMT__.state; const L = window.__CDMT__.lot; return { day: s.day, hour: s.hour, cash: Math.round(s.cash), vehicles: s.vehicles.length, sold: s.stats.sold, level: s.companyLevel, rep: Math.round(s.reputation), waiting: s.customers.filter((c) => c.status === 'waiting').length, staff: s.employees.length, locs: s.locations.length, cap: L.lotStats(s.locations[0].lot).capacity, objects: s.locations[0].lot.objects.length, visitors: s.stats.customersTotal }; });
  const invariants = async () => {
    const bad = await page.evaluate(() => {
      const s = window.__CDMT__.state;
      const L = window.__CDMT__.lot;
      const ids = new Set();
      const out = [];
      for (const v of s.vehicles) { if (ids.has(v.id)) out.push('duplicate vehicle ' + v.id); ids.add(v.id); if (v.status === 'sold') out.push('sold vehicle in stock'); }
      for (const v of s.soldArchive) if (ids.has(v.id)) out.push('vehicle both sold and in stock ' + v.id);
      if (!Number.isFinite(s.cash)) out.push('cash NaN');
      if (!Number.isFinite(s.reputation) || s.reputation < 0 || s.reputation > 100) out.push('reputation out of range');
      for (const l of s.locations) {
        const cap = L.lotStats(l.lot).capacity;
        const n = s.vehicles.filter((v) => (v.status === 'transfer' ? v.transferTo === l.id : v.locationId === l.id)).length;
        if (n > cap) out.push(`over capacity at ${l.name}: ${n}/${cap}`);
        const used = new Set();
        for (const v of s.vehicles.filter((x) => x.locationId === l.id && x.slotId && x.status !== 'transit' && x.status !== 'transfer')) {
          if (used.has(v.slotId)) out.push('two cars on one space'); used.add(v.slotId);
          if (!l.lot.objects.some((o) => o.id === v.slotId)) out.push('car on a space that does not exist');
        }
        for (const v of s.vehicles.filter((x) => x.locationId === l.id && x.status === 'listed')) if (!L.isVisibleSlot(l, v.slotId)) out.push('listed car not on show');
        for (const e of s.employees.filter((x) => x.locationId === l.id && x.stationId)) if (!l.lot.objects.some((o) => o.id === e.stationId)) out.push('employee at a missing workstation');
      }
      return out;
    });
    if (bad.length) errors.push(...bad);
  };
  const box = async () => page.locator('canvas.world-canvas').boundingBox();
  const tapWorld = async (p) => { const b = await box(); if (PHONE) await page.touchscreen.tap(b.x + p.x, b.y + p.y); else await page.mouse.click(b.x + p.x, b.y + p.y); await page.waitForTimeout(150); };
  const closeCard = async () => { if (await page.locator('.world-pop.open .wm-close').count()) await press('.world-pop.open .wm-close'); await page.waitForTimeout(80); };
  const tapCar = async (id) => {
    // Make sure it is on screen at a comfortable zoom, then tap it like a player.
    await page.evaluate(() => { document.querySelector('.world-zoom .icon-btn:last-child').click(); });
    await page.waitForTimeout(80);
    const p = await page.evaluate((vid) => window.__CDMT_WORLD__.carScreen(vid), id);
    if (!p) { errors.push('car not on the map ' + id); return; }
    await tapWorld(p);
    await page.waitForSelector('.world-pop.open');
  };

  await page.goto(URL);
  await press('text=New game');
  await page.fill('input[aria-label="Dealership name"]', 'QA Autos');
  await press('.scenario-card[data-template="small"]');
  await press('text=Open the dealership');
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__CDMT__.state.tutorial.dismissed = true; });
  log('start', await S());
  await shot('00-dealership');
  if (await page.locator('.view.world canvas').count() !== 1) errors.push('the dealership is not the home screen');

  // Inspect the private-seller car: tap it on the lot → Inspect.
  const privateId = await page.evaluate(() => window.__CDMT__.state.vehicles.find((v) => v.source === 'private').id);
  await tapCar(privateId);
  await shot('01-car-card');
  await press('.world-pop .wm-actions >> text=Inspect');
  await page.click('text=Run advanced inspection');
  await page.waitForTimeout(150);
  await shot('02-inspection-after');
  const insp = await page.evaluate((id) => window.__CDMT__.state.vehicles.find((v) => v.id === id).inspectionLevel, privateId);
  if (insp !== 2) errors.push('inspection did not run');
  await page.click('.modal-head .icon-btn');
  await closeCard();

  // Clean the dirtiest car from the Cars panel and list another from its card on the map.
  const cashBefore = (await S()).cash;
  await press('.wa-item[data-action=cars]');
  await page.waitForSelector('.world-panel.open');
  await page.locator('.world-panel button:has-text("Clean")').first().click();
  await page.waitForTimeout(100);
  if ((await S()).cash >= cashBefore) errors.push('cleaning did not cost money');
  await shot('03-cars-panel');
  await press('.wp-head .icon-btn');
  const yardId = await page.evaluate(() => window.__CDMT__.state.vehicles.find((v) => v.status === 'yard')?.id);
  if (yardId) {
    await tapCar(yardId);
    await press('.world-pop .wm-actions .btn.primary');
    await page.waitForTimeout(100);
    await closeCard();
  }
  const listed = await page.evaluate(() => window.__CDMT__.state.vehicles.filter((v) => v.status === 'listed').length);
  log('listed now', listed);
  if (listed < 2) errors.push('listing failed');

  // Build: one more parking space where the game says it fits, placed by hand.
  const capBefore = (await S()).cap;
  await press('.wa-item[data-action=build]');
  await press('.bp-tab[data-cat=vehicles]');
  await press('.bp-item[data-obj=parking]');
  const spot = await page.evaluate(() => { const G = window.__CDMT__; const loc = G.state.locations[0]; const sp = G.lot.findSpot(G.state, loc, 'parking'); const w = sp.rot ? 5 : 3; const h = sp.rot ? 3 : 5; return window.__CDMT_WORLD__.toScreen(sp.x + w / 2, sp.y + h / 2); });
  if (PHONE) {
    await tapWorld(spot);
    await press('.world-confirm .btn.primary');
  } else {
    const b = await box();
    await page.mouse.move(b.x + spot.x, b.y + spot.y);
    await page.waitForTimeout(80);
    await shot('04-ghost');
    await page.mouse.click(b.x + spot.x, b.y + spot.y);
  }
  await page.waitForTimeout(150);
  if ((await S()).cap !== capBefore + 1) errors.push(`placing a parking space failed (${capBefore} -> ${(await S()).cap})`);
  await press('.world-confirm .btn.ghost');
  // A workshop room in one tap, then hire a mechanic into it.
  await press('.bp-tab[data-cat=zones]');
  await press('.bp-item[data-room=workshop]');
  await page.waitForTimeout(150);
  const lifts = await page.evaluate(() => window.__CDMT__.lot.lotStats(window.__CDMT__.state.locations[0].lot).slots.lift.length);
  if (lifts !== 1) errors.push('workshop room was not built');
  await shot('05-built');
  await press('[data-bt=done] >> visible=true');
  await press('.wa-item[data-action=staff]');
  await page.waitForSelector('.world-panel.open');
  await shot('06-staff');
  const hireBtn = page.locator('.world-panel .cand:has-text("Mechanic") >> button:has-text("Hire")').first();
  if (await hireBtn.count()) await hireBtn.click(); else errors.push('no mechanic could be hired');
  await page.waitForTimeout(100);
  if ((await S()).staff !== 2) errors.push('hire failed');
  const station = await page.evaluate(() => window.__CDMT__.state.employees.find((e) => e.role === 'mechanic')?.stationId);
  if (!station) errors.push('mechanic has no workstation');
  await press('.wp-head .icon-btn');

  // Buy a car from the Buy cars panel.
  await press('.wa-item[data-action=buy]');
  await page.waitForSelector('.world-panel.open');
  const pre = await S();
  await page.locator('.world-panel .vcard').first().click();
  await page.waitForSelector('.offer-modal');
  await shot('07-offer');
  await page.click('.offer-modal .modal-footer .btn.primary');
  await page.waitForTimeout(150);
  if (await page.$('.modal-overlay .confirm-text')) await page.click('.modal-overlay >> text=Buy it');
  await page.waitForTimeout(150);
  const post = await S();
  log('bought', pre.vehicles, '->', post.vehicles, 'cash', pre.cash, '->', post.cash);
  if (post.vehicles !== pre.vehicles + 1 || post.cash >= pre.cash) errors.push('purchase failed');
  if (await page.locator('.world-panel.open').count()) await press('.wp-head .icon-btn');

  // Run the clock until a customer stands by a car; tap them on the map and sell.
  await page.evaluate(() => { const s = window.__CDMT__.state; s.settings.pauseOnCustomer = false; });
  let served = false;
  for (let i = 0; i < 150 && !served; i += 1) {
    await page.evaluate(() => window.__CDMT__.engine.stepHour());
    await page.waitForTimeout(30);
    if (await page.locator('.daily-modal').count()) { await shot('08-closing-time'); await page.click('.daily-modal >> text=Open the doors'); }
    const w = await page.evaluate(() => window.__CDMT__.state.customers.find((c) => c.status === 'waiting')?.id);
    if (!w) continue;
    // Let them walk in.
    await page.evaluate(() => window.__CDMT__.engine.setSpeed(1));
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.__CDMT__.engine.setSpeed(0));
    const still = await page.evaluate((id) => window.__CDMT__.state.customers.some((c) => c.id === id && c.status === 'waiting'), w);
    if (!still) continue;
    await page.evaluate(() => { document.querySelector('.world-zoom .icon-btn:last-child').click(); });
    await page.waitForTimeout(80);
    const p = await page.evaluate((id) => window.__CDMT_WORLD__.agentScreen('c:' + id), w);
    if (!p) continue;
    await tapWorld(p);
    if (!(await page.locator('.world-pop.open').count())) { await page.evaluate((id) => window.__CDMT__.app.serve(id), w); } else {
      await shot('09-customer-card');
      await press('.world-pop .wm-actions >> text=Talk');
      await page.waitForTimeout(80);
      const td = page.locator('.world-pop button:has-text("Test drive")');
      if (await td.isEnabled()) {
        await td.click();
        // The test-drive dialog: pick the long route, then start.
        await page.waitForSelector('[data-act=start-testdrive]');
        await shot('10a-test-drive-dialog');
        await press('.choice[data-route=long]');
        await press('[data-act=start-testdrive]');
      }
      await page.waitForTimeout(100);
      if (!(await page.evaluate((id) => window.__CDMT__.state.customers.find((c) => c.id === id)?.testDrive, w))) errors.push('test drive did not happen');
      await shot('10-test-drive');
      await press('.world-pop .wm-actions >> text=Negotiate');
    }
    await page.waitForSelector('.negotiation');
    await shot('11-negotiation');
    await page.click('.negotiation .modal-footer .btn.primary');
    await page.waitForTimeout(150);
    const accept = page.locator('.negotiation .modal-footer .btn.success');
    if (await accept.count()) await accept.click();
    await page.waitForTimeout(150);
    await shot('12-sold');
    await page.click('.negotiation .modal-footer .btn.primary');
    await page.waitForTimeout(100);
    if ((await S()).sold < 1) { log('customer walked away, trying the next one'); continue; }
    served = true;
  }
  if (!served) errors.push('no sale made through the dealership in 150 hours');
  log('after first sale', await S());

  // Close the doors for a day: nobody comes in.
  await page.evaluate(() => { window.__CDMT__.state.settings.dailyReport = false; });
  await press('.wh-chip.open-chip');
  if (await page.evaluate(() => window.__CDMT__.state.locations[0].lot.open)) errors.push('closing the doors failed');
  const v0 = (await S()).visitors;
  await page.evaluate(() => window.__CDMT__.engine.skipToNextDay());
  await page.evaluate(() => { const s = window.__CDMT__.state; for (let h = s.hour; h < 20 && s.day === s.day; h += 1) window.__CDMT__.engine.stepHour(); });
  const v1 = (await S()).visitors;
  if (v1 !== v0) errors.push(`customers came in while closed (${v0} -> ${v1})`);
  await shot('13-closed');
  await press('.wh-chip.open-chip');

  // Play 45 days: keep cars listed from the Cars panel, check invariants daily.
  for (let d = 0; d < 45; d += 1) {
    // Level-ups and other big moments pop up as dialogs; read and dismiss them like a player.
    for (let k = 0; k < 3 && await page.locator('.modal-overlay').count(); k += 1) { await shot(`14-dialog-${d}`); await page.keyboard.press('Escape'); await page.waitForTimeout(60); }
    if (d % 5 === 0) {
      await press('.wa-item[data-action=cars]');
      const listButtons = page.locator('.world-panel .vcard button:has-text("List")');
      const n = Math.min(4, await listButtons.count());
      for (let i = 0; i < n; i += 1) { await listButtons.first().click().catch(() => {}); await page.waitForTimeout(30); }
      if (await page.locator('.world-panel.open').count()) await press('.wp-head .icon-btn');
    }
    await page.evaluate(() => {
      const G = window.__CDMT__;
      const s = G.state;
      const loc = s.locations[0];
      const free = G.lot.lotStats(loc.lot).capacity - s.vehicles.filter((v) => v.locationId === loc.id || v.transferTo === loc.id).length;
      if (free > 0 && s.cash > 15000) {
        const o = s.offers.filter((x) => !x.auction && x.offerPrice < s.cash * 0.3).sort((a, b) => a.offerPrice - b.offerPrice)[0];
        if (o) G.trading.buyOffer(s, o.id, loc.id);
      }
      G.engine.skipToNextDay();
    });
    await page.waitForTimeout(40);
    await invariants();
  }
  await shot('14-day45');
  log('day ~46', await S());

  // Reports and Company screens: loans and a second dealership.
  await page.evaluate(() => window.__CDMT__.app.go('reports', { tab: 'finances' }));
  await page.locator('.loan-offer >> button:has-text("Borrow")').first().click();
  await page.waitForTimeout(100);
  if (!(await page.evaluate(() => window.__CDMT__.state.loans.length))) errors.push('loan not taken');
  await shot('15-finances');
  await page.evaluate(() => { const s = window.__CDMT__.state; s.companyLevel = 3; s.cash += 200000; window.__CDMT__.app.go('locations'); });
  await page.locator('.city >> button:has-text("Open for")').first().click();
  await page.click('.modal-overlay >> text=Open dealership');
  await page.waitForTimeout(150);
  if ((await S()).locs !== 2) errors.push('expansion failed');
  const lot2 = await page.evaluate(() => { const l = window.__CDMT__.state.locations[1]; return window.__CDMT__.lot.lotStats(l.lot).capacity; });
  if (lot2 < 5) errors.push('new dealership has no spaces');
  await shot('16-expansion');
  await page.evaluate(() => window.__CDMT__.app.go('dealership'));
  for (let d = 0; d < 10; d += 1) await page.evaluate(() => window.__CDMT__.engine.skipToNextDay());
  await invariants();

  // Save, reload, continue: the layout, spaces and staff desks come back exactly.
  const layout = await page.evaluate(() => JSON.stringify(window.__CDMT__.state.locations.map((l) => [l.lot.w, l.lot.h, l.lot.zones, l.lot.objects.map((o) => [o.id, o.defId, o.x, o.y, o.rot])])));
  const slots = await page.evaluate(() => JSON.stringify(window.__CDMT__.state.vehicles.map((v) => [v.id, v.slotId || ''])));
  const before = await S();
  await page.evaluate(() => window.__CDMT__.app.go('settings'));
  await page.locator('.save-slot >> button:has-text("Save")').first().click();
  await page.waitForTimeout(100);
  await page.reload();
  await press('text=Continue');
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => !!window.__CDMT__))) { console.log('ERRORS:\n' + errors.join('\n') + '\ncontinue failed: ' + (await page.locator('body').innerText()).slice(0, 400)); process.exit(1); }
  const after = await S();
  log('reload', before.day, '->', after.day, 'cash', before.cash, '->', after.cash);
  if (after.day !== before.day || Math.abs(after.cash - before.cash) > 1 || after.vehicles !== before.vehicles) errors.push('save/load mismatch');
  const layout2 = await page.evaluate(() => JSON.stringify(window.__CDMT__.state.locations.map((l) => [l.lot.w, l.lot.h, l.lot.zones, l.lot.objects.map((o) => [o.id, o.defId, o.x, o.y, o.rot])])));
  const slots2 = await page.evaluate(() => JSON.stringify(window.__CDMT__.state.vehicles.map((v) => [v.id, v.slotId || ''])));
  if (layout !== layout2) errors.push('dealership layout changed after reload');
  if (slots !== slots2) errors.push('vehicle positions changed after reload');
  await shot('17-after-reload');
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
  console.log('playthrough ok');
})().catch((e) => { console.error(e); process.exit(1); });
