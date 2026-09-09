import { defineManifest } from '@crxjs/vite-plugin';

/**
 * Release 1: `storage` and `sidePanel` ONLY.
 *
 * Host permissions are optional and requested at the moment the person clicks something
 * that needs them — never at install. See docs/GUARDRAILS.md, permission tiers.
 * Adding anything here requires an entry in GUARDRAILS.md explaining why.
 */
/**
 * BS-00 — THE ONE PLACE THE BUILD NUMBER LIVES.
 *
 * The manifest is authoritative: it is what Chrome installs and what a tester
 * can read off `chrome://extensions`. `vite.config.ts` imports this constant
 * to define `__WB_VERSION__`, so the number the panel prints and the number
 * the browser holds are the same by construction rather than by discipline.
 * `package.json`'s version is cosmetic — the package is `private` and never
 * published — but it is kept in step so nothing in the repo disagrees.
 *
 * 0.1.0 until the beta sprint, while every document said V2.9. A build a
 * tester cannot identify makes their report unactionable, which is the whole
 * reason this constant exists.
 */
export const VERSION = '2.9.0';

export default defineManifest({
  manifest_version: 3,
  name: 'Workbrain',
  short_name: 'Workbrain',
  version: VERSION,
  description:
    'Build a file that tells any AI who you are and how you work — so you stop re-explaining yourself.',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },

  permissions: ['storage', 'sidePanel'],

  /* Pass 5c - Tier 1's API half. OPTIONAL like the origins below: nothing
     at install, requested by the same in-context click (GUARDRAILS' tier
     table is the entry for this line). */
  optional_permissions: ['scripting'],

  // Release 4 only, and optional even then.
  optional_host_permissions: [
    'https://chatgpt.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://copilot.microsoft.com/*',
  ],

  side_panel: { default_path: 'panel.html' },
  action: { default_title: 'Workbrain' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },

  // No remote code, no CDN, no dynamic import of a URL. MV3 forbids it and the store enforces it.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
});
