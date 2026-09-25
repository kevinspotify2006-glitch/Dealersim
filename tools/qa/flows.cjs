// Edge-flow QA: trade-ins, auctions, staff training, level-up, bankruptcy
// recovery and selling the company for legacy points.
// Usage: node tools/qa/flows.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const G = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('text=New game');
  await page.click('text=Open the dealership');
  await G(() => { const s = window.__CDMT__.state; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.tutorial.dismissed = true; s.cash += 60000; });

  // 1. Trade-in
  let tradeDone = false;
  for (let h = 0; h < 12 * 40 && !tradeDone; h += 1) {
    const id = await G(() => {
      const s = window.__CDMT__.state;
      s.vehicles.filter((v) => v.status === 'yard').forEach((v) => { v.status = 'listed'; });
      if (s.hour === 8 && s.vehicles.length < 4) {
        const o = s.offers.filter((x) => !x.auction && x.offerPrice < 20000).sort((a, b) => a.offerPrice - b.offerPrice)[0];
        if (o) window.__CDMT__.trading.buyOffer(s, o.id);
      }
      const c = s.customers.find((x) => x.status === 'waiting' && x.tradeIn);
      if (!c) { window.__CDMT__.engine.stepHour(); return null; }
      return c.id;
    });
    if (!id) continue;
    await G((cid) => window.__CDMT__.app.serve(cid), id);
    await page.waitForSelector('.neg-tradein');
    const before = await G(() => window.__CDMT__.state.vehicles.length);
    const expect = await G((cid) => window.__CDMT__.state.customers.find((c) => c.id === cid).tradeInExpectation, id);
    await page.fill('.neg-tradein input[type="number"]', String(expect));
    await page.click('.neg-tradein >> text=Offer allowance');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/flow-tradein.png` });
    await page.click('.negotiation .modal-footer .btn.success');
    await page.waitForTimeout(150);
    const after = await G(() => window.__CDMT__.state.vehicles.length);
    const sold = await G(() => !!document.querySelector('.sold-stamp'));
    if (sold && after !== before) errors.push(`trade-in: stock ${before} -> ${after}, expected unchanged (one sold, one taken in)`);
    if (!sold) errors.push('trade-in deal did not close');
    await page.click('.negotiation .modal-footer .btn.primary');
    tradeDone = true;
  }
  if (!tradeDone) errors.push('no customer with a trade-in appeared in 40 days');

  // 2. Auction
  await G(() => { const s = window.__CDMT__.state; s.companyLevel = 2; s.cash += 100000; window.__CDMT__.engine.skipToNextDay(); window.__CDMT__.app.go('market'); });
  const lot = await G(() => window.__CDMT__.state.offers.find((o) => o.auction)?.id);
  if (!lot) errors.push('no auction lots at level 2');
  else {
    await page.click(`tr[data-id="${lot}"]`);
    await page.waitForSelector('.offer-modal');
    const reserve = await G((id) => window.__CDMT__.state.offers.find((o) => o.id === id).auction.reserve, lot);
    await page.fill('.offer-modal input[aria-label="Maximum bid"]', String(Math.round(reserve * 1.4)));
    await page.screenshot({ path: `${OUT}/flow-auction-before.png` });
    await page.click('.offer-modal .modal-footer .btn.primary');
    await page.waitForTimeout(100);
    if (await page.$('.confirm-text')) await page.click('.modal-card:has(.confirm-text) >> text=Place bid');
    await page.screenshot({ path: `${OUT}/flow-auction.png` });
    await page.keyboard.press('Escape');
    const n0 = await G(() => window.__CDMT__.state.stats.vehiclesBought);
    for (let i = 0; i < 4; i += 1) await G(() => window.__CDMT__.engine.skipToNextDay());
    const n1 = await G(() => window.__CDMT__.state.stats.vehiclesBought);
    const notice = await G(() => window.__CDMT__.state.notices.some((n) => n.text.includes('auction') || n.text.includes('Outbid')));
    if (n1 <= n0 && !notice) errors.push('auction never resolved');
  }

  // 3. Staff: hire and train through the employee dialog
  // A mechanic needs a lift: build a workshop first, then hire from the Company → Staff screen.
  await G(() => { const G = window.__CDMT__; const s = G.state; s.cash += 50000; const r = G.lot.buildQuickRoom(s, s.locations[0], 'workshop'); if (!r.ok) throw new Error(r.message); G.app.go('recruit'); });
  await page.waitForTimeout(100);
  await page.locator('.cand:has-text("Mechanic") >> button:has-text("Hire")').first().click();
  await page.waitForTimeout(100);
  const empId = await G(() => window.__CDMT__.state.employees[window.__CDMT__.state.employees.length - 1].id);
  await G(() => window.__CDMT__.app.go('staff'));
  await page.waitForTimeout(100);
  await page.locator('.person-card[data-emp]').last().click();
  await page.waitForSelector('.modal-card');
  await page.locator('.modal-card button[data-track]:not([disabled])').first().click();
  await page.waitForTimeout(100);
  const training = await G((id) => window.__CDMT__.state.employees.find((e) => e.id === id)?.trainingDaysLeft, empId);
  if (!(training > 0)) errors.push('training did not start');
  await page.screenshot({ path: `${OUT}/flow-employee.png` });
  await page.keyboard.press('Escape');

  // 4. Level up
  await G(() => { const s = window.__CDMT__.state; s.stats.sold = 150; s.cash += 900000; window.__CDMT__.engine.skipToNextDay(); });
  await page.waitForTimeout(200);
  if (!(await page.$('.levelup'))) errors.push('level-up dialog did not appear');
  await page.screenshot({ path: `${OUT}/flow-levelup.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 5. Bankruptcy and recovery
  await G(() => { const s = window.__CDMT__.state; s.cash = -400000; s.overdraftDays = 29; window.__CDMT__.engine.skipToNextDay(); });
  await page.waitForTimeout(400);
  if (!(await page.$('.bankrupt-modal'))) errors.push('bankruptcy dialog did not appear');
  await page.screenshot({ path: `${OUT}/flow-bankrupt.png` });
  const loanBtn = page.locator('.bankrupt-modal .decision-option').nth(1);
  if (await loanBtn.isEnabled()) await loanBtn.click();
  const liq = page.locator('.bankrupt-modal .decision-option').first();
  if (await page.$('.bankrupt-modal') && await liq.isEnabled()) await liq.click();
  await G(() => { const s = window.__CDMT__.state; if (s.cash < 0) { s.cash = 1000; } });
  await page.waitForTimeout(400);

  // 6. Sell the company (legacy)
  await page.keyboard.press('Escape');
  await G(() => { const s = window.__CDMT__.state; s.bankrupt = false; s.overdraftDays = 0; s.companyLevel = 6; s.cash = Math.max(s.cash, 5000000); document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.__CDMT__.app.go('company'); });
  await page.waitForTimeout(200);
  await page.click('text=/Sell company/');
  await page.click('.modal-card:has(.confirm-text) >> text=Sell and start over');
  await page.waitForTimeout(300);
  const legacy = await G(() => JSON.parse(localStorage.getItem('cdmt:legacy') || '{}'));
  if (!(legacy.points > 0)) errors.push('legacy points not awarded');
  if (!(await page.$('.welcome'))) errors.push('did not return to the title screen after selling');
  await page.click('text=New game');
  await page.screenshot({ path: `${OUT}/flow-legacy-newgame.png` });

  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('flows ok');
})().catch((e) => { console.error(e); process.exit(1); });
