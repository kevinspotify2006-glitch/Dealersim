// Performance check with a big late-game dealership: the largest plot, dozens
// of spaces and cars, a full team and months of ledger. Measures screen
// switches, simulated days, saving, and the dealership's frame rate.
// Usage: node tools/qa/perf.cjs [save.json]   (without a file it builds one)
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '../../dist/web/index.html');
(async () => {
  const given = process.argv[2] && fs.existsSync(process.argv[2]) && fs.statSync(process.argv[2]).isFile() ? fs.readFileSync(process.argv[2], 'utf8') : null;
  const browser = await chromium.launch();
  let failed = false;
  for (const vp of [{ width: 1440, height: 900 }, { width: 412, height: 891 }]) {
    const page = await (await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.click('text=New game');
    await page.click('text=Open the dealership');
    if (given) await page.evaluate((s) => window.cdmtLoad(JSON.parse(s)), given);
    else {
      await page.evaluate(() => {
        const G = window.__CDMT__;
        const s = G.state;
        s.settings.dailyReport = false; s.tutorial.dismissed = true; s.companyLevel = 5; s.cash = 5e6; s.stats.sold = 400;
        const loc = s.locations[0];
        for (let i = 0; i < 5; i += 1) G.lot.buyLand(s, loc);
        G.lot.applyTemplate(s, loc, 'volume');
        for (const r of ['workshop', 'workshop', 'detailing', 'office', 'lounge', 'showroom', 'showroom']) G.lot.buildQuickRoom(s, loc, r);
        for (let i = 0; i < 60; i += 1) if (!G.lot.autoPlace(s, loc, 'parking').ok) break;
        for (let d = 0; d < 60; d += 1) {
          const free = G.lot.lotStats(loc.lot).capacity - s.vehicles.filter((v) => v.locationId === loc.id || v.transferTo === loc.id).length;
          for (const o of s.offers.filter((x) => !x.auction).slice(0, Math.max(0, free))) G.trading.buyOffer(s, o.id, loc.id);
          for (const v of s.vehicles) if (v.status === 'yard') G.trading.listVehicle(s, v.id, true);
          G.engine.skipToNextDay();
        }
      });
    }
    await page.waitForTimeout(300);
    const res = await page.evaluate(async () => {
      const out = {};
      for (const r of ['reports', 'market', 'company', 'settings', 'dealership']) {
        const t0 = performance.now();
        window.__CDMT__.app.go(r);
        out[r] = Math.round(performance.now() - t0);
      }
      for (const p of ['cars', 'buy', 'staff', 'finances']) {
        const t0 = performance.now();
        window.__CDMT__.app.go('dealership', { panel: p });
        out[`panel ${p}`] = Math.round(performance.now() - t0);
      }
      const t0 = performance.now();
      for (let i = 0; i < 5; i += 1) window.__CDMT__.engine.skipToNextDay();
      out['5 days'] = Math.round(performance.now() - t0);
      const t1 = performance.now();
      window.__CDMT__.save();
      out.save = Math.round(performance.now() - t1);
      out.saveKB = Math.round(localStorage.getItem('cdmt:save:autosave').length / 1024);
      out.vehicles = window.__CDMT__.state.vehicles.length;
      out.spaces = window.__CDMT__.lot.lotStats(window.__CDMT__.state.locations[0].lot).capacity;
      window.__CDMT__.engine.setSpeed(3);
      // Frame rate of the live dealership with the clock running.
      const frames = await new Promise((resolve) => { let n = 0; const end = performance.now() + 2000; const f = () => { n += 1; if (performance.now() < end) requestAnimationFrame(f); else resolve(n); }; requestAnimationFrame(f); });
      out.fps = Math.round(frames / 2);
      window.__CDMT__.engine.setSpeed(0);
      return out;
    });
    console.log(vp.width, JSON.stringify(res), errors.length ? errors : 'no errors');
    if (errors.length || res.fps < 20) failed = true;
  }
  await browser.close();
  if (failed) process.exit(1);
})();
