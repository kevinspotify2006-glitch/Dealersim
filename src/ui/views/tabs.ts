/**
 * A section of the game (Inventory, People, Service, Business): one route with
 * a compact bar of tabs (grouped when there are many). On a phone the bar
 * scrolls sideways and you can swipe the page left or right to move between
 * tabs. Each section remembers the tab you were on.
 */
import type { Ctx, View, ViewFactory } from '../app';
import { h } from '../dom';

export interface TabDef { id: string; label: string; icon?: string; group?: string; factory: ViewFactory; badge?: (ctx: Ctx) => number }

const lastTab: Record<string, string> = {};

export function hub(route: string, tabs: TabDef[]): ViewFactory {
  return (ctx: Ctx): View => {
    const wanted = ctx.params.tab ?? lastTab[route];
    const current = tabs.find((t) => t.id === wanted) ?? tabs[0];
    lastTab[route] = current.id;
    const inner = current.factory(ctx);
    const groups = [...new Set(tabs.map((t) => t.group).filter((g): g is string => !!g))];
    const go = (id: string): void => ctx.go(route, { tab: id });
    const chip = (t: TabDef): HTMLElement => {
      const n = t.badge?.(ctx) ?? 0;
      return h('button', { class: `hub-tab${t.id === current.id ? ' active' : ''}`, data: { tab: t.id }, role: 'tab', aria: { selected: String(t.id === current.id) }, on: { click: () => go(t.id) } },
        t.icon ? h('span', { class: 'hub-ic', text: t.icon }) : null, h('span', { text: t.label }), n > 0 ? h('span', { class: 'hub-badge', text: n > 9 ? '9+' : String(n) }) : null);
    };
    const bar = h('div', { class: 'hub-bar' });
    if (groups.length) {
      const group = current.group ?? groups[0];
      bar.appendChild(h('div', { class: 'hub-groups', role: 'tablist' }, ...groups.map((g) => {
        const n = tabs.filter((t) => t.group === g).reduce((s, t) => s + (t.badge?.(ctx) ?? 0), 0);
        return h('button', { class: `hub-group${g === group ? ' active' : ''}`, data: { group: g }, on: { click: () => go(tabs.find((t) => t.group === g)!.id) } }, h('span', { text: g }), n > 0 ? h('span', { class: 'hub-badge', text: String(n) }) : null);
      })));
      bar.appendChild(h('div', { class: 'hub-tabs', role: 'tablist' }, ...tabs.filter((t) => t.group === group).map(chip)));
    } else {
      bar.appendChild(h('div', { class: 'hub-tabs', role: 'tablist' }, ...tabs.map(chip)));
    }
    // Keep the active tab in view on narrow screens.
    requestAnimationFrame(() => bar.querySelectorAll<HTMLElement>('.hub-tab.active, .hub-group.active').forEach((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' })));
    const body = h('div', { class: 'hub-body' }, inner.el);
    // Swipe between tabs (touch only; not while scrolling sideways inside a table or strip).
    let sx = 0;
    let sy = 0;
    let armed = false;
    body.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const inside = (e.target as HTMLElement).closest('.table-wrap, .scroll-x, .hub-bar, .plan-scroll, input, select, textarea, .seg, .pill-row, .mb-brands');
      armed = !inside && e.touches.length === 1;
      sx = t.clientX;
      sy = t.clientY;
    }, { passive: true });
    body.addEventListener('touchend', (e) => {
      if (!armed) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
      const list = current.group ? tabs.filter((x) => x.group === current.group) : tabs;
      const i = list.indexOf(current);
      const next = list[i + (dx < 0 ? 1 : -1)];
      if (next) go(next.id);
    }, { passive: true });
    const el = h('div', { class: 'view hub', data: { hub: route } }, bar, body);
    return { el, update: inner.update, destroy: inner.destroy };
  };
}

/** Old helper name, kept for callers that still use it. */
export const tabbed = hub;
