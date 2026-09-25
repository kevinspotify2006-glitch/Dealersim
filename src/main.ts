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
import { installPlatform, setBaseTitle, setResumeHook, setSaveHook } from './platform/platform';
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
import { clientsView, fleetView, salesFiView, serviceView } from './ui/views/business';
import { brandsView, missionsView, researchView } from './ui/views/growth';
import { economyView, groupView, identityView, kpiView, rivalsView, stockView } from './ui/views/empire';
import { RESEARCH } from './data/research';
import { researchState } from './sim/systems/research';
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
  live.register({ route: 'stock', label: 'Stock desk', icon: 'key', blurb: 'Ageing stock, repricing and certified pre-owned.', factory: stockView, badge: (s) => s.vehicles.filter((v) => v.status === 'listed' && v.daysInStock > 90).length });
  live.register({ route: 'retail', label: 'Sales & F&I', icon: 'handshake', blurb: 'Pricing policy, finance, protection products and the handover.', factory: salesFiView });
  live.register({ route: 'clients', label: 'Customers & CRM', icon: 'customer', blurb: 'Your client list, lifetime value and the sales funnel.', factory: clientsView });
  live.register({ route: 'service', label: 'Service & parts', icon: 'wrench', blurb: 'Workshop jobs, capacity and the parts store.', factory: serviceView, badge: (s) => s.serviceJobs.filter((j) => j.status === 'parts').length });
  live.register({ route: 'staff', label: 'Staff', icon: 'people', blurb: 'Hire, train, reward and organise your team.', factory: staffView, badge: (s) => s.employees.filter(canPromote).length });
  live.register({ route: 'marketing', label: 'Marketing', icon: 'marketing', blurb: 'Campaigns across eleven channels, budgets and results.', factory: marketingView });
  live.register({ route: 'fleet', label: 'Fleet sales', icon: 'car', blurb: 'Business customers ordering cars by the dozen.', factory: fleetView, badge: (s) => s.fleet.filter((r) => r.status === 'open').length });
  live.register({ route: 'missions', label: 'Missions & decisions', icon: 'check', blurb: 'Goals with rewards, and choices that need you.', factory: missionsView, badge: (s) => s.decisions.length });
  live.register({ route: 'research', label: 'Research', icon: 'sparkle', blurb: 'Projects that unlock new ways to do business.', factory: researchView, badge: (s) => (s.research.active ? 0 : RESEARCH.some((r) => researchState(s, r.id) === 'available' && r.cost <= s.cash) ? 1 : 0) });
  live.register({ route: 'brands', label: 'Brand contracts', icon: 'tag', blurb: 'Become an official dealer and sell new cars.', factory: brandsView });
  live.register({
    route: 'company', label: 'Company', icon: 'trophy', blurb: 'Your company: value, levels, achievements, services and legacy.',
    factory: tabbed('company', [
      { id: 'overview', label: 'Overview', factory: companyView },
      { id: 'services', label: 'Services', factory: upgradesView },
    ]),
  });
  live.register({ route: 'locations', label: 'Locations', icon: 'pin', blurb: 'Your dealerships, their pricing and new towns to open in.', factory: expansionView });
  live.register({ route: 'group', label: 'Dealer group', icon: 'layers', blurb: 'Headquarters, departments, regional managers and acquisitions.', factory: groupView });
  live.register({ route: 'rivals', label: 'Competitors', icon: 'eye', blurb: 'Who you are up against and what they are doing.', factory: rivalsView });
  live.register({ route: 'identity', label: 'Brand identity', icon: 'globe', blurb: 'Your colours, logo and brand promise.', factory: identityView });
  live.register({
    route: 'reports', label: 'Reports', icon: 'report', blurb: 'How the business is doing: money, sales, customers, stock and the economy.',
    badge: (s) => (s.cash < 0 ? 1 : 0),
    factory: tabbed('reports', [
      { id: 'overview', label: 'Overview', factory: dashboardView },
      { id: 'kpis', label: 'Key figures', factory: kpiView },
      { id: 'finances', label: 'Finances', factory: financesView },
      { id: 'sales', label: 'Sales', factory: salesView },
      { id: 'customers', label: 'Visitors', factory: customersView },
      { id: 'stock', label: 'Stock', factory: inventoryView },
      { id: 'economy', label: 'Economy', factory: economyView },
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
  setResumeHook(() => undefined);
  setBaseTitle('Car Dealership Manager Tycoon');
  showWelcome(root as HTMLElement, boot);
}

onLayoutChange(() => app?.refresh());
toTitle();
