import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistBarLine } from '../../src/core/flow/assistCopy';
import { S } from '../../src/panel/strings';
import type { Answers } from '../../src/schema/storage.types';
import { finishedContext } from './fixtures/answers';

/**
 * BR-02 (DEF-1) — AI ASSIST READS THE GOAL GATE FROM WHEREVER IT LIVES.
 *
 * `Flow` loads exactly one answers store, whichever `answersKey` names. The
 * Skills interview mounts it with `wb:answers:skills`, and the goal gate's
 * `goal_service` / `goal_want` live in `wb:answers` — Context's store. So
 * three cross-file builders read a store those keys are not in and all three
 * fell to their no-answer branch: every AI Assist inside Skills said "your AI"
 * instead of naming the service, and the door to that service never appeared.
 *
 * Silently, which is why it shipped. The output was indistinguishable from the
 * correct output for somebody who genuinely had not answered the gate.
 *
 * The claim here is end-to-end and in the real panel, because the unit tests
 * (interviewMe.test.ts, assistServices.test.ts) can only prove the builders
 * read `contextAnswers` when it is handed to them. What they cannot prove is
 * that `Flow` actually hands it over inside Skills — which is the half that
 * was broken.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const NOW = '2026-08-28T09:00:00.000Z';

/** The gate answered, in CONTEXT's store, which is the only place it is ever
 *  answered. `chatgpt` because interview-me.spec.ts uses the same service and
 *  its label is what `assistBarLine` prints. */
/**
 * A FINISHED Context, with the goal gate answered — and it has to be finished,
 * because the Skills row unlocks only for a built-and-earned Context
 * (`core/files/slots.ts`). The gate's two answers are then overwritten with
 * real ones, since they are the whole subject here.
 */
function contextWithGate(): Answers {
  const done = finishedContext();
  done.values['goal_service'] = 'chatgpt';
  done.values['goal_want'] = 'Draft my Monday status update the way I would.';
  done.answeredAt['goal_service'] = NOW;
  done.answeredAt['goal_want'] = NOW;
  return done;
}

/** The same finished file with the gate SKIPPED — the only way to reach the
 *  Skills interview without a service, since Skills needs Context finished. */
function contextWithoutGate(): Answers {
  const done = finishedContext();
  done.values['goal_service'] = null;
  done.values['goal_want'] = null;
  return done;
}

/**
 * Skills seeded so the runner RESUMES on `skill_steps` — a text question in
 * the recipes block that offers the assist. Everything before it in the record
 * is answered, and `skills_orientation` is a slide that has been seen, so
 * `findPosition` walks straight past both and lands on the subject.
 */
function skillsAtSteps(): Answers {
  return {
    values: { skills_orientation: null, skill_seed: ['status_report'] },
    repeatables: {
      skills: [
        {
          skill_name: 'A status update or report',
          skill_trigger: 'Every Friday, before the leadership sync.',
          skill_inputs: 'Last week\u2019s numbers and the open-issue list.',
          skill_tools: 'The reporting tool and my notes.',
          skill_data_home: 'The shared drive.',
        },
      ],
    },
    answeredAt: {},
    reflectedAt: {},
  };
}

async function launchOnSkills(context: Answers): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
  await sw.evaluate(
    async ({ skills, ctx }) => {
      await chrome.storage.local.set({ 'wb:answers:skills': skills, 'wb:answers': ctx });
    },
    { skills: skillsAtSteps(), ctx: context },
  );
  const page = await browser.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return { context: browser, page };
}

/** Into the Skills interview, and on to a text question wearing an assist. */
async function openAssistInSkills(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Skills\.md/ }).click();
  console.log('AFTER ROW ' + (await page.locator('.browse, .fileview, .home').first().getAttribute('class')));
  console.log('BUTTONS ' + JSON.stringify((await page.getByRole('button').allTextContents()).slice(0, 25)));
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  console.log('POS ' + (await page.locator('.flow').getAttribute('data-position')) + ' ' + (await page.locator('.flow').getAttribute('data-step-id')));
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // The chip only exists on a question that offers the assist; walk forward
  // until one does rather than pinning a question id, so a re-ordered module
  // does not fail this as if it were the bug.
  const chip = page.getByRole('button', { name: S.assistRecommended, exact: true });
  for (let i = 0; i < 12 && (await chip.count()) === 0; i++) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.mouse.move(0, 0);
  }
  await expect(chip, 'no AI Assist anywhere in the Skills interview').toHaveCount(1);
  await chip.click();
  await page.mouse.move(0, 0);
  await page.waitForSelector('.assistbar-line');
}

test.describe('BR-02 — the assist inside Skills reads the Context store', () => {
  test('names the service the person chose, and opens its door', async () => {
    const { context, page } = await launchOnSkills(contextWithGate());
    await openAssistInSkills(page);

    // THE DEFECT, stated as its fix: this line said "your AI" for every
    // question in the Skills interview.
    await expect(page.locator('.assistbar-line')).toHaveText(assistBarLine('ChatGPT'));
    await expect(page.locator('.assistbar-line')).not.toContainText('your AI');

    // And the door is real — the other half of the same missing answer.
    const door = page.locator('.assistbar-link');
    await expect(door).toHaveText(S.assistOpenService('ChatGPT'));
    await expect(door).toHaveAttribute('href', 'https://chatgpt.com/');

    await context.close();
  });

  test('carries the goal into the prompt, which is a Context answer on a Skills screen', async () => {
    const { context, page } = await launchOnSkills(contextWithGate());
    await openAssistInSkills(page);

    // The prompt is behind its expander — present, never assumed read.
    await page.getByRole('button', { name: S.assistReadPrompt, exact: true }).click();
    await expect(page.locator('.assistbar .readonly')).toContainText(
      'Draft my Monday status update the way I would.',
    );

    await context.close();
  });

  test('still says "your AI" when the gate really was never answered', async () => {
    // The no-answer branch is CORRECT — it was only ever wrong because it was
    // firing for people who had answered. Somebody who opened Skills first
    // genuinely has no service to name, and gets the same calm sentence.
    const { context, page } = await launchOnSkills(contextWithoutGate());
    await openAssistInSkills(page);

    await expect(page.locator('.assistbar-line')).toHaveText(assistBarLine(undefined));
    await expect(page.locator('.assistbar-link')).toHaveCount(0);

    await context.close();
  });

  test('never writes to the Context store from a Skills screen', async () => {
    const { context, page } = await launchOnSkills(contextWithGate());
    const sw = context.serviceWorkers()[0]!;
    const before = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));

    await openAssistInSkills(page);
    // Change the answer on this screen, which persists — to the SKILLS store.
    await page.getByRole('button', { name: S.assistRecommended, exact: true }).click();
    await page.locator('.flow textarea').fill('An answer typed on a Skills screen.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(300);

    // The read is read-only. A Skills screen must not be able to edit the
    // Context file, which is the whole reason `contextAnswers` is a separate
    // channel and not a merge.
    const after = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(after).toEqual(before);

    await context.close();
  });
});
