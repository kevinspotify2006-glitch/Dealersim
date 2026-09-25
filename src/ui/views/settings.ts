import type { Ctx, View } from '../app';
import { confirmDialog, h, toast } from '../dom';
import { money } from '../../sim/format';
import { AUTOSAVE_ID, MANUAL_SLOTS, deleteSave, exportSave, importSave, listSaves, loadGame, saveGame, storageAvailable } from '../../sim/save';
import { pageHead, panel, panelTitle } from '../kit';
import { setMusic, setSound, play } from '../../platform/sound';
import { setHaptics } from '../../platform/platform';
import { resetTutorialUi } from '../tutorial';

type Exit = { cdmtExit?: (reason: string) => void; cdmtLoad?: (state: unknown) => void };

export function settingsView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  view.appendChild(pageHead('Settings', 'Saves, sound and how the game plays'));

  const toggle = (label: string, sub: string, value: boolean, set: (v: boolean) => void): HTMLElement =>
    h('label', { class: 'check-card' },
      h('input', { type: 'checkbox', checked: value, on: { change: (e: Event) => { set((e.target as HTMLInputElement).checked); play('click'); ctx.refresh(); } } }),
      h('span', {}, h('strong', { text: label }), h('span', { class: 'sub', text: sub })));

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  // Saves
  const saves = listSaves();
  const savePanel = panel(panelTitle('Saves', h('span', { class: 'sub', text: storageAvailable() ? 'stored on this device' : 'storage blocked — saving unavailable' })));
  const slotRow = (slot: string, label: string): HTMLElement => {
    const meta = saves.find((x) => x.slot === slot);
    return h('div', { class: 'save-slot' },
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: label }),
        h('div', { class: 'tiny muted', text: meta ? `${meta.companyName} · day ${meta.day} · ${money(meta.companyValue)} · ${new Date(meta.savedAt).toLocaleString()}` : 'Empty' })),
      h('div', { class: 'btn-row' },
        slot !== AUTOSAVE_ID ? h('button', {
          class: 'btn small primary', on: {
            click: async () => {
              if (meta && !(await confirmDialog('Overwrite save?', `Replace “${meta.companyName}, day ${meta.day}” with your current game?`, 'Overwrite'))) return;
              const r = saveGame(s, slot);
              toast(r.message, r.ok ? 'good' : 'bad');
              ctx.refresh();
            },
          },
        }, 'Save') : null,
        meta ? h('button', {
          class: 'btn small', on: {
            click: async () => {
              if (!(await confirmDialog('Load this save?', 'Unsaved progress in the current game will be lost.', 'Load'))) return;
              const loaded = loadGame(slot);
              if (!loaded) { toast('That save could not be read.', 'bad'); return; }
              (window as unknown as Exit).cdmtLoad?.(loaded);
            },
          },
        }, 'Load') : null,
        meta && slot !== AUTOSAVE_ID ? h('button', {
          class: 'btn small danger', on: {
            click: async () => {
              if (!(await confirmDialog('Delete save?', 'This cannot be undone.', 'Delete', true))) return;
              deleteSave(slot);
              ctx.refresh();
            },
          },
        }, 'Delete') : null));
  };
  savePanel.appendChild(slotRow(AUTOSAVE_ID, 'Autosave'));
  MANUAL_SLOTS.forEach((slot, i) => savePanel.appendChild(slotRow(slot, `Slot ${i + 1}`)));
  const fileIn = h('input', { type: 'file', class: 'visually-hidden', aria: { label: 'Import save file' } });
  (fileIn as HTMLInputElement).accept = '.json,application/json';
  fileIn.addEventListener('change', async () => {
    const file = (fileIn as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const loaded = importSave(text);
    if (!loaded) { toast('That file is not a Car Dealership Manager save.', 'bad'); return; }
    if (await confirmDialog('Import save?', `Load “${loaded.companyName}”, day ${loaded.day}? Your current game will be replaced.`, 'Import')) (window as unknown as Exit).cdmtLoad?.(loaded);
  });
  savePanel.appendChild(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    h('button', {
      class: 'btn', on: {
        click: () => {
          const blob = new Blob([exportSave(s)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${s.companyName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-day${s.day}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          toast('Save exported.', 'good');
        },
      },
    }, 'Export save file'),
    h('button', { class: 'btn', on: { click: () => fileIn.click() } }, 'Import save file'), fileIn));
  left.appendChild(savePanel);

  left.appendChild(panel('Game',
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', on: { click: () => { saveGame(s, AUTOSAVE_ID); (window as unknown as Exit).cdmtExit?.('menu'); } } }, 'Save & quit to title'),
      h('button', {
        class: 'btn danger', on: {
          click: async () => {
            if (!(await confirmDialog('Erase everything?', 'Deletes every save and legacy progress on this device. This cannot be undone.', 'Erase all data', true))) return;
            try {
              const keys: string[] = [];
              for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && k.startsWith('cdmt')) keys.push(k); }
              keys.forEach((k) => localStorage.removeItem(k));
            } catch { /* ignore */ }
            (window as unknown as Exit).cdmtExit?.('reset');
          },
        },
      }, 'Reset all data'))));

  right.appendChild(panel('Sound',
    toggle('Sound effects', 'Clicks, sales, customer chimes', s.settings.sound, (v) => { s.settings.sound = v; setSound(v); }),
    toggle('Music', 'A quiet ambient pad', s.settings.music, (v) => { s.settings.music = v; setMusic(v); }),
    toggle('Vibration', 'Haptic feedback on phones', s.settings.haptics, (v) => { s.settings.haptics = v; setHaptics(v); })));

  const thresh = h('select', { aria: { label: 'Confirm purchases above' } }, ...[5000, 10000, 20000, 50000, 100000, 1e12].map((n) => h('option', { value: String(n), selected: s.settings.confirmBigSpend === n }, n >= 1e12 ? 'Never ask' : `Ask above ${money(n)}`)));
  thresh.addEventListener('change', () => { s.settings.confirmBigSpend = Number(thresh.value); });
  right.appendChild(panel('Gameplay',
    toggle('Pause when a customer arrives', 'Great while learning. Turn off once your salespeople can cope.', s.settings.pauseOnCustomer, (v) => { s.settings.pauseOnCustomer = v; }),
    toggle('Staff serve missed customers', 'Salespeople close deals at or above each car\'s floor price.', s.settings.autoStaffDeals, (v) => { s.settings.autoStaffDeals = v; }),
    toggle('Closing-time report', 'At the end of each day, show how it went and what tomorrow brings before the doors open again.', s.settings.dailyReport, (v) => { s.settings.dailyReport = v; }),
    toggle('Autosave', 'Saves every in-game day and whenever the app goes to the background.', s.settings.autosave, (v) => { s.settings.autosave = v; }),
    toggle('Tips', 'Show the getting-started card.', s.settings.tutorial && !s.tutorial.dismissed, (v) => { s.settings.tutorial = v; s.tutorial.dismissed = !v; if (v) { s.tutorial.done = {}; resetTutorialUi(); } }),
    toggle('Reduce motion', 'Fewer animations.', s.settings.reducedMotion, (v) => { s.settings.reducedMotion = v; document.documentElement.classList.toggle('reduced-motion', v); }),
    h('label', { class: 'field' }, h('span', { text: 'Purchase confirmations' }), thresh)));

  right.appendChild(panel('Keyboard (PC)',
    h('div', { class: 'tiny muted' },
      h('p', { text: 'Space — pause / play' }), h('p', { text: '1 / 2 / 3 — game speed' }), h('p', { text: 'N — next day' }), h('p', { text: 'Esc — close dialog / go back' }))));
  right.appendChild(panel('About', h('p', { class: 'tiny muted', text: 'Car Dealership Manager Tycoon · all brands, models, towns and people are fictional. Works offline; your saves never leave this device unless you export them.' })));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
