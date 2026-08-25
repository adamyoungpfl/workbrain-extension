import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  findPosition,
  applyAnswer,
  applyReflect,
  reconcileSeededRepeatable,
  findSeedTarget,
} from '../../src/core/flow/runner';
import { ORB_CHOICE_QUESTIONS } from '../../src/core/choice/orbs';
import { ROVING_KEYS } from '../../src/core/choice/roving';
import { ORB_PULSE_MS, ORB_ROTATE_MS } from '../../src/core/motion/rotation';
import { S } from '../../src/panel/strings';
import type { AnswerValue } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V2.0 VB-60 — choosing one or many, as orbs, in a real browser.
 *
 * The unit tests own the rules: which questions wear orbs
 * (core/choice/orbs.ts), what an arrow key does (core/choice/roving.ts), when
 * the rotation stops (core/motion/rotation.ts), and where an orb stands under
 * the one light (core/globe/lighting.ts). None of them can see a pixel, and
 * every claim VB-60 actually makes is about pixels:
 *
 *  - the option is an ORB, lit by the scene light, and each one is lit
 *    DIFFERENTLY because it stands somewhere different — which is the whole of
 *    VB-54 and the difference between one object and seven stickers;
 *  - the outline really travels, on a wall clock, and really stops for good the
 *    first time anybody touches the question (FLAG 1);
 *  - **selection survives greyscale** — the guardrail this feature could most
 *    easily have broken, since a glow is a colour;
 *  - every orb is pressable at 44×44 however small it is painted;
 *  - and the keyboard is exactly the one PillGroup shipped: roving tabindex,
 *    arrows, Space, a real named group.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');
const SHOTS = path.resolve(HERE, '../../test-results/vb60');
const NEW_ROLE = 'Board member';

async function launchExtension(
  reducedMotion: 'reduce' | 'no-preference' = 'no-preference',
): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion,
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/**
 * Every answer up to — not including — `role_names`, walked out of the real
 * flow rather than hand-written, so it stays correct as questions move.
 * Lifted from tests/e2e/roles-loop.spec.ts, which reaches the same question by
 * the same route; this repo keeps specs standalone on purpose.
 */
function answersBeforeRoleNames(): Answers {
  let answers: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
  const declined = new Set<string>();
  const seenIntros = new Set<string>();

  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') break;
    if (pos.kind === 'module-intro') {
      seenIntros.add(pos.module.id);
      continue;
    }
    if (pos.kind === 'add-another') {
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'A kept answer.');
      continue;
    }
    if (pos.step.id === 'role_names') return answers;
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'no'
            : 'A seeded answer for this question.';
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('never reached role_names');
}

async function openAtRoleNames(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersBeforeRoleNames());
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_names');
  await expect(page.locator('.orbgroup')).toHaveCount(1);
  return page;
}

const choices = (page: Page): Locator => page.locator('.orbgroup .orbchoice:not(.orbchoice-add)');
const addOrb = (page: Page): Locator => page.locator('.orbgroup .orbchoice-add');

/** Which orb is wearing the travelling outline right now, by index, or -1. */
async function outlinedIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const orbs = [...document.querySelectorAll('.orbgroup .orbchoice:not(.orbchoice-add) .orbchoice-orb')];
    return orbs.findIndex((o) => o.getAttribute('data-outlined') === 'true');
  });
}

/** Nothing under the pointer, nothing focused — so whatever holds the rotation
 * after this is neither hover nor focus. */
async function letGo(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Wait until the outline has actually moved, and hand back where it is now.
 *
 * Every "it stopped" test starts here. Without it, "the outline did not move"
 * would pass just as happily against a feature that never started, which is how
 * this whole file could quietly rot.
 */
async function proveItIsTravelling(page: Page): Promise<number> {
  const first = await outlinedIndex(page);
  expect(first, 'no orb was outlined at all').toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => outlinedIndex(page), {
      timeout: ORB_ROTATE_MS + 4000,
      message: 'the outline never travelled',
    })
    .not.toBe(first);
  return outlinedIndex(page);
}

/** Four more turns with the pointer and focus elsewhere. If the outline is
 * still in the same place, nothing is moving and nothing is going to. */
async function expectStillStopped(page: Page, held: number, where: string): Promise<void> {
  await page.waitForTimeout(ORB_ROTATE_MS * 4);
  expect(await outlinedIndex(page), `${where}: it started again`).toBe(held);
}

/** WCAG 2.x contrast, from two `rgb()` strings as the browser reports them. */
function contrast(a: string, b: string): number {
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (colour: string) => {
    const [r, g, blue] = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((n) => Number(n) / 255);
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(blue!);
  };
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

// ═══ It is the brain's orb ══════════════════════════════════════════════

test.describe('VB-60 — the option is the brain’s own orb', () => {
  test('the roles question has orbs and no pills, and nothing else changed hands', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    expect(ORB_CHOICE_QUESTIONS).toEqual(['role_names']);
    await expect(page.locator('.flow .pillgroup')).toHaveCount(0);
    await expect(choices(page)).toHaveCount(6);
    await expect(addOrb(page)).toHaveCount(1);

    // The next question along is still pills. VB-60 named one question and
    // this is the assertion that keeps it to one.
    await choices(page).first().click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'role_names');
    await expect(page.locator('.flow .orbgroup')).toHaveCount(0);
    await expect(page.locator('.flow .pillgroup')).toHaveCount(1);

    await context.close();
  });

  test('every orb is lit from ONE light, and no two are lit the same', async () => {
    // V1.9 VB-54's whole claim, on this surface: the highlight offsets are a
    // function of where each orb STANDS, so neighbours relate. A per-orb
    // constant — the thing VB-23 deleted from the globe — would make every one
    // of these identical, which is exactly what the second half asserts.
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const lit = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.orbgroup .orbchoice-orb')].map((orb) => {
        const style = getComputedStyle(orb);
        const box = orb.getBoundingClientRect();
        return {
          hx: parseFloat(style.getPropertyValue('--orb-hx')),
          hy: parseFloat(style.getPropertyValue('--orb-hy')),
          sx: parseFloat(style.getPropertyValue('--orb-sx')),
          specular: parseFloat(style.getPropertyValue('--orb-spec-mix')),
          gradient: orb.getAttribute('data-gradient'),
          image: style.backgroundImage,
          x: box.x,
          y: box.y,
          size: Math.round(box.width),
        };
      }),
    );
    expect(lit).toHaveLength(7);

    // Three painted layers on every one of them — the specular, the terminator
    // and the limb, which is FileTree.css's rule over core's own constants.
    for (const orb of lit) {
      expect(orb.image.match(/radial-gradient/g)?.length, `${orb.gradient} lost a layer`).toBe(3);
      expect(Number.isNaN(orb.hx)).toBe(false);
    }

    // The light is up and to the LEFT of the whole group: every highlight is
    // pushed toward it and every terminator away from it. One source.
    expect(lit.every((o) => o.hy < 0)).toBe(true);
    expect(lit.every((o) => o.sx > -0.001 || o.hx < 0.001)).toBe(true);

    // ...and it is a REAL source rather than a constant wearing a scene's
    // name: an orb further right sees it from further left.
    const leftMost = lit.reduce((a, b) => (a.x <= b.x ? a : b));
    const rightMost = lit.reduce((a, b) => (a.x >= b.x ? a : b));
    expect(rightMost.x - leftMost.x).toBeGreaterThan(40);
    expect(rightMost.hx).toBeLessThan(leftMost.hx);

    // No two orbs share a highlight offset. Twelve stickers is the failure
    // VB-54 exists to prevent and this is what it looks like numerically.
    const offsets = new Set(lit.map((o) => `${o.hx.toFixed(3)},${o.hy.toFixed(3)}`));
    expect(offsets.size).toBe(lit.length);

    // "A SMALLER orb" for add-new — VB-60's own word, measured.
    const add = await page.locator('.orbgroup .orbchoice-add .orbchoice-orb').evaluate((el) => el.getBoundingClientRect().width);
    expect(add).toBeLessThan(lit[0]!.size);

    await context.close();
  });

  test('the first orb’s painted edge lands on the question’s', async () => {
    // Where VB-57 just put the follow-up link, and where a pill's own border
    // box has always been. The group's 44px targets are made of padding, so
    // aligning the PAINT means the group has to take that padding back out —
    // which is a claim about a live layout, not about a stylesheet.
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const edges = await page.evaluate(() => ({
      question: document.querySelector('.flow .flow-q')!.getBoundingClientRect().left,
      followUp: document.querySelector('.flow .deepdive-chip')!.getBoundingClientRect().left,
      orb: document.querySelector('.orbgroup .orbchoice-orb')!.getBoundingClientRect().left,
      overflow: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(Math.round(edges.orb)).toBe(Math.round(edges.question));
    expect(Math.round(edges.followUp)).toBe(Math.round(edges.question));
    // ...and nothing hangs off the right of a 400px panel.
    expect(edges.overflow).toBeLessThanOrEqual(0);

    await context.close();
  });

  test('the orb’s hairline clears 3:1 on the pane it is actually painted on', async () => {
    // VB-45 put the inset deep ring on the List's orbs because the globe's
    // colours measure about 2.7:1 on a near-white ground, under what WCAG
    // 1.4.11 asks of a graphic that carries meaning. The same orbs are here on
    // the same kind of ground, so the same measurement has to hold — including
    // on a DIMMED one, which is where mixing the fill toward the canvas could
    // have taken the edge down with it.
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const measured = await page.evaluate(() => {
      const ground = (el: HTMLElement): string => {
        let node: HTMLElement | null = el;
        while (node) {
          const background = getComputedStyle(node).backgroundColor;
          if (background && !/rgba\(0, 0, 0, 0\)|transparent/.test(background)) return background;
          node = node.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };
      return [...document.querySelectorAll<HTMLElement>('.orbgroup .orbchoice-orb')].map((orb) => ({
        edge: getComputedStyle(orb).color,
        ground: ground(orb.parentElement as HTMLElement),
        picked: orb.getAttribute('data-picked'),
      }));
    });

    for (const orb of measured) {
      // `color` is the deep colour, which is what the inset ring and the mark
      // are both drawn in.
      expect(contrast(orb.edge, orb.ground), `an orb edge measures too low`).toBeGreaterThanOrEqual(3);
    }

    await context.close();
  });
});

// ═══ Selection, in greyscale ═══════════════════════════════════════════

test.describe('VB-60 — selection is never the glow', () => {
  test('two picked orbs read as picked with every colour stripped out', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    await choices(page).nth(0).click();
    await choices(page).nth(2).click();
    await expect(choices(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(choices(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.orbgroup .orbchoice[aria-pressed="true"]')).toHaveCount(2);

    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    await page.waitForTimeout(200);

    const read = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.orbgroup .orbchoice:not(.orbchoice-add)')].map((chip) => {
        const orb = chip.querySelector<HTMLElement>('.orbchoice-orb')!;
        const mark = orb.querySelector('.orbchoice-mark');
        const label = chip.querySelector<HTMLElement>('.orbchoice-label')!;
        const box = orb.getBoundingClientRect();
        return {
          picked: chip.getAttribute('aria-pressed') === 'true',
          hasMark: !!mark && !!mark.querySelector('path'),
          weight: Number(getComputedStyle(label).fontWeight),
          fill: getComputedStyle(orb).backgroundColor,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
        };
      }),
    );

    const picked = read.filter((r) => r.picked);
    const unpicked = read.filter((r) => !r.picked);
    expect(picked).toHaveLength(2);
    expect(unpicked).toHaveLength(4);

    // SIGNAL 1 — a drawn mark, present on the picked ones and on nothing else.
    expect(picked.every((r) => r.hasMark)).toBe(true);
    expect(unpicked.every((r) => !r.hasMark)).toBe(true);

    // SIGNAL 3 — weight, a real step rather than a hair.
    expect(Math.min(...picked.map((r) => r.weight)) - Math.max(...unpicked.map((r) => r.weight))).toBeGreaterThanOrEqual(
      100,
    );

    // SIGNAL 2 — LIGHTNESS. Read off the screenshot rather than the
    // stylesheet, in greyscale, because "these two look different" is a claim
    // about painted pixels and a computed `background-color` would happily
    // report two colours that grey to the same value.
    const shot = (await page.screenshot()).toString('base64');
    const greys = await page.evaluate(
      async ({ shot, boxes }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        // The middle of each orb, away from the rim, the hairline and the mark.
        return boxes.map((box) => {
          const data = ctx.getImageData(
            Math.round(box.x + box.width * 0.2),
            Math.round(box.y + box.height * 0.2),
            Math.max(1, Math.round(box.width * 0.6)),
            Math.max(1, Math.round(box.height * 0.6)),
          ).data;
          let total = 0;
          for (let i = 0; i < data.length; i += 4) total += data[i]!;
          return total / (data.length / 4);
        });
      },
      { shot, boxes: read.map((r) => r.box) },
    );

    const pickedGrey = read.map((r, i) => ({ ...r, grey: greys[i]! })).filter((r) => r.picked);
    const unpickedGrey = read.map((r, i) => ({ ...r, grey: greys[i]! })).filter((r) => !r.picked);
    const darkestUnpicked = Math.min(...unpickedGrey.map((r) => r.grey));
    const lightestPicked = Math.max(...pickedGrey.map((r) => r.grey));
    // A picked orb is a real step darker than every unpicked one, in grey.
    expect(
      darkestUnpicked - lightestPicked,
      `picked ${lightestPicked.toFixed(0)} vs unpicked ${darkestUnpicked.toFixed(0)} in greyscale`,
    ).toBeGreaterThan(25);

    await page.screenshot({ path: path.join(SHOTS, 'orbs-greyscale-two-picked.png') });
    await context.close();
  });

  test('the label’s ink clears 4.5:1, picked and not', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await choices(page).nth(1).click();

    const measured = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.orbgroup .orbchoice')].map((chip) => ({
        ink: getComputedStyle(chip.querySelector('.orbchoice-label')!).color,
        add: chip.classList.contains('orbchoice-add'),
      })),
    );
    for (const label of measured) {
      expect(contrast(label.ink, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
    }

    await context.close();
  });
});

// ═══ The keyboard PillGroup shipped ════════════════════════════════════

test.describe('VB-60 — the accessibility contract PillGroup shipped', () => {
  test('a real group, named by the question, with one tab stop in it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const group = await page.evaluate(() => {
      const el = document.querySelector('.orbgroup')!;
      const heading = document.querySelector('.flow-q')!.textContent ?? '';
      return {
        role: el.getAttribute('role'),
        name: el.getAttribute('aria-label') ?? '',
        heading: heading.trim(),
        tabbable: [...el.querySelectorAll('button')].filter((b) => b.tabIndex === 0).length,
        buttons: el.querySelectorAll('button').length,
      };
    });
    expect(group.role).toBe('group');
    // Named by the question — and carrying, in words, what the travelling
    // outline says only to the eye.
    expect(group.name).toContain(group.heading);
    expect(group.name).toContain(S.orbPickHint);
    // Roving: exactly one tab stop for the whole group, seven controls in it.
    expect(group.buttons).toBe(7);
    expect(group.tabbable).toBe(1);

    await context.close();
  });

  test('arrows move the roving tabindex, both axes, wrapping, with Home and End', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const focusedIndex = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.orbgroup button')].indexOf(document.activeElement as Element),
      );
    const tabStop = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLButtonElement>('.orbgroup button')].findIndex((b) => b.tabIndex === 0),
      );

    await choices(page).first().focus();
    expect(await focusedIndex()).toBe(0);

    await page.keyboard.press('ArrowRight');
    expect(await focusedIndex()).toBe(1);
    // The tab stop follows focus — that is what "roving" means, and a group
    // where it does not is one a Tab lands back at the top of.
    expect(await tabStop()).toBe(1);

    await page.keyboard.press('ArrowDown');
    expect(await focusedIndex()).toBe(2);
    await page.keyboard.press('ArrowUp');
    expect(await focusedIndex()).toBe(1);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedIndex()).toBe(0);

    // Wraps backwards onto the add-new orb — the last control in the group,
    // not a control outside it.
    await page.keyboard.press('ArrowLeft');
    expect(await focusedIndex()).toBe(6);
    await expect(addOrb(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    expect(await focusedIndex()).toBe(0);

    await page.keyboard.press('End');
    expect(await focusedIndex()).toBe(6);
    await page.keyboard.press('Home');
    expect(await focusedIndex()).toBe(0);

    // ...and the six keys the pattern claims are the six core publishes.
    expect([...ROVING_KEYS].sort()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home']);

    await context.close();
  });

  test('Space selects several, and Tab never gets stuck inside the group', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    await choices(page).first().focus();
    await page.keyboard.press('Space');
    await expect(choices(page).nth(0)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(choices(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    // MULTI-SELECT: the first one is still picked. A single-select group would
    // have dropped it, and this question is "pick one or several".
    await expect(page.locator('.orbgroup .orbchoice[aria-pressed="true"]')).toHaveCount(2);

    // Enter works too — both are native button activation, which is why
    // core/choice/roving.ts deliberately does not claim either key.
    await page.keyboard.press('Enter');
    await expect(page.locator('.orbgroup .orbchoice[aria-pressed="true"]')).toHaveCount(1);
    await page.keyboard.press('Enter');

    // One Tab leaves the whole group.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.orbgroup'))).toBe(false);

    // ...and it committed, which is the only thing selection is for.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'role_names');
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers']);
    expect((stored as Answers).values.role_names).toEqual(['employee', 'business-owner']);

    await context.close();
  });

  test('every orb is pressable at 44×44, however small it is painted', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.orbgroup .orbchoice')].map((chip) => {
        const target = chip.getBoundingClientRect();
        const orb = chip.querySelector<HTMLElement>('.orbchoice-orb')!.getBoundingClientRect();
        return {
          target: { x: target.x, y: target.y, width: target.width, height: target.height },
          paint: orb.height,
          add: chip.classList.contains('orbchoice-add'),
        };
      }),
    );

    for (const chip of boxes) {
      expect(chip.target.height, 'a chip is under the 44px floor').toBeGreaterThanOrEqual(44);
      expect(chip.target.width).toBeGreaterThanOrEqual(44);
      // VB-15's split: the paint really is smaller than the target, which is
      // the point of the pattern rather than an accident of the font.
      expect(chip.paint).toBeLessThan(44);
    }
    // The add orb is the smallest paint on the screen and still a full target.
    expect(boxes.find((b) => b.add)!.paint).toBeLessThan(boxes.find((b) => !b.add)!.paint);

    // ...and no two hit boxes overlap, which is what the widened row-gap is
    // for. A 44px target overhanging a 32px row is only legitimate if the next
    // row's target starts below it.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.target;
        const b = boxes[j]!.target;
        const overlaps =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps, `targets ${i} and ${j} overlap`).toBe(false);
      }
    }

    await context.close();
  });

  test('the focus ring is on the paint, not around empty space', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    // Reached by KEY, not by `.focus()`: `:focus-visible` is a modality
    // heuristic, and script focus after a click does not light it. A keyboard
    // user is who this ring is for, so a keyboard is what has to produce it.
    await choices(page).first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(choices(page).first()).toBeFocused();
    const ring = await page.evaluate(() => {
      const chip = document.querySelector<HTMLElement>('.orbgroup .orbchoice')!;
      const paint = chip.querySelector<HTMLElement>('.orbchoice-paint')!;
      const style = getComputedStyle(paint);
      const paintBox = paint.getBoundingClientRect();
      const chipBox = chip.getBoundingClientRect();
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        colour: style.outlineColor,
        offset: style.outlineOffset,
        chipRing: getComputedStyle(chip).outlineStyle,
        // The ring hugs the painted content rather than the 44px box.
        shorterThanTarget: paintBox.height < chipBox.height,
      };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('2px');
    expect(ring.offset).toBe('2px');
    expect(ring.colour).toBe('rgb(42, 79, 203)'); // --primary
    expect(ring.chipRing).toBe('none');
    expect(ring.shorterThanTarget).toBe(true);

    await context.close();
  });

  test('the add-new orb still opens the same field, and still adds a custom value', async () => {
    // VB-60 replaces the TRIGGER's paint, never the mechanism: `allowCustom`
    // opens the same text field the pill row opens, and the value lands in the
    // same answer.
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    await expect(page.locator('.flow-custom')).toHaveCount(0);
    await expect(addOrb(page)).toHaveAccessibleName(S.addYourOwnOrb);
    await addOrb(page).click();
    await expect(page.locator('.flow-custom')).toHaveCount(1);

    await page.locator('#flow-custom-value').fill(NEW_ROLE);
    await page.getByRole('button', { name: S.addYourOwnConfirm, exact: true }).click();

    // It arrives as a SEVENTH ORB, picked, in the same group — not as a pill,
    // and not as an invisible selection.
    await expect(choices(page)).toHaveCount(7);
    const added = page.locator('.orbgroup .orbchoice').filter({ hasText: new RegExp(`^${NEW_ROLE}$`) });
    await expect(added).toHaveCount(1);
    await expect(added).toHaveAttribute('aria-pressed', 'true');
    await expect(added.locator('.orbchoice-mark')).toHaveCount(1);
    // ...and it is lit like the rest of them, from the same light.
    expect(
      await added.locator('.orbchoice-orb').evaluate((el) => getComputedStyle(el).getPropertyValue('--orb-hx')),
    ).not.toBe('');

    await page.getByRole('button', { name: S.next, exact: true }).click();
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers']);
    expect((stored as Answers).values.role_names).toEqual([NEW_ROLE]);

    await context.close();
  });

  test('axe finds no violations on the orb picker', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    // Scan a settled screen: focus stops the rotation, which is the feature,
    // and the 120ms fade the outline arrives on has to be over before any
    // colour is measured.
    await choices(page).first().focus();
    await page.waitForTimeout(400);

    const results = await new AxeBuilder({ page })
      .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
      .withRules(['color-contrast', 'target-size', 'button-name', 'aria-allowed-role', 'aria-valid-attr-value'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(results.passes.some((p) => p.id === 'target-size')).toBe(true);
    expect(results.passes.some((p) => p.id === 'button-name')).toBe(true);

    await context.close();
  });
});

// ═══ FLAG 1: it stops for good ═════════════════════════════════════════

test.describe('VB-60 — the outline travels, and stops permanently on any interaction', () => {
  /* Every test here sits through several real turns: one to prove it started,
     four more to prove nothing restarts it. That is the wall clock the feature
     is specified in, and faking it would prove something about a fake timer. */
  test.describe.configure({ timeout: 60_000 });

  test('exactly one orb is outlined at a time, and it goes round them all', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const seen = new Set<number>();
    for (let turn = 0; turn < 9; turn++) {
      const at = await outlinedIndex(page);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(
        await page.locator('.orbgroup .orbchoice-orb[data-outlined="true"]').count(),
        'more than one orb was outlined',
      ).toBe(1);
      seen.add(at);
      await page.waitForTimeout(ORB_ROTATE_MS + 250);
    }
    // It really goes ROUND — every choice gets its turn, which is what "one or
    // several" is said with.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);

    // And the add-new orb is not in the ring — it has its own cue.
    expect(
      await page.locator('.orbgroup .orbchoice-add .orbchoice-orb').getAttribute('data-outlined'),
    ).toBe('false');

    await context.close();
  });

  test('a click anywhere in the question area — not on an orb', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    const held = await proveItIsTravelling(page);

    await page.locator('.flow .flow-q').click();
    await letGo(page);
    await expectStillStopped(page, held, 'a click on the question');

    await context.close();
  });

  test('focus arriving — and it stays stopped after focus leaves again', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const held = await proveItIsTravelling(page);
    await choices(page).first().focus();
    await page.waitForTimeout(ORB_ROTATE_MS * 2);
    expect(await outlinedIndex(page)).toBe(held);

    // FLAG 1: "it must not restart when focus leaves."
    await letGo(page);
    await expectStillStopped(page, held, 'focus, then focus leaving');

    await context.close();
  });

  test('picking an orb — the interaction that is also the answer', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await proveItIsTravelling(page);

    await choices(page).nth(3).click();
    await letGo(page);
    const held = await outlinedIndex(page);
    await expectStillStopped(page, held, 'picking an orb');

    await context.close();
  });

  test('a keypress in the question area, from somewhere that is not the group', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    const held = await proveItIsTravelling(page);

    await page.locator('.flow .flow-q').dispatchEvent('keydown', { key: 'a', bubbles: true });
    await letGo(page);
    await expectStillStopped(page, held, 'a keypress');

    await context.close();
  });

  test('opening the follow-up under the question stops the ORBS too', async () => {
    // The half that would have been easy to miss. FLAG 1 is one rule for the
    // whole question area, so the two rotations are one life, not two that
    // happen to agree — see `stoppedBy` in Flow.tsx and OrbGroup.tsx.
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    const held = await proveItIsTravelling(page);

    await page.locator('.flow .deepdive-chip').first().click();
    await letGo(page);
    await expectStillStopped(page, held, 'opening a follow-up');

    await context.close();
  });

  test('pressing rephrase stops the orbs, and nothing restarts them', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await expect(page.locator('.flow .flow-rephrase')).toHaveCount(1);
    const held = await proveItIsTravelling(page);

    await page.locator('.flow .flow-rephrase').click();
    await letGo(page);
    await expectStillStopped(page, held, 'pressing rephrase');

    await context.close();
  });

  test('the pulsing + stops with it — nothing is left running or merely invisible', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);

    const pulses = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target ?? null;
            return !!target?.closest?.('.orbgroup');
          })
          .map((a) => a.playState),
      );
    expect(await pulses()).toContain('running');
    expect(ORB_PULSE_MS).toBeGreaterThan(ORB_ROTATE_MS);

    await page.locator('.flow .flow-q').click();
    await letGo(page);
    await page.waitForTimeout(400);
    // Not paused, not transparent — gone. `getAnimations` is the only honest
    // way to ask, because a class can lie about this and a screenshot cannot
    // tell "still" from "still for a moment".
    expect(await pulses()).toEqual([]);
    expect(await page.locator('.orbgroup').getAttribute('data-rotating')).toBe('false');

    await context.close();
  });

  test('reduced motion outlines every orb at once, and schedules nothing', async () => {
    const { context, sw, id } = await launchExtension('reduce');
    const page = await openAtRoleNames(context, sw, id);

    // The still version carries MORE than the moving one: "any of these", said
    // about all of them at the same time (docs/GUARDRAILS.md).
    await expect(page.locator('.orbgroup .orbchoice:not(.orbchoice-add) .orbchoice-orb[data-outlined="true"]')).toHaveCount(6);
    await page.waitForTimeout(ORB_ROTATE_MS * 2.2);
    await expect(page.locator('.orbgroup .orbchoice:not(.orbchoice-add) .orbchoice-orb[data-outlined="true"]')).toHaveCount(6);

    // Nothing is left running behind it, including the pulse.
    expect(
      await page.evaluate(() =>
        document.getAnimations().filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target ?? null;
          return !!target?.closest?.('.orbgroup');
        }).length,
      ),
    ).toBe(0);
    // ...and the + is still there at full strength, which is what keeps the
    // instruction in the still version.
    await expect(addOrb(page).locator('.orbchoice-mark')).toHaveCount(1);
    expect(
      await addOrb(page).locator('.orbchoice-mark').evaluate((el) => Number(getComputedStyle(el).opacity)),
    ).toBeGreaterThan(0.9);

    // The still equivalent, for a person to look at: "carries the instruction"
    // is a judgement about a picture, and the only way to make it is to see it.
    const box = (await page.locator('.orbgroup').boundingBox())!;
    await page.screenshot({
      path: path.join(SHOTS, 'orbs-reduced-motion.png'),
      clip: {
        x: 0,
        y: Math.max(0, Math.round(box.y) - 110),
        width: 400,
        height: Math.min(360, Math.round(box.height) + 150),
      },
    });

    await context.close();
  });
});

// ═══ For a person to look at ═══════════════════════════════════════════

test('VB-60 — at rest, mid-rotation, two picked, and greyscale', async () => {
  test.setTimeout(60_000);
  const { context, sw, id } = await launchExtension();
  const page = await openAtRoleNames(context, sw, id);

  const area = async () => {
    const box = (await page.locator('.orbgroup').boundingBox())!;
    return {
      x: 0,
      y: Math.max(0, Math.round(box.y) - 110),
      width: 400,
      height: Math.min(360, Math.round(box.height) + 150),
    };
  };

  await page.waitForTimeout(700); // let the question finish typing itself in
  await page.screenshot({ path: path.join(SHOTS, 'orbs-at-rest.png'), clip: await area() });

  await proveItIsTravelling(page);
  await page.screenshot({ path: path.join(SHOTS, 'orbs-mid-rotation.png'), clip: await area() });

  await choices(page).nth(0).click();
  await choices(page).nth(3).click();
  await letGo(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'orbs-two-picked.png'), clip: await area() });
  await page.screenshot({ path: path.join(SHOTS, 'orbs-whole-panel.png') });

  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'orbs-greyscale.png'), clip: await area() });

  await context.close();
});
