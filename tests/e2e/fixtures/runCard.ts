import type { Page } from '@playwright/test';
import { S } from '../../../src/panel/strings';

/**
 * BS-05d — walk past a run's payoff card if one is up.
 *
 * The interview gained an interstitial: at the end of a run of four or more
 * questions the panel stops and says what just landed in the file, with
 * three real choices. Every spec that WALKS the interview meets it, exactly
 * as every walker already meets V1.1 VB-05's module transitions.
 *
 * Shared rather than duplicated per spec — the repo's fixtures-live-with-
 * their-spec convention is about DATA, whose shape a spec is often making a
 * claim about. This is neither: it is the same three lines fourteen walkers
 * would otherwise carry copies of, and a copy that drifts is a walker that
 * silently stops testing what it says it tests.
 *
 * Drains CONSECUTIVE cards, because two can land back to back: the answer
 * that finishes a file can close a run and end a repeatable block in the
 * same press. A caller that wants to inspect a particular card — only
 * run-card.spec.ts does — should not use this helper.
 *
 * Returns whether anything was dismissed, so a caller can still tell.
 */
export async function pastRunCard(page: Page): Promise<boolean> {
  if ((await page.locator('.runcard').count()) === 0) return false;
  for (let guard = 0; guard < 4 && (await page.locator('.runcard').count()); guard++) {
    await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
    // A beat, not a detach-wait: the NEXT card can mount in the same
    // frame the last one leaves, and a detach-wait would race it.
    await page.waitForTimeout(300);
  }
  // PARK THE POINTER, the house rule for any click that swaps the screen
  // (V2.5 VB-117, and the orb-choice precedent). Dismissing the card leaves
  // the cursor exactly where the next question's rotating follow-up link
  // renders, and a stationary hover is a HOLD by design — which is how this
  // helper first made three rotation tests fail while looking innocent.
  await page.mouse.move(0, 0);
  return true;
}
