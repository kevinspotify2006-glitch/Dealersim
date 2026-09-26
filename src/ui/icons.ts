/**
 * The icon set.
 *
 * One family, drawn on the same 24-unit grid at the same 1.75 stroke, inheriting
 * `currentColor` so an icon is tinted by whatever it sits in rather than by a
 * copy of the palette. That is the whole reason these replaced the emoji the
 * interface used to navigate by: an emoji is a different picture on every
 * platform, it cannot take a colour, and a row of them never lines up.
 *
 * Every path here is drawn for these games. Adding one is cheap; reaching for a
 * second icon family is not, so don't.
 */

const P: Record<string, string> = {
  // ---- navigation (shared with Business Manager's icon family)
  dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 15h7v6H3z',
  people: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 6.5a3 3 0 0 1 0 6M18 20a6.5 6.5 0 0 0-2-4.7',
  finance: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 2.8 5 3.4 5 1.5 5 3.6-2.2 3-5 3-5-1.1-5-3',
  marketing: 'M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6M20 6.5a8 8 0 0 1 0 11',
  progress: 'M7 21h10M12 17v4M6 4h12v5a6 6 0 0 1-12 0zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',

  // ---- figures and status
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5.5 7v10M18.5 7v10',
  revenue: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  profit: 'M4 19h16M7 19v-6M12 19V7M17 19v-9',
  worth: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  level: 'M12 3l2.6 5.6 6 .8-4.4 4.3 1.1 6.2L12 17l-5.3 2.9 1.1-6.2L3.4 9.4l6-.8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  alert: 'M12 3l9 16H3zM12 9v5M12 17.5v.01',
  warning: 'M12 3l9 16H3zM12 9v5M12 17.5v.01',
  critical: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.5v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.01',
  good: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.2l2.4 2.4 4.6-4.8',
  opportunity: 'M12 2.5a6 6 0 0 0-3.5 10.9V16h7v-2.6A6 6 0 0 0 12 2.5zM9.5 19h5M10.5 21.5h3',

  // ---- actions and chrome
  hammer: 'M14.5 4.5l5 5-2.5 2.5-5-5zM12 7l-8.5 8.5a2 2 0 0 0 0 2.8l.2.2a2 2 0 0 0 2.8 0L15 10M14 3l2-1 3 3',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  report: 'M5 3h10l4 4v14H5zM15 3v4h4M8 17v-3M12 17v-6M16 17v-4',
  door: 'M5 21V3h11v18M16 21h3M3 21h2M12.5 12v.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  locate: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v3M12 19v3M2 12h3M19 12h3M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a1.8 1.8 0 0 0 3 0',
  plus: 'M12 5v14M5 12h14',
  // A trowel and a rule: building, rather than adding a row to a table.
  chevron: 'M9 5l7 7-7 7',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  download: 'M12 3v12M7.5 10.5L12 15l4.5-4.5M4 19h16',
  // ---- automotive (Car Dealership Manager Tycoon)
  car: 'M3 13l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5v4a1 1 0 0 1-1 1h-1.5M5.5 18H4a1 1 0 0 1-1-1v-4h18M7.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM9.5 18h5',
  key: 'M14.5 3.5a6 6 0 1 1-4.9 9.4L3 19.5V21h3.5v-2h2v-2h2l.9-.9A6 6 0 0 1 14.5 3.5zM16 8h.01',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  gauge: 'M4.5 18a9 9 0 1 1 15 0M12 13l4-5M12 13h.01',
  garage: 'M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 16h10',
  handshake: 'M2 11l4-4 4 2 3-2 4 1 5 3M6 7v6l5 5 2-1 2 1 3-3M9 13l3 3M11 11l3 3',
  store: 'M3 9l2-5h14l2 5M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5',
  next: 'M5 5l8 7-8 7zM16 5v14',
  play: 'M7 4.5l12 7.5-12 7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  upgrade: 'M12 3l7 7h-4v8H9v-8H5zM5 21h14',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  back: 'M15 5l-7 7 7 7',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  customer: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21v-1a7 7 0 0 1 14 0v1M17 4.5l2-1.5M19 8h2',
  gavel: 'M13 4l7 7M11 6l7 7M9.5 7.5l7 7M14 9l-9 9a1.5 1.5 0 0 0 2 2l9-9M3 21h8',
  trophy: 'M7 21h10M12 17v4M6 4h12v5a6 6 0 0 1-12 0zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3',
  upload: 'M12 21V9M7.5 13.5L12 9l4.5 4.5M4 5h16',
  check: 'M5 12.5l4.5 4.5L19 7',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',

  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',

  // ---- build categories
  brick: 'M3 5h18v14H3zM3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  plant: 'M12 21v-9M12 12c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5zM8 21h8',
  tree: 'M12 22v-6M12 2l6 8h-3l4 6H5l4-6H6z',
  parking: 'M4 3h16v18H4zM9.5 17V7h3.5a3 3 0 0 1 0 6H9.5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  screen: 'M3 4h18v12H3zM8 21h8M12 16v5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 6 3-6M12 21L9 9M12 21l3-12',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-1.3-1-1.8-1-3 0-1 .8-2 2-2h2.5A3.5 3.5 0 0 0 21 10.5C21 6.4 17 3 12 3zM7.5 12.5v.01M9 8v.01M13.5 7v.01M17 10v.01',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11M12 15v2',
  expand: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
  flow: 'M4 5h10a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 0 0 7h12M17 16l3 3-3 3',
};

/** An icon, sized by the box it sits in and coloured by what it sits in. */
/** Every icon the game draws, so a screen asking for one that does not exist
    can be caught rather than quietly getting the fallback. */
export const ICON_NAMES = Object.keys(P);

export function icon(name: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', P[name] ?? P.info);
  svg.appendChild(path);
  return svg;
}
