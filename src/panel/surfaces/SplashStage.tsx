import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  STAGE_H,
  STAGE_W,
  bleachAt,
  frameAt,
  makeMosaic,
  stageAt,
  tintAt,
} from '../../core/splash/mosaic';
import type { Point } from '../../core/splash/mosaic';
import { SPLASH_BEATS } from '../../core/splash/sequence';

/**
 * V2.9 — THE MOSAIC (Adam, 2026-09-01). V2.7 VB-129's shard field tumbled
 * twenty-six windows through the mark's gravity; this holds fifteen irregular
 * panels perfectly still and cuts their CONTENT instead.
 *
 * Adam: "instead of it starting as spinning elements… irregular shaped cells
 * or panels that are each flashing through a series of short images or quick
 * animated actions. No single action should be detailed or important, but all
 * should feel distantly familiar."
 *
 * Nothing moves across the screen, so the eye is not asked to follow anything
 * — which is what makes "no single action is important" true rather than
 * merely intended. What accelerates is the cut rate: a slow colourful flicker
 * quickening until the panels change faster than they can be read, draining of
 * colour as they go, and that is what breaks into the white.
 *
 * The layout and every timing is core/splash/mosaic.ts's, unit-tested. This
 * file only draws, on the one imperative `paint(t)` the Splash clock calls per
 * frame — no rAF of its own, one clock owns the show. Under reduced motion it
 * never mounts at all (Splash renders the composed reveal from the first
 * frame), so the zero-frames law is kept by construction.
 *
 * ── THE GLASS ─────────────────────────────────────────────────────────────
 * The eighteen bundled photographs of a working life that VB-130 brought in,
 * with the five procedural paintings behind them as the silent fallback: an
 * image that decodes is used, one that fails leaves its painted sibling in
 * place. Nothing is fetched at runtime from anywhere but the extension's own
 * package. The canvas is scenery inside a stage that is already `aria-hidden`
 * — every word of the splash lives in the reveal's real DOM.
 */

export interface SplashStageHandle {
  /** Draw the field as it stands at `t` seconds into the show. */
  paint(tSeconds: number): void;
}

/**
 * V2.9 — THE PANELS ARE DRAWN (Adam, 2026-09-02). "Let's draw our own vibrant
 * stuff. Then no guessing and it can fit exactly what we need on panel sizes
 * and durations."
 *
 * VB-130's eighteen photographs are no longer bundled. They were graded cool
 * and muted to sit behind a mark, which is the opposite of what this show
 * wants now: Adam's brief is "more vibrant, colorful and maybe simpler… it's
 * really more eye candy than it is contextual relevance."
 *
 * Drawing them wins three things a photo set cannot. They are sized to the
 * panel instead of cropped to it, so nothing important is ever cut off by a
 * jittered corner. They are a few hundred bytes of code instead of 250KB of
 * WebP. And the palette is OURS — eight fenced `--pop-*` hues, spaced around
 * the wheel, so any handful on screen at once reads as variety rather than as
 * whatever a photographer happened to light.
 *
 * ── WHAT THEY DEPICT, AND HOW LITTLE ──────────────────────────────────────
 * Each is one recognisable working surface at the lowest fidelity that still
 * reads: a chart, a calendar, a thread, a board. Adam's rule from the first
 * pass still governs — "no single action should be detailed or important, but
 * all should feel distantly familiar" — and drawing makes it easier to obey
 * than photography did, because a drawing can stop at the silhouette. There is
 * no text anywhere in them; every glyph is a block. Nothing here is a likeness
 * of any product.
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

export const SplashStage = forwardRef<SplashStageHandle>(function SplashStage(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* The panels are FIXED for the life of the splash — that is the whole change
     from VB-129. Built once, from a constant seed, so the mosaic is the same
     shape every open: a wall that rearranges itself each time reads as a
     different product rather than as this one. */
  const mosaicRef = useRef<Point[][]>(makeMosaic());
  /* Narrowed from `CanvasImageSource` to the two things this actually holds —
     a decoded photograph or the offscreen canvas its painting was drawn to.
     The wide type includes `VideoFrame`, which has no `width`, and cover-fit
     needs the source's real dimensions. */
  const texturesRef = useRef<(HTMLImageElement | HTMLCanvasElement)[]>([]);
  const popRef = useRef<Pop>({ hue: [], paper: '', ink: '', shade: '', tone: '' });

  useEffect(() => {
    /* Drawn once at mount, then only read. Sixteen flat compositions at 256px
       is a few milliseconds of canvas work and no network at all — which is
       the other half of why these are drawn rather than photographed: there is
       nothing to decode, nothing to fail, and so no degradation path to write.
       The wall is never blank because it was never waiting. */
    const pop = readPop();
    popRef.current = pop;
    texturesRef.current = PAINTERS.map((paint, i) => makeTexture(paint, pop, i));

    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = STAGE_W * dpr;
      canvas.height = STAGE_H * dpr;
      canvas.getContext('2d')?.scale(dpr, dpr);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    paint(t: number) {
      const canvas = canvasRef.current;
      const g = canvas?.getContext('2d');
      if (!canvas || !g) return;

      const cells = mosaicRef.current;
      const glass = texturesRef.current;
      const count = glass.length;
      g.clearRect(0, 0, STAGE_W, STAGE_H);
      if (count === 0) return;

      const bleach = bleachAt(t, SPLASH_BEATS.swellAt);

      const stage = stageAt(t, SPLASH_BEATS.swellAt);
      const pop = popRef.current;

      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i]!;

        // The panel's own box, so a picture can be drawn to cover it.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of cell) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const w = maxX - minX;
        const h = maxY - minY;

        g.save();
        g.beginPath();
        cell.forEach((p, n) => (n ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.clip();

        /* EVERY TILE IS A RECOLOUR OF A PICTURE (Adam, 2026-09-02) — the
           PowerPoint treatment, not a wash over the top.

           The difference is which channel survives. A translucent fill blends
           toward the tint and takes the picture's contrast down with it, so a
           wall of them goes muddy. `globalCompositeOperation = 'color'` keeps
           the picture's LUMINOSITY and takes only the hue and saturation of
           the fill — which is exactly what "recolour" means in every tool that
           offers it, and why the shapes stay as crisp at full tint as they are
           untinted.

           In the first stage the picture is PINNED to whatever that tile
           opened on (`frameAt(0, …)`), so only the treatment moves. One thing
           changing is a rhythm; two things changing is a flicker. */
        const pinned = stage === 'colour';
        const picture = glass[frameAt(pinned ? 0 : t, i, count, SPLASH_BEATS.swellAt)];
        const tint = pop.hue[tintAt(t, i, pop.hue.length, SPLASH_BEATS.swellAt)] ?? pop.tone;

        if (picture) {
          const scale = Math.max(w / picture.width, h / picture.height);
          const dw = picture.width * scale;
          const dh = picture.height * scale;
          g.drawImage(picture, minX + (w - dw) / 2, minY + (h - dh) / 2, dw, dh);

          g.globalCompositeOperation = 'color';
          g.fillStyle = tint;
          g.fillRect(minX, minY, w, h);
          g.globalCompositeOperation = 'source-over';
        } else {
          // No picture decoded for this slot: the tint alone still reads as a
          // panel. Degrade, never break.
          g.fillStyle = tint;
          g.fillRect(minX, minY, w, h);
        }

        /* THE COLOUR DRAINS INTO THE WHITE rather than being covered by it —
           the whole back half of the show is one continuous lightening, so by
           the time the swell arrives the wall is already going. One event
           arriving rather than two things happening. */
        if (bleach > 0) {
          g.globalCompositeOperation = 'lighten';
          g.fillStyle = `rgba(255, 255, 255, ${(bleach * 0.95).toFixed(3)})`;
          g.fillRect(minX, minY, w, h);
          g.globalCompositeOperation = 'source-over';
        }

        // The seam. Light enough to read as glass between panels rather than
        // as a drawn border, and it fades out with everything else.
        g.strokeStyle = `rgba(255, 255, 255, ${(0.3 * (1 - bleach)).toFixed(3)})`;
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvasRef} className="splash-canvas" width={STAGE_W} height={STAGE_H} />;
});
