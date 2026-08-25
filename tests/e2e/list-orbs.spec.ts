import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-45 + VB-46 — the rows carry the brain's orbs, and the count and
 * percentage are bundled at the right end. (VB-46 bundled the status pill
 * there too; V2.0 VB-55 removed it — the state is the orb's job.)
 *
 * The rules themselves are proved without a browser —
 * src/core/freshness/sectionLife.test.ts for which row is live, and
 * sectionHealth.test.ts for the counts underneath it. What only a browser can
 * prove is what this file is for:
 *
 * - THE ONE THAT MATTERS FOR VB-45: the orb a row carries is the SAME OBJECT
 *   as the node that flies out of the globe — same colour, measured off both,
 *   section by section — so the morph reads as one thing moving.
 * - THE ONE THAT MATTERS FOR VB-46: List and Brain agree, node for node, about
 *   what is live. That is what "the same rule drives the Brain visual" means,
 *   and it is the failure a second implementation would produce.
 * - That the bundle really is bundled: count and figure in one column at the
 *   row's right end, inside the row, never over the name.
 * - That the pulse really moves, and really stops for reduced motion.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;

async function launchExtension(reducedMotion?: 'reduce'): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(reducedMotion ? { reducedMotion } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

async function seedAnswers(sw: Worker, answers: Answers): Promise<void> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
}

/**
 * A file with all three lives on screen at once: sections answered a year ago
 * (lit), one being written (live), and the rest never reached (dim). Built by
 * walking the real modules, so what is on screen is what the shipped flow
 * really produces.
 */
function midInterview(): Answers {
  const ago = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
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
      answeredAt[key] = ago(300);
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt: {} };
}

async function openList(context: BrowserContext, id: string): Promise<Page> {
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
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
  // The height lands as state immediately and the box catches up over a 320ms
  // settle, during which the drawer's own top edge is still travelling.
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.y;
      await page.waitForTimeout(60);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.y - first));
    })
    .toBe(0);
  return page;
}

test.describe('VB-45 — the rows carry the brain’s orbs', () => {
  test('a row’s orb is the very colour its own node flies in, section by section', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    // What each row is painted, and which of the five the component asked for.
    const rows = await page.locator('.filetree-row[data-node-id] .filetree-glyph').evaluateAll((els) =>
      els.map((el) => ({
        id: (el.closest('.filetree-row') as HTMLElement).dataset.nodeId!,
        gradient: (el as HTMLElement).dataset.gradient!,
        paint: getComputedStyle(el).backgroundColor,
        life: (el as HTMLElement).dataset.life!,
      })),
    );
    expect(rows.length).toBe(contextOutline.length);

    // 1 — every section wears the colour ITS OWN SPHERE wears in the globe.
    // Read off the sphere's own class in the rendered picture rather than off
    // the function both sides call, so this fails if either view is restyled
    // alone.
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await page.waitForTimeout(80);
    const spheres = await page.locator('.brainglobe-node[data-section-id]').evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).dataset.sectionId)
        .map((el) => ({
          id: (el as HTMLElement).dataset.sectionId!,
          gradient: (el.querySelector('.brainglobe-sphere')!.getAttribute('class') ?? '').replace(/.*-(\d)$/, '$1'),
        })),
    );
    expect(spheres.length).toBe(contextOutline.length);
    for (const sphere of spheres) {
      expect(rows.find((entry) => entry.id === sphere.id)!.gradient, sphere.id).toBe(sphere.gradient);
    }

    // 2 — and the paint really is the flying node's paint. Measured off the
    // morph layer's own nodes mid-flight, not off a token name repeated in two
    // stylesheets: this is the assertion that fails if either side is
    // restyled alone.
    const flying = await page.locator('.filedrawer-morph-node').evaluateAll((els) =>
      els.map((el) => ({
        id: (el as HTMLElement).dataset.nodeId!,
        life: (el as HTMLElement).dataset.life!,
        paint: getComputedStyle(el).backgroundColor,
      })),
    );
    expect(flying.length, 'no nodes were in flight to compare against').toBeGreaterThan(3);
    let dimFlights = 0;
    for (const node of flying) {
      const row = rows.find((entry) => entry.id === node.id);
      expect(row, node.id).toBeTruthy();
      expect(node.life, `${node.id} flies at a different life than its row`).toBe(row!.life);
      if (row!.life === 'dim') {
        // A hollow row has no fill to compare against — what matters is that
        // the node does not fly BRIGHT and land hollow, so it is drawn turned
        // down, exactly as its sphere is in the globe.
        dimFlights++;
        expect(
          flying.some((other) => other.life !== 'dim' && other.paint === node.paint),
          `${node.id} flew at full strength into a hollow orb`,
        ).toBe(false);
        continue;
      }
      expect(row!.paint, `${node.id} row orb vs flying node`).toBe(node.paint);
    }
    expect(dimFlights, 'no greyed section was in flight to check').toBeGreaterThan(0);

    await context.close();
  });

  test('the orb is a circle at the box the morph measures, at the row’s left edge', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    const orbs = await page.locator('.filetree-row[data-node-id] .filetree-glyph').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const row = (el.parentElement as HTMLElement).getBoundingClientRect();
        return {
          w: Math.round(box.width),
          h: Math.round(box.height),
          radius: getComputedStyle(el).borderRadius,
          fromLeft: Math.round(box.left - row.left),
        };
      }),
    );
    for (const orb of orbs) {
      // Square, so it is a circle rather than a lozenge — and `endOf`'s
      // `min(width, height)` is the same 18px the tile it replaced gave.
      expect(orb.w).toBe(orb.h);
      expect(orb.h).toBeGreaterThanOrEqual(12);
      expect(orb.h).toBeLessThan(20);
      expect(parseFloat(orb.radius)).toBeGreaterThanOrEqual(orb.w / 2);
      expect(orb.fromLeft).toBeLessThan(8);
    }

    await context.close();
  });
});

test.describe('VB-46 — one rule, and both views obey it', () => {
  test('List and Brain agree, node for node, about what is live', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    const inList = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
      Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.nodeId, (el as HTMLElement).dataset.life])),
    );
    // All three really are on screen, or the comparison below is vacuous.
    expect(new Set(Object.values(inList))).toEqual(new Set(['live', 'lit', 'dim']));

    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', 'brain');
    await page.waitForTimeout(700);

    const inBrain = await page.locator('.brainglobe-node[data-section-id]').evaluateAll((els) =>
      Object.fromEntries(
        els
          .filter((el) => (el as HTMLElement).dataset.sectionId)
          .map((el) => [(el as HTMLElement).dataset.sectionId, (el as HTMLElement).dataset.nodeLife]),
      ),
    );
    // The whole of VB-46's last line, as one assertion.
    expect(inBrain).toEqual(inList);

    // …and the picture really is drawn from it: only the live section wears a
    // halo, and every dim one is a muted orb with no bloom behind it.
    await expect(page.locator('.brainglobe-halo')).toHaveCount(1);
    const haloOn = await page.locator('.brainglobe-halo').evaluate(
      (el) => (el.closest('.brainglobe-node') as HTMLElement).dataset.sectionId,
    );
    expect(inList[haloOn!]).toBe('live');
    const drawn = await page.locator('.brainglobe-node[data-section-id]').evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).dataset.sectionId)
        .map((el) => ({
          life: (el as HTMLElement).dataset.nodeLife,
          lit: el.querySelector('.brainglobe-orb')!.getAttribute('data-lit'),
          bloom: el.querySelector('.brainglobe-bloom') !== null,
        })),
    );
    for (const node of drawn) {
      expect(node.lit).toBe(node.life === 'dim' ? 'muted' : 'lit');
      expect(node.bloom).toBe(node.life !== 'dim');
    }

    await context.close();
  });

  /**
   * V2.0 VB-55 removed the third thing in this bundle — the status pill — and
   * kept the count and the percentage, which is what the row's right end is
   * now. So this measures the two that remain: still bundled, still at the
   * right end, still clear of the name, still inside a 44px band.
   */
  test('count and figure are one column at the right end of the row', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    const rows = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
      els.map((el) => {
        const pick = (sel: string) => {
          const found = el.querySelector(sel) as HTMLElement | null;
          return found ? found.getBoundingClientRect().toJSON() : null;
        };
        return {
          id: (el as HTMLElement).dataset.nodeId,
          row: el.getBoundingClientRect().toJSON(),
          label: pick('.filetree-label')!,
          counts: pick('.filetree-counts')!,
          count: pick('.filetree-count')!,
          percent: pick('.filetree-percent')!,
          pill: pick('.sectionhealth-pill'),
          height: Math.round(el.getBoundingClientRect().height),
        };
      }),
    );

    for (const row of rows) {
      // No pill anywhere in the bundle any more (VB-55).
      expect(row.pill, `${row.id} still has a status pill`).toBe(null);
      // BUNDLED: the two sit in one column, right-aligned to each other.
      expect(Math.abs(row.counts.right - row.percent.right), `${row.id} column ragged`).toBeLessThanOrEqual(2);
      // AT THE RIGHT END: past the middle of the row, and clear of the name.
      expect(row.counts.left, `${row.id} bundle is not at the right end`).toBeGreaterThan(
        row.row.left + row.row.width / 2,
      );
      expect(row.label.right, `${row.id} name runs into the bundle`).toBeLessThanOrEqual(row.counts.left + 1);
      // IN ORDER: the count, then the figure.
      expect(row.count.right, `${row.id}`).toBeLessThanOrEqual(row.percent.left + 1);
      // …and inside the row, which is what stops any of it being clipped.
      expect(row.counts.right).toBeLessThanOrEqual(row.row.right + 1);
      // The row is still exactly the 44px control band it has always been.
      expect(row.height, row.id).toBe(44);
    }

    await context.close();
  });

  test('the live row pulses, and it is the only one that does', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    const ringOf = (life: string) =>
      page.locator(`.filetree-row[data-life="${life}"] .filetree-glyph`).first().evaluate((el) => {
        const after = getComputedStyle(el, '::after');
        return { name: after.animationName, duration: after.animationDuration, iterations: after.animationIterationCount };
      });

    const live = await ringOf('live');
    expect(live.name, 'the live row has no pulse').not.toBe('none');
    expect(live.iterations, 'the pulse stops').toBe('infinite');
    // Slower than every other cue in the panel: this is perpetual motion on
    // the busiest screen in the product and it must not compete with the
    // question above it (docs/V1.8-REFINEMENT.md's fourth conflict).
    expect(parseFloat(live.duration)).toBeGreaterThanOrEqual(2);

    // Nothing else on the list moves.
    expect((await ringOf('lit')).name).toBe('none');
    expect((await ringOf('dim')).name).toBe('none');

    // And it really travels — sampled in the page, because a named animation
    // that never changes a pixel would pass every assertion above.
    const widths = await page.locator('.filetree-row[data-life="live"] .filetree-glyph').first().evaluate(
      (el) =>
        new Promise<number[]>((resolve) => {
          const seen: number[] = [];
          const tick = () => {
            const ring = el.getAnimations({ subtree: true })[0];
            seen.push(ring ? Number(ring.currentTime ?? 0) : -1);
            if (seen.length < 30) requestAnimationFrame(tick);
            else resolve(seen);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(new Set(widths).size, 'the pulse is named but frozen').toBeGreaterThan(5);

    await context.close();
  });

  test('reduced motion: the live row is still marked, without anything moving', async () => {
    const { context, sw, id } = await launchExtension('reduce');
    await seedAnswers(sw, midInterview());
    const page = await openList(context, id);

    const live = page.locator('.filetree-row[data-life="live"] .filetree-glyph').first();
    const still = await live.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return {
        animationName: after.animationName,
        opacity: after.opacity,
        borderWidth: after.borderTopWidth,
        // The ring on the orb itself, which was never an animation.
        shadow: getComputedStyle(el).boxShadow,
      };
    });
    expect(still.animationName).toBe('none');
    // The still equivalent CARRIES THE SAME INFORMATION: a ring, at full
    // strength, on the one row nothing else on the list wears one on.
    expect(Number(still.opacity)).toBe(1);
    expect(parseFloat(still.borderWidth)).toBeGreaterThan(0);
    expect(still.shadow).not.toBe('none');
    await expect(page.locator('.filetree-row[data-life="live"]')).toHaveCount(1);

    // Everything else the row says is unchanged.
    const row = page.locator('.filetree-row[data-life="live"]').first();
    await expect(row.locator('.filetree-count')).toHaveText(/^\d+ of \d+$/);
    await expect(row.locator('.filetree-percent')).toHaveText(new RegExp(`^\\d+% ${S.sectionPercentComplete}$`));
    await expect(row.locator('.filetree-srstate')).toHaveText(S.fileTreeStateCurrent);

    await context.close();
  });

  test('nothing about the orbs or the bundle is stored', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = midInterview();
    await seedAnswers(sw, seeded);
    const page = await openList(context, id);
    await page.waitForSelector('.filetree-count');

    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(keys.filter((key) => /life|orb|live|percent|gradient/i.test(key))).toEqual([]);
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'] as Answers);
    expect(stored).toEqual(seeded);

    await context.close();
  });
});
