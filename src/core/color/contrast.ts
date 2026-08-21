/**
 * V1.4 VB-22 — sRGB colour arithmetic, for judging what a screen actually
 * measured.
 *
 * The drawer's chrome became one surface, which put Back / Next / Skip on a
 * background that changes colour down its own height (see
 * core/drawer/chrome.ts). `docs/GUARDRAILS.md` asks for text at 4.5:1 and an
 * interactive boundary at 3:1 — against a background that is no longer one
 * flat token, so the only honest way to hold the floor is to *measure* it:
 * read the real pixels the browser painted, read the real colours it computed,
 * and do the WCAG arithmetic on both.
 *
 * That arithmetic is arithmetic, so it lives here rather than in a test helper
 * (CLAUDE.md's one architectural rule). tests/e2e/dock-surface.spec.ts supplies
 * the pixels and the computed styles; everything below runs without a browser
 * and is unit-tested against the ratios already written down in
 * design/tokens.json.
 *
 * **No colour is authored here.** These functions take colours and hand back
 * numbers. Every value in the product still comes from design/tokens.json —
 * this file could not name one if it wanted to.
 */

/** A colour, in the 0–255 channels every browser hands back, plus the alpha
 * that decides whether a background is a background at all. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1. Absent means opaque. */
  readonly a?: number;
}

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, value));
}

/**
 * One channel, linearised — WCAG 2.x's own formula, not an approximation.
 * Kept separate from `relativeLuminance` because it is the part worth reading
 * against the spec when someone doubts a number.
 */
export function channelLuminance(value: number): number {
  const c = clamp255(value) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. Alpha is ignored: a colour has to be composited
 * against something *before* it has a luminance, and `over` is what does
 * that. */
export function relativeLuminance(colour: Rgb): number {
  return (
    0.2126 * channelLuminance(colour.r) +
    0.7152 * channelLuminance(colour.g) +
    0.0722 * channelLuminance(colour.b)
  );
}

/** WCAG contrast ratio, always ≥ 1 and order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * `from` blended toward `to` by `t`, in gamma-encoded sRGB.
 *
 * Deliberately the same space CSS interpolates a `linear-gradient` and a
 * `color-mix(in srgb, …)` in, because the whole point of this function is to
 * predict what the browser will paint between two stops and then check the
 * screenshot against the prediction. Interpolating in a perceptual space here
 * would be prettier maths and a wrong answer.
 */
export function mixSrgb(from: Rgb, to: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: from.r + (to.r - from.r) * k,
    g: from.g + (to.g - from.g) * k,
    b: from.b + (to.b - from.b) * k,
  };
}

/** A translucent colour composited over an opaque one. What a `rgba()` button
 * ground is really sitting on, and therefore what its label is really read
 * against. */
export function over(colour: Rgb, ground: Rgb): Rgb {
  const alpha = colour.a ?? 1;
  return mixSrgb(ground, colour, alpha);
}

/** Whether a computed background may be treated as a background at all.
 * Anything under this is a window onto whatever is behind it, and the thing
 * behind it is what the contrast has to be measured against. */
export function isOpaque(colour: Rgb | null): colour is Rgb {
  return colour !== null && (colour.a ?? 1) >= 0.999;
}

const RGB_FUNCTION = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i;
const SRGB_FUNCTION = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/i;

function alphaOf(raw: string | undefined): number {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

/**
 * A computed CSS colour, as a number.
 *
 * Only the two forms `getComputedStyle` ever returns are accepted — `rgb()` /
 * `rgba()`, and the `color(srgb …)` form Chrome resolves a `color-mix()` to —
 * plus the `transparent` keyword, which computes to `rgba(0, 0, 0, 0)` but is
 * worth surviving in its written form too. Anything else returns null rather
 * than a guess: a colour this cannot read is a colour a contrast assertion
 * must refuse to pass, not one it should quietly treat as black.
 */
export function parseCssColor(value: string): Rgb | null {
  const text = value.trim();
  if (text === '' || text === 'none') return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = RGB_FUNCTION.exec(text);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alphaOf(rgb[4]) };
  }
  const srgb = SRGB_FUNCTION.exec(text);
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: alphaOf(srgb[4]),
    };
  }
  return null;
}

/** How far apart two colours are, per channel — the form a "did the browser
 * paint what the model predicted" assertion wants, since a screenshot and a
 * model will agree to within rounding and never exactly. */
export function channelDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}
