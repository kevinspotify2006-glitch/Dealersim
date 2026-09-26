/**
 * StatsCard dashboards for the phone: the few numbers that answer "how is it
 * going?" in five seconds, at the top of Business and Service.
 */
import type { Ctx } from '../app';
import { h } from '../dom';
import { money, moneyShort, moneySigned } from '../../sim/format';
import { companyValue } from '../../sim/finance';
import { activeLocation } from '../../sim/state';
import { siteCapacity } from '../../sim/buildplus';
import { meterRow, statCard } from './components';

export function businessSummary(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const net = s.month.profit - s.month.expenses;
  const avgStars = s.reviews.length ? s.reviews.slice(0, 30).reduce((a, r) => a + r.stars, 0) / Math.min(30, s.reviews.length) : 0;
  const margin = s.month.revenue > 0 ? net / s.month.revenue : 0;
  return h('section', { class: 'm-summary business-summary' },
    h('div', { class: `m-hero ${net > 0 ? 'good' : net < 0 ? 'bad' : ''}` },
      h('div', { class: 't-secondary', text: 'Profit this month' }),
      h('div', { class: 't-display', text: moneySigned(net) }),
      h('div', { class: 't-secondary', text: s.month.revenue > 0 ? `${Math.round(margin * 100)}% of ${money(s.month.revenue)} revenue` : 'No sales yet this month' })),
    h('div', { class: 'stat-grid' },
      statCard({ icon: 'revenue', label: 'Revenue', value: moneyShort(s.month.revenue), sub: 'this month', onClick: () => ctx.go('business', { tab: 'finances' }) }),
      statCard({ icon: 'report', label: 'Expenses', value: moneyShort(s.month.expenses), sub: 'this month', tone: s.month.expenses > 0 ? 'bad' : '', onClick: () => ctx.go('business', { tab: 'finances' }) }),
      statCard({ icon: 'car', label: 'Cars sold', value: String(s.month.sold), sub: `${s.stats.sold} in total`, onClick: () => ctx.go('business', { tab: 'sales' }) }),
      statCard({ icon: 'customer', label: 'Satisfaction', value: avgStars ? `${avgStars.toFixed(1)} ★` : '—', sub: `${s.reviews.length} reviews`, tone: !avgStars ? '' : avgStars >= 4 ? 'good' : avgStars >= 3 ? 'warn' : 'bad', onClick: () => ctx.go('business', { tab: 'company' }) }),
      statCard({ icon: 'worth', label: 'Dealership value', value: moneyShort(companyValue(s)), sub: `level ${s.companyLevel}`, onClick: () => ctx.go('business', { tab: 'company' }) })));
}

export function serviceSummary(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const loc = activeLocation(s);
  const jobs = s.serviceJobs.filter((j) => j.locationId === loc.id && j.status !== 'done');
  const waiting = jobs.filter((j) => j.status === 'waiting' || j.status === 'parts' || j.stage === 'waiting').length;
  const mechanics = s.employees.filter((e) => ['mechanic', 'technician'].includes(e.role) && e.locationId === loc.id);
  const cap = siteCapacity(s, loc).service;
  const booked = jobs.reduce((sum, j) => sum + j.hours, 0);
  const payroll = mechanics.reduce((sum, e) => sum + e.salary, 0);
  const revenue = (s.kpi?.serviceRevenue ?? 0) + (s.kpi?.partsRevenue ?? 0);
  return h('section', { class: 'm-summary service-summary' },
    h('div', { class: 'stat-grid' },
      statCard({ icon: 'wrench', label: 'Open jobs', value: String(jobs.length), sub: `${jobs.filter((j) => j.status === 'working').length} being worked on` }),
      statCard({ icon: 'car', label: 'Vehicles waiting', value: String(waiting), sub: waiting ? 'for a lift or parts' : 'none', tone: waiting > 2 ? 'warn' : '' }),
      statCard({ icon: 'people', label: 'Mechanics', value: String(mechanics.length), sub: `${money(payroll)}/month`, onClick: () => ctx.go('people', { tab: 'staff' }) }),
      statCard({ icon: 'revenue', label: 'Service revenue', value: moneyShort(revenue), sub: 'labour and parts' })),
    h('div', { class: 'card-m cap-card' },
      meterRow('Capacity', cap ? Math.min(1, booked / cap) : 0, cap ? `${Math.round(booked)} / ${cap} h` : 'no lifts', !cap ? 'bad' : booked > cap ? 'bad' : booked > cap * 0.8 ? 'warn' : 'good'),
      h('div', { class: 't-secondary', text: cap ? `Work booked against a day of lift time. Costs: ${money(payroll)}/month in wages.` : 'Build a lift in a workshop to take service jobs.' })));
}
