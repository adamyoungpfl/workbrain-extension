import { useEffect, useRef } from 'react';
import { WALL_OPACITY_MAX, gridFor, shadeAt } from '../../core/ambient/wallPanels';
import type { WallGrid } from '../../core/ambient/wallPanels';
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

/** The wall's brand hues, resolved from the stylesheet's own custom
 * properties so tokens.css stays the single source of colour. */
function glowPalette(el: HTMLElement): string[] {
  const style = getComputedStyle(el);
  return ['--primary', '--violet', '--green', '--amber-line'].map((token) => style.getPropertyValue(token).trim() || 'transparent');
}

function paint(
  context: CanvasRenderingContext2D,
  grid: WallGrid,
  palette: string[],
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
  for (const panel of grid.panels) {
    const { lift, glow } = shadeAt(panel, nowMs);
    context.beginPath();
    const [a, b, c, d] = panel.corners;
    const va = grid.vertices[a]!;
    context.moveTo(va.x, va.y);
    for (const index of [b, c, d]) {
      const v = grid.vertices[index]!;
      context.lineTo(v.x, v.y);
    }
    context.closePath();
    // The breath: panels rise toward ink and fall toward nothing. All of
    // this lands through the canvas's low-single-digit opacity, so "black"
    // here is a whisper on the surface.
    context.fillStyle = `rgba(0, 0, 0, ${(0.25 + 0.75 * lift).toFixed(3)})`;
    context.fill();
    if (glow > 0.01) {
      // The brief colour glow — something vibrant under the surface.
      context.globalAlpha = WALL_OPACITY_MAX * glow * 0.8;
      context.fillStyle = palette[panel.hue] ?? 'transparent';
      context.fill();
      context.globalAlpha = WALL_OPACITY_MAX;
    }
    // Barely-there edges: the seams read as joins, not lines.
    context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    context.lineWidth = 0.5;
    context.stroke();
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
    const palette = glowPalette(canvas);
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
      paint(context, grid, palette, reduced ? 0 : performance.now() - epoch, dpr);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      if (grid) paint(context, grid, palette, now - epoch, dpr);
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
