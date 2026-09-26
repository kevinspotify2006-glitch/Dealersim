// v4 systems through the real UI: brand choice at the start, research, pricing
// policy, delivery options, parts orders, campaigns with a budget, fleet orders,
// decisions from the dealership HUD, staff bonus and training tracks, the
// stock desk (demo cars), brand identity, finance in a negotiation and the
// test-drive dialog. Each step checks the simulation actually changed.
// Usage: node tools/qa/flows4.cjs [outDir] [phone]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 412, height: 891 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const tag = PHONE ? 'p' : 'd';
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const G = (fn, a) => page.evaluate(fn, a);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: `${OUT}/v4-${tag}-${n}.png` });
  const click = async (sel) => { const l = page.locator(sel).locator('visible=true').first(); await l.scrollIntoViewIfNeeded(); if (PHONE) await l.tap(); else await l.click(); await wait(); };
  const go = async (route, params) => { await G(([r, p]) => { document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.__CDMT__.app.go(r, p || {}); }, [route, params]); await wait(150); };
  const S = () => G(() => window.__CDMT__.state);
  const check = (ok, msg) => { if (!ok) { errors.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await click('text=New game');
  // Brand at the start: a colour and a logo.
  await click('.welcome .swatch >> nth=2');
  await click('.welcome .logo-pick >> nth=3');
  await shot('01-newgame-brand');
  await click('text=Open the dealership');
  await G(() => { const s = window.__CDMT__.state; s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.cash += 600000; s.companyLevel = 4; window.__CDMT__.engine.setSpeed(0); document.querySelector('.tutorial')?.remove(); });
  let st = await S();
  check(st.branding.color !== '#ff7a1a' && st.branding.logo !== '🚗', 'brand colour and logo chosen at the start');

  // Research.
  await go('research');
  await click('[data-research]');
  st = await S();
  check(!!st.research.active, `research started (${st.research.active?.id})`);
  await click('[data-queue]');
  check((await S()).research.queue.length === 1, 'second project queued');
  await shot('02-research');

  // Sales & F&I: pricing policy and delivery experience.
  await go('retail');
  await click('[data-pricing=premium]');
  check((await S()).locations[0].pricing === 'premium', 'pricing policy set to premium');
  await click('input[data-delivery=flowers]');
  check((await S()).locations[0].delivery.flowers === true, 'delivery option switched on');
  await shot('03-retail');

  // Service: a workshop, then parts.
  await G(() => { const W = window.__CDMT__; const r = W.lot.buildQuickRoom(W.state, W.state.locations[0], 'workshop'); if (!r.ok) throw new Error(r.message); });
  await go('workshop');
  const before = (await S()).locations[0].parts?.oil ?? 0;
  await click('.part-row[data-part=oil] button[data-order="5"]');
  st = await S();
  check((st.locations[0].partsOrders ?? []).some((o) => o.part === 'oil' && o.qty === 5), `parts ordered (oil in stock ${before})`);
  await shot('04-service');

  // Marketing with a big budget.
  await go('marketing');
  await click('.channel[data-channel=google] button[data-budget="2"]');
  await click('.channel[data-channel=google] button[data-launch]');
  st = await S();
  check(st.campaigns.some((c) => c.channelId === 'google' && c.budget === 2), 'search-ads campaign launched with a big budget');

  // Staff: hire a mechanic for the new workshop, bonus, a training track.
  await go('recruit');
  await click(`.cand:has-text("Mechanic") >> button:has-text("Hire")`);
  const emp = await G(() => window.__CDMT__.state.employees.at(-1).id);
  await G((id) => window.__CDMT__.app.go('staff'), emp);
  await wait(120);
  await click('.person-card[data-emp] >> nth=-1');
  await page.waitForSelector('.modal-card');
  await click('.modal-footer button:has-text("Bonus")');
  check((await G((id) => window.__CDMT__.state.employees.find((e) => e.id === id)?.bonusDay, emp)) !== undefined, 'bonus paid');
  await click('.modal-card button[data-track]:not([disabled])');
  check((await G((id) => window.__CDMT__.state.employees.find((e) => e.id === id)?.trainingDaysLeft, emp)) > 0, 'training track started');
  await shot('05-employee');
  await page.keyboard.press('Escape');

  // Play on until a fleet enquiry turns up, then until a decision does.
  const until = async (test) => { for (let d = 0; d < 150; d += 1) { if (await G(test)) return true; await G(() => { const W = window.__CDMT__; W.engine.skipToNextDay(); document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); }); } return G(test); };
  if (await until(() => window.__CDMT__.state.fleet.some((r) => r.status === 'open'))) {
    await go('fleet');
    await click('.fleet-card button[data-act=accept]');
    check((await S()).fleet.some((r) => r.status === 'accepted'), 'fleet order accepted');
    await shot('06-fleet');
  } else check(false, 'no fleet enquiry arrived in 90 days');
  if (await until(() => window.__CDMT__.state.decisions.length > 0)) {
    await go('dealership');
    await wait(300);
    await click('.hud-chip-decision');
    await page.waitForSelector('.decision');
    await shot('07-decision');
    const n0 = (await S()).decisions.length;
    await click('.decision .decision-opt >> nth=-1');
    check((await S()).decisions.length < n0, 'decision made from the dealership HUD');
  } else check(false, 'no decision turned up in 90 days');

  // Stock desk: mark a demo car.
  await G(() => { const W = window.__CDMT__; const s = W.state; for (const o of s.offers.filter((x) => !x.auction).slice(0, 3)) W.trading.buyOffer(s, o.id, s.locations[0].id); for (let i = 0; i < 4; i += 1) W.engine.skipToNextDay(); });
  await go('stock');
  const hasCar = await page.locator('button[data-demo]').count();
  if (hasCar) {
    await click('button[data-demo]');
    check((await S()).vehicles.some((v) => v.demo), 'demo car marked on the stock desk');
  } else check(false, 'no cars on the stock desk');
  await shot('08-stock');

  // Brand identity: new colour and promise.
  await go('identity');
  await click('.swatch[data-color="#2fd18b"]');
  await click('.choice[data-position=electric]');
  await click('[data-act=apply-identity]');
  const conf = page.locator('.modal-overlay button:has-text("Rebrand")');
  if (await conf.count()) { await conf.first().click(); await wait(); }
  st = await S();
  check(st.branding.color === '#2fd18b' && st.branding.position === 'electric', 'rebranded (colour + brand promise)');
  await shot('09-identity');

  // Finance in a negotiation, and the test-drive dialog.
  await G(() => { const s = window.__CDMT__.state; s.locations[0].upgrades.finance = 2; s.locations[0].lot.open = true; s.cash += 100000; for (const o of s.offers.filter((x) => !x.auction).slice(0, 4)) window.__CDMT__.trading.buyOffer(s, o.id, s.locations[0].id); for (let i = 0; i < 3; i += 1) window.__CDMT__.engine.skipToNextDay(); for (const v of s.vehicles) if (v.status === 'yard' && !(v.askingPrice > 0)) v.askingPrice = Math.round(v.purchasePrice * 1.2); for (const v of s.vehicles) if (v.status === 'yard' && v.askingPrice > 0) window.__CDMT__.trading.listVehicle(s, v.id, true); });
  let cust = null;
  for (let i = 0; i < 240 && !cust; i += 1) cust = await G(() => { const W = window.__CDMT__; W.engine.stepHour(); document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); return W.state.customers.find((c) => c.status === 'waiting' && !c.testDrive)?.id ?? null; });
  if (cust) {
    await go('dealership');
    await G(() => window.__CDMT__.app.go('dealership', { panel: 'customers' }));
    await wait(250);
    const td = page.locator('.world-panel .wp-cust button:has-text("Test drive"):not([disabled])');
    if (await td.count()) {
      await td.first().click();
      await page.waitForSelector('[data-act=start-testdrive]');
      await click('.choice[data-route=long]');
      await shot('10-testdrive');
      await click('[data-act=start-testdrive]');
      check(await G(() => window.__CDMT__.state.customers.some((c) => c.testDrive)), 'test drive through the dialog');
    }
    const waiting = await G(() => window.__CDMT__.state.customers.find((c) => c.status === 'waiting')?.id ?? null);
    if (waiting) {
      await G((id) => window.__CDMT__.app.serve(id), waiting);
      await page.waitForSelector('.negotiation');
      const apply = page.locator('[data-act=apply-finance]');
      if (await apply.count()) {
        await apply.first().click();
        await wait(150);
        const plan = await G(() => window.__CDMT__.state.negotiation?.plan ?? null);
        check(!!plan && (plan.approved || plan.declined), `finance application decided (${plan?.approved ? 'approved' : 'declined'})`);
        await shot('11-finance');
      } else check(false, 'no finance panel in the negotiation');
      await page.keyboard.press('Escape');
    }
  } else check(false, 'no customer arrived to test finance');

  // Missions screen and the reports KPIs render.
  await go('missions'); await shot('12-missions');
  await go('reports', { tab: 'kpis' }); await shot('13-kpis');
  await go('group'); await shot('14-group');
  await go('brands'); await shot('15-brands');
  await go('clients'); await shot('16-clients');

  await browser.close();
  const real = errors.filter((e) => !e.startsWith('  '));
  if (real.length) { console.log('ERRORS:\n' + [...new Set(real)].join('\n')); process.exit(1); }
  console.log(`flows4 ok (${PHONE ? 'phone' : 'desktop'})`);
})().catch((e) => { console.error(e); process.exit(1); });
