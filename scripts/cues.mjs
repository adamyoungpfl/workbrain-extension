/**
 * Render the splash's fixed cues to bundled audio (V3.0 pass 3d).
 *
 * public/cues/<name>.m4a + manifest.json — PLACEHOLDER renders via macOS's
 * own compact voice until the copy is final-approved and ElevenLabs
 * replaces the files one for one (docs/V3.0-CONSOLE.md; the ElevenLabs
 * decision lives with the cue registry it fulfils, src/panel/voice/cues.ts).
 *
 * The LINES ARE DUPLICATED from strings.ts on purpose — this script runs in
 * plain node and cannot import the panel. The manifest it writes carries
 * each line verbatim, and src/panel/voice/cues.test.ts compares that
 * manifest against the registry, so a copy change that forgets to re-render
 * fails the suite instead of shipping a stale voice.
 *
 * Run after any cue copy change: `node scripts/cues.mjs`
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public/cues');
mkdirSync(OUT, { recursive: true });

const VOICE = 'Samantha';
const LINES = {
  intro: 'Workbrain. How you do anything is how your AI does everything.',
  radioBaseline: 'Tower is clear.',
  radioLaunch: 'All systems go.',
  standby: 'Standing by.',
  liftoff: 'Liftoff.',
  digit3: '3',
  digit2: '2',
  digit1: '1',
  muteBack: 'Sorry — I was on mute. Where was I?',
};

for (const [name, text] of Object.entries(LINES)) {
  execFileSync('say', ['-v', VOICE, '-o', join(OUT, `${name}.m4a`), text]);
  console.log(`cues/${name}.m4a`);
}
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify({ voice: VOICE, placeholder: true, lines: LINES }, null, 2) + '\n',
);
console.log('cues/manifest.json');
