/**
 * Test-drive dialog: who goes along, which route (and so how long), and
 * whether to use a demo car so the car for sale keeps its low miles.
 */
import type { Ctx } from '../app';
import type { Vehicle } from '../../sim/types';
import { h, modal } from '../dom';
import { ROLE_BY_ID } from '../../data/game';
import { canTestDrive, demoCarsFor, testDrive } from '../../sim/customers';
import { effectiveSkill } from '../../sim/staff';
import { staffAt, vehicleName } from '../../sim/state';

export function openTestDrive(ctx: Ctx, customerId: string, animate?: (v: Vehicle) => void, after?: () => void, driveYourself?: () => void): void {
  const s = ctx.state;
  const c = s.customers.find((x) => x.id === customerId);
  if (!c) return;
  const car = s.vehicles.find((x) => x.id === c.vehicleId);
  const check = canTestDrive(s, c);
  if (!check.ok || !car) { ctx.act({ ok: false, message: check.reason ?? 'Not possible.' }); return; }
  const people = staffAt(s, c.locationId).filter((e) => (e.role === 'sales' || e.role === 'manager' || e.role === 'delivery') && e.trainingDaysLeft <= 0)
    .sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
  const demos = demoCarsFor(s, car);
  const pick = { staffId: people[0]?.id ?? '', route: 'short' as 'short' | 'long', demoId: '' };
  const { body, footer, close } = modal({ title: 'Test drive', sub: `${c.name} · ${vehicleName(car)}`, width: 520 });
  const group = (title: string, opts: { id: string; label: string; sub: string }[], key: 'staffId' | 'route' | 'demoId'): HTMLElement => {
    const wrap = h('div', { class: 'choice-list' });
    const paint = (): void => {
      wrap.replaceChildren(...opts.map((o) => h('button', { class: `choice${pick[key] === o.id ? ' active' : ''}`, data: { [key]: o.id || 'none' }, on: { click: () => { (pick as Record<string, string>)[key] = o.id; paint(); } } },
        h('div', { class: 'card-title', text: o.label }), h('div', { class: 'tiny muted', text: o.sub }))));
    };
    paint();
    return h('div', {}, h('div', { class: 'bp-sub', text: title }), wrap);
  };
  body.appendChild(group('Who goes along', [
    ...people.map((e) => ({ id: e.id, label: `${e.name}`, sub: `${ROLE_BY_ID[e.role].name} · skill ${Math.round(effectiveSkill(e))} — a good salesperson sells the car on the road` })),
    { id: '', label: 'You', sub: 'Free, but you are the one away from the showroom.' },
  ], 'staffId'));
  body.appendChild(group('Route & time', [
    { id: 'short', label: 'Round the block (≈1 hour)', sub: 'A few kilometres. Less wear, a smaller lift in interest.' },
    { id: 'long', label: 'Motorway & town (≈2 hours)', sub: 'Up to 90 km: they really get to know the car — and any hidden fault. More wear and a small risk of a scuff.' },
  ], 'route'));
  if (demos.length) {
    body.appendChild(group('Which car', [
      { id: '', label: `The car for sale (${car.mileage.toLocaleString('en-GB')} km)`, sub: 'The real thing: the strongest effect.' },
      ...demos.map((d) => ({ id: d.id, label: `Demo car: ${vehicleName(d)}`, sub: 'Spares the car for sale the miles and the risk; a bit less convincing.' })),
    ], 'demoId'));
  } else {
    body.appendChild(h('p', { class: 'tiny muted', text: 'Tip: mark a car as a demo car on the stock desk to spare the cars you sell.' }));
  }
  if (driveYourself) {
    body.appendChild(h('button', { class: 'choice drive-self', data: { act: 'drive-self' }, on: { click: () => { close(); driveYourself(); } } },
      h('div', { class: 'card-title', text: '🎮 Drive it yourself' }),
      h('div', { class: 'tiny muted', text: `Take ${c.name.split(' ')[0]} out on a test route and drive the ${car.model} yourself. How well you drive sets their confidence.` })));
  }
  footer.appendChild(h('button', { class: 'btn', on: { click: close } }, 'Cancel'));
  footer.appendChild(h('button', {
    class: 'btn primary', data: { act: 'start-testdrive' },
    on: { click: () => { const r = testDrive(s, c.id, { staffId: pick.staffId || undefined, route: pick.route, demoId: pick.demoId || undefined }); close(); if (r.ok && animate) animate(car); ctx.act(r); after?.(); } },
  }, 'Start the test drive'));
}
