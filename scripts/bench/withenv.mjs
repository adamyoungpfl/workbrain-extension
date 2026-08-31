#!/usr/bin/env node
/**
 * Loads ONLY the benchmark's API keys out of an env file and execs the runner
 * with them, without printing any of them.
 *
 *   node scripts/bench/withenv.mjs ../modelcitizen/.env.local -- <cmd> [args]
 *
 * A shell `source` on a real .env is not safe for this: the file has comments,
 * bare words and values with spaces, and the shell reports every one of them
 * as a command-not-found error — which on 2026-08-31 printed a Resend key into
 * a terminal. This reads the file, keeps the keys it was asked for, and passes
 * nothing else on.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [file, ...rest] = process.argv.slice(2);
const at = rest.indexOf('--');
const cmd = rest.slice(at + 1);

const WANTED = [
  'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY',
  'OPENAI_API_KEY', 'CHATGPT_API_KEY',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY',
];

const env = { ...process.env };
const found = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  const [, name, raw] = m;
  if (!WANTED.includes(name)) continue;
  const value = raw.trim().replace(/^["']|["']$/g, '');
  if (!value || value.startsWith('your-') || value.length < 12) continue;
  env[name] = value;
  found.push(name);
}
console.log(`  loaded ${found.length} key(s): ${found.join(', ') || '(none)'}`);

const r = spawnSync(cmd[0], cmd.slice(1), { env, stdio: 'inherit' });
process.exit(r.status ?? 1);
