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
for (const [k, v] of Object.entries(t.color)) lines.push(`  --${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.font))  lines.push(`  --font-${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --r-${k}: ${v};`);
for (const [k, v] of Object.entries(t.elevation)) lines.push(`  --e-${k}: ${v.value};`);
for (const [k, v] of Object.entries(t.motion)) if (!k.startsWith('$')) lines.push(`  --${k}: ${v};`);
lines.push(`  --target-min: ${t.target.min};`);
lines.push('}');
mkdirSync(new URL('../src/panel/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/panel/tokens.css', import.meta.url), lines.join('\n') + '\n');
console.log(`tokens: wrote ${lines.length - 3} custom properties`);
