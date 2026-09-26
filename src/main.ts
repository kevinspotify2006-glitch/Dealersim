/**
 * Car Dealership Manager Tycoon — entry point.
 *
 * One code path for every platform: desktop browsers, phone browsers and the
 * Android APK (which loads this same bundle from its assets).
 */
import * as buildPlus from './sim/buildplus';
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
import { hub } from './ui/views/tabs';
import { serviceSummary } from './ui/mobile/summaries';
import { marketView } from './ui/views/market';
import { customersView } from './ui/views/customers';
import { salesView } from './ui/views/sales';
import { marketingView } from './ui/views/marketing';
import { recruitView, staffView } from './ui/views/staff';
import { procurementView } from './ui/views/procurement';
import { planningView } from './ui/views/planning';
import { conflicts } from './sim/systems/planning';
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
import { emit } from './sim/bus';
import { bookJob } from './sim/systems/service';

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
  live.register({
    route: 'inventory', label: 'Inventory', icon: 'car', blurb: 'Your cars: stock, buying, buyers, ageing and fleet orders.',
    badge: (s) => s.procurement.proposals.length + s.fleet.filter((r) => r.status === 'open').length,
    factory: hub('inventory', [
      { id: 'stock', label: 'Stock', icon: 'car', factory: inventoryView, badge: (c) => c.state.vehicles.filter((v) => v.status === 'yard').length },
      { id: 'buy', label: 'Buy', icon: 'store', factory: marketView },
      { id: 'buyers', label: 'Buyers', icon: 'search', factory: procurementView, badge: (c) => c.state.procurement.proposals.length },
      { id: 'ageing', label: 'Ageing & pricing', icon: 'tag', factory: stockView, badge: (c) => c.state.vehicles.filter((v) => v.status === 'listed' && v.daysInStock > 90).length },
      { id: 'fleet', label: 'Fleet orders', icon: 'handshake', factory: fleetView, badge: (c) => c.state.fleet.filter((r) => r.status === 'open').length },
    ]),
  });
  live.register({
    route: 'people', label: 'People', icon: 'people', blurb: 'Your team, recruitment, planning and your customers.',
    badge: (s) => s.employees.filter(canPromote).length,
    factory: hub('people', [
      { id: 'staff', label: 'Team', icon: 'people', factory: staffView, badge: (c) => c.state.employees.filter(canPromote).length },
      { id: 'hire', label: 'Recruitment', icon: 'customer', factory: recruitView },
      { id: 'planning', label: 'Planning', icon: 'clock', factory: planningView('people') },
      { id: 'customers', label: 'Customers & CRM', icon: 'handshake', factory: clientsView },
      { id: 'visitors', label: 'Visitors today', icon: 'eye', factory: customersView },
    ]),
  });
  live.register({
    route: 'service', label: 'Service', icon: 'wrench', blurb: 'Workshop planning, jobs, parts and appointments.',
    badge: (s) => s.locations.reduce((n, l) => n + conflicts(s, l.id, s.day).length + conflicts(s, l.id, s.day + 1).length, 0),
    factory: hub('service', [
      { id: 'planning', label: 'Planning', icon: 'clock', factory: planningView('service'), badge: (c) => conflicts(c.state, c.state.activeLocationId, c.state.day).length },
      { id: 'workshop', label: 'Workshop & parts', icon: 'wrench', factory: serviceView, badge: (c) => c.state.serviceJobs.filter((j) => j.status === 'parts').length },
    ], { summary: serviceSummary }),
  });
  live.register({
    route: 'business', label: 'Business', icon: 'report', blurb: 'Money, selling, growth and your company.',
    badge: (s) => s.decisions.length + (s.cash < 0 ? 1 : 0),
    factory: hub('business', [
      { id: 'overview', label: 'Overview', icon: 'dashboard', group: 'Money', factory: dashboardView },
      { id: 'kpis', label: 'Key figures', icon: 'gauge', group: 'Money', factory: kpiView },
      { id: 'finances', label: 'Finances', icon: 'finance', group: 'Money', factory: financesView, badge: (c) => (c.state.cash < 0 ? 1 : 0) },
      { id: 'sales', label: 'Sales report', icon: 'report', group: 'Money', factory: salesView },
      { id: 'economy', label: 'Economy', icon: 'globe', group: 'Money', factory: economyView },
      { id: 'retail', label: 'Sales & F&I', icon: 'handshake', group: 'Selling', factory: salesFiView },
      { id: 'marketing', label: 'Marketing', icon: 'marketing', group: 'Selling', factory: marketingView },
      { id: 'missions', label: 'Missions & decisions', icon: 'trophy', group: 'Growth', factory: missionsView, badge: (c) => c.state.decisions.length },
      { id: 'research', label: 'Research', icon: 'sparkle', group: 'Growth', factory: researchView, badge: (c) => (c.state.research.active ? 0 : RESEARCH.some((r) => researchState(c.state, r.id) === 'available' && r.cost <= c.state.cash) ? 1 : 0) },
      { id: 'brands', label: 'Brand contracts', icon: 'tag', group: 'Growth', factory: brandsView },
      { id: 'services', label: 'Services', icon: 'upgrade', group: 'Growth', factory: upgradesView },
      { id: 'company', label: 'Company', icon: 'worth', group: 'Company', factory: companyView },
      { id: 'locations', label: 'Locations', icon: 'pin', group: 'Company', factory: expansionView },
      { id: 'group', label: 'Dealer group', icon: 'store', group: 'Company', factory: groupView },
      { id: 'rivals', label: 'Competitors', icon: 'eye', group: 'Company', factory: rivalsView },
      { id: 'identity', label: 'Brand identity', icon: 'palette', group: 'Company', factory: identityView },
      { id: 'dealership', label: 'Dealership report', icon: 'garage', group: 'Company', factory: dealershipView },
      { id: 'stockreport', label: 'Stock report', icon: 'box', group: 'Money', factory: inventoryView },
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
    emit,
    service: { bookJob },
    build: buildPlus,
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
