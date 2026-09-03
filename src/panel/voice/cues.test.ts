import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPLASH_CUES } from './cues';

/**
 * V3.0 pass 3d — THE MANIFEST DRIFT GUARD. The render script
 * (scripts/cues.mjs) cannot import the panel, so its lines are duplicated
 * on purpose and it writes what it rendered into cues/manifest.json. This
 * test is the seam: a copy change that forgets `node scripts/cues.mjs`
 * fails HERE instead of shipping a clip that says the old words.
 */
describe('the cue clips say what the registry says', () => {
  // cwd-relative: vitest runs from the repo root, and the transformed
  // import.meta.url is not a file: URL here.
  const manifest = JSON.parse(readFileSync('public/cues/manifest.json', 'utf8')) as {
    lines: Record<string, string>;
  };

  it('one clip per cue, byte-for-byte the registry line', () => {
    expect(Object.keys(manifest.lines).sort()).toEqual(Object.keys(SPLASH_CUES).sort());
    for (const [name, text] of Object.entries(SPLASH_CUES)) {
      expect(manifest.lines[name], `cues/${name}.m4a was rendered from different words`).toBe(text);
    }
  });
});
