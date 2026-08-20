// Guards R1-02's accept criteria: every custom property in src/panel/tokens.css
// traces to design/tokens.json, and no hex literal exists anywhere else in src/.
// Plain .mjs (matching scripts/tokens.mjs's own style) so this stays outside tsc's
// checked file set — it needs no @types/node, unlike a .ts version would.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_JSON = path.join(ROOT, 'design/tokens.json');
const TOKENS_CSS = path.join(ROOT, 'src/panel/tokens.css');

describe('design tokens', () => {
  it('the committed CSS is not stale — regenerating it changes nothing', () => {
    const before = readFileSync(TOKENS_CSS, 'utf8');
    execFileSync('node', ['scripts/tokens.mjs'], { cwd: ROOT });
    const after = readFileSync(TOKENS_CSS, 'utf8');
    expect(after).toBe(before);
  });

  it('every custom property traces to an entry in design/tokens.json', () => {
    const tokens = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
    const css = readFileSync(TOKENS_CSS, 'utf8');
    const props = [...css.matchAll(/^\s*--([\w-]+):/gm)].map((m) => m[1]);
    expect(props.length).toBeGreaterThan(0);

    for (const prop of props) {
      const traces =
        (prop.startsWith('font-') && prop.slice(5) in tokens.font) ||
        (prop.startsWith('r-') && prop.slice(2) in tokens.radius) ||
        (prop.startsWith('e-') && prop.slice(2) in tokens.elevation) ||
        (prop === 'target-min' && 'min' in tokens.target) ||
        prop in tokens.motion ||
        prop in tokens.color;
      expect(traces, `--${prop} does not trace to any entry in design/tokens.json`).toBe(true);
    }
  });

  it('no hex color literal appears in src/ outside the generated tokens.css', () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const offenders = [];

    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(css|ts|tsx)$/.test(entry.name) || full === TOKENS_CSS) continue;
        readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (hex.test(line)) offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
          });
      }
    }
    walk(path.join(ROOT, 'src'));

    expect(offenders, `hex literals found outside tokens.css: ${offenders.join(', ')}`).toEqual([]);
  });
});
