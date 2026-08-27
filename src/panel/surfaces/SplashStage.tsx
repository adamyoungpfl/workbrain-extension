import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  kenBurnsOffset,
  makeField,
  projectShard,
  stepField,
} from '../../core/splash/field';
import type { Shard } from '../../core/splash/field';
import { pullStrength } from '../../core/splash/sequence';

/**
 * V2.7 VB-129 — the show's canvas: the shard windows tumbling in the
 * mark's gravity. The physics lives in core/splash/field.ts; this file
 * only draws, on one imperative `paint(t)` the Splash clock calls per
 * frame. No rAF of its own — one clock owns the show — and under reduced
 * motion this component never mounts at all (Splash renders the composed
 * reveal from the first frame), so the zero-frames law is kept by
 * construction rather than by discipline.
 *
 * ── THE WINDOWS' GLASS: TEXTURES ─────────────────────────────────────────
 * Five procedural paintings of a working life — a portrait at a window, a
 * spreadsheet, a report page, a bank statement, a meeting — drawn once to
 * offscreen canvases at mount. Their hues are the fenced `--splash-scene-*`
 * tokens plus two working colours the interface already owns, read at
 * runtime exactly the way WallPanels reads its texture hues: one source of
 * colour, even for scenery. VB-130 lands the real photography IN FRONT of
 * these — an image that decodes replaces its painted sibling; an image
 * that fails leaves the painting in place, silently (the degradation law,
 * applied to scenery). The glass is never blank.
 *
 * The canvas is scenery inside a stage that is already `aria-hidden`;
 * every word of the splash lives in the reveal's real DOM.
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
const SHARD_COUNT = 26;
export const STAGE_W = 400;
export const STAGE_H = 700;
const WELL_X = STAGE_W / 2;
const WELL_Y = 330;

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
  const fieldRef = useRef<Shard[] | null>(null);
  const texturesRef = useRef<CanvasImageSource[]>([]);
  const lastT = useRef(0);

  useEffect(() => {
    // Seeded from the clock: repeatable through core in a test that passes
    // its own seed, subtly fresh on every real open. One texture slot per
    // bundled photograph (VB-130), each opening on its procedural painting
    // and swapping to the photo the instant it decodes — an image that
    // never decodes leaves the painting in place, silently, and the show
    // is merely less photographic (the degradation law, applied to
    // scenery).
    const slots = SHARD_IMAGE_URLS.length || PAINTERS.length;
    fieldRef.current = makeField(SHARD_COUNT, Date.now() % 100_000, slots);
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
      const field = fieldRef.current;
      const g = canvas?.getContext('2d');
      if (!canvas || !field || !g) return;

      const dt = Math.min(0.05, Math.max(0, t - lastT.current));
      lastT.current = t;
      const pull = pullStrength(t);
      stepField(field, dt, pull);

      g.clearRect(0, 0, STAGE_W, STAGE_H);

      // Far-to-near, so close shards overlap distant ones.
      const ordered = field
        .map((shard) => ({ shard, view: projectShard(shard, WELL_X, WELL_Y) }))
        .sort((a, b) => a.view.near - b.view.near);

      for (const { shard, view } of ordered) {
        const texture = texturesRef.current[shard.texture];
        if (!texture) continue;
        g.save();
        g.translate(view.x, view.y);
        g.rotate(shard.rot + shard.angle * 0.25);
        g.scale(view.scale, view.scale);
        g.globalAlpha = view.alpha;
        g.beginPath();
        shard.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.save();
        g.clip();
        const kb = kenBurnsOffset(shard, t);
        g.drawImage(texture, -46 + kb.dx, -46 + kb.dy, 92 + kb.grow, 92 + kb.grow);
        g.restore();
        g.strokeStyle = `rgba(190, 205, 255, ${(0.16 + view.near * 0.3).toFixed(3)})`;
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvasRef} className="splash-canvas" width={STAGE_W} height={STAGE_H} />;
});
