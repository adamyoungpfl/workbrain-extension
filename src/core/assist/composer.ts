/**
 * V3.0 pass 5c — TIER 1, THE ASSISTED HAND-OFF (docs/GUARDRAILS.md's own
 * permission table: "Write to the composer on four named AI origins —
 * requested when they click 'put it in <AI> for me'").
 *
 * This module is the PURE half: which origins are sanctioned, which
 * selectors find each service's composer, and the page-side insert logic.
 * No chrome.*, no imports into the injected function — `PAGE_INSERT` is
 * serialized whole by chrome.scripting.executeScript, so it must stand on
 * page globals alone (and is unit-tested against jsdom's).
 *
 * THE RAILS, restated where the code lives:
 *  - We PASTE; the person SENDS. The prompt lands visibly in the composer
 *    and the send stays theirs — that is what keeps "never to their AI
 *    without them seeing the exact text first" true.
 *  - Selectors are brittle BY NATURE. A miss returns false and the caller
 *    does nothing: the tab is open and the prompt is on the clipboard —
 *    the copy-paste path this feature merely shortens (the degradation
 *    law's own row).
 *  - Four named origins and no more (GUARDRAILS: "No `scripting` beyond
 *    the four named AI origins"). grok/perplexity have doors in
 *    ASSIST_SERVICE_URLS but no hand-off: they open plainly.
 */

/** The four sanctioned origins, keyed by the one service list's own keys. */
export const HANDOFF_ORIGINS: Record<string, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/',
  copilot: 'https://copilot.microsoft.com/',
};

/**
 * Composer selectors per service, tried in order. First match wins; a
 * redesign that empties the list simply returns the person to copy-paste.
 * [DRAFT] — these are the services' current composers, checked 2026-09-09.
 */
export const COMPOSER_SELECTORS: Record<string, string[]> = {
  chatgpt: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
  claude: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'],
  gemini: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]'],
  copilot: ['textarea#userInput', 'textarea', 'div[contenteditable="true"]'],
};

/* PAGE_INSERT lives in src/background/pageInsert.ts - it is DOM code by
   nature (it runs inside the service's page), and core must run without a
   browser. The data above is the pure half both sides share. */
