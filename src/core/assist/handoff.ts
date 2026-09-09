import { COMPOSER_SELECTORS, HANDOFF_ORIGINS } from './composer';

/**
 * V3.0 pass 5c — the SECOND sanctioned chrome seam (the first is
 * src/core/storage/client.ts, and CLAUDE.md's one architectural rule names
 * them both). The panel calls these two functions and nothing else; the
 * chrome surface they touch is exactly Tier 1's: `permissions` for the
 * in-context ask, `runtime.sendMessage` to hand the background the work.
 *
 * WHY THE REQUEST LIVES HERE AND NOT IN THE BACKGROUND: Chrome only honours
 * `permissions.request` inside a user gesture, and a message hop drops the
 * gesture. So the panel's own click asks, and the background — which needs
 * no gesture for tabs and scripting once the origin is granted — does the
 * finding and the injecting.
 */

/** Whether the hand-off is even a thing for this service (four origins,
 * GUARDRAILS' own list), and whether its origin is already granted. */
export async function handoffState(service: string): Promise<'granted' | 'askable' | 'none'> {
  const origin = HANDOFF_ORIGINS[service];
  if (!origin || !chrome?.permissions?.contains) return 'none';
  try {
    const has = await chrome.permissions.contains({ origins: [`${origin}*`] });
    return has ? 'granted' : 'askable';
  } catch {
    return 'none';
  }
}

/**
 * The click's own half: ask for the one origin (a user-gesture call), and
 * on a grant hand the background the injection errand. Resolves quickly and
 * quietly either way — the caller opened the tab with its anchor and the
 * prompt is on the clipboard, so a false here means nothing more than
 * "the shortcut is not running"; the degradation law wants no banner.
 */
export async function requestHandoff(service: string, text: string): Promise<boolean> {
  const origin = HANDOFF_ORIGINS[service];
  if (!origin || !chrome?.permissions?.request) return false;
  try {
    const granted = await Promise.race<boolean>([
      chrome.permissions.request({ origins: [`${origin}*`] }),
      /* An environment that never answers (an automated browser with no
         prompt surface) must not hang the click. */
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    if (!granted) return false;
    void chrome.runtime.sendMessage({
      kind: 'wb:handoff',
      origin,
      selectors: COMPOSER_SELECTORS[service] ?? [],
      text,
    });
    return true;
  } catch {
    return false;
  }
}
