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
lines.push(`  --target-min: ${t.target.min};`);
lines.push('}');
mkdirSync(new URL('../src/panel/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/panel/tokens.css', import.meta.url), lines.join('\n') + '\n');
console.log(`tokens: wrote ${lines.length - 3} custom properties`);
