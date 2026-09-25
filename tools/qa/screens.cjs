// Visits every screen (and every tab) after some simulated play, on desktop,
// tablet and the Galaxy S25 Ultra (portrait and landscape): no page errors, no
// sideways page scroll, every destination reachable from the navigation within
// three taps, and a screenshot of each for review.
// Usage: node tools/qa/screens.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');
const VIEWS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true },
  { name: 's25-portrait', viewport: { width: 412, height: 891 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true },
  { name: 's25-landscape', viewport: { width: 891, height: 412 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true },
];
const ROUTES = ['dealership', 'market', 'stock', 'retail', 'clients', 'service', 'staff', 'marketing', 'fleet', 'missions', 'research', 'brands', 'company', 'locations', 'group', 'rivals', 'identity', 'reports', 'settings'];
const TABS = { company: ['overview', 'services'], reports: ['overview', 'kpis', 'finances', 'sales', 'customers', 'stock', 'economy', 'dealership'] };

(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  const fail = (m) => { fails += 1; console.log('  ✗', m); };
  for (const v of VIEWS) {
    const { name, ...opts } = v;
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
    // Some play: money, a level, a few weeks of simulated business.
    await page.evaluate(() => {
      const W = window.__CDMT__; const s = W.state;
      s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; s.settings.dailyReport = false;
      s.cash += 400000; s.companyLevel = 4; W.engine.setSpeed(0);
      for (let i = 0; i < 24 * 40; i += 1) W.engine.stepHour();
      document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
      document.querySelector('.tutorial')?.remove();
    });
    const shot = async (n) => page.screenshot({ path: `${OUT}/screen-${name}-${n}.png`, fullPage: false });
    for (const r of ROUTES) {
      const tabs = TABS[r] ?? [null];
      for (const t of tabs) {
        await page.evaluate(([route, tab]) => { document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.__CDMT__.app.go(route, tab ? { tab } : {}); }, [r, t]);
        await page.waitForTimeout(150);
        const info = await page.evaluate(() => ({
          h: document.scrollingElement.scrollWidth > window.innerWidth + 1,
          wide: [...document.querySelectorAll('.main *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 2 && !el.closest('.table-wrap, .scroll-x, .seg, .pill-row, .tabbar, .bp-tabs, .bp-filters, .world, .mb-brands, .world-hud'); }).slice(0, 3).map((el) => `${el.tagName}.${el.className}`),
        }));
        if (info.h) fail(`${name}/${r}${t ? `/${t}` : ''}: page scrolls sideways`);
        if (info.wide.length) fail(`${name}/${r}${t ? `/${t}` : ''}: sticks out: ${info.wide.join(', ')}`);
        await shot(`${r}${t ? `-${t}` : ''}`);
      }
    }
    // Navigation: every route reachable from the nav in ≤ 3 taps.
    const phone = name.startsWith('s25-portrait');
    for (const r of ROUTES) {
      await page.evaluate(() => window.__CDMT__.app.go('dealership'));
      await page.waitForTimeout(80);
      let taps = 0;
      const direct = await page.$(phone ? `.mobile-nav .nav-bar .nav-item[data-route="${r}"]` : `.sidebar .nav-item[data-route="${r}"], nav .nav-item[data-route="${r}"]`);
      if (direct && await direct.isVisible()) { await direct.click(); taps = 1; }
      else if (phone) {
        const section = await page.evaluate((route) => { const S = { dealership: ['dealership'], market: ['market', 'stock'], business: ['retail', 'clients', 'service', 'staff', 'marketing', 'fleet'], growth: ['missions', 'research', 'brands'], company: ['company', 'locations', 'group', 'rivals', 'identity'], reports: ['reports', 'settings'] }; return Object.keys(S).find((k) => S[k].includes(route)); }, r);
        const btn = await page.$(`.mobile-nav .nav-bar .nav-item[data-section="${section}"]`);
        if (btn) { await btn.click(); taps = 1; await page.waitForTimeout(80); }
        const item = await page.$(`.nav-sheet .nav-item[data-route="${r}"]`);
        if (item) { await item.click(); taps += 1; }
      }
      await page.waitForTimeout(100);
      const here = await page.evaluate(() => window.__CDMT__.app.route ?? document.querySelector('.nav-item.active')?.dataset.route);
      const active = await page.evaluate((route) => !!document.querySelector(`.nav-item.active[data-route="${route}"], .nav-item.active[data-section]`), r);
      if (!taps || taps > 3 || !active) fail(`${name}: ${r} not reachable from the navigation (${taps} taps, route ${here})`);
    }
    if (errors.length) fail(`${name}: errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
    console.log(`• ${name}: ${ROUTES.length} screens checked`);
    await ctx.close();
  }
  await browser.close();
  if (fails) { console.log(`SCREENS QA FAILED (${fails})`); process.exit(1); }
  console.log('SCREENS QA OK');
})();
