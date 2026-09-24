/**
 * Contextual onboarding (the Business Manager approach): the tutorial reads the
 * real game state instead of scripting the player, never blocks input, and
 * steps complete however the player happens to do them.
 */
import type { GameState } from '../sim/types';
import type { Ctx } from './app';
import { h } from './dom';

interface Step {
  id: string;
  title: string;
  body: string;
  done: (s: GameState) => boolean;
  action?: { label: string; route: string; params?: Record<string, string> };
}

const STEPS: Step[] = [
  {
    id: 'open',
    title: 'This is your dealership',
    body: 'Drag to look around, scroll or pinch to zoom. Press ▶ to start the clock — customers walk in from the street during opening hours.',
    done: (s) => s.day > 1 || s.hour > 9 || s.stats.customersTotal > 0,
  },
  {
    id: 'serve',
    title: 'Serve a customer',
    body: 'Tap a customer standing by a car. Talk to learn what they want, offer a test drive, then Negotiate: counter their offer and close the deal.',
    done: (s) => s.stats.sold > 0,
    action: { label: 'Customers', route: 'dealership', params: { panel: 'customers' } },
  },
  {
    id: 'list',
    title: 'Put your cars on sale',
    body: 'Cars marked “!” are not for sale and earn nothing. Tap one and List it — it moves to a space where customers can see it.',
    done: (s) => s.vehicles.filter((v) => v.status === 'listed').length >= 2 || s.stats.sold >= 3,
  },
  {
    id: 'prep',
    title: 'Prepare a car',
    body: 'Tap a car → Prep and book a clean or a repair. A dirty car sells for less; the work happens on a lift or in a detailing bay if you have one.',
    done: (s) => s.vehicles.some((v) => v.costs.detailing > 0 || v.costs.repairs > 0) || s.soldArchive.some((v) => v.costs.detailing > 0 || v.costs.repairs > 0),
  },
  {
    id: 'inspect',
    title: 'Inspect before you trust',
    body: 'One car came from a private seller. Tap it → Inspect — hidden defects cost you later.',
    done: (s) => s.vehicles.some((v) => v.inspectionLevel >= 2) || s.soldArchive.some((v) => v.inspectionLevel >= 2) || s.stats.sold >= 4,
  },
  {
    id: 'buy',
    title: 'Buy your next car',
    body: 'Profit is made when you buy. Compare the price with the retail value and the risk before you commit. Every car needs a free space.',
    done: (s) => s.stats.vehiclesBought > 0,
    action: { label: 'Buy cars', route: 'dealership', params: { panel: 'buy' } },
  },
  {
    id: 'build',
    title: 'Make it yours',
    body: 'Open Build: paint a showroom, draw walls, drag desks, displays, lights and plants onto the map, and drag your cars to where you want them. Hover anything to see what it does. Ctrl+Z undoes.',
    done: (s) => s.transactions.some((t) => t.category === 'Construction') || s.day > 40,
    action: { label: 'Build', route: 'dealership', params: { build: '1' } },
  },
  {
    id: 'hire',
    title: 'Build the team',
    body: 'People need somewhere to work: a mechanic a lift, a detailer a bay, office staff a desk. Build one, then hire.',
    done: (s) => s.employees.length >= 2,
    action: { label: 'Staff', route: 'dealership', params: { panel: 'staff' } },
  },
];

let host: HTMLElement | null = null;
let shownId = '';
let collapsed = false;

function mark(visible: boolean): void {
  document.body.classList.toggle('has-tutorial', visible && !collapsed);
}

export function currentStep(state: GameState): { step: Step; index: number } | null {
  if (state.tutorial.dismissed || !state.settings.tutorial) return null;
  for (let i = 0; i < STEPS.length; i += 1) {
    const s = STEPS[i];
    if (state.tutorial.done[s.id]) continue;
    if (s.done(state)) {
      state.tutorial.done[s.id] = true;
      continue;
    }
    return { step: s, index: i };
  }
  return null;
}

export function renderTutorial(ctx: Ctx): void {
  const state = ctx.state;
  const cur = currentStep(state);
  const hideForModal = !!document.querySelector('.modal-overlay');
  if (!cur || hideForModal) {
    if (host) host.classList.add('hidden');
    if (!cur) {
      host?.remove();
      host = null;
      shownId = '';
    }
    mark(false);
    return;
  }
  if (host && shownId === cur.step.id) {
    host.classList.remove('hidden');
    mark(true);
    return;
  }
  if (shownId !== cur.step.id) collapsed = false;
  host?.remove();
  shownId = cur.step.id;
  const { step, index } = cur;
  const toggle = (): void => {
    collapsed = !collapsed;
    host?.classList.toggle('collapsed', collapsed);
    mark(true);
  };
  host = h('aside', { class: `tutorial${collapsed ? ' collapsed' : ''}`, aria: { label: 'Getting started' } },
    h('button', { class: 'tutorial-step', aria: { label: 'Show or hide the tip' }, on: { click: toggle } }, `Getting started · ${index + 1} of ${STEPS.length}`, h('span', { class: 'tutorial-caret', text: '▾' })),
    h('h4', { text: step.title }),
    h('p', { text: step.body }),
    h('div', { class: 'btn-row' },
      step.action ? h('button', { class: 'btn primary small', on: { click: () => ctx.go(step.action!.route, step.action!.params ?? {}) } }, step.action.label) : null,
      h('button', { class: 'btn ghost small', on: { click: () => { state.tutorial.dismissed = true; host?.remove(); host = null; mark(false); } } }, 'Hide tips')));
  document.body.appendChild(host);
  mark(true);
}

export function resetTutorialUi(): void {
  mark(false);
  host?.remove();
  host = null;
  shownId = '';
}
