import type { Ctx, View } from '../app';
import type { Employee, Role } from '../../sim/types';
import { avatar, confirmDialog, empty, h, icon, modal, table, toast } from '../dom';
import { money } from '../../sim/format';
import { ROLES, ROLE_BY_ID } from '../../data/game';
import { canPromote, changeRole, fire, giveRaise, hire, promote, train, trainingCost, transfer, xpForLevel, MAX_LEVEL } from '../../sim/staff';
import { freeStation, stationName } from '../../sim/lot';
import { activeLocation, locationName, staffAt, staffCapacity } from '../../sim/state';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { isWide } from '../layout';
import { play } from '../../platform/sound';

let q = '';

function roleTag(r: Role): HTMLElement {
  const d = ROLE_BY_ID[r];
  return h('span', { class: 'tag plain', text: `${d.icon} ${d.name}` });
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
      host.replaceChildren(table(['Name', 'Role', 'Skill', 'Level', 'Morale', 'Salary', 'Location', 'Deals'], list.map((e) => [
        h('div', { class: 'cell-person' }, avatar(e.name, e.morale < 40 ? 'warn' : undefined, true), h('div', {}, h('div', { class: 'cell-person-name', text: e.name }), h('div', { class: 'tiny muted', text: e.trainingDaysLeft > 0 ? `On a course (${e.trainingDaysLeft}d)` : e.specialization }))),
        roleTag(e.role),
        h('div', { class: 'skill-cell' }, progressBar(e.skill / 100, 'good'), h('span', { class: 'tiny', text: String(Math.round(e.skill)) })),
        h('span', { class: 'num', text: `${e.level}${canPromote(e) ? ' ⬆' : ''}` }),
        h('span', { class: `tag ${moraleTone(e.morale)}`, text: String(Math.round(e.morale)) }),
        h('span', { class: 'num', text: money(e.salary) }),
        h('span', { class: 'tiny', text: locationName(s, e.locationId) }),
        h('span', { class: 'num', text: String(e.dealsClosed) }),
      ]), { onRowClick: (i) => openEmployee(ctx, list[i].id) }));
    } else {
      host.replaceChildren(h('div', { class: 'staff-cards' }, ...list.map((e) => h('button', { class: 'staff-card', on: { click: () => openEmployee(ctx, e.id) } },
        avatar(e.name, e.morale < 40 ? 'warn' : undefined),
        h('div', { class: 'staff-card-body' }, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${ROLE_BY_ID[e.role].name} · L${e.level} · ${money(e.salary)}/mo` }), progressBar(e.skill / 100, 'good')),
        h('span', { class: `tag ${moraleTone(e.morale)}`, text: `☺ ${Math.round(e.morale)}` }),
        canPromote(e) ? h('span', { class: 'tag accent', text: 'Promote' }) : null))));
    }
  };
  search.addEventListener('input', () => { q = search.value; draw(); });
  draw();

  const counts = ROLES.map((r) => ({ r, n: s.employees.filter((e) => e.role === r.id).length }));
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  left.appendChild(panel(panelTitle('Your team'), h('div', { class: 'search wide' }, icon('search', 15), search), host));

  const cands = s.candidates;
  left.appendChild(panel(panelTitle('Candidates', h('span', { class: 'sub', text: `new applicants every Monday · hiring into ${loc.name}` })),
    cands.length ? h('div', { class: 'cand-list' }, ...cands.map((c) => h('div', { class: 'cand' },
      avatar(c.name, 'good', true),
      h('div', { class: 'cand-body' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'tiny muted', text: `${ROLE_BY_ID[c.role].name} · ${c.specialization} · skill ${c.skill}` }), progressBar(c.skill / 100, 'good')),
      h('div', { class: 'cand-side' }, h('span', { class: 'num', text: `${money(c.salary)}/mo` }),
        freeStation(s, loc, c.role)
          ? h('button', { class: 'btn small primary', on: { click: () => ctx.act(hire(s, c.id, loc.id)) } }, 'Hire')
          : h('button', {
            class: 'btn small', title: `Needs ${stationName(c.role)} — build one first`,
            on: { click: () => ctx.go('dealership', { build: '1', cat: c.role === 'mechanic' || c.role === 'detailer' ? 'zones' : c.role === 'sales' ? 'work' : 'zones' }) },
          }, `Needs ${stationName(c.role).replace(/^an? /, '')}`))))) : h('p', { class: 'empty', text: 'No applicants this week. More arrive on Monday.' })));

  right.appendChild(panel('Roles', ...counts.map(({ r, n }) => tipped(h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: `${r.icon} ${r.name}` }), h('span', { class: 'stat-value', text: String(n) })), r.description))));
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
    body.appendChild(h('div', { class: 'profile-head' }, avatar(e.name), h('div', {}, h('div', { class: 'card-title', text: e.name }), h('div', { class: 'tiny muted', text: `${ROLE_BY_ID[e.role].name} · ${e.specialization} · ${locationName(s, e.locationId)}` }))));
    body.appendChild(h('div', { class: 'grid cols-2' },
      h('div', {}, h('div', { class: 'tiny muted', text: `Skill ${Math.round(e.skill)}/100` }), progressBar(e.skill / 100, 'good')),
      h('div', {}, h('div', { class: 'tiny muted', text: `Morale ${Math.round(e.morale)}/100` }), progressBar(e.morale / 100, moraleTone(e.morale))),
      h('div', {}, h('div', { class: 'tiny muted', text: e.level >= MAX_LEVEL ? `Level ${e.level} (max)` : `Level ${e.level} · XP ${e.xp}/${xpForLevel(e.level)}` }), progressBar(e.level >= MAX_LEVEL ? 1 : e.xp / xpForLevel(e.level), 'info')),
      h('div', {}, kv('Salary', `${money(e.salary)}/month`), kv('Deals / jobs', String(e.dealsClosed)))));
    if (e.trainingDaysLeft > 0) body.appendChild(h('p', { class: 'tiny warn', text: `On a training course for ${e.trainingDaysLeft} more day(s).` }));
    body.appendChild(h('p', { class: 'tiny muted', text: ROLE_BY_ID[e.role].description }));

    const roleSel = h('select', { aria: { label: 'Change role' } }, ...ROLES.map((r) => h('option', { value: r.id, selected: r.id === e.role }, r.name)));
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
    footer.appendChild(h('button', { class: 'btn', disabled: e.trainingDaysLeft > 0, on: { click: () => run(train(s, e.id)) } }, `Train (${money(trainingCost(e))})`));
    footer.appendChild(h('button', { class: 'btn primary', disabled: !canPromote(e), on: { click: () => run(promote(s, e.id)) } }, 'Promote'));
  };
  draw();
}
