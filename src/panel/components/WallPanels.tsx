import { useEffect, useRef } from 'react';
import { WALL_OPACITY_MAX, gridFor, shadeAt } from '../../core/ambient/wallPanels';
import type { WallGrid } from '../../core/ambient/wallPanels';
import { sketchTextures } from '../scenery/painters';
import './WallPanels.css';

/**
 * V2.3 VB-97 — the wall behind the question area: a faint tessellation of
 * congruent random-edged panels, breathing on unsynchronized clocks with a
 * brief colour glow. Pure decoration, and it behaves like it:
 *
 *  - The WHOLE layer composites at WALL_OPACITY_MAX (low single digits) —
 *    set as the canvas element's own opacity, so nothing the painter does
 *    can push more ink than that through to the surface. Readability wins
 *    every tie (docs/V2.3-REFINEMENT.md VB-97).
 *  - `prefers-reduced-motion` gets the still version: the same wall,
 *    painted once, no clock. (The reduced-motion rule about "the still
 *    version still carries the instruction" is satisfied trivially —
 *    decoration carries no instruction.)
 *  - `aria-hidden`, pointer-events none, z-index under everything.
 *  - No dependency, hand-rolled canvas. The geometry and the clocks live
 *    in core/ambient/wallPanels.ts, where they are tested as arithmetic.
 *  - The loop repaints at ~15fps (the breath is minutes-slow), pauses
 *    entirely while the document is hidden, and stops on unmount.
 *
 * The four glow hues are read from the design tokens at mount — never
 * literals here (npm run audit's one-source-of-colour rule).
 */

const FRAME_MS = 66;

/* `glowPalette` retired with the colour glow (the sketch pass): the wall is
   black-and-white now, and its pictures carry their own grays. */

function paint(
  context: CanvasRenderingContext2D,
  grid: WallGrid,
  glass: HTMLCanvasElement[],
  nowMs: number,
  dpr: number,
): void {
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(dpr, dpr);
  // V2.4 VB-111 follow-up: the cap is baked into the BITMAP, not left to
  // CSS compositing. axe's color-contrast sampler reads a canvas's raw
  // pixels and ignores the element's CSS opacity — with vivid raw panels
  // it reported dozens of phantom violations against colors no person
  // ever sees. Baking the alpha here makes every sampler (axe,
  // screenshots, eyes) see the same faint wall.
  context.globalAlpha = WALL_OPACITY_MAX;
  for (let i = 0; i < grid.panels.length; i += 1) {
    const panel = grid.panels[i]!;
    const { lift } = shadeAt(panel, nowMs);
    context.save();
    context.beginPath();
    const [a, b, c, d] = panel.corners;
    const va = grid.vertices[a]!;
    let minX = va.x;
    let minY = va.y;
    let maxX = va.x;
    let maxY = va.y;
    context.moveTo(va.x, va.y);
    for (const index of [b, c, d]) {
      const v = grid.vertices[index]!;
      context.lineTo(v.x, v.y);
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    context.closePath();
    context.clip();

    /* THE FAINT SKETCH (Adam, 2026-09-01): "take a faint light version of
       this background and make it the underlying canvas background for the
       app… so there is a continuity". Each panel holds one of the splash's
       own pencil drawings, cover-fit, and the VB-97 breath survives as the
       panel's whisper-quiet rise and fall — the colour glow went with the
       colour. Everything still lands through the baked-in cap, so axe and
       eyes keep seeing the same faint wall. */
    const picture = glass[i % (glass.length || 1)];
    if (picture) {
      context.globalAlpha = WALL_OPACITY_MAX * (1.0 + 0.7 * lift);
      const w = maxX - minX;
      const h = maxY - minY;
      const scale = Math.max(w / picture.width, h / picture.height);
      context.drawImage(
        picture,
        minX + (w - picture.width * scale) / 2,
        minY + (h - picture.height * scale) / 2,
        picture.width * scale,
        picture.height * scale,
      );
      context.globalAlpha = WALL_OPACITY_MAX;
    }
    // Barely-there edges: the seams read as joins, not lines.
    context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    context.lineWidth = 0.5;
    context.stroke();
    context.restore();
  }
  context.restore();
}

export function WallPanels() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return; // no 2d context is a wall that simply is not there
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const glass = sketchTextures();
    let grid: WallGrid | null = null;
    let dpr = 1;
    let raf = 0;
    let lastFrame = 0;
    const epoch = performance.now();

    const rebuild = () => {
      const box = canvas.parentElement?.getBoundingClientRect();
      if (!box || box.width < 1 || box.height < 1) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      // One seed per surface size: the same wall on every visit, and a
      // rebuild on resize lays believable new stonework rather than
      // stretching the old.
      grid = gridFor(box.width, box.height, Math.round(box.width * 31 + box.height));
      paint(context, grid, glass, reduced ? 0 : performance.now() - epoch, dpr);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      if (grid) paint(context, grid, glass, now - epoch, dpr);
    };

    const observer = new ResizeObserver(rebuild);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    rebuild();

    const onVisibility = () => {
      if (reduced) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    if (!reduced) raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // The cap lives in the painter now (globalAlpha = WALL_OPACITY_MAX) so
  // the bitmap itself is faint; the stylesheet no longer composites.
  return (
    <canvas
      ref={canvasRef}
      className="wallpanels"
      data-still={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
