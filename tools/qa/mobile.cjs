// Mobile UI QA (v7) on a Galaxy S25 Ultra-sized screen: compact header and
// status sheet, play/pause, notification center, bottom sheets (drag to
// close), bottom navigation, the Business group picker, and build mode as its
// own state: top bar, three modes, search, filter sheet, locked items,
// insufficient funds, placement bar (rotate / cancel / place).
// Usage: node tools/qa/mobile.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

(async () => {
  const browser = await chromium.launch();
  const bctx = await browser.newContext({ viewport: { width: 412, height: 891 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await bctx.newPage();
  const cdp = await bctx.newCDPSession(page);
  const errors = [];
  let fails = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) fails += 1; };
  const G = (fn, a) => page.evaluate(fn, a);
  const wait = (ms = 200) => page.waitForTimeout(ms);
  const tap = async (sel) => { await page.locator(sel).locator('visible=true').first().tap(); await wait(); };
  const visible = (sel) => page.locator(sel).locator('visible=true').count().then((n) => n > 0);
  const shot = (n) => page.screenshot({ path: `${OUT}/mobile-${n}.png` });

  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.reload();
  await page.locator('text=New game').tap();
  await page.locator('text=Open the dealership').tap();
  await wait(500);
  await G(() => { const s = window.__CDMT__.state; s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false; document.querySelector('.tutorial')?.remove(); window.__CDMT__.engine.setSpeed(1); });

  // ---- header
  check(await visible('#m-hud'), 'compact header card shown');
  check(!(await visible('.status-strip')) && !(await visible('.hud.statusbar')), 'no second status strip under the header');
  const topH = await G(() => document.querySelector('.topbar').getBoundingClientRect().height);
  check(topH <= 72, `header is compact (${Math.round(topH)}px)`);
  await tap('.m-play');
  check(await G(() => window.__CDMT__.state.speed === 0), 'play/pause button pauses');
  await tap('.m-play');
  check(await G(() => window.__CDMT__.state.speed === 1), '…and plays again');
  await tap('#m-hud');
  check(await visible('.status-sheet'), 'tapping the header opens the status sheet');
  await tap('.status-sheet .seg-btn[data-speed="3"]');
  check(await G(() => window.__CDMT__.state.speed === 3), 'speed 4× from the status sheet');
  await shot('01-status');
  // Drag the sheet down by its grip to close it.
  const grip = await page.locator('.status-sheet .sheet-grip').boundingBox();
  const tp = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(grip.x + grip.width / 2, grip.y + 8) });
  for (let i = 1; i <= 8; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(grip.x + grip.width / 2, grip.y + 8 + i * 40) }); await wait(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(400);
  check(!(await G(() => !!document.querySelector('.status-sheet'))), 'dragging the sheet down closes it');
  await G(() => window.__CDMT__.engine.setSpeed(0));

  // ---- notification center
  await G(() => { const s = window.__CDMT__.state; s.notices.unshift({ id: 'qa1', day: s.day, text: 'QA notice', kind: 'good', read: false }); window.__CDMT__.app.refresh(); });
  await tap('.bell .icon-btn');
  check(await G(() => [...document.querySelectorAll('.notice-sheet .alert-title')].some((e) => e.textContent === 'QA notice')), 'notification center lists the notice');
  check(await visible('.notice-sheet .notice-ic'), 'notices carry an icon, not an emoji');
  await tap('.notice-sheet .modal-head .icon-btn');

  // ---- bottom navigation
  const nav = await G(() => { const b = document.querySelector('.mobile-nav .nav-bar').getBoundingClientRect(); const items = [...document.querySelectorAll('.mobile-nav .nav-bar .nav-item')].map((e) => e.getBoundingClientRect().height); return { bottom: b.bottom, min: Math.min(...items) }; });
  check(nav.bottom <= 891 + 1 && nav.min >= 48, `bottom nav fits, tall targets (${Math.round(nav.min)}px)`);
  await tap('.mobile-nav .nav-item[data-section=business]');
  check(await G(() => window.__CDMT__.app.route === 'business'), 'nav → Business');
  check(!(await visible('.hub-groups')) && (await visible('.hub-gsel')), 'Business has one tab row with a group picker');
  await tap('.hub-gsel');
  await tap('.group-sheet .list-row[data-group=Company]');
  check(await G(() => document.querySelector('.hub-tab.active')?.dataset.tab === 'company'), 'group picker switches to Company');
  await shot('02-business');
  await tap('.mobile-nav .nav-item[data-section=dealership]');

  // ---- build mode
  await tap('[data-action=build]');
  check(await G(() => document.body.dataset.mode === 'build'), 'build is its own mode');
  const chrome = await G(() => ['.topbar', '.mobile-nav', '.world-actions', '.world-hud', '.world-zoom'].filter((q) => { const e = document.querySelector(q); return e && e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'; }));
  check(!chrome.length, `app chrome hidden while building (${chrome.join(', ') || 'none'})`);
  check(await visible('.world-buildbar [data-bt=done]') && await visible('.world-buildbar [data-bt=exit]'), 'build top bar: back and Done');
  check((await G(() => document.querySelectorAll('.bp-mode').length)) === 3, 'three large modes');
  const modeH = await G(() => Math.min(...[...document.querySelectorAll('.bp-mode')].map((e) => e.getBoundingClientRect().height)));
  check(modeH >= 44, `mode buttons are ${Math.round(modeH)}px tall`);
  check(await G(() => { const t = document.querySelector('.bp-tabs'); return getComputedStyle(t).flexWrap === 'nowrap'; }), 'one horizontal category row');
  // Sheet sizes.
  await tap('.bp-grip');
  check(await G(() => document.querySelector('.world-palette').dataset.sheet === 'full'), 'grip expands the sheet');
  await tap('.bp-grip');
  check(await G(() => document.querySelector('.world-palette').dataset.sheet === 'peek'), 'grip folds it to a peek');
  await tap('.bp-grip');
  check(await G(() => document.querySelector('.world-palette').dataset.sheet === 'half'), 'grip cycles peek → half');
  // Search expands.
  await wait(400);
  check(!(await visible('.bp-search-input')), 'search is folded away');
  await tap('.bp-sbtn');
  await page.locator('.bp-search-input').fill('coffee');
  await wait(150);
  check(await G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].some((e) => e.dataset.obj === 'coffee')), 'search finds the coffee machine');
  await tap('.bp-sclose');
  check(await visible('.bp-catbar'), 'closing search brings the categories back');
  // Filter sheet.
  await tap('.bp-tab[data-cat=all]');
  const all = await G(() => document.querySelectorAll('.bp-body .bp-item[data-obj]').length);
  await tap('.bp-catbar .bp-fbtn');
  await tap('[data-adv="size:large"]');
  await tap('[data-adv="avail:unlocked"]');
  await shot('03-filters');
  await tap('[data-act=apply-filters]');
  const large = await G(() => [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj));
  const tooSmall = await G((ids) => ids.filter((id) => { const d = window.__CDMT__.objects[id]; return d.w * d.h < 12; }), large);
  check(large.length > 0 && large.length < all && !tooSmall.length, `filter sheet: large + unlocked → ${large.length}/${all}`);
  check(await G(() => document.querySelector('.bp-catbar .bp-fcount')?.textContent === '2'), 'filter button shows 2 active filters');
  await tap('.bp-catbar .bp-fbtn');
  await tap('[data-act=reset-filters]');
  // Locked items explain why.
  await tap('.bp-tab[data-cat=premium]');
  const lockLine = await G(() => document.querySelector('.bp-item.locked .bp-lockline')?.textContent ?? '');
  check(/level|reputation|sold|plot|profit|team|drive|electric/i.test(lockLine), `locked card says why: "${lockLine}"`);
  await tap('.bp-item.locked');
  check(await visible('.lock-sheet .lock-reason'), 'tapping a locked item opens its explanation');
  await tap('.lock-sheet .btn.primary');
  // Placement bar.
  await tap('.bp-tab[data-cat=decoration]');
  await tap('.bp-item[data-obj=plant]');
  check(await G(() => document.querySelector('.world-palette').classList.contains('collapsed')), 'the catalog folds away while placing');
  check(await visible('.world-confirm [data-cb=rotate]') && await visible('.world-confirm [data-cb=stop]') && await visible('.world-confirm [data-cb=ok]'), 'placement bar: Rotate · Cancel · Place');
  const status = await G(() => document.querySelector('.world-confirm .wc-status')?.textContent ?? '');
  check(status.length > 0, `placement status: "${status}"`);
  await shot('04-placing');
  const n0 = await G(() => window.__CDMT__.state.locations[0].lot.objects.length);
  await tap('.world-confirm [data-cb=ok]');
  const placed = (await G(() => window.__CDMT__.state.locations[0].lot.objects.length)) === n0 + 1;
  check(placed || /can|not|in the way|outside/i.test(await G(() => document.querySelector('.world-confirm .wc-status')?.textContent ?? '')), 'Place builds it (or says why not)');
  await tap('.world-confirm [data-cb=stop]');
  check(!(await G(() => document.querySelector('.world-palette').classList.contains('collapsed'))), 'Cancel brings the catalog back');
  // Insufficient funds.
  await G(() => { window.__CDMT__.state.cash = 50; window.__CDMT__.app.refresh(); });
  await wait(200);
  check(await G(() => !!document.querySelector('.bp-item.poor .bp-lockline.poor')), 'cards say how much money is missing');
  await tap('.bp-item.poor');
  const why = await G(() => document.querySelector('.world-confirm .wc-status')?.textContent ?? '');
  check(/cash|money|afford|€/i.test(why), `placing without cash explains: "${why}"`);
  await tap('.world-confirm [data-cb=stop]');
  // Remove mode: sub-toggle and a peek sheet.
  await tap('.bp-mode[data-bt=bulldoze]');
  check(await visible('.bp-rm[data-rm=area]') && await G(() => document.querySelector('.world-palette').dataset.sheet === 'peek'), 'Remove: one/area toggle, sheet drops to peek');
  await tap('.bp-mode[data-bt=select]');
  // Options sheet.
  await tap('.world-buildbar [data-bt=more]');
  check(await visible('.build-more .tgl[data-bt=grid]') && await visible('.build-more .site-stats .bs-chip'), 'options sheet: toggles and site stats');
  await tap('.build-more .modal-head .icon-btn');
  await tap('.world-buildbar [data-bt=done]');
  check(await G(() => document.body.dataset.mode === 'play') && await visible('.mobile-nav'), 'Done returns to the game with its navigation');
  // ---- contextual selection card
  const vid = await G(() => window.__CDMT__.state.vehicles.find((v) => v.slotId)?.id);
  if (vid) {
    await G((id) => window.__CDMT_WORLD__.select({ kind: 'vehicle', id }), vid);
    await wait(250);
    check(await G(() => document.querySelector('.world-pop.open')?.classList.contains('compact')), 'selecting a car shows a compact card');
    check(await visible('.world-pop .wm-summary') && !(await visible('.world-pop .wm-facts')), 'compact card: one summary line, details folded');
    await tap('.world-pop [data-act=manage]');
    check(await visible('.world-pop .wm-facts'), 'Manage opens the full details');
    await tap('.world-pop .wm-close');
  }
  const eid = await G(() => window.__CDMT__.state.employees[0]?.id);
  if (eid) {
    await G((id) => window.__CDMT_WORLD__.select({ kind: 'agent', id: `e:${id}` }), eid);
    await wait(250);
    check(await visible('.world-pop .m-meter'), 'selecting an employee shows their performance');
    await tap('.world-pop .wm-close');
  }

  // ---- five-item navigation; Settings and the money behind the header
  const navIds = await G(() => [...document.querySelectorAll('.mobile-nav .nav-bar .nav-item')].map((b) => b.dataset.section));
  check(navIds.length === 5 && !navIds.includes('settings'), `bottom nav: ${navIds.join(', ')}`);
  await tap('#m-hud');
  const fin = await G(() => document.querySelector('.status-sheet .fin-card')?.textContent ?? '');
  check(['Revenue today', 'Expenses today', 'Profit today', 'Debt', 'Dealership value'].every((k) => fin.includes(k)), 'finance sheet: revenue, expenses, profit, debt, value');
  await tap('.status-sheet [data-act=settings]');
  check(await G(() => window.__CDMT__.app.route === 'settings'), 'Settings from the status sheet');

  // ---- screens as mobile cards
  await G(() => window.__CDMT__.app.go('inventory', { tab: 'stock' }));
  await wait(300);
  check(await visible('.vehicle-card .kv-grid'), 'Inventory: vehicle cards with purchase / market value / profit');
  await tap('.vehicle-card [data-act=manage]');
  check(await visible('.modal-overlay .modal-card'), 'Manage opens the vehicle sheet');
  await tap('.modal-overlay .modal-head .icon-btn');
  await G(() => window.__CDMT__.app.go('people', { tab: 'staff' }));
  await wait(300);
  check(await visible('.employee-card .m-meter'), 'People: employee cards with a performance bar');
  await G(() => window.__CDMT__.app.go('service', { tab: 'planning' }));
  await wait(300);
  check(await visible('.service-summary .stat-tile') && await visible('.service-summary .m-meter'), 'Service: jobs, waiting, mechanics, revenue and capacity');
  await G(() => window.__CDMT__.app.go('business', { tab: 'overview' }));
  await wait(300);
  check(await visible('.business-summary .m-hero'), 'Business: profit at a glance');
  await shot('05-business');

  // ---- placement: preview on a free spot, drag it by finger, place, Done
  await G(() => { window.__CDMT__.state.cash += 50000; window.__CDMT__.app.go('dealership'); });
  await wait(400);
  await tap('[data-action=build]');
  await tap('.bp-tab[data-cat=decoration]');
  await tap('.bp-item[data-obj=plant]');
  const g0 = await G(() => window.__CDMT_WORLD__.ui());
  check(g0.tool === 'place', 'plant preview is live');
  const before = await G(() => window.__CDMT__.state.locations[0].lot.objects.length);
  await tap('.world-confirm [data-cb=ok]');
  check((await G(() => window.__CDMT__.state.locations[0].lot.objects.length)) === before + 1, 'Place builds it straight from the preview');
  check(await G(() => /Done/.test(document.querySelector('.world-confirm [data-cb=stop]')?.textContent ?? '')), 'after placing, Cancel becomes Done');
  await tap('.world-confirm [data-cb=stop]');
  await tap('.world-buildbar [data-bt=done]');

  const hscroll = await G(() => document.scrollingElement.scrollWidth > window.innerWidth + 1);
  check(!hscroll, 'nothing scrolls sideways');
  if (errors.length) { console.log('ERRORS:', errors.join(' | ')); fails += 1; }
  await browser.close();
  if (fails) { console.log(`mobile QA FAILED (${fails})`); process.exit(1); }
  console.log('mobile ok');
})().catch((e) => { console.error(e); process.exit(1); });
