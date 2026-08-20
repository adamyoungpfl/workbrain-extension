import { defineManifest } from '@crxjs/vite-plugin';

/**
 * Release 1: `storage` and `sidePanel` ONLY.
 *
 * Host permissions are optional and requested at the moment the person clicks something
 * that needs them — never at install. See docs/GUARDRAILS.md, permission tiers.
 * Adding anything here requires an entry in GUARDRAILS.md explaining why.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'Workbrain',
  short_name: 'Workbrain',
  version: '0.1.0',
  description:
    'Build a file that tells any AI who you are and how you work — so you stop re-explaining yourself.',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },

  permissions: ['storage', 'sidePanel'],

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
