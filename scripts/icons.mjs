#!/usr/bin/env node
/**
 * Generates the extension icons from the same solid the panel's BrandMark
 * draws, so the toolbar icon and the panel are provably the same object.
 *
 *   node scripts/icons.mjs            # writes public/icons/{16,32,48,128}.png
 *   node scripts/icons.mjs --preview  # also writes a side-by-side sheet to look at
 *
 * Not part of `npm run build` — icons change about once a product, and a build
 * step that shells out to a browser to redraw a static asset earns nothing.
 * Playwright is already a devDependency (it drives every e2e test), so this adds
 * no new dependency; see docs/DEPENDENCIES.md.
 *
 * NEEDS NODE 22.6 OR NEWER. It imports `src/core/geometry/silhouette.ts`
 * directly, under Node's type stripping. Older Node cannot load a `.ts` file
 * and will refuse this script with a clear error; nothing else in the repo
 * depends on that, because nothing else in the repo runs this.
 *
 * V1.7 VB-39 — WHAT CHANGED, AND WHY THE GEOMETRY IS NOW IMPORTED
 * The icon was the node graph: twelve nodes, thirty edges, depth-cued. It is
 * now the *silhouette* — the shape the solid casts, filled, with the creases
 * between its visible faces cut back out of it where there is room for them.
 * Earlier versions of this file rebuilt the icosahedron inline from the golden
 * ratio, a second copy of geometry the panel already had. The silhouette needs
 * face culling and a convex hull as well, which is more arithmetic than anyone
 * should keep two copies of, so all of it now comes from `core/geometry` and
 * this file is left with the part that is genuinely its own: a camera, a set
 * of weights, and a ground.
 *
 * Why the mark is drawn light-on-dark here and dark-on-light in the panel: a
 * toolbar icon sits on chrome we do not control, in either theme, at 16px. A
 * filled ground is the only way to hold contrast in both, and the deep field is
 * already the product's own surface — it is what Brain mode looks like.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { silhouetteAt } from '../src/core/geometry/silhouette.ts';

const OUT = new URL('../public/icons/', import.meta.url).pathname;

/** The pose. Chosen by eye from a few candidates: this one puts a vertex near
 * top-centre and keeps the silhouette wide rather than presenting a pole.
 * Unchanged from the node-graph icon, so the icon did not move when the
 * drawing changed. */
const RX = -0.30;
const RY = 0.62;

/**
 * Per-size weights, and the one real decision in this file.
 *
 * `creases` is the width of the gaps cut between visible faces, as a fraction
 * of the icon, or 0 for none. The old node-graph icon needed a *different
 * drawing* at 16 and 32 — a hub and five spokes — because twelve nodes and
 * thirty edges resolved to grey mud at that size. The silhouette needs no such
 * substitute: it is a filled shape, and a filled shape survives being small.
 *
 * The creases do not. Looked at, not assumed — rendered at true size and again
 * magnified four times, pixel for pixel. At 16 and 32 the creases are a smear
 * of half-lit pixels that makes a crisp shape look dirty; at 48 they resolve.
 * So the two toolbar sizes draw the bare shadow and the two large ones are
 * faceted. Splitting there rather than between 16 and 32 is deliberate: 32 is
 * what a 2× display puts in the same toolbar slot as 16, and the button should
 * not be a different drawing depending on the screen it is on.
 *
 * That is the same principle the hub obeyed — fewer, heavier marks as the icon
 * shrinks — arriving somewhere much better, because at 16px the icon is now
 * the real solid's own shadow rather than a five-spoke stand-in for it.
 *
 * `inset` tightens as the icon shrinks, which is the opposite of the node
 * graph's ramp and right for the opposite reason. A wireframe needs air around
 * it or its outermost nodes clip; a filled shape needs to hold the tile, and
 * at 16px every pixel it gives back to the ground is one it does not have.
 *
 * `minFacet` drops creases around faces too foreshortened to read as facets;
 * see `core/geometry/silhouette.ts`. Without it, the two faces this pose turns
 * nearly edge-on cut slivers off the outline that look like chipped corners.
 */
const WEIGHTS = {
  16: { r: 240, creases: 0, minFacet: 0, rounding: 0.26, inset: 0.11 },
  32: { r: 240, creases: 0, minFacet: 0, rounding: 0.24, inset: 0.12 },
  48: { r: 240, creases: 0.024, minFacet: 0.05, rounding: 0.23, inset: 0.14 },
  128: { r: 240, creases: 0.018, minFacet: 0.05, rounding: 0.22, inset: 0.13 },
};

const GROUND_A = '#141C34';
const GROUND_B = '#0B1020';
const INK = '#DCE8FF';

function svg(size) {
  const w = WEIGHTS[size];
  const FRAME = silhouetteAt(RX, RY, { minFacet: w.minFacet });
  const S = w.r;
  const centre = S / 2;
  // The solid's vertices are on the raw (0, ±1, ±PHI) construction, so its
  // circumradius is hypot(1, PHI) and dividing it out is an exact rescale.
  const radius = ((S / 2) * (1 - w.inset * 2)) / Math.hypot(1, (1 + Math.sqrt(5)) / 2);
  const at = (i) => {
    const p = FRAME.points[i];
    return `${(centre + p.x * radius).toFixed(1)},${(centre + p.y * radius).toFixed(1)}`;
  };

  const outline = FRAME.hull.map(at).join(' ');
  const ground = `<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0%" stop-color="${GROUND_A}"/><stop offset="100%" stop-color="${GROUND_B}"/>
</linearGradient></defs>
<rect width="${S}" height="${S}" rx="${(S * w.rounding).toFixed(1)}" fill="${'url(#g)'}"/>`;

  if (!w.creases) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${ground}<polygon points="${outline}" fill="${INK}"/></svg>`;
  }

  // The creases are cut out of the fill rather than drawn over it, so they are
  // holes in one shape and not lines in a second colour: the icon still has
  // exactly two inks in it whatever the toolbar behind it is doing. A mask is
  // luminance, so `white` keeps and `black` removes — neither is a colour
  // anybody sees.
  const cuts = FRAME.creases
    .map(([a, b]) => {
      const [ax, ay] = at(a).split(',');
      const [bx, by] = at(b).split(',');
      return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="black" stroke-width="${(S * w.creases).toFixed(2)}" stroke-linecap="round"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${ground}<mask id="facets"><polygon points="${outline}" fill="white"/>${cuts}</mask>
<rect width="${S}" height="${S}" fill="${INK}" mask="url(#facets)"/></svg>`;
}

const SIZES = [16, 32, 48, 128];
const preview = process.argv.includes('--preview');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(OUT, { recursive: true });

const rendered = new Map();
for (const size of SIZES) {
  const markup = svg(size);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px">` +
      markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`) +
      `</div></body>`,
  );
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(join(OUT, `${size}.png`), buf);
  rendered.set(size, buf.toString('base64'));
  console.log(`  wrote icons/${size}.png`);
}

if (preview) {
  // The real PNGs, at true size and magnified beside themselves. The
  // magnification is the part that earns its keep: at 16px the difference
  // between a crisp shape and a dirty one is four pixels nobody can see
  // without it, and this is the sheet that settled where the creases stop.
  const row = (scale) =>
    SIZES.map(
      (s) =>
        `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${rendered.get(s)}" width="${s * scale}" style="image-rendering:${scale > 1 ? 'pixelated' : 'auto'};display:block;margin:0 auto">` +
        `<figcaption style="font:11px -apple-system;color:#666;margin-top:8px">${s}px</figcaption></figure>`,
    ).join('');
  const strip = () =>
    `<div style="display:flex;gap:38px;align-items:flex-end">${row(1)}</div>` +
    `<div style="display:flex;gap:38px;align-items:flex-end;margin-top:26px">${row(4)}</div>`;
  await page.setViewportSize({ width: 1000, height: 400 });
  await page.setContent(
    `<body style="margin:0;padding:32px;background:#fff;font-family:-apple-system">
     ${strip()}
     <div style="margin-top:34px;padding:22px;background:#202124;border-radius:10px">${strip()}</div>
     <p style="font:12px -apple-system;color:#666;margin:14px 0 0">On a light toolbar, then a dark one. Second row of each is 4×, pixel for pixel.</p></body>`,
  );
  const p = '/private/tmp/claude-501/-Users-adamyoung-Documents-dev/fa027244-afcc-4290-9d95-5504278e5756/scratchpad/icon-preview.png';
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  wrote preview -> ${p}`);
}

await browser.close();
