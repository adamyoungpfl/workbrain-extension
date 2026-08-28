import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawerShowsStatus } from '../../../src/core/drawer/height';

/**
 * BS-07a (§7.1) — put the drawer where there is a list.
 *
 * §7.1 replaced the peek's sliced list with one status line: "a row reading 0
 * of 6 and 0% under a trail that already names the section" is three ways of
 * saying nothing, and it is the first thing somebody meets. Below two whole
 * rows the drawer is not a list, and `core/drawer/height.ts` says so.
 *
 * Thirteen specs opened the drawer at its resting peek and immediately waited
 * for `.filetree-row`. That was never really their subject — every one of them
 * is about what a ROW says, or about the tree, or about the globe beside it —
 * so they were relying on the peek happening to show one. This helper makes
 * the precondition explicit: grow the drawer until there is a list, then test
 * the list.
 *
 * The keyboard, not a drag: the handle's arrow keys move the drawer by a known
 * step, and a drag depends on where the handle happens to be painted, which is
 * the thing several of these specs are separately measuring.
 */
export async function openPastPeek(page: Page): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  await handle.waitFor();
  await handle.focus();
  for (let guard = 0; guard < 20; guard++) {
    const height = await page.$eval('.filedrawer', (el) => Math.round(el.getBoundingClientRect().height));
    if (!drawerShowsStatus(height)) break;
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(60);
  }
  // Park the pointer and hand focus back: a stationary hover holds rotating
  // cues by design, and a spec that starts with focus on the drawer's handle
  // is a spec whose first Tab goes somewhere it did not mean.
  await page.mouse.move(0, 0);
  await handle.blur();
  await expect(page.locator('.filetree-row').first()).toBeVisible();
}
