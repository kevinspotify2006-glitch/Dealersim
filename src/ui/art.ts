/**
 * Vehicle and dealership illustrations, drawn as inline SVG so they are sharp on
 * a 3.5× phone screen, tinted with the car's real paint colour, and need no
 * image files (the Android build works offline).
 */
import type { BodyType, GameState, Location, Vehicle } from '../sim/types';
import { capacityOf, upgradeLevel } from '../sim/state';

const NS = 'http://www.w3.org/2000/svg';

interface Shape { body: string; glass: string; wheels: [number, number]; roofLine?: string }

const SHAPES: Partial<Record<BodyType, Shape>> = {
  Hatchback: {
    body: 'M18 60 L19 45 Q22 37 40 35 L62 22 Q70 18 84 18 L126 18 Q137 18 145 27 L158 39 L176 43 Q186 45 186 54 L186 60 Z',
    glass: 'M66 34 L78 23 Q82 21 90 21 L104 21 L104 34 Z M108 21 L124 21 Q133 21 139 28 L147 34 L108 34 Z',
    wheels: [50, 150],
  },
  Sedan: {
    body: 'M12 60 L14 46 Q18 38 38 36 L64 22 Q72 18 86 18 L120 18 Q131 18 139 26 L153 36 L178 38 Q189 40 189 50 L189 60 Z',
    glass: 'M68 34 L80 23 Q84 21 92 21 L106 21 L106 34 Z M110 21 L120 21 Q129 21 135 27 L143 34 L110 34 Z',
    wheels: [48, 156],
  },
  Wagon: {
    body: 'M12 60 L14 46 Q18 38 38 36 L62 22 Q70 18 84 18 L168 18 Q177 18 181 27 L187 42 L189 60 Z',
    glass: 'M66 34 L78 23 Q82 21 90 21 L104 21 L104 34 Z M108 21 L140 21 L140 34 L108 34 Z M144 21 L168 21 Q174 21 177 28 L180 34 L144 34 Z',
    wheels: [48, 156],
  },
  SUV: {
    body: 'M12 62 L12 42 Q14 34 32 32 L54 16 Q60 12 72 12 L160 12 Q170 12 175 20 L184 34 Q189 38 189 48 L189 62 Z',
    glass: 'M58 30 L70 17 Q74 15 82 15 L104 15 L104 30 Z M108 15 L138 15 L138 30 L108 30 Z M142 15 L160 15 Q167 15 171 22 L175 30 L142 30 Z',
    wheels: [48, 154],
  },
  Coupe: {
    body: 'M10 60 L12 49 Q16 41 40 38 L72 24 Q80 20 96 20 L118 20 Q131 22 146 32 L178 40 Q190 42 190 52 L190 60 Z',
    glass: 'M76 36 L90 25 Q94 23 100 23 L112 23 L112 36 Z M116 23 L118 23 Q128 24 138 32 L142 36 L116 36 Z',
    wheels: [46, 156],
  },
  Convertible: {
    body: 'M12 60 L14 47 Q18 40 44 38 L150 38 L182 42 Q190 44 190 52 L190 60 Z',
    glass: 'M72 38 L84 25 L88 25 L78 38 Z',
    wheels: [48, 156],
    roofLine: 'M96 38 Q104 30 116 30 Q124 30 128 38',
  },
  Roadster: {
    body: 'M16 60 L18 48 Q22 41 46 39 L146 39 L178 43 Q188 45 188 53 L188 60 Z',
    glass: 'M76 39 L88 27 L92 27 L82 39 Z',
    wheels: [50, 154],
    roofLine: 'M100 39 Q106 33 116 33 Q122 33 125 39',
  },
  Van: {
    body: 'M12 62 L12 22 Q12 12 24 12 L148 12 Q158 12 165 20 L182 36 Q188 40 188 50 L188 62 Z',
    glass: 'M140 16 L150 16 Q156 16 161 22 L172 34 L140 34 Z M112 16 L136 16 L136 34 L112 34 Z',
    wheels: [44, 156],
  },
  Offroader: {
    body: 'M10 62 L10 34 Q10 30 16 28 L40 26 L52 10 Q54 8 60 8 L160 8 Q168 8 170 14 L174 26 L184 30 Q190 32 190 42 L190 62 Z M190 36 L196 36 L196 50 L190 50 Z',
    glass: 'M56 24 L64 12 L100 12 L100 24 Z M104 12 L134 12 L134 24 L104 24 Z M138 12 L160 12 Q164 12 166 16 L168 24 L138 24 Z',
    wheels: [46, 154],
  },
  Pickup: {
    body: 'M10 62 L10 38 L98 38 L98 14 Q98 10 104 10 L140 10 Q148 10 152 18 L162 34 L182 38 Q190 40 190 50 L190 62 Z',
    glass: 'M104 14 L122 14 L122 32 L104 32 Z M126 14 L140 14 Q145 14 148 20 L154 32 L126 32 Z',
    wheels: [44, 158],
  },
};

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

let gradCounter = 0;

/** A side-profile illustration of a vehicle in its own paint colour. */
export function carArt(v: Pick<Vehicle, 'body' | 'colorHex' | 'category'> & { presentation?: number }, width = 200): SVGSVGElement {
  const shape = (v.body === 'Crossover' ? SHAPES.SUV : SHAPES[v.body]) ?? SHAPES.Sedan!;
  const svg = el('svg', { viewBox: '0 0 200 80', width, height: Math.round(width * 0.4), class: 'car-art', 'aria-hidden': 'true' }) as SVGSVGElement;
  const id = `cg${(gradCounter += 1)}`;
  const defs = el('defs', {});
  const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': shade(v.colorHex, 38) }));
  grad.appendChild(el('stop', { offset: '55%', 'stop-color': v.colorHex }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': shade(v.colorHex, -34) }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(el('ellipse', { cx: 100, cy: 72, rx: 90, ry: 5, fill: 'rgba(0,0,0,0.45)' }));
  svg.appendChild(el('path', { d: shape.body, fill: `url(#${id})`, stroke: shade(v.colorHex, -55), 'stroke-width': 1.2 }));
  svg.appendChild(el('path', { d: shape.glass, fill: '#1b2530', stroke: '#0d1218', 'stroke-width': 0.8, opacity: 0.95 }));
  if (shape.roofLine) svg.appendChild(el('path', { d: shape.roofLine, fill: 'none', stroke: '#2a2f36', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  // Belt-line highlight, lights and handle.
  svg.appendChild(el('path', { d: 'M24 47 L182 47', stroke: shade(v.colorHex, 60), 'stroke-width': 0.8, opacity: 0.45 }));
  svg.appendChild(el('rect', { x: 180, y: 44, width: 8, height: 4, rx: 1.5, fill: '#ffe8a8' }));
  svg.appendChild(el('rect', { x: 11, y: 45, width: 6, height: 4, rx: 1.5, fill: '#ff3b3b' }));
  const classic = v.category === 'Classic' || v.category === 'Rare';
  if (classic) {
    svg.appendChild(el('rect', { x: 176, y: 54, width: 14, height: 3, rx: 1.5, fill: '#d9dde2' }));
    svg.appendChild(el('rect', { x: 9, y: 54, width: 14, height: 3, rx: 1.5, fill: '#d9dde2' }));
  }
  for (const cx of shape.wheels) {
    svg.appendChild(el('circle', { cx, cy: 61, r: 13, fill: '#0c0d0f' }));
    svg.appendChild(el('circle', { cx, cy: 61, r: 7.5, fill: classic ? '#cfd4da' : '#8d949c' }));
    svg.appendChild(el('circle', { cx, cy: 61, r: 2.4, fill: '#3a3f46' }));
  }
  // Dust on a dirty car.
  if (v.presentation !== undefined && v.presentation < 40) {
    svg.appendChild(el('path', { d: shape.body, fill: '#6b5a44', opacity: ((40 - v.presentation) / 40 * 0.35).toFixed(2) }));
  }
  return svg;
}

/** A tiny top-down car for the lot map. */
function topCar(x: number, y: number, color: string, highlight: boolean): SVGElement {
  const g = el('g', { transform: `translate(${x} ${y})` });
  g.appendChild(el('rect', { x: -9, y: -16, width: 18, height: 32, rx: 5, fill: color, stroke: highlight ? '#ff9a4d' : 'rgba(0,0,0,0.5)', 'stroke-width': highlight ? 2 : 1 }));
  g.appendChild(el('rect', { x: -7, y: -9, width: 14, height: 7, rx: 2, fill: '#1b2530' }));
  g.appendChild(el('rect', { x: -7, y: 5, width: 14, height: 5, rx: 2, fill: '#1b2530' }));
  return g;
}

/**
 * The dealership, drawn from its upgrades: the showroom grows, the workshop
 * appears, the lot fills with the stock you actually own.
 */
export function lotScene(state: GameState, loc: Location): SVGSVGElement {
  const W = 800;
  const H = 360;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lot-scene', role: 'img', 'aria-label': `${loc.name} dealership` }) as SVGSVGElement;
  const defs = el('defs', {});
  const sky = el('linearGradient', { id: 'lotsky', x1: 0, y1: 0, x2: 0, y2: 1 });
  sky.appendChild(el('stop', { offset: '0%', 'stop-color': '#10141b' }));
  sky.appendChild(el('stop', { offset: '100%', 'stop-color': '#1b2029' }));
  defs.appendChild(sky);
  const glass = el('linearGradient', { id: 'lotglass', x1: 0, y1: 0, x2: 0, y2: 1 });
  glass.appendChild(el('stop', { offset: '0%', 'stop-color': '#ffcf9a', 'stop-opacity': 0.55 }));
  glass.appendChild(el('stop', { offset: '100%', 'stop-color': '#ff8a3a', 'stop-opacity': 0.22 }));
  defs.appendChild(glass);
  svg.appendChild(defs);
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#lotsky)' }));
  // Ground and road.
  svg.appendChild(el('rect', { x: 0, y: 150, width: W, height: 210, fill: '#23272d' }));
  svg.appendChild(el('rect', { x: 0, y: 322, width: W, height: 38, fill: '#15181c' }));
  for (let x = 20; x < W; x += 70) svg.appendChild(el('rect', { x, y: 339, width: 36, height: 4, fill: '#5b5f66' }));

  const showroom = upgradeLevel(loc, 'showroom');
  const workshop = upgradeLevel(loc, 'workshop');
  const detailing = upgradeLevel(loc, 'detailing');
  const lounge = upgradeLevel(loc, 'lounge');
  const office = upgradeLevel(loc, 'office');
  const marketing = upgradeLevel(loc, 'marketing');

  // Office / portacabin → glass showroom.
  const bw = 180 + showroom * 50;
  const bh = 70 + showroom * 10;
  const bx = 24;
  const by = 150 - bh;
  svg.appendChild(el('rect', { x: bx, y: by, width: bw, height: bh, rx: showroom > 2 ? 4 : 2, fill: showroom === 0 ? '#3b3f46' : '#2b3038', stroke: '#444a53' }));
  if (showroom > 0) {
    svg.appendChild(el('rect', { x: bx + 10, y: by + 18, width: bw - 20, height: bh - 26, fill: 'url(#lotglass)' }));
    for (let x = bx + 10 + 40; x < bx + bw - 10; x += 40) svg.appendChild(el('rect', { x, y: by + 18, width: 2, height: bh - 26, fill: '#2b3038' }));
  } else {
    svg.appendChild(el('rect', { x: bx + 14, y: by + 20, width: 40, height: 26, fill: '#ffcf9a', opacity: 0.45 }));
    svg.appendChild(el('rect', { x: bx + 70, y: by + 26, width: 26, height: bh - 26, fill: '#2a2d32' }));
  }
  // Sign.
  const signW = Math.min(bw - 20, 60 + state.companyName.length * 8);
  svg.appendChild(el('rect', { x: bx + 10, y: by - 22, width: signW, height: 20, rx: 3, fill: '#ff7a1a' }));
  const t = el('text', { x: bx + 18, y: by - 8, fill: '#140800', 'font-size': 13, 'font-weight': 700, 'font-family': 'Bahnschrift, Roboto Condensed, Arial Narrow, sans-serif', 'letter-spacing': 1 });
  t.textContent = state.companyName.toUpperCase().slice(0, 26);
  svg.appendChild(t);

  // Workshop and detailing bays.
  let rx = bx + bw + 16;
  if (workshop > 0) {
    const ww = 90 + workshop * 16;
    svg.appendChild(el('rect', { x: rx, y: 70, width: ww, height: 80, fill: '#30343b', stroke: '#444a53' }));
    for (let i = 0; i < Math.min(3, workshop); i += 1) {
      svg.appendChild(el('rect', { x: rx + 10 + i * 34, y: 94, width: 28, height: 56, fill: '#1c1f24' }));
      for (let y = 98; y < 148; y += 6) svg.appendChild(el('rect', { x: rx + 12 + i * 34, y, width: 24, height: 2, fill: '#3d424a' }));
    }
    const wt = el('text', { x: rx + 8, y: 86, fill: '#a3abb6', 'font-size': 10, 'font-family': 'sans-serif' });
    wt.textContent = 'WORKSHOP';
    svg.appendChild(wt);
    rx += ww + 12;
  }
  if (detailing > 0) {
    svg.appendChild(el('rect', { x: rx, y: 96, width: 80, height: 54, fill: '#2d3a44', stroke: '#444a53' }));
    svg.appendChild(el('rect', { x: rx + 8, y: 110, width: 64, height: 40, fill: '#3cc7ff', opacity: 0.18 }));
    const dt = el('text', { x: rx + 8, y: 107, fill: '#a3abb6', 'font-size': 9, 'font-family': 'sans-serif' });
    dt.textContent = 'DETAILING';
    svg.appendChild(dt);
    rx += 92;
  }
  if (lounge > 0 || office > 1) {
    svg.appendChild(el('rect', { x: rx, y: 104, width: 64, height: 46, fill: '#34383f', stroke: '#444a53' }));
    for (let i = 0; i < 3; i += 1) svg.appendChild(el('rect', { x: rx + 8 + i * 18, y: 114, width: 12, height: 10, fill: '#ffcf9a', opacity: 0.5 }));
    rx += 76;
  }
  if (marketing > 0 && rx < W - 60) {
    svg.appendChild(el('rect', { x: W - 70, y: 40, width: 4, height: 110, fill: '#5b5f66' }));
    svg.appendChild(el('rect', { x: W - 100, y: 30, width: 64, height: 36, rx: 3, fill: '#ff7a1a', opacity: 0.9 }));
    const mt = el('text', { x: W - 92, y: 53, fill: '#140800', 'font-size': 12, 'font-weight': 700, 'font-family': 'sans-serif' });
    mt.textContent = 'DEALS';
    svg.appendChild(mt);
  }
  // Bunting for bigger lots.
  if (upgradeLevel(loc, 'parking') >= 2) {
    const colors = ['#ff7a1a', '#ffc233', '#3cc7ff', '#2fd18b'];
    for (let x = 250, i = 0; x < W - 20; x += 22, i += 1) {
      svg.appendChild(el('path', { d: `M${x} 160 L${x + 11} 160 L${x + 5.5} 170 Z`, fill: colors[i % colors.length] }));
    }
    svg.appendChild(el('path', { d: `M250 160 L${W - 20} 160`, stroke: '#5b5f66', 'stroke-width': 1 }));
  }

  // Parking grid with the real stock.
  const cap = capacityOf(loc);
  const here = state.vehicles.filter((v) => v.locationId === loc.id && v.status !== 'transfer' && v.status !== 'transit');
  const cols = cap <= 10 ? cap : Math.min(20, Math.max(10, Math.ceil(cap / 3)));
  const rows = Math.ceil(cap / cols);
  const cellW = Math.min(cap <= 10 ? 62 : 38, (W - 60) / cols);
  const cellH = Math.min(cap <= 10 ? 76 : 44, 140 / Math.max(1, rows));
  const gx = (W - cols * cellW) / 2;
  const gy = 176;
  for (let i = 0; i < cap; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gx + c * cellW;
    const y = gy + r * cellH;
    svg.appendChild(el('rect', { x: x + 1, y: y + 1, width: cellW - 2, height: cellH - 2, fill: 'none', stroke: '#454a52', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    const v = here[i];
    if (v) {
      const scale = Math.min(1.8, (cellH - 6) / 32, (cellW - 6) / 18);
      const g = topCar(x + cellW / 2, y + cellH / 2, v.colorHex, v.status === 'listed');
      g.setAttribute('transform', `translate(${x + cellW / 2} ${y + cellH / 2}) scale(${scale.toFixed(2)})`);
      const title = el('title', {});
      title.textContent = `${v.year} ${v.brand} ${v.model} — ${v.status}`;
      g.appendChild(title);
      svg.appendChild(g);
    }
  }
  // Trees.
  for (const tx of [W - 30, 10]) {
    svg.appendChild(el('rect', { x: tx + 8, y: 120, width: 4, height: 30, fill: '#4a3a2a' }));
    svg.appendChild(el('circle', { cx: tx + 10, cy: 112, r: 16, fill: '#1f3b2c' }));
  }
  return svg;
}
