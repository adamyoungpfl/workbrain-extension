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
 * Returns whether a card was actually dismissed, so a caller that wants to
 * assert on the card can still tell.
 */
export async function pastRunCard(page: Page): Promise<boolean> {
  if ((await page.locator('.runcard').count()) === 0) return false;
  await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
  await page.locator('.runcard').waitFor({ state: 'detached' });
  return true;
}
