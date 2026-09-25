import type { Ctx, View } from '../app';
import type { Employee, Role } from '../../sim/types';
import { avatar, confirmDialog, empty, h, icon, modal, table, toast } from '../dom';
import { money } from '../../sim/format';
import { ROLES, ROLE_BY_ID, SKILL_NAMES, TRAINING } from '../../data/game';
import type { SkillId } from '../../sim/types';
import { bonusAmount, canPromote, changeRole, fire, giveBonus, giveRaise, hire, hiringFee, promote, skillOf, synergies, titleOf, train, trainingCost, trainingDays, transfer, xpForLevel, MAX_LEVEL } from '../../sim/staff';
import { freeStation, stationName } from '../../sim/lot';
import { activeLocation, locationName, staffAt, staffCapacity } from '../../sim/state';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { isWide } from '../layout';
import { play } from '../../platform/sound';

let q = '';

function stressTone(v: number): string {
  return v >= 70 ? 'bad' : v >= 45 ? 'warn' : 'good';
}

const SKILLS: SkillId[] = ['sales', 'negotiation', 'finance', 'service', 'technical', 'ev', 'luxury', 'management', 'speed'];

function topSkills(e: Employee): string {
  return SKILLS.map((k) => ({ k, v: skillOf(e, k) })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => `${SKILL_NAMES[x.k]} ${Math.round(x.v)}`).join(' · ');
}

function moraleTone(m: number): string {
  return m >= 65 ? 'good' : m >= 40 ? 'warn' : 'bad';
}

export function staffView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const payroll = s.employees.reduce((a, e) => a + e.salary, 0);
  view.appendChild(pageHead('Staff', `${s.employees.length} employees · payroll ${money(payroll)}/month · ${staffAt(s, loc.id).length}/${staffCapacity(loc)} workstations at ${loc.name}`, helpButton('staff')));

  const search = h('input', { type: 'search', placeholder: 'Search staff…', value: q, aria: { label: 'Search staff' } });
  const host = h('div', {});
  const draw = (): void => {
    const list = s.employees.filter((e) => !q || `${e.name} ${ROLE_BY_ID[e.role].name} ${e.specialization}`.toLowerCase().includes(q.toLowerCase()));
    if (!s.employees.length) {
      host.replaceChildren(empty('You are running the place alone. Hire someone below.', { title: 'No staff', icon: 'people' }));
      return;
    }
    if (isWide()) {
      host.replaceChildren(table(['Name', 'Role', 'Skill', 'Level', 'Morale', 'Stress', 'Salary', 'Location', 'Deals'], list.map((e) => [
        h('div', { class: 'cell-person' }, avatar(e.name, e.morale < 40 ? 'warn' : undefined, true), h('div', {}, h('div', { class: 'cell-person-name', text: e.name }), h('div', { class: 'tiny muted', text: e.trainingDaysLeft > 0 ? `On a course (${e.trainingDaysLeft}d)` : e.specialization }))),
        h('span', { class: 'tag plain', text: `${ROLE_BY_ID[e.role].icon} ${titleOf(e)}` }),
        h('div', { class: 'skill-cell' }, progressBar(e.skill / 100, 'good'), h('span', { class: 'tiny', text: String(Math.round(e.skill)) })),
        h('span', { class: 'num', text: `${e.level}${canPromote(e) ? ' ⬆' : ''}` }),
        h('span', { class: `tag ${moraleTone(e.morale)}`, text: String(Math.round(e.morale)) }),
        h('span', { class: `tag ${stressTone(e.stress ?? 0)}`, text: String(Math.round(e.stress ?? 0)) }),
        h('span', { class: 'num', text: money(e.salary) }),
        h('span', { class: 'tiny', text: locationName(s, e.locationId) }),
        h('span', { class: 'num', text: String(e.dealsClosed) }),
      ]), { onRowClick: (i) => openEmployee(ctx, list[i].id) }));
    } else {
      host.replaceChildren(h('div', { class: 'staff-cards' }, ...list.map((e) => h('button', { class: 'staff-card', on: { click: () => openEmployee(ctx, e.id) } },
        avatar(e.name, e.morale < 40 ? 'warn' : undefined),
        h('div', { class: 'staff-card-body' }, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${titleOf(e)} · L${e.level} · ${money(e.salary)}/mo · stress ${Math.round(e.stress ?? 0)}` }), progressBar(e.skill / 100, 'good')),
        h('span', { class: `tag ${moraleTone(e.morale)}`, text: `☺ ${Math.round(e.morale)}` }),
        canPromote(e) ? h('span', { class: 'tag accent', text: 'Promote' }) : null))));
    }
  };
  search.addEventListener('input', () => { q = search.value; draw(); });
  draw();

  const counts = ROLES.map((r) => ({ r, n: s.employees.filter((e) => e.role === r.id).length }));
  // Commission: a share of gross profit on every deal your staff close.
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
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  left.appendChild(panel(panelTitle('Your team'), h('div', { class: 'search wide' }, icon('search', 15), search), host));

  const cands = s.candidates;
  left.appendChild(panel(panelTitle('Candidates', h('span', { class: 'sub', text: `new applicants every Monday · hiring into ${loc.name}` })),
    cands.length ? h('div', { class: 'cand-list' }, ...cands.map((c) => h('div', { class: 'cand' },
      avatar(c.name, 'good', true),
      h('div', { class: 'cand-body' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: `${ROLE_BY_ID[c.role].name} · ${c.specialization} · skill ${c.skill} · works at ${ROLE_BY_ID[c.role].station}` }), progressBar(c.skill / 100, 'good'),
        h('div', { class: 'tiny muted', text: topSkills(c) })),
      h('div', { class: 'cand-side' }, h('span', { class: 'num', text: `${money(c.salary)}/mo` }), h('span', { class: 'tiny muted', text: `fee ${money(hiringFee(s, c))}` }),
        freeStation(s, loc, c.role)
          ? h('button', { class: 'btn small primary', on: { click: () => ctx.act(hire(s, c.id, loc.id)) } }, 'Hire')
          : h('button', {
            class: 'btn small', title: `Needs ${stationName(c.role)} — build one first`,
            on: { click: () => ctx.go('dealership', { build: '1', cat: 'staff' }) },
          }, `Needs ${stationName(c.role).replace(/^an? /, '')}`))))) : h('p', { class: 'empty', text: 'No applicants this week. More arrive on Monday.' })));

  right.appendChild(commissionPanel);
  right.appendChild(synPanel);
  right.appendChild(panel('Roles', ...counts.map(({ r, n }) => tipped(h('div', { class: `stat${r.minLevel > s.companyLevel ? ' muted' : ''}` }, h('span', { class: 'stat-label', text: `${r.icon} ${r.name}` }), h('span', { class: 'stat-value', text: r.minLevel > s.companyLevel ? `level ${r.minLevel}` : String(n) })), `${r.description} Works at ${r.station}.`))));
  right.appendChild(panel('What staff do', h('div', { class: 'tiny muted list' }, ...ROLES.map((r) => h('p', { style: 'margin:0', text: `${r.icon} ${r.name}: ${r.description}` })))));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}

export function openEmployee(ctx: Ctx, id: string): void {
  const s = ctx.state;
  const { body, footer, close } = modal({ title: 'Employee', width: 560, onClose: () => ctx.refresh() });
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
    body.appendChild(h('div', { class: 'profile-head' }, avatar(e.name), h('div', {}, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${titleOf(e)} · ${e.specialization} · ${locationName(s, e.locationId)}` }))));
    body.appendChild(h('div', { class: 'grid cols-2' },
      h('div', {}, h('div', { class: 'tiny muted', text: `Skill ${Math.round(e.skill)}/100` }), progressBar(e.skill / 100, 'good')),
      h('div', {}, h('div', { class: 'tiny muted', text: `Morale ${Math.round(e.morale)}/100` }), progressBar(e.morale / 100, moraleTone(e.morale))),
      h('div', {}, h('div', { class: 'tiny muted', text: e.level >= MAX_LEVEL ? `Level ${e.level} (max)` : `Level ${e.level} · XP ${e.xp}/${xpForLevel(e.level)}` }), progressBar(e.level >= MAX_LEVEL ? 1 : e.xp / xpForLevel(e.level), 'info')),
      h('div', {}, kv('Salary', `${money(e.salary)}/month`), kv('Deals / jobs', String(e.dealsClosed)))));
    body.appendChild(h('div', { class: 'grid cols-2' },
      h('div', {}, h('div', { class: 'tiny muted', text: `Stress ${Math.round(e.stress ?? 0)}/100${(e.stress ?? 0) > 70 ? ' — burning out, works worse' : ''}` }), progressBar((e.stress ?? 0) / 100, stressTone(e.stress ?? 0) === 'good' ? 'good' : stressTone(e.stress ?? 0))),
      h('div', {}, kv('Commission this month', money(e.commission ?? 0)), kv('With the company', `${s.day - e.hiredDay} days`))));
    body.appendChild(h('div', { class: 'skill-grid' }, ...SKILLS.map((k) => h('div', { class: `skill-row${k === ROLE_BY_ID[e.role].skill ? ' main' : ''}` },
      h('span', { class: 'tiny', text: SKILL_NAMES[k] }), progressBar(skillOf(e, k) / 100, k === ROLE_BY_ID[e.role].skill ? 'good' : 'info'), h('span', { class: 'tiny num', text: String(Math.round(skillOf(e, k))) })))));
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
    footer.appendChild(h('button', { class: 'btn', on: { click: () => run(giveRaise(s, e.id)) } }, 'Raise +8%'));
    const recent = e.bonusDay !== undefined && s.day - e.bonusDay < 30;
    footer.appendChild(h('button', { class: 'btn', disabled: recent, title: recent ? 'Once a month' : 'One-off bonus: morale up, stress down', on: { click: () => run(giveBonus(s, e.id)) } }, `Bonus ${money(bonusAmount(e))}`));
    footer.appendChild(h('button', { class: 'btn primary', disabled: !canPromote(e), on: { click: () => run(promote(s, e.id)) } }, 'Promote'));
  };
  draw();
}
