/**
 * Title screen: continue, new game (with challenge and legacy), load.
 */
import type { GameState } from '../sim/types';
import { h, icon, toast } from './dom';
import { money } from '../sim/format';
import { CHALLENGES, LEGACY_PERKS } from '../data/game';
import { createGame, defaultTemplate, loadLegacy, saveLegacy, startingTemplates } from '../sim/newgame';
import { perkCost } from '../sim/progress';
import { importSave, lastSlot, listSaves, loadGame } from '../sim/save';
import { carArt } from './art';
import { BRAND_COLORS, BRAND_LOGOS, BRAND_POSITIONS } from '../data/group';
import { play } from '../platform/sound';

export function showWelcome(root: HTMLElement, start: (state: GameState) => void): void {
  let mode: 'home' | 'new' | 'load' = 'home';
  let challenge = 'standard';
  let template = 'small';
  let company = 'Riverton Motors';
  let owner = '';
  let color = BRAND_COLORS[0];
  let logo = BRAND_LOGOS[0];
  let position = 'honest';

  const draw = (): void => {
    root.replaceChildren();
    const shell = h('div', { class: 'welcome-shell' });
    const wrap = h('div', { class: 'welcome' });
    const hero = h('div', { class: 'welcome-hero' });
    const cars = h('div', { class: 'hero-cars' });
    cars.appendChild(carArt({ body: 'Coupe', colorHex: '#b3202a', category: 'Sport' }, 260));
    cars.appendChild(carArt({ body: 'SUV', colorHex: '#e9ecef', category: 'SUV' }, 240));
    cars.appendChild(carArt({ body: 'Hatchback', colorHex: '#1f3b73', category: 'Compact' }, 200));
    hero.appendChild(h('div', { class: 'welcome-brand' },
      h('div', { class: 'welcome-mark' }, icon('gauge', 28)),
      h('div', {}, h('div', { class: 'welcome-kicker', text: 'Car Dealership' }), h('h1', { class: 'welcome-title', text: 'Manager Tycoon' }))));
    hero.appendChild(h('p', { class: 'welcome-tag', text: 'Buy smart. Fix it up. Sell it well. Build an automotive empire — one car at a time.' }));
    hero.appendChild(cars);
    wrap.appendChild(hero);

    if (mode === 'home') {
      const last = lastSlot();
      const meta = last ? listSaves().find((x) => x.slot === last) : undefined;
      const menu = h('div', { class: 'welcome-menu' });
      if (meta) {
        menu.appendChild(h('button', {
          class: 'menu-item primary', on: {
            click: () => {
              const st = loadGame(meta.slot);
              if (st) start(st);
              else toast('That save could not be read.', 'bad');
            },
          },
        }, h('span', { class: 'menu-title', text: 'Continue' }), h('span', { class: 'menu-sub', text: `${meta.companyName} · day ${meta.day} · ${money(meta.companyValue)}` })));
      }
      menu.appendChild(h('button', { class: `menu-item${meta ? '' : ' primary'}`, on: { click: () => { mode = 'new'; play('click'); draw(); } } },
        h('span', { class: 'menu-title', text: 'New game' }), h('span', { class: 'menu-sub', text: 'Design and run your own dealership' })));
      menu.appendChild(h('button', { class: 'menu-item', on: { click: () => { mode = 'load'; play('click'); draw(); } } },
        h('span', { class: 'menu-title', text: 'Load game' }), h('span', { class: 'menu-sub', text: `${listSaves().length} save(s) on this device` })));
      wrap.appendChild(menu);
      wrap.appendChild(h('div', { class: 'welcome-how' },
        ...[['Buy', 'Find bargains from dealers, private sellers and auctions.'], ['Prepare', 'Inspect, repair and detail to raise value.'], ['Sell', 'Negotiate with customers who each hide a budget.'], ['Build', 'Lay out showrooms, workshops and lots — then expand.']]
          .map(([t, d]) => h('div', { class: 'how' }, h('div', { class: 'how-title', text: t }), h('div', { class: 'tiny muted', text: d })))));
    }

    if (mode === 'new') {
      const legacy = loadLegacy();
      const form = h('div', { class: 'panel welcome-form' });
      const nameIn = h('input', { type: 'text', value: company, maxlength: 32, aria: { label: 'Dealership name' } });
      nameIn.addEventListener('input', () => { company = nameIn.value; });
      const ownerIn = h('input', { type: 'text', value: owner, placeholder: 'Your name', maxlength: 32, aria: { label: 'Your name' } });
      ownerIn.addEventListener('input', () => { owner = ownerIn.value; });
      form.appendChild(h('div', { class: 'grid cols-2' },
        h('label', { class: 'field' }, h('span', { text: 'Dealership name' }), nameIn),
        h('label', { class: 'field' }, h('span', { text: 'Your name' }), ownerIn)));
      form.appendChild(h('div', { class: 'field-label', text: 'Your brand (colour, logo and promise — you can rebrand later)' }));
      form.appendChild(h('div', { class: 'swatch-row' }, ...BRAND_COLORS.map((c) => h('button', { class: `swatch${c === color ? ' active' : ''}`, style: `background:${c}`, aria: { label: `Colour ${c}` }, on: { click: () => { color = c; draw(); } } }))));
      form.appendChild(h('div', { class: 'swatch-row', style: 'margin-top:8px' }, ...BRAND_LOGOS.map((l) => h('button', { class: `logo-pick${l === logo ? ' active' : ''}`, aria: { label: `Logo ${l}` }, on: { click: () => { logo = l; draw(); } } }, l))));
      const posSel = h('select', { aria: { label: 'Brand promise' }, style: 'margin-top:8px' }, ...BRAND_POSITIONS.map((p) => h('option', { value: p.id, selected: p.id === position }, `“${p.tagline}” — ${p.description}`)));
      posSel.addEventListener('change', () => { position = posSel.value; });
      form.appendChild(posSel);
      form.appendChild(h('div', { class: 'field-label', text: 'Starting conditions' }));
      form.appendChild(h('div', { class: 'scenario-grid' }, ...CHALLENGES.map((c) => h('button', {
        class: `scenario-card${challenge === c.id ? ' chosen' : ''}`,
        aria: { pressed: String(challenge === c.id) },
        on: { click: () => { challenge = c.id; draw(); } },
      }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: c.description }),
      h('div', { class: 'tiny', text: `${money(c.cash)} cash · ${c.vehicles} car${c.vehicles > 1 ? 's' : ''}${c.loan ? ` · ${money(c.loan)} loan` : ''}` })))));
      const layouts = startingTemplates(challenge, legacy.perks);
      if (!layouts.some((t) => t.id === template && t.allowed)) template = defaultTemplate(challenge);
      form.appendChild(h('div', { class: 'field-label', text: 'Your premises (you can rebuild everything later)' }));
      form.appendChild(h('div', { class: 'scenario-grid layouts' }, ...layouts.map((t) => h('button', {
        class: `scenario-card${template === t.id ? ' chosen' : ''}`,
        data: { template: t.id },
        disabled: !t.allowed,
        aria: { pressed: String(template === t.id) },
        on: { click: () => { template = t.id; draw(); } },
      }, h('div', { class: 'card-title', text: t.name }), h('div', { class: 'tiny muted', text: t.description }),
      h('div', { class: `tiny ${t.cashDelta > 0 ? 'good' : t.cashDelta < 0 ? 'bad' : ''}`, text: !t.allowed ? 'Too expensive for this start' : t.cashDelta === 0 ? 'Included' : t.cashDelta > 0 ? `+${money(t.cashDelta)} cash` : `−${money(-t.cashDelta)} cash` })))));
      if (legacy.points > 0 || LEGACY_PERKS.some((p) => legacy.perks[p.id])) {
        form.appendChild(h('div', { class: 'field-label', text: `Legacy perks · ${legacy.points} point${legacy.points === 1 ? '' : 's'} to spend` }));
        form.appendChild(h('div', { class: 'perk-grid' }, ...LEGACY_PERKS.map((p) => {
          const lvl = legacy.perks[p.id] ?? 0;
          const cost = perkCost(p.id, lvl);
          return h('div', { class: 'perk' },
            h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: `${p.name}${lvl ? ` (${lvl}/${p.max})` : ''}` }), h('div', { class: 'tiny muted', text: p.description })),
            h('button', {
              class: 'btn small', disabled: lvl >= p.max || legacy.points < cost,
              on: { click: () => { legacy.points -= cost; legacy.perks[p.id] = lvl + 1; saveLegacy(legacy); play('success'); draw(); } },
            }, lvl >= p.max ? 'Max' : `${cost} pts`));
        })));
      }
      form.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { class: 'btn ghost', on: { click: () => { mode = 'home'; draw(); } } }, 'Back'),
        h('button', {
          class: 'btn primary big', on: {
            click: () => {
              play('success');
              start(createGame({ companyName: company, ownerName: owner, challenge, template, color, logo, position }));
            },
          },
        }, 'Open the dealership')));
      wrap.appendChild(form);
    }

    if (mode === 'load') {
      const saves = listSaves();
      const list = h('div', { class: 'panel welcome-form' });
      if (!saves.length) list.appendChild(h('p', { class: 'empty', text: 'No saves on this device yet.' }));
      for (const sv of saves) {
        list.appendChild(h('button', {
          class: 'menu-item', on: {
            click: () => {
              const st = loadGame(sv.slot);
              if (st) start(st);
              else toast('That save could not be read.', 'bad');
            },
          },
        }, h('span', { class: 'menu-title', text: `${sv.companyName} — ${sv.slot === 'autosave' ? 'Autosave' : sv.slot.replace('slot', 'Slot ')}` }),
        h('span', { class: 'menu-sub', text: `Day ${sv.day} · level ${sv.level} · ${money(sv.companyValue)} · ${new Date(sv.savedAt).toLocaleString()}` })));
      }
      const fileIn = h('input', { type: 'file', class: 'visually-hidden', aria: { label: 'Import save file' } });
      (fileIn as HTMLInputElement).accept = '.json,application/json';
      fileIn.addEventListener('change', async () => {
        const f = (fileIn as HTMLInputElement).files?.[0];
        if (!f) return;
        const st = importSave(await f.text());
        if (st) start(st);
        else toast('That file is not a Car Dealership Manager save.', 'bad');
      });
      list.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { class: 'btn ghost', on: { click: () => { mode = 'home'; draw(); } } }, 'Back'),
        h('button', { class: 'btn', on: { click: () => fileIn.click() } }, 'Import save file'), fileIn));
      wrap.appendChild(list);
    }
    wrap.appendChild(h('p', { class: 'welcome-foot tiny muted', text: 'All brands and models are fictional. Plays offline. Saves stay on this device.' }));
    shell.appendChild(wrap);
    root.appendChild(shell);
  };
  draw();
}
