/**
 * V3.0 pass 3g — the ElevenLabs recording session for the TEST-DRIVE
 * scope: every splash cue plus the baseline flow's narration, rendered
 * with real voices into the SAME filenames the say placeholders held —
 * the file-for-file swap the whole clip architecture was built for.
 *
 * BUILD-TIME ONLY, on the developer's machine with the developer's key
 * (read from the sibling site's .env.local or ELEVENLABS_API_KEY). The
 * extension itself never calls anyone — docs/GUARDRAILS.md holds.
 *
 * The cast (swap a line to recast):
 *   RADIO — Brian (deep, resonant): the mission-control voice, passed
 *     through scripts/radiofx.py (voice-band EQ + soft drive), with the
 *     QUINDAR sign-off beep on the transmission lines.
 *   NARRATOR — Eric (smooth, trustworthy): the intro, the filler, and
 *     the interview's own reads.
 *
 * Run: node scripts/elevenlabs-render.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CUES = join(ROOT, 'public/cues');

const key =
  process.env.ELEVENLABS_API_KEY ??
  readFileSync(join(ROOT, '../modelcitizen/.env.local'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ELEVENLABS_API_KEY'))
    ?.split('=')[1]
    ?.replace(/["' ]/g, '')
    .trim();
if (!key) throw new Error('No ElevenLabs key found (env or ../modelcitizen/.env.local)');

const RADIO = 'nPczCjzI2devNBz1zQrb'; // Brian — Deep, Resonant and Comforting
const NARRATOR = 'cjVigY5qzO86Huf0OWal'; // Eric — Smooth, Trustworthy

const cueLines = JSON.parse(readFileSync(join(CUES, 'manifest.json'), 'utf8')).lines;
const narrationLines = JSON.parse(readFileSync(join(CUES, 'narration-manifest.json'), 'utf8')).lines;

/** The baseline flow's narration, found by its own opening words. */
const flowNarrations = Object.entries(narrationLines).filter(([, text]) =>
  ['Ok! To set your baseline', 'Run it once with nothing loaded', 'Saved as your starting point'].some(
    (lead) => text.startsWith(lead),
  ),
);

const jobs = [
  { file: 'intro', text: cueLines.intro, voice: NARRATOR },
  { file: 'muteBack', text: cueLines.muteBack, voice: NARRATOR },
  { file: 'radioBaseline', text: cueLines.radioBaseline, voice: RADIO, fx: true, beep: true },
  { file: 'radioLaunch', text: cueLines.radioLaunch, voice: RADIO, fx: true, beep: true },
  { file: 'standby', text: cueLines.standby, voice: RADIO, fx: true, beep: true },
  { file: 'liftoff', text: cueLines.liftoff, voice: RADIO, fx: true, beep: true },
  { file: 'digit3', text: cueLines.digit3, voice: RADIO, fx: true },
  { file: 'digit2', text: cueLines.digit2, voice: RADIO, fx: true },
  { file: 'digit1', text: cueLines.digit1, voice: RADIO, fx: true },
  ...flowNarrations.map(([hash, text]) => ({ file: `n-${hash}`, text, voice: NARRATOR })),
];

for (const job of jobs) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${job.voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) throw new Error(`${job.file}: ${res.status} ${await res.text()}`);
  const mp3 = join(CUES, `${job.file}.el.mp3`);
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));

  const wav = join(CUES, `${job.file}.el.wav`);
  execFileSync('afconvert', [mp3, wav, '-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1']);
  if (job.fx) {
    const fxd = join(CUES, `${job.file}.fx.wav`);
    execFileSync('python3', [join(ROOT, 'scripts/radiofx.py'), wav, fxd, ...(job.beep ? ['--beep'] : [])]);
    rmSync(wav);
    execFileSync('afconvert', [fxd, join(CUES, `${job.file}.m4a`), '-f', 'm4af', '-d', 'aac', '-b', '32000', '-c', '1']);
    rmSync(fxd);
  } else {
    execFileSync('afconvert', [wav, join(CUES, `${job.file}.m4a`), '-f', 'm4af', '-d', 'aac', '-b', '32000', '-c', '1']);
    rmSync(wav);
  }
  rmSync(mp3);
  console.log(`${job.file}.m4a  (${job.voice === RADIO ? 'Brian/radio' : 'Eric'}${job.beep ? ' +quindar' : ''})`);
}

/* The manifests keep their TEXT truth (the drift tests pin that); this
   records which files carry real takes now. */
const note = { renderedAt: new Date().toISOString(), radio: 'Brian', narrator: 'Eric', files: jobs.map((j) => j.file) };
writeFileSync(join(CUES, 'elevenlabs.json'), JSON.stringify(note, null, 2) + '\n');
if (!existsSync(join(CUES, 'elevenlabs.json'))) throw new Error('note not written');
console.log(`${jobs.length} real takes in place`);
