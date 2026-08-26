import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, isOpaque, over, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.9 VB-52 + VB-51's accessibility floor, on the real panel.
 *
 * THE THING AXE WILL NOT DO HERE, AND THE REASON THIS FILE EXISTS: two of the
 * three file chips are `aria-disabled`, and axe's contrast rule skips a
 * disabled control outright. docs/GUARDRAILS.md grants no such exemption — the
 * floor is 4.5:1 on text — and the text it skips is the filename of a locked
 * file and the sentence saying what unlocks it, which is the whole point of the
 * chips. So those colours are read back out of the browser and the ratio is
 * computed here, exactly as file-slots.a11y.spec.ts does for Home's locked rows,
 * where this treatment caught a real 2.0:1 failure. It inherits the job
 * file-toggle.a11y.spec.ts did for the strip this replaced.
 *
 * The rest is the floor as a whole: a WCAG scan of the drawer with the trail in
 * it — open and closed, because the open state is a different set of controls —
 * a full keyboard path, and the 44px target on every rung, every chip and both
 * icons in the bottom bar.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TARGET_MIN = 44;

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** Part-written, so the drawer has a real list under the trail. */
function partlyWritten(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    if (module.id === 'initiatives') break;
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const step: Step = node;
      const key = step.key ?? step.id;
      let value: AnswerValue;
      if (step.kind === 'intro') value = null;
      else if (step.kind === 'yesno') value = 'no';
      else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
      else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
      else value = `A test answer for ${step.id}.`;
      values[key] = value;
      answeredAt[key] = now;
      if (typeof value === 'string') reflectedAt[key] = now;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

async function openDrawer(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
  const page = await context.newPage();
  // Scanned still, for the reason every a11y spec here documents: axe measures
  // one instant, and an entrance animation passes through partial states.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: S.browseEdit, exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.crumbs');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
  return page;
}

/** The colour a piece of text is painted in and the colour it is painted on —
 * the same walk file-slots.a11y.spec.ts uses. */
async function inkAndGround(page: Page, selector: string): Promise<{ ink: Rgb; ground: Rgb }> {
  const read = await page.locator(selector).first().evaluate((el) => {
    const ink = getComputedStyle(el).color;
    const grounds: string[] = [];
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      grounds.push(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    grounds.push(getComputedStyle(document.body).backgroundColor, 'rgb(255, 255, 255)');
    return { ink, grounds };
  });

  const ink = parseCssColor(read.ink);
  if (!isOpaque(ink)) throw new Error(`text at ${selector} is not painted in an opaque colour`);
  const stack = read.grounds.map(parseCssColor);
  const firstOpaque = stack.findIndex((c) => isOpaque(c));
  let ground = stack[firstOpaque] as Rgb;
  for (let i = firstOpaque - 1; i >= 0; i--) {
    const layer = stack[i];
    if (layer) ground = over(layer, ground);
  }
  return { ink, ground };
}

test('axe finds no violations on the drawer, trail closed or open (VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);

  const closed = await new AxeBuilder({ page }).include('.filedrawer').withTags(WCAG).analyze();
  expect(closed.violations).toEqual([]);

  await page.locator('.crumbs-seg[data-seg="file"]').click();
  // The scan is only worth anything if the locked chips really rendered.
  await expect(page.locator('.crumbs-file[aria-disabled="true"]')).toHaveCount(2);
  const open = await new AxeBuilder({ page }).include('.filedrawer').withTags(WCAG).analyze();
  expect(open.violations).toEqual([]);

  await context.close();
});

test('every rung, chip and unlock line clears 4.5:1 on the drawer’s dark chrome (VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);

  for (const selector of ['.crumbs-seg[data-seg="work"]', '.crumbs-seg.is-here', '.crumbs-count']) {
    const { ink, ground } = await inkAndGround(page, selector);
    const ratio = contrastRatio(ink, ground);
    expect(ratio, `${selector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }

  await page.locator('.crumbs-seg[data-seg="file"]').click();
  for (const selector of [
    '.crumbs-file[aria-disabled="true"] .crumbs-name',
    '.crumbs-file[aria-pressed="true"] .crumbs-name',
    '.crumbs-note',
  ]) {
    const { ink, ground } = await inkAndGround(page, selector);
    const ratio = contrastRatio(ink, ground);
    expect(ratio, `${selector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }

  await context.close();
});

test('the whole trail is reachable and pressable from the keyboard alone (VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);

  // The trail's rungs come after the handle and before the file's own rows.
  await page.locator('.filedrawer-handle').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.crumbs-seg[data-seg="work"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.crumbs-seg[data-seg="file"]')).toBeFocused();

  // Opened from the keyboard, and every chip reachable by Tab — a locked one
  // included, which is the whole reason it is `aria-disabled` rather than
  // `disabled`: its sentence has to be reachable by somebody who cannot see it.
  await page.keyboard.press('Enter');
  await expect(page.locator('.crumbs-file[data-file="context"]')).toBeFocused();
  for (const file of ['skills', 'actions']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`.crumbs-file[data-file="${file}"]`)).toBeFocused();
  }
  // And the whole truth is in the focused control's own name.
  await expect(page.locator('.crumbs-file[data-file="actions"]')).toHaveAttribute(
    'aria-label',
    S.fileToggleLockedName(S.fileActions, S.lockedNeedsFirst(S.fileSkills)),
  );

  // Escape hands the cursor back to the rung that opened them, never to nowhere.
  await page.keyboard.press('Escape');
  await expect(page.locator('.crumbs-seg[data-seg="file"]')).toBeFocused();

  await context.close();
});

test('the ring is visible on every rung and on every chip (VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);

  // Reached with the KEYBOARD, because that is what `:focus-visible` is a
  // question about — a ring measured after a programmatic focus can pass on a
  // stylesheet that only rings mouse users.
  await page.locator('.filedrawer-handle').focus();
  for (const seg of ['work', 'file']) {
    await page.keyboard.press('Tab');
    const ring = await page.locator(`.crumbs-seg[data-seg="${seg}"]`).evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle, visible: el.matches(':focus-visible') };
    });
    expect(ring.visible, seg).toBe(true);
    expect(ring.style, seg).toBe('solid');
    expect(parseFloat(ring.width), seg).toBeGreaterThanOrEqual(2);
  }

  await page.keyboard.press('Enter');
  for (const file of ['context', 'skills', 'actions']) {
    const ring = await page.locator(`.crumbs-file[data-file="${file}"]`).evaluate((el) => {
      const chip = getComputedStyle(el.querySelector('.crumbs-chip')!);
      return { width: chip.outlineWidth, style: chip.outlineStyle, button: getComputedStyle(el).outlineStyle };
    });
    // 2px, visible, and on the chip rather than on the 44px box around it — a
    // ring round eight pixels of empty space is a rectangle near a focus
    // indicator, not one (components/Breadcrumb.css).
    expect(parseFloat(ring.width), file).toBeGreaterThanOrEqual(2);
    expect(ring.style, file).toBe('solid');
    expect(ring.button, file).toBe('none');
    if (file !== 'actions') await page.keyboard.press('Tab');
  }

  await context.close();
});

test('every control in the two new bands clears the 44px target (VB-51, VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);

  const measure = async (selector: string, expected: number) => {
    const boxes = await page.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        return { w: box.width, h: box.height };
      }),
    );
    expect(boxes, selector).toHaveLength(expected);
    for (const box of boxes) {
      expect(Math.round(box.h), `${selector} height`).toBeGreaterThanOrEqual(TARGET_MIN);
      expect(Math.round(box.w), `${selector} width`).toBeGreaterThanOrEqual(TARGET_MIN);
    }
  };

  // The two pressable rungs — the third is where you are and is not a control.
  await measure('button.crumbs-seg', 2);
  // The bottom bar's two icons.
  await measure('.filedrawer-mode', 2);
  // And the three chips, once they are showing.
  await page.locator('.crumbs-seg[data-seg="file"]').click();
  await measure('.crumbs-file', 3);

  await context.close();
});

test('the file on screen is never told apart by colour alone (VB-52)', async () => {
  const { context, sw, id } = await launch();
  const page = await openDrawer(context, sw, id);
  await page.locator('.crumbs-seg[data-seg="file"]').click();

  // Colour taken away entirely, and the signals that are left are read off real
  // pixels: the pressed chip carries a solid bar and a heavier label, and a
  // locked one carries a padlock and a broken edge.
  //
  // V1.9 VB-50 removed the fourth signal, which was a FILL — the drawer is one
  // colour from its top edge to the bottom of the panel now, so a chip with a
  // ground of its own is exactly what that task takes away. The assertion is
  // inverted rather than dropped: no chip may have a fill, and the two shape
  // signals have to carry the state on their own. Three of them still do
  // (the bar, the weight, and `aria-pressed` for anything not looking).
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
  await page.waitForTimeout(80);
  const read = await page.locator('.crumbs-file').evaluateAll((els) =>
    els.map((el) => {
      const chip = el.querySelector('.crumbs-chip') as HTMLElement;
      const style = getComputedStyle(chip);
      return {
        file: (el as HTMLElement).dataset.file,
        pressed: el.getAttribute('aria-pressed'),
        filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
        bar: style.boxShadow !== 'none',
        weight: Number(style.fontWeight),
        dashed: style.borderStyle.includes('dashed'),
        lock: el.querySelectorAll('svg.filelock').length,
      };
    }),
  );
  const pressed = read.find((entry) => entry.pressed === 'true')!;
  expect(pressed.file).toBe('context');
  expect(pressed.filled, 'the pressed chip has a fill again (VB-50)').toBe(false);
  expect(pressed.bar, 'the pressed chip has no bar under it').toBe(true);
  expect(pressed.lock).toBe(0);
  for (const entry of read.filter((e) => e.pressed === 'false')) {
    expect(entry.filled, `${entry.file} has a fill (VB-50)`).toBe(false);
    expect(entry.bar).toBe(false);
    expect(entry.weight, `${entry.file} is as heavy as the pressed one`).toBeLessThan(pressed.weight);
    expect(entry.lock, `${entry.file} has no padlock`).toBe(1);
    expect(entry.dashed, `${entry.file} has no dashed edge`).toBe(true);
  }

  // And the caret says whether the files are open in a SHAPE, not a colour.
  const turned = await page.locator('.crumbs-caret').evaluate((el) => getComputedStyle(el).transform);
  expect(turned, 'the caret does not turn when the files open').not.toBe('none');

  await context.close();
});
