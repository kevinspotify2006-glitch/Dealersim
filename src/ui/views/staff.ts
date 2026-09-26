/**
 * People: the team roster (cards with what each person is doing, how well and
 * how they feel), recruitment, and the employee profile.
 */
import type { Ctx, View } from '../app';
import type { Employee, Role, SkillId } from '../../sim/types';
import { avatar, confirmDialog, empty, h, icon, modal, toast } from '../dom';
import { money } from '../../sim/format';
import { ROLES, ROLE_BY_ID, SKILL_NAMES, TRAINING } from '../../data/game';
import { CONTRACT_NAMES, bonusAmount, canPromote, changeRole, fire, giveBonus, giveRaise, hire, hiringFee, isAbsent, makePermanent, promote, setFocus, skillOf, synergies, titleOf, train, trainingCost, trainingDays, transfer, xpForLevel, MAX_LEVEL } from '../../sim/staff';
import { freeStation, stationName } from '../../sim/lot';
import { activeLocation, locationName, staffAt, staffCapacity } from '../../sim/state';
import { buyerStats } from '../../sim/systems/procurement';
import { fmtHour } from '../../sim/systems/planning';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { play } from '../../platform/sound';
import { ROLE_COLORS } from '../world/agents';
import { isPhone } from '../layout';
import { employeeCard } from '../mobile/cards';

let q = '';
let roleFilter = '';

function stressTone(v: number): string {
  return v >= 70 ? 'bad' : v >= 45 ? 'warn' : 'good';
}

const SKILLS: SkillId[] = ['sales', 'negotiation', 'finance', 'service', 'technical', 'ev', 'luxury', 'management', 'speed', 'buying', 'appraisal', 'reliability', 'composure', 'detail'];

/** The skills that matter most for a person's job, then their character traits. */
function keySkills(e: Employee): SkillId[] {
  const main = ROLE_BY_ID[e.role].skill;
  const byRole = SKILLS.filter((k) => k !== main && !['reliability', 'composure', 'detail'].includes(k)).map((k) => ({ k, v: skillOf(e, k) })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.k);
  return [main, ...byRole.filter((k) => k !== main)];
}

function moraleTone(m: number): string {
  return m >= 65 ? 'good' : m >= 40 ? 'warn' : 'bad';
}

/** What someone is doing right now, in a few words. */
export function currentTask(ctx: Ctx, e: Employee): string {
  const s = ctx.state;
  if (isAbsent(s, e)) return '🤒 Off sick today';
  if (e.trainingDaysLeft > 0) return `🎓 On a course (${e.trainingDaysLeft}d)`;
  if (!e.stationId) return `⚠ No ${stationName(e.role).replace(/^an? /, '')} to work at`;
  const now = s.appointments.find((a) => a.staffId === e.id && a.day === s.day && a.status === 'active');
  if (now) return `${now.title}: ${now.vehicle}`;
  if (e.task) return e.task;
  const next = s.appointments.filter((a) => a.staffId === e.id && a.day === s.day && a.status === 'planned' && a.start >= s.hour).sort((a, b) => a.start - b.start)[0];
  if (next) return `Next: ${fmtHour(next.start)} ${next.title}`;
  return '✅ Available';
}

function personCard(ctx: Ctx, e: Employee): HTMLElement {
  const color = ROLE_COLORS[e.role] ?? '#9aa3ad';
  const task = currentTask(ctx, e);
  if (isPhone()) return employeeCard(ctx, e, task, () => openEmployee(ctx, e.id), color);
  const busy = !task.startsWith('✅');
  return h('button', { class: `person-card${isAbsent(ctx.state, e) ? ' absent' : ''}`, data: { emp: e.id }, style: `--role:${color}`, on: { click: () => openEmployee(ctx, e.id) } },
    h('div', { class: 'pc-top' },
      h('span', { class: 'pc-avatar' }, avatar(e.name, e.morale < 40 ? 'warn' : undefined), h('span', { class: 'pc-role', text: ROLE_BY_ID[e.role].icon })),
      h('div', { class: 'pc-id' }, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${titleOf(e)} · L${e.level}` })),
      canPromote(e) ? h('span', { class: 'tag accent', text: '⬆' }) : null),
    h('div', { class: `pc-task${busy ? ' busy' : ''}`, text: task }),
    h('div', { class: 'pc-bars' },
      tipped(h('div', { class: 'pc-bar' }, h('span', { text: '⭐' }), progressBar((e.performance ?? 50) / 100, (e.performance ?? 50) >= 60 ? 'good' : (e.performance ?? 50) >= 40 ? 'warn' : 'bad')), `Performance ${Math.round(e.performance ?? 50)}/100`),
      tipped(h('div', { class: 'pc-bar' }, h('span', { text: '😊' }), progressBar(e.morale / 100, moraleTone(e.morale))), `Satisfaction ${Math.round(e.morale)}/100`),
      tipped(h('div', { class: 'pc-bar' }, h('span', { text: '🔥' }), progressBar((e.stress ?? 0) / 100, stressTone(e.stress ?? 0))), `Stress ${Math.round(e.stress ?? 0)}/100`)),
    h('div', { class: 'pc-foot' }, h('span', { class: 'tiny', text: `${money(e.salary)}/mo` }), h('span', { class: 'tiny muted', text: e.contract && e.contract !== 'permanent' ? (e.contract === 'parttime' ? 'part-time' : `temp · ${Math.max(0, (e.contractEnd ?? 0) - ctx.state.day)}d`) : `${e.age ?? '—'} y` })));
}

export function staffView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const payroll = s.employees.reduce((a, e) => a + e.salary, 0);
  const compact = ctx.params.compact === '1';
  view.appendChild(pageHead('Team', `${s.employees.length} people · payroll ${money(payroll)}/month · ${staffAt(s, loc.id).length}/${staffCapacity(loc)} workstations at ${loc.name}`, helpButton('staff'),
    h('button', { class: 'btn primary', data: { act: 'recruit' }, on: { click: () => ctx.go('people', { tab: 'hire' }) } }, icon('plus', 14), 'Recruit')));

  const search = h('input', { type: 'search', placeholder: 'Search people…', value: q, aria: { label: 'Search staff' } });
  const host = h('div', {});
  const roles = [...new Set(s.employees.map((e) => e.role))];
  const draw = (): void => {
    const list = s.employees.filter((e) => (!roleFilter || e.role === roleFilter) && (!q || `${e.name} ${ROLE_BY_ID[e.role].name} ${titleOf(e)} ${e.specialization}`.toLowerCase().includes(q.toLowerCase())));
    if (!s.employees.length) {
      host.replaceChildren(empty('You are running the place alone. Recruit someone — every role needs a workstation of its own.', { title: 'No staff yet', icon: 'people', action: h('button', { class: 'btn primary', on: { click: () => ctx.go('people', { tab: 'hire' }) } }, 'Recruit') }));
      return;
    }
    host.replaceChildren(h('div', { class: 'person-grid' }, ...list.map((e) => personCard(ctx, e))));
  };
  search.addEventListener('input', () => { q = search.value; draw(); });
  draw();
  const filters = h('div', { class: 'pill-row scroll-x' },
    h('button', { class: `pill${!roleFilter ? ' active' : ''}`, on: { click: () => { roleFilter = ''; ctx.refresh(); } } }, `Everyone ${s.employees.length}`),
    ...roles.map((r) => h('button', { class: `pill${roleFilter === r ? ' active' : ''}`, data: { role: r }, on: { click: () => { roleFilter = r; ctx.refresh(); } } }, `${ROLE_BY_ID[r].icon} ${ROLE_BY_ID[r].name} ${s.employees.filter((e) => e.role === r).length}`)));
  view.appendChild(panel(panelTitle('Your team'), h('div', { class: 'search wide' }, icon('search', 15), search), filters, host));
  // In the dealership's side panel, this week's applicants come straight after the team.
  if (compact) {
    const rec = recruitView(ctx).el;
    rec.classList.add('embedded');
    view.appendChild(rec);
    return { el: view };
  }

  const rate = s.settings.commission ?? 0.03;
  const commissionMonth = s.employees.reduce((a, e) => a + (e.commission ?? 0), 0);
  const commissionPanel = panel(panelTitle('Sales commission', h('span', { class: 'sub', text: `${money(commissionMonth)} paid this month` })),
    h('p', { class: 'tiny muted', text: 'Paid on the gross profit of every car your staff sell. Higher commission lifts morale and effort (better prices, more closes); lower keeps more margin.' }),
    h('div', { class: 'seg', role: 'tablist' }, ...[0, 0.02, 0.03, 0.05, 0.08].map((r) => h('button', {
      class: `seg-btn${Math.abs(rate - r) < 0.001 ? ' active' : ''}`, data: { commission: String(r) },
      on: { click: () => { s.settings.commission = r; toast(r ? `Commission set to ${Math.round(r * 100)}% of gross profit.` : 'No commission: staff morale will slowly fall.', 'info'); ctx.refresh(); } },
    }, r ? `${Math.round(r * 100)}%` : 'None'))));
  const syn = synergies(s, loc.id);
  const synPanel = panel(panelTitle('Team synergies', h('span', { class: 'sub', text: `${syn.filter((x) => x.active).length} of ${syn.length} active at ${loc.name}` })),
    ...syn.map((x) => h('div', { class: `syn-row${x.active ? ' on' : ''}` }, h('span', { class: 'syn-ic', text: x.icon }),
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: x.name }), h('div', { class: 'tiny muted', text: x.active ? x.effect : `Needs: ${x.needs}` })),
      h('span', { class: `tag ${x.active ? 'good' : ''}`, text: x.active ? 'Active' : 'Off' }))));
  view.appendChild(h('div', { class: 'grid cols-2' }, commissionPanel, synPanel));
  return { el: view };
}

/** Recruitment: this week's applicants. */
export function recruitView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  view.appendChild(pageHead('Recruitment', `${s.candidates.length} applicants this week · hiring into ${loc.name} · new people apply every Monday`, helpButton('staff')));
  const roles = [...new Set(s.candidates.map((c) => c.role))];
  view.appendChild(h('div', { class: 'pill-row scroll-x' },
    h('button', { class: `pill${!roleFilter ? ' active' : ''}`, on: { click: () => { roleFilter = ''; ctx.refresh(); } } }, 'All roles'),
    ...roles.map((r) => h('button', { class: `pill${roleFilter === r ? ' active' : ''}`, on: { click: () => { roleFilter = r; ctx.refresh(); } } }, `${ROLE_BY_ID[r].icon} ${ROLE_BY_ID[r].name}`))));
  const cands = s.candidates.filter((c) => !roleFilter || c.role === roleFilter);
  view.appendChild(cands.length ? h('div', { class: 'person-grid' }, ...cands.map((c) => {
    const station = freeStation(s, loc, c.role);
    return h('article', { class: 'person-card cand', data: { cand: c.id }, style: `--role:${ROLE_COLORS[c.role] ?? '#9aa3ad'}` },
      h('div', { class: 'pc-top' },
        h('span', { class: 'pc-avatar' }, avatar(c.name, 'good'), h('span', { class: 'pc-role', text: ROLE_BY_ID[c.role].icon })),
        h('div', { class: 'pc-id' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: `${titleOf(c)} · ${c.age ?? '—'} y · ${c.specialization}` }))),
      h('div', { class: 'cand-skills' }, ...keySkills(c).slice(0, 4).map((k) => h('div', { class: 'skill-row' }, h('span', { class: 'tiny', text: SKILL_NAMES[k] }), progressBar(skillOf(c, k) / 100, k === ROLE_BY_ID[c.role].skill ? 'good' : 'info'), h('span', { class: 'tiny num', text: String(Math.round(skillOf(c, k))) })))),
      h('div', { class: 'trait-row' }, ...(['reliability', 'composure', 'detail'] as SkillId[]).map((k) => tipped(h('span', { class: `trait ${skillOf(c, k) >= 70 ? 'good' : skillOf(c, k) < 40 ? 'bad' : ''}`, text: `${k === 'reliability' ? '🕒' : k === 'composure' ? '🧘' : '🔬'} ${Math.round(skillOf(c, k))}` }), SKILL_NAMES[k]))),
      h('div', { class: 'pc-foot' }, h('span', { class: 'tiny', text: `${money(c.salary)}/mo · ${CONTRACT_NAMES[c.contract ?? 'permanent']}` }), h('span', { class: 'tiny muted', text: `fee ${money(hiringFee(s, c))}` })),
      station
        ? h('button', { class: 'btn small primary block', data: { hire: c.id }, on: { click: () => ctx.act(hire(s, c.id, loc.id), { sound: 'success' }) } }, 'Hire')
        : h('button', { class: 'btn small block', title: `Needs ${stationName(c.role)} — build one first`, on: { click: () => ctx.go('dealership', { build: '1', cat: 'staff' }) } }, `Build ${stationName(c.role).replace(/^an? /, '')} first`));
  })) : h('p', { class: 'empty', text: 'No applicants for this role this week. More arrive on Monday.' }));
  view.appendChild(panel('Roles', h('div', { class: 'role-list' }, ...ROLES.map((r) => h('div', { class: `role-row${r.minLevel > s.companyLevel ? ' muted' : ''}` },
    h('span', { class: 'syn-ic', text: r.icon }),
    h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: `${r.name}${r.minLevel > s.companyLevel ? ` · level ${r.minLevel}` : ''}` }), h('div', { class: 'tiny muted', text: `${r.description} Works at ${r.station}.` })),
    h('span', { class: 'num', text: String(s.employees.filter((e) => e.role === r.id).length) }))))));
  return { el: view };
}

export function openEmployee(ctx: Ctx, id: string): void {
  const s = ctx.state;
  const { body, footer, close } = modal({ title: 'Employee', width: 600, onClose: () => ctx.refresh() });
  const run = (r: { ok: boolean; message: string }): void => {
    toast(r.message, r.ok ? 'good' : 'bad');
    play(r.ok ? 'success' : 'error');
    draw();
  };
  const draw = (): void => {
    const e: Employee | undefined = s.employees.find((x) => x.id === id);
    body.replaceChildren();
    footer.replaceChildren();
    if (!e) {
      body.appendChild(h('p', { class: 'empty', text: 'No longer with the company.' }));
      footer.appendChild(h('button', { class: 'btn primary', on: { click: close } }, 'Close'));
      return;
    }
    body.appendChild(h('div', { class: 'profile-head', style: `--role:${ROLE_COLORS[e.role] ?? '#9aa3ad'}` }, avatar(e.name), h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${titleOf(e)} · ${e.specialization} · ${locationName(s, e.locationId)}` })),
      h('span', { class: 'pc-task busy', text: currentTask(ctx, e) })));
    body.appendChild(h('div', { class: 'fact-grid' },
      fact('Salary', `${money(e.salary)}/mo`), fact('Contract', CONTRACT_NAMES[e.contract ?? 'permanent'] + (e.contract === 'temporary' ? ` · ends in ${Math.max(0, (e.contractEnd ?? 0) - s.day)}d` : '')),
      fact('Hours', `${e.hours ?? 40} h/week`), fact('Age', `${e.age ?? '—'}`), fact('Experience', `${s.day - e.hiredDay} days · ${e.dealsClosed} deals/jobs`), fact('Commission', money(e.commission ?? 0))));
    body.appendChild(h('div', { class: 'grid cols-2' },
      meterRow('Performance', e.performance ?? 50, (e.performance ?? 50) >= 60 ? 'good' : 'warn'),
      meterRow('Satisfaction', e.morale, moraleTone(e.morale)),
      meterRow('Stress', e.stress ?? 0, stressTone(e.stress ?? 0)),
      meterRow(e.level >= MAX_LEVEL ? `Level ${e.level} (max)` : `Level ${e.level} · XP ${e.xp}/${xpForLevel(e.level)}`, e.level >= MAX_LEVEL ? 100 : e.xp / xpForLevel(e.level) * 100, 'info')));
    if (e.role === 'buyer' || e.role === 'procurement') {
      const st = buyerStats(s, e.id, 30);
      const value = st.realised - e.salary;
      body.appendChild(h('div', { class: `buyer-value ${value >= 0 ? 'good' : 'bad'}` }, h('span', { text: '🔎' }),
        h('div', {}, h('div', { class: 'card-title', text: `${st.bought} cars bought · ${money(st.realised)} margin realised (30 days)` }), h('div', { class: 'tiny muted', text: `Costs ${money(e.salary)}/month → ${value >= 0 ? 'adds' : 'costs'} ${money(Math.abs(value))} a month. ${st.missed} deals lapsed.` })),
        h('button', { class: 'btn small', on: { click: () => { close(); ctx.go('inventory', { tab: 'buyers' }); } } }, 'Brief')));
    }
    body.appendChild(h('div', { class: 'bp-sub', text: 'Skills & character' }));
    body.appendChild(h('div', { class: 'skill-grid' }, ...SKILLS.map((k) => h('div', { class: `skill-row${k === ROLE_BY_ID[e.role].skill ? ' main' : ''}` },
      h('span', { class: 'tiny', text: SKILL_NAMES[k] }), progressBar(skillOf(e, k) / 100, k === ROLE_BY_ID[e.role].skill ? 'good' : 'info'), h('span', { class: 'tiny num', text: String(Math.round(skillOf(e, k))) })))));
    // Today's plan for this person.
    const today = s.appointments.filter((a) => a.staffId === e.id && a.day === s.day && a.status !== 'cancelled').sort((a, b) => a.start - b.start);
    body.appendChild(h('div', { class: 'bp-sub', text: `Planning today (${today.length})` }));
    body.appendChild(today.length ? h('div', { class: 'mini-plan' }, ...today.map((a) => h('div', { class: `mini-appt ${a.kind} ${a.status}` }, h('span', { class: 'num', text: fmtHour(a.start) }), h('span', { text: `${a.title} · ${a.vehicle}` })))) : h('p', { class: 'tiny muted', text: 'Nothing booked today.' }));
    if (e.role === 'manager') {
      body.appendChild(h('div', { class: 'bp-sub', text: 'Focus' }));
      body.appendChild(h('div', { class: 'seg' }, ...(['general', 'sales', 'service'] as const).map((f) => h('button', { class: `seg-btn${e.focus === f ? ' active' : ''}`, data: { focus: f }, on: { click: () => run(setFocus(s, e.id, f)) } }, f === 'general' ? 'General manager' : f === 'sales' ? 'Sales manager' : 'Service manager'))));
    }
    if (e.trainingDaysLeft > 0) body.appendChild(h('p', { class: 'tiny warn', text: `On a training course (${e.training ?? 'skills'}) for ${e.trainingDaysLeft} more day(s).` }));
    const tracks = TRAINING.filter((t) => t.roles.includes(e.role) || t.skill === ROLE_BY_ID[e.role].skill);
    body.appendChild(h('div', { class: 'bp-sub', text: 'Training courses' }));
    body.appendChild(h('div', { class: 'train-list' }, ...tracks.map((t) => h('div', { class: 'train-row' },
      h('span', { class: 'syn-ic', text: t.icon }),
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: `${t.name}${e.tracks?.[t.id] ? ` · done ×${e.tracks[t.id]}` : ''}` }), h('div', { class: 'tiny muted', text: `${t.description} ${trainingDays(s, t.id)} days · ${SKILL_NAMES[t.skill]} ${Math.round(skillOf(e, t.skill))}` })),
      h('button', { class: 'btn small', data: { track: t.id }, disabled: e.trainingDaysLeft > 0, on: { click: () => run(train(s, e.id, t.id)) } }, money(trainingCost(e, t.id, s)))))));
    body.appendChild(h('p', { class: 'tiny muted', text: ROLE_BY_ID[e.role].description }));

    const roleSel = h('select', { aria: { label: 'Change role' } }, ...ROLES.filter((r) => r.minLevel <= s.companyLevel || r.id === e.role).map((r) => h('option', { value: r.id, selected: r.id === e.role }, r.name)));
    const locSel = h('select', { aria: { label: 'Transfer to' } }, ...s.locations.map((l) => h('option', { value: l.id, selected: l.id === e.locationId }, l.name)));
    body.appendChild(h('div', { class: 'grid cols-2' },
      h('label', { class: 'field' }, h('span', { text: 'Role' }), roleSel, h('button', { class: 'btn small', style: 'margin-top:6px', on: { click: () => run(changeRole(s, e.id, roleSel.value as Role)) } }, 'Change role')),
      s.locations.length > 1 ? h('label', { class: 'field' }, h('span', { text: 'Location' }), locSel, h('button', { class: 'btn small', style: 'margin-top:6px', on: { click: () => run(transfer(s, e.id, locSel.value)) } }, 'Transfer')) : h('div', {})));

    footer.appendChild(h('button', {
      class: 'btn danger', on: {
        click: async () => {
          if (await confirmDialog('Let them go?', `Fire ${e.name}? You pay half a month's salary (${money(Math.round(e.salary * 0.5))}) in severance, and colleagues' morale dips.`, 'Fire', true)) {
            run(fire(s, e.id));
          }
        },
      },
    }, 'Fire'));
    if (e.contract !== 'permanent' || (e.hours ?? 40) < 40) footer.appendChild(h('button', { class: 'btn', data: { act: 'permanent' }, on: { click: () => run(makePermanent(s, e.id)) } }, 'Permanent contract'));
    footer.appendChild(h('button', { class: 'btn', on: { click: () => run(giveRaise(s, e.id)) } }, 'Raise +8%'));
    const recent = e.bonusDay !== undefined && s.day - e.bonusDay < 30;
    footer.appendChild(h('button', { class: 'btn', disabled: recent, title: recent ? 'Once a month' : 'One-off bonus: morale up, stress down', on: { click: () => run(giveBonus(s, e.id)) } }, `Bonus ${money(bonusAmount(e))}`));
    footer.appendChild(h('button', { class: 'btn primary', disabled: !canPromote(e), on: { click: () => run(promote(s, e.id)) } }, 'Promote'));
  };
  draw();
}

function fact(label: string, value: string): HTMLElement {
  return h('div', { class: 'fact' }, h('span', { class: 'fact-k', text: label }), h('span', { class: 'fact-v', text: value }));
}

function meterRow(label: string, value: number, tone: string): HTMLElement {
  return h('div', {}, h('div', { class: 'tiny muted', text: `${label}${label.startsWith('Level') ? '' : ` ${Math.round(value)}/100`}` }), progressBar(value / 100, tone));
}

export { kv };
