#!/usr/bin/env node
/**
 * Generates the extension icons from the same icosahedron the panel's BrandMark
 * draws, so the toolbar icon and the welcome screen are provably the same object.
 *
 *   node scripts/icons.mjs            # writes public/icons/{16,32,48,128}.png
 *   node scripts/icons.mjs --preview  # also writes a side-by-side sheet to look at
 *
 * Not part of `npm run build` — icons change about once a product, and a build
 * step that shells out to a browser to redraw a static asset earns nothing.
 * Playwright is already a devDependency (it drives every e2e test), so this adds
 * no new dependency; see docs/DEPENDENCIES.md.
 *
 * Why the mark is drawn light-on-dark here and dark-on-light in the panel: a
 * toolbar icon sits on chrome we do not control, in either theme, at 16px. A
 * filled ground is the only way to hold contrast in both, and the deep field is
 * already the product's own surface — it is what Brain mode looks like.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../public/icons/', import.meta.url).pathname;
const PHI = (1 + Math.sqrt(5)) / 2;

const V = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
];
const E = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    const d = V[i].map((c, k) => c - V[j][k]).reduce((s, c) => s + c * c, 0);
    if (Math.abs(d - 4) < 1e-6) E.push([i, j]);
  }
}

/** The pose. Chosen by eye from a few candidates: this one puts a vertex near
 * top-centre and keeps the silhouette wide rather than presenting a pole. */
const RX = -0.30;
const RY = 0.62;

function project(p) {
  const y1 = p[1] * Math.cos(RX) - p[2] * Math.sin(RX);
  const z1 = p[1] * Math.sin(RX) + p[2] * Math.cos(RX);
  const x2 = p[0] * Math.cos(RY) + z1 * Math.sin(RY);
  const z2 = -p[0] * Math.sin(RY) + z1 * Math.cos(RY);
  return { x: x2 / PHI, y: y1 / PHI, z: z2 / PHI };
}

/**
 * Per-size weights. An icon is not one drawing scaled — at 16px the full graph
 * turns to mud, so the small sizes carry fewer, heavier marks. Depth cueing is
 * dropped below 48 for the same reason: a 0.4px stroke difference is noise.
 */
const WEIGHTS = {
  16: { r: 240, node: 0.150, edge: 0.070, depth: false, rounding: 0.26, inset: 0.18, ring: 3 },
  32: { r: 240, node: 0.105, edge: 0.048, depth: false, rounding: 0.24, inset: 0.15, ring: 5 },
  48: { r: 240, node: 0.082, edge: 0.030, depth: true, rounding: 0.23, inset: 0.13 },
  128: { r: 240, node: 0.062, edge: 0.020, depth: true, rounding: 0.22, inset: 0.14 },
};

/**
 * The small sizes are not the big drawing scaled down — they are a different,
 * simpler drawing. Twelve nodes and thirty edges resolve to grey mud at 16px
 * (checked, not assumed: the first pass shipped the full graph at every size
 * and 16 was unreadable). So 16 and 32 draw a hub with `ring` spokes: the same
 * node-and-edge language, the same ground and colours, few enough marks to
 * survive. Nobody can identify a solid at 16px; what has to survive is
 * "connected things", and that does.
 */
function hub(size) {
  const w = WEIGHTS[size];
  const S = w.r;
  const c = S / 2;
  const radius = (S / 2) * (1 - w.inset * 2);
  const pts = Array.from({ length: w.ring }, (_, i) => {
    const a = -Math.PI / 2 + (i / w.ring) * Math.PI * 2;
    return { x: c + Math.cos(a) * radius, y: c + Math.sin(a) * radius };
  });
  const spokes = pts
    .map(
      (p) =>
        `<line x1="${c}" y1="${c}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${EDGE}" stroke-width="${(S * w.edge).toFixed(2)}" stroke-linecap="round"/>`,
    )
    .join('');
  const outer = pts
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(S * w.node).toFixed(2)}" fill="${NODE}"/>`)
    .join('');
  const centre = `<circle cx="${c}" cy="${c}" r="${(S * w.node * 1.25).toFixed(2)}" fill="${NODE}"/>`;
  return { spokes, outer, centre };
}

const GROUND_A = '#141C34';
const GROUND_B = '#0B1020';
const NODE = '#DCE8FF';
const NODE_DIM = '#8FB0E8';
const EDGE = '#7FA0DC';

function svg(size) {
  const w = WEIGHTS[size];
  const S = w.r;
  const c = S / 2;
  const radius = (S / 2) * (1 - w.inset * 2);
  const pts = V.map(project);
  const zs = pts.map((p) => p.z);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const t = (z) => (z - zMin) / (zMax - zMin || 1);
  const at = (p) => ({ x: c + p.x * radius, y: c + p.y * radius, t: t(p.z) });

  if (w.ring) {
    const h = hub(size);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0%" stop-color="${GROUND_A}"/><stop offset="100%" stop-color="${GROUND_B}"/>
</linearGradient></defs>
<rect width="${S}" height="${S}" rx="${(S * w.rounding).toFixed(1)}" fill="url(#g)"/>
<g>${h.spokes}</g><g>${h.outer}${h.centre}</g></svg>`;
  }

  const edges = E.map(([i, j]) => {
    const a = at(pts[i]);
    const b = at(pts[j]);
    const d = w.depth ? 0.45 + ((a.t + b.t) / 2) * 0.75 : 1;
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${EDGE}" stroke-width="${(S * w.edge * d).toFixed(2)}" stroke-opacity="${w.depth ? (0.5 + ((a.t + b.t) / 2) * 0.5).toFixed(2) : 0.9}" stroke-linecap="round"/>`;
  }).join('');

  const nodes = pts
    .map((p, i) => ({ ...at(p), i }))
    .sort((a, b) => a.t - b.t)
    .map((n) => {
      const d = w.depth ? 0.62 + n.t * 0.6 : 1;
      const fill = w.depth && n.t < 0.4 ? NODE_DIM : NODE;
      return `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(S * w.node * d).toFixed(2)}" fill="${fill}"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0%" stop-color="${GROUND_A}"/><stop offset="100%" stop-color="${GROUND_B}"/>
</linearGradient></defs>
<rect width="${S}" height="${S}" rx="${(S * w.rounding).toFixed(1)}" fill="url(#g)"/>
<g>${edges}</g><g>${nodes}</g></svg>`;
}

const SIZES = [16, 32, 48, 128];
const preview = process.argv.includes('--preview');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(OUT, { recursive: true });

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
  console.log(`  wrote icons/${size}.png`);
}

if (preview) {
  const row = SIZES.map(
    (s) =>
      `<figure style="margin:0;text-align:center"><div style="width:${s}px;height:${s}px;margin:0 auto">${svg(s).replace(/width="\d+" height="\d+"/, `width="${s}" height="${s}"`)}</div>` +
      `<figcaption style="font:11px -apple-system;color:#666;margin-top:8px">${s}px</figcaption></figure>`,
  ).join('');
  await page.setViewportSize({ width: 620, height: 300 });
  await page.setContent(
    `<body style="margin:0;padding:32px;background:#fff;font-family:-apple-system">
     <div style="display:flex;gap:38px;align-items:flex-end">${row}</div>
     <div style="display:flex;gap:38px;align-items:flex-end;margin-top:34px;padding:16px;background:#202124;border-radius:10px">${row}</div>
     <p style="font:12px -apple-system;color:#666;margin:14px 0 0">On a light toolbar, then a dark one.</p></body>`,
  );
  const p = '/private/tmp/claude-501/-Users-adamyoung-Documents-dev/fa027244-afcc-4290-9d95-5504278e5756/scratchpad/icon-preview.png';
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  wrote preview -> ${p}`);
}

await browser.close();
