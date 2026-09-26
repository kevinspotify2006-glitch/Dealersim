// Build Mode 2.0 through the real UI (desktop mouse + keyboard, or phone touch):
// the rooms overview, tapping a room on the map, only that room's categories
// and items, placing / rotating / cancelling, money, "belongs in" refusals,
// the workshop and the outdoor menus (parking, roads), moving and removing a
// placed item, and save/reload.
// Usage: node tools/qa/rooms.cjs [outDir] [phone]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

(async () => {
  const browser = await chromium.launch();
  const bctx = await browser.newContext(PHONE ? { viewport: { width: 412, height: 891 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await bctx.newPage();
  const errors = [];
  let fails = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) fails += 1; };
  const G = (fn, a) => page.evaluate(fn, a);
  const wait = (ms = 220) => page.waitForTimeout(ms);
  const tap = async (sel) => { const l = page.locator(sel).locator('visible=true').first(); if (PHONE) await l.tap(); else await l.click(); await wait(); };
  const visible = (sel) => page.locator(sel).locator('visible=true').count().then((n) => n > 0);
  const shot = (n) => page.screenshot({ path: `${OUT}/rooms-${PHONE ? 'p' : 'd'}-${n}.png` });
  const box = () => page.locator('canvas.world-canvas').boundingBox();
  const tapWorld = async (x, y) => {
    const p = await G(([a, b]) => window.__CDMT_WORLD__.panTo(a, b), [x, y]);
    const b = await box();
    if (PHONE) await page.touchscreen.tap(b.x + p.x, b.y + p.y); else await page.mouse.click(b.x + p.x, b.y + p.y);
    await wait(500);
  };
  const objs = () => G(() => window.__CDMT__.state.locations[0].lot.objects.length);
  const cash = () => G(() => window.__CDMT__.state.cash);
  const cardIds = () => G(() => [...document.querySelectorAll('.br-tray .br-card')].map((c) => c.dataset.obj ?? `zone:${c.dataset.zone}`));
  const catIds = () => G(() => [...document.querySelectorAll('.br-cats .br-cat')].map((c) => c.dataset.rcat));
  const allItems = async () => {
    const out = [];
    for (const c of await catIds()) { await G((id) => document.querySelector(`.br-cat[data-rcat="${id}"]`).click(), c); await wait(80); out.push(...await cardIds()); }
    return out;
  };
  /** Place the current preview: the Place button on a phone; on desktop aim with the mouse and press Enter. */
  const placeNow = async (x, y) => {
    if (PHONE) { await tap('.world-confirm [data-cb=ok]'); return; }
    const p = await G(([a, b]) => window.__CDMT_WORLD__.toScreen(a, b), [x, y]);
    const b = await box();
    await page.mouse.move(b.x + p.x, b.y + p.y);
    await wait(150);
    await page.keyboard.press('Enter');
    await wait(200);
  };

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await tap('text=New game');
  await tap('text=Open the dealership');
  await wait(500);
  await G(() => { const W = window.__CDMT__; const s = W.state; s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.cash += 300000; s.companyLevel = 3; W.engine.setSpeed(0); document.querySelector('.tutorial')?.remove(); document.querySelectorAll('#notify-stack').forEach((m) => m.remove()); });

  // ---- open Build: the rooms overview, not a catalogue
  await tap('[data-action=build]');
  check(await visible('.br-rooms .br-room[data-ctx=showroom]') && !(await visible('.bp-tab')), 'Build opens on the rooms overview');
  await shot('01-rooms');

  // ---- tap the reception on the map: its menu, only customer-area things
  const rec = await G(() => { const r = window.__CDMT__.lot.roomsOf(window.__CDMT__.state.locations[0].lot).find((x) => x.code === 'r'); return r && { x: r.cx, y: r.cy }; });
  check(!!rec, 'the starter lot has a reception');
  await tapWorld(rec.x, rec.y);
  check(await G(() => document.querySelector('.br-room-view')?.classList.contains('room-customer')), 'tapping the reception floor opens the customer-area menu');
  const cats = await catIds();
  check(['seating', 'coffee', 'entertainment', 'decoration', 'lighting'].every((c) => cats.includes(c)) && !cats.includes('lifts') && !cats.includes('parking'), `customer-area categories: ${cats.join(', ')}`);
  const custItems = await allItems();
  check(custItems.includes('coffee') && custItems.includes('sofa') && !custItems.includes('lift') && !custItems.includes('charger') && !custItems.includes('workbench'), `customer area offers ${custItems.length} relevant items, no workshop/outdoor items`);
  check(await G(() => !!window.__CDMT_WORLD__.ui().build), 'still in Build mode');

  // ---- place a coffee machine in the reception: money, count, preview in the room
  await tap('.br-cat[data-rcat=coffee]');
  await shot('02-coffee');
  const c0 = await cash();
  const n0 = await objs();
  await tap('.br-card[data-obj=coffee]');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'place', 'choosing a card starts placing');
  // Rotate is there and works.
  if (PHONE) { await tap('.world-confirm [data-cb=rotate]'); await tap('.world-confirm [data-cb=rotate]'); } else { await page.keyboard.press('r'); await page.keyboard.press('r'); }
  check((await G(() => window.__CDMT_WORLD__.ui().rot)) === 0, 'rotate turns the preview (twice = back)');
  const free = await G(() => { const W = window.__CDMT__; const l = W.state.locations[0]; const r = W.lot.roomsOf(l.lot).find((x) => x.code === 'r'); for (let y = r.y0; y <= r.y1; y += 1) for (let x = r.x0; x <= r.x1; x += 1) if (W.lot.canPlace(W.state, l, 'coffee', x, y, 0, undefined, true).ok) return { x, y }; return null; });
  if (!PHONE) check(await visible('.world-detail.open .wd-price'), 'desktop: the details panel shows the item while placing');
  await shot('03-placing');
  await placeNow(free.x + 0.5, free.y + 0.5);
  check((await objs()) === n0 + 1, 'the coffee machine is built');
  check(Math.round(c0 - (await cash())) === 900, `€900 was paid (${Math.round(c0 - (await cash()))})`);
  const placed = await G(() => { const o = window.__CDMT__.state.locations[0].lot.objects; return o[o.length - 1]; });
  check(placed.defId === 'coffee', 'the new object is a coffee machine');
  // Cancel returns to the room menu, which stayed open.
  await tap('.world-confirm [data-cb=stop]');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'select' && await visible('.br-room-view'), 'Cancel/Done returns to the room menu');

  // ---- wrong room: a lift cannot go in the reception
  const why = await G(() => { const W = window.__CDMT__; const l = W.state.locations[0]; const r = W.lot.roomsOf(l.lot).find((x) => x.code === 'r'); return W.lot.canPlace(W.state, l, 'lift', r.x0, r.y0, 0, undefined, true).reason; });
  check(/belongs in/i.test(why ?? ''), `a lift is refused in the reception: "${why}"`);

  // ---- a room that does not exist yet
  await tap('.br-back');
  await tap('.br-room[data-ctx=workshop]');
  check(await visible('[data-ctx=create]'), 'no workshop yet: the menu offers to create one');

  // ---- build a workshop; its menu shows lifts and tools, not sofas
  await G(() => { const W = window.__CDMT__; const s = W.state; const l = s.locations[0]; for (let y = 0; y < l.lot.h - 6; y += 1) for (let x = 0; x < l.lot.w - 7; x += 1) { let ok = true; for (let yy = y; yy < y + 6 && ok; yy += 1) for (let xx = x; xx < x + 7 && ok; xx += 1) { const z = W.lot.zoneAt(l.lot, xx, yy); if (!['.', 'g', 'a'].includes(z) || l.lot.objects.some((o) => { const f = W.lot.footprint(o); return xx >= f.x && xx < f.x + f.w && yy >= f.y && yy < f.y + f.h; })) ok = false; } if (ok) { W.build.createRoom(s, l, x, y, x + 6, y + 5, 'w'); W.app.refresh(); return; } } });
  await wait(300);
  await tap('.br-back');
  await tap('.br-room[data-ctx=workshop]');
  const wcats = await catIds();
  check(['benches', 'lifts', 'tools', 'tyres', 'parts', 'safety'].every((c) => wcats.includes(c)), `workshop categories: ${wcats.join(', ')}`);
  const wItems = await allItems();
  check(wItems.includes('lift') && wItems.includes('workbench') && !wItems.includes('sofa') && !wItems.includes('receptiondesk') && !wItems.includes('charger'), 'the workshop only offers workshop items');
  await tap('.br-cat[data-rcat=lifts]');
  const nl = await objs();
  await tap('.br-card[data-obj=lift]');
  if (!PHONE) {
    const fl = await G(() => { const W = window.__CDMT__; const l = W.state.locations[0]; const r = W.lot.roomsOf(l.lot).find((x) => x.code === 'w'); for (let y = r.y0; y <= r.y1; y += 1) for (let x = r.x0; x <= r.x1; x += 1) for (const rot of [0, 1]) if (W.lot.canPlace(W.state, l, 'lift', x, y, rot, undefined, true).ok) return { x, y, rot }; return null; });
    if (fl?.rot) await page.keyboard.press('r');
    const d = await G(() => window.__CDMT__.objects.lift);
    await placeNow(fl.x + (fl.rot ? d.h : d.w) / 2, fl.y + (fl.rot ? d.w : d.h) / 2);
  } else await placeNow();
  check((await objs()) === nl + 1, 'a lift is built in the new workshop');
  await tap('.world-confirm [data-cb=stop]');

  // ---- outdoor: parking and roads
  await tap('.br-back');
  await tap('.br-room[data-ctx=outdoor]');
  const oItems = await allItems();
  check(oItems.includes('parking') && oItems.includes('evparking') && oItems.includes('charger') && oItems.includes('tree') && oItems.includes('zone:j') && !oItems.includes('sofa') && !oItems.includes('lift'), 'outdoor offers parking, charging, greenery and roads only');
  await tap('.br-cat[data-rcat=roads]');
  await tap('.br-card[data-zone=j]');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'paint', 'a road is drawn with the paint tool');
  await tap('.world-confirm [data-cb=stop]');
  await tap('.br-cat[data-rcat=parking]');
  const np = await objs();
  await tap('.br-card[data-obj=parking]');
  if (!PHONE) {
    const fp = await G(() => { const W = window.__CDMT__; const sp = W.lot.findSpot(W.state, W.state.locations[0], 'parking'); return sp; });
    if (fp.rot) await page.keyboard.press('r');
    const d = await G(() => window.__CDMT__.objects.parking);
    await placeNow(fp.x + (fp.rot ? d.h : d.w) / 2, fp.y + (fp.rot ? d.w : d.h) / 2);
  } else await placeNow();
  check((await objs()) === np + 1, 'a parking space is built outside');
  await tap('.world-confirm [data-cb=stop]');
  await shot('04-outdoor');

  // ---- move and remove the coffee machine from its card
  await G((id) => window.__CDMT_WORLD__.select({ kind: 'object', id }), placed.id);
  await wait(200);
  await tap('.world-pop.open .btn:has-text("Move")');
  check((await G(() => window.__CDMT_WORLD__.ui().tool)) === 'move', 'Move picks the object up again');
  if (PHONE) await tap('.world-confirm [data-cb=stop]'); else await page.keyboard.press('Escape');
  await wait(200);
  await G((id) => window.__CDMT_WORLD__.select({ kind: 'object', id }), placed.id);
  await wait(200);
  await tap('.world-pop.open .btn:has-text("Bulldoze")');
  await page.waitForSelector('.modal-overlay [data-bz=confirm]', { timeout: 3000 }).catch(() => {});
  await tap('.modal-overlay [data-bz=confirm]');
  check(!(await G((id) => window.__CDMT__.state.locations[0].lot.objects.some((o) => o.id === id), placed.id)), 'the coffee machine is removed (with a refund dialog)');

  // ---- no sideways scroll; save and reload keep the build
  check(!(await G(() => document.scrollingElement.scrollWidth > window.innerWidth + 1)), 'nothing scrolls sideways');
  await tap('[data-bt=done]');
  await G(() => window.__CDMT__.save());
  const before = await objs();
  await page.reload();
  await wait(400);
  await tap('text=Continue').catch(() => {});
  await wait(400);
  check((await objs()) === before, 'save / reload keeps everything that was built');

  const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|net::/.test(e));
  if (real.length) { console.log('ERRORS:', real.join(' | ')); fails += 1; }
  await browser.close();
  if (fails) { console.log(`rooms QA FAILED (${fails})`); process.exit(1); }
  console.log(`rooms ok (${PHONE ? 'phone' : 'desktop'})`);
})().catch((e) => { console.error(e); process.exit(1); });
