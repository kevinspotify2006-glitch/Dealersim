// Save migration: a save written by version 3 (save format 4) loads into the
// current version with every new system filled in, then plays on for 90 days
// with no errors and sane numbers.
// Usage: node tools/qa/migrate.cjs   (after npm run build)
const path = require('path');
const fs = require('fs');
const js = (p) => require(path.join(__dirname, '../../build/js', p));
const { importSave, exportSave } = js('sim/save.js');
const { Engine } = js('sim/engine.js');
const { SAVE_VERSION } = js('sim/state.js');

const raw = fs.readFileSync(path.join(__dirname, 'fixtures/v3-save.json'), 'utf8');
const errors = [];
const s = importSave(raw);
if (!s) { console.log('MIGRATION FAILED: the v3 save did not load'); process.exit(1); }
const need = ['economy', 'funnel', 'clients', 'serviceJobs', 'contracts', 'research', 'decisions', 'fleet', 'missions', 'group', 'suppliers', 'branding', 'kpi', 'boosts'];
for (const k of need) if (s[k] === undefined) errors.push(`missing ${k} after migration`);
if (s.missions.active.length === 0) errors.push('no missions after migration');
for (const e of s.employees) if (!e.skills || e.stress === undefined) errors.push(`employee ${e.name} has no skills/stress`);
for (const v of s.vehicles) if (!v.drivetrain || !v.interior || !v.serviceHistory) errors.push(`vehicle ${v.id} missing v4 fields`);
for (const l of s.locations) if (!l.pricing || !l.delivery || !l.parts) errors.push(`location ${l.name} missing v4 fields`);
const eng = new Engine(s);
try {
  for (let d = 0; d < 90; d += 1) {
    eng.skipToNextDay();
    const st = eng.state;
    if (!Number.isFinite(st.cash)) { errors.push(`cash not finite on day ${st.day}`); break; }
    if (st.vehicles.some((v) => !Number.isFinite(v.askingPrice))) { errors.push(`bad asking price on day ${st.day}`); break; }
  }
} catch (e) { errors.push(`crash while playing on: ${e.stack}`); }
// Round trip in the new format.
const again = importSave(exportSave(eng.state));
if (!again || again.day !== eng.state.day) errors.push('round trip in the new format failed');
if (JSON.parse(exportSave(eng.state)).version !== SAVE_VERSION && JSON.parse(exportSave(eng.state)).saveVersion !== SAVE_VERSION) {
  const j = JSON.parse(exportSave(eng.state));
  if ((j.version ?? j.saveVersion ?? j.state?.version) !== SAVE_VERSION) errors.push('saved without the current version number');
}
if (errors.length) { console.log('MIGRATION FAILED:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log(`migration ok: v3 save (day ${JSON.parse(raw).state?.day ?? '?'}) → v${SAVE_VERSION}, played to day ${eng.state.day}, ${eng.state.stats.sold} sold, cash €${Math.round(eng.state.cash)}`);
