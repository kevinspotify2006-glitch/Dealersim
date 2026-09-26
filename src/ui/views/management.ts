/**
 * Management Center (v7.3): run the company instead of every car. One place
 * for what needs you (approvals, exceptions), how each department runs
 * (manual / assisted / automated, per location), the policies they follow,
 * who runs them and how well, HR and the headhunter, the logistics fleet,
 * your own IF/THEN rules and the management reports.
 *
 * Every control here changes the simulation directly; nothing is decorative.
 */
import type { Ctx, View } from '../app';
import type { AutoMode, AutoPriority, Category, CustomRule, Dept, Employee, FuelType, GameState, HeadCriteria, PricingPolicy, RiskAppetite, Role, RuleAction, RuleMetric, SkillId } from '../../sim/types';
import { avatar, confirmDialog, h, kpi, modal, tag } from '../dom';
import { icon } from '../icons';
import { money, moneyShort } from '../../sim/format';
import { pageHead, panel, panelTitle, progressBar, segmented } from '../kit';
import { meterRow } from '../mobile/components';
import { isWide } from '../layout';
import { CHANNELS, CHANNEL_BY_ID, ROLES, ROLE_BY_ID, SKILL_NAMES } from '../../data/game';
import { CATEGORIES, FUELS } from '../../data/vehicles';
import { PRICING_POLICY } from '../../sim/market';
import { RISK_NAMES, buyers } from '../../sim/systems/procurement';
import {
  DEPARTMENTS, DEPT_BY_ID, DEPT_OVERHEAD, HEADHUNTER_LEVELS, LOGI_ASSETS, LOGI_BY_TYPE, PRIORITY_NAMES, RULE_ACTIONS, RULE_METRICS,
} from '../../data/automation';
import {
  activeDepartments, applyHqPolicy, dismissException, errorRate, hrCapacity, hrGrade, managerFor, managerQuality, modeFor, reportTotals, sortedExceptions, stockAt,
  inventoryPolicy, fleetFree,
} from '../../sim/systems/autocore';
import {
  RULES, addRule, approveSale, automationMonthlyCost, declineSale, describeRule, metricValue, removeRule, setAllModes, setMode, clearLocalMode, toggleRule,
} from '../../sim/systems/automation';
import { assignHr, autoAssignHr, hrKpi, hrManagers, managedBy, setHrAuto, vacancies } from '../../sim/systems/hr';
import {
  closeSearch, defaultCriteria, endHeadhunter, headhunterLevel, hireCandidate, misses, openSearches, startSearch, upgradeHeadhunter,
} from '../../sim/systems/headhunter';
import { assetValue, buyAsset, fleetCapacity, fleetMonthlyCost, sellAsset, serviceAsset } from '../../sim/systems/logistics';
import { rolesUnlocked, skillOf, titleOf } from '../../sim/staff';
import { conflicts } from '../../sim/systems/planning';
import { campaignRoi } from '../../sim/world';
import { partsStock } from '../../sim/systems/service';
import { PARTS } from '../../data/service';
import { lotStats } from '../../sim/lot';

const MODE_NAMES: Record<AutoMode, string> = { manual: 'Manual', assisted: 'Assisted', auto: 'Auto' };
const PRI_TONE: Record<AutoPriority, 'bad' | 'warn' | 'info' | 'muted'> = { critical: 'bad', high: 'warn', normal: 'info', low: 'muted' };

const eur = (n: number): string => money(Math.round(n));

// ------------------------------------------------------------- helpers --

function modeSeg(ctx: Ctx, dept: Dept, locationId?: string): HTMLElement {
  const s = ctx.state;
  const cur = locationId ? modeFor(s, locationId, dept) : s.automation.policies.modes[dept];
  return segmented((['manual', 'assisted', 'auto'] as AutoMode[]).map((m) => ({ value: m, label: MODE_NAMES[m] })), cur,
    (m) => ctx.act(setMode(s, dept, m, locationId)), `mode-seg mode-${cur}`);
}

/** A number field bound to a policy value. */
function numField(ctx: Ctx, label: string, value: number, set: (n: number) => void, opts: { step?: number; min?: number; max?: number; unit?: string; key?: string } = {}): HTMLElement {
  const input = h('input', { type: 'number', value: String(value), step: opts.step ?? 1, min: opts.min ?? 0, max: opts.max, inputmode: 'numeric', data: { policy: opts.key ?? label }, aria: { label } });
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) return;
    const v = Math.max(opts.min ?? 0, opts.max !== undefined ? Math.min(opts.max, n) : n);
    set(v);
    ctx.act({ ok: true, message: `${label}: ${opts.unit === '€' ? eur(v) : `${v}${opts.unit ? ` ${opts.unit}` : ''}`}` });
  });
  return h('label', { class: 'field' }, h('span', { text: opts.unit && opts.unit !== '€' ? `${label} (${opts.unit})` : opts.unit === '€' ? `${label} (€)` : label }), input);
}

function toggle(ctx: Ctx, title: string, text: string, value: boolean, set: (on: boolean) => void, key?: string): HTMLElement {
  const box = h('input', { type: 'checkbox', checked: value, data: { toggle: key ?? title } });
  box.addEventListener('change', () => { set(box.checked); ctx.act({ ok: true, message: `${title}: ${box.checked ? 'on' : 'off'}` }); });
  return h('label', { class: 'toggle-row' }, box, h('div', {}, h('div', { class: 'card-title', text: title }), h('div', { class: 'tiny muted', text })));
}

function chipList<T extends string>(ctx: Ctx, label: string, all: { id: T; name: string }[], list: T[], anyLabel = 'Any'): HTMLElement {
  const wrap = h('div', { class: 'chip-pick' });
  const paint = (): void => {
    wrap.replaceChildren(
      h('button', { class: `bp-chip${list.length === 0 ? ' active' : ''}`, on: { click: () => { list.length = 0; paint(); ctx.act({ ok: true, message: `${label}: ${anyLabel.toLowerCase()}` }); } } }, anyLabel),
      ...all.map((x) => h('button', { class: `bp-chip${list.includes(x.id) ? ' active' : ''}`, data: { pick: x.id }, on: { click: () => { const i = list.indexOf(x.id); if (i >= 0) list.splice(i, 1); else list.push(x.id); paint(); } } }, x.name)));
  };
  paint();
  return h('div', { class: 'field' }, h('span', { text: label }), wrap);
}

function grid(...children: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: `grid ${isWide() ? 'cols-3' : 'cols-2'} mc-fields` }, ...children);
}

/** Mode control for a department: the group setting and, with more locations, each location. */
function modePanel(ctx: Ctx, dept: Dept): HTMLElement {
  const s = ctx.state;
  const d = DEPT_BY_ID[dept];
  const rows: HTMLElement[] = [];
  if (s.locations.length > 1) {
    for (const loc of s.locations) {
      const local = s.automation.local[loc.id]?.modes?.[dept];
      rows.push(h('div', { class: 'mc-locmode', data: { loc: loc.id } },
        h('span', { class: 'mc-locname', text: loc.name }),
        modeSeg(ctx, dept, loc.id),
        local ? h('button', { class: 'btn ghost small', on: { click: () => { clearLocalMode(s, loc.id, dept); ctx.act({ ok: true, message: `${loc.name} follows the group policy for ${d.name.toLowerCase()} again.` }); } } }, 'Follow HQ') : h('span', { class: 'tiny muted', text: 'HQ policy' })));
    }
  }
  const cur = s.automation.policies.modes[dept];
  const mgrs = s.locations.map((l) => ({ l, m: managerFor(s, l.id, dept) }));
  return panel(panelTitle(`${d.name}`, h('span', { class: 'sub', text: d.description })),
    h('div', { class: 'mc-modebar' }, h('span', { class: 't-label', text: s.locations.length > 1 ? 'Group policy' : 'Mode' }), modeSeg(ctx, dept)),
    h('p', { class: 'tiny muted mc-modetext', text: d.modes[cur] }),
    ...rows,
    h('div', { class: 'mc-runby' }, ...mgrs.map(({ l, m }) => h('div', { class: 'mc-runrow' },
      h('span', { class: 'tiny', text: s.locations.length > 1 ? `${l.name}:` : 'Run by:' }),
      m ? h('span', { class: 'tiny', text: `${m.e.name} · quality ${m.quality} · ${m.actions} actions/day · ${Math.round(m.err * 100)}% error` })
        : h('span', { class: 'tiny warn', text: `nobody — needs a ${d.roles.map((r) => ROLE_BY_ID[r].name.toLowerCase()).join(' or ')}` })))));
}

function exceptionRow(ctx: Ctx, x: ReturnType<typeof sortedExceptions>[number]): HTMLElement {
  const s = ctx.state;
  const loc = x.locationId ? s.locations.find((l) => l.id === x.locationId) : undefined;
  return h('div', { class: `mc-ex pri-${x.priority}`, data: { ex: x.id } },
    tag(PRIORITY_NAMES[x.priority], PRI_TONE[x.priority]),
    h('div', { class: 'mc-ex-body' }, h('div', { class: 'mc-ex-text', text: x.text }),
      h('div', { class: 'tiny muted', text: `${DEPT_BY_ID[x.dept]?.name ?? x.dept}${loc && s.locations.length > 1 ? ` · ${loc.name}` : ''} · ${x.day === s.day ? 'today' : `day ${x.day}`}` })),
    h('div', { class: 'mc-ex-act' },
      x.route ? h('button', { class: 'btn small', on: { click: () => { if (x.locationId && s.locations.some((l) => l.id === x.locationId)) s.activeLocationId = x.locationId; ctx.go(x.route!, x.params ?? {}); } } }, 'Open') : null,
      h('button', { class: 'icon-btn', aria: { label: 'Dismiss' }, title: 'Dismiss', on: { click: () => ctx.act(dismissException(s, x.id)) } }, icon('close', 14))));
}

function approvalCard(ctx: Ctx, a: GameState['automation']['approvals'][number]): HTMLElement {
  const s = ctx.state;
  const v = s.vehicles.find((x) => x.id === a.vehicleId);
  const e = s.employees.find((x) => x.id === a.staffId);
  return h('div', { class: 'mc-approval', data: { approval: a.id } },
    h('div', { class: 'mc-ex-body' },
      h('div', { class: 'card-title', text: `${a.customer.name} · ${v ? `${v.year} ${v.brand} ${v.model}` : 'car gone'}` }),
      h('div', { class: 'tiny', text: `Offer ${eur(a.price)} · margin ${a.margin >= 0 ? '+' : '−'}${eur(Math.abs(a.margin))}${v ? ` · asking ${eur(v.askingPrice)}` : ''}` }),
      h('div', { class: 'tiny muted', text: `${a.reason} · via ${e?.name.split(' ')[0] ?? 'your advisor'} · ${a.expires - s.day <= 0 ? 'decide today' : `waits ${a.expires - s.day} more day(s)`}` })),
    h('div', { class: 'mc-ex-act' },
      h('button', { class: 'btn small', data: { act: 'decline' }, on: { click: () => ctx.act(declineSale(s, a.id)) } }, 'Decline'),
      h('button', { class: 'btn primary small', data: { act: 'approve' }, on: { click: () => ctx.act(approveSale(s, a.id), { sound: 'sale', money: a.margin }) } }, 'Approve')));
}

function reportLine(t: Record<string, number> | undefined): string {
  if (!t) return 'nothing yet';
  const names: Record<string, string> = {
    sold: 'sold', revenue: 'revenue', profit: 'profit', approvals: 'sent for approval', approved: 'approved', declined: 'declined', refused: 'walked (policy)', expired: 'approvals lapsed',
    bought: 'bought (approved)', autoBought: 'bought (auto)', spent: 'spent', started: 'buyers started', paused: 'buyers paused',
    listed: 'listed', repriced: 'repriced', cleared: 'cleared', clearLoss: 'clearance result', fixed: 'conflicts fixed', ordered: 'parts ordered',
    launched: 'campaigns launched', stopped: 'campaigns stopped', trained: 'trained', promoted: 'promoted', raises: 'raises', talks: 'talks', daysOff: 'days off',
    searches: 'searches', candidates: 'candidates', hired: 'hired', recruited: 'recruited', replaced: 'replaced', moves: 'fleet moves', collected: 'collected', transfers: 'transfers',
    breakdowns: 'breakdowns', errors: 'mistakes', rules: 'rules fired',
  };
  const money = new Set(['revenue', 'profit', 'spent', 'clearLoss']);
  return Object.entries(t).filter(([, v]) => v).map(([k, v]) => `${money.has(k) ? moneyShort(v) : v} ${names[k] ?? k}`).join(' · ') || 'nothing yet';
}

// ------------------------------------------------------------ overview --

export function mgmtOverview(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const ex = sortedExceptions(s);
  const cost = automationMonthlyCost(s);
  const week = reportTotals(s, 7);
  const errors = Object.values(week).reduce((n, l) => n + (l?.errors ?? 0), 0);
  view.appendChild(pageHead('Management Center', 'Set the policy, let your managers run it, step in where they need you.',
    h('button', { class: 'btn', on: { click: () => ctx.go('management', { tab: 'automation' }) } }, icon('settings', 14), h('span', { text: 'Automation' }))));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Automated departments', value: String(activeDepartments(s).length), sub: `of ${DEPARTMENTS.length}`, icon: 'gauge', tone: 'info' }),
    kpi({ label: 'Needs you', value: String(s.automation.approvals.length + ex.filter((x) => x.priority === 'critical' || x.priority === 'high').length), sub: `${s.automation.approvals.length} approvals · ${ex.length} exceptions`, icon: 'alert', tone: ex.some((x) => x.priority === 'critical') ? 'bad' : 'warn' }),
    kpi({ label: 'Automation cost', value: moneyShort(cost.overhead + cost.retainer + fleetMonthlyCost(s)), sub: 'a month (overhead, headhunter, fleet)', icon: 'cash', tone: 'warn' }),
    kpi({ label: 'Manager mistakes', value: String(errors), sub: 'this week', icon: 'warning', tone: errors ? 'bad' : 'good' })));

  view.appendChild(panel(panelTitle('Approvals', h('span', { class: 'sub', text: 'deals your advisors could not close alone' })),
    s.automation.approvals.length ? h('div', { class: 'mc-list' }, ...s.automation.approvals.map((a) => approvalCard(ctx, a)))
      : h('p', { class: 'tiny muted', text: modeFor(s, s.activeLocationId, 'sales') === 'manual' ? 'Turn on assisted or automated sales and big or off-policy deals come here.' : 'Nothing waiting.' })));

  view.appendChild(panel(panelTitle('Exceptions', h('span', { class: 'sub', text: 'what your managers flag, most urgent first' })),
    ex.length ? h('div', { class: 'mc-list' }, ...ex.slice(0, 30).map((x) => exceptionRow(ctx, x)))
      : h('p', { class: 'tiny muted', text: 'No exceptions — everything runs within your policy.' })));

  const today = s.automation.reports[0]?.day === s.day ? s.automation.reports[0] : undefined;
  view.appendChild(panel('Departments', h('div', { class: 'mc-depts' }, ...DEPARTMENTS.map((d) => {
    const modes = s.locations.map((l) => modeFor(s, l.id, d.id));
    const summary = [...new Set(modes)].map((m) => MODE_NAMES[m]).join(' / ');
    const m = managerFor(s, s.activeLocationId, d.id);
    const tab = d.id === 'parts' ? 'service' : d.id === 'hr' ? 'hr' : d.id;
    return h('button', { class: `mc-dept mode-${modes[0]}`, data: { dept: d.id }, on: { click: () => ctx.go('management', { tab }) } },
      h('span', { class: 'mc-dept-ic' }, icon(d.icon, 18)),
      h('span', { class: 'mc-dept-txt' },
        h('span', { class: 'card-title', text: d.name }),
        h('span', { class: 'tiny', text: summary }),
        h('span', { class: 'tiny muted', text: m ? `${m.e.name.split(' ')[0]} · q${m.quality}` : 'no manager' }),
        h('span', { class: 'tiny muted', text: `Today: ${reportLine(today?.lines[d.id])}` })),
      icon('chevron', 14));
  }))));
  return { el: view };
}

// ---------------------------------------------------------- automation --

export function mgmtAutomation(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const locals = Object.values(s.automation.local).filter((l) => (l.modes && Object.keys(l.modes).length) || l.stockMin !== undefined || l.stockTarget !== undefined || l.stockMax !== undefined || l.marketingBudget !== undefined).length;
  view.appendChild(pageHead('Automation', 'Manual: you do it. Assisted: your managers prepare and flag, you decide. Auto: they act within your policy.'));
  view.appendChild(panel('Everything at once',
    h('div', { class: 'btn-row wrap' },
      h('button', { class: 'btn', data: { all: 'manual' }, on: { click: () => ctx.act(setAllModes(s, 'manual')) } }, 'All manual'),
      h('button', { class: 'btn', data: { all: 'assisted' }, on: { click: () => ctx.act(setAllModes(s, 'assisted')) } }, 'All assisted'),
      h('button', { class: 'btn primary', data: { all: 'auto' }, on: { click: () => ctx.act(setAllModes(s, 'auto')) } }, 'All automated')),
    s.locations.length > 1 ? h('div', { class: 'mc-hq' },
      h('p', { class: 'tiny muted', text: locals ? `${locals} location${locals > 1 ? 's have' : ' has'} its own settings.` : 'Every location follows the group (HQ) policy.' }),
      h('button', { class: 'btn', data: { act: 'hq' }, disabled: !locals, on: { click: async () => { if (await confirmDialog('Apply HQ policy?', 'Every location drops its own settings and follows the group policy again.', 'Apply everywhere')) ctx.act(applyHqPolicy(s)); } } }, 'Apply HQ policy to every location')) : null,
    h('p', { class: 'tiny muted', text: `Each automated department costs ${eur(DEPT_OVERHEAD)} a month per location in tools and oversight. Managers get through a limited number of tasks a day and weaker ones make mistakes.` })));
  for (const d of DEPARTMENTS) view.appendChild(modePanel(ctx, d.id));
  return { el: view };
}

// ------------------------------------------------------------ managers --

export function mgmtManagers(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  view.appendChild(pageHead('Managers', 'Who runs what: from you at the top to the people on the floor. Better managers do more and make fewer mistakes.'));
  const gms = s.employees.filter((e) => e.role === 'manager' && (e.focus === 'general' || !e.focus));
  const person = (e: Employee, dept?: Dept): HTMLElement => {
    const q = dept ? managerQuality(e, dept) : Math.round(skillOf(e, 'management'));
    return h('div', { class: 'mc-person' }, avatar(e.name, undefined, true),
      h('div', { class: 'mc-person-txt' }, h('span', { class: 'card-title', text: e.name }), h('span', { class: 'tiny muted', text: `${titleOf(e)} · ${s.locations.find((l) => l.id === e.locationId)?.name ?? ''}` })),
      h('div', { class: 'mc-q' }, progressBar(q / 100, q >= 70 ? 'good' : q >= 45 ? 'info' : 'warn'), h('span', { class: 'tiny num', text: dept ? `q${q} · ${Math.round(errorRate(q) * 100)}% err` : `mgmt ${q}` })));
  };
  const tree = h('div', { class: 'mc-tree' });
  tree.appendChild(h('div', { class: 'mc-node lvl-0' }, h('div', { class: 'mc-person' }, h('span', { class: 'mc-crown' }, icon('trophy', 16)), h('div', { class: 'mc-person-txt' }, h('span', { class: 'card-title', text: s.ownerName }), h('span', { class: 'tiny muted', text: `CEO · ${s.companyName}` })))));
  tree.appendChild(h('div', { class: 'mc-node lvl-1' }, h('div', { class: 't-label', text: 'General management' }),
    gms.length ? h('div', {}, ...gms.map((e) => person(e))) : h('p', { class: 'tiny muted', text: 'No general manager yet — hire a manager (People → Recruitment) to lift every team.' })));
  for (const loc of s.locations) {
    const node = h('div', { class: 'mc-node lvl-2' }, h('div', { class: 't-label', text: s.locations.length > 1 ? `${loc.name} — department managers` : 'Department managers' }));
    for (const d of DEPARTMENTS) {
      const m = managerFor(s, loc.id, d.id);
      node.appendChild(h('div', { class: 'mc-deptrow' }, h('span', { class: 'mc-deptname' }, icon(d.icon, 14), h('span', { text: d.name })),
        m ? person(m.e, d.id) : h('span', { class: 'tiny warn', text: `Vacant — a ${ROLE_BY_ID[d.roles[0]].name.toLowerCase()} would run it` })));
    }
    const leads = s.employees.filter((e) => e.locationId === loc.id && e.level >= 3 && !['manager', 'hr', 'logistics', 'inventory', 'procurement'].includes(e.role));
    node.appendChild(h('div', { class: 't-label', text: 'Team leaders (level 3+)' }));
    node.appendChild(leads.length ? h('div', {}, ...leads.map((e) => person(e))) : h('p', { class: 'tiny muted', text: 'Promote experienced people to level 3 to get team leaders.' }));
    const floor = s.employees.filter((e) => e.locationId === loc.id && e.level < 3);
    const byRole = new Map<Role, number>();
    for (const e of floor) byRole.set(e.role, (byRole.get(e.role) ?? 0) + 1);
    node.appendChild(h('div', { class: 't-label', text: `Employees (${floor.length})` }));
    node.appendChild(h('div', { class: 'chip-pick' }, ...[...byRole.entries()].map(([r, n]) => h('span', { class: 'tag', text: `${ROLE_BY_ID[r].icon} ${n} ${ROLE_BY_ID[r].name.toLowerCase()}${n > 1 ? 's' : ''}` }))));
    tree.appendChild(node);
  }
  view.appendChild(panel('Hierarchy', tree));
  return { el: view };
}

// ------------------------------------------------------------------ HR --

export function mgmtHr(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const k = hrKpi(s);
  const pol = s.automation.policies.hr;
  view.appendChild(pageHead('HR', 'HR managers look after your people: fewer sick days, and with AUTO MANAGE they train, promote, review pay and recruit.',
    h('button', { class: 'btn', on: { click: () => ctx.go('people', { tab: 'hire' }) } }, icon('plus', 14), h('span', { text: 'Hire HR manager' }))));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'HR managers', value: String(k.managers), sub: `capacity ${k.capacity} people`, icon: 'people', tone: 'info' }),
    kpi({ label: 'Looked after', value: `${k.covered}`, sub: k.uncovered ? `${k.uncovered} without HR` : 'everyone', icon: 'good', tone: k.uncovered ? 'warn' : 'good' }),
    kpi({ label: 'Morale / performance', value: `${k.avgMorale} / ${k.avgPerformance}`, sub: `${k.absentToday} absent · ${k.inTraining} training`, icon: 'gauge', tone: k.avgMorale >= 60 ? 'good' : 'warn' }),
    kpi({ label: 'Vacancies', value: String(k.vacancies), sub: `${k.searches} searches · ${k.promotable} promotable`, icon: 'customer', tone: k.vacancies ? 'warn' : 'good' })));

  view.appendChild(modePanel(ctx, 'hr'));
  const hrs = hrManagers(s);
  if (!hrs.length) {
    view.appendChild(panel('No HR manager yet', h('p', { class: 'tiny muted', text: `An HR manager (company level ${ROLE_BY_ID.hr.minLevel}+, works at an office or HR desk) looks after ${hrCapacity({ level: 1, skills: { management: 50 } } as Employee)} people at grade 1 and up to 1,000 at grade 10.` }),
      h('button', { class: 'btn primary', on: { click: () => ctx.go('people', { tab: 'hire' }) } }, 'Recruit an HR manager')));
  }
  for (const m of hrs) {
    const team = managedBy(s, m.id);
    const cap = hrCapacity(m);
    const list = h('div', { class: 'mc-team' }, ...team.slice(0, 40).map((e) => h('div', { class: 'mc-member' },
      h('span', { class: 'tiny', text: `${ROLE_BY_ID[e.role].icon} ${e.name}` }),
      h('span', { class: 'tiny muted', text: `skill ${e.skill} · morale ${Math.round(e.morale)} · perf ${Math.round(e.performance ?? 55)}${e.trainingDaysLeft ? ' · training' : ''}` }),
      h('button', { class: 'icon-btn', aria: { label: `Remove ${e.name}` }, title: 'Remove from this HR manager', on: { click: () => ctx.act(assignHr(s, e.id, undefined)) } }, icon('close', 12)))));
    if (team.length > 40) list.appendChild(h('p', { class: 'tiny muted', text: `…and ${team.length - 40} more` }));
    view.appendChild(panel(panelTitle(`${m.name}`, h('span', { class: 'sub', text: `HR grade ${hrGrade(m)} · ${titleOf(m)}` })),
      meterRow('Capacity', team.length / cap, `${team.length} / ${cap}`, team.length > cap ? 'bad' : team.length >= cap ? 'warn' : 'good'),
      toggle(ctx, 'AUTO MANAGE', m.hrAuto !== false ? 'Trains, promotes, reviews pay, prevents burn-out and replaces leavers for their people.' : 'Off: only advises — you make the calls.', m.hrAuto !== false, (on) => { const r = setHrAuto(s, m.id, on); if (r.message.includes('HR set')) ctx.act(r); }, `hrauto-${m.id}`),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', data: { act: 'assign-all' }, on: { click: () => { const n = autoAssignHr(s); ctx.act({ ok: n > 0, message: n ? `${n} employee${n > 1 ? 's' : ''} assigned.` : 'Nobody left to assign, or every HR manager is full.' }); } } }, 'Assign everyone without HR')),
      h('details', { class: 'mc-details' }, h('summary', { text: `Team (${team.length})` }), list)));
  }
  const loose = s.employees.filter((e) => e.role !== 'hr' && !e.hrBy);
  if (hrs.length && loose.length) {
    view.appendChild(panel(panelTitle('Without an HR manager', h('span', { class: 'sub', text: `${loose.length}` })), h('div', { class: 'mc-team' }, ...loose.slice(0, 30).map((e) => h('div', { class: 'mc-member' },
      h('span', { class: 'tiny', text: `${ROLE_BY_ID[e.role].icon} ${e.name}` }),
      h('select', { aria: { label: `HR manager for ${e.name}` }, on: { change: (ev: Event) => ctx.act(assignHr(s, e.id, (ev.target as HTMLSelectElement).value || undefined)) } },
        h('option', { value: '', text: 'Assign to…' }), ...hrs.map((m) => h('option', { value: m.id, text: `${m.name} (${managedBy(s, m.id).length}/${hrCapacity(m)})` }))))))));
  }
  view.appendChild(panel('HR policy',
    grid(
      numField(ctx, 'Training budget / month', pol.trainingBudget, (n) => { pol.trainingBudget = n; }, { step: 500, unit: '€', key: 'trainingBudget' }),
      numField(ctx, 'Train people below skill', pol.trainBelow, (n) => { pol.trainBelow = n; }, { max: 99, key: 'trainBelow' }),
      numField(ctx, 'Promote from skill', pol.promoteSkill, (n) => { pol.promoteSkill = n; }, { max: 99, key: 'promoteSkill' }),
      numField(ctx, 'Promote from performance', pol.promotePerf, (n) => { pol.promotePerf = n; }, { max: 100, key: 'promotePerf' }),
      numField(ctx, 'Months in the job before promotion', pol.promoteMonths, (n) => { pol.promoteMonths = n; }, { max: 36, key: 'promoteMonths' })),
    h('p', { class: 'tiny muted', text: `Training spent this month: ${eur(s.automation.spent.training)} of ${eur(pol.trainingBudget)}.` }),
    toggle(ctx, 'Monthly salary review', 'HR raises the pay of underpaid, unhappy people (8%).', pol.salaryReview, (on) => { pol.salaryReview = on; }, 'salaryReview'),
    toggle(ctx, 'Replace people who leave', 'Whoever quits, is fired or reaches the end of a contract is replaced within a month.', pol.autoReplace, (on) => { pol.autoReplace = on; }, 'autoReplace')));
  const roles = rolesUnlocked(s).filter((r) => r !== 'hr');
  view.appendChild(panel(panelTitle('Target headcount', h('span', { class: 'sub', text: 'per location — HR recruits up to these numbers' })),
    grid(...roles.map((r) => numField(ctx, ROLE_BY_ID[r].name, pol.targets[r] ?? 0, (n) => { if (n > 0) pol.targets[r] = Math.round(n); else delete pol.targets[r]; }, { max: 50, key: `target-${r}` }))),
    (() => {
      const v = vacancies(s);
      return v.length ? h('div', { class: 'mc-list' }, ...v.map((x) => h('div', { class: 'tiny', text: `${s.locations.find((l) => l.id === x.locationId)?.name}: ${x.short} × ${ROLE_BY_ID[x.role].name.toLowerCase()} (${x.reason === 'left' ? 'someone left' : 'below target'})` })))
        : h('p', { class: 'tiny muted', text: 'Every location is at target.' });
    })()));
  return { el: view };
}

// ---------------------------------------------------------- headhunter --

export function mgmtHeadhunter(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const lv = headhunterLevel(s);
  const next = HEADHUNTER_LEVELS[s.headhunter.level];
  view.appendChild(pageHead('Headhunter', lv ? `${lv.name} · level ${lv.level} · ${s.headhunter.placed} placed` : 'Brief an agency and get candidates who match — better agencies find better people, faster.'));
  view.appendChild(h('div', { class: 'mc-levels' }, ...HEADHUNTER_LEVELS.map((L) => h('div', { class: `mc-level${lv?.level === L.level ? ' current' : ''}${L.level <= s.headhunter.level ? ' done' : ''}`, data: { hhlevel: String(L.level) } },
    h('div', { class: 'card-title', text: `${L.level}. ${L.name}` }),
    h('div', { class: 'tiny', text: L.description }),
    h('div', { class: 'tiny muted', text: `${eur(L.cost)} · ${eur(L.retainer)}/month · ${eur(L.searchFee)}/search · ${Math.round(L.successFee * 100)}% of a year's salary per hire` }),
    h('div', { class: 'tiny muted', text: `${L.searches} search${L.searches > 1 ? 'es' : ''} · ${L.candidates} candidates · ${Math.round(L.fit * 100)}% brief fit${L.traits ? ' · traits checked' : ''}${L.negotiate ? ' · negotiates' : ''}${L.passive ? ' · poaches' : ''}${L.executive ? ' · executives' : ''} · company level ${L.minCompanyLevel}+` })))));
  view.appendChild(h('div', { class: 'btn-row' },
    next ? h('button', { class: 'btn primary', data: { act: 'hh-upgrade' }, disabled: s.companyLevel < next.minCompanyLevel || s.cash < next.cost, on: { click: () => ctx.act(upgradeHeadhunter(s), { sound: 'buy', money: -next.cost }) } }, lv ? `Upgrade to ${next.name} (${eur(next.cost)})` : `Sign ${next.name} (${eur(next.cost)})`) : null,
    lv ? h('button', { class: 'btn', on: { click: async () => { if (await confirmDialog('End the contract?', 'Open searches are closed and the retainer stops.', 'End contract', true)) ctx.act(endHeadhunter(s)); } } }, 'End contract') : null));
  if (lv) view.appendChild(searchForm(ctx));
  const list = openSearches(s);
  for (const sr of list) {
    const loc = s.locations.find((l) => l.id === sr.locationId);
    view.appendChild(panel(panelTitle(`${ROLE_BY_ID[sr.role].icon} ${ROLE_BY_ID[sr.role].name}${s.locations.length > 1 ? ` · ${loc?.name ?? ''}` : ''}`,
      h('span', { class: 'sub', text: sr.status === 'searching' ? `searching — ready day ${sr.readyDay}${sr.auto ? ' · by HR' : ''}` : `${sr.note ?? ''} · until day ${sr.expires}${sr.auto ? ' · by HR' : ''}` })),
      h('div', { class: 'tiny muted', text: `Brief: skill ≥ ${sr.criteria.minSkill} · ≤ ${eur(sr.criteria.maxSalary)}/month · ${sr.criteria.minExperience}+ yrs · age ${sr.criteria.ageMin}–${sr.criteria.ageMax}${sr.criteria.contract !== 'any' ? ` · ${sr.criteria.contract}` : ''}${sr.criteria.specialization ? ` · ${sr.criteria.specialization}` : ''}${Object.entries(sr.criteria.traits).filter(([, v]) => v).map(([k, v]) => ` · ${SKILL_NAMES[k as SkillId]} ≥ ${v}`).join('')}` }),
      sr.status === 'ready' ? h('div', { class: 'mc-cands' }, ...sr.candidates.map((c) => {
        const miss = misses(c, sr.criteria);
        const fee = Math.round(c.salary * 12 * (lv?.successFee ?? 0.1) / 10) * 10;
        return h('div', { class: `mc-cand${miss.length ? '' : ' full'}`, data: { cand: c.id } },
          avatar(c.name, miss.length ? undefined : 'good', true),
          h('div', { class: 'mc-person-txt' },
            h('span', { class: 'card-title', text: `${c.name} · skill ${c.skill} · L${c.level}` }),
            h('span', { class: 'tiny', text: `${c.age} yrs · ${c.experience ?? 0} yrs experience · ${c.specialization} · ${eur(c.salary)}/month${c.contract && c.contract !== 'permanent' ? ` · ${c.contract}` : ''}` }),
            c.traitsKnown ? h('span', { class: 'tiny muted', text: `Reliability ${skillOf(c, 'reliability')} · stress resistance ${skillOf(c, 'composure')} · detail ${skillOf(c, 'detail')}` }) : null,
            c.source ? h('span', { class: 'tiny info', text: c.source }) : null,
            h('span', { class: `tiny ${miss.length ? 'warn' : 'good'}`, text: miss.length ? `Misses: ${miss.join(', ')}` : 'Meets the whole brief' })),
          h('button', { class: 'btn primary small', data: { act: 'hh-hire' }, on: { click: () => ctx.act(hireCandidate(s, sr.id, c.id), { sound: 'success', money: -fee }) } }, `Hire (${moneyShort(fee)})`));
      })) : h('div', { class: 'tiny muted', text: 'The agency is on it.' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost small', on: { click: () => ctx.act(closeSearch(s, sr.id)) } }, 'Close search'))));
  }
  return { el: view };
}

function searchForm(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const lv = headhunterLevel(s)!;
  let role: Role = 'sales';
  let locId = s.activeLocationId;
  let c: HeadCriteria = defaultCriteria(role);
  const host = h('div', {});
  const paint = (): void => {
    const roleSel = h('select', { data: { field: 'hh-role' }, on: { change: (e: Event) => { role = (e.target as HTMLSelectElement).value as Role; c = defaultCriteria(role); paint(); } } },
      ...rolesUnlocked(s).map((r) => h('option', { value: r, selected: r === role, text: ROLE_BY_ID[r].name })));
    const locSel = s.locations.length > 1 ? h('select', { on: { change: (e: Event) => { locId = (e.target as HTMLSelectElement).value; } } }, ...s.locations.map((l) => h('option', { value: l.id, selected: l.id === locId, text: l.name }))) : null;
    const n = (label: string, key: 'minSkill' | 'maxSalary' | 'minExperience' | 'ageMin' | 'ageMax', step: number): HTMLElement => {
      const input = h('input', { type: 'number', value: String(c[key]), step, inputmode: 'numeric', data: { field: `hh-${key}` }, aria: { label } });
      input.addEventListener('change', () => { c[key] = Math.max(0, Math.round(Number(input.value) || 0)); });
      return h('label', { class: 'field' }, h('span', { text: label }), input);
    };
    const contract = segmented([{ value: 'any', label: 'Any' }, { value: 'permanent', label: 'Permanent' }, { value: 'temporary', label: 'Temporary' }, { value: 'parttime', label: 'Part-time' }], c.contract, (v) => { c.contract = v as HeadCriteria['contract']; paint(); });
    const spec = h('select', { on: { change: (e: Event) => { c.specialization = (e.target as HTMLSelectElement).value || undefined; } } },
      h('option', { value: '', text: 'Any specialisation' }), ...ROLE_BY_ID[role].specializations.map((x) => h('option', { value: x, selected: c.specialization === x, text: x })));
    const traits = lv.traits ? h('div', { class: 'grid cols-3 mc-fields' }, ...(['reliability', 'composure', 'detail'] as SkillId[]).map((t) => {
      const input = h('input', { type: 'number', value: String(c.traits[t] ?? 0), min: 0, max: 99, inputmode: 'numeric', aria: { label: SKILL_NAMES[t] } });
      input.addEventListener('change', () => { const v = Math.max(0, Math.min(99, Number(input.value) || 0)); if (v) c.traits[t] = v; else delete c.traits[t]; });
      return h('label', { class: 'field' }, h('span', { text: `Min ${SKILL_NAMES[t].toLowerCase()}` }), input);
    })) : h('p', { class: 'tiny muted', text: 'Trait filters (reliability, stress resistance, detail) from level 3.' });
    host.replaceChildren(panel(panelTitle('New search', h('span', { class: 'sub', text: `${eur(lv.searchFee)} per search · ${openSearches(s).filter((x) => x.status === 'searching').length}/${lv.searches} running` })),
      h('div', { class: 'grid cols-2 mc-fields' }, h('label', { class: 'field' }, h('span', { text: 'Role' }), roleSel), locSel ? h('label', { class: 'field' }, h('span', { text: 'Location' }), locSel) : h('label', { class: 'field' }, h('span', { text: 'Specialisation' }), spec)),
      grid(n('Minimum skill', 'minSkill', 5), n('Max salary / month (€)', 'maxSalary', 100), n('Min years experience', 'minExperience', 1), n('Age from', 'ageMin', 1), n('Age to', 'ageMax', 1)),
      locSel ? h('label', { class: 'field' }, h('span', { text: 'Specialisation' }), spec) : null,
      h('div', { class: 'field' }, h('span', { text: 'Contract' }), contract),
      traits,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', data: { act: 'hh-search' }, on: { click: () => ctx.act(startSearch(s, role, locId, c), { money: -lv.searchFee }) } }, 'Start search'))));
  };
  paint();
  return host;
}

// ---------------------------------------------------------- departments --

function stockTable(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  return h('div', { class: 'mc-list' }, ...s.locations.map((l) => {
    const p = inventoryPolicy(s, l.id);
    const n = stockAt(s, l);
    return h('div', { class: 'mc-stockrow' }, h('span', { class: 'tiny', text: l.name }),
      meterRow(`${n} cars`, n / Math.max(1, p.maxStock), `min ${p.minStock} · target ${p.targetStock} · max ${p.maxStock}`, n < p.minStock ? 'bad' : n > p.maxStock ? 'warn' : 'good'));
  }));
}

function localStock(ctx: Ctx): HTMLElement | null {
  const s = ctx.state;
  if (s.locations.length < 2) return null;
  return panel(panelTitle('Per location', h('span', { class: 'sub', text: 'leave empty to follow HQ' })), ...s.locations.map((l) => {
    const lp = (s.automation.local[l.id] ??= {});
    const f = (label: string, key: 'stockMin' | 'stockTarget' | 'stockMax'): HTMLElement => {
      const input = h('input', { type: 'number', value: lp[key] !== undefined ? String(lp[key]) : '', placeholder: 'HQ', inputmode: 'numeric', aria: { label: `${l.name} ${label}` } });
      input.addEventListener('change', () => { const v = input.value.trim(); if (v === '') delete lp[key]; else lp[key] = Math.max(0, Math.round(Number(v) || 0)); ctx.act({ ok: true, message: `${l.name}: ${label.toLowerCase()} ${v === '' ? 'follows HQ' : v}` }); });
      return h('label', { class: 'field' }, h('span', { text: label }), input);
    };
    return h('div', {}, h('div', { class: 't-label', text: l.name }), h('div', { class: 'grid cols-3 mc-fields' }, f('Min stock', 'stockMin'), f('Target', 'stockTarget'), f('Max stock', 'stockMax')));
  }));
}

export function mgmtProcurement(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const p = s.automation.policies.procurement;
  const team = buyers(s);
  view.appendChild(pageHead('Procurement', `${team.length} buyer${team.length === 1 ? '' : 's'} · ${eur(s.automation.spent.procurement)} of ${eur(p.monthlyBudget)} spent this month`,
    h('button', { class: 'btn', on: { click: () => ctx.go('inventory', { tab: 'buyers' }) } }, 'Buyers & deals')));
  view.appendChild(modePanel(ctx, 'procurement'));
  view.appendChild(panel('Stock levels', stockTable(ctx)));
  view.appendChild(panel('Buying policy',
    grid(
      numField(ctx, 'Start buying below', p.stockMin, (n) => { p.stockMin = Math.round(n); }, { unit: 'cars', key: 'stockMin' }),
      numField(ctx, 'Stop buying at', p.stockTarget, (n) => { p.stockTarget = Math.round(n); }, { unit: 'cars', key: 'stockTarget' }),
      numField(ctx, 'Max price per car', p.maxPrice, (n) => { p.maxPrice = n; }, { step: 1000, unit: '€', key: 'maxPrice' }),
      numField(ctx, 'Min expected margin', p.minMargin, (n) => { p.minMargin = n; }, { step: 250, unit: '€', key: 'minMargin' }),
      numField(ctx, 'Max mileage', p.kmMax, (n) => { p.kmMax = n; }, { step: 10000, unit: 'km', key: 'kmMax' }),
      numField(ctx, 'Buy without asking up to', p.autoBuyUnder, (n) => { p.autoBuyUnder = n; }, { step: 1000, unit: '€', key: 'autoBuyUnder' }),
      numField(ctx, 'Monthly purchase budget', p.monthlyBudget, (n) => { p.monthlyBudget = n; }, { step: 5000, unit: '€', key: 'monthlyBudget' })),
    h('div', { class: 'field' }, h('span', { text: 'Risk' }), segmented((['low', 'medium', 'high'] as RiskAppetite[]).map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) })), p.risk, (r) => { p.risk = r; ctx.act({ ok: true, message: RISK_NAMES[r] }); })),
    chipList<Category>(ctx, 'Segments', CATEGORIES.map((c) => ({ id: c, name: c })), p.categories),
    chipList<FuelType>(ctx, 'Fuel', FUELS.map((f) => ({ id: f, name: f })), p.fuels),
    h('p', { class: 'tiny muted', text: 'Automated: buyers buy good deals under the approval limit themselves. Assisted: they search, you approve each deal (Inventory → Buyers).' })));
  const local = localStock(ctx);
  if (local) view.appendChild(local);
  return { el: view };
}

export function mgmtInventory(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const p = s.automation.policies.inventory;
  const manual = s.vehicles.filter((v) => v.manualPrice && (v.status === 'listed' || v.status === 'yard')).length;
  view.appendChild(pageHead('Inventory & pricing', `${manual} car${manual === 1 ? '' : 's'} priced by hand (automation leaves those alone)`,
    h('button', { class: 'btn', on: { click: () => ctx.go('inventory', { tab: 'ageing' }) } }, 'Ageing stock')));
  view.appendChild(modePanel(ctx, 'inventory'));
  view.appendChild(panel('Stock levels', stockTable(ctx)));
  view.appendChild(panel('Stock policy',
    grid(
      numField(ctx, 'Minimum stock', p.minStock, (n) => { p.minStock = Math.round(n); }, { unit: 'cars', key: 'minStock' }),
      numField(ctx, 'Target stock', p.targetStock, (n) => { p.targetStock = Math.round(n); }, { unit: 'cars', key: 'targetStock' }),
      numField(ctx, 'Maximum stock', p.maxStock, (n) => { p.maxStock = Math.round(n); }, { unit: 'cars', key: 'maxStock' }),
      numField(ctx, 'Reprice after', p.repriceDays, (n) => { p.repriceDays = Math.round(n); }, { unit: 'days', max: 365, key: 'repriceDays' }),
      numField(ctx, 'Clear to trade after', p.clearDays, (n) => { p.clearDays = Math.round(n); }, { unit: 'days', max: 720, key: 'clearDays' })),
    toggle(ctx, 'List cars when ready', 'Prepared cars go on sale by themselves, priced to the policy.', p.autoList, (on) => { p.autoList = on; }, 'autoList')));
  view.appendChild(panel('Pricing policy', h('div', { class: 'choice-list' }, ...(Object.keys(PRICING_POLICY) as PricingPolicy[]).map((k) => {
    const d = PRICING_POLICY[k];
    return h('button', { class: `choice${p.pricing === k ? ' active' : ''}`, data: { pricing: k }, on: { click: () => { p.pricing = k; ctx.act({ ok: true, message: `Pricing: ${d.name}` }); } } },
      h('div', { class: 'card-title', text: `${d.name} · ${Math.round((d.price - 1) * 100) >= 0 ? '+' : ''}${Math.round((d.price - 1) * 100)}% price` }), h('div', { class: 'tiny muted', text: d.description }));
  }))));
  const local = localStock(ctx);
  if (local) view.appendChild(local);
  return { el: view };
}

export function mgmtSales(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const p = s.automation.policies.sales;
  const t = reportTotals(s, 7).sales ?? {};
  view.appendChild(pageHead('Sales', `This week: ${t.sold ?? 0} sold by the team · ${moneyShort(t.revenue ?? 0)} revenue · ${t.approvals ?? 0} sent to you`));
  view.appendChild(modePanel(ctx, 'sales'));
  view.appendChild(panel('Sales policy',
    grid(
      numField(ctx, 'Minimum margin per car', p.minMargin, (n) => { p.minMargin = n; }, { step: 100, unit: '€', key: 'minMargin' }),
      numField(ctx, 'Maximum discount', Math.round(p.maxDiscount * 100), (n) => { p.maxDiscount = Math.min(50, n) / 100; }, { max: 50, unit: '%', key: 'maxDiscount' }),
      numField(ctx, 'Ask me above', p.approveAbove, (n) => { p.approveAbove = n; }, { step: 5000, unit: '€', key: 'approveAbove' })),
    toggle(ctx, 'Offer finance', 'Advisors arrange loans and leases when a buyer wants to pay monthly.', p.finance, (on) => { p.finance = on; }, 'finance'),
    h('p', { class: 'tiny muted', text: 'Automated: advisors close deals inside the policy; deals above your limit wait for you. Assisted: every deal outside the policy waits for you too.' })));
  view.appendChild(panel(panelTitle('Approvals', h('span', { class: 'sub', text: String(s.automation.approvals.length) })),
    s.automation.approvals.length ? h('div', { class: 'mc-list' }, ...s.automation.approvals.map((a) => approvalCard(ctx, a))) : h('p', { class: 'tiny muted', text: 'Nothing waiting.' })));
  return { el: view };
}

export function mgmtService(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const sp = s.automation.policies.service;
  const pp = s.automation.policies.parts;
  const conf = s.locations.reduce((n, l) => n + conflicts(s, l.id, s.day).length + conflicts(s, l.id, s.day + 1).length, 0);
  const low = s.locations.reduce((n, l) => {
    const lifts = lotStats(l.lot).slots.lift.length;
    if (!lifts) return n;
    const st = partsStock(l);
    return n + PARTS.filter((p) => (st[p.id] ?? 0) < Math.ceil(p.min * (0.6 + lifts * 0.4) * pp.minFactor)).length;
  }, 0);
  view.appendChild(pageHead('Service & parts', `${conf} planning conflict${conf === 1 ? '' : 's'} · ${low} part${low === 1 ? '' : 's'} below minimum`,
    h('button', { class: 'btn', on: { click: () => ctx.go('service', { tab: 'planning' }) } }, 'Planning')));
  view.appendChild(modePanel(ctx, 'service'));
  view.appendChild(panel('Service policy',
    toggle(ctx, 'Fix planning conflicts', 'Double bookings, absent mechanics and unassigned jobs are reassigned or rescheduled every day.', sp.autoFix, (on) => { sp.autoFix = on; }, 'autoFix')));
  view.appendChild(modePanel(ctx, 'parts'));
  view.appendChild(panel('Parts policy',
    grid(
      numField(ctx, 'Minimum stock factor', pp.minFactor, (n) => { pp.minFactor = Math.max(0.5, Math.min(4, n)); }, { step: 0.25, min: 0.5, max: 4, unit: '×', key: 'minFactor' }),
      numField(ctx, 'Order up to (× minimum)', pp.targetFactor, (n) => { pp.targetFactor = Math.max(1, Math.min(6, n)); }, { step: 0.25, min: 1, max: 6, unit: '×', key: 'targetFactor' })),
    toggle(ctx, 'Express when out of stock', 'Pays the express surcharge when a shelf is empty.', pp.express, (on) => { pp.express = on; }, 'express')));
  return { el: view };
}

export function mgmtMarketing(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const p = s.automation.policies.marketing;
  view.appendChild(pageHead('Marketing', `${eur(s.automation.spent.marketing)} of ${eur(p.monthlyBudget)} spent by automation this month`,
    h('button', { class: 'btn', on: { click: () => ctx.go('business', { tab: 'marketing' }) } }, 'Campaigns')));
  view.appendChild(modePanel(ctx, 'marketing'));
  view.appendChild(panel('Marketing policy',
    grid(
      numField(ctx, 'Monthly budget', p.monthlyBudget, (n) => { p.monthlyBudget = n; }, { step: 500, unit: '€', key: 'monthlyBudget' }),
      numField(ctx, 'Stop campaigns below ROI', Math.round(p.minRoi * 100), (n) => { p.minRoi = n / 100; }, { min: -100, max: 1000, unit: '%', key: 'minRoi' })),
    chipList(ctx, 'Channels', CHANNELS.map((c) => ({ id: c.id, name: `${c.icon} ${c.name}` })), p.channels, 'None')));
  const running = s.campaigns.filter((c) => c.endDay >= s.day);
  view.appendChild(panel('Running campaigns', running.length ? h('div', { class: 'mc-list' }, ...running.map((c) => h('div', { class: 'mc-member' },
    h('span', { class: 'tiny', text: `${CHANNEL_BY_ID[c.channelId]?.icon ?? ''} ${CHANNEL_BY_ID[c.channelId]?.name ?? c.channelId}${s.locations.length > 1 ? ` · ${s.locations.find((l) => l.id === c.locationId)?.name}` : ''}` }),
    h('span', { class: `tiny ${campaignRoi(c) >= p.minRoi ? 'good' : 'warn'}`, text: `${c.leads} leads · ROI ${Math.round(campaignRoi(c) * 100)}% · until day ${c.endDay}` })))) : h('p', { class: 'tiny muted', text: 'No campaign running.' })));
  return { el: view };
}

export function mgmtLogistics(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const p = s.automation.policies.logistics;
  const lg = s.logistics;
  view.appendChild(pageHead('Logistics', `${lg.fleet.length} vehicle${lg.fleet.length === 1 ? '' : 's'} · ${fleetCapacity(s)} moves a day (${fleetFree(s)} free today) · ${eur(fleetMonthlyCost(s))}/month`));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Moves this month', value: String(lg.movedMonth), sub: `${eur(lg.costMonth)} fuel & repairs`, icon: 'car', tone: 'info' }),
    kpi({ label: 'Own move', value: lg.fleet.length ? eur(Math.min(...lg.fleet.map((a) => LOGI_BY_TYPE[a.type].perMove))) : '—', sub: 'vs €180 by carrier', icon: 'cash', tone: 'good' }),
    kpi({ label: 'Collection', value: lg.fleet.length ? `−${Math.max(...lg.fleet.map((a) => LOGI_BY_TYPE[a.type].speed))} day(s)` : '—', sub: 'bought cars arrive sooner', icon: 'clock', tone: 'tech' }),
    kpi({ label: 'Out of service', value: String(lg.fleet.filter((a) => a.downUntil && a.downUntil > s.day).length), sub: 'broken down', icon: 'wrench', tone: 'warn' })));
  view.appendChild(modePanel(ctx, 'logistics'));
  view.appendChild(panel('Logistics policy',
    toggle(ctx, 'Collect bought cars', 'Your fleet picks up purchases so they arrive sooner (assisted or automated).', p.pickUp, (on) => { p.pickUp = on; }, 'pickUp'),
    toggle(ctx, 'Balance stock between locations', 'Automated: surplus cars move to locations below their minimum (needs a logistics or inventory manager).', p.balanceStock, (on) => { p.balanceStock = on; }, 'balanceStock')));
  view.appendChild(panel('Your fleet', lg.fleet.length ? h('div', { class: 'mc-list' }, ...lg.fleet.map((a) => {
    const d = LOGI_BY_TYPE[a.type];
    const down = a.downUntil && a.downUntil > s.day;
    return h('div', { class: 'mc-asset', data: { asset: a.id } },
      h('span', { class: 'mc-asset-ic', text: d.icon }),
      h('div', { class: 'mc-person-txt' }, h('span', { class: 'card-title', text: d.name }),
        h('span', { class: `tiny ${down ? 'warn' : 'muted'}`, text: `${s.locations.find((l) => l.id === a.locationId)?.name ?? ''} · ${d.capacity}/day · condition ${Math.round(a.condition)}%${down ? ` · broken down until day ${a.downUntil}` : ''}` })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', disabled: a.condition >= 95, on: { click: () => ctx.act(serviceAsset(s, a.id)) } }, 'Service'),
        h('button', { class: 'btn ghost small', on: { click: async () => { if (await confirmDialog('Sell it?', `A trader pays ${eur(assetValue(s, a.id))}.`, 'Sell')) ctx.act(sellAsset(s, a.id), { sound: 'cash' }); } } }, 'Sell')));
  })) : h('p', { class: 'tiny muted', text: 'No own transport yet: a carrier moves every car for €180.' })));
  view.appendChild(panel('Buy transport', h('div', { class: 'mc-levels' }, ...LOGI_ASSETS.map((d) => h('div', { class: 'mc-level', data: { logi: d.type } },
    h('div', { class: 'card-title', text: `${d.icon} ${d.name}` }),
    h('div', { class: 'tiny', text: d.description }),
    h('div', { class: 'tiny muted', text: `${eur(d.price)} · ${eur(d.monthly)}/month · ${d.capacity} a day · ${eur(d.perMove)} a move · ${Math.round(d.reliability * 100)}% reliable · level ${d.minLevel}+` }),
    h('button', { class: 'btn primary small', data: { act: `buy-${d.type}` }, disabled: s.companyLevel < d.minLevel || s.cash < d.price, on: { click: () => ctx.act(buyAsset(s, d.type, s.activeLocationId), { sound: 'buy', money: -d.price }) } }, `Buy (${moneyShort(d.price)})`))))));
  return { el: view };
}

export function mgmtFinance(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  const cost = automationMonthlyCost(s);
  const pol = s.automation.policies;
  const since = s.day - 30;
  const spent = (cat: string): number => -s.transactions.filter((t) => t.day > since && t.category === cat && t.amount < 0).reduce((n, t) => n + t.amount, 0);
  view.appendChild(pageHead('Finance', 'What running the company on autopilot costs, and the budgets your managers spend.'));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Automation overhead', value: eur(cost.overhead), sub: `${cost.departments} department-location${cost.departments === 1 ? '' : 's'} × ${eur(DEPT_OVERHEAD)}`, icon: 'gauge', tone: 'warn' }),
    kpi({ label: 'Headhunter retainer', value: eur(cost.retainer), sub: headhunterLevel(s)?.name ?? 'no agency', icon: 'customer', tone: 'info' }),
    kpi({ label: 'Fleet', value: eur(fleetMonthlyCost(s)), sub: 'drivers, insurance, upkeep', icon: 'car', tone: 'tech' }),
    kpi({ label: 'Total per month', value: eur(cost.overhead + cost.retainer + fleetMonthlyCost(s)), sub: 'before budgets below', icon: 'cash', tone: 'bad' })));
  view.appendChild(panel('Budgets this month',
    meterRow('Training', s.automation.spent.training / Math.max(1, pol.hr.trainingBudget), `${eur(s.automation.spent.training)} / ${eur(pol.hr.trainingBudget)}`, s.automation.spent.training >= pol.hr.trainingBudget ? 'warn' : 'good'),
    meterRow('Marketing', s.automation.spent.marketing / Math.max(1, pol.marketing.monthlyBudget), `${eur(s.automation.spent.marketing)} / ${eur(pol.marketing.monthlyBudget)}`, s.automation.spent.marketing >= pol.marketing.monthlyBudget ? 'warn' : 'good'),
    meterRow('Purchases', s.automation.spent.procurement / Math.max(1, pol.procurement.monthlyBudget), `${eur(s.automation.spent.procurement)} / ${eur(pol.procurement.monthlyBudget)}`, s.automation.spent.procurement >= pol.procurement.monthlyBudget ? 'warn' : 'good'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', on: { click: () => ctx.go('management', { tab: 'hr' }) } }, 'Training budget'),
      h('button', { class: 'btn small', on: { click: () => ctx.go('management', { tab: 'marketing' }) } }, 'Marketing budget'),
      h('button', { class: 'btn small', on: { click: () => ctx.go('management', { tab: 'procurement' }) } }, 'Purchase budget'))));
  view.appendChild(panel('Last 30 days', h('div', { class: 'mc-list' },
    ...['Automation', 'Recruitment', 'Logistics', 'Training', 'Marketing', 'Parts purchase'].map((c) => h('div', { class: 'mc-member' }, h('span', { class: 'tiny', text: c }), h('span', { class: 'tiny num', text: eur(spent(c)) }))))));
  return { el: view };
}

// ---------------------------------------------------------------- rules --

export function mgmtRules(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  view.appendChild(pageHead('Rules', 'IF something happens THEN act. Built-in rules run for every assisted or automated department; add your own below.',
    h('button', { class: 'btn primary', data: { act: 'add-rule' }, on: { click: () => openRuleEditor(ctx) } }, icon('plus', 14), h('span', { text: 'New rule' }))));
  const mine = [...s.automation.rules].sort((a, b) => ['critical', 'high', 'normal', 'low'].indexOf(a.priority) - ['critical', 'high', 'normal', 'low'].indexOf(b.priority));
  view.appendChild(panel(panelTitle('Your rules', h('span', { class: 'sub', text: `${mine.length}/20` })), mine.length ? h('div', { class: 'mc-list' }, ...mine.map((r) => {
    const now = s.locations.map((l) => metricValue(s, l, r.metric, r.arg));
    return h('div', { class: `mc-rule${r.enabled ? '' : ' off'}`, data: { rule: r.id } },
      tag(PRIORITY_NAMES[r.priority], PRI_TONE[r.priority]),
      h('div', { class: 'mc-ex-body' }, h('div', { class: 'card-title', text: r.name }), h('div', { class: 'tiny', text: describeRule(r) }),
        h('div', { class: 'tiny muted', text: `Now: ${now.map((v) => v.toLocaleString('en-GB')).join(' / ')} · fired ${r.fired ?? 0}× · every ${r.cooldown} day(s) at most${r.lastDay !== undefined ? ` · last day ${r.lastDay}` : ''}` })),
      h('div', { class: 'mc-ex-act' },
        h('button', { class: `btn small${r.enabled ? '' : ' primary'}`, data: { act: 'toggle-rule' }, on: { click: () => ctx.act(toggleRule(s, r.id)) } }, r.enabled ? 'Pause' : 'Enable'),
        h('button', { class: 'icon-btn', aria: { label: 'Delete rule' }, title: 'Delete', on: { click: () => ctx.act(removeRule(s, r.id)) } }, icon('trash', 14))));
  })) : h('p', { class: 'tiny muted', text: 'No rules yet. Example: IF cars on sale > 60 days > 3 THEN cut prices 5%.' })));
  view.appendChild(panel('Built-in rules', h('div', { class: 'mc-list' }, ...[...RULES].sort((a, b) => ['critical', 'high', 'normal', 'low'].indexOf(a.priority) - ['critical', 'high', 'normal', 'low'].indexOf(b.priority)).map((r) => {
    const on = s.locations.some((l) => modeFor(s, l.id, r.dept) !== 'manual');
    return h('div', { class: `mc-rule${on ? '' : ' off'}` }, tag(PRIORITY_NAMES[r.priority], PRI_TONE[r.priority]),
      h('div', { class: 'mc-ex-body' }, h('div', { class: 'card-title', text: r.name }), h('div', { class: 'tiny', text: `IF ${r.when.toLowerCase()} THEN ${r.then.toLowerCase()}` }),
        h('div', { class: 'tiny muted', text: `${DEPT_BY_ID[r.dept].name} · ${on ? 'active' : 'department on manual'}` })));
  }))));
  return { el: view };
}

function openRuleEditor(ctx: Ctx): void {
  const s = ctx.state;
  const r: Omit<CustomRule, 'id' | 'fired' | 'lastDay'> = { name: '', enabled: true, metric: 'aged', arg: '60', op: '>', value: 3, action: 'reprice', param: '5', priority: 'normal', cooldown: 7 };
  const { body, footer, close } = modal({ title: 'New rule', sub: 'IF … THEN …', width: 560, cls: 'rule-sheet' });
  const paint = (): void => {
    const m = RULE_METRICS[r.metric];
    const a = RULE_ACTIONS[r.action];
    const name = h('input', { type: 'text', value: r.name, maxlength: 40, placeholder: 'My rule', data: { field: 'rule-name' }, on: { input: (e: Event) => { r.name = (e.target as HTMLInputElement).value; } } });
    const metric = h('select', { data: { field: 'rule-metric' }, on: { change: (e: Event) => { r.metric = (e.target as HTMLSelectElement).value as RuleMetric; r.arg = RULE_METRICS[r.metric].arg === 'days' ? '60' : RULE_METRICS[r.metric].arg === 'role' ? 'sales' : undefined; paint(); } } },
      ...(Object.keys(RULE_METRICS) as RuleMetric[]).map((k) => h('option', { value: k, selected: k === r.metric, text: RULE_METRICS[k].name })));
    const arg = m.arg === 'days' ? h('input', { type: 'number', value: r.arg ?? '60', min: 1, inputmode: 'numeric', on: { change: (e: Event) => { r.arg = String(Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 60))); } } })
      : m.arg === 'role' ? h('select', { on: { change: (e: Event) => { r.arg = (e.target as HTMLSelectElement).value; } } }, ...ROLES.map((x) => h('option', { value: x.id, selected: x.id === r.arg, text: x.name }))) : null;
    const op = segmented([{ value: '<', label: 'less than' }, { value: '>', label: 'more than' }], r.op, (v) => { r.op = v as '<' | '>'; paint(); });
    const value = h('input', { type: 'number', value: String(r.value), inputmode: 'numeric', data: { field: 'rule-value' }, on: { change: (e: Event) => { r.value = Number((e.target as HTMLInputElement).value); } } });
    const action = h('select', { data: { field: 'rule-action' }, on: { change: (e: Event) => { r.action = (e.target as HTMLSelectElement).value as RuleAction; const p = RULE_ACTIONS[r.action].param; r.param = p === 'percent' ? '5' : p === 'channel' ? 'social' : p === 'role' ? 'sales' : undefined; paint(); } } },
      ...(Object.keys(RULE_ACTIONS) as RuleAction[]).map((k) => h('option', { value: k, selected: k === r.action, text: RULE_ACTIONS[k].name })));
    const param = a.param === 'percent' ? h('input', { type: 'number', value: r.param ?? '5', min: 1, max: 25, inputmode: 'numeric', on: { change: (e: Event) => { r.param = String(Math.max(1, Math.min(25, Math.round(Number((e.target as HTMLInputElement).value) || 5)))); } } })
      : a.param === 'channel' ? h('select', { on: { change: (e: Event) => { r.param = (e.target as HTMLSelectElement).value; } } }, ...CHANNELS.map((c) => h('option', { value: c.id, selected: c.id === r.param, text: `${c.icon} ${c.name}` })))
        : a.param === 'role' ? h('select', { on: { change: (e: Event) => { r.param = (e.target as HTMLSelectElement).value; } } }, ...rolesUnlocked(s).map((x) => h('option', { value: x, selected: x === r.param, text: ROLE_BY_ID[x].name }))) : null;
    const cool = h('input', { type: 'number', value: String(r.cooldown), min: 1, max: 30, inputmode: 'numeric', on: { change: (e: Event) => { r.cooldown = Number((e.target as HTMLInputElement).value) || 1; } } });
    body.replaceChildren(
      h('label', { class: 'field' }, h('span', { text: 'Name' }), name),
      h('div', { class: 't-label', text: 'IF' }),
      h('div', { class: 'grid cols-2 mc-fields' }, h('label', { class: 'field' }, h('span', { text: 'Condition' }), metric), arg ? h('label', { class: 'field' }, h('span', { text: m.arg === 'days' ? 'Days' : 'Role' }), arg) : h('span', {})),
      h('div', { class: 'grid cols-2 mc-fields' }, h('div', { class: 'field' }, h('span', { text: 'Is' }), op), h('label', { class: 'field' }, h('span', { text: `Value (${m.unit})` }), value)),
      h('div', { class: 't-label', text: 'THEN' }),
      h('div', { class: 'grid cols-2 mc-fields' }, h('label', { class: 'field' }, h('span', { text: 'Action' }), action), param ? h('label', { class: 'field' }, h('span', { text: a.param === 'percent' ? 'Percent' : a.param === 'channel' ? 'Channel' : 'Role' }), param) : h('span', {})),
      h('div', { class: 'field' }, h('span', { text: 'Priority' }), segmented((['low', 'normal', 'high', 'critical'] as AutoPriority[]).map((p) => ({ value: p, label: PRIORITY_NAMES[p] })), r.priority, (p) => { r.priority = p; paint(); })),
      h('label', { class: 'field' }, h('span', { text: 'At most every … days' }), cool));
  };
  paint();
  footer.appendChild(h('button', { class: 'btn', on: { click: close } }, 'Cancel'));
  footer.appendChild(h('button', { class: 'btn primary', data: { act: 'save-rule' }, on: { click: () => { const res = addRule(s, r); ctx.act(res); if (res.ok) close(); } } }, 'Add rule'));
}

// -------------------------------------------------------------- reports --

export function mgmtReports(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view mc' });
  view.appendChild(pageHead('Reports', 'What your managers did, day by day. A weekly summary also arrives in your notifications.'));
  const w = reportTotals(s, 7);
  const m = reportTotals(s, 30);
  view.appendChild(panel('This week and month', h('div', { class: 'mc-list' }, ...DEPARTMENTS.map((d) => h('div', { class: 'mc-report' },
    h('span', { class: 'mc-deptname' }, icon(d.icon, 14), h('span', { text: d.name })),
    h('div', { class: 'mc-ex-body' }, h('div', { class: 'tiny', text: `7 days: ${reportLine(w[d.id])}` }), h('div', { class: 'tiny muted', text: `30 days: ${reportLine(m[d.id])}` })))))));
  const days = s.automation.reports.slice(0, 14);
  view.appendChild(panel('Daily reports', days.length ? h('div', { class: 'mc-list' }, ...days.map((r) => openIf(r.day >= s.day - 1, h('details', { class: 'mc-details' },
    h('summary', { text: `Day ${r.day}${r.day === s.day ? ' (today)' : ''} — ${Object.keys(r.lines).length} department${Object.keys(r.lines).length === 1 ? '' : 's'}` }),
    ...(Object.entries(r.lines) as [Dept, Record<string, number>][]).map(([d, l]) => h('div', { class: 'tiny', text: `${DEPT_BY_ID[d]?.name ?? d}: ${reportLine(l)}` })))))) : h('p', { class: 'tiny muted', text: 'Reports start as soon as a department is assisted or automated.' })));
  return { el: view };
}

function openIf(on: boolean, el: HTMLDetailsElement): HTMLDetailsElement {
  el.open = on;
  return el;
}

// ------------------------------------------------------------------ hub --

export function managementBadge(s: GameState): number {
  return s.automation.approvals.length + s.automation.exceptions.filter((x) => x.priority === 'critical' || x.priority === 'high').length;
}
