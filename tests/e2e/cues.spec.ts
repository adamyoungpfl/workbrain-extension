import { test, expect } from '@playwright/test';

/**
 * R1-08 accept criteria: "engine tests pass; with prefers-reduced-motion:
 * reduce, every cue still visibly marks its target." engine.test.ts,
 * verbs.test.ts, registry.test.tsx, Pointer.test.tsx and useCueChain.test.tsx
 * (all in src/panel/cues/) cover the first half in jsdom, per docs/TESTING.md
 * §2. This file is the real-browser half — the actual lesson this repo's
 * session notes call out: passing unit tests are not proof of a working
 * feature. It drives the cue demo section in tests/e2e/fixtures/harness.tsx
 * (see CueEngineDemo there) rather than the built extension's panel.html,
 * because R1-08 is engine-only — no real chain exists anywhere in the
 * ported flow data yet (see the module doc comment in
 * src/panel/cues/engine.ts) — so there is nothing for panel.html to show.
 */

const CHOICE_A = '[data-testid="cue-choice-a"]';
const NEXT = '[data-testid="cue-next"]';
const FIELD = '[data-testid="cue-field"]';
const DOWNLOAD = '[data-testid="cue-download"]';

test.describe('cue engine (R1-08)', () => {
  test('the chain advances exactly one link per matching event, and an unrelated event does nothing', async ({
    page,
  }) => {
    await page.goto('/harness.html');
    const choiceA = page.locator(CHOICE_A);
    const next = page.locator(NEXT);
    const download = page.locator(DOWNLOAD);

    // Link 0 plays on mount: the three choices sweep.
    await expect(choiceA).toHaveClass(/cue-sweep/);
    await expect(next).not.toHaveClass(/cue-ring/);

    // An event link 0 isn't waiting for (it wants 'choice') changes nothing.
    await download.click();
    await expect(choiceA).toHaveClass(/cue-sweep/);
    await expect(next).not.toHaveClass(/cue-ring/);
    await expect(download).not.toHaveClass(/cue-bob/);

    // The matching event advances exactly one link: sweep clears, ring appears.
    await choiceA.click();
    await expect(choiceA).not.toHaveClass(/cue-sweep/);
    await expect(next).toHaveClass(/cue-ring/);

    // Same again: an unrelated event (choice) does nothing on link 1.
    await choiceA.click();
    await expect(next).toHaveClass(/cue-ring/);

    await next.click();
    await expect(next).not.toHaveClass(/cue-ring/);
  });

  test('the `point` cue draws an overlay toward its same-document target with the right label, and the `say` text is announced', async ({
    page,
  }) => {
    await page.goto('/harness.html');
    await page.locator(CHOICE_A).click();
    await page.locator(NEXT).click();

    // Link 2: focus:cue-demo-field + point:cue-demo-attach|Attach it here.
    await expect(page.locator(FIELD)).toBeFocused();
    await expect(page.locator('.cue-pointer-path')).toBeVisible();
    await expect(page.locator('.cue-pointer-label')).toHaveText('Attach it here');
    await expect(page.locator('.cue-announcer')).toHaveText(
      'Type in the field, then look for the highlighted target.',
    );

    // Advancing past it clears the overlay.
    await page.locator(FIELD).fill('anything');
    await expect(page.locator('.cue-pointer-path')).toHaveCount(0);
  });

  test('the final link marks two targets at once (ringViolet + bob), and finishing the chain clears everything', async ({
    page,
  }) => {
    await page.goto('/harness.html');
    await page.locator(CHOICE_A).click();
    await page.locator(NEXT).click();
    await page.locator(FIELD).fill('anything');

    await expect(page.locator(NEXT)).toHaveClass(/cue-ring-v/);
    await expect(page.locator(DOWNLOAD)).toHaveClass(/cue-bob/);

    // `force: true`: Download is genuinely animating (cue-bob's translateY
    // bob) at this point, which is the whole feature under test — Playwright
    // treats a moving target as "not stable" and refuses a plain click, so
    // this bypasses that actionability check rather than the feature.
    await page.locator(DOWNLOAD).click({ force: true });
    await expect(page.locator(NEXT)).not.toHaveClass(/cue-ring-v/);
    await expect(page.locator(DOWNLOAD)).not.toHaveClass(/cue-bob/);
    await expect(page.locator('.cue-announcer')).toHaveText('');
  });

  test('reduced motion: every verb the chain plays still visibly marks its target, not merely with its animation removed', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness.html');

    const choiceA = page.locator(CHOICE_A);
    // sweep, reduced: the CSS animation is off, but a static tint (a real,
    // non-'none' box-shadow) still marks the target.
    await expect(choiceA).toHaveClass(/cue-reduced/);
    const sweepShadow = await choiceA.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(sweepShadow).not.toBe('none');
    const sweepAnimation = await choiceA.evaluate((el) => getComputedStyle(el, '::after').animationName);
    expect(sweepAnimation).toBe('none');

    // ring, reduced: fixed halo, not a pulsing one.
    await choiceA.click();
    const next = page.locator(NEXT);
    await expect(next).toHaveClass(/cue-reduced/);
    expect(await next.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await next.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');

    // link 2 (focus + point), reduced: the pointer overlay's path/ring have
    // no animation under reduced motion, but — unlike the class-based
    // verbs — nothing about that ever required a still-form fallback for
    // Pointer.tsx in the first place: its ring's radius/opacity are plain
    // SVG attributes, not animation-only values, so turning the animation
    // off leaves a perfectly static, fully visible circle for free (see
    // Pointer.css's comment). Checked here while link 2 is still current —
    // once the field is filled, the chain advances past it and the overlay
    // is gone, by design.
    await next.click();
    expect(await page.locator('.cue-pointer-path').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    );
    await expect(page.locator('.cue-pointer-path')).toBeVisible();
    await expect(page.locator('.cue-pointer-ring')).toBeVisible();

    // ringViolet + bob, reduced: both targets still carry a real, visible
    // still-mark, not just "animation: none" and nothing else.
    await page.locator(FIELD).fill('anything');
    const download = page.locator(DOWNLOAD);
    await expect(next).toHaveClass(/cue-reduced/); // now ring-v
    await expect(download).toHaveClass(/cue-reduced/); // now bob
    expect(await next.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    expect(await download.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });

  test('a page.* point target parses without throwing but never draws an overlay — no host permission this release (docs/RELEASE-1.md out-of-scope list)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    // tests/e2e/fixtures/harness.tsx's CrossSurfacePointerDemo plays a
    // point:page.demo-composer cue immediately on mount — a real chain
    // running in a real browser, not a mock. It must render no overlay at
    // all, and must not have thrown getting there.
    await page.goto('/harness.html');
    const crossSurface = page.locator('[data-testid="cue-cross-surface"]');
    await expect(crossSurface.locator('svg')).toHaveCount(0);
    await expect(crossSurface.locator('.cue-pointer-label')).toHaveCount(0);
    expect(errors).toEqual([]);

    // And it isn't simply "nothing loaded" — the same-document demo chain
    // elsewhere on the page does draw a real pointer once it reaches its
    // own point cue, proving Pointer.tsx itself works; only the page.*
    // target is refused.
    await page.locator(CHOICE_A).click();
    await page.locator(NEXT).click();
    await expect(page.locator('.cue-pointer-path')).toBeVisible();
  });
});
