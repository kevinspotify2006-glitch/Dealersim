// Management Center & layouts QA (v7.3): the Management Center on desktop
// (modes, policies, rules, headhunter, HR, logistics, approvals), the
// notification filters, the six-item phone navigation with More, portrait at
// 360/390/412/480, real landscape at 800/891/900 (rail, world, right context
// panel, bottom quick actions, right-hand dialog drawer, build mode with the
// details on the right) and rotating without a reload.
// Usage: node tools/qa/management.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

let fails = 0;
const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) fails += 1; };

async function start(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('text=New game');
  await page.click('text=Open the dealership');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const W = window.__CDMT__; const s = W.state;
    s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false;
    s.cash += 2_000_000; s.companyLevel = 5; W.engine.setSpeed(0);
    for (let i = 0; i < 24 * 6; i += 1) W.engine.stepHour();
    document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
    document.querySelector('.tutorial')?.remove();
  });
  return { ctx, page, errors, G: (fn, a) => page.evaluate(fn, a), wait: (ms = 180) => page.waitForTimeout(ms) };
}

const noSideScroll = (G) => G(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch();

  // ================================================================ desktop
  {
    console.log('desktop 1440×900');
    const { ctx, page, errors, G, wait } = await start(browser, { viewport: { width: 1440, height: 900 } });
    const click = async (sel) => { await page.locator(sel).locator('visible=true').first().click(); await wait(); };
    check(await G(() => document.body.classList.contains('lay-desktop')), 'layout: desktop');
    check(await G(() => !!document.querySelector('.nav .nav-item[data-route="management"]')), 'Management in the sidebar');
    await click('.nav .nav-item[data-route="management"]');
    check(await G(() => window.__CDMT__.app.route === 'management'), 'Management Center opens');
    check((await G(() => document.querySelectorAll('.mc-dept').length)) === 8, 'overview lists the eight departments');
    const groups = await G(() => [...document.querySelectorAll('.hub-group')].map((g) => g.dataset.group));
    check(['Control', 'Organisation', 'Departments'].every((g) => groups.includes(g)), `tab groups: ${groups.join(', ')}`);
    await page.screenshot({ path: `${OUT}/mgmt-desktop-overview.png` });

    // Automation: everything automated in one click; per department after.
    await G(() => window.__CDMT__.app.go('management', { tab: 'automation' }));
    await wait(250);
    await click('[data-all=auto]');
    check(await G(() => Object.values(window.__CDMT__.state.automation.policies.modes).every((m) => m === 'auto')), 'All automated switches every department');
    await click('[data-all=manual]');
    await G(() => { const p = document.querySelectorAll('.panel .mode-seg')[1]; p.querySelector('.seg-btn:nth-child(2)').click(); });
    await wait(250);
    check(await G(() => Object.values(window.__CDMT__.state.automation.policies.modes).filter((m) => m === 'assisted').length === 1), 'one department set to assisted');

    // Sales policy field edits the simulation.
    await G(() => window.__CDMT__.app.go('management', { tab: 'sales' }));
    await wait(250);
    await page.fill('[data-policy="approveAbove"]', '25000');
    await page.press('[data-policy="approveAbove"]', 'Tab');
    await wait(200);
    check(await G(() => window.__CDMT__.state.automation.policies.sales.approveAbove === 25000), 'sales approval limit saved');

    // Inventory pricing policy.
    await G(() => window.__CDMT__.app.go('management', { tab: 'inventory' }));
    await wait(250);
    await click('[data-pricing="fast"]');
    check(await G(() => window.__CDMT__.state.automation.policies.inventory.pricing === 'fast'), 'pricing policy: fast turnover');

    // Rules: add one through the editor.
    await G(() => window.__CDMT__.app.go('management', { tab: 'rules' }));
    await wait(250);
    await click('[data-act=add-rule]');
    await page.fill('[data-field=rule-name]', 'QA rule');
    await page.selectOption('[data-field=rule-metric]', 'stock');
    await wait(100);
    await click('.rule-sheet .seg-btn:has-text("less than")');
    await page.fill('[data-field=rule-value]', '99');
    await page.press('[data-field=rule-value]', 'Tab');
    await page.selectOption('[data-field=rule-action]', 'notify');
    await wait(100);
    await click('[data-act=save-rule]');
    check(await G(() => window.__CDMT__.state.automation.rules.some((r) => r.name === 'QA rule' && r.metric === 'stock' && r.op === '<' && r.value === 99 && r.action === 'notify')), 'rule added from the editor');
    await G(() => window.__CDMT__.engine.skipToNextDay());
    await G(() => window.__CDMT__.app.go('management', { tab: 'overview' }));
    await wait(250);
    const exTexts = await G(() => [...document.querySelectorAll('.mc-ex .mc-ex-text')].map((e) => e.textContent));
    check(exTexts.some((t) => t.includes('QA rule')), `rule fires into the exceptions list (${exTexts.length} shown; state: ${await G(() => window.__CDMT__.state.automation.exceptions.map((x) => x.key).join(','))})`);

    // Headhunter: sign, brief, results, hire.
    await G(() => window.__CDMT__.app.go('management', { tab: 'headhunter' }));
    await wait(250);
    await click('[data-act=hh-upgrade]');
    check(await G(() => window.__CDMT__.state.headhunter.level === 1), 'headhunter signed');
    await page.selectOption('[data-field=hh-role]', 'sales');
    await wait(100);
    await click('[data-act=hh-search]');
    check(await G(() => window.__CDMT__.state.headhunter.searches.length === 1), 'search started from the brief');
    await G(() => { const W = window.__CDMT__; const sr = W.state.headhunter.searches[0]; W.state.day = sr.readyDay; W.mgmt.hh.headhunterDaily(W.state); W.app.refresh(); });
    await wait(250);
    const cands = await G(() => document.querySelectorAll('.mc-cand').length);
    check(cands === 3, `three candidates shown (${cands})`);
    const staff0 = await G(() => window.__CDMT__.state.employees.length);
    await G(() => { const W = window.__CDMT__; const loc = W.state.locations[0]; loc.lot.objects.push({ id: 'qa-desk-e2e', defId: 'salesdesk', x: 0, y: 0, rot: 0 }); loc.lot.version += 1; });
    await click('[data-act=hh-hire]');
    check(await G((n) => window.__CDMT__.state.employees.length === n + 1, staff0), 'candidate hired from the headhunter');

    // HR: an HR manager, AUTO MANAGE, assignment.
    await G(() => { const W = window.__CDMT__; const s = W.state; const e = JSON.parse(JSON.stringify(s.employees[0])); Object.assign(e, { id: 'qa-hr', name: 'Quinn Harper', role: 'hr', level: 3, hrAuto: false, hrBy: undefined, stationId: undefined }); e.skills.management = 80; s.employees.push(e); W.app.go('management', { tab: 'hr' }); });
    await wait(250);
    await click('[data-toggle="hrauto-qa-hr"]');
    check(await G(() => window.__CDMT__.state.employees.find((e) => e.id === 'qa-hr').hrAuto === true), 'AUTO MANAGE toggled on');
    await click('[data-act=assign-all]');
    check(await G(() => window.__CDMT__.state.employees.filter((e) => e.hrBy === 'qa-hr').length > 0), 'everyone assigned to the HR manager');
    await page.fill('[data-policy="target-sales"]', '3');
    await page.press('[data-policy="target-sales"]', 'Tab');
    await wait(150);
    check(await G(() => window.__CDMT__.state.automation.policies.hr.targets.sales === 3), 'target headcount saved');
    // People → HR is the same screen.
    await G(() => window.__CDMT__.app.go('people', { tab: 'hr' }));
    await wait(200);
    check(await G(() => !!document.querySelector('.hub-tab.active[data-tab=hr]') && !!document.querySelector('[data-toggle="hrauto-qa-hr"]')), 'People → HR tab');

    // Logistics: buy a van.
    await G(() => window.__CDMT__.app.go('management', { tab: 'logistics' }));
    await wait(250);
    await click('[data-act=buy-van]');
    check(await G(() => window.__CDMT__.state.logistics.fleet.length === 1), 'van bought');

    // Approvals: approve a deal from the overview.
    const sold0 = await G(() => window.__CDMT__.state.stats.sold);
    const made = await G(() => {
      const W = window.__CDMT__; const s = W.state;
      const v = s.vehicles.find((x) => x.status === 'listed') ?? s.vehicles.find((x) => x.status === 'yard' || x.status === 'prep');
      if (!v) return false;
      v.status = 'listed'; v.prep = [];
      const e = s.employees.find((x) => x.role === 'sales');
      W.mgmt.core.requestApproval(s, { id: 'qa-cust', name: 'Pat Q', archetype: 'family', locationId: v.locationId, status: 'waiting', vehicleId: v.id }, v, e.id, v.askingPrice, 1000, 'test');
      W.app.go('management', { tab: 'overview' });
      return true;
    });
    check(made, 'a car to test approvals with');
    if (made) {
      await wait(250);
      check(await G(() => document.querySelectorAll('.mc-approval').length === 1), 'approval card on the overview');
      await click('.mc-approval [data-act=approve]');
      check(await G((n) => window.__CDMT__.state.stats.sold === n + 1, sold0), 'approving sells the car');
    }

    // Notification centre filters.
    await G(() => { const s = window.__CDMT__.state; const add = (kind, text, tag) => s.notices.unshift({ id: 9000 + s.notices.length, day: s.day, kind, text, read: false, ...(tag ? { tag } : {}) });
      add('bad', 'QA critical'); add('event', 'QA important'); add('info', 'QA info'); add('info', 'QA automation report', 'auto'); window.__CDMT__.app.refresh(); });
    await click('.bell .icon-btn');
    check((await G(() => document.querySelectorAll('.notice-filters [data-nfilter]').length)) === 5, 'five notification filters');
    await click('[data-nfilter=critical]');
    check(await G(() => [...document.querySelectorAll('.notice-sheet .alert-row')].every((r) => r.dataset.weight === 'critical')), 'Critical filter');
    await click('[data-nfilter=auto]');
    check(await G(() => { const rows = [...document.querySelectorAll('.notice-sheet .alert-row')]; return rows.length > 0 && rows.every((r) => r.dataset.tag === 'auto'); }), 'Automation filter');
    await click('.notice-sheet .modal-head .icon-btn');

    // Every management tab draws without errors or sideways scroll.
    for (const t of ['overview', 'automation', 'rules', 'reports', 'managers', 'hr', 'headhunter', 'procurement', 'inventory', 'sales', 'service', 'marketing', 'logistics', 'finance']) {
      await G((tab) => window.__CDMT__.app.go('management', { tab }), t);
      await wait(120);
      const ok = await G(() => !document.querySelector('.main .panel h3')?.textContent?.includes('Something went wrong'));
      if (!ok || !(await noSideScroll(G))) check(false, `management/${t} draws cleanly`);
    }
    check(!errors.length, `no page errors on desktop${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await ctx.close();
  }

  // ================================================================ portrait phones
  for (const w of [360, 390, 412, 480]) {
    const hgt = Math.round(w * 2.16);
    console.log(`portrait ${w}×${hgt}`);
    const { ctx, page, errors, G, wait } = await start(browser, { viewport: { width: w, height: hgt }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const tap = async (sel) => { await page.locator(sel).locator('visible=true').first().tap(); await wait(); };
    check(await G(() => document.body.classList.contains('lay-portrait')), 'layout: portrait');
    const nav = await G(() => { const items = [...document.querySelectorAll('.mobile-nav .nav-bar .nav-item')]; return { ids: items.map((b) => b.dataset.section), minH: Math.min(...items.map((b) => b.getBoundingClientRect().height)), minW: Math.min(...items.map((b) => b.getBoundingClientRect().width)), right: Math.max(...items.map((b) => b.getBoundingClientRect().right)) }; });
    check(nav.ids.join(',') === 'dealership,inventory,people,service,business,more', `six tabs: ${nav.ids.join(', ')}`);
    check(nav.minH >= 48 && nav.minW >= 44 && nav.right <= w + 1, `tabs fit with ${Math.round(nav.minW)}×${Math.round(nav.minH)}px targets`);
    await tap('.mobile-nav .nav-item[data-section=more]');
    const more = await G(() => [...document.querySelectorAll('.more-sheet .more-item')].map((b) => b.dataset.more));
    check(['management', 'settings', 'notices'].every((k) => more.includes(k)), `More: ${more.join(', ')}`);
    if (w === 412) await page.screenshot({ path: `${OUT}/mgmt-phone-more.png` });
    await tap('.more-sheet .more-item[data-more=management]');
    check(await G(() => window.__CDMT__.app.route === 'management'), 'More → Management');
    check(await G(() => document.querySelector('.mobile-nav .nav-item[data-section=more]').classList.contains('active')), 'More is highlighted while in Management');
    for (const t of ['overview', 'automation', 'hr', 'headhunter', 'rules', 'logistics', 'sales']) {
      await G((tab) => window.__CDMT__.app.go('management', { tab }), t);
      await wait(120);
      if (!(await noSideScroll(G))) check(false, `management/${t}: no sideways scroll at ${w}px`);
    }
    await G(() => window.__CDMT__.app.go('management', { tab: 'automation' }));
    await wait(200);
    const seg = await G(() => Math.min(...[...document.querySelectorAll('.mode-seg .seg-btn')].map((b) => b.getBoundingClientRect().height)));
    check(seg >= 44, `mode buttons ${Math.round(seg)}px tall`);
    if (w === 412) await page.screenshot({ path: `${OUT}/mgmt-phone-automation.png` });
    // The rule editor is a bottom sheet in portrait.
    await G(() => window.__CDMT__.app.go('management', { tab: 'rules' }));
    await wait(150);
    await tap('[data-act=add-rule]');
    await wait(400);
    const sheet = await G(() => { const r = document.querySelector('.modal-card').getBoundingClientRect(); return { bottom: r.bottom, w: r.width }; });
    check(Math.abs(sheet.bottom - hgt) <= 2 && sheet.w >= w - 2, 'dialogs are bottom sheets in portrait');
    check(!errors.length, `no page errors at ${w}px${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await ctx.close();
  }

  // ================================================================ landscape phones
  for (const [w, hgt] of [[800, 360], [891, 412], [900, 412]]) {
    console.log(`landscape ${w}×${hgt}`);
    const { ctx, page, errors, G, wait } = await start(browser, { viewport: { width: w, height: hgt }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const tap = async (sel) => { await page.locator(sel).locator('visible=true').first().tap(); await wait(); };
    check(await G(() => document.body.classList.contains('lay-landscape') && document.body.dataset.layout === 'landscape'), 'layout: landscape');
    const shell = await G(() => {
      const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return getComputedStyle(e).display === 'none' || !b.width ? null : { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      return { rail: r('.nav'), bottomNav: r('.mobile-nav'), main: r('.main') };
    });
    check(!!shell.rail && shell.rail.l <= 1 && shell.rail.w <= 90, `nav rail on the left (${shell.rail ? Math.round(shell.rail.w) : 0}px)`);
    check(!shell.bottomNav, 'no bottom navigation sideways');
    check(!!shell.main && shell.main.w >= w * 0.8 && shell.main.h >= hgt * 0.75, `world gets the space (${shell.main ? `${Math.round(shell.main.w)}×${Math.round(shell.main.h)}` : 'none'})`);
    const qa = await G(() => { const e = document.querySelector('.world-actions'); const b = e.getBoundingClientRect(); return { bottom: b.bottom, h: Math.min(...[...e.querySelectorAll('.wa-item')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getBoundingClientRect().height)) }; });
    check(qa.bottom >= hgt - 20 && qa.h >= 44, `quick actions along the bottom (${Math.round(qa.h)}px targets)`);
    // Selecting something opens the context panel on the right.
    const vid = await G(() => window.__CDMT__.state.vehicles.find((v) => v.slotId)?.id);
    if (vid) {
      await G((id) => window.__CDMT_WORLD__.select({ kind: 'vehicle', id }), vid);
      await wait(250);
      const pop = await G(() => { const e = document.querySelector('.world-pop.open'); if (!e) return null; const b = e.getBoundingClientRect(); return { side: e.classList.contains('side'), sheet: e.classList.contains('sheet'), l: b.left, r: b.right, h: b.height }; });
      check(!!pop && pop.side && !pop.sheet && pop.r >= w - 12 && pop.l >= w * 0.5, `context panel on the right (${pop ? `${Math.round(pop.l)}–${Math.round(pop.r)}` : 'missing'})`);
      if (w === 891) await page.screenshot({ path: `${OUT}/mgmt-landscape-context.png` });
      await G(() => document.querySelector('.world-pop .wm-close')?.click());
      await wait(150);
    }
    // Dialogs slide in from the right, full height.
    await G(() => window.__CDMT__.app.go('management', { tab: 'rules' }));
    await wait(200);
    await tap('[data-act=add-rule]');
    const drawer = await G(() => { const b = document.querySelector('.modal-card').getBoundingClientRect(); return { l: b.left, r: b.right, h: b.height }; });
    check(Math.abs(drawer.r - w) <= 2 && drawer.l > 40 && drawer.h >= hgt - 4, `dialog is a right-hand drawer (${Math.round(drawer.l)}–${Math.round(drawer.r)}, ${Math.round(drawer.h)}px tall)`);
    await G(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    for (const t of ['overview', 'automation', 'hr', 'logistics']) {
      await G((tab) => window.__CDMT__.app.go('management', { tab }), t);
      await wait(120);
      if (!(await noSideScroll(G))) check(false, `management/${t}: no sideways scroll at ${w}×${hgt}`);
    }
    const kpiCols = await G(() => getComputedStyle(document.querySelector('.grid.cols-4.kpis')).gridTemplateColumns.split(' ').length);
    check(kpiCols === 4, `landscape uses the width (${kpiCols} KPI columns)`);
    if (w === 891) await page.screenshot({ path: `${OUT}/mgmt-landscape-overview.png` });
    // Build mode sideways: catalogue left, details right, placement at the bottom.
    await G(() => window.__CDMT__.app.go('dealership'));
    await wait(300);
    await tap('[data-action=build]');
    await tap('[data-ctx=catalog]');
    await wait(200);
    const pal = await G(() => { const b = document.querySelector('.world-palette').getBoundingClientRect(); return { l: b.left, w: b.width, h: b.height }; });
    check(pal.l <= 1 && pal.w <= w * 0.42 && pal.h >= hgt * 0.8, `catalogue on the left (${Math.round(pal.w)}px wide, ${Math.round(pal.h)}px tall)`);
    await tap('.bp-tab[data-cat=decoration]');
    await tap('.bp-item[data-obj=plant]');
    await wait(250);
    const det = await G(() => { const e = document.querySelector('.world-detail.open'); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right }; });
    check(!!det && det.r >= w - 14 && det.l > w * 0.55, `item details on the right (${det ? `${Math.round(det.l)}–${Math.round(det.r)}` : 'missing'})`);
    const conf = await G(() => { const b = document.querySelector('.world-confirm').getBoundingClientRect(); return { b: b.bottom, t: b.top }; });
    check(conf.b >= hgt - 16, 'placement controls along the bottom');
    if (w === 891) await page.screenshot({ path: `${OUT}/mgmt-landscape-build.png` });
    await G(() => document.querySelector('.world-confirm [data-cb=stop]')?.click());
    await wait(150);
    await G(() => document.querySelector('.world-buildbar [data-bt=done]')?.click());
    check(!errors.length, `no page errors at ${w}×${hgt}${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await ctx.close();
  }

  // ================================================================ rotation without reload
  {
    console.log('rotation 412×891 → 891×412 → 412×891');
    const { ctx, page, errors, G, wait } = await start(browser, { viewport: { width: 412, height: 891 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await G(() => { window.__qaMarker = 'same-page'; window.__CDMT__.app.go('management', { tab: 'automation' }); });
    await wait(200);
    await page.setViewportSize({ width: 891, height: 412 });
    await wait(600);
    check(await G(() => document.body.classList.contains('lay-landscape') && window.__qaMarker === 'same-page'), 'turning sideways switches to landscape without a reload');
    check(await G(() => window.__CDMT__.app.route === 'management' && getComputedStyle(document.querySelector('.mobile-nav')).display === 'none'), '…same screen, rail instead of the bottom bar');
    await page.setViewportSize({ width: 412, height: 891 });
    await wait(600);
    check(await G(() => document.body.classList.contains('lay-portrait') && getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none'), 'and back to portrait with the bottom bar');
    check(!errors.length, `no page errors while rotating${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await ctx.close();
  }

  // ================================================================ big screens
  for (const [w, hgt, want] of [[1080, 2340, 'tablet'], [1280, 800, 'desktop'], [1920, 1080, 'desktop']]) {
    const touch = want === 'tablet';
    const { ctx, G } = await start(browser, { viewport: { width: w > hgt || !touch ? w : Math.round(w / 2.6), height: w > hgt || !touch ? hgt : Math.round(hgt / 2.6) }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2.6 } : {}) });
    const kind = await G(() => document.body.dataset.layout);
    if (!touch) check(kind === want, `${w}×${hgt}: layout ${kind}`);
    else check(kind === 'portrait' || kind === 'tablet', `${w}×${hgt} phone (${Math.round(w / 2.6)} CSS px): layout ${kind}`);
    await G(() => window.__CDMT__.app.go('management', { tab: 'overview' }));
    await new Promise((r) => setTimeout(r, 200));
    check(await noSideScroll(G), `${w}×${hgt}: Management fits`);
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\nMANAGEMENT QA: ${fails} failure(s)` : '\nmanagement QA passed');
  process.exit(fails ? 1 : 0);
})();
