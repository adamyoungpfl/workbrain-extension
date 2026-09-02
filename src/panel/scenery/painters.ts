/**
 * V2.9 — THE SCENERY PAINTERS, shared (Adam, 2026-09-01).
 *
 * Drawn for the splash's mosaic (SplashStage) and reused, faint and still,
 * as the app's own canvas texture (WallPanels) — "so there is a continuity
 * to the app": dark surfaces wear the bold sketch, light surfaces a whisper
 * of the same one. Moved here from SplashStage.tsx the day the wall needed
 * them; nothing about the drawings changed in the move.
 *
 * ── PENCIL, NOT PAINT (the sketch pass) ───────────────────────────────────
 * "Make them all black and white, like a bold pencil sketch… this relies
 * only on the changing of images and not on the changing of color to
 * suggest motion or build." So the palette work still happens — the same
 * eight hues keep neighbouring panels from being the same picture — and
 * then the whole drawing is taken to grayscale with the contrast pushed,
 * which is what "bold sketch" is in pixels. The hues become distinct GRAYS,
 * so the variety survives the desaturation.
 */

/** Big enough to stay crisp: a jittered panel runs to ~180px and the canvas
 *  paints at up to 2x, so a 140px texture — the old photo size — would be
 *  visibly soft scaled up. These are flat shapes, so the cost is nothing. */
const TEXTURE_SIZE = 256;
const T = TEXTURE_SIZE;

/** The scenery palette, read off the running stylesheet once per mount, so
 *  tokens.css stays the one source of colour even for scenery. */
interface Pop {
  hue: string[];
  paper: string;
  ink: string;
  shade: string;
  /** The single light shade the wall opens in. */
  tone: string;
}

function readPop(): Pop {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || 'transparent';
  return {
    hue: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => token(`--pop-${n}`)),
    paper: token('--pop-paper'),
    ink: token('--pop-ink'),
    shade: token('--pop-shade'),
    tone: token('--pop-tone'),
  };
}

type Painter = (g: CanvasRenderingContext2D, p: Pop, hue: (n: number) => string) => void;

/** A rounded rect, since every panel below wants one and the 2D context's own
 *  `roundRect` is not in every runtime the tests spin up. */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10) {
  const rad = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
  g.fill();
}

const ground = (g: CanvasRenderingContext2D, fill: string) => {
  g.fillStyle = fill;
  g.fillRect(0, 0, T, T);
};

/** Bars. The single most recognisable shape in any working life. */
const bars: Painter = (g, p, hue) => {
  ground(g, hue(0));
  const heights = [0.42, 0.68, 0.34, 0.86, 0.56];
  heights.forEach((h, i) => {
    g.fillStyle = i % 2 ? p.paper : hue(3);
    box(g, 26 + i * 42, T - 28 - h * 168, 30, h * 168, 8);
  });
};

/** A line and the area under it. */
const trend: Painter = (g, p, hue) => {
  ground(g, hue(0));
  const pts = [24, 150, 66, 108, 108, 132, 150, 70, 192, 96, 232, 44];
  g.beginPath();
  g.moveTo(pts[0]!, T);
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.lineTo(pts[pts.length - 2]!, T);
  g.closePath();
  g.fillStyle = hue(2);
  g.fill();
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i]!, pts[i + 1]!);
  g.strokeStyle = p.paper;
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.stroke();
};

/** A ring, filled most of the way round. */
const ring: Painter = (g, p, hue) => {
  ground(g, hue(0));
  g.lineWidth = 34;
  g.strokeStyle = hue(4);
  g.beginPath();
  g.arc(T / 2, T / 2, 74, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = p.paper;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(T / 2, T / 2, 74, -1.6, 2.1);
  g.stroke();
  g.lineCap = 'butt';
};

/** A month. Some days are busy. */
const calendar: Painter = (g, p, hue) => {
  ground(g, p.paper);
  g.fillStyle = hue(0);
  g.fillRect(0, 0, T, 54);
  const busy = new Set([1, 4, 7, 8, 12, 17, 18, 22]);
  for (let i = 0; i < 24; i += 1) {
    g.fillStyle = busy.has(i) ? hue(2) : hue(5);
    g.globalAlpha = busy.has(i) ? 1 : 0.18;
    box(g, 22 + (i % 6) * 36, 76 + Math.floor(i / 6) * 42, 26, 26, 7);
  }
  g.globalAlpha = 1;
};

/** A thread. Somebody said something and somebody answered. */
const thread: Painter = (g, p, hue) => {
  ground(g, hue(0));
  const rows: [number, number, number][] = [
    [22, 34, 150],
    [84, 96, 130],
    [22, 158, 176],
    [110, 214, 124],
  ];
  rows.forEach(([x, y, w], i) => {
    g.fillStyle = i % 2 ? p.paper : hue(3);
    box(g, x, y, w, 44, 16);
  });
};

/** Three columns of cards. */
const board: Painter = (g, p, hue) => {
  ground(g, p.shade);
  const counts = [3, 1, 2];
  counts.forEach((n, c) => {
    g.fillStyle = hue(1);
    g.globalAlpha = 0.16;
    box(g, 14 + c * 80, 20, 68, 216, 12);
    g.globalAlpha = 1;
    for (let i = 0; i < n; i += 1) {
      g.fillStyle = i === 0 ? hue(c + 2) : p.paper;
      box(g, 22 + c * 80, 32 + i * 58, 52, 46, 10);
    }
  });
};

/** A wall of pictures, which is what a gallery is at this distance. */
const gallery: Painter = (g, _p, hue) => {
  ground(g, hue(0));
  for (let i = 0; i < 9; i += 1) {
    g.fillStyle = hue(i + 1);
    box(g, 16 + (i % 3) * 78, 16 + Math.floor(i / 3) * 78, 68, 68, 12);
  }
};

/** A page with something written on it. */
const page: Painter = (g, p, hue) => {
  ground(g, hue(0));
  g.fillStyle = p.paper;
  box(g, 30, 22, 196, 212, 12);
  g.fillStyle = hue(3);
  box(g, 50, 46, 104, 22, 6);
  g.fillStyle = p.ink;
  g.globalAlpha = 0.16;
  [156, 176, 152, 170, 96].forEach((w, i) => box(g, 50, 88 + i * 26, w, 12, 5));
  g.globalAlpha = 1;
};

/** Things done, and one still to do. */
const checklist: Painter = (g, p, hue) => {
  ground(g, hue(0));
  for (let i = 0; i < 4; i += 1) {
    const done = i < 3;
    g.fillStyle = done ? hue(3) : p.paper;
    box(g, 26, 34 + i * 56, 40, 40, 12);
    if (done) {
      g.strokeStyle = p.paper;
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(36, 54 + i * 56);
      g.lineTo(44, 62 + i * 56);
      g.lineTo(58, 44 + i * 56);
      g.stroke();
      g.lineCap = 'butt';
    }
    g.fillStyle = p.paper;
    g.globalAlpha = done ? 0.4 : 0.9;
    box(g, 80, 46 + i * 56, done ? 108 : 146, 16, 8);
    g.globalAlpha = 1;
  }
};

/** Rows and columns, one row picked out. */
const sheet: Painter = (g, p, hue) => {
  ground(g, p.paper);
  g.fillStyle = hue(4);
  g.fillRect(0, 0, T, 40);
  g.fillStyle = hue(1);
  g.globalAlpha = 0.22;
  g.fillRect(0, 124, T, 34);
  g.globalAlpha = 1;
  g.strokeStyle = hue(5);
  g.globalAlpha = 0.34;
  g.lineWidth = 2;
  for (let y = 40; y < T; y += 34) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(T, y);
    g.stroke();
  }
  for (let x = 64; x < T; x += 64) {
    g.beginPath();
    g.moveTo(x, 40);
    g.lineTo(x, T);
    g.stroke();
  }
  g.globalAlpha = 1;
};

/** A list of people who want something. */
const inbox: Painter = (g, p, hue) => {
  ground(g, p.paper);
  for (let i = 0; i < 4; i += 1) {
    g.fillStyle = hue(i + 1);
    g.beginPath();
    g.arc(46, 46 + i * 60, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.ink;
    g.globalAlpha = 0.8;
    box(g, 82, 32 + i * 60, 120 - i * 12, 13, 6);
    g.globalAlpha = 0.2;
    box(g, 82, 54 + i * 60, 148, 11, 5);
    g.globalAlpha = 1;
  }
};

/** Sound, as everybody draws it. */
const levels: Painter = (g, _p, hue) => {
  ground(g, hue(0));
  const hs = [0.3, 0.62, 0.94, 0.5, 0.76, 0.36, 0.86, 0.44, 0.66];
  hs.forEach((h, i) => {
    g.fillStyle = hue(i + 1);
    const bh = h * 168;
    box(g, 20 + i * 25, (T - bh) / 2, 15, bh, 7);
  });
};

/** A clip on a timeline. */
const timeline: Painter = (g, p, hue) => {
  ground(g, p.shade);
  for (let i = 0; i < 5; i += 1) {
    g.fillStyle = hue(i + 1);
    box(g, 14 + i * 47, 60, 40, 80, 8);
  }
  g.fillStyle = hue(0);
  box(g, 14, 168, 228, 12, 6);
  g.fillStyle = p.paper;
  box(g, 132, 156, 10, 36, 5);
};

/** Somewhere, and a pin in it. */
const map: Painter = (g, p, hue) => {
  ground(g, hue(4));
  g.strokeStyle = p.paper;
  g.globalAlpha = 0.5;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(-10, 90);
  g.lineTo(96, 90);
  g.lineTo(150, 190);
  g.lineTo(266, 190);
  g.stroke();
  g.beginPath();
  g.moveTo(186, -10);
  g.lineTo(186, 190);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = hue(0);
  g.beginPath();
  g.arc(96, 90, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.paper;
  g.beginPath();
  g.arc(96, 90, 12, 0, Math.PI * 2);
  g.fill();
};

/** One big idea and a line under it. */
const slide: Painter = (g, p, hue) => {
  ground(g, hue(0));
  g.fillStyle = hue(3);
  g.beginPath();
  g.arc(T / 2, 104, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.paper;
  box(g, 52, 190, 152, 18, 9);
  g.globalAlpha = 0.45;
  box(g, 82, 220, 92, 12, 6);
  g.globalAlpha = 1;
};

/** Two dials and a number, which is every dashboard ever drawn. */
const dials: Painter = (g, p, hue) => {
  ground(g, p.shade);
  [[76, 84], [180, 84]].forEach(([x, y], i) => {
    g.lineWidth = 20;
    g.strokeStyle = hue(i + 4);
    g.globalAlpha = 0.28;
    g.beginPath();
    g.arc(x!, y!, 46, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = hue(i + 1);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x!, y!, 46, -1.57, i ? 1.2 : 2.6);
    g.stroke();
    g.lineCap = 'butt';
  });
  g.fillStyle = hue(2);
  box(g, 40, 176, 176, 52, 14);
  g.fillStyle = p.shade;
  g.globalAlpha = 0.5;
  box(g, 62, 194, 132, 16, 8);
  g.globalAlpha = 1;
};

/** A window with a form in it. */
const form: Painter = (g, p, hue) => {
  ground(g, hue(0));
  g.fillStyle = p.paper;
  box(g, 26, 40, 204, 176, 16);
  [0, 1, 2].forEach((i) => {
    g.fillStyle = hue(5);
    g.globalAlpha = 0.16;
    box(g, 48, 64 + i * 46, 160, 32, 9);
    g.globalAlpha = 1;
  });
  g.fillStyle = hue(3);
  box(g, 48, 176, 84, 26, 13);
};

/** The set. Sixteen, and the order matters only in that neighbours in the
 *  image list should not look alike — the mosaic walks them one at a time. */
const PAINTERS: Painter[] = [
  bars,
  calendar,
  thread,
  gallery,
  trend,
  board,
  checklist,
  ring,
  sheet,
  levels,
  inbox,
  map,
  page,
  timeline,
  slide,
  dials,
  form,
];

/**
 * Each panel gets its own rotation through the palette, so the same painter
 * drawn at two places on the wall is not the same picture. `hue(0)` is the
 * scene's ground and the rest walk on from there.
 */
function makeTexture(paint: Painter, pop: Pop, index: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = T;
  canvas.height = T;
  const g = canvas.getContext('2d');
  if (g) paint(g, pop, (n) => pop.hue[(index * 3 + n) % pop.hue.length] ?? pop.paper);
  return canvas;
}

/**
 * The whole set, as bold pencil-sketch textures.
 *
 * Not a filter over the coloured set: the pastel grounds all sit near the
 * same light luminance, so desaturating them made a wall of fog. The sketch
 * is DRAWN in ink — the painters' own `hue()` callback handed a ramp of
 * grays instead of the wheel — so dark panes carry white strokes and light
 * panes carry dark ones, which is what a bold sketch is. The ramp is spaced
 * the way the wheel was, so neighbouring panels still never match.
 */
const INKS = [
  'rgba(30, 36, 50, 1)',
  'rgba(233, 236, 241, 1)',
  'rgba(74, 82, 100, 1)',
  'rgba(200, 205, 214, 1)',
  'rgba(52, 59, 76, 1)',
  'rgba(160, 166, 178, 1)',
  'rgba(96, 104, 122, 1)',
  'rgba(120, 128, 145, 1)',
];

export function sketchTextures(): HTMLCanvasElement[] {
  const pop = { ...readPop(), hue: INKS };
  return PAINTERS.map((paint, i) => makeTexture(paint, pop, i));
}
