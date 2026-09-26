/**
 * Growth screens: brand contracts, research, missions and decisions.
 */
import type { Ctx, View } from '../app';
import { confirmDialog, empty, h, kpi, modal, table } from '../dom';
import { money, moneyShort, pct, shortDate } from '../../sim/format';
import { MANUFACTURERS, BRAND_BY_ID } from '../../data/vehicles';
import { TRAINING_BY_ID } from '../../data/game';
import { RESEARCH, RESEARCH_BY_ID, RESEARCH_CATEGORIES } from '../../data/research';
import { MISSIONS, MISSION_BY_ID } from '../../data/missions';
import { DECISION_BY_ID } from '../../data/decisions';
import { activeLocation, locationName } from '../../sim/state';
import { TIER_NAMES, canSign, contractFor, endContract, maxContracts, requirements, salesTarget, signContract } from '../../sim/systems/brands';
import { lockReason, researchProgress, researchState, startResearch } from '../../sim/systems/research';
import { metricValue, missionProgress, missionsDone } from '../../sim/systems/missions';
import { fillText, resolveDecision } from '../../sim/systems/decisions';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { locationPicker } from './business';
import { play } from '../../platform/sound';

// ---------------------------------------------------------------- Brands --

let brandFilter: 'all' | 'ready' | 'mine' = 'all';

export function brandsView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const view = h('div', { class: 'view' });
  const max = maxContracts(s);
  view.appendChild(pageHead('Brand contracts', `${s.contracts.length} of ${max} contract${max === 1 ? '' : 's'} your company level allows · new cars at dealer price`, helpButton('brands')));
  const picker = locationPicker(ctx, 'Showroom for a new contract');
  if (picker) view.appendChild(picker);

  if (s.contracts.length) {
    view.appendChild(panel('Your franchises', h('div', { class: 'grid cols-2' }, ...s.contracts.map((c) => {
      const b = BRAND_BY_ID[c.brandId];
      const target = salesTarget(c.brandId, c.tier);
      const next = c.tier < 3 ? requirements(s, c.brandId, s.locations.find((l) => l.id === c.locationId) ?? loc, c.tier + 1) : [];
      return h('article', { class: 'card', data: { contract: c.brandId } },
        h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: `${b?.name ?? c.brandId}` }), h('div', { class: 'card-sub', text: `${TIER_NAMES[c.tier]} · ${locationName(s, c.locationId)} · since ${shortDate(c.since)}` })),
          h('span', { class: `tag ${c.warnings ? 'bad' : 'good'}`, text: c.warnings ? `Warning ${c.warnings}/3` : 'Good standing' })),
        h('div', { class: 'tiny muted', text: `This month: ${c.soldMonth}/${target} new ${b?.name} cars sold` }), progressBar(c.soldMonth / target, c.soldMonth >= target ? 'good' : 'warn'),
        h('div', { class: 'tiny muted', text: `Relationship ${Math.round(c.relation)}/100` }), progressBar(c.relation / 100, c.relation >= 60 ? 'good' : c.relation >= 30 ? 'warn' : 'bad'),
        kv('Dealer margin', pct(((b?.dealer?.margin ?? 0.08) + (c.tier - 1) * 0.012) * 100, 1)),
        kv('Target bonus', b?.dealer ? `${money(b.dealer.bonus)} per car when the target is met` : '—'),
        kv('Sold in total', String(c.soldTotal)),
        next.length ? h('div', { class: 'tiny muted', text: `${TIER_NAMES[c.tier + 1]} needs: ${next.map((r) => `${r.label} ${r.have}/${r.need}${r.ok ? ' ✓' : ''}`).join(' · ')} and relationship 75+` }) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small', on: { click: () => ctx.go('market', { source: 'manufacturer' }) } }, 'Order new cars'),
          h('button', {
            class: 'btn small danger', on: {
              click: async () => {
                if (!(await confirmDialog(`End the ${b?.name} contract?`, 'You lose access to new cars and the brand will remember it.', 'End contract', true))) return;
                endContract(s, c.brandId, 'you ended it');
                ctx.act({ ok: true, message: `${b?.name} contract ended.` });
              },
            },
          }, 'End contract')));
    }))));
  }

  const brands = MANUFACTURERS.filter((b) => b.dealer).filter((b) => brandFilter === 'all' || (brandFilter === 'mine' ? !!contractFor(s, b.id) : canSign(s, b.id, loc.id).ok));
  view.appendChild(panel(panelTitle('Manufacturers', h('div', { class: 'seg small' }, ...(['all', 'ready', 'mine'] as const).map((f) => h('button', { class: `seg-btn${f === brandFilter ? ' active' : ''}`, on: { click: () => { brandFilter = f; ctx.refresh(); } } }, f === 'all' ? 'All' : f === 'ready' ? 'Can sign now' : 'Mine')))),
    brands.length ? h('div', { class: 'grid cols-3' }, ...brands.map((b) => {
      const d = b.dealer!;
      const reqs = requirements(s, b.id, loc, 1);
      const sign = canSign(s, b.id, loc.id);
      const mine = contractFor(s, b.id);
      return h('article', { class: `card brand-card${mine ? ' mine' : ''}`, data: { brand: b.id } },
        h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: b.name }), h('div', { class: 'card-sub', text: `${b.country} · ${'★'.repeat(Math.max(1, Math.round(b.prestige * 5)))} · ${b.tagline}` })),
          mine ? h('span', { class: 'tag good', text: TIER_NAMES[mine.tier] }) : null),
        h('div', { class: 'grid cols-2' }, kv('Dealer margin', pct(d.margin * 100, 1)), kv('Monthly target', `${salesTarget(b.id, 1)} cars`), kv('Franchise fee', money(d.fee)), kv('Bonus', `${money(d.bonus)}/car`)),
        h('div', { class: 'req-list' }, ...reqs.map((r) => h('div', { class: `req ${r.ok ? 'ok' : 'no'}` }, h('span', { text: r.ok ? '✓' : '✗' }), h('span', { class: 'tiny', text: `${r.label}: ${r.have} / ${r.need}` })))),
        d.training ? h('div', { class: 'tiny muted', text: `Requires staff trained in ${TRAINING_BY_ID[d.training]?.name.toLowerCase() ?? d.training}.` }) : null,
        mine ? null : h('button', {
          class: `btn block ${sign.ok ? 'primary' : ''}`, data: { sign: b.id }, disabled: !sign.ok, title: sign.reason ?? '',
          on: {
            click: async () => {
              if (!(await confirmDialog(`Sign with ${b.name}?`, `Franchise fee ${money(d.fee)}. Target: ${salesTarget(b.id, 1)} new cars a month, or the brand grows unhappy.`, 'Sign'))) return;
              ctx.act(signContract(s, b.id, loc.id), { sound: 'success', money: -d.fee });
            },
          },
        }, sign.ok ? `Sign · ${money(d.fee)}` : 'Requirements not met'));
    })) : h('p', { class: 'empty', text: brandFilter === 'ready' ? 'No brand is ready to sign with at this location yet — see what is missing under "All".' : 'Nothing here.' })));
  return { el: view };
}

// -------------------------------------------------------------- Research --

export function researchView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const prog = researchProgress(s);
  const active = s.research.active ? RESEARCH_BY_ID[s.research.active.id] : undefined;
  view.appendChild(pageHead('Research & development', `${prog.done} of ${prog.total} projects complete`, helpButton('research')));
  view.appendChild(panel(panelTitle('In progress'),
    active ? h('div', { class: 'research-active' }, h('span', { class: 'syn-ic', text: active.icon }),
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: active.name }), h('div', { class: 'tiny muted', text: `${s.research.active!.daysLeft} day${s.research.active!.daysLeft === 1 ? '' : 's'} left · ${active.effect}` }),
        progressBar(1 - s.research.active!.daysLeft / active.days, 'good'))) : h('p', { class: 'empty', text: 'Nothing is being researched. Pick a project below.' }),
    s.research.queue.length ? h('div', { class: 'tiny muted', text: `Queued next: ${s.research.queue.map((id) => RESEARCH_BY_ID[id]?.name ?? id).join(' → ')} (starts automatically if you can afford it)` }) : null));

  for (const cat of RESEARCH_CATEGORIES) {
    const items = RESEARCH.filter((r) => r.category === cat);
    if (!items.length) continue;
    view.appendChild(panel(panelTitle(cat, h('span', { class: 'sub', text: `${items.filter((r) => researchState(s, r.id) === 'done').length}/${items.length}` })),
      h('div', { class: 'grid cols-3' }, ...items.map((r) => {
        const st = researchState(s, r.id);
        const queued = s.research.queue.includes(r.id);
        const btn = st === 'available'
          ? (s.research.active
            ? h('button', { class: 'btn small block', data: { queue: r.id }, disabled: queued, on: { click: () => { s.research.queue.push(r.id); ctx.act({ ok: true, message: `${r.name} queued.` }); } } }, queued ? 'Queued' : 'Queue next')
            : h('button', { class: 'btn small primary block', data: { research: r.id }, disabled: s.cash < r.cost, on: { click: async () => { if (r.cost >= s.settings.confirmBigSpend && !(await confirmDialog(`Research ${r.name}?`, `${money(r.cost)}, ${r.days} days. ${r.effect}`, 'Start'))) return; ctx.act(startResearch(s, r.id), { sound: 'buy', money: -r.cost }); } } }, `Start · ${money(r.cost)}`))
          : null;
        return h('article', { class: `card research-card ${st}`, data: { tech: r.id } },
          h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: `${r.icon} ${r.name}` }),
            h('span', { class: `tag ${st === 'done' ? 'good' : st === 'active' ? 'info' : st === 'locked' ? '' : 'accent'}`, text: st === 'done' ? 'Done' : st === 'active' ? 'Running' : st === 'locked' ? 'Locked' : `${r.days} days` })),
          h('p', { class: 'tiny', text: r.effect }),
          st === 'locked' ? h('p', { class: 'tiny warn', text: lockReason(s, r.id) }) : null,
          st !== 'done' ? h('div', { class: 'tiny muted', text: `${money(r.cost)} · ${r.days} days${r.requires.length ? ` · after ${r.requires.map((x) => RESEARCH_BY_ID[x]?.name ?? x).join(', ')}` : ''}` }) : null,
          btn);
      }))));
  }
  return { el: view };
}

// ------------------------------------------------ Missions & decisions --

export function missionsView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const done = missionsDone(s);
  view.appendChild(pageHead('Missions & decisions', `${done} of ${MISSIONS.length} missions complete · ${s.decisions.length} decision${s.decisions.length === 1 ? '' : 's'} waiting`));

  view.appendChild(panel(panelTitle('Decisions', h('span', { class: 'sub', text: 'answer before they expire, or the default happens' })),
    s.decisions.length ? h('div', { class: 'grid cols-2' }, ...s.decisions.map((d) => decisionCard(ctx, d.id))) : h('p', { class: 'empty', text: 'Nothing to decide right now. Offers, incidents and opportunities turn up every few weeks.' })));

  view.appendChild(panel(panelTitle('Active missions', h('span', { class: 'sub', text: 'three at a time; the next unlocks when one completes' })),
    s.missions.active.length ? h('div', { class: 'grid cols-3' }, ...s.missions.active.map((id) => {
      const m = MISSION_BY_ID[id];
      if (!m) return null;
      const p = missionProgress(s, m);
      const val = metricValue(s, m.metric);
      return h('article', { class: 'card mission', data: { mission: id } },
        h('div', { class: 'card-title', text: `${m.icon} ${m.name}` }),
        h('p', { class: 'tiny muted', text: m.description }),
        progressBar(p, p >= 1 ? 'good' : 'info'),
        h('div', { class: 'tiny', text: `${fmtMetric(val, m.target)} / ${fmtMetric(m.target, m.target)}` }),
        h('div', { class: 'tiny good', text: `Reward: ${rewardText(m.reward)}` }));
    })) : h('p', { class: 'empty', text: 'All available missions are done. More unlock at higher company levels.' })));

  const finished = MISSIONS.filter((m) => s.missions.done[m.id]);
  const upcoming = MISSIONS.filter((m) => !s.missions.done[m.id] && !s.missions.active.includes(m.id));
  view.appendChild(panel(panelTitle('Mission log', h('span', { class: 'sub', text: `${finished.length} done · ${upcoming.length} to come` })),
    table(['Mission', 'Goal', 'Reward', 'Status'], [...finished, ...upcoming.slice(0, 12)].map((m) => [
      h('span', { text: `${m.icon} ${m.name}` }),
      h('span', { class: 'tiny', text: m.description }),
      h('span', { class: 'tiny', text: rewardText(m.reward) }),
      s.missions.done[m.id] ? h('span', { class: 'tag good', text: `Day ${s.missions.done[m.id]}` }) : h('span', { class: 'tag', text: m.minLevel > s.companyLevel ? `Level ${m.minLevel}` : 'Later' }),
    ]))));
  return { el: view };
}

function fmtMetric(v: number, target: number): string {
  return target >= 10000 ? moneyShort(v) : String(Math.round(v * 10) / 10);
}

function rewardText(r: { cash?: number; rep?: number; research?: number; relation?: number; note?: string }): string {
  return [r.cash ? money(r.cash) : '', r.rep ? `+${r.rep} reputation` : '', r.research ? 'faster research' : '', r.relation ? 'brand goodwill' : '', r.note ?? ''].filter(Boolean).join(', ') || '—';
}

/** A decision with its options (used on the missions screen and the dealership HUD). */
export function decisionCard(ctx: Ctx, id: string, after?: () => void): HTMLElement {
  const s = ctx.state;
  const d = s.decisions.find((x) => x.id === id);
  const def = d ? DECISION_BY_ID[d.defId] : undefined;
  if (!d || !def) return h('p', { class: 'empty', text: 'Already decided.' });
  return h('article', { class: 'card decision', data: { decision: d.id } },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: `${def.icon} ${def.title}` }), h('span', { class: `tag ${d.expires - s.day <= 0 ? 'bad' : 'warn'}`, text: d.expires - s.day <= 0 ? 'today' : `${d.expires - s.day}d left` })),
    h('p', { class: 'tiny', text: fillText(def.text, d.data) }),
    h('div', { class: 'tiny muted', text: `${locationName(s, d.locationId)} · if you do nothing: ${def.options[def.fallback].label.toLowerCase()}` }),
    h('div', { class: 'decision-opts' }, ...def.options.map((o) => tipped(h('button', {
      class: 'decision-opt', data: { option: o.id },
      on: { click: () => { const r = resolveDecision(s, d.id, o.id); ctx.act(r, { sound: r.ok ? 'success' : undefined }); if (r.ok) play('success'); after?.(); } },
    }, h('span', { class: 'card-title', text: fillText(o.label, d.data) }), h('span', { class: 'tiny muted', text: fillText(o.detail, d.data) })), fillText(o.detail, d.data)))));
}

/** Opens the oldest waiting decision in a dialog. */
export function openDecisions(ctx: Ctx): void {
  const s = ctx.state;
  if (!s.decisions.length) return;
  const { body, close } = modal({ title: 'Decision needed', width: 560, onClose: () => ctx.refresh() });
  const draw = (): void => {
    body.replaceChildren();
    if (!s.decisions.length) { close(); return; }
    for (const d of s.decisions) body.appendChild(decisionCard(ctx, d.id, draw));
  };
  draw();
}

export { empty, kpi };
