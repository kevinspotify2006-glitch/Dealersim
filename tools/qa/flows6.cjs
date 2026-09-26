// v6 through the real UI: Build / Move / Bulldoze / Area modes, bulldoze
// refunds and safety warnings, undo/redo, buying locked land on the map,
// room templates, create room, upgrades, dealership style, and the playable
// test drive (keyboard or touch controls, checkpoints, result, buy after the
// drive, a customer drive with purchase confidence, Esc to exit).
// Usage: node tools/qa/flows6.cjs [outDir] [phone]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

(async () => {
  const browser = await chromium.launch();
  const bctx = await browser.newContext(PHONE ? { viewport: { width: 412, height: 891 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await bctx.newPage();
  const cdp = PHONE ? await bctx.newCDPSession(page) : null;
  const errors = [];
  const tag = PHONE ? 'p' : 'd';
  page.on('pageerror', (e) => { errors.push('pageerror ' + e.message); console.log('PAGEERROR', e.message, e.stack); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const G = (fn, a) => page.evaluate(fn, a);
  const wait = (ms = 140) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: `${OUT}/v6-${tag}-${n}.png` });
  const check = (ok, msg) => { if (!ok) { errors.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
  const click = async (sel) => { const l = page.locator(sel).locator('visible=true').first(); await l.scrollIntoViewIfNeeded().catch(() => {}); if (PHONE) await l.tap(); else await l.click(); await wait(); };
  const press = async (sel) => { if (PHONE && sel.startsWith('.bp-')) { await G(() => document.querySelector('.world-pop.open .wm-close')?.click()); await wait(60); } await click(sel); };
  const box = async () => page.locator('canvas.world-canvas').boundingBox();
  const loc = () => G(() => { const l = window.__CDMT__.state.locations[0]; return { w: l.lot.w, h: l.lot.h, n: l.lot.objects.length, tier: l.lot.landTier, theme: l.lot.theme }; });
  const obj = (id) => G((i) => { const o = window.__CDMT__.state.locations[0].lot.objects.find((x) => x.id === i); return o ? { ...o } : null; }, id);
  const cash = () => G(() => window.__CDMT__.state.cash);
  const panTo = (x, y) => G(([a, b]) => window.__CDMT_WORLD__.panTo(a, b), [x, y]);
  const scr = (x, y) => G(([a, b]) => window.__CDMT_WORLD__.toScreen(a, b), [x, y]);
  const tapAt = async (p) => { const b = await box(); if (PHONE) await page.touchscreen.tap(b.x + p.x, b.y + p.y); else await page.mouse.click(b.x + p.x, b.y + p.y); await wait(160); };
  const key = async (k) => { await page.keyboard.press(k); await wait(); };
  const drag = async (a, b) => {
    const bx = await box();
    const A = { x: bx.x + a.x, y: bx.y + a.y };
    const B = { x: bx.x + b.x, y: bx.y + b.y };
    if (!PHONE) {
      await page.mouse.move(A.x, A.y); await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) { await page.mouse.move(A.x + (B.x - A.x) * i / 8, A.y + (B.y - A.y) * i / 8); await wait(16); }
      await wait(60); await page.mouse.up();
    } else {
      const tp = (p) => [{ x: p.x, y: p.y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(A) });
      await wait(60);
      for (let i = 1; i <= 8; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp({ x: A.x + (B.x - A.x) * i / 8, y: A.y + (B.y - A.y) * i / 8 }) }); await wait(20); }
      await wait(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await wait(200);
  };
  const undoBtn = async () => { if (PHONE) await press('.bp-tool[data-bt=undo]'); else await key('Control+z'); await wait(); };
  const redoBtn = async () => { if (PHONE) await press('.bp-tool[data-bt=redo]'); else await key('Control+y'); await wait(); };
  const confirmModal = async () => { await page.locator('.modal-overlay .modal-footer .btn').last().click(); await wait(200); };

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await click('text=New game');
  await click('text=Open the dealership');
  await G(() => {
    const W = window.__CDMT__; const s = W.state;
    s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.cash += 900000; s.companyLevel = 3; W.engine.setSpeed(0);
    document.querySelector('.tutorial')?.remove();
    document.querySelectorAll('#notify-stack').forEach((m) => m.remove());
  });

  // ---------------------------------------------------------------- build
  await click('[data-action=build]');
  const modes = await G(() => [...document.querySelectorAll('.bp-mode')].map((b) => b.dataset.bt));
  check(['select', 'pick', 'bulldoze'].every((m) => modes.includes(m)) && modes.length === 3, `three build modes: ${modes.join(', ')}`);
  check(await G(() => document.body.classList.contains('mode-build') && document.body.dataset.mode === 'build'), 'build mode is its own UI state');
  if (PHONE) {
    const chrome = await G(() => ['.topbar', '.mobile-nav', '.world-actions', '.world-hud'].filter((q) => { const e = document.querySelector(q); return e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'; }));
    check(chrome.length === 0, `phone build mode hides the app chrome (${chrome.join(', ') || 'none visible'})`);
    check(await G(() => !!document.querySelector('.world-buildbar [data-bt=done]')?.getBoundingClientRect().height), 'build top bar with Done');
  }
  const filters = await G(() => [...document.querySelectorAll('.bp-filters .bp-chip')].map((b) => b.dataset.filter));
  check(['all', 'unlocked', 'cheap', 'expensive', 'small', 'large', 'showroom', 'workshop', 'service', 'customer', 'staff', 'parking', 'exterior', 'ev', 'technology', 'security', 'premium', 'decoration'].every((f) => filters.includes(f)), `build filters (${filters.length})`);

  // Place three plants on known tiles for the tests (the same call the palette makes).
  const plants = await G(() => {
    const W = window.__CDMT__; const s = W.state; const l = s.locations[0];
    const out = [];
    for (let i = 0; i < 3; i += 1) { const sp = W.lot.findSpot(s, l, 'plant'); const r = W.lot.placeObject(s, l, 'plant', sp.x, sp.y, 0); out.push(r.id); }
    return out;
  });
  await G(() => window.__CDMT__.app.refresh());

  // ---- bulldoze one object: confirm shows cost / refund / net, undo gives it back
  await press('.bp-mode[data-bt=bulldoze]');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'bulldoze', 'Bulldoze mode active');
  const p0 = await obj(plants[0]);
  const tp0 = await panTo(p0.x + 0.5, p0.y + 0.5);
  await tapAt(tp0);
  await page.waitForSelector('.modal-overlay [data-bz=table]', { timeout: 3000 }).catch(() => {});
  const bzText = await page.locator('.modal-overlay [data-bz=table]').innerText().catch(() => '');
  check(/Build cost/.test(bzText) && /Refund/.test(bzText) && /Net cost/.test(bzText), `"Bulldoze this plant?" shows ${bzText.replace(/\s+/g, ' ')}`);
  await shot('01-bulldoze-confirm');
  const c0 = await cash();
  await click('.modal-overlay [data-bz=confirm]');
  check(!(await obj(plants[0])), 'plant bulldozed');
  const refund = (await cash()) - c0;
  check(refund >= 120 * 0.5 - 1 && refund <= 120 * 0.7 + 1, `refund is 50–70% (€${refund} of €120)`);
  await undoBtn();
  check(!!(await obj(plants[0])) && (await cash()) === c0, 'undo brings the plant back and takes the refund back');
  await redoBtn();
  check(!(await obj(plants[0])), 'redo bulldozes it again');
  await undoBtn();

  // ---- safety: the only entrance is required
  const gate = await G(() => window.__CDMT__.state.locations[0].lot.objects.find((o) => o.defId === 'gate' || o.defId === 'grandgate'));
  if (gate) {
    await tapAt(await panTo(gate.x + 1.5, gate.y + 1));
    await page.waitForSelector('.modal-overlay', { timeout: 3000 }).catch(() => {});
    const req = await G(() => document.querySelector('.modal-overlay .bz-warn.required')?.textContent ?? '');
    check(/required/i.test(req), `bulldozing the only entrance warns: ${req.slice(0, 60)}`);
    await click('.modal-overlay [data-bz=cancel]');
    check(!!(await obj(gate.id)), 'cancel keeps the entrance');
  }

  // ---- area bulldoze
  await press('.bp-rm[data-rm=area]');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'area', 'Remove → Area');
  const pp = await Promise.all(plants.map(obj));
  const x0 = Math.min(...pp.map((p) => p.x)) - 0.4; const y0 = Math.min(...pp.map((p) => p.y)) - 0.4;
  const x1 = Math.max(...pp.map((p) => p.x)) + 1.4; const y1 = Math.max(...pp.map((p) => p.y)) + 1.4;
  await panTo((x0 + x1) / 2, (y0 + y1) / 2);
  const inArea = await G(([a, b, c, d]) => window.__CDMT__.build.objectsInRect(window.__CDMT__.state.locations[0].lot, Math.floor(a), Math.floor(b), Math.floor(c), Math.floor(d)).length, [x0, y0, x1, y1]);
  const nBefore = (await loc()).n;
  await drag(await scr(x0 + 0.2, y0 + 0.2), await scr(x1 - 0.2, y1 - 0.2));
  if (PHONE) await click('.world-confirm [data-cb=ok]');
  await page.waitForSelector('.modal-overlay [data-bz=table]', { timeout: 3000 }).catch(() => {});
  const areaTitle = await G(() => document.querySelector('.modal-overlay .modal-title, .modal-overlay h2, .modal-overlay .modal-head')?.textContent ?? '');
  check(/Bulldoze \d+ objects\?/.test(areaTitle), `area confirm: "${areaTitle.trim()}"`);
  await shot('02-area');
  await click('.modal-overlay [data-bz=confirm]');
  const nAfter = (await loc()).n;
  check(nBefore - nAfter === inArea && inArea >= 3, `area bulldoze removed ${nBefore - nAfter}/${inArea} objects`);
  await undoBtn();
  check((await loc()).n === nBefore, 'undo restores the whole area');

  // ---- move mode: pick up a plant and drop it elsewhere
  await press('.bp-mode[data-bt=pick]');
  const mp = await obj(plants[1]);
  const target = await G((id) => { const W = window.__CDMT__; const s = W.state; const l = s.locations[0]; const own = l.lot.objects.find((o) => o.id === id); for (let d = 3; d < 8; d += 1) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (W.lot.canPlace(s, l, 'plant', own.x + dx, own.y + dy, 0, id, true).ok) return { x: own.x + dx, y: own.y + dy }; return null; }, plants[1]);
  await tapAt(await panTo(mp.x + 0.5, mp.y + 0.5));
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'move', 'tapping in Move mode picks the plant up');
  if (target) {
    await tapAt(await scr(target.x + 0.5, target.y + 0.5));
    if (PHONE) await click('.world-confirm [data-cb=ok]');
    const moved = await obj(plants[1]);
    check(moved.x === target.x && moved.y === target.y, `plant moved to ${moved.x},${moved.y}`);
  }
  await press('.bp-mode[data-bt=select]');

  // ---- duplicate follows the cursor, Ctrl+D
  // (covered in build.cjs) — here: upgrade from the object card.
  const desk = await G(() => window.__CDMT__.state.locations[0].lot.objects.find((o) => ['salesdesk', 'receptiondesk', 'parking', 'coffee', 'sofa'].includes(o.defId)));
  if (desk) {
    await G((id) => window.__CDMT_WORLD__.select({ kind: 'object', id }), desk.id);
    await wait(200);
    await click('.world-pop.open .btn:has-text("Upgrade")');
    check((await obj(desk.id)).level === 2, `${desk.defId} upgraded to level 2 from its card`);
    const lv = await G(() => [...document.querySelectorAll('.world-pop.open .wm-lv.on')].length);
    check(lv === 2, 'card shows Lv 1–2 lit');
    await shot('03-upgrade');
    await G(() => document.querySelector('.world-pop.open .wm-close')?.click());
  }

  // ---- buy the locked land from the map, with undo
  const L0 = await loc();
  const np = await G(() => { const W = window.__CDMT__; return W.lot.nextPlot(W.state, W.state.locations[0]); });
  const dy = np.h - L0.h;
  await tapAt(await panTo(np.w / 2, -dy / 2));
  await page.waitForSelector('.modal-overlay .confirm-text', { timeout: 3000 }).catch(() => {});
  await shot('04-locked-land');
  await confirmModal();
  const L1 = await loc();
  check(L1.w === np.w && L1.h === np.h && L1.n === L0.n && L1.tier === L0.tier + 1, `land expanded ${L0.w}×${L0.h} → ${L1.w}×${L1.h}, all ${L1.n} objects kept`);
  await wait(500);
  await shot('05-expanded');
  await undoBtn();
  check((await loc()).w === L0.w, 'undo returns the land');
  await redoBtn();
  check((await loc()).w === np.w, 'redo buys it again');

  // ---- place a room template
  await press('.bp-tab[data-cat=templates]');
  await press('.bp-item[data-tpl=staffoffice]');
  const spot = await G(() => { const W = window.__CDMT__; const s = W.state; const l = s.locations[0]; for (let y = 0; y < l.lot.h; y += 1) for (let x = 0; x < l.lot.w; x += 1) if (W.build.stampCheck(s, l, 'staffoffice', x, y, 0).ok) return { x, y }; return null; });
  check(!!spot, 'a free spot for the staff office');
  if (spot) {
    const n0 = (await loc()).n;
    const p = await panTo(spot.x + 3.5, spot.y + 2.5);
    if (PHONE) { await tapAt(p); await click('.world-confirm [data-cb=ok]'); } else { const b = await box(); await page.mouse.move(b.x + p.x, b.y + p.y); await wait(80); await shot('06-template-ghost'); await page.mouse.click(b.x + p.x, b.y + p.y); await wait(200); }
    const complete = await G(() => window.__CDMT__.lot.roomsOf(window.__CDMT__.state.locations[0].lot).some((r) => r.code === 'o' && r.complete));
    check((await loc()).n > n0 + 4 && complete, 'staff office template placed as a working room');
  }

  // ---- create room
  await press('.bp-tab[data-cat=zones]');
  await press('.bp-card[data-room=create]');
  const free = await G(() => { const W = window.__CDMT__; const s = W.state; const l = s.locations[0]; const occ = W.lot.occupancy(l.lot); for (let y = 1; y < l.lot.h - 8; y += 1) for (let x = 1; x < l.lot.w - 8; x += 1) { let ok = true; for (let yy = y; yy < y + 5 && ok; yy += 1) for (let xx = x; xx < x + 6 && ok; xx += 1) { const z = W.lot.zoneAt(l.lot, xx, yy); if (!['.', 'g'].includes(z) || occ.any[yy * l.lot.w + xx]) ok = false; } if (ok) return { x, y }; } return null; });
  if (free) {
    await panTo(free.x + 3, free.y + 2.5);
    await drag(await scr(free.x + 0.5, free.y + 0.5), await scr(free.x + 5.5, free.y + 4.5));
    await click('.world-confirm [data-roomtype=k]');
    const room = await G(([x, y]) => window.__CDMT__.lot.roomsOf(window.__CDMT__.state.locations[0].lot).find((r) => r.code === 'k' && r.x0 === x && r.y0 === y), [free.x, free.y]);
    check(room && room.doors >= 1, `created a staff room ${room ? `${room.x1 - room.x0 + 1}×${room.y1 - room.y0 + 1}` : ''} with a door`);
  } else check(false, 'no free land for create room');

  // ---- dealership style
  await press('.bp-tab[data-cat=style]');
  await press('.bp-item[data-dstyle=industrial]');
  await confirmModal();
  check((await loc()).theme === 'industrial', 'Industrial style applied');
  await press('.bp-tab[data-cat=testdrive]');
  const routes = await G(() => document.querySelectorAll('.bp-card .bp-row').length);
  check(routes >= 6, `test-drive tab lists ${routes} routes`);
  await shot('07-palette');
  await click('[data-bt=done]');

  // ---------------------------------------------------------- test drive
  const car = await G(() => window.__CDMT__.state.vehicles.find((v) => v.status === 'yard' || v.status === 'listed'));
  await G((id) => window.__CDMT_WORLD__.select({ kind: 'vehicle', id }), car.id);
  await wait(250);
  await click('.world-pop.open .btn:has-text("Test drive")');
  check(await page.locator('.drive-overlay .dv-pick').count() === 1, 'route picker opens');
  const pickText = await page.locator('.dv-pick').innerText();
  check(pickText.toLowerCase().includes(car.model.toLowerCase()) && /acceleration/i.test(pickText), 'the right car is loaded with its handling');
  await shot('08-drive-pick');
  const cashDrive = await cash();
  await click('[data-dv=start]');
  await G(() => window.__CDMT_DRIVE__.skipCountdown());
  await wait(300);
  check(await G(() => window.__CDMT__.engine.hold), 'the dealership is paused during the drive');
  const s0 = await G(() => window.__CDMT_DRIVE__.state());
  if (!PHONE) {
    await page.keyboard.down('w'); await wait(1600); await page.keyboard.up('w');
    const s1 = await G(() => window.__CDMT_DRIVE__.state());
    check(s1.speed > 12, `W accelerates (${Math.round(s1.speed)} km/h)`);
    await page.keyboard.down('d'); await wait(500); await page.keyboard.up('d');
    const s2 = await G(() => window.__CDMT_DRIVE__.state());
    check(Math.abs(s2.a - s1.a) > 0.05, 'D steers');
    await page.keyboard.down('s'); await wait(900); await page.keyboard.up('s');
    const s3 = await G(() => window.__CDMT_DRIVE__.state());
    check(s3.speed < s2.speed - 5, `S brakes (${Math.round(s2.speed)} → ${Math.round(s3.speed)} km/h)`);
    await key('r');
    const s4 = await G(() => window.__CDMT_DRIVE__.state());
    check(Math.abs(s4.speed) < 1, 'R resets the car onto the route');
  } else {
    check(await page.locator('.dv-controls').isVisible(), 'touch controls shown (steering + GAS/BRAKE)');
    const gb = await page.locator('.dv-pedal.gas').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2, id: 3 }] });
    await wait(1600);
    const s1 = await G(() => window.__CDMT_DRIVE__.state());
    const st = await page.locator('.dv-stick-base').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2, id: 3 }, { x: st.x + st.width / 2, y: st.y + st.height / 2, id: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2, id: 3 }, { x: st.x + st.width / 2 + 50, y: st.y + st.height / 2, id: 4 }] });
    await wait(500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(100);
    const s2 = await G(() => window.__CDMT_DRIVE__.state());
    check(s1.speed > 15, `GAS accelerates (${Math.round(s1.speed)} km/h)`);
    check(Math.abs(s2.a - s1.a) > 0.05, 'the steering stick turns the car (two thumbs at once)');
  }
  await shot('09-driving');
  const hud = await G(() => document.querySelector('.dv-hud')?.innerText ?? '');
  check(/TEST DRIVE/i.test(hud) && /Speed/i.test(hud) && /Distance/i.test(hud) && /Checkpoint/i.test(hud), 'HUD: time, speed, distance, checkpoint');
  await G(() => window.__CDMT_DRIVE__.simulate(200));
  await wait(400);
  const fin = await G(() => window.__CDMT_DRIVE__ ? window.__CDMT_DRIVE__.state() : null);
  const res = await page.locator('[data-dv=result]').innerText().catch(() => '');
  if (!/COMPLETE/i.test(res)) console.log('   result text:', res.replace(/\s+/g, ' '));
  check(/TEST DRIVE COMPLETE/i.test(res) && /★/.test(res) && /Smoothness/i.test(res) && /Top speed/i.test(res), 'finish → result: complete, stars, smoothness, top speed');
  check(!fin || fin.next >= 3, 'all checkpoints were hit');
  await shot('10-result');
  check((await cash()) === cashDrive - (car.fuel === 'Electric' ? 8 : 15), 'fuel cost booked once');
  check(await G(() => (window.__CDMT__.state.stats.playerDrives ?? 0) === 1), 'drive counted');
  const cond = await G((id) => window.__CDMT__.state.vehicles.find((v) => v.id === id).condition, car.id);
  check(cond === car.condition, 'real condition untouched by the drive');
  await click('[data-dv=back]');
  check(await page.locator('.drive-overlay').count() === 0 && !(await G(() => window.__CDMT__.engine.hold)), 'BACK returns to the dealership, game unpaused');
  check(await page.locator('canvas.world-canvas').count() === 1, 'dealership still drawn after the drive');

  // ---- an offer: test drive, Esc to stop, then BUY CAR
  await G(() => { document.querySelectorAll('.modal-overlay, #notify-stack').forEach((m) => m.remove()); window.__CDMT__.app.go('inventory', { tab: 'buy' }); });
  await wait(300);
  if (!PHONE) {
    const offerId = await G(() => { const W = window.__CDMT__; const o = W.state.offers.find((x) => !x.auction && x.offerPrice < W.state.cash - 10000); return o?.id; });
    await G((id) => { const b = document.querySelector(`[data-drive="${id}"]`); if (b) b.click(); }, offerId);
    await wait(200);
    if (await page.locator('[data-dv=start]').count()) {
      await click('[data-dv=start]');
      await G(() => window.__CDMT_DRIVE__.skipCountdown());
      await wait(300);
      await key('Escape');
      const stopped = await page.locator('[data-dv=result]').innerText().catch(() => '');
      check(/STOPPED/i.test(stopped), 'Esc stops the drive and shows the result');
      const had = await G(() => window.__CDMT__.state.vehicles.length);
      await click('[data-dv=buy]');
      check((await G(() => window.__CDMT__.state.vehicles.length)) === had + 1 && !(await G((id) => window.__CDMT__.state.offers.some((o) => o.id === id), offerId)), 'BUY CAR after the test drive buys it');
    } else check(false, 'offer test-drive button did nothing');
  }

  // ---- a customer: drive them yourself → purchase confidence changes
  await G(() => window.__CDMT__.app.go('dealership', {}));
  await wait(300);
  const cust = await G(() => {
    const W = window.__CDMT__;
    for (let i = 0; i < 40; i += 1) { const c = W.state.customers.find((x) => x.status === 'waiting' && !x.testDrive); if (c) return c.id; W.engine.stepHour(); }
    return null;
  });
  if (cust) {
    await G((id) => window.__CDMT_WORLD__.select({ kind: 'agent', id: `c:${id}` }), cust);
    await wait(250);
    await click('.world-pop.open .btn:has-text("Test drive")');
    await click('.modal-overlay [data-act=drive-self]');
    await click('[data-dv=start]');
    await G(() => window.__CDMT_DRIVE__.skipCountdown());
    await G(() => window.__CDMT_DRIVE__.simulate(200));
    await wait(400);
    const cr = await page.locator('[data-dv=result]').innerText().catch(() => '');
    check(/Purchase confidence/i.test(cr) && /%/.test(cr), 'customer drive shows purchase confidence before → after');
    check(await G((id) => !!window.__CDMT__.state.customers.find((c) => c.id === id)?.testDrive, cust), 'the customer counts as test-driven');
    await shot('11-customer-result');
    await click('[data-dv=back]');
  } else console.log('  • no customer came in (skipped customer drive)');

  // ---- save / load keeps everything
  await G(() => window.__CDMT__.save());
  const before = await loc();
  await page.reload();
  await wait(400);
  await click('text=Continue').catch(() => {});
  await wait(400);
  const after = await loc().catch(() => null);
  check(after && after.w === before.w && after.n === before.n && after.theme === before.theme, 'save / load keeps land, objects and style');

  const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::/.test(e));
  if (real.length) { console.error('FLOWS6 FAILED'); for (const e of real) console.error(' -', e); await browser.close(); process.exit(1); }
  console.log(`flows6 ok (${PHONE ? 'phone' : 'desktop'})`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
