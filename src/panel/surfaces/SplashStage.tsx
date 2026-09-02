import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  STAGE_H,
  STAGE_W,
  bleachAt,
  frameAt,
  makeMosaic,
  stageAt,
} from '../../core/splash/mosaic';
import type { Point } from '../../core/splash/mosaic';
import { SPLASH_BEATS } from '../../core/splash/sequence';
import { sketchTextures } from '../scenery/painters';

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
    /* Drawn once at mount, then only read. Sixteen flat compositions at 256px
       is a few milliseconds of canvas work and no network at all — which is
       the other half of why these are drawn rather than photographed: there is
       nothing to decode, nothing to fail, and so no degradation path to write.
       The wall is never blank because it was never waiting. */
    /* The SKETCH set (Adam, 2026-09-01): "make them all black and white,
       like a bold pencil sketch". Same drawings, taken to grayscale with the
       contrast pushed, in the shared scenery module the app wall reads too. */
    texturesRef.current = sketchTextures();

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

        /* THE TINT IS GONE (Adam, 2026-09-01, the sketch pass): "this
           relies only on the changing of images and not on the changing of
           color to suggest motion or build." The recolour cycle it replaces
           (the 2026-09-02 PowerPoint treatment) is recorded in git — what
           survives of it is the OPENING STILLNESS: in the first stage every
           tile is pinned to the picture it opened on, so the wall reads as
           a wall before it reads as anything else, and after that the only
           thing that ever changes is which sketch a panel is holding. */
        const pinned = stage === 'colour';
        const picture = glass[frameAt(pinned ? 0 : t, i, count, SPLASH_BEATS.swellAt)];

        if (picture) {
          const scale = Math.max(w / picture.width, h / picture.height);
          const dw = picture.width * scale;
          const dh = picture.height * scale;
          g.drawImage(picture, minX + (w - dw) / 2, minY + (h - dh) / 2, dw, dh);
        } else {
          // No picture built for this slot: a quiet pane still reads as a
          // panel. Degrade, never break.
          g.fillStyle = 'rgba(255, 255, 255, 0.08)';
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
