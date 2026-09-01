import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { STAGE_H, STAGE_W, bleachAt, frameAt, makeMosaic } from '../../core/splash/mosaic';
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
 * V2.7 VB-130 — the real glass: eighteen photographs of a working life
 * (AI-produced and licensed through Canva's export pipeline, cropped and
 * graded to one cool voice — docs/V2.7-SPLASH-WOW.md), bundled as ~250KB
 * of WebP and emitted by Vite with the rest of the bundle. Nothing is
 * fetched at runtime from anywhere but the extension's own package.
 */
const SHARD_IMAGE_URLS = Object.values(
  import.meta.glob('../../assets/splash/*.webp', { eager: true, query: '?url', import: 'default' }),
) as string[];

const TEXTURE_SIZE = 140;
export { STAGE_H, STAGE_W };

/** The scenery palette, read off the running stylesheet once per mount —
 * the WallPanels pattern, so tokens.css stays the one source of colour. */
interface Scene {
  paper: string;
  warmHi: string;
  warmLo: string;
  coolHi: string;
  coolLo: string;
  ink: string;
  chart: string;
  sheet: string;
}

function readScene(): Scene {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || 'transparent';
  return {
    paper: token('--splash-scene-paper'),
    warmHi: token('--splash-scene-warm-hi'),
    warmLo: token('--splash-scene-warm-lo'),
    coolHi: token('--splash-scene-cool-hi'),
    coolLo: token('--splash-scene-cool-lo'),
    ink: token('--splash-scene-ink'),
    chart: token('--primary'),
    sheet: token('--green'),
  };
}

type Painter = (g: CanvasRenderingContext2D, scene: Scene) => void;

/** A portrait by window light — warm against the cool field. */
const paintPortrait: Painter = (g, scene) => {
  const bg = g.createLinearGradient(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  bg.addColorStop(0, scene.warmHi);
  bg.addColorStop(1, scene.warmLo);
  g.fillStyle = bg;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  g.fillStyle = 'rgba(255, 240, 220, 0.28)';
  g.fillRect(86, 0, 30, TEXTURE_SIZE);
  g.fillStyle = 'rgba(30, 24, 20, 0.9)';
  g.beginPath();
  g.arc(64, 52, 22, 0, 7);
  g.fill();
  g.beginPath();
  g.ellipse(64, 112, 40, 34, 0, 0, 7);
  g.fill();
  g.fillStyle = scene.paper;
  g.fillRect(46, 92, 12, 20);
};

const paintSpreadsheet: Painter = (g, scene) => {
  g.fillStyle = scene.paper;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  g.fillStyle = scene.sheet;
  g.fillRect(0, 0, TEXTURE_SIZE, 18);
  g.strokeStyle = 'rgba(80, 96, 84, 0.28)';
  g.lineWidth = 1;
  for (let y = 18; y < TEXTURE_SIZE; y += 15) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(TEXTURE_SIZE, y);
    g.stroke();
  }
  for (let x = 0; x < TEXTURE_SIZE; x += 28) {
    g.beginPath();
    g.moveTo(x, 18);
    g.lineTo(x, TEXTURE_SIZE);
    g.stroke();
  }
  g.fillStyle = scene.ink;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 5; col++)
      if ((row * 5 + col) % 3) g.fillRect(4 + col * 28, 24 + row * 15, 12 + ((row + col) % 3) * 4, 4);
};

const paintReport: Painter = (g, scene) => {
  g.fillStyle = scene.paper;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  g.fillStyle = scene.ink;
  g.fillRect(12, 12, 80, 7);
  g.fillRect(12, 26, 116, 4);
  g.fillRect(12, 34, 104, 4);
  g.fillStyle = scene.chart;
  const bars = [22, 40, 30, 52, 44, 60];
  bars.forEach((h, i) => g.fillRect(14 + i * 20, 128 - h, 12, h));
  g.strokeStyle = scene.warmLo;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(14, 100);
  bars.forEach((h, i) => g.lineTo(20 + i * 20, 118 - h));
  g.stroke();
};

const paintStatement: Painter = (g, scene) => {
  g.fillStyle = scene.paper;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  g.fillStyle = scene.coolLo;
  g.fillRect(0, 0, TEXTURE_SIZE, 22);
  g.fillStyle = scene.warmHi;
  g.beginPath();
  g.arc(16, 11, 6, 0, 7);
  g.fill();
  g.fillStyle = scene.ink;
  for (let row = 0; row < 7; row++) {
    g.fillRect(10, 32 + row * 15, 56, 4);
    g.fillRect(96, 32 + row * 15, 30, 4);
  }
  g.fillStyle = scene.sheet;
  g.fillRect(96, 92, 30, 4);
};

const paintMeeting: Painter = (g, scene) => {
  const bg = g.createLinearGradient(0, 0, 0, TEXTURE_SIZE);
  bg.addColorStop(0, scene.coolHi);
  bg.addColorStop(1, scene.ink);
  g.fillStyle = bg;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  g.fillStyle = 'rgba(25, 28, 36, 0.85)';
  [24, 62, 102].forEach((x, i) => {
    g.beginPath();
    g.arc(x, 78 + (i % 2) * 8, 13, 0, 7);
    g.fill();
    g.beginPath();
    g.ellipse(x, 112 + (i % 2) * 6, 22, 20, 0, 0, 7);
    g.fill();
  });
  g.fillStyle = 'rgba(255, 255, 255, 0.5)';
  g.fillRect(0, 20, TEXTURE_SIZE, 3);
};

const PAINTERS: Painter[] = [paintPortrait, paintSpreadsheet, paintReport, paintStatement, paintMeeting];

/** Draw one texture window, vignetted so every kind reads photographic.
 * An environment with no 2D context (jsdom; a hostile embedder) gets the
 * blank canvas back and the show simply has darker glass — the degradation
 * law, and what lets the unit suite mount the whole splash. */
function makeTexture(painter: Painter, scene: Scene): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEXTURE_SIZE;
  c.height = TEXTURE_SIZE;
  const g = c.getContext('2d');
  if (!g) return c;
  painter(g, scene);
  const v = g.createRadialGradient(70, 70, 30, 70, 70, 100);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
  g.fillStyle = v;
  g.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  return c;
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

  useEffect(() => {
    // One texture slot per bundled photograph (VB-130), each opening on its
    // procedural painting and swapping to the photo the instant it decodes —
    // an image that never decodes leaves the painting in place, silently, and
    // the show is merely less photographic (the degradation law, applied to
    // scenery).
    const slots = SHARD_IMAGE_URLS.length || PAINTERS.length;
    const scene = readScene();
    texturesRef.current = Array.from({ length: slots }, (_, i) =>
      makeTexture(PAINTERS[i % PAINTERS.length]!, scene),
    );
    for (let i = 0; i < SHARD_IMAGE_URLS.length; i++) {
      const url = SHARD_IMAGE_URLS[i]!;
      const image = new Image();
      image.onload = () => {
        texturesRef.current[i] = image;
      };
      image.src = url;
    }
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

      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i]!;
        const picture = glass[frameAt(t, i, count, SPLASH_BEATS.swellAt)];
        if (!picture) continue;

        // The panel's own box, so the picture can be drawn to cover it.
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

        /* COVER, NEVER FIT. A picture letterboxed inside an irregular quad
           leaves the ground showing in the corners, which turns a wall of
           panels back into a scatter of tiles. */
        const scale = Math.max(w / picture.width, h / picture.height);
        const dw = picture.width * scale;
        const dh = picture.height * scale;
        g.drawImage(picture, minX + (w - dw) / 2, minY + (h - dh) / 2, dw, dh);

        /* THE COLOUR DRAINS INTO THE WHITE rather than being covered by it.
           `bleachAt` starts before the swell does, so by the time the white
           sheet arrives the wall is already going — one event arriving rather
           than two things happening. */
        if (bleach > 0) {
          g.globalCompositeOperation = 'lighten';
          g.fillStyle = `rgba(255, 255, 255, ${(bleach * 0.92).toFixed(3)})`;
          g.fillRect(minX, minY, w, h);
          g.globalCompositeOperation = 'source-over';
        }

        // The seam. Light enough to read as glass between panels rather than
        // as a drawn border, and it fades out with everything else.
        g.strokeStyle = `rgba(255, 255, 255, ${(0.22 * (1 - bleach)).toFixed(3)})`;
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvasRef} className="splash-canvas" width={STAGE_W} height={STAGE_H} />;
});
