// Smoke test: boots the built game in Chromium, starts a new game, visits every
// screen at desktop and phone sizes, and fails on any console error.
// Usage: node tools/qa/smoke.cjs [outDir]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../build/qa'));
require('fs').mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');
const ROUTES = ['dealership', 'market', 'company', 'reports', 'settings', 'inventory', 'customers', 'staff', 'finances', 'upgrades', 'expansion', 'marketing', 'dashboard', 'sales', 'build'];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, vp] of [['desktop', { width: 1440, height: 900, dsf: 1, mobile: false }], ['phone', { width: 412, height: 915, dsf: 1, mobile: true }]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
    await page.goto(URL);
    await page.screenshot({ path: `${OUT}/${name}-00-title.png` });
    await page.click('text=New game');
    await page.screenshot({ path: `${OUT}/${name}-01-new.png` });
    await page.click('text=Open the dealership');
    await page.waitForTimeout(300);
    for (const r of ROUTES) {
      await page.evaluate((route) => window.__CDMT__.app.go(route), r);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${name}-${r}.png`, fullPage: false });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.main').scrollWidth > document.querySelector('.main').clientWidth + 1);
      if (overflow) errors.push(`[${name}] horizontal overflow on ${r}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('smoke ok');
})();
