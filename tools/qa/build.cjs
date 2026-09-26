// Build-mode QA through the real UI: search, filters, place, drag-move, rotate,
// duplicate, copy/paste, delete, undo/redo, wall lines, per-room styles,
// dragging cars onto spaces and open floor (with rotation), invalid drops,
// hover tooltips, the model browser, and save/reload of the whole layout.
// Usage: node tools/qa/build.cjs [outDir] [phone]
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
  const bctx = await browser.newContext(vp);
  const page = await bctx.newPage();
  const cdp = PHONE ? await bctx.newCDPSession(page) : null;
  const errors = [];
  let fails = 0;
  const fail = async (m) => { errors.push(m); fails += 1; const t = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' | ') + ' // tool=' + JSON.stringify(window.__CDMT_WORLD__?.ui())).catch(() => ''); console.log('  ✗', m, '\n     ', t); await page.screenshot({ path: `${OUT}/build-${PHONE ? 'p' : 'd'}-fail-${fails}.png` }).catch(() => {}); };
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  const tag = PHONE ? 'p' : 'd';
  const shot = (n) => page.screenshot({ path: `${OUT}/build-${tag}-${n}.png` });
  const press = async (sel) => { if (PHONE && sel.startsWith('.bp-')) { await page.evaluate(() => document.querySelector('.world-pop.open .wm-close')?.click()); await page.waitForTimeout(60); } const l = page.locator(sel).locator('visible=true').first(); return PHONE ? l.tap() : l.click(); };
  const G = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms = 120) => page.waitForTimeout(ms);
  const box = async () => page.locator('canvas.world-canvas').boundingBox();
  const objs = () => G(() => window.__CDMT__.state.locations[0].lot.objects.length);
  const obj = (id) => G((i) => { const o = window.__CDMT__.state.locations[0].lot.objects.find((x) => x.id === i); return o ? { ...o } : null; }, id);
  const scr = (wx, wy) => G(([x, y]) => window.__CDMT_WORLD__.toScreen(x, y), [wx, wy]);

  /** Presses at `a`, drags to `b`, lets go — with the mouse or a finger. */
  const drag = async (a, b, mid) => {
    const bx = await box();
    const A = { x: bx.x + a.x, y: bx.y + a.y };
    const B = { x: bx.x + b.x, y: bx.y + b.y };
    if (!PHONE) {
      await page.mouse.move(A.x, A.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) { await page.mouse.move(A.x + (B.x - A.x) * i / 8, A.y + (B.y - A.y) * i / 8); await wait(16); if (i === 4 && mid) await mid(); }
      await wait(60);
      await page.mouse.up();
    } else {
      const tp = (p) => [{ x: p.x, y: p.y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(A) });
      await wait(60);
      for (let i = 1; i <= 8; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp({ x: A.x + (B.x - A.x) * i / 8, y: A.y + (B.y - A.y) * i / 8 }) }); await wait(20); if (i === 4 && mid) await mid(); }
      await wait(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await wait(180);
  };
  /** Long-press with a finger, then drag (phones pick up cars this way). */
  const longDrag = async (a, b) => {
    const bx = await box();
    const A = { x: bx.x + a.x, y: bx.y + a.y };
    const B = { x: bx.x + b.x, y: bx.y + b.y };
    const tp = (p) => [{ x: p.x, y: p.y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(A) });
    await wait(650);
    for (let i = 1; i <= 8; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp({ x: A.x + (B.x - A.x) * i / 8, y: A.y + (B.y - A.y) * i / 8 }) }); await wait(20); }
    await wait(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(180);
  };
  const tapAt = async (p) => { await G(() => document.querySelector('.world-pop.open .wm-close')?.click()); await wait(60); const b = await box(); if (PHONE) await page.touchscreen.tap(b.x + p.x, b.y + p.y); else await page.mouse.click(b.x + p.x, b.y + p.y); await wait(160); };
  const clearToasts = () => G(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const rclick = async () => { const b = await box(); await page.mouse.click(b.x + b.width - 30, b.y + b.height / 2, { button: 'right' }); await wait(120); };
  const key = async (k) => { await page.keyboard.press(k); await wait(140); };

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await press('text=New game');
  await press('text=Open the dealership');
  await G(() => { const s = window.__CDMT__.state; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; s.tutorial.dismissed = true; s.cash += 250000; s.companyLevel = 3; window.__CDMT__.engine.setSpeed(0); });
  await G(() => document.querySelector('.tutorial')?.remove());

  // ---- open build mode
  await press('.wa-item[data-action=build]');
  await page.waitForSelector('.world.building .world-palette');
  if (!(await G(() => window.__CDMT_WORLD__.ui().build))) fail('build mode did not open');
  await G(() => { document.querySelector('.world-zoom .icon-btn:last-child')?.click(); });
  await wait();

  // ---- search
  const search = async (q) => {
    await page.fill('.bp-search-input', q);
    await wait(120);
    return G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj));
  };
  if (PHONE) await press('.bp-sbtn');
  const deskHits = await search('desk');
  if (!deskHits.includes('salesdesk') || !deskHits.includes('premiumdesk') || deskHits.includes('parking')) fail(`search "desk" wrong: ${deskHits.join(',')}`);
  const parkHits = await search('parking');
  if (!parkHits.includes('parking') || !parkHits.includes('evparking') || parkHits.includes('plant')) fail(`search "parking" wrong: ${parkHits.join(',')}`);
  const lightHits = await search('light');
  if (!lightHits.some((x) => /spot|light|lamp|pendant|led|flood/.test(x))) fail(`search "light" found no lights: ${lightHits.join(',')}`);
  const evHits = await search('EV');
  if (!evHits.includes('evdisplay') || !evHits.includes('evparking')) fail(`search "EV" wrong: ${evHits.join(',')}`);
  log('search desk/parking/light/EV →', deskHits.length, parkHits.length, lightHits.length, evHits.length);
  await shot('01-search');
  await search('');
  if (PHONE) await press('.bp-sclose');

  // ---- filters and categories
  const countItems = () => G(() => document.querySelectorAll('.bp-body .bp-item[data-obj]').length);
  // Grid / Snap: palette toolbar on desktop, the ⋯ options sheet on a phone.
  const toggleOpt = async (id) => {
    if (!PHONE) { await press(`.bp-tool[data-bt=${id}]`); return; }
    await press('.world-buildbar [data-bt=more]');
    await wait(250);
    await press(`.build-more .tgl[data-bt=${id}]`);
    await press('.build-more .modal-head .icon-btn');
    await wait(200);
  };
  // Desktop: the filter chips. Phone: the filter sheet (price / availability, Reset for all).
  const filterTo = async (f) => {
    if (!PHONE) { await press(`.bp-chip[data-filter=${f}]`); return; }
    await press('.bp-catbar .bp-fbtn');
    await wait(250);
    if (f === 'all') await press('[data-act=reset-filters]');
    else { await press(f === 'cheap' ? '[data-adv="price:cheap"]' : f === 'unlocked' ? '[data-adv="avail:unlocked"]' : `.filter-sheet .bp-chip[data-filter=${f}]`); await press('[data-act=apply-filters]'); }
    await wait(250);
  };
  await press('.bp-tab[data-cat=all]');
  const all = await countItems();
  await filterTo('cheap');
  const cheap = await countItems();
  const cheapCosts = await G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj));
  const tooDear = await G((ids) => ids.filter((id) => (window.__CDMT__.objects[id]?.cost ?? 0) > 500), cheapCosts);
  await filterTo('all');
  await press('.bp-tab[data-cat=security]');
  const sec = await G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj));
  await filterTo('unlocked');
  const unl = await G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj));
  await filterTo('all');
  log('filters: all', all, 'cheap', cheap, 'security', sec.length);
  if (!(cheap > 0 && cheap < all)) fail(`cheap filter did not narrow (${cheap}/${all})`);
  if (tooDear.length) fail('cheap filter shows expensive items: ' + tooDear.join(','));
  if (!sec.includes('camera') || sec.includes('plant')) fail('security filter wrong: ' + sec.join(','));
  for (const cat of ['structure', 'showroom', 'vehicles', 'customers', 'staff', 'service', 'finance', 'marketing', 'storage', 'decoration', 'exterior', 'parking', 'ev', 'technology', 'security', 'premium']) {
    await press(`.bp-tab[data-cat=${cat}]`);
    const n = await countItems();
    if (!n) fail(`category ${cat} is empty`);
  }

  // ---- place a plant from the palette
  await press('.bp-tab[data-cat=decoration]');
  await press('.bp-item[data-obj=plant]');
  const spot = await G(() => { const W = window.__CDMT__; const loc = W.state.locations[0]; return W.lot.findSpot(W.state, loc, 'plant'); });
  const before = await objs();
  const spotScr = await scr(spot.x + 0.5, spot.y + 0.5);
  if (PHONE) { await tapAt(spotScr); await press('.world-confirm .btn.primary'); } else {
    const b = await box();
    await page.mouse.move(b.x + spotScr.x, b.y + spotScr.y);
    await wait(100);
    await shot('02-ghost');
    await page.mouse.click(b.x + spotScr.x, b.y + spotScr.y);
  }
  await wait(150);
  if ((await objs()) !== before + 1) fail('placing a plant failed');
  const plantId = await G(() => { const o = window.__CDMT__.state.locations[0].lot.objects; return o[o.length - 1].id; });
  if (PHONE) await press('.world-confirm [data-cb=stop]'); else await rclick();
  await wait();
  if ((await G(() => window.__CDMT_WORLD__.ui().tool)) !== 'select') fail('tool did not return to select');

  // ---- hover tooltip (desktop)
  if (!PHONE) {
    const b = await box();
    const p = await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId);
    await page.mouse.move(b.x + p.x + 1, b.y + p.y + 1);
    await page.mouse.move(b.x + p.x, b.y + p.y);
    await wait(700);
    const tip = await G(() => document.querySelector('.tooltip.rich.show')?.textContent ?? '');
    if (!/PLANT/.test(tip) || !/Cost/.test(tip)) fail('hover tooltip missing: ' + tip.slice(0, 80));
    await shot('03-tooltip');
    // palette tooltip
    await page.hover('.bp-item[data-obj=plant]');
    await wait(700);
    const ptip = await G(() => document.querySelector('.tooltip.show')?.textContent ?? '');
    if (!/Effects/.test(ptip)) fail('palette tooltip missing effects: ' + ptip.slice(0, 80));
    await page.mouse.move(b.x + 5, b.y + b.height - 5);
    await wait(150);
  }

  // ---- select → info card
  await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId));
  const card = await G(() => document.querySelector('.world-pop.open')?.textContent ?? '');
  if (!/Selected: Plant/.test(card) || !/Position/.test(card) || !/Rotation/.test(card)) fail('selection card incomplete: ' + card.slice(0, 120));
  const selected = await G(() => window.__CDMT_WORLD__.ui().selected);
  if (!selected || selected.id !== plantId) fail('plant not selected');
  await shot('04-selected');

  // ---- drag-move the plant
  const target = await G((id) => { const W = window.__CDMT__; const loc = W.state.locations[0]; const own = loc.lot.objects.find((o) => o.id === id); for (let dy = -6; dy <= 6; dy += 1) for (let dx = -6; dx <= 6; dx += 1) { if (Math.abs(dx) + Math.abs(dy) < 3) continue; if (W.lot.canPlace(W.state, loc, 'plant', own.x + dx, own.y + dy, 0, id).ok) return { x: own.x + dx, y: own.y + dy }; } return null; }, plantId);
  if (!target) fail('no free spot to move the plant to');
  else {
    const from = await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId);
    await drag(from, await scr(target.x + 0.5, target.y + 0.5));
    const moved = await obj(plantId);
    log('drag plant →', moved.x, moved.y, 'target', target.x, target.y);
    if (moved.x !== target.x || moved.y !== target.y) fail(`drag-move ended at ${moved.x},${moved.y} not ${target.x},${target.y}`);
  }

  // ---- undo / redo the move
  if (PHONE) await press('.bp-tool[data-bt=undo]'); else await key('Control+z');
  let o = await obj(plantId);
  if (o.x === target.x && o.y === target.y) fail('undo did not move the plant back');
  if (PHONE) await press('.bp-tool[data-bt=redo]'); else await key('Control+y');
  o = await obj(plantId);
  if (o.x !== target.x || o.y !== target.y) fail('redo did not redo the move');

  // ---- place a sales desk (non-square) and rotate it
  await press('.bp-tab[data-cat=showroom]');
  await press('.bp-item[data-obj=salesdesk]');
  const ds = await G(() => { const W = window.__CDMT__; return W.lot.findSpot(W.state, W.state.locations[0], 'salesdesk'); });
  if (ds.rot) await (PHONE ? press('.world-confirm [data-cb=rotate]') : key('r'));
  const dsScr = await scr(ds.x + (ds.rot ? 1 : 1), ds.y + 1);
  if (PHONE) { await tapAt(dsScr); await press('.world-confirm .btn.primary'); await press('.world-confirm [data-cb=stop]'); } else { await tapAt(dsScr); await rclick(); }
  await wait();
  const deskId = await G(() => { const o = window.__CDMT__.state.locations[0].lot.objects.filter((x) => x.defId === 'salesdesk'); return o[o.length - 1]?.id; });
  // Make it rotatable: 2×2 is square, so use the finance desk? salesdesk is 2x2 → use a bench line instead.
  await press('.bp-tab[data-cat=customers]');
  const rotDef = 'waitingbench';
  const hasBench = await G((d) => !!document.querySelector(`.bp-item[data-obj=${d}]`), rotDef);
  let rotId = null;
  if (hasBench) {
    await press(`.bp-item[data-obj=${rotDef}]`);
    const bs = await G((d) => { const W = window.__CDMT__; return W.lot.findSpot(W.state, W.state.locations[0], d); }, rotDef);
    if (bs.rot) await (PHONE ? press('.world-confirm [data-cb=rotate]') : key('r'));
    const def = await G((d) => { const o = window.__CDMT__.state.locations[0].lot.objects; return null; }, rotDef);
    const size = await G((d) => { const W = window.__CDMT__; const f = W.lot.footprint({ id: 'x', defId: d, x: 0, y: 0, rot: 0 }); return f; }, rotDef);
    const w = bs.rot ? size.h : size.w; const hh = bs.rot ? size.w : size.h;
    await tapAt(await scr(bs.x + w / 2, bs.y + hh / 2));
    if (PHONE) { await press('.world-confirm .btn.primary'); await press('.world-confirm [data-cb=stop]'); } else await rclick();
    await wait();
    rotId = await G((d) => { const o = window.__CDMT__.state.locations[0].lot.objects.filter((x) => x.defId === d); return o[o.length - 1]?.id; }, rotDef);
  }
  if (!deskId) fail('sales desk not placed');
  if (!rotId) fail('bench not placed');
  else {
    await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), rotId));
    const r0 = (await obj(rotId)).rot;
    if (PHONE) await press('.world-pop.open .btn:has-text("Rotate")'); else await key('r');
    let r1 = (await obj(rotId)).rot;
    if (r1 === r0) {
      // Not enough room to turn in place? Say why, and try the other way round through the card.
      log('rotate in place blocked, message:', await G(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')));
      fail('rotating the bench did nothing');
    } else log('rotated bench', r0, '→', r1);
  }

  // ---- duplicate (Ctrl+D / button) and copy/paste
  await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId));
  let n0 = await objs();
  if (PHONE) await press('.world-pop.open .btn:has-text("Duplicate")'); else await key('Control+d');
  // The copy follows the cursor / finger until it is placed.
  if ((await G(() => window.__CDMT_WORLD__.ui().tool)) !== 'place') fail('duplicate did not start placing a copy');
  if (PHONE) await press('.world-confirm [data-cb=ok]');
  else {
    const ds = await G(() => { const W = window.__CDMT__; return W.lot.findSpot(W.state, W.state.locations[0], 'plant'); });
    await tapAt(await scr(ds.x + 0.5, ds.y + 0.5));
  }
  await wait(150);
  if ((await objs()) !== n0 + 1) fail('duplicate failed');
  const dupLast = await G(() => { const o = window.__CDMT__.state.locations[0].lot.objects; return o[o.length - 1]; });
  if (!dupLast || dupLast.defId !== 'plant' || dupLast.id === plantId) fail('duplicate did not place a copy of the plant');
  if (PHONE) await press('.world-confirm [data-cb=stop]'); else await rclick();
  await wait();
  await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId));
  n0 = await objs();
  if (!PHONE) { await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId)); await key('Control+c'); }
  if (!PHONE) {
    await key('Control+v');
    if ((await G(() => window.__CDMT_WORLD__.ui().tool)) !== 'place') fail('paste did not start placing');
    const ps = await G(() => { const W = window.__CDMT__; return W.lot.findSpot(W.state, W.state.locations[0], 'plant'); });
    await tapAt(await scr(ps.x + 0.5, ps.y + 0.5));
    if ((await objs()) !== n0 + 1) fail('paste did not place a plant');
    await rclick();
    await wait();
  }

  // ---- delete (Delete key / button), undo brings it back
  // (Tapping a selected object again closes its card, so only tap when it is not selected yet.)
  if ((await G(() => window.__CDMT_WORLD__.ui().selected?.id)) !== plantId) await tapAt(await G((id) => window.__CDMT_WORLD__.objScreen(id), plantId));
  n0 = await objs();
  if (PHONE) await press('.world-pop.open .btn:has-text("Bulldoze")'); else await key('Delete');
  // "Bulldoze this plant?" with build cost, refund and net cost.
  await page.waitForSelector('.modal-overlay [data-bz=table]', { timeout: 3000 }).catch(() => fail('bulldoze confirm did not open'));
  const bzText = await page.locator('.modal-overlay [data-bz=table]').innerText().catch(() => '');
  if (!/Build cost/.test(bzText) || !/Refund/.test(bzText) || !/Net cost/.test(bzText)) fail('bulldoze confirm lacks cost / refund / net: ' + bzText);
  await page.click('.modal-overlay [data-bz=confirm]');
  await wait(150);
  if ((await objs()) !== n0 - 1 || (await obj(plantId))) fail('delete failed');
  const cashDel = await G(() => window.__CDMT__.state.cash);
  if (PHONE) await press('.bp-tool[data-bt=undo]'); else await key('Control+z');
  if (!(await obj(plantId))) fail('undo did not restore the deleted plant');
  if ((await G(() => window.__CDMT__.state.cash)) >= cashDel) fail('undo of delete did not take the refund back');

  // ---- expensive delete asks first
  if (deskId) {
    await G(() => { });
  }
  const dearId = await G(() => { const W = window.__CDMT__; const loc = W.state.locations[0]; const o = loc.lot.objects.find((x) => ['glassdoor', 'receptiondesk', 'lift', 'detailbay'].includes(x.defId) || (W.objects[x.defId]?.cost ?? 0) >= 2000); return o?.id; });
  if (dearId && !PHONE) {
    const dp = await G((id) => window.__CDMT_WORLD__.objScreen(id), dearId);
    await tapAt(dp);
    const sel = await G(() => window.__CDMT_WORLD__.ui().selected);
    if (sel && sel.kind === 'object') {
      const id = sel.id;
      const cost = await G((i) => { const W = window.__CDMT__; const o = W.state.locations[0].lot.objects.find((x) => x.id === i); return o; }, id);
      await key('Delete');
      const dialog = await page.locator('.modal-overlay [data-bz=table]').count();
      if (dialog) { await page.click('.modal-overlay [data-bz=cancel]'); await wait(); if (!(await obj(id))) fail('cancelled delete still removed the object'); } else fail('bulldozing ' + (cost && cost.defId) + ' did not ask first');
    }
    await G(() => document.querySelector('.world-pop.open .wm-close')?.click());
  }

  // ---- draw a wall line
  await press('.bp-tab[data-cat=structure]');
  await press('.bp-item[data-obj=wall]');
  const line = await G(() => {
    const W = window.__CDMT__; const loc = W.state.locations[0];
    for (let y = 1; y < loc.lot.h - 1; y += 1) for (let x = 1; x < loc.lot.w - 6; x += 1) {
      const c = W.lot.lineCheck(W.state, loc, 'wall', x, y, x + 4, y);
      if (c.count === 5) return { x, y };
    }
    return null;
  });
  if (!line) fail('no room for a wall line');
  else {
    n0 = await objs();
    await drag(await scr(line.x + 0.5, line.y + 0.5), await scr(line.x + 4.5, line.y + 0.5));
    if (PHONE && (await objs()) === n0) await press('.world-confirm .btn.primary');
    const walls = (await objs()) - n0;
    log('wall line placed', walls, 'pieces');
    if (walls !== 5) fail(`wall line placed ${walls} pieces, expected 5`);
    await shot('05-wall');
    if (PHONE) await press('.world-confirm [data-cb=stop]'); else await rclick();
    await wait();
    // One undo removes the whole line.
    if (PHONE) await press('.bp-tool[data-bt=undo]'); else await key('Control+z');
    if ((await objs()) !== n0) fail('undo did not remove the whole wall line');
    if (PHONE) await press('.bp-tool[data-bt=redo]'); else await key('Control+y');
  }

  // ---- per-room style
  await press('.bp-tab[data-cat=style]');
  const room = await G(() => [...document.querySelectorAll('.bp-chip[data-target]')].map((e) => e.dataset.target).find((t) => t !== 'all'));
  if (room) {
    await press(`.bp-chip[data-target="${room}"]`);
    const btn = page.locator('.bp-body [data-style^="floor:"]:not(.active):not([disabled])').first();
    if (await btn.count()) {
      const id = await btn.getAttribute('data-style');
      if (PHONE) await btn.tap(); else await btn.click();
      await wait(150);
      if (await page.locator('.modal-overlay .confirm-text').count()) await page.click('.modal-overlay .btn.primary, .modal-overlay .btn.danger');
      await wait(150);
      const rs = await G(() => window.__CDMT__.state.locations[0].lot.roomStyles);
      log('showroom style', id, JSON.stringify(rs));
      if (!rs || !rs[room] || rs[room].floor !== id.split(':')[1]) fail('per-room floor style not applied');
    } else fail('no floor styles to choose');
  } else fail('no room target chips in the style tab');

  // ---- grid & snap toggles
  const g0 = await G(() => window.__CDMT_WORLD__.ui().grid);
  await toggleOpt('grid');
  if ((await G(() => window.__CDMT_WORLD__.ui().grid)) === g0) fail('grid toggle did nothing');
  await toggleOpt('grid');

  // ---- cars: buy two, let them arrive
  await G(() => {
    const W = window.__CDMT__; const s = W.state;
    const offers = s.offers.filter((x) => !x.auction).sort((a, b) => a.offerPrice - b.offerPrice).slice(0, 2);
    for (const o of offers) W.trading.buyOffer(s, o.id);
    for (let i = 0; i < 4 && s.vehicles.some((v) => v.status === 'transit'); i += 1) W.engine.skipToNextDay();
    document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
  });
  await G(() => window.__CDMT__.app.go('dealership', { build: '1' }));
  await wait(250);
  if (!(await G(() => window.__CDMT_WORLD__.ui().build))) { await press('.wa-item[data-action=build]'); await wait(); }
  const cars = await G(() => window.__CDMT__.state.vehicles.filter((v) => v.status === 'yard' || v.status === 'listed').map((v) => ({ id: v.id, slot: v.slotId })));
  log('cars on the lot', cars.length);
  if (cars.length < 2) fail('need two cars on the lot');
  const car = cars[0];

  // car → a free parking/display space by dragging it on the map
  const freeSlot = await G((vid) => {
    const W = window.__CDMT__; const s = W.state; const loc = s.locations[0]; const ls = W.lot.lotStats(loc.lot);
    const used = new Set(s.vehicles.map((v) => v.slotId));
    const o = [...ls.slots.display, ...ls.slots.parking].find((x) => !used.has(x.id) && ls.reachable.has(x.id));
    if (!o) return null;
    const f = W.lot.footprint(o);
    return { id: o.id, cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
  }, car.id);
  if (!freeSlot) {
    // Build one more space so there is somewhere to go.
    await G(() => { const W = window.__CDMT__; const loc = W.state.locations[0]; const sp = W.lot.findSpot(W.state, loc, 'parking', true); if (sp) W.lot.placeObject(W.state, loc, 'parking', sp.x, sp.y, sp.rot); });
  }
  const slot2 = freeSlot ?? await G(() => { const W = window.__CDMT__; const s = W.state; const loc = s.locations[0]; const ls = W.lot.lotStats(loc.lot); const used = new Set(s.vehicles.map((v) => v.slotId)); const o = ls.slots.parking.find((x) => !used.has(x.id)); const f = W.lot.footprint(o); return { id: o.id, cx: f.x + f.w / 2, cy: f.y + f.h / 2 }; });
  await wait(200);
  if (PHONE) {
    await G(([vid, tx, ty]) => {
      const W = window.__CDMT__; const v = W.state.vehicles.find((x) => x.id === vid); const o = W.state.locations[0].lot.objects.find((x) => x.id === v.slotId);
      const f = W.lot.footprint(o);
      window.__CDMT_WORLD__.panTo((f.x + f.w / 2 + tx) / 2, (f.y + f.h / 2 + ty) / 2);
    }, [car.id, slot2.cx, slot2.cy]);
    await wait(150);
  }
  const carAt = await G((id) => window.__CDMT_WORLD__.carScreen(id), car.id);
  if (!carAt) fail('car not visible on the map');
  else {
    if (PHONE) await longDrag(carAt, await scr(slot2.cx, slot2.cy)); else await drag(carAt, await scr(slot2.cx, slot2.cy));
    const now = await G((id) => window.__CDMT__.state.vehicles.find((v) => v.id === id).slotId, car.id);
    log('car dragged to space', now === slot2.id ? 'ok' : `landed on ${now}`);
    if (now !== slot2.id) fail(`car drag to space failed (${now} vs ${slot2.id})`);
    await shot('06-car-on-space');
  }

  // snap off, then a car onto open showroom/outdoor floor, turned 90° while dragging
  await toggleOpt('snap');
  if (await G(() => window.__CDMT_WORLD__.ui().snap)) fail('snap toggle did nothing');
  const floor = await G((vid) => {
    const W = window.__CDMT__; const s = W.state; const loc = s.locations[0];
    for (let y = 2; y < loc.lot.h - 2; y += 1) for (let x = 2; x < loc.lot.w - 2; x += 1) {
      const ok = [[0, 0], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]].every(([jx, jy]) => { const d = W.lot.carDropCheck(s, loc, vid, x + 2 + jx, y + 1 + jy, 1, false); return d.ok && !d.slotId && d.x === x && d.y === y; });
      const z = W.lot.zoneAt(loc.lot, x, y);
      if (ok && (z === 's' || z === 'a')) return { cx: x + 2, cy: y + 1 };
    }
    return null;
  }, cars[1].id);
  if (!floor) fail('no open floor for a car');
  else {
    const from = await G((id) => window.__CDMT_WORLD__.carScreen(id), cars[1].id);
    const rot = async () => { if (PHONE) { /* phones: the rotate button on the action bar */ } else await page.keyboard.press('r'); };
    if (PHONE) {
      // Phone: pick the car in the shelf, tap the floor, rotate, confirm.
      await press('.bp-tab[data-cat=vehicles]');
      await press(`.bp-car[data-car="${cars[1].id}"]`);
      await tapAt(await G(([x, y]) => window.__CDMT_WORLD__.panTo(x, y), [floor.cx, floor.cy]));
      await shot('07-car-ghost');
      await press('.world-confirm [data-cb=rotate]');
      await press('.world-confirm .btn.primary');
      await wait(200);
    } else {
      await drag(from, await scr(floor.cx, floor.cy), async () => { const b4 = await G(() => window.__CDMT_WORLD__.ui()); await rot(); await wait(60); log('during car drag', JSON.stringify(b4), '→ rot', (await G(() => window.__CDMT_WORLD__.ui())).rot, 'floor', JSON.stringify(floor), 'label', await G(() => document.querySelector('.wc-label')?.textContent)); await shot('07-car-ghost'); });
    }
    const st = await G((id) => { const W = window.__CDMT__; const v = W.state.vehicles.find((x) => x.id === id); const o = W.state.locations[0].lot.objects.find((x) => x.id === v.slotId); return o ? { defId: o.defId, rot: o.rot } : null; }, cars[1].id);
    log('car on open floor', JSON.stringify(st));
    if (!st || st.defId !== 'carpos') fail('car was not parked on open floor');
    else if (st.rot !== 1) fail('car was not turned 90°');
    await shot('08-car-on-floor');
  }
  await toggleOpt('snap');

  // invalid drop: onto a wall/solid object → stays put, red feedback
  const bad = await G((vid) => {
    const W = window.__CDMT__; const s = W.state; const loc = s.locations[0];
    const solid = loc.lot.objects.find((o) => o.defId === 'wall') ?? loc.lot.objects.find((o) => o.defId === 'salesdesk');
    if (!solid) return null;
    const f = W.lot.footprint(solid);
    const d = W.lot.carDropCheck(s, loc, vid, f.x + f.w / 2, f.y + f.h / 2, 0, false);
    return d.ok ? null : { cx: f.x + f.w / 2, cy: f.y + f.h / 2, reason: d.reason };
  }, car.id);
  if (bad) {
    const was = await G((id) => window.__CDMT__.state.vehicles.find((v) => v.id === id).slotId, car.id);
    await clearToasts();
    await toggleOpt('snap');
    if (PHONE) {
      await press('.bp-tab[data-cat=vehicles]');
      await press(`.bp-car[data-car="${car.id}"]`);
      await tapAt(await G(([x, y]) => window.__CDMT_WORLD__.panTo(x, y), [bad.cx, bad.cy]));
      const dis = await G(() => document.querySelector('.world-confirm .btn.primary')?.disabled);
      if (!dis) fail('invalid car spot not marked invalid');
      await press('.world-confirm [data-cb=stop]');
    } else {
      await drag(await G((id) => window.__CDMT_WORLD__.carScreen(id), car.id), await scr(bad.cx, bad.cy));
    }
    await toggleOpt('snap');
    const still = await G((id) => window.__CDMT__.state.vehicles.find((v) => v.id === id).slotId, car.id);
    if (still !== was) fail('invalid car drop moved the car');
    log('invalid drop rejected:', bad.reason);
  } else log('no solid object for an invalid drop test');

  // car undo
  if (PHONE) await press('.bp-tool[data-bt=undo]'); else await key('Control+z');
  const undone = await G((id) => { const W = window.__CDMT__; const v = W.state.vehicles.find((x) => x.id === id); const o = W.state.locations[0].lot.objects.find((x) => x.id === v.slotId); return o?.defId; }, cars[1].id);
  if (undone === 'carpos') fail('undo did not take the car off the open floor');
  if (PHONE) await press('.bp-tool[data-bt=redo]'); else await key('Control+y');

  // ---- perf: 100+ objects, frame time while dragging
  const perf = await G(async () => {
    const W = window.__CDMT__; const s = W.state; const loc = s.locations[0];
    let placed = 0;
    for (let i = 0; i < 120 && loc.lot.objects.length < 130; i += 1) {
      const sp = W.lot.findSpot(s, loc, i % 2 ? 'plant' : 'bin');
      if (!sp) break;
      if (W.lot.placeObject(s, loc, i % 2 ? 'plant' : 'bin', sp.x, sp.y, sp.rot).ok) placed += 1;
    }
    return { placed, total: loc.lot.objects.length };
  });
  await G(() => window.__CDMT__.app.go('dealership', { build: '1' }));
  await wait(300);
  const frames = await G(() => new Promise((res) => { const t = []; let last = performance.now(); let n = 0; const f = (now) => { t.push(now - last); last = now; if (++n < 60) requestAnimationFrame(f); else res(t.sort((a, b) => a - b)[Math.floor(t.length * 0.9)]); }; requestAnimationFrame(f); }));
  log('objects', perf.total, 'p90 frame', Math.round(frames), 'ms');
  if (frames > 80) fail(`slow frames with ${perf.total} objects: ${Math.round(frames)} ms`);
  await shot('09-many-objects');

  // ---- save and reload: layout, car spots and rotations come back
  const snapshot = () => G(() => { const s = window.__CDMT__.state; const l = s.locations[0].lot; return JSON.stringify({ o: l.objects.map((o) => [o.id, o.defId, o.x, o.y, o.rot]), rs: l.roomStyles ?? null, cars: s.vehicles.map((v) => [v.id, v.slotId]) }); });
  const pre = await snapshot();
  await G(() => window.__CDMT__.save());
  await page.reload();
  await press('text=Continue');
  await wait(400);
  const post = await snapshot();
  if (pre !== post) fail('layout / car positions changed after reload');
  else log('reload: layout and car positions identical');
  await shot('10-after-reload');

  // ---- model browser
  await G(() => { document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.__CDMT__.app.go('market'); });
  await wait(200);
  await press('.seg-btn:has-text("Model browser")');
  await wait(150);
  const cardsN = await G(() => document.querySelectorAll('.mb-card').length);
  if (cardsN < 40) fail('model browser shows only ' + cardsN + ' models');
  await press('.mb-brands [data-brand=voltara]');
  const vt = await G(() => [...document.querySelectorAll('.mb-card .ic-title')].map((e) => e.textContent));
  if (!vt.length || vt.some((t) => !t.startsWith('VOLTARA'))) fail('brand filter wrong: ' + vt.join(','));
  const txt = await G(() => document.querySelector('.mb-card')?.textContent ?? '');
  for (const k of ['Purchase', 'Expected sale', 'Estimated margin', 'Demand', 'Popularity', 'Customer segments']) if (!txt.includes(k)) fail('model card missing ' + k);
  await shot('11-models');
  const offersBefore = await G(() => window.__CDMT__.state.offers.length);
  await press('.mb-card >> nth=0 >> [data-act=source]');
  await wait(250);
  const sourced = await G(() => window.__CDMT__.state.offers.filter((o) => o.sourced).length);
  if (sourced < 1 || (await G(() => window.__CDMT__.state.offers.length)) !== offersBefore + 1) fail('sourcing a model did not create an offer');
  if (!(await page.locator('.offer-modal').count())) fail('sourced offer did not open');
  await shot('12-sourced');

  await browser.close();
  if (errors.length) {
    console.error('BUILD QA FAILED\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`build ok (${PHONE ? 'phone' : 'desktop'})`);
})().catch((e) => { console.error(e); process.exit(1); });
