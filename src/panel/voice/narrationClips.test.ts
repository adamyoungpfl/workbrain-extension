import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staticNarrations } from '../../../scripts/narration-emit';

/**
 * V3.0 pass 3f — THE NARRATION DRIFT GUARD. Reworded interview copy
 * hashes to a new key; without a re-render the clip misses and the line
 * falls back to the engine — safe, but a silent downgrade on machines
 * whose engine is broken (the reason clips exist). This fails the build
 * loudly instead: every static line must have a rendered clip whose text
 * matches byte for byte. The fix is always `npx vite-node -c
 * scripts/vite.plain.ts scripts/narration-run.ts`.
 */
describe('every static narration line has its clip', () => {
  const manifest = JSON.parse(readFileSync('public/cues/narration-manifest.json', 'utf8')) as {
    lines: Record<string, string>;
  };

  it('keys and texts match the live enumeration exactly', () => {
    const lines = staticNarrations();
    expect(lines.length).toBeGreaterThan(30);
    for (const { key, text } of lines) {
      expect(manifest.lines[key], `missing clip for: "${text.slice(0, 60)}…" — re-run the render`).toBe(text);
    }
  });
});
