/**
 * Smart notifications: only what needs you, with the action right there.
 *
 *   🔎 Buyer found a deal        [VIEW] [APPROVE] [DECLINE]
 *   🔧 Planning conflict         [FIX SCHEDULE] [VIEW]
 *   👤 Customer waiting          [ASSIGN EMPLOYEE] [SERVE]
 *   ⚖️ Decision needed           [DECIDE]
 *
 * Everything else goes to the bell quietly (bad news and market events still
 * get a short toast).
 */
import type { Ctx } from './app';
import type { Notice } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';
import { money } from '../sim/format';
import { vehicleName } from '../sim/state';
import { approveProposal, declineProposal } from '../sim/systems/procurement';
import { autoFix } from '../sim/systems/planning';
import { assignSeller } from '../sim/customers';
import { openDecisions } from './views/growth';
import { play } from '../platform/sound';
import { haptic } from '../platform/platform';

const ICONS: Record<string, string> = { proposal: 'search', conflict: 'wrench', waiting: 'customer', decision: 'gavel' };

function host(): HTMLElement {
  let el = document.getElementById('notify-stack');
  if (!el) {
    el = h('div', { id: 'notify-stack', class: 'notify-stack', role: 'status', aria: { live: 'polite' } });
    document.body.appendChild(el);
  }
  return el;
}

/** Shows a notification card for an actionable notice; returns false if it has no card. */
export function smartNotify(ctx: Ctx, n: Notice): boolean {
  if (!n.action) return false;
  // While you are building, nothing pops over the map: it waits in the bell.
  if (document.querySelector('.world.building')) return true;
  const s = ctx.state;
  const a = n.action;
  let title = '';
  let text = n.text.replace(/^\S+\s/, '');
  const buttons: { label: string; primary?: boolean; run: () => void }[] = [];
  const card = h('div', { class: `notify-card ${a.kind}`, data: { notify: a.kind, ref: a.id } });
  const close = (): void => { card.classList.remove('show'); window.setTimeout(() => card.remove(), 220); };
  const act = (r: { ok: boolean; message: string }, sound?: 'buy' | 'success'): void => { ctx.act(r, { sound }); close(); };
  if (a.kind === 'proposal') {
    const p = s.procurement.proposals.find((x) => x.id === a.id);
    if (!p) return false;
    title = 'Buyer found a great deal';
    text = `${vehicleName(p.vehicle)} · ${money(p.price)} · expected margin ${money(p.estMargin)}`;
    buttons.push({ label: 'View', run: () => { ctx.go('inventory', { tab: 'buyers' }); close(); } });
    buttons.push({ label: 'Decline', run: () => act(declineProposal(s, p.id)) });
    buttons.push({ label: 'Approve', primary: true, run: () => act(approveProposal(s, p.id), 'buy') });
  } else if (a.kind === 'conflict') {
    const [locId, day] = a.id.split(':');
    title = 'Service conflict';
    buttons.push({ label: 'View', run: () => { ctx.go('service', { tab: 'planning' }); close(); } });
    buttons.push({ label: 'Fix schedule', primary: true, run: () => act(autoFix(s, locId, Number(day)), 'success') });
  } else if (a.kind === 'waiting') {
    const c = s.customers.find((x) => x.id === a.id);
    if (!c || c.status !== 'waiting') return false;
    title = 'Customer waiting';
    buttons.push({ label: 'Serve', run: () => { close(); ctx.serve(c.id); } });
    buttons.push({ label: 'Assign employee', primary: true, run: () => act(assignSeller(s, c.id), 'success') });
  } else if (a.kind === 'decision') {
    if (!s.decisions.some((d) => d.id === a.id)) return false;
    title = 'Decision needed';
    text = text.replace(/^Decision needed:\s*/, '');
    buttons.push({ label: 'Decide', primary: true, run: () => { close(); openDecisions(ctx); } });
  } else return false;
  card.append(
    h('div', { class: 'nc-title' }, h('span', { class: 'nc-ic' }, icon(ICONS[a.kind] ?? 'bell', 15)), h('span', { class: 'nc-head', text: title }), h('button', { class: 'nc-x', aria: { label: 'Dismiss' }, on: { click: close } }, icon('close', 14))),
    h('div', { class: 'nc-text', text }),
    h('div', { class: 'nc-actions' }, ...buttons.map((b) => h('button', { class: `btn small${b.primary ? ' primary' : ''}`, on: { click: b.run } }, b.label))));
  const stack = host();
  stack.appendChild(card);
  // A phone shows one slim card at a time; the rest waits in the bell.
  while (stack.children.length > (window.innerWidth <= 900 ? 1 : 3)) stack.firstElementChild?.remove();
  requestAnimationFrame(() => card.classList.add('show'));
  play('notify');
  haptic(10);
  // Swipe a card sideways or up to dismiss it.
  let sx = 0; let sy = 0; let swiping = false;
  card.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button')) return; swiping = true; sx = e.clientX; sy = e.clientY; });
  card.addEventListener('pointerup', (e) => {
    if (!swiping) return;
    swiping = false;
    if (Math.abs(e.clientX - sx) > 60 || sy - e.clientY > 30) close();
  });
  // Cards stay a while (longer than toasts) but not forever; hovering keeps them.
  let hovering = false;
  card.addEventListener('pointerenter', () => { hovering = true; });
  card.addEventListener('pointerleave', () => { hovering = false; });
  const expire = (): void => { if (hovering) { window.setTimeout(expire, 2000); return; } close(); };
  window.setTimeout(expire, 9000);
  return true;
}
