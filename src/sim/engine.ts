/**
 * The simulation clock (adapted from Business Manager's engine).
 *
 * Real time drives an accumulator of in-game hours. Every whole hour runs the
 * hourly tick (customers walking in); reaching closing time settles the day,
 * and the first day of a week or month runs the weekly and monthly work. The
 * same code path runs at every speed, and "Next day" simply runs the remaining
 * hours at once — so fast-forwarding never changes the outcome.
 */
import { procurementDaily, procurementMonthly } from './systems/procurement';
import { styleMonthly } from './buildplus';
import { setStaffDay } from './staff';
import { planningHour } from './systems/planning';
import type { GameState } from './types';
import { CLOSE_HOUR, HISTORY_LIMIT, OPEN_HOUR, SPEEDS, pushNotice } from './state';
import { emit } from './bus';
import { clamp } from './util';
import { customersClose, customersHour, scheduleArrivals } from './customers';
import { arrivalsDaily, refreshOffers, resolveAuctions } from './trading';
import { prepDaily, presentationDecay } from './vehicles';
import { dailyCosts, companyValue, inventoryValue, monthlyCosts } from './finance';
import { payrollWeekly, refreshCandidates, staffDaily } from './staff';
import { serviceDaily } from './systems/service';
import { researchDaily } from './systems/research';
import { fleetDaily, fleetMonthly, fleetWeekly } from './systems/fleet';
import { missionsDaily } from './systems/missions';
import { decisionsDaily } from './systems/decisions';
import { contractsMonthly } from './systems/brands';
import { groupMonthly } from './systems/group';
import { inventoryWeekly } from './systems/inventory';
import { economyWeekly } from './systems/economy';
import { emptyFunnel, emptyKpi } from './state';
import { competitorsDaily, competitorsWeekly, eventsDaily } from './world';
import { complaintsDaily } from './sales';
import { checkAchievements, checkLevel } from './progress';
import { driftTrends } from './market';
import { gameRng } from './rng';
import { DAYS_PER_MONTH, calendar } from './format';
import { assignSlots, assignStations, lotStats } from './lot';

export class Engine {
  state: GameState;
  private accumulator = 0;
  private lastFrame = 0;
  private frame: number | null = null;
  private running = false;
  /** Set by the UI while a dialog needs the clock held. */
  hold = false;

  constructor(state: GameState) {
    this.state = state;
  }

  replaceState(state: GameState): void {
    this.state = state;
    this.accumulator = 0;
    emit('reset', undefined);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      // Cap the delta so a backgrounded tab does not fast-forward a week.
      const delta = clamp((now - this.lastFrame) / 1000, 0, 0.5);
      this.lastFrame = now;
      this.advance(delta);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  setSpeed(index: number): void {
    this.state.speed = clamp(Math.round(index), 0, SPEEDS.length - 1);
  }

  togglePause(): void {
    this.state.speed = this.state.speed === 0 ? 1 : 0;
  }

  /** Advances by `seconds` of real time. */
  advance(seconds: number): void {
    if (this.hold || this.state.bankrupt) return;
    const hoursPerSecond = SPEEDS[this.state.speed] ?? 0;
    if (hoursPerSecond <= 0) return;
    this.accumulator += seconds * hoursPerSecond;
    let steps = 0;
    while (this.accumulator >= 1 && steps < 24) {
      this.accumulator -= 1;
      steps += 1;
      this.stepHour();
      if (this.hold || this.state.speed === 0) {
        this.accumulator = 0;
        break;
      }
    }
    if (steps > 0) emit('tick', { day: this.state.day, hour: this.state.hour });
  }

  /** Runs one in-game hour. */
  stepHour(): void {
    const state = this.state;
    setStaffDay(state.day);
    customersHour(state);
    planningHour(state);
    for (const loc of state.locations) assignSlots(state, loc);
    state.hour += 1;
    if (state.hour >= CLOSE_HOUR) this.endDay();
  }

  /** Runs the rest of today (staff handle anyone waiting) and opens tomorrow. */
  skipToNextDay(): void {
    if (this.state.bankrupt) return;
    const guard = this.state.day;
    while (this.state.day === guard) this.stepHour();
    this.accumulator = 0;
    emit('tick', { day: this.state.day, hour: this.state.hour });
  }

  private endDay(): void {
    const state = this.state;
    customersClose(state);
    resolveAuctions(state);
    prepDaily(state);
    serviceDaily(state);
    presentationDecay(state);
    staffDaily(state);
    researchDaily(state);
    fleetDaily(state);
    procurementDaily(state);
    for (const loc of state.locations) {
      assignStations(state, loc);
      // A day with the doors closed: the team catches its breath.
      if (!loc.lot.open) for (const e of state.employees) if (e.locationId === loc.id) e.morale = Math.min(100, e.morale + 2);
      // A staff room, a good manager's office and small comforts keep the team happy.
      const fx = lotStats(loc.lot).effects;
      const lift = Math.min(6, fx.morale ?? 0) * 0.25 + Math.min(5, fx.management ?? 0) * 0.3;
      if (lift > 0) for (const e of state.employees) if (e.locationId === loc.id) e.morale = Math.min(100, e.morale + lift);
    }
    dailyCosts(state);
    complaintsDaily(state);
    competitorsDaily(state);

    // Record the day.
    const value = companyValue(state);
    state.history.push({
      day: state.day,
      revenue: state.today.revenue,
      expenses: state.today.expenses,
      profit: state.today.profit - state.today.expenses,
      cash: state.cash,
      inventoryValue: inventoryValue(state),
      sold: state.today.sold,
      leads: state.today.leads,
      companyValue: value,
    });
    if (state.history.length > HISTORY_LIMIT) state.history.shift();

    // Cash trouble.
    if (state.cash < 0) {
      state.overdraftDays += 1;
      if (state.overdraftDays === 1) pushNotice(state, 'bad', 'You are overdrawn. Sell stock, cut costs or take a loan — the bank charges daily interest.');
      if (state.overdraftDays === 20) pushNotice(state, 'bad', 'Ten days until the bank calls in the overdraft!');
      if (state.overdraftDays >= 30) state.bankrupt = true;
    } else {
      state.overdraftDays = 0;
    }

    checkAchievements(state);
    checkLevel(state);
    missionsDaily(state);

    // ---- next day
    state.day += 1;
    state.hour = OPEN_HOUR;
    state.today = { revenue: 0, expenses: 0, profit: 0, sold: 0, leads: 0 };
    const cal = calendar(state.day);

    if (cal.dayOfMonth === 1) this.endMonth();
    if ((state.day - 1) % 7 === 0) {
      driftTrends(state, () => gameRng.next());
      economyWeekly(state);
      competitorsWeekly(state);
      refreshCandidates(state);
      payrollWeekly(state);
      fleetWeekly(state);
      inventoryWeekly(state);
    }
    state.boosts = state.boosts.filter((b) => b.until >= state.day);
    arrivalsDaily(state);
    eventsDaily(state);
    decisionsDaily(state);
    refreshOffers(state);
    state.campaigns = state.campaigns.filter((c) => c.endDay >= state.day - 60);
    scheduleArrivals(state);
    emit('day', { day: state.day });
  }

  private endMonth(): void {
    const state = this.state;
    monthlyCosts(state);
    groupMonthly(state);
    contractsMonthly(state);
    procurementMonthly(state);
    styleMonthly(state);
    fleetMonthly(state);
    state.funnel.last = { ...state.funnel.month };
    state.funnel.month = emptyFunnel();
    state.kpiLast = { ...state.kpi };
    state.kpi = emptyKpi();
    const net = state.month.profit - state.month.expenses;
    state.stats.bestMonthProfit = Math.max(state.stats.bestMonthProfit, net);
    const cal = calendar(state.day - 1);
    pushNotice(state, net >= 0 ? 'good' : 'bad',
      `${cal.monthName} closed: revenue €${Math.round(state.month.revenue).toLocaleString('en-GB')}, net ${net >= 0 ? 'profit' : 'loss'} €${Math.abs(Math.round(net)).toLocaleString('en-GB')}, ${state.month.sold} sold.`);
    state.month = { revenue: 0, expenses: 0, profit: 0, sold: 0 };
    for (const loc of state.locations) loc.month = { revenue: 0, profit: 0, sold: 0, leads: 0 };
    void DAYS_PER_MONTH;
  }
}
