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

    // Colours are flat, except for namespaced groups (a key holding no
    // `value` of its own) which flatten to `<group>-<key>` — see
    // scripts/tokens.mjs. `color.brand.*` is the first and only one.
    const colorProps = new Set();
    for (const [key, entry] of Object.entries(tokens.color)) {
      if (key.startsWith('$')) continue;
      if (entry && typeof entry === 'object' && !('value' in entry)) {
        for (const sub of Object.keys(entry)) if (!sub.startsWith('$')) colorProps.add(`${key}-${sub}`);
        continue;
      }
      colorProps.add(key);
    }

    // BS-01a — the type scale emits four properties per step: the bare name is
    // the size, and `-line` / `-weight` / `-tracking` follow the scale's own
    // keys. Checked to the SUFFIX rather than the prefix, so a `--type-x-line`
    // whose step declares no `line` fails here instead of shipping as a
    // property nothing in the JSON backs.
    const typeProps = new Set();
    for (const [step, entry] of Object.entries(tokens.type)) {
      if (step.startsWith('$')) continue;
      if ('size' in entry) typeProps.add(`type-${step}`);
      for (const [key, suffix] of [['line', '-line'], ['weight', '-weight'], ['tracking', '-tracking']]) {
        if (key in entry) typeProps.add(`type-${step}${suffix}`);
      }
    }

    for (const prop of props) {
      const traces =
        (prop.startsWith('font-') && prop.slice(5) in tokens.font) ||
        (prop.startsWith('r-') && prop.slice(2) in tokens.radius) ||
        (prop.startsWith('e-') && prop.slice(2) in tokens.elevation) ||
        (prop === 'target-min' && 'min' in tokens.target) ||
        prop in tokens.motion ||
        colorProps.has(prop) ||
        typeProps.has(prop);
      expect(traces, `--${prop} does not trace to any entry in design/tokens.json`).toBe(true);
    }
  });

  /**
   * BS-01a — the floors from the beta review's §1 calibration, held at the
   * source rather than at 116 call sites. The scale is the only place a size
   * is decided now, so this is the one test that has to know the numbers.
   */
  it('every step of the type scale clears the 13px floor', () => {
    const tokens = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
    for (const [step, entry] of Object.entries(tokens.type)) {
      if (step.startsWith('$') || !('size' in entry)) continue;
      const px = parseFloat(entry.size);
      expect(px, `type.${step} is ${entry.size}, under the 13px floor`).toBeGreaterThanOrEqual(13);
    }
  });

  it('keeps the three named floors the calibration turns on', () => {
    const tokens = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
    // Instructional 15, body/description/status 14, smallest anywhere 13.
    expect(parseFloat(tokens.type.body.size), 'instructional floor').toBeGreaterThanOrEqual(15);
    expect(parseFloat(tokens.type.support.size), 'body floor').toBeGreaterThanOrEqual(14);
    expect(parseFloat(tokens.type.fine.size), 'the smallest step').toBeGreaterThanOrEqual(13);
    // Section labels lose the uppercase treatment; the globe's own node label
    // is exempt and does not come from this token (see globeLabels.ts).
    expect(tokens.type.label.transform, 'section labels are sentence case now').toBeUndefined();
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
