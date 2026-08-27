import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_VERSION, buildLabel } from './build';

/**
 * BS-00. The stamp is one fact with two readers — the manifest Chrome
 * installs, and the panel a tester is looking at. These tests exist to make a
 * drift between them impossible to ship, because the day it matters is the day
 * somebody reports a bug against a build nobody can identify.
 *
 * `manifest.config.ts` is read as TEXT rather than imported. Importing it
 * pulls @crxjs/vite-plugin — and esbuild with it — into jsdom, which is
 * exactly what vitest.config.ts's own header says it keeps out of the test
 * context. Reading the literal proves the same thing without the pipeline.
 *
 * Resolved from the working directory rather than from `import.meta.url`:
 * under jsdom that is not a `file:` URL, and `readFileSync` refuses it. Vitest
 * runs from the repo root, which is where the manifest lives.
 */
const manifestSource = readFileSync(resolve(process.cwd(), 'manifest.config.ts'), 'utf8');

describe('the build stamp', () => {
  it('is the manifest version, not a second constant that could drift', () => {
    const declared = /export const VERSION = '([^']+)'/.exec(manifestSource)?.[1];
    expect(declared, 'manifest.config.ts no longer exports a VERSION literal').toBeDefined();
    expect(BUILD_VERSION).toBe(declared);
  });

  it('is the version the manifest actually ships, not a stale copy beside it', () => {
    // The manifest must USE the constant. A hand-typed version field next to
    // an exported constant is the drift this whole task exists to prevent.
    expect(manifestSource).toMatch(/version: VERSION,/);
  });

  it('is a real three-part version, so it sorts and the store accepts it', () => {
    expect(BUILD_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is past 0.x — the round the documents have been calling it since V2.9', () => {
    // 0.1.0 shipped while every doc said V2.9. The number a tester can read
    // off chrome://extensions now matches the number in the doc trail.
    const [major] = BUILD_VERSION.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(2);
  });

  it('labels the build with the version itself, and takes an override for tests', () => {
    expect(buildLabel()).toBe(BUILD_VERSION);
    expect(buildLabel('1.2.3')).toBe('1.2.3');
  });
});
