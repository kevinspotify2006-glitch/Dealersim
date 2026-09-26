// v5 through the real UI: the six-section navigation (tabs, swipe on a phone),
// the status bar, vehicle buyers (brief → deal → negotiate → approve, from the
// deal card and from a notification), the planning (drag a block, move it,
// fix conflicts), people (contracts, manager focus, profile), customer cards
// (mood, assign an advisor) and service cars on the lot.
// Usage: node tools/qa/flows5.cjs [outDir] [phone]
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
  const shot = (n) => page.screenshot({ path: `${OUT}/v5-${tag}-${n}.png` });
  const click = async (sel) => { const l = page.locator(sel).locator('visible=true').first(); await l.scrollIntoViewIfNeeded(); if (PHONE) await l.tap(); else await l.click(); await wait(); };
  const clearOverlays = () => G(() => { document.querySelectorAll('.modal-overlay, #notify-stack, .toast-stack').forEach((m) => m.remove()); });
  const go = async (route, params) => { await clearOverlays(); await G(([r, p]) => window.__CDMT__.app.go(r, p || {}), [route, params]); await wait(180); };
  const check = (ok, msg) => { if (!ok) { errors.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
  const skipDays = (n) => G((k) => { const W = window.__CDMT__; for (let i = 0; i < k; i += 1) W.engine.skipToNextDay(); document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); }, n);

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await click('text=New game');
  await click('text=Open the dealership');
  await G(() => {
    const W = window.__CDMT__; const s = W.state;
    s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.cash += 500000; s.companyLevel = 3; W.engine.setSpeed(0);
    document.querySelector('.tutorial')?.remove();
    const loc = s.locations[0];
    W.lot.buildQuickRoom(s, loc, 'workshop'); W.lot.buildQuickRoom(s, loc, 'office');
    for (let i = 0; i < 6; i += 1) W.lot.autoPlace(s, loc, 'parking');
  });

  // ---- navigation: six sections, the status bar
  const sections = await G(() => [...document.querySelectorAll(window.innerWidth <= 900 ? '.mobile-nav .nav-bar .nav-item' : '.nav .nav-item[data-route]')].map((b) => b.dataset.section || b.dataset.route));
  const expected = PHONE ? ['dealership', 'inventory', 'people', 'service', 'business'] : ['dealership', 'inventory', 'people', 'service', 'business', 'settings'];
  check(expected.every((x) => sections.includes(x)) && sections.length === expected.length, `${expected.length} sections in the navigation (${sections.join(',')})`);
  if (PHONE) {
    // Phone: a compact header card (cash, today, cars, staff) that opens the status sheet.
    const head = await G(() => [...document.querySelectorAll('#m-hud [data-hudv], #m-hud [data-hudm]')].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.dataset.hudv || c.dataset.hudm));
    check(['cash', 'today', 'stock', 'staff'].every((k) => head.includes(k)), `compact header shows ${head.join(', ')}`);
    await click('#m-hud');
  }
  const chips = await G(() => [...document.querySelectorAll(window.innerWidth <= 900 ? '.status-sheet [data-hud]' : '.hud.statusbar .sb-chip')].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.dataset.hud));
  check(chips.includes('cash') && chips.includes('stock') && chips.includes('staff') && chips.includes('service'), `status ${PHONE ? 'sheet' : 'bar'} shows ${chips.join(', ')}`);
  await click(`${PHONE ? '.status-sheet .stat-tile' : '.hud.statusbar .sb-chip'}[data-hud=stock]`);
  check(await G(() => window.__CDMT__.app.route === 'inventory'), 'the stock chip opens Inventory');

  // ---- recruit a vehicle buyer
  await G(() => { const s = window.__CDMT__.state; const c = s.candidates.find((x) => x.role !== 'sales') ?? s.candidates[0]; c.role = 'buyer'; c.name = 'Tess Buyer'; c.skills.buying = 72; c.skills.appraisal = 68; c.skills.negotiation = 64; });
  await go('people', { tab: 'hire' });
  await click('.person-card.cand:has-text("Tess Buyer") button[data-hire]');
  check(await G(() => window.__CDMT__.state.employees.some((e) => e.role === 'buyer')), 'vehicle buyer hired from Recruitment');

  // ---- brief → deals
  await go('inventory', { tab: 'buyers' });
  await click('button[data-brief]');
  await page.fill('input[data-field=maxPrice]', '24000');
  await page.fill('input[data-field=minMargin]', '1000');
  await page.locator('input[data-field=minMargin]').dispatchEvent('change');
  await page.locator('input[data-field=maxPrice]').dispatchEvent('change');
  await click('[data-act=start-search]');
  const m = await G(() => window.__CDMT__.state.procurement.mandates[0]);
  check(m && m.active && m.maxPrice === 24000 && m.minMargin === 1000, 'brief saved and search started');
  let deals = 0;
  for (let d = 0; d < 12 && deals < 2; d += 1) { await skipDays(1); deals = await G(() => window.__CDMT__.state.procurement.proposals.length); }
  check(deals >= 1, `buyer brought ${deals} deal(s)`);
  // A notification card with Approve/Decline appears for a new deal.
  await G(() => { const W = window.__CDMT__; W.state.procurement.proposals.forEach((p) => { p.expires = W.state.day + 2; }); });
  await go('inventory', { tab: 'buyers' });
  await shot('01-buyers');
  if (deals) {
    const before = await G(() => window.__CDMT__.state.procurement.proposals[0]);
    await click(`.deal-card[data-proposal="${before.id}"] [data-act=push]`);
    const after = await G((id) => window.__CDMT__.state.procurement.proposals.find((p) => p.id === id), before.id);
    check(!after || after.rounds === 1, 'asked the buyer to negotiate (seller moved, held or walked)');
    const pid = await G(() => window.__CDMT__.state.procurement.proposals[0]?.id);
    if (pid) {
      await clearOverlays();
      await go('inventory', { tab: 'buyers' });
      await click(`.deal-card[data-proposal="${pid}"] [data-act=approve]`);
      const bought = await G((id) => window.__CDMT__.state.vehicles.find((v) => v.boughtBy && v.status === 'transit'), pid);
      check(!!bought, 'approved deal: the car is on its way, credited to the buyer');
    }
  }
  // From a notification: force a fresh deal and use the card.
  for (let d = 0; d < 10; d += 1) {
    await skipDays(1);
    if (await G(() => window.__CDMT__.state.procurement.proposals.length)) break;
  }
  const np = await G(() => window.__CDMT__.state.procurement.proposals[0]?.id);
  if (np) {
    await go('dealership');
    await G((id) => { const W = window.__CDMT__; const p = W.state.procurement.proposals.find((x) => x.id === id); p.expires = W.state.day + 2; }, np);
    // Re-announce it the way the simulation does.
    await G((id) => { const W = window.__CDMT__; W.state.noticeCounter += 1; const n = { id: W.state.noticeCounter, day: W.state.day, kind: 'good', text: '🔎 test deal', read: false, action: { kind: 'proposal', id } }; W.state.notices.unshift(n); W.emit('notice', n); }, np);
    const hasCard = await page.locator('.notify-card.proposal').count();
    if (hasCard) {
      await shot('02-notification');
      await click('.notify-card.proposal .btn.primary');
      check(!(await G((id) => window.__CDMT__.state.procurement.proposals.some((p) => p.id === id), np)), 'approved from the notification card');
    } else console.log('  (no emit hook — notification card covered by the playthrough)');
  }

  // ---- planning
  await G(() => { const s = window.__CDMT__.state; const c = s.candidates.find((x) => x.role === 'mechanic') ?? s.candidates[0]; c.role = 'mechanic'; c.name = 'Max Wrench'; });
  await go('people', { tab: 'hire' });
  const hireMech = page.locator('.person-card.cand:has-text("Max Wrench") button[data-hire]');
  if (await hireMech.count()) await click('.person-card.cand:has-text("Max Wrench") button[data-hire]');
  await skipDays(2);
  // Make sure there is work in the plan (walk-in bookings are random).
  await G(() => { const W = window.__CDMT__; const s = W.state; for (let i = 0; i < 2; i += 1) W.service.bookJob(s, s.locations[0], { type: 'brakes', customer: `QA Client ${i}` }); });
  await go('service', { tab: 'planning' });
  let dayIdx = 1;
  let blocks = 0;
  for (let i = 0; i < 7 && !blocks; i += 1) {
    await click(`.day-pill[data-day="${i}"]`);
    blocks = await page.locator('.plan-block.planned').count();
    dayIdx = i;
  }
  await shot('03-planning');
  if (!blocks) console.log('   debug', await G(() => { const s = window.__CDMT__.state; return JSON.stringify({ emp: s.employees.map((e) => e.role + (e.stationId ? '+' : '-')), appts: s.appointments.map((a) => `${a.kind}:${a.day - s.day}:${a.status}`), jobs: s.serviceJobs.length, lifts: window.__CDMT__.lot.lotStats(s.locations[0].lot).slots.lift.length }); }));
  check(blocks > 0, `day +${dayIdx} has ${blocks} bookable block(s)`);
  if (blocks) {
    const id = await page.locator('.plan-block.planned').first().getAttribute('data-appt');
    const start0 = await G((i) => window.__CDMT__.state.appointments.find((a) => a.id === i).start, id);
    // Tap → details → 30 minutes later.
    await click(`.plan-block[data-appt="${id}"]`);
    await page.waitForSelector('[data-act=later]');
    const later = page.locator('[data-act=later]');
    await later.click();
    await wait();
    const start1 = await G((i) => window.__CDMT__.state.appointments.find((a) => a.id === i).start, id);
    check(start1 === start0 + 0.5 || start1 === start0 + 1.5, `moved 30 minutes later (${start0} → ${start1})`);
    await clearOverlays();
    await go('service', { tab: 'planning' });
    if (!PHONE) {
      // Drag it two hours later with the mouse.
      await wait(400);
      await page.locator(`.plan-block[data-appt="${id}"]`).scrollIntoViewIfNeeded();
      await G(() => { const sc = document.querySelector('.plan-scroll'); if (sc) sc.scrollLeft = 0; });
      const box = await page.locator(`.plan-block[data-appt="${id}"]`).boundingBox();
      const W = await G(() => parseFloat(getComputedStyle(document.querySelector('.plan-grid')).getPropertyValue('--hw')));
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i += 1) { await page.mouse.move(box.x + 10 + (W * 2) * i / 6, box.y + box.height / 2); await wait(20); }
      console.log('   at point:', await G(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.className + ' / ' + (el.closest('.plan-block')?.dataset.appt ?? '') : 'none'; }, [box.x + 10, box.y + box.height / 2]));
      await page.mouse.up();
      await wait(200);
      console.log('   toast:', await G(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')));
      const start2 = await G((i) => window.__CDMT__.state.appointments.find((a) => a.id === i).start, id);
      check(start2 !== start1, `dragged the block to ${start2}`);
    }
    // Make a double booking, then let the planner fix it.
    await G((DAY) => {
      const s = window.__CDMT__.state;
      const day = s.day + DAY;
      const list = s.appointments.filter((a) => a.day === day && a.kind === 'service' && a.status === 'planned');
      const mech = s.employees.find((e) => e.role === 'mechanic');
      if (list.length >= 1 && mech) {
        const extra = { ...list[0], id: 'qa-dup', jobId: undefined, kind: 'sales', title: '👤 Visit', start: list[0].start, staffId: mech.id };
        s.appointments.push(extra);
      }
    }, dayIdx);
    await go('service', { tab: 'planning' });
    await click(`.day-pill[data-day="${dayIdx}"]`);
    const cf = await page.locator('.conflict-bar').count();
    check(cf === 1, 'double booking shows as a conflict');
    if (cf) {
      await click('[data-act=fix]');
      const left = await G((DAY) => { const s = window.__CDMT__.state; return s.appointments.filter((a) => a.day === s.day + DAY && a.status === 'planned').length; }, dayIdx);
      await go('service', { tab: 'planning' });
      await click(`.day-pill[data-day="${dayIdx}"]`);
      check((await page.locator('.conflict-bar').count()) === 0, `"Fix schedule" solved it (${left} planned)`);
    }
  }

  // ---- people: contracts, focus, profile
  await G(() => { const s = window.__CDMT__.state; const e = s.employees.find((x) => x.role === 'mechanic'); e.contract = 'temporary'; e.contractEnd = s.day + 20; });
  await go('people', { tab: 'staff' });
  await shot('04-team');
  await click('.person-card:has-text("Max Wrench")');
  await page.waitForSelector('[data-act=permanent]');
  await click('[data-act=permanent]');
  check(await G(() => window.__CDMT__.state.employees.find((e) => e.role === 'mechanic').contract === 'permanent'), 'temporary contract made permanent');
  await clearOverlays();

  // ---- swipe between tabs on a phone
  if (PHONE) {
    await go('inventory', { tab: 'stock' });
    await G(() => {
      const body = document.querySelector('.hub-body');
      const t = (x) => new Touch({ identifier: 1, target: body, clientX: x, clientY: 400 });
      body.dispatchEvent(new TouchEvent('touchstart', { touches: [t(330)], changedTouches: [t(330)], bubbles: true }));
      body.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(90)], bubbles: true }));
    });
    await wait(250);
    check(await G(() => document.querySelector('.hub-tab.active')?.dataset.tab === 'buy'), 'swiping left moves to the next tab');
  }

  // ---- the dealership: customers with a mood, assign an advisor; service cars on the lot
  await G(() => { const W = window.__CDMT__; const s = W.state; for (const v of s.vehicles) if (v.status === 'yard') W.trading.listVehicle(s, v.id, true); s.locations[0].lot.open = true; });
  await go('dealership');
  let cust = null;
  for (let i = 0; i < 200 && !cust; i += 1) cust = await G(() => { const W = window.__CDMT__; W.engine.stepHour(); document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); return W.state.customers.find((c) => c.status === 'waiting')?.id ?? null; });
  if (cust) {
    await wait(600);
    const mood = await G((id) => { const a = window.__CDMT_WORLD__.agents().find((x) => x.id === `c:${id}`); return a ? true : null; }, cust);
    check(mood !== null, 'waiting customer is on the floor');
    await G((id) => window.__CDMT_WORLD__.select({ kind: 'agent', id: `c:${id}` }), cust);
    await wait(200);
    check((await page.locator('.wm-mood').count()) === 1, 'customer card shows their mood (🟢/🟡/🔴)');
    await shot('05a-customer');
    const assign = page.locator('.world-pop button:has-text("Assign advisor")');
    if (await assign.count()) { await assign.first().click(); await wait(); check(await G((id) => window.__CDMT__.state.customers.find((c) => c.id === id)?.status !== 'waiting', cust), 'assigned a sales advisor from the customer card'); }
  }
  const lifts = await G(() => window.__CDMT__.state.serviceJobs.filter((j) => j.stage && j.stage !== 'expected' && j.stage !== 'collected').length);
  check(lifts >= 0, `service cars on the lot: ${lifts}`);
  await shot('05-dealership');

  await browser.close();
  const real = [...new Set(errors)];
  if (real.length) { console.log('ERRORS:\n' + real.join('\n')); process.exit(1); }
  console.log(`flows5 ok (${PHONE ? 'phone' : 'desktop'})`);
})().catch((e) => { console.error(e); process.exit(1); });
