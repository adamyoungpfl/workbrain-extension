/* The render driver — executed via `npx vite-node` (vitest's own runner,
   which resolves the extensionless TS graph). Renders each static
   narration line to public/cues/n-<key>.m4a via say + afconvert (AAC
   32kbps mono - an order of magnitude smaller than say's raw output) and
   writes the manifest the drift test pins. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { staticNarrations } from './narration-emit';

const OUT = join(process.cwd(), 'public/cues');
mkdirSync(OUT, { recursive: true });
const VOICE = 'Samantha';
const lines = staticNarrations();
const manifest: Record<string, string> = {};
for (const { key, text } of lines) {
  const aiff = join(OUT, `n-${key}.aiff`);
  execFileSync('say', ['-v', VOICE, '-o', aiff, text]);
  execFileSync('afconvert', [aiff, join(OUT, `n-${key}.m4a`), '-f', 'm4af', '-d', 'aac', '-b', '32000', '-c', '1']);
  rmSync(aiff);
  manifest[key] = text;
}
writeFileSync(join(OUT, 'narration-manifest.json'), JSON.stringify({ voice: VOICE, placeholder: true, lines: manifest }, null, 2) + '\n');
console.log(`${lines.length} narration clips rendered`);
