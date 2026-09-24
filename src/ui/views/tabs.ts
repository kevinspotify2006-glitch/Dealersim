/**
 * A screen made of tabs (Company, Reports): one route, several existing views.
 */
import type { Ctx, View, ViewFactory } from '../app';
import { h } from '../dom';
import { segmented } from '../kit';

export interface TabDef { id: string; label: string; factory: ViewFactory; badge?: (ctx: Ctx) => number }

export function tabbed(route: string, tabs: TabDef[]): ViewFactory {
  return (ctx: Ctx): View => {
    const current = tabs.find((t) => t.id === ctx.params.tab) ?? tabs[0];
    const inner = current.factory(ctx);
    const bar = h('div', { class: 'tabbar' }, segmented(tabs.map((t) => ({ value: t.id, label: t.label, count: t.badge?.(ctx) || undefined })), current.id, (id) => ctx.go(route, { tab: id }), 'tabbar-seg'));
    const el = h('div', { class: 'view tabbed' }, bar, inner.el);
    return { el, update: inner.update, destroy: inner.destroy };
  };
}
