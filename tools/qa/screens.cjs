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
const ROUTES = ['dealership', 'inventory', 'people', 'service', 'business', 'settings'];
const TABS = {
  inventory: ['stock', 'buy', 'buyers', 'ageing', 'fleet'],
  people: ['staff', 'hire', 'planning', 'customers', 'visitors'],
  service: ['planning', 'workshop'],
  business: ['overview', 'kpis', 'finances', 'sales', 'economy', 'stockreport', 'retail', 'marketing', 'missions', 'research', 'brands', 'services', 'company', 'locations', 'group', 'rivals', 'identity', 'dealership'],
};

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
          wide: [...document.querySelectorAll('.main *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 2 && !el.closest('.table-wrap, .scroll-x, .seg, .pill-row, .tabbar, .bp-tabs, .bp-filters, .world, .mb-brands, .world-hud, .hub-tabs, .hub-groups, .plan-scroll'); }).slice(0, 3).map((el) => `${el.tagName}.${el.className}`),
        }));
        if (info.h) fail(`${name}/${r}${t ? `/${t}` : ''}: page scrolls sideways`);
        const mainBox = await page.evaluate(() => { const b = document.querySelector('.main').getBoundingClientRect(); return { w: b.width, h: b.height }; });
        if (mainBox.w < opts.viewport.width * 0.6 || mainBox.h < opts.viewport.height * 0.45) fail(`${name}/${r}${t ? `/${t}` : ''}: the page area is squeezed (${Math.round(mainBox.w)}×${Math.round(mainBox.h)})`);
        if (info.wide.length) fail(`${name}/${r}${t ? `/${t}` : ''}: sticks out: ${info.wide.join(', ')}`);
        await shot(`${r}${t ? `-${t}` : ''}`);
      }
    }
    // Navigation: every section is one tap away; every tab one more (a grouped tab at most two more).
    const phone = name === 's25-portrait';
    for (const r of ROUTES) {
      await page.evaluate(() => { document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()); window.__CDMT__.app.go('dealership'); });
      await page.waitForTimeout(80);
      if (phone && r === 'settings') {
        // Phones: Settings sits behind the header card (two taps), not in the bottom bar.
        await page.click('#m-hud');
        await page.waitForTimeout(150);
        await page.click('.status-sheet [data-act=settings]');
        await page.waitForTimeout(150);
        if ((await page.evaluate(() => window.__CDMT__.app.route)) !== 'settings') fail(`${name}: settings not reached from the header`);
        continue;
      }
      const sel = phone ? `.mobile-nav .nav-bar .nav-item[data-section="${r}"]` : `.nav .nav-item[data-route="${r}"]`;
      const btn = await page.$(sel);
      if (!btn || !(await btn.isVisible())) { fail(`${name}: no navigation button for ${r}`); continue; }
      await btn.click();
      await page.waitForTimeout(120);
      const here = await page.evaluate(() => window.__CDMT__.app.route);
      if (here !== r) fail(`${name}: ${r} not reached in one tap (at ${here})`);
      for (const t of TABS[r] ?? []) {
        let taps = 1;
        const tab = await page.$(`.hub-tab[data-tab="${t}"]`);
        if (!tab) {
          // In another group: tap the group first.
          const group = await page.evaluate((id) => { for (const b of document.querySelectorAll('.hub-group')) { b.click(); const found = document.querySelector(`.hub-tab[data-tab="${id}"]`); if (found) return b.dataset.group; } return null; }, t);
          await page.waitForTimeout(120);
          if (!group) { fail(`${name}: tab ${r}/${t} not found`); continue; }
          taps += 1;
        }
        await page.evaluate((id) => document.querySelector(`.hub-tab[data-tab="${id}"]`)?.click(), t);
        taps += 1;
        await page.waitForTimeout(120);
        const ok = await page.evaluate((id) => !!document.querySelector(`.hub-tab.active[data-tab="${id}"]`), t);
        if (!ok || taps > 3) fail(`${name}: tab ${r}/${t} took ${taps} taps (active ${ok})`);
      }
    }
    if (errors.length) fail(`${name}: errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
    console.log(`• ${name}: ${ROUTES.length} screens checked`);
    await ctx.close();
  }
  await browser.close();
  if (fails) { console.log(`SCREENS QA FAILED (${fails})`); process.exit(1); }
  console.log('SCREENS QA OK');
})();
