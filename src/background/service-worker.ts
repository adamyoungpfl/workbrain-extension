import { PAGE_INSERT } from './pageInsert';

/**
 * V3.0 pass 5c — the background's half of TIER 1 (the assisted hand-off).
 *
 * The panel's click opened the service's tab with a plain anchor and asked
 * for the one origin (core/assist/handoff.ts). What lands here is the
 * errand that needs no gesture: find that just-opened tab, wait for it to
 * finish arriving, and put the person's own prompt into the composer —
 * `PAGE_INSERT`, serialized whole into the page.
 *
 * EVERY exit is silent (docs/GUARDRAILS.md, degradation): no tab found,
 * page never finishes, composer selector misses every retry — the person
 * is exactly where copy-paste always put them, tab open and prompt on the
 * clipboard. Nothing is read back from the page: `PAGE_INSERT` returns
 * only whether it landed, and the reply text could not reach us if it
 * wanted to — the injection runs once per retry and observes nothing.
 */

const RETRIES = 10;
const RETRY_MS = 1200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function newestTabFor(origin: string): Promise<number | undefined> {
  try {
    const tabs = await chrome.tabs.query({ url: `${origin}*` });
    const newest = tabs.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    return newest?.id ?? undefined;
  } catch {
    return undefined;
  }
}

async function inject(origin: string, selectors: string[], text: string): Promise<void> {
  if (selectors.length === 0) return;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    await sleep(RETRY_MS);
    const tabId = await newestTabFor(origin);
    if (tabId === undefined) continue;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: PAGE_INSERT,
        args: [selectors, text],
      });
      if (results.some((r) => r.result === true)) return;
    } catch {
      /* Tab mid-navigation, or closed between query and inject — the next
         retry re-queries; the budget runs out quietly. */
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  const m = message as { kind?: string; origin?: string; selectors?: string[]; text?: string };
  if (m?.kind !== 'wb:handoff') return;
  if (typeof m.origin !== 'string' || typeof m.text !== 'string' || !Array.isArray(m.selectors)) return;
  void inject(m.origin, m.selectors, m.text);
});
