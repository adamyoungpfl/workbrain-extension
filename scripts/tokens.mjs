/**
 * design/tokens.json -> src/panel/tokens.css
 * Never hand-edit the generated file. No hex literal may appear anywhere else in src/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));
const lines = [
  '/* GENERATED from design/tokens.json by scripts/tokens.mjs — do not edit. */',
  ':root {',
];
/**
 * Colours are flat by default — one key, one meaning, one custom property.
 * A key whose object carries no `value` is a namespaced *group* instead and
 * flattens to `--<group>-<key>` (added at V1.1 VB-01 for `color.brand.*`, the
 * decorative mark palette, so those eleven values stay visibly separate from
 * the semantic colours rather than crowding into the same flat list).
 */
for (const [k, v] of Object.entries(t.color)) {
  if (k.startsWith('$')) continue;
  if (v && typeof v === 'object' && !('value' in v)) {
    for (const [gk, gv] of Object.entries(v)) {
      if (gk.startsWith('$')) continue;
      lines.push(`  --${k}-${gk}: ${gv.value};`);
    }
    continue;
  }
  lines.push(`  --${k}: ${v.value};`);
}
for (const [k, v] of Object.entries(t.font))  lines.push(`  --font-${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --r-${k}: ${v};`);
for (const [k, v] of Object.entries(t.elevation)) lines.push(`  --e-${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.motion)) if (!k.startsWith('$')) lines.push(`  --${k}: ${v};`);
/**
 * THE TYPE SCALE, EMITTED — beta sprint BS-01a.
 *
 * It was declared in `design/tokens.json` from the first commit and never
 * written out, so every size in the panel was a hand-typed literal and the
 * scale was documentation rather than a source. The review's §1 calibration
 * is 116 separate edits under that arrangement and one line under this one,
 * which is the whole reason this loop exists.
 *
 * Four properties per step rather than a `font` shorthand: the shorthand
 * cannot be partially overridden, and half the panel wants a size without a
 * weight. `tracking` is emitted only where the scale declares one, so a step
 * with no tracking inherits rather than being pinned to `normal`.
 *
 * `display` is emitted like the rest and stays unused in the panel — its own
 * note says "site only, never the panel", and a token nobody references costs
 * nothing while a missing one invites a literal.
 */
for (const [k, v] of Object.entries(t.type)) {
  if (k.startsWith('$')) continue;
  lines.push(`  --type-${k}: ${v.size};`);
  if (v.line !== undefined) lines.push(`  --type-${k}-line: ${v.line};`);
  if (v.weight !== undefined) lines.push(`  --type-${k}-weight: ${v.weight};`);
  if (v.tracking !== undefined) lines.push(`  --type-${k}-tracking: ${v.tracking};`);
}
lines.push(`  --target-min: ${t.target.min};`);
lines.push('}');
mkdirSync(new URL('../src/panel/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/panel/tokens.css', import.meta.url), lines.join('\n') + '\n');
console.log(`tokens: wrote ${lines.length - 3} custom properties`);
