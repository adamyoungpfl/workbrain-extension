import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE SUITE OWNS ITS OWN BUNDLE (2026-09-02). Three gates in one day came
 * back red with the same signature — `wbVoices` in the production scan,
 * dev-mode timing failures beside it — because `npm run build:dev`
 * (dogfooding, rightly) rewrote `dist/` while the e2e phase was mid-flight.
 * The suite and the person can not share a mutable directory, so the suite
 * stops trying: every Playwright run builds a production bundle into
 * `dist-e2e/` and every spec loads that. `dist/` belongs to the human.
 *
 * Cost: one ~0.5s vite build per invocation. Worth it the first time it
 * saves a 25-minute gate from a poisoned red.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default function globalSetup(): void {
  const out = path.join(ROOT, 'dist-e2e');
  const built = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    throw new Error(`e2e bundle build failed:\n${built.stderr || built.stdout}`);
  }
  process.env.WB_E2E_DIST = out;
}
