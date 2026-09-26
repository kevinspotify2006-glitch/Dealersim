// Build-menu category tabs must never be clipped: at desktop, tablet and the
// Galaxy S25 Ultra in portrait and landscape every tab is either fully visible
// (wide screens: they wrap) or reachable by scrolling the tab strip (phones),
// with its whole label readable. Also checks every tab lists something, the
// search finds items by effect, role, room and price, and the page never
// scrolls sideways.
// Usage: node tools/qa/tabs.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');

const VIEWS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, wrap: true },
  { name: 'laptop', viewport: { width: 1280, height: 720 }, wrap: true },
  { name: 'tablet', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, wrap: true },
  { name: 's25-portrait', viewport: { width: 412, height: 891 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, wrap: false },
  { name: 's25-landscape', viewport: { width: 891, height: 412 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, wrap: false },
];

(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  const fail = (m) => { fails += 1; console.log('  ✗', m); };
  for (const v of VIEWS) {
    const { name, wrap, ...opts } = v;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('text=New game');
    await page.click('text=Open the dealership');
    await page.evaluate(() => { const s = window.__CDMT__.state; s.tutorial.dismissed = true; s.settings.pauseOnCustomer = false; window.__CDMT__.engine.setSpeed(0); document.querySelector('.tutorial')?.remove(); });
    await page.evaluate(() => document.querySelector('.wa-item[data-action=build]').click());
    await page.waitForSelector('.world.building .world-palette');
    await page.evaluate(() => document.querySelector('.bp-tab[data-cat="all"]').click());
    await page.waitForTimeout(250);
    const ids = await page.$$eval('.bp-tab', (els) => els.map((e) => e.dataset.cat));
    if (ids.length < 21) fail(`${name}: only ${ids.length} tabs`);
    for (const id of ids) {
      // Bring the tab into view the way a player would (scroll the strip), then measure.
      const r = await page.evaluate((cat) => {
        const tab = document.querySelector(`.bp-tab[data-cat="${cat}"]`);
        const strip = document.querySelector('.bp-tabs');
        const pal = document.querySelector('.world-palette');
        const scrollable = strip.scrollWidth > strip.clientWidth + 1;
        if (scrollable) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const t = tab.getBoundingClientRect();
        const s = strip.getBoundingClientRect();
        const p = pal.getBoundingClientRect();
        const name = tab.querySelector('.bp-tab-name');
        return {
          scrollable,
          inside: t.left >= s.left - 0.5 && t.right <= s.right + 0.5 && t.top >= s.top - 0.5 && t.bottom <= s.bottom + 0.5,
          inPalette: t.left >= p.left - 0.5 && t.right <= p.right + 0.5 && t.bottom <= window.innerHeight,
          truncated: name.scrollWidth > name.clientWidth + 1,
          h: t.height, w: t.width,
        };
      }, id);
      if (!r.inside || !r.inPalette) fail(`${name}: tab ${id} is clipped`);
      if (r.truncated) fail(`${name}: tab ${id} label is cut off`);
      if (wrap && r.scrollable) fail(`${name}: tabs should wrap, not scroll`);
      if (!wrap && !r.scrollable && ids.length > 8) fail(`${name}: expected a sideways-scrolling tab strip`);
      if (opts.hasTouch && r.h < 40 && !wrap) fail(`${name}: tab ${id} is only ${Math.round(r.h)}px tall (touch)`);
      // Open it: something must be listed.
      await page.evaluate((cat) => document.querySelector(`.bp-tab[data-cat="${cat}"]`).click(), id);
      await page.waitForTimeout(60);
      const listed = await page.evaluate(() => document.querySelectorAll('.bp-body .bp-item, .bp-body .bp-card, .bp-body .bp-row, .bp-body .bp-car').length);
      if (!listed) fail(`${name}: tab ${id} is empty`);
      const active = await page.evaluate(() => document.querySelector('.bp-tab.active')?.dataset.cat);
      if (active !== id) fail(`${name}: tab ${id} did not become active`);
    }
    const hscroll = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1);
    if (hscroll) fail(`${name}: the page scrolls sideways`);
    await page.evaluate(() => document.querySelector('.bp-tab[data-cat="all"]').click());
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${OUT}/tabs-${name}.png` });
    // Search: by effect, by role, by room, by price and by car type.
    // (On a phone the search field opens from the magnifier in the category row.)
    if (!(await page.locator('.bp-search-input').isVisible())) await page.evaluate(() => document.querySelector('.bp-sbtn')?.click());
    for (const [q, expect] of [['satisfaction', 'coffee'], ['mechanic', 'lift'], ['finance office', null], ['<200', 'plant'], ['luxury', 'premiumdisplay'], ['electric', 'charger']]) {
      await page.fill('.bp-search-input', q);
      await page.waitForTimeout(80);
      const found = await page.evaluate(() => ({ items: [...document.querySelectorAll('.bp-body .bp-item[data-obj]')].map((e) => e.dataset.obj), zones: document.querySelectorAll('.bp-body .bp-item[data-zone]').length }));
      if (expect && !found.items.includes(expect)) fail(`${name}: search “${q}” misses ${expect}`);
      if (!expect && !found.zones) fail(`${name}: search “${q}” finds no room`);
    }
    await page.fill('.bp-search-input', '');
    await page.evaluate(() => { const x = document.querySelector('.bp-sclose'); if (x && x.getBoundingClientRect().width) x.click(); });
    // Filters exist and work.
    for (const f of ['showroom', 'service', 'customer', 'staff', 'decoration', 'vehicle']) {
      const n = await page.evaluate((id) => { document.querySelector(`.bp-chip[data-filter="${id}"]`)?.click(); return document.querySelectorAll('.bp-body .bp-item[data-obj]').length; }, f);
      if (!n) fail(`${name}: filter ${f} lists nothing`);
    }
    await page.evaluate(() => document.querySelector('.bp-chip[data-filter="all"]').click());
    if (errors.length) fail(`${name}: page errors: ${errors.join(' | ')}`);
    console.log(`• ${name}: ${ids.length} tabs checked`);
    await ctx.close();
  }
  await browser.close();
  if (fails) { console.log(`TABS QA FAILED (${fails})`); process.exit(1); }
  console.log('TABS QA OK');
})();
