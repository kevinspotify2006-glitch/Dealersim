/**
 * Planning: a day timeline per person. Service jobs, sales visits, test drives
 * and handovers are blocks you can drag to another time or another person,
 * tap to change or cancel. Conflicts (double bookings, someone off sick, more
 * cars than lifts) are outlined in red, with a one-tap "fix".
 */
import type { Ctx, View } from '../app';
import type { Appointment, Employee } from '../../sim/types';
import { h, modal } from '../dom';
import { money } from '../../sim/format';
import { ROLE_BY_ID } from '../../data/game';
import { SERVICE_BY_ID } from '../../data/service';
import { activeLocation, staffAt } from '../../sim/state';
import { DAY_END, DAY_START, LUNCH, autoFix, cancelAppointment, conflicts, dayName, endOf, fmtHour, moveAppointment } from '../../sim/systems/planning';
import { isAbsent } from '../../sim/staff';
import { helpButton, pageHead, panel, panelTitle } from '../kit';
import { locationPicker } from './business';
import { isPhone } from '../layout';

const dayOffset: Record<string, number> = {};

const SERVICE_ROLES: Employee['role'][] = ['mechanic', 'technician', 'detailer', 'prep'];
const KIND_ICON: Record<Appointment['kind'], string> = { service: '🔧', sales: '👤', testdrive: '🚗', delivery: '🎁' };

export function planningView(scope: 'service' | 'people') {
  return (ctx: Ctx): View => {
    const s = ctx.state;
    const loc = activeLocation(s);
    const key = scope;
    const off = dayOffset[key] ?? 0;
    const day = s.day + off;
    const view = h('div', { class: 'view planning' });
    view.appendChild(pageHead(scope === 'service' ? 'Workshop planning' : 'Team planning', `${dayName(day)} · day ${day}${off === 0 ? ' (today)' : off === 1 ? ' (tomorrow)' : ''} · ${loc.name}`, helpButton('planning')));
    const picker = locationPicker(ctx);
    if (picker) view.appendChild(picker);
    // Day switcher: today and the next six days.
    view.appendChild(h('div', { class: 'pill-row scroll-x day-row' }, ...Array.from({ length: 7 }, (_, i) => {
      const d = s.day + i;
      const n = s.appointments.filter((a) => a.locationId === loc.id && a.day === d && a.status !== 'cancelled' && (scope === 'people' || a.kind === 'service')).length;
      const c = conflicts(s, loc.id, d).length;
      return h('button', { class: `pill day-pill${i === off ? ' active' : ''}${c ? ' conflict' : ''}`, data: { day: String(i) }, on: { click: () => { dayOffset[key] = i; ctx.refresh(); } } },
        h('span', { text: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayName(d).slice(0, 3) }), h('span', { class: 'pill-count', text: c ? `⚠${c}` : String(n) }));
    })));

    const all = s.appointments.filter((a) => a.locationId === loc.id && a.day === day && a.status !== 'cancelled' && a.status !== 'missed' && (scope === 'people' || a.kind === 'service'));
    const cf = conflicts(s, loc.id, day);
    const bad = new Set(cf.flatMap((c) => c.ids));
    if (cf.length) {
      view.appendChild(h('div', { class: 'conflict-bar' }, h('span', { text: '⚠' }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: `${cf.length} conflict${cf.length === 1 ? '' : 's'}` }), h('div', { class: 'tiny', text: cf.slice(0, 3).map((c) => c.text).join(' · ') })),
        h('button', { class: 'btn small primary', data: { act: 'fix' }, on: { click: () => ctx.act(autoFix(s, loc.id, day), { sound: 'success' }) } }, 'Fix schedule')));
    }

    // Rows: the people who can take this kind of work (+ anyone already booked) and an "unassigned" row.
    const team = staffAt(s, loc.id).filter((e) => scope === 'people' || SERVICE_ROLES.includes(e.role) || all.some((a) => a.staffId === e.id));
    const rows: { id: string; label: string; sub: string; absent: boolean }[] = team.map((e) => ({ id: e.id, label: e.name, sub: ROLE_BY_ID[e.role].name, absent: day === s.day ? isAbsent(s, e) : e.absentDay === day || e.trainingDaysLeft > day - s.day }));
    if (all.some((a) => !a.staffId) || scope === 'service') rows.push({ id: '', label: 'Unassigned', sub: 'nobody booked', absent: false });
    if (!team.length && scope === 'service') {
      view.appendChild(panel('No mechanics', h('p', { class: 'empty', text: 'Service work needs a mechanic (or a detailer for valeting) at a lift or bay. Build a workshop and recruit a mechanic.' }),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', on: { click: () => ctx.go('dealership', { build: '1', cat: 'service' }) } }, 'Build a workshop'), h('button', { class: 'btn primary', on: { click: () => ctx.go('people', { tab: 'hire' }) } }, 'Recruit'))));
    }
    view.appendChild(panel(panelTitle('Timeline', h('span', { class: 'sub', text: 'drag a block to move it · tap for details' })), timeline(ctx, rows, all, bad, day)));

    // The day as a list (what the player reads at a glance on a phone).
    const agenda = [...all].sort((a, b) => a.start - b.start);
    view.appendChild(panel(panelTitle('Agenda', h('span', { class: 'sub', text: `${agenda.length} appointment${agenda.length === 1 ? '' : 's'}${scope === 'service' ? ` · ${money(agenda.reduce((t, a) => t + (a.revenue ?? 0), 0))} labour` : ''}` })),
      agenda.length ? h('div', { class: 'agenda' }, ...agendaRows(ctx, agenda, bad)) : h('p', { class: 'empty', text: 'Nothing planned for this day.' })));
    return { el: view };
  };
}

function agendaRows(ctx: Ctx, list: Appointment[], bad: Set<string>): HTMLElement[] {
  const s = ctx.state;
  const out: HTMLElement[] = [];
  let lunchShown = false;
  for (const a of list) {
    if (!lunchShown && a.start >= LUNCH) { out.push(h('div', { class: 'agenda-lunch', text: '───── LUNCH ─────' })); lunchShown = true; }
    const e = a.staffId ? s.employees.find((x) => x.id === a.staffId) : undefined;
    out.push(h('button', { class: `agenda-row ${a.kind} ${a.status}${bad.has(a.id) ? ' conflict' : ''}`, data: { appt: a.id }, on: { click: () => openAppointment(ctx, a.id) } },
      h('span', { class: 'agenda-time', text: fmtHour(a.start) }),
      h('span', { class: 'agenda-ic', text: KIND_ICON[a.kind] }),
      h('div', { class: 'agenda-body' }, h('div', { class: 'card-title', text: `${a.vehicle}` }), h('div', { class: 'tiny muted', text: `${a.title.replace(/^\S+\s/, '')} · ${a.customer}${e ? ` · ${e.name.split(' ')[0]}` : ' · unassigned'}${a.note ? ` · ${a.note}` : ''}` })),
      h('span', { class: `tag ${a.status === 'done' ? 'good' : a.status === 'active' ? 'info' : bad.has(a.id) ? 'bad' : ''}`, text: a.status === 'active' ? 'now' : a.status === 'arrived' ? 'here' : a.status })));
  }
  return out;
}

function timeline(ctx: Ctx, rows: { id: string; label: string; sub: string; absent: boolean }[], list: Appointment[], bad: Set<string>, day: number): HTMLElement {
  const s = ctx.state;
  const W = isPhone() ? 54 : 76;          // pixels per hour
  const RH = isPhone() ? 52 : 50;         // row height
  const hours = DAY_END - DAY_START;
  const grid = h('div', { class: 'plan-grid', style: `--hw:${W}px;--rh:${RH}px;width:${hours * W}px` });
  // Header hours and the lunch band.
  const head = h('div', { class: 'plan-hours' }, ...Array.from({ length: hours }, (_, i) => h('span', { class: `plan-hour${DAY_START + i === LUNCH ? ' lunch' : ''}`, style: `left:${i * W}px;width:${W}px`, text: DAY_START + i === LUNCH ? 'Lunch' : `${String(DAY_START + i).padStart(2, '0')}:00` })));
  const lanes = h('div', { class: 'plan-lanes', style: `height:${rows.length * RH}px` });
  rows.forEach((r, i) => lanes.appendChild(h('div', { class: `plan-lane${r.absent ? ' absent' : ''}`, style: `top:${i * RH}px;height:${RH}px` })));
  lanes.appendChild(h('div', { class: 'plan-lunch', style: `left:${(LUNCH - DAY_START) * W}px;width:${W}px` }));
  if (day === s.day && s.hour >= DAY_START && s.hour <= DAY_END) lanes.appendChild(h('div', { class: 'plan-now', style: `left:${(s.hour - DAY_START) * W}px` }));
  for (const a of list) {
    const row = Math.max(0, rows.findIndex((r) => r.id === (a.staffId ?? '')));
    const left = (a.start - DAY_START) * W;
    const width = Math.max(W * 0.5, (endOf(a) - a.start) * W) - 3;
    const job = a.jobId ? s.serviceJobs.find((j) => j.id === a.jobId) : undefined;
    const pct = job ? 1 - job.hours / Math.max(0.1, job.totalHours) : a.status === 'done' ? 1 : 0;
    const block = h('div', {
      class: `plan-block ${a.kind} ${a.status}${bad.has(a.id) ? ' conflict' : ''}`, data: { appt: a.id }, role: 'button',
      style: `left:${left}px;top:${row * RH + 4}px;width:${width}px;height:${RH - 8}px`,
      title: `${fmtHour(a.start)}–${fmtHour(endOf(a))} ${a.title} · ${a.vehicle} · ${a.customer}`,
    }, h('div', { class: 'pb-title', text: `${KIND_ICON[a.kind]} ${a.vehicle}` }), h('div', { class: 'pb-sub', text: `${fmtHour(a.start)} · ${a.kind === 'service' && job ? SERVICE_BY_ID[job.type]?.name ?? '' : a.title.replace(/^\S+\s/, '')}` }),
    pct > 0 && pct < 1 ? h('div', { class: 'pb-progress', style: `width:${Math.round(pct * 100)}%` }) : null);
    block.tabIndex = 0;
    attachDrag(ctx, block, a, rows, W, RH, day);
    lanes.appendChild(block);
  }
  const names = h('div', { class: 'plan-names', style: `height:${rows.length * RH}px` }, ...rows.map((r, i) => h('div', { class: `plan-name${r.absent ? ' absent' : ''}`, style: `top:${i * RH}px;height:${RH}px` }, h('div', { class: 'card-title', text: r.label }), h('div', { class: 'tiny muted', text: r.absent ? '🤒 not in' : r.sub }))));
  grid.append(head, lanes);
  const scroller = h('div', { class: 'plan-scroll' }, grid);
  // Start scrolled to "now" on today.
  if (day === s.day) requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, (s.hour - DAY_START - 1) * W); });
  return h('div', { class: 'plan-wrap' }, h('div', { class: 'plan-side' }, h('div', { class: 'plan-corner' }), names), scroller);
}

/** Press and drag a block to a new time / person; a tap opens it. */
function attachDrag(ctx: Ctx, block: HTMLElement, a: Appointment, rows: { id: string }[], W: number, RH: number, day: number): void {
  const movable = a.status === 'planned' || a.status === 'arrived';
  block.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAppointment(ctx, a.id); } });
  block.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const left0 = parseFloat(block.style.left);
    const top0 = parseFloat(block.style.top);
    let moved = false;
    let timer = 0;
    // On touch, a short hold starts the drag so the timeline can still be scrolled.
    let dragging = ev.pointerType !== 'touch';
    if (!dragging) timer = window.setTimeout(() => { dragging = true; block.classList.add('dragging'); navigator.vibrate?.(12); }, 280);
    const move = (e: PointerEvent): void => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!dragging) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { window.clearTimeout(timer); cleanup(); } return; }
      if (!movable) return;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      e.preventDefault();
      block.classList.add('dragging');
      block.style.left = `${left0 + Math.round(dx / (W / 2)) * (W / 2)}px`;
      block.style.top = `${top0 + Math.round(dy / RH) * RH}px`;
    };
    const up = (): void => {
      window.clearTimeout(timer);
      cleanup();
      block.classList.remove('dragging');
      if (!moved) { openAppointment(ctx, a.id); return; }
      const start = DAY_START + parseFloat(block.style.left) / W;
      const row = rows[Math.max(0, Math.min(rows.length - 1, Math.round((parseFloat(block.style.top) - 4) / RH)))];
      const r = moveAppointment(ctx.state, a.id, day, start, row.id || null);
      ctx.act(r, { sound: r.ok ? 'success' : undefined });
    };
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = (): void => { window.clearTimeout(timer); cleanup(); block.classList.remove('dragging'); block.style.left = `${left0}px`; block.style.top = `${top0}px`; };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
}

/** Details of one appointment, with every action. */
export function openAppointment(ctx: Ctx, id: string): void {
  const s = ctx.state;
  const { body, footer, close } = modal({ title: 'Appointment', width: 520, onClose: () => ctx.refresh() });
  const run = (r: { ok: boolean; message: string }): void => { ctx.act(r); draw(); };
  const draw = (): void => {
    const a = s.appointments.find((x) => x.id === id);
    body.replaceChildren();
    footer.replaceChildren();
    if (!a) { body.appendChild(h('p', { class: 'empty', text: 'This appointment no longer exists.' })); return; }
    const job = a.jobId ? s.serviceJobs.find((j) => j.id === a.jobId) : undefined;
    const e = a.staffId ? s.employees.find((x) => x.id === a.staffId) : undefined;
    const cf = conflicts(s, a.locationId, a.day).filter((c) => c.ids.includes(a.id));
    body.appendChild(h('div', { class: 'appt-head' }, h('span', { class: 'appt-ic', text: KIND_ICON[a.kind] }),
      h('div', {}, h('div', { class: 'card-title', text: `${a.title.replace(/^\S+\s/, '')} · ${a.vehicle}` }), h('div', { class: 'tiny muted', text: `${a.customer} · ${dayName(a.day)} ${fmtHour(a.start)}–${fmtHour(endOf(a))}` }))));
    body.appendChild(h('div', { class: 'fact-grid' },
      fact('Status', a.status), fact('Who', e ? `${e.name} (${ROLE_BY_ID[e.role].name})` : 'Unassigned'),
      a.revenue ? fact('Expected revenue', money(a.revenue)) : null,
      job ? fact('Work left', `${job.hours.toFixed(1)} of ${job.totalHours.toFixed(1)} h`) : null,
      job ? fact('Parts', Object.entries(job.parts).map(([k, n]) => `${n}× ${k}`).join(', ') || 'none') : null,
      job ? fact('Parts ready', job.partsReserved ? 'yes, on the shelf' : 'ordered / to take at the start') : null,
      job?.stage ? fact('The car is', { expected: 'not here yet', reception: 'at reception', waiting: 'waiting outside', lift: 'on a lift', check: 'being checked', ready: 'ready to collect', collected: 'collected' }[job.stage]) : null));
    if (a.note) body.appendChild(h('p', { class: 'tiny warn', text: a.note }));
    for (const c of cf) body.appendChild(h('p', { class: 'tiny bad', text: `⚠ ${c.text}` }));
    if (a.status === 'planned' || a.status === 'arrived') {
      const team = staffAt(s, a.locationId).filter((x) => a.kind !== 'service' || SERVICE_ROLES.includes(x.role));
      const who = h('select', { aria: { label: 'Assign to' }, data: { field: 'staff' } }, h('option', { value: '', selected: !a.staffId }, 'Unassigned'), ...team.map((x) => h('option', { value: x.id, selected: x.id === a.staffId }, `${x.name} — ${ROLE_BY_ID[x.role].name}${isAbsent(s, x) ? ' (not in)' : ''}`)));
      who.addEventListener('change', () => run(moveAppointment(s, a.id, a.day, a.start, who.value || null)));
      const daySel = h('select', { aria: { label: 'Day' } }, ...Array.from({ length: 7 }, (_, i) => s.day + i).map((d) => h('option', { value: String(d), selected: d === a.day }, `${dayName(d)}${d === s.day ? ' (today)' : ''}`)));
      daySel.addEventListener('change', () => run(moveAppointment(s, a.id, Number(daySel.value), a.start)));
      body.appendChild(h('div', { class: 'grid cols-2' }, h('label', { class: 'field' }, h('span', { text: 'Assigned to' }), who), h('label', { class: 'field' }, h('span', { text: 'Day' }), daySel)));
      body.appendChild(h('div', { class: 'btn-row' },
        h('button', { class: 'btn', data: { act: 'earlier' }, on: { click: () => run(moveAppointment(s, a.id, a.day, a.start - 0.5)) } }, '◀ 30 min earlier'),
        h('button', { class: 'btn', data: { act: 'later' }, on: { click: () => run(moveAppointment(s, a.id, a.day, a.start + 0.5)) } }, '30 min later ▶')));
      footer.appendChild(h('button', { class: 'btn danger', data: { act: 'cancel-appt' }, on: { click: () => { run(cancelAppointment(s, a.id)); close(); } } }, 'Cancel appointment'));
    }
    footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Done'));
  };
  draw();
}

function fact(label: string, value: string): HTMLElement {
  return h('div', { class: 'fact' }, h('span', { class: 'fact-k', text: label }), h('span', { class: 'fact-v', text: value }));
}
