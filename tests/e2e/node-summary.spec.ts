import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';

/**
 * V1.5 VB-27 — the node summary, driven in a real browser.
 *
 * The unit tests own the fold (core/flow/nodeSummary.test.ts) and the markup
 * (components/NodeSummary.test.tsx). Everything this feature can actually fail
 * at needs a browser, and most of it needs a *pointer*:
 *
 *   - that hovering really opens it, with nothing focused;
 *   - that focusing really opens it, with nothing hovered;
 *   - that a TAP opens it and does not open the split, which is the only entry
 *     path a touch screen has and the one a hover-only build silently loses;
 *   - that Escape closes it and leaves focus exactly where it was;
 *   - that Tab goes straight past it — there is no trap;
 *   - and that the card never lands on top of the node it is describing.
 *
 * Scans tests/e2e/fixtures/brain-globe.tsx at the panel's own 400px, in its
 * `rich` model — a finished file with three real roles and one recommendation
 * the real engine produced from a real stamp.
 */

const PANEL = { width: 400, height: 700 };

async function open(page: Page, model: 'half' | 'rich' = 'rich', stage?: number): Promise<void> {
  await page.setViewportSize(PANEL);
  await page.goto(`/brain-globe.html?model=${model}${stage ? `&stage=${stage}` : ''}`);
  await page.waitForSelector('.brainglobe');
}

/** Into `2. About Me`, the one section with sub-nodes, by keyboard — so the
 * pointer is still parked at 0,0 and "hover" means something in these tests. */
async function flyIntoAboutMe(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('1.000');
  await expect(page.locator('.brainglobe-child-node')).toHaveCount(5);
}

const pin = (page: Page, id: string): Locator => page.locator(`.brainglobe-pin[data-child-id="${id}"]`);
const card = (page: Page): Locator => page.locator('.nodesummary');

/** Where the ORB is — not the 44px hit box around it. The card may sit over a
 * node's label (it reprints the same name in full); it may never sit over the
 * node itself. */
const orbBox = (page: Page, id: string) =>
  page.locator(`.brainglobe-child-node[data-child-id="${id}"] .brainglobe-sphere`).boundingBox();

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// ── The three ways in, each on its own ──────────────────────────────────────

test.describe('VB-27 — hover', () => {
  test('opens the summary with nothing focused at all', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    // Focus is on the section pin, not on any sub-node — so whatever opens
    // below was opened by the pointer and by nothing else.
    await expect(pin(page, 'sec2-1')).not.toBeFocused();

    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-1');
    await expect(pin(page, 'sec2-1')).not.toBeFocused();

    // The real content of the real node: its file name, its record count, and
    // the distribution across "who is this role for".
    await expect(card(page).locator('.nodesummary-name')).toHaveText('2.1 Roles');
    await expect(card(page).locator('.nodesummary-count')).toContainText('3 things named here');
    await expect(card(page).locator('.nodesummary-cat')).toHaveText([
      'Clients — 1',
      'My community — 1',
      'My employer — 1',
    ]);
  });

  test('closes when the pointer leaves, and swaps to the node the pointer arrives at', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-1');

    await pin(page, 'sec2-2').hover();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-2');

    // Off every node: the card goes, after the 120ms grace that lets a pointer
    // travel onto the card itself (WCAG 1.4.13).
    await page.mouse.move(2, 2);
    await expect(card(page)).toHaveCount(0);
  });

  test('stays open while the pointer rests on the card — WCAG 1.4.13, hoverable', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();

    const box = (await card(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Long enough that the close timer would have fired several times over.
    await page.waitForTimeout(600);
    await expect(card(page)).toBeVisible();
  });

  test('lets go once the pointer leaves the card for empty stage', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    const box = (await card(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    await expect(card(page)).toBeVisible();

    // Off the card, onto a bare part of the stage — no node under the cursor,
    // nothing holding it open any more.
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    await page.mouse.move(stage.x + 12, stage.y + stage.height - 4);
    await expect(card(page)).toHaveCount(0);
  });

  test('a node with nothing in it shows no summary at all — never an empty one', async ({ page }) => {
    // The `half` model: three roles written, and nothing yet in 2.2–2.5.
    await open(page, 'half');
    await flyIntoAboutMe(page);

    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();

    await pin(page, 'sec2-4').hover();
    await expect(card(page)).toHaveCount(0);
    await expect(pin(page, 'sec2-4')).toHaveAttribute('data-has-summary', 'false');
  });
});

test.describe('VB-27 — keyboard focus', () => {
  test('opens the summary with the pointer nowhere near it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    // The pointer has never been moved in this test: 0,0, outside the stage.
    await expect(card(page)).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(pin(page, 'sec2-1')).toBeFocused();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-1');
  });

  test('the node says the card describes it, so a screen reader hears the same summary', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');

    const describedBy = await pin(page, 'sec2-1').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toHaveClass(/nodesummary/);
    await expect(page.locator(`#${describedBy}`)).toHaveAttribute('role', 'tooltip');
  });

  test('Tab goes straight past it to the next node — nothing to trap', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Tab');
    // The next sub-node, not the card, and not a stop inside it.
    await expect(pin(page, 'sec2-2')).toBeFocused();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-2');

    // And all the way out of the globe, still with nothing in the way.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.brainglobe'))).toBe(false);
    await expect(card(page)).toHaveCount(0);
  });

  test('Enter still picks the node, exactly as it did before this existed', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    // The split's own panel says everything the card said and more, in the
    // same place. Two of them at once would be the node described twice.
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('.leafcard')).toBeVisible();
  });
});

test.describe('VB-27 — activation, on a screen with no pointer to hover with', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('the first tap opens the summary and does NOT open the split; the second tap picks', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    await pin(page, 'sec2-1').tap();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-node-id', 'sec2-1');
    // Still on the ring: the tap was spent on the summary, deliberately.
    expect(await page.locator('.brainglobe').getAttribute('data-split')).toBe('0.000');
    await expect(page.locator('.leafcard')).toHaveCount(0);

    await pin(page, 'sec2-1').tap();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(page.locator('.leafcard')).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });

  test('a node with nothing in it is picked by the first tap — there is no summary to spend it on', async ({ page }) => {
    await open(page, 'half');
    await flyIntoAboutMe(page);

    await pin(page, 'sec2-4').tap();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
  });
});

test.describe('VB-27 — a mouse is unchanged', () => {
  test('one click still picks the node: hover opened the card before the click landed', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    await pin(page, 'sec2-1').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(page.locator('.leafcard')).toBeVisible();
  });
});

// ── Escape ─────────────────────────────────────────────────────────────────

test.describe('VB-27 — Escape', () => {
  test('closes the summary and moves nothing', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    // Focus is exactly where it was, on the node the card belonged to.
    await expect(pin(page, 'sec2-1')).toBeFocused();
    await expect(pin(page, 'sec2-1')).not.toHaveAttribute('aria-describedby', /.*/);
    // Still inside the section, still on the ring — one rung, not three.
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');
    await expect(page.locator('.brainglobe-pin.is-child:not([hidden])')).toHaveCount(5);
  });

  test('stays dismissed: sitting still does not bring it back', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await page.waitForTimeout(400);
    // The pointer is still on the node and focus has not moved. Neither of
    // those is an event, and the card opens on events.
    await expect(card(page)).toHaveCount(0);
  });

  test('stays dismissed while the pointer stays on the node, even as it moves', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    const node = (await pin(page, 'sec2-1').boundingBox())!;
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);

    // Still on the same node, and moving. A dismissal that a twitch of the
    // mouse undoes is not a dismissal.
    await page.mouse.move(node.x + node.width / 2 + 3, node.y + node.height / 2 + 3);
    await page.mouse.move(node.x + node.width / 2 - 3, node.y + node.height / 2 - 3);
    await expect(card(page)).toHaveCount(0);

    // Off the node and back: a new question, and it answers.
    await page.mouse.move(2, 2);
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();
  });

  test('is the first rung: summary, then the section — and the ladder still works', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-inside'), { timeout: 3000 }).toBe('false');
  });

  test('closing the split does not reopen the summary underneath it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('0.000');
    // Focus went back to the sub-node, and a card appearing on the tail of a
    // dismissal is a dismissal that did not take.
    await expect(pin(page, 'sec2-1')).toBeFocused();
    await expect(card(page)).toHaveCount(0);
  });
});

// ── The recommendation ─────────────────────────────────────────────────────

test.describe('VB-27 — where recommendations attach', () => {
  test('the node carrying one shows it, in the engine\'s own words', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();

    const rec = card(page).locator('.nodesummary-rec');
    await expect(rec).toBeVisible();
    // Produced by core/recommend from a real 212-day-old stamp on a role
    // marked "current" — not a fixture string.
    await expect(rec).toHaveAttribute('data-rec-kind', 'role-stale');
    await expect(rec.locator('.nodesummary-rec-headline')).toHaveText('One part of your file is out of date');
    await expect(rec.locator('.nodesummary-rec-why')).toContainText('Manager / Team Lead');
    await expect(rec.locator('.nodesummary-rec-why')).toContainText('7 months ago');
  });

  test('says what would help and never what the person failed to do', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    const text = (await card(page).textContent())!;
    expect(text).not.toMatch(/only|fail|neglect|should have|you have not/i);
    // Real metrics, and no composite score anywhere on the card.
    expect(text).not.toMatch(/%|\bscore\b/i);
  });

  test('a node with items but no recommendation shows the summary and no offer', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-3').hover();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator('.nodesummary-rec')).toHaveCount(0);
  });
});

// ── Layout, at the panel's own width ───────────────────────────────────────

/**
 * 300 is the stage at a comfortable drawer height; 260 is the SMALLEST the
 * drawer ever opens Brain at (core/drawer/mode.ts), and it is where this card
 * has the least room. Checking only the roomy one would be checking the one
 * place it cannot fail.
 */
for (const stage of [300, 260]) {
  test.describe(`VB-27 — at a ${stage}px stage, it never covers the node it describes`, () => {
    for (const id of ['sec2-1', 'sec2-2', 'sec2-3', 'sec2-4', 'sec2-5']) {
      test(`${id}: clears the orb, stays inside the stage, and shows all of itself`, async ({ page }) => {
        await open(page, 'rich', stage);
        await flyIntoAboutMe(page);
        await pin(page, id).hover();
        await expect(card(page)).toBeVisible();

        const box = (await card(page).boundingBox())!;
        const orb = (await orbBox(page, id))!;
        const stageBox = (await page.locator('.brainglobe').boundingBox())!;

        expect(overlaps(box, orb), `${id}: the summary is sitting on its own node`).toBe(false);
        // Inside the stage, which clips: a card half off the bottom is a card
        // with half its content missing.
        expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 0.5);
        expect(box.y).toBeGreaterThanOrEqual(stageBox.y - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 0.5);
        // Composed, not cramped: it uses the width it has.
        expect(box.width).toBeGreaterThan(stageBox.width * 0.9);

        // The card is capped at the room between the stage's edge and the orb
        // (NodeSummary.css). That cap is what makes the line above true — so
        // this is the other half of it: nothing is actually being cut off by
        // it, at either size, on the fullest node in the file.
        const clipped = await card(page).evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(clipped, `${id}: ${clipped}px of the summary is cut off`).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe('VB-27 — hover means a pointer that moved', () => {
  /**
   * The stage rearranges under a stationary pointer: flying into a section
   * rings five nodes around the middle, and closing the split walks the
   * featured orb back out. Whatever slides under the cursor gets a
   * `pointerenter` it did nothing to earn.
   */
  test('a node sliding under a still pointer does not pop its summary', async ({ page }) => {
    await open(page);
    // Park the pointer over the middle of the stage BEFORE flying in, where a
    // sub-node will shortly arrive.
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height * 0.23);
    await flyIntoAboutMe(page);

    await page.waitForTimeout(300);
    await expect(card(page)).toHaveCount(0);

    // The same node, hovered on purpose, still opens.
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();
  });

  test('closing the split leaves no summary behind under the pointer', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    // Escape closes the split; the ring re-forms under a pointer that has not
    // moved. One more Escape must leave the section, not close a card nobody
    // asked for (VB-23's own ladder).
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('0.000');
    await expect(card(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-inside'), { timeout: 3000 }).toBe('false');
  });
});

test.describe('VB-27 — layout', () => {
  test('it never covers the way out of the section either', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    // The two lower sub-nodes are the ones whose card is pinned to the top.
    // V2.1 VB-74: `Back to the whole file` no longer lives up there — the way
    // out is the nav band above the picture — so the card's one remaining
    // duty at the top edge is staying inside the stage, which the geometry
    // suite already holds it to. What this keeps is that the card really
    // appears for the pinned-to-top pair.
    for (const id of ['sec2-3', 'sec2-4']) {
      await pin(page, id).hover();
      await expect(card(page)).toBeVisible();
    }
  });

  test('nothing about it makes the panel scroll sideways', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every line on it clears 4.5:1 against the card it is printed on', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await pin(page, 'sec2-1').hover();
    await expect(card(page)).toBeVisible();

    const measured = await card(page).evaluate((el) => {
      const background = getComputedStyle(el).backgroundColor;
      return [...el.querySelectorAll('p, li')].map((line) => ({
        text: (line.textContent ?? '').slice(0, 40),
        color: getComputedStyle(line).color,
        size: parseFloat(getComputedStyle(line).fontSize),
        background,
      }));
    });

    expect(measured.length).toBeGreaterThan(3);
    for (const line of measured) {
      const fg = parseCssColor(line.color)!;
      const bg = parseCssColor(line.background)!;
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `"${line.text}" measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      // Nothing on this card is smaller than the smallest text the product
      // draws anywhere else on the stage.
      expect(line.size, `"${line.text}" is ${line.size}px`).toBeGreaterThanOrEqual(10);
    }
  });
});

// ── Reduced motion ─────────────────────────────────────────────────────────

test.describe('VB-27 — reduced motion', () => {
  test('is the same card, with nothing to wait for', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await flyIntoAboutMe(page);
    await page.keyboard.press('Tab');

    // No transition to sit through: it is there, whole, on the first frame.
    await expect(card(page)).toBeVisible();
    const style = await card(page).evaluate((el) => {
      const computed = getComputedStyle(el);
      return { opacity: computed.opacity, transition: computed.transitionProperty };
    });
    expect(style.opacity).toBe('1');
    expect(style.transition === 'none' || style.transition === 'all').toBe(true);
    await expect(card(page).locator('.nodesummary-cat')).toHaveCount(3);
  });
});
