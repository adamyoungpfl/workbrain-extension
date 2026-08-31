#!/usr/bin/env node
/**
 * Guardrail audit. Turns docs/GUARDRAILS.md from prose an agent may drift past
 * into a check that fails the build. Runs as part of `npm run check`.
 *
 * Adding a rule here is cheaper than catching the same drift in review twice.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const fails = [];
const warns = [];
const fail = (rule, detail) => fails.push(`${rule}\n    ${detail}`);
const warn = (rule, detail) => warns.push(`${rule}\n    ${detail}`);

function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, e);
    if (/node_modules|dist|\.git/.test(rel)) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
/** strip comments so a rule named in a comment does not trip the rule */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = walk('src').concat(walk('scripts'), ['manifest.config.ts', 'package.json']);
const ts = files.filter((f) => ['.ts', '.tsx'].includes(extname(f)));
const css = files.filter((f) => extname(f) === '.css');

// 1 ─ runtime dependencies
{
  const deps = Object.keys(JSON.parse(read('package.json')).dependencies ?? {});
  const allowed = ['react', 'react-dom'];
  const extra = deps.filter((d) => !allowed.includes(d));
  if (extra.length)
    fail('Runtime dependencies', `unexpected: ${extra.join(', ')} — see docs/DEPENDENCIES.md`);
}

// 2 ─ colour literals only in the generated token file
for (const f of css) {
  if (f.endsWith('tokens.css')) continue;
  const hits = read(f).match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hits) fail('Colour literal outside tokens.css', `${f}: ${[...new Set(hits)].join(' ')}`);
}

// 3 ─ core/ purity: no chrome.*, no DOM, outside the one storage module
for (const f of ts) {
  if (!f.startsWith('src/core/') || f.includes('.test.')) continue;
  const src = code(read(f));
  if (/\bchrome\./.test(src) && !f.startsWith('src/core/storage/'))
    fail('core/ purity', `${f} touches chrome.* — move it behind core/storage`);
  if (/\b(document|window)\./.test(src))
    fail('core/ purity', `${f} touches the DOM — core must run without a browser`);
}

// 4 ─ manifest permissions
{
  const m = code(read('manifest.config.ts'));
  const perms = (m.match(/permissions:\s*\[([^\]]*)\]/) ?? [, ''])[1];
  const got = [...perms.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  if (JSON.stringify(got) !== JSON.stringify(['sidePanel', 'storage']))
    fail('Manifest permissions', `expected storage + sidePanel only, got: ${got.join(', ')}`);
  if (/(^|[^_])host_permissions/.test(m))
    fail('Manifest permissions', 'host_permissions must be optional_host_permissions only');
}

// 5 ─ no telemetry, no network from the panel
for (const f of ts) {
  const src = code(read(f));
  if (f.includes('.test.')) continue;
  const t = src.match(/\b(Sentry|amplitude|mixpanel|gtag|sendBeacon|posthog|datadog)\b/i);
  if (t) fail('Telemetry', `${f}: ${t[0]} — zero collection, not minimal (docs/GUARDRAILS.md)`);
  /* The rule is about the SHIPPED BUNDLE, and `scripts/` is not in it.
     `scripts/bench/api.ts` calls three model APIs to run the file benchmark
     (docs/FILE-VALIDATION.md); store-shots and copy-shots drive a browser.
     None of them is importable from `src/`, none appears in `dist/`, and the
     benchmark runs against a synthetic persona rather than anybody's file.

     The exclusion is deliberately for `scripts/bench/` alone rather than all of
     `scripts/`: a build script that grew a fetch would still be worth stopping,
     and the narrower rule is the one that keeps catching things. */
  const devTooling = f.startsWith('scripts/bench/');
  if (/\bfetch\s*\(/.test(src) && !f.startsWith('src/core/packs/') && !devTooling)
    fail('Network', `${f} calls fetch — only core/packs may, through an injected client`);
}

// 6 ─ no modals, no HTML injection
for (const f of ts) {
  const src = code(read(f));
  const m = src.match(/window\.confirm|window\.alert|dangerouslySetInnerHTML|\.innerHTML\s*=/);
  if (m) fail('Forbidden pattern', `${f}: ${m[0]} — sheets only, and packs render as text`);
}

// 7 ─ user-facing copy lives in strings.ts
for (const f of ts) {
  if (!f.startsWith('src/panel/') || f.includes('.test.') || f.endsWith('strings.ts')) continue;
  for (const [, lit] of code(read(f)).matchAll(/["'`]([A-Z][a-z]+(?: [a-z']+){2,}[.?!]?)["'`]/g)) {
    warn('Copy outside strings.ts', `${f}: "${lit}" — add it to src/panel/strings.ts`);
  }
}

// 8 ─ reading level of the copy we ship
{
  const src = read('src/panel/strings.ts');
  const lits = [...src.matchAll(/['"`]([^'"`\n]{25,})['"`]/g)].map((m) => m[1])
    .filter((s) => /[a-z] [a-z]/.test(s) && !s.includes('://'));
  const syl = (w) => {
    const m = w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, m ? m.length : 1);
  };
  let words = 0, sentences = 0, syllables = 0;
  for (const s of lits) {
    const ws = s.split(/\s+/).filter(Boolean);
    words += ws.length;
    sentences += Math.max(1, (s.match(/[.?!]/g) ?? []).length);
    for (const w of ws) syllables += syl(w);
  }
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  const g = grade.toFixed(1);
  if (grade > 8) warn('Reading level', `strings.ts reads at grade ${g} — target is 7`);
  else console.log(`  reading level: grade ${g} across ${lits.length} strings`);
}

// ─────────────────────────────────────────────────────────────────────
const label = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
if (warns.length) {
  console.log(`\n⚠  ${label(warns.length, 'warning')}\n`);
  for (const w of warns) console.log('  ' + w + '\n');
}
if (fails.length) {
  console.error(`\n✗  ${label(fails.length, 'guardrail')} broken\n`);
  for (const f of fails) console.error('  ' + f + '\n');
  console.error('  See docs/GUARDRAILS.md. If a rule is genuinely wrong, change it there first.\n');
  process.exit(1);
}
console.log(`\n✓  guardrails clean (${files.length} files)\n`);
