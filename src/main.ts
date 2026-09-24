/**
 * Car Dealership Manager Tycoon — entry point.
 *
 * One code path for every platform: desktop browsers, phone browsers and the
 * Android APK (which loads this same bundle from its assets).
 */
import type { GameState } from './sim/types';
import { Engine } from './sim/engine';
import { saveGame, AUTOSAVE_ID, migrate } from './sim/save';
import { waitingCustomers } from './sim/customers';
import { App } from './ui/app';
import { showWelcome } from './ui/welcome';
import { installTooltips } from './ui/kit';
import { installPlatform, setBaseTitle, setSaveHook } from './platform/platform';
import { dashboardView } from './ui/views/dashboard';
import { inventoryView } from './ui/views/inventory';
import { dealershipView } from './ui/views/dealership';
import { upgradesView } from './ui/views/upgrades';
import { worldView } from './ui/views/world';
import { tabbed } from './ui/views/tabs';
import { marketView } from './ui/views/market';
import { customersView } from './ui/views/customers';
import { salesView } from './ui/views/sales';
import { marketingView } from './ui/views/marketing';
import { staffView } from './ui/views/staff';
import { financesView } from './ui/views/finances';
import { expansionView } from './ui/views/expansion';
import { companyView } from './ui/views/company';
import { settingsView } from './ui/views/settings';
import { resetTutorialUi } from './ui/tutorial';
import { canPromote } from './sim/staff';
import { onLayoutChange } from './ui/layout';
import * as trading from './sim/trading';
import * as lotSim from './sim/lot';
import { OBJ_BY_ID } from './data/lot';

const root = document.getElementById('app');
if (!root) throw new Error('#app is missing from the page');

installPlatform();
installTooltips();

let app: App | null = null;

function boot(state: GameState): void {
  app?.stop();
  resetTutorialUi();
  document.querySelectorAll('.modal-overlay, .tutorial, .toast-stack').forEach((el) => el.remove());
  const engine = new Engine(state);
  const live = new App(root as HTMLElement, engine, toTitle);
  app = live;
  setBaseTitle(`${state.companyName} — Car Dealership Manager Tycoon`);

  live.register({ route: 'dealership', label: 'Dealership', icon: 'garage', blurb: 'Your dealership. Tap anything; build, buy, sell and manage from here.', factory: worldView, badge: (s) => waitingCustomers(s).length });
  live.register({ route: 'market', label: 'Market', icon: 'store', blurb: 'Buy stock from dealers, private sellers and auctions.', factory: marketView });
  live.register({
    route: 'company', label: 'Company', icon: 'trophy', blurb: 'Your empire: team, locations, marketing, services and legacy.',
    badge: (s) => s.employees.filter(canPromote).length,
    factory: tabbed('company', [
      { id: 'overview', label: 'Overview', factory: companyView },
      { id: 'staff', label: 'Staff', factory: staffView, badge: (c) => c.state.employees.filter(canPromote).length },
      { id: 'locations', label: 'Locations', factory: expansionView },
      { id: 'marketing', label: 'Marketing', factory: marketingView },
      { id: 'services', label: 'Services', factory: upgradesView },
    ]),
  });
  live.register({
    route: 'reports', label: 'Reports', icon: 'report', blurb: 'How the business is doing: money, sales, customers and stock.',
    badge: (s) => (s.cash < 0 ? 1 : 0),
    factory: tabbed('reports', [
      { id: 'overview', label: 'Overview', factory: dashboardView },
      { id: 'finances', label: 'Finances', factory: financesView },
      { id: 'sales', label: 'Sales', factory: salesView },
      { id: 'customers', label: 'Customers', factory: customersView },
      { id: 'stock', label: 'Stock', factory: inventoryView },
      { id: 'dealership', label: 'Dealership', factory: dealershipView },
    ]),
  });
  live.register({ route: 'settings', label: 'Settings', icon: 'settings', blurb: 'Saves, sound and gameplay options.', factory: settingsView });
  live.start();
  // A deal that was open when the game was saved picks up where it left off.
  if (state.negotiation && !state.negotiation.done) live.serve(state.negotiation.customerId);

  const w = window as unknown as { __CDMT__?: unknown; cdmtExit?: (reason: string) => void; cdmtLoad?: (s: unknown) => void };
  w.cdmtExit = () => toTitle();
  w.cdmtLoad = (loaded: unknown) => {
    const s = migrate(loaded);
    if (s) boot(s);
  };
  // Test handle: drives the same engine the player uses, nothing more.
  w.__CDMT__ = {
    get state() { return engine.state; },
    engine,
    app: live,
    save: () => saveGame(engine.state, AUTOSAVE_ID),
    trading,
    lot: lotSim,
    objects: OBJ_BY_ID,
  };
}

function toTitle(): void {
  if (app) {
    app.stop();
    app = null;
  }
  resetTutorialUi();
  document.querySelectorAll('.modal-overlay, .tutorial, .toast-stack, .tooltip').forEach((el) => el.remove());
  setSaveHook(() => undefined);
  setBaseTitle('Car Dealership Manager Tycoon');
  showWelcome(root as HTMLElement, boot);
}

onLayoutChange(() => app?.refresh());
toTitle();
