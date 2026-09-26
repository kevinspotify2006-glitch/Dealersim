/**
 * The application shell (adapted from Business Manager's App): sidebar and
 * bottom navigation, the header with the live figures and the clock, view
 * mounting that never loses the scroll position, notifications and autosave.
 */
import type { GameState } from '../sim/types';
import { Engine } from '../sim/engine';
import { on } from '../sim/bus';
import { SPEEDS, SPEED_LABELS, activeLocation, vehicleName, OPEN_HOUR, CLOSE_HOUR } from '../sim/state';
import { AUTOSAVE_ID, saveGame } from '../sim/save';
import { calendar, money, moneyShort, seasonOf } from '../sim/format';
import { companyValue } from '../sim/finance';
import { levelDef } from '../sim/progress';
import { waitingCustomers } from '../sim/customers';
import { clear, dismissToast, h, modal, toast } from './dom';
import { icon } from './icons';
import { SECTIONS, sectionOfRoute } from './nav';
import type { NavSection } from './nav';
import { moneyFx, reputationStars, tipped } from './kit';
import { play, setMusic, setSound } from '../platform/sound';
import { haptic, handleBack, pushBackHandler, setHaptics, setResumeHook, setRouteBack, setSaveHook } from '../platform/platform';
import { renderTutorial } from './tutorial';
import { showLevelUp, showBankruptcy, showDailyReport } from './celebrate';
import { openNegotiation } from './modals/negotiation';
import { smartNotify } from './notify';
import { compactHud, openStatusSheet, updateCompactHud } from './mobile/hud';
import type { HudHost } from './mobile/hud';

export interface View {
  el: HTMLElement;
  /** Called a few times a second while the view is on screen. */
  update?: () => void;
  destroy?: () => void;
  /** Fills the whole page (the dealership), no padding or page scroll. */
  fullBleed?: boolean;
  /** Redraws in place; returning true means the view does not need rebuilding. */
  refresh?: () => boolean;
  /** Same screen, new parameters (e.g. open a panel over the dealership). */
  setParams?: (params: Record<string, string>) => void;
}

export interface Ctx {
  engine: Engine;
  readonly state: GameState;
  go: (route: string, params?: Record<string, string>) => void;
  refresh: () => void;
  params: Record<string, string>;
  /** Shows the outcome of a player action and refreshes. */
  act: (result: { ok: boolean; message: string }, opts?: { sound?: 'buy' | 'success' | 'cash' | 'sale'; money?: number; from?: Element | null }) => boolean;
  serve: (customerId: string) => void;
  /** Settles the rest of today and opens tomorrow. */
  nextDay: () => void;
}

export type ViewFactory = (ctx: Ctx) => View;

/** Old screen names that now live inside the dealership or a tab. */
/**
 * Screen names from before the compact navigation. Each now lives as a tab of
 * one of the six sections; `tabs` translates an old tab name where needed.
 */
export const ROUTE_ALIASES: Record<string, { route: string; params: Record<string, string>; tabs?: Record<string, string> }> = {
  customers: { route: 'dealership', params: { panel: 'customers' } },
  finances: { route: 'dealership', params: { panel: 'finances' } },
  build: { route: 'dealership', params: { build: '1' } },
  market: { route: 'inventory', params: { tab: 'buy' } },
  stock: { route: 'inventory', params: { tab: 'ageing' } },
  buyers: { route: 'inventory', params: { tab: 'buyers' } },
  fleet: { route: 'inventory', params: { tab: 'fleet' } },
  staff: { route: 'people', params: { tab: 'staff' } },
  recruit: { route: 'people', params: { tab: 'hire' } },
  clients: { route: 'people', params: { tab: 'customers' } },
  planning: { route: 'service', params: { tab: 'planning' } },
  workshop: { route: 'service', params: { tab: 'workshop' } },
  retail: { route: 'business', params: { tab: 'retail' } },
  marketing: { route: 'business', params: { tab: 'marketing' } },
  missions: { route: 'business', params: { tab: 'missions' } },
  decisions: { route: 'business', params: { tab: 'missions' } },
  research: { route: 'business', params: { tab: 'research' } },
  brands: { route: 'business', params: { tab: 'brands' } },
  company: { route: 'business', params: { tab: 'company' }, tabs: { overview: 'company', services: 'services' } },
  upgrades: { route: 'business', params: { tab: 'services' } },
  locations: { route: 'business', params: { tab: 'locations' } },
  expansion: { route: 'business', params: { tab: 'locations' } },
  group: { route: 'business', params: { tab: 'group' } },
  rivals: { route: 'business', params: { tab: 'rivals' } },
  identity: { route: 'business', params: { tab: 'identity' } },
  reports: { route: 'business', params: { tab: 'overview' }, tabs: { overview: 'overview', kpis: 'kpis', finances: 'finances', sales: 'sales', customers: 'visitors', stock: 'stockreport', economy: 'economy', dealership: 'dealership' } },
  economy: { route: 'business', params: { tab: 'economy' } },
  kpis: { route: 'business', params: { tab: 'kpis' } },
  dashboard: { route: 'business', params: { tab: 'overview' } },
  sales: { route: 'business', params: { tab: 'sales' } },
};

export const HOME_ROUTE = 'dealership';

interface NavEntry {
  route: string;
  label: string;
  icon: string;
  factory: ViewFactory;
  blurb: string;
  badge?: (state: GameState) => number;
}

export class App {
  engine: Engine;
  private root: HTMLElement;
  private entries: NavEntry[] = [];
  private current: View | null = null;
  private route = HOME_ROUTE;
  private params: Record<string, string> = {};
  private stack: { route: string; params: Record<string, string> }[] = [];
  private main!: HTMLElement;
  private inner!: HTMLElement;
  private navHost!: HTMLElement;
  private mobileNavHost!: HTMLElement;
  private topbar!: HTMLElement;
  private strip!: HTMLElement;
  private navOpen = true;
  private openSection: string | null = null;
  private sheetRelease: (() => void) | null = null;
  private updateTimer: number | null = null;
  private pendingRebuild = false;
  private lastAutosaveDay = 0;
  private unsubs: (() => void)[] = [];
  private onExit: () => void;

  constructor(root: HTMLElement, engine: Engine, onExit: () => void) {
    this.root = root;
    this.engine = engine;
    this.onExit = onExit;
    this.lastAutosaveDay = engine.state.day;
  }

  register(entry: NavEntry): void {
    this.entries.push(entry);
  }

  get state(): GameState {
    return this.engine.state;
  }

  start(): void {
    this.build();
    this.go(HOME_ROUTE);
    this.engine.start();
    setSound(this.state.settings.sound);
    setMusic(this.state.settings.music);
    setHaptics(this.state.settings.haptics);
    document.documentElement.classList.toggle('reduced-motion', this.state.settings.reducedMotion);
    setSaveHook(() => this.autosave(true));
    // Back from the background (Android): redraw at the new size and insets; the clock keeps its speed.
    setResumeHook(() => { this.refresh(true); });
    setRouteBack(() => this.stack.length > 0 || this.route !== HOME_ROUTE, () => this.back());

    this.unsubs.push(on('tick', () => this.updateChrome()));
    this.unsubs.push(on('day', () => {
      this.autosave(false);
      this.refresh();
      if (this.state.bankrupt) showBankruptcy(this.ctx(), this.onExit);
      else if (this.state.settings.dailyReport && this.state.history.length > 1) showDailyReport(this.ctx());
    }));
    this.unsubs.push(on('customer', ({ customerId }) => {
      const c = this.state.customers.find((x) => x.id === customerId);
      if (!c) return;
      const v = this.state.vehicles.find((x) => x.id === c.vehicleId);
      if (this.state.settings.pauseOnCustomer && this.state.speed > 0 && !document.querySelector('.modal-overlay')) {
        this.engine.setSpeed(0);
      }
      play('customer');
      haptic(15);
      toast(`${c.name} is interested in the ${v ? vehicleName(v) : 'car'}.`, 'warn', { label: 'Serve', run: () => this.serve(customerId) }, `c-${customerId}`);
      this.updateChrome();
      this.softRefresh();
    }));
    this.unsubs.push(on('sale', ({ vehicle, price, profit, byStaff }) => {
      play(byStaff ? 'cash' : 'sale');
      if (byStaff) {
        toast(`Sold: ${vehicleName(vehicle)} for ${money(price)} (${profit >= 0 ? '+' : ''}${money(profit)})`, profit >= 0 ? 'good' : 'bad');
        moneyFx(profit, document.getElementById('hud-cash'));
      }
      this.softRefresh();
    }));
    this.unsubs.push(on('notice', (n) => {
      if (smartNotify(this.ctx(), n)) { this.updateChrome(); return; }
      if (n.kind === 'bad' || n.kind === 'event') {
        toast(n.text, n.kind === 'bad' ? 'bad' : 'info');
        if (n.kind === 'event') play('notify');
      }
      this.updateChrome();
    }));
    this.unsubs.push(on('levelup', ({ level }) => {
      play('levelup');
      showLevelUp(this.ctx(), level);
    }));
    this.unsubs.push(on('achievement', () => play('success')));

    this.updateTimer = window.setInterval(() => {
      // Time stands still while a dialog is open, so nobody walks out while you read.
      this.engine.hold = !!document.querySelector('.modal-overlay, .drive-overlay');
      if (this.state.bankrupt && !document.querySelector('.bankrupt-modal')) showBankruptcy(this.ctx(), this.onExit);
      if (this.pendingRebuild && !this.busy()) this.refresh();
      else if (!this.busy()) this.current?.update?.();
      this.updateChrome();
    }, 300);

    document.addEventListener('keydown', this.onKey);
  }

  private onKey = (event: KeyboardEvent): void => {
    const t = event.target as HTMLElement | null;
    if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
    if (document.querySelector('.modal-overlay')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.engine.togglePause();
      this.updateChrome();
    } else if (event.key === 'n' || event.key === 'N') {
      this.nextDay();
    } else if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
      this.engine.setSpeed(Number(event.code.slice(5)));
      this.updateChrome();
    }
  };

  stop(): void {
    this.engine.stop();
    if (this.updateTimer !== null) window.clearInterval(this.updateTimer);
    for (const u of this.unsubs) u();
    this.unsubs = [];
    document.removeEventListener('keydown', this.onKey);
    this.current?.destroy?.();
    document.body.classList.remove('world-route');
  }

  ctx(): Ctx {
    const app = this;
    return {
      engine: this.engine,
      get state() { return app.engine.state; },
      go: (route, params) => this.go(route, params),
      refresh: () => this.refresh(true),
      params: this.params,
      act: (result, opts) => {
        if (result.ok) {
          if (result.message) toast(result.message, 'good');
          play(opts?.sound ?? 'success');
          haptic(10);
          if (opts?.money) moneyFx(opts.money, opts.from ?? null);
        } else {
          toast(result.message || 'That did not work.', 'bad');
          play('error');
        }
        this.refresh(true);
        return result.ok;
      },
      serve: (id) => this.serve(id),
      nextDay: () => this.nextDay(),
    };
  }

  serve(customerId: string): void {
    dismissToast(`c-${customerId}`);
    openNegotiation(this.ctx(), customerId);
  }

  go(route: string, params: Record<string, string> = {}, push = true): void {
    const alias = ROUTE_ALIASES[route];
    if (alias) {
      const tab = params.tab && alias.tabs ? alias.tabs[params.tab] ?? params.tab : params.tab;
      params = { ...alias.params, ...params, ...(tab ? { tab } : {}) };
      if (alias.params.tab && !alias.tabs) params.tab = alias.params.tab;
      route = alias.route;
    }
    const entry = this.entries.find((e) => e.route === route) ?? this.entries[0];
    if (!entry) return;
    // Same screen that can take new parameters in place (a panel over the dealership).
    if (entry.route === this.route && this.current?.setParams) {
      this.params = params;
      this.closeSheet();
      this.current.setParams(params);
      this.renderNav();
      return;
    }
    const moved = entry.route !== this.route || JSON.stringify(params) !== JSON.stringify(this.params);
    if (push && moved && this.current) {
      this.stack.push({ route: this.route, params: this.params });
      if (this.stack.length > 30) this.stack.shift();
    }
    this.route = entry.route;
    this.params = params;
    this.closeSheet();
    this.mount(entry, moved);
    play('click');
  }

  back(): void {
    const prev = this.stack.pop();
    if (prev) this.go(prev.route, prev.params, false);
    else if (this.route !== HOME_ROUTE) this.go(HOME_ROUTE, {}, false);
  }

  /** Rebuild the current view. `force` rebuilds even while a field has focus. */
  refresh(force = false): void {
    const entry = this.entries.find((e) => e.route === this.route) ?? this.entries[0];
    if (!entry) return;
    if (!force && this.busy()) {
      this.pendingRebuild = true;
      return;
    }
    this.pendingRebuild = false;
    if (this.current?.refresh?.()) {
      this.renderNav();
      this.updateChrome();
      return;
    }
    this.mount(entry, false);
  }

  /** Rebuild soon, when the player is not in the middle of something. */
  private softRefresh(): void {
    // Batched: the 300 ms update tick redraws once, however many things happened.
    this.pendingRebuild = true;
  }

  private busy(): boolean {
    if (document.querySelector('.modal-overlay')) return true;
    // Never rebuild a screen under a finger that is dragging something.
    if (document.querySelector('.plan-block.dragging')) return true;
    const active = document.activeElement;
    if (!active || !this.main.contains(active)) return false;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  }

  private mount(entry: NavEntry, toTop: boolean): void {
    const inner = this.inner;
    const held = inner.offsetHeight;
    const scroll = this.main.scrollTop;
    if (held > 0 && !toTop) inner.style.minHeight = `${held}px`;
    this.current?.destroy?.();
    try {
      this.current = entry.factory(this.ctx());
    } catch (error) {
      console.error('[cdmt] view failed', error);
      this.current = { el: h('div', { class: 'view' }, h('div', { class: 'panel' }, h('h3', { class: 'panel-title', text: 'Something went wrong drawing this screen' }), h('p', { class: 'muted', text: 'Your game is safe. Try another screen, or reload — your last autosave is kept.' }))) };
    }
    inner.replaceChildren(this.current.el);
    this.root.querySelector('.shell')?.classList.toggle('full-bleed', !!this.current.fullBleed);
    document.body.classList.toggle('world-route', !!this.current.fullBleed);
    if (toTop) this.main.scrollTop = 0;
    else this.main.scrollTop = scroll;
    requestAnimationFrame(() => requestAnimationFrame(() => { inner.style.minHeight = ''; }));
    this.renderNav();
    const title = document.getElementById('page-title');
    const blurb = document.getElementById('page-blurb');
    if (title) title.textContent = entry.label;
    if (blurb) blurb.textContent = entry.blurb;
    this.updateChrome();
    setRouteBack(() => this.stack.length > 0 || this.route !== HOME_ROUTE, () => this.back());
  }

  private build(): void {
    clear(this.root);
    try {
      this.navOpen = localStorage.getItem('cdmt.nav.open') !== '0';
    } catch {
      this.navOpen = true;
    }
    this.topbar = h('header', { class: 'topbar' });
    this.navHost = h('nav', { class: 'nav', aria: { label: 'Main navigation' } });
    this.mobileNavHost = h('nav', { class: 'mobile-nav', aria: { label: 'Main navigation' } });
    this.main = h('main', { class: 'main', id: 'main' });
    this.inner = h('div', { class: 'main-inner' });
    this.main.appendChild(this.inner);
    const mark = h('div', { class: 'brand-mark' });
    mark.appendChild(icon('gauge', 18));
    const brand = h('button', {
      class: 'brand',
      title: 'Show or hide the menu labels',
      aria: { label: 'Show or hide the menu labels' },
      on: { click: () => this.setNavOpen(!this.navOpen) },
    }, mark, h('div', { style: 'min-width:0' },
      h('div', { class: 'brand-name', text: 'Dealer Tycoon' }),
      h('div', { class: 'brand-sub', id: 'brand-company', text: this.state.companyName })));
    this.strip = h('div', { class: 'status-strip', role: 'status' });
    const shell = h('div', { class: 'shell' }, brand, this.topbar, this.strip, this.navHost, this.main, this.mobileNavHost);
    shell.addEventListener('click', (event) => {
      if (this.openSection === null) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.mobile-nav')) return;
      this.closeSheet();
      this.renderNav();
    }, { capture: true });
    this.root.appendChild(shell);
    this.renderTopbar();
    this.renderNav();
  }

  private setNavOpen(open: boolean): void {
    this.navOpen = open;
    try {
      localStorage.setItem('cdmt.nav.open', open ? '1' : '0');
    } catch { /* storage off: still works */ }
    this.renderNav();
  }

  private closeSheet(): void {
    this.openSection = null;
    this.sheetRelease?.();
    this.sheetRelease = null;
  }

  private screensIn(section: NavSection): NavEntry[] {
    return section.routes.map((r) => this.entries.find((e) => e.route === r)).filter((e): e is NavEntry => Boolean(e));
  }

  private renderNav(): void {
    const here = sectionOfRoute(this.route);
    // Desktop sidebar: grouped list (labels) or icon rail.
    clear(this.navHost);
    this.navHost.classList.toggle('open', this.navOpen);
    for (const section of SECTIONS) {
      const screens = this.screensIn(section);
      if (!screens.length) continue;
      const group = h('div', { class: 'nav-group' });
      if (this.navOpen && screens.length > 1) group.appendChild(h('div', { class: 'nav-group-head', text: section.label }));
      for (const entry of screens) {
        const count = entry.badge?.(this.state) ?? 0;
        const glyph = h('span', { class: 'nav-icon' });
        glyph.appendChild(icon(entry.icon, 17));
        const btn = h('button', {
          class: `nav-item${entry.route === this.route ? ' active' : ''}`,
          data: { route: entry.route },
          title: `${entry.label} — ${entry.blurb}`,
          aria: { label: entry.label, current: entry.route === this.route ? 'page' : 'false' },
          on: { click: () => this.go(entry.route) },
        }, glyph, h('span', { class: 'nav-label', text: entry.label }), count > 0 ? h('span', { class: 'nav-badge', text: String(count) }) : null);
        group.appendChild(btn);
      }
      this.navHost.appendChild(group);
    }
    this.navHost.appendChild(h('button', {
      class: 'nav-item nav-toggle',
      title: this.navOpen ? 'Collapse the menu' : 'Expand the menu',
      aria: { label: this.navOpen ? 'Collapse the menu' : 'Expand the menu' },
      on: { click: () => this.setNavOpen(!this.navOpen) },
    }, h('span', { class: 'nav-icon' }, icon('menu', 16)), h('span', { class: 'nav-label', text: 'Collapse' })));

    // Phone: five tabs and a sheet.
    clear(this.mobileNavHost);
    const openDef = SECTIONS.find((s) => s.id === this.openSection);
    if (openDef) {
      const screens = this.screensIn(openDef);
      this.mobileNavHost.appendChild(h('div', { class: 'nav-sheet' },
        h('div', { class: 'nav-sheet-head' }, h('span', { text: openDef.label }),
          h('button', { class: 'icon-btn', aria: { label: 'Close' }, on: { click: () => { this.closeSheet(); this.renderNav(); } } }, icon('close', 15))),
        h('div', { class: 'nav-sheet-body' }, ...screens.map((entry) => {
          const count = entry.badge?.(this.state) ?? 0;
          const glyph = h('span', { class: 'nav-icon' });
          glyph.appendChild(icon(entry.icon, 18));
          return h('button', {
            class: `nav-item${entry.route === this.route ? ' active' : ''}`,
            data: { route: entry.route },
            on: { click: () => this.go(entry.route) },
          }, glyph, h('span', { class: 'nav-label', text: entry.label }), count > 0 ? h('span', { class: 'nav-badge', text: String(count) }) : null);
        }))));
    }
    const bar = h('div', { class: 'nav-bar' });
    for (const def of SECTIONS) {
      // Phones keep the bar to the five play sections; Settings lives in the status sheet.
      if (def.id === 'settings') continue;
      const screens = this.screensIn(def);
      if (!screens.length) continue;
      const single = screens.length === 1;
      const count = screens.reduce((s, e) => s + (e.badge?.(this.state) ?? 0), 0);
      const glyph = h('span', { class: 'nav-icon' });
      glyph.appendChild(icon(def.icon, 20));
      bar.appendChild(h('button', {
        class: `nav-item${here?.id === def.id ? ' active' : ''}${this.openSection === def.id ? ' expanded' : ''}`,
        data: { section: def.id },
        aria: { label: def.label },
        on: {
          click: () => {
            if (single) { this.go(screens[0].route); return; }
            if (this.openSection === def.id) {
              this.closeSheet();
            } else {
              this.closeSheet();
              this.openSection = def.id;
              this.sheetRelease = pushBackHandler(() => { this.closeSheet(); this.renderNav(); return true; });
            }
            this.renderNav();
          },
        },
      }, glyph, h('span', { class: 'nav-label', text: def.short ?? def.label }), count > 0 ? h('span', { class: 'nav-badge', text: String(count) }) : null));
    }
    this.mobileNavHost.appendChild(bar);
  }

  private renderTopbar(): void {
    clear(this.topbar);
    const backBtn = h('button', { class: 'icon-btn topbar-back', id: 'hud-back', aria: { label: 'Back' }, on: { click: () => handleBack() } }, icon('back', 16));
    this.topbar.appendChild(backBtn);
    this.topbar.appendChild(h('div', { class: 'page-title' }, h('h1', { id: 'page-title', text: 'Dashboard' }), h('p', { id: 'page-blurb', text: '' })));
    // Phone: one compact card — cash and today's result, cars and staff —
    // that opens the full dealership status sheet.
    this.topbar.appendChild(compactHud(this.hudHost()));
    this.topbar.appendChild(h('div', { class: 'topbar-spacer' }));
    // The status bar: the whole business in one line, each figure a shortcut.
    // Desktop carries it in the header; a phone in a thin strip under it.
    const hud = h('div', { class: 'hud statusbar' });
    const chips: [string, string, string, () => void][] = [
      ['cash', 'cash', 'Cash in the bank, and this month\'s result.', () => this.go('business', { tab: 'finances' })],
      ['revenue', 'today', 'Today: the result so far and cars sold.', () => this.go('business', { tab: 'overview' })],
      ['car', 'stock', 'Cars in stock (arriving, being prepared, for sale).', () => this.go('inventory', { tab: 'stock' })],
      ['people', 'staff', 'Employees (and how many are at work today).', () => this.go('people', { tab: 'staff' })],
      ['wrench', 'service', 'Workshop jobs today and open service work.', () => this.go('service', { tab: 'planning' })],
      ['level', 'rep', 'Reputation (0–100).', () => this.go('business', { tab: 'company' })],
    ];
    const chip = (ic: string, key: string, tip: string, go: () => void, withIds: boolean): HTMLElement => tipped(h('button', { class: 'sb-chip', data: { hud: key }, on: { click: go } },
      h('span', { class: 'sb-ic' }, icon(ic, 17)),
      h('span', { class: 'sb-txt' }, h('span', { class: 'metric-value', data: { hudv: key }, ...(withIds ? { id: `hud-${key}` } : {}) }), h('span', { class: 'metric-sub', data: { huds: key } }))), tip);
    for (const c of chips) hud.appendChild(chip(c[0], c[1], c[2], c[3], true));
    this.strip.replaceChildren(...chips.map((c) => chip(c[0], c[1], c[2], c[3], false)));
    this.topbar.appendChild(hud);

    const waiting = h('button', { class: 'waiting-pill', id: 'hud-waiting', on: { click: () => this.go('dealership', { panel: 'customers' }) } }, icon('customer', 15), h('span', { id: 'hud-waiting-n', text: '0' }));
    tipped(waiting, 'Customers in the dealership (red: someone is waiting to be served).');
    this.topbar.appendChild(waiting);

    const clock = h('div', { class: 'clock' },
      h('div', { class: 'clock-date' }, h('span', { id: 'hud-date', class: 'clock-day' }), h('span', { id: 'hud-time', class: 'clock-time' })),
      h('div', { class: 'clock-bar' }, h('div', { class: 'clock-fill', id: 'hud-dayfill' })));
    this.topbar.appendChild(clock);

    const speeds = h('div', { class: 'speed-group', id: 'hud-speeds' });
    SPEEDS.forEach((_, index) => {
      const b = h('button', {
        class: 'speed-btn',
        data: { speed: String(index) },
        title: index === 0 ? 'Pause (space)' : `Speed ${SPEED_LABELS[index]} (${index})`,
        aria: { label: index === 0 ? 'Pause' : `Speed ${SPEED_LABELS[index]}` },
        on: { click: () => { this.engine.setSpeed(index); this.updateChrome(); play('click'); } },
      });
      if (index === 0) b.appendChild(icon('pause', 14));
      else if (index === 1) { b.appendChild(icon('play', 14)); b.classList.add('speed-play'); }
      else b.textContent = SPEED_LABELS[index];
      speeds.appendChild(b);
    });
    const next = h('button', { class: 'speed-btn next-day', id: 'hud-next', title: 'Skip to the next day (N)', aria: { label: 'Next day' }, on: { click: () => this.nextDay() } }, icon('next', 14), h('span', { class: 'next-label', text: 'Next day' }));
    speeds.appendChild(next);
    this.topbar.appendChild(speeds);

    this.topbar.appendChild(h('button', {
      class: 'icon-btn m-play', data: { playtoggle: '1' }, aria: { label: 'Pause' },
      on: { click: () => { this.engine.setSpeed(this.state.speed === 0 ? 1 : 0); haptic(8); this.updateChrome(); play('click'); } },
    }));
    const bellBtn = h('button', { class: 'icon-btn', title: 'Notifications', aria: { label: 'Notifications' }, on: { click: () => this.openNotices() } });
    bellBtn.appendChild(icon('bell', 16));
    this.topbar.appendChild(h('div', { class: 'bell' }, bellBtn, h('span', { class: 'bell-count', id: 'hud-alerts', text: '0' })));
    this.updateChrome();
  }

  nextDay(): void {
    if (document.querySelector('.negotiation')) return;
    const before = this.state.cash;
    this.engine.skipToNextDay();
    const diff = this.state.cash - before;
    if (Math.abs(diff) >= 1) moneyFx(diff, document.getElementById('hud-cash'));
    play('click');
  }

  private updateChrome(): void {
    const state = this.state;
    const set = (id: string, value: string, tone?: string): void => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-hudv="${id.replace('hud-', '')}"]`)) {
        if (el.textContent !== value) el.textContent = value;
        const cls = `metric-value${tone ? ` ${tone}` : ''}`;
        if (el.className !== cls) el.className = cls;
      }
    };
    const sub = (id: string, value: string): void => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-huds="${id.replace('hud-', '')}"]`)) if (el.textContent !== value) el.textContent = value;
    };
    const narrow = window.innerWidth <= 900;
    set('hud-cash', narrow && Math.abs(state.cash) >= 100000 ? moneyShort(state.cash) : money(state.cash), state.cash < 0 ? 'bad' : undefined);
    const month = state.month.profit - state.month.expenses;
    sub('hud-cash', `month ${month >= 0 ? '+' : '−'}${moneyShort(Math.abs(month))}`);
    const today = state.today.profit - state.today.expenses;
    set('hud-today', `${today >= 0 ? '+' : '−'}${moneyShort(Math.abs(today))}`, today > 0 ? 'good' : today < 0 ? 'bad' : undefined);
    sub('hud-today', `${state.today.sold} sold today`);
    void companyValue; void levelDef;
    const stock = state.vehicles.filter((v) => v.status !== 'sold');
    set('hud-stock', String(stock.length));
    sub('hud-stock', `${stock.filter((v) => v.status === 'listed').length} for sale`);
    const present = state.employees.filter((e) => e.absentDay !== state.day && e.trainingDaysLeft <= 0).length;
    set('hud-staff', String(state.employees.length));
    sub('hud-staff', present < state.employees.length ? `${present} at work` : 'staff');
    const jobsToday = state.appointments.filter((a) => a.kind === 'service' && a.day === state.day && a.status !== 'cancelled' && a.status !== 'missed').length;
    const open = state.serviceJobs.filter((j) => j.status !== 'done').length;
    set('hud-service', String(jobsToday));
    sub('hud-service', `${open} open`);
    set('hud-rep', `${Math.round(state.reputation)}`);
    sub('hud-rep', reputationStars(state.reputation));

    const cal = calendar(state.day);
    const date = document.getElementById('hud-date');
    const dateText = `${cal.weekday.slice(0, 3)} ${cal.dayOfMonth} ${cal.monthName.slice(0, 3)} Y${cal.year - 2025}`;
    if (date && date.textContent !== dateText) date.textContent = dateText;
    const time = document.getElementById('hud-time');
    const timeText = `${String(state.hour).padStart(2, '0')}:00 · ${seasonOf(state.day)}`;
    updateCompactHud(state);
    const paused = state.speed === 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-playtoggle]')) {
      if (el.dataset.paused !== String(paused)) {
        el.dataset.paused = String(paused);
        el.replaceChildren(icon(paused ? 'play' : 'pause', 16));
        el.setAttribute('aria-label', paused ? 'Play' : 'Pause');
      }
    }
    if (time && time.textContent !== timeText) time.textContent = timeText;
    const fill = document.getElementById('hud-dayfill');
    if (fill) fill.style.width = `${((state.hour - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR)) * 100}%`;

    const speeds = document.getElementById('hud-speeds');
    if (speeds) {
      for (const child of Array.from(speeds.children)) {
        const d = (child as HTMLElement).dataset.speed;
        if (d === undefined) continue;
        child.classList.toggle('active', Number(d) === state.speed);
      }
    }
    const waiting = waitingCustomers(state).length;
    const inside = state.customers.filter((c) => c.status === 'waiting' || c.status === 'negotiating').length;
    const pill = document.getElementById('hud-waiting');
    const pillN = document.getElementById('hud-waiting-n');
    if (pill && pillN) {
      const t = waiting ? `${inside} · ${waiting} waiting` : String(inside);
      if (pillN.textContent !== t) pillN.textContent = t;
      pill.classList.toggle('has', waiting > 0);
    }
    const unread = state.notices.filter((n) => !n.read).length;
    const badge = document.getElementById('hud-alerts');
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = unread > 0 ? '' : 'none';
    }
    const brandCompany = document.getElementById('brand-company');
    const bc = `${state.branding?.logo ?? ''} ${state.companyName} · ${activeLocation(state).name}`.trim();
    if (brandCompany && brandCompany.textContent !== bc) brandCompany.textContent = bc;
    const markEl = document.querySelector<HTMLElement>('.brand-mark');
    if (markEl && state.branding?.color && markEl.dataset.color !== state.branding.color) { markEl.dataset.color = state.branding.color; markEl.style.background = state.branding.color; }
    const back = document.getElementById('hud-back');
    if (back) back.classList.toggle('show', this.route !== HOME_ROUTE);
    this.renderBadges();
    renderTutorial(this.ctx());
  }

  private renderBadges(): void {
    for (const host of [this.navHost, this.mobileNavHost]) {
      for (const entry of this.entries) {
        const n = entry.badge?.(this.state) ?? 0;
        for (const item of host.querySelectorAll(`.nav-item[data-route="${entry.route}"]`)) paintBadge(item, n);
      }
      for (const def of SECTIONS) {
        const n = this.screensIn(def).reduce((s, e) => s + (e.badge?.(this.state) ?? 0), 0);
        const item = host.querySelector(`.nav-bar .nav-item[data-section="${def.id}"]`);
        if (item) paintBadge(item, n);
      }
    }
  }

  /** What the phone HUD and its status sheet need from the app. */
  private hudHost(): HudHost {
    return {
      state: () => this.state,
      engine: this.engine,
      go: (route, params) => this.go(route, params),
      nextDay: () => this.nextDay(),
      refresh: () => this.updateChrome(),
      openNotices: () => this.openNotices(),
    };
  }

  openStatus(): void {
    openStatusSheet(this.hudHost());
  }

  private openNotices(): void {
    const { body } = modal({ title: 'Notifications', width: 620, cls: 'notice-sheet' });
    const notices = this.state.notices;
    if (!notices.length) {
      body.appendChild(h('div', { class: 'empty-state' }, h('span', { class: 'empty-ic' }, icon('bell', 26)),
        h('div', { class: 't-section', text: 'All caught up' }),
        h('p', { class: 't-secondary', text: 'Sales, arrivals, events and warnings will show up here.' })));
    }
    const KIND_ICON: Record<string, string> = { bad: 'critical', event: 'warning', good: 'good', sale: 'cash', info: 'info' };
    const row = (n: (typeof notices)[number]): HTMLElement => h('div', { class: `alert-row notice-${n.kind}${n.read ? '' : ' unread'}` },
      h('span', { class: `notice-ic ${n.kind}` }, icon(KIND_ICON[n.kind] ?? 'info', 16)),
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'alert-title', text: n.text.replace(/^[^\p{L}\p{N}€+−-]+\s*/u, '') })),
      h('span', { class: 'alert-time', text: n.day === this.state.day ? 'Today' : `Day ${n.day}` }));
    const unread = notices.filter((n) => !n.read).slice(0, 60);
    const earlier = notices.filter((n) => n.read).slice(0, Math.max(0, 60 - unread.length));
    if (unread.length) body.append(h('div', { class: 't-label', text: `New (${unread.length})` }), ...unread.map(row));
    if (earlier.length) body.append(h('div', { class: 't-label', text: 'Earlier' }), ...earlier.map(row));
    for (const n of notices) n.read = true;
    this.updateChrome();
  }

  autosave(force: boolean): void {
    const state = this.state;
    if (!state.settings.autosave && !force) return;
    if (!force && state.day === this.lastAutosaveDay) return;
    this.lastAutosaveDay = state.day;
    const r = saveGame(state, AUTOSAVE_ID);
    if (!r.ok && !force) toast(r.message, 'bad');
  }
}

function paintBadge(item: Element, count: number): void {
  const existing = item.querySelector('.nav-badge');
  if (count > 0) {
    if (existing) existing.textContent = String(count);
    else item.appendChild(h('span', { class: 'nav-badge', text: String(count) }));
  } else if (existing) existing.remove();
}
