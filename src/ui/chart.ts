/**
 * Inline SVG charts.
 *
 * No dependency, sharp at any DPI, and drawn in the same palette as everything
 * else — the colours below mirror the tokens in styles/base.css, because a
 * chart that invents its own green is a chart that disagrees with the figure
 * printed next to it.
 *
 * Deliberately quiet: a thin grid, one or two bright lines, and no chartjunk.
 * The data is the only loud thing on the panel.
 */

const NS = 'http://www.w3.org/2000/svg';

/* Tokens, mirrored. A line here that drifts from styles.css is a bug. */
const C = {
  good: '#2fd18b',
  bad: '#ff4d5e',
  accent: '#ff7a1a',
  info: '#3cc7ff',
  tech: '#9b8cff',
  warn: '#ffc233',
  grid: '#1f242a',
  zero: '#3a414b',
  muted: '#6b7480',
};

function svg(width: number, height: number): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('class', 'chart');
  return el;
}

function node(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** Four horizontal rules. Enough to read a height against, quiet enough to ignore. */
function grid(el: SVGSVGElement, width: number, height: number, pad: number): void {
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    el.appendChild(
      node('line', {
        x1: '0', x2: String(width), y1: y.toFixed(1), y2: y.toFixed(1),
        stroke: C.grid, 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke',
      }),
    );
  }
}

export interface Series {
  label: string;
  values: number[];
  color: string;
  /** Fill the area under the line. One series per chart should, at most. */
  fill?: boolean;
}

/** The palette a caller should pick series colours from. */
export const SERIES_COLORS = C;

/**
 * A line chart with a zero baseline.
 *
 * Values above zero are drawn green and below red, because in this game the
 * sign is the whole story and the reader should not have to find the axis to
 * learn it.
 */
export function lineChart(values: number[], options: { height?: number; showZero?: boolean } = {}): SVGSVGElement {
  const width = 600;
  const height = options.height ?? 150;
  const el = svg(width, height);
  if (values.length === 0) {
    const label = node('text', {
      x: String(width / 2), y: String(height / 2),
      fill: C.muted, 'font-size': '13', 'text-anchor': 'middle',
    });
    label.textContent = 'No data yet';
    el.appendChild(label);
    return el;
  }

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 8;
  const usable = height - pad * 2;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const toY = (value: number): number => pad + (1 - (value - min) / span) * usable;

  grid(el, width, height, pad);

  if (options.showZero !== false && min < 0 && max > 0) {
    el.appendChild(
      node('line', {
        x1: '0', x2: String(width),
        y1: String(toY(0)), y2: String(toY(0)),
        stroke: C.zero, 'stroke-width': '1', 'stroke-dasharray': '4 4',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }

  const points = values.map((value, index) => `${(index * stepX).toFixed(1)},${toY(value).toFixed(1)}`);
  const last = values[values.length - 1];
  const stroke = last >= 0 ? C.good : C.bad;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;

  const defs = document.createElementNS(NS, 'defs');
  const gradient = node('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.appendChild(node('stop', { offset: '0%', 'stop-color': stroke, 'stop-opacity': '0.28' }));
  gradient.appendChild(node('stop', { offset: '100%', 'stop-color': stroke, 'stop-opacity': '0' }));
  defs.appendChild(gradient);
  el.appendChild(defs);

  el.appendChild(
    node('polyline', {
      points: `0,${toY(min)} ${points.join(' ')} ${width},${toY(min)}`,
      fill: `url(#${id})`,
      stroke: 'none',
    }),
  );
  el.appendChild(
    node('polyline', {
      points: points.join(' '),
      fill: 'none',
      stroke,
      'stroke-width': '2',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke',
    }),
  );
  return el;
}

/**
 * Several series on one pair of axes, sharing a scale.
 *
 * Used where the comparison is the point — revenue against costs says something
 * neither says alone — and never for series whose units differ, which would be
 * two charts pretending to be one.
 */
export function multiChart(series: Series[], options: { height?: number } = {}): SVGSVGElement {
  const width = 600;
  const height = options.height ?? 180;
  const el = svg(width, height);
  const all = series.flatMap((s) => s.values);
  if (all.length === 0) {
    const label = node('text', {
      x: String(width / 2), y: String(height / 2),
      fill: C.muted, 'font-size': '13', 'text-anchor': 'middle',
    });
    label.textContent = 'No data yet';
    el.appendChild(label);
    return el;
  }

  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const pad = 8;
  const usable = height - pad * 2;
  const toY = (value: number): number => pad + (1 - (value - min) / span) * usable;

  grid(el, width, height, pad);
  if (min < 0 && max > 0) {
    el.appendChild(
      node('line', {
        x1: '0', x2: String(width), y1: String(toY(0)), y2: String(toY(0)),
        stroke: C.zero, 'stroke-width': '1', 'stroke-dasharray': '4 4',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }

  for (const line of series) {
    if (line.values.length === 0) continue;
    const stepX = line.values.length > 1 ? width / (line.values.length - 1) : width;
    const points = line.values.map((value, index) => `${(index * stepX).toFixed(1)},${toY(value).toFixed(1)}`);
    if (line.fill) {
      const id = `f${Math.random().toString(36).slice(2, 8)}`;
      const defs = document.createElementNS(NS, 'defs');
      const gradient = node('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
      gradient.appendChild(node('stop', { offset: '0%', 'stop-color': line.color, 'stop-opacity': '0.24' }));
      gradient.appendChild(node('stop', { offset: '100%', 'stop-color': line.color, 'stop-opacity': '0' }));
      defs.appendChild(gradient);
      el.appendChild(defs);
      el.appendChild(
        node('polyline', {
          points: `0,${toY(min)} ${points.join(' ')} ${width},${toY(min)}`,
          fill: `url(#${id})`, stroke: 'none',
        }),
      );
    }
    el.appendChild(
      node('polyline', {
        points: points.join(' '),
        fill: 'none',
        stroke: line.color,
        'stroke-width': '2',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }
  return el;
}

/** The key for a multi-series chart, in the same colours as the lines. */
export function chartLegend(series: Series[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'chart-legend';
  for (const line of series) {
    const item = document.createElement('span');
    item.className = 'chart-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'chart-legend-swatch';
    swatch.style.background = line.color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(line.label));
    row.appendChild(item);
  }
  return row;
}


/** Vertical bars, one per value, green above zero and red below. */
export function barChart(values: number[], options: { height?: number; color?: string } = {}): SVGSVGElement {
  const width = 600;
  const height = options.height ?? 150;
  const el = svg(width, height);
  if (values.length === 0) {
    const label = node('text', { x: String(width / 2), y: String(height / 2), fill: C.muted, 'font-size': '13', 'text-anchor': 'middle' });
    label.textContent = 'No data yet';
    el.appendChild(label);
    return el;
  }
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 8;
  const usable = height - pad * 2;
  const toY = (v: number): number => pad + (1 - (v - min) / span) * usable;
  grid(el, width, height, pad);
  const slot = width / values.length;
  const bw = Math.max(2, slot * 0.7);
  values.forEach((v, i) => {
    const y0 = toY(0);
    const y1 = toY(v);
    el.appendChild(node('rect', {
      x: (i * slot + (slot - bw) / 2).toFixed(1), y: Math.min(y0, y1).toFixed(1),
      width: bw.toFixed(1), height: Math.max(1, Math.abs(y1 - y0)).toFixed(1),
      fill: options.color ?? (v >= 0 ? C.good : C.bad), rx: '1.5',
    }));
  });
  return el;
}

/** A tiny inline trend line for tables and cards. */
export function sparkline(values: number[], color = C.info, width = 80, height = 22): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('class', 'sparkline');
  if (values.length < 2) return el;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(2 + (1 - (v - min) / span) * (height - 4)).toFixed(1)}`);
  el.appendChild(node('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': '1.6', 'stroke-linejoin': 'round' }));
  return el;
}

/** Horizontal share bars (market share, category mix). */
export function shareBars(rows: { label: string; value: number; highlight?: boolean }[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'share-bars';
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = `share-row${r.highlight ? ' mine' : ''}`;
    const name = document.createElement('span');
    name.className = 'share-name';
    name.textContent = r.label;
    const bar = document.createElement('div');
    bar.className = 'share-bar';
    const fill = document.createElement('div');
    fill.className = 'share-fill';
    fill.style.width = `${((Math.max(0, r.value) / total) * 100).toFixed(1)}%`;
    bar.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'share-val';
    val.textContent = `${((Math.max(0, r.value) / total) * 100).toFixed(0)}%`;
    row.append(name, bar, val);
    wrap.appendChild(row);
  }
  return wrap;
}
