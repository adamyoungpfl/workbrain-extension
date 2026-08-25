import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules } from '../flow/flow';
import { findPosition } from '../flow/runner';
import { narrationFor, narrationForFollowUp, spokenQuestion, type NarrationCopy } from './narration';

const makeAnswers = (overrides: Partial<Answers> = {}): Answers => ({
  values: {},
  repeatables: {},
  answeredAt: {},
  reflectedAt: {},
  ...overrides,
});

const COPY: NarrationCopy = {
  reflectCta: 'Keep it as-is, tighten it with your AI, or say it again.',
  moduleIntro: (id) => (id === 'about-me' ? ['Now the __basics__.', 'Not your job title.'] : []),
};

const textStep: Step = {
  id: 'q_text',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'What do you do?',
  hint: 'A hint nobody asked to hear.',
  kind: 'text',
  key: 'q_text',
  rephrasings: ['Say it another way?'],
  interpret: { via: 'echo', reflectPrefix: 'I heard:' },
};

const introStep: Step = {
  id: 'q_intro',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'The written-out version of the same thing.',
  kind: 'intro',
  beats: ['This takes __ten__ minutes.', 'Stop whenever you like.'],
};

const block: RepeatableBlock = {
  id: 'items',
  addAnotherPrompt: 'Add another one?',
  fields: [textStep],
};

const module: Module = {
  id: 'about-me',
  n: 1,
  title: 'About Me',
  purpose: 'p',
  required: true,
  estimatedMinutes: [1, 2],
  nodes: [textStep],
};

describe('narrationFor', () => {
  it('reads the question on a question screen, and nothing else on it', () => {
    const narration = narrationFor(
      { kind: 'step', step: textStep, location: { in: 'top' } },
      makeAnswers(),
      COPY,
    );
    expect(narration).toEqual({ role: 'question', text: 'What do you do?' });
    expect(narration?.text).not.toContain('hint');
  });

  it('reads the wording that is showing, not the one it replaced', () => {
    const rephrased = narrationFor(
      { kind: 'step', step: textStep, location: { in: 'top' } },
      makeAnswers(),
      COPY,
      { rephraseIndex: 1 },
    );
    expect(rephrased).toEqual({ role: 'question', text: 'Say it another way?' });

    // Past the end of the list, `StepView` cycles back to the question as
    // written — and so does the voice.
    expect(
      narrationFor({ kind: 'step', step: textStep, location: { in: 'top' } }, makeAnswers(), COPY, {
        rephraseIndex: 0,
      })?.text,
    ).toBe('What do you do?');
  });

  it('reads an intro as its beats, in the recap voice, with the emphasis marks stripped', () => {
    expect(
      narrationFor({ kind: 'step', step: introStep, location: { in: 'top' } }, makeAnswers(), COPY),
    ).toEqual({ role: 'recap', text: 'This takes ten minutes. Stop whenever you like.' });
  });

  it('reads an intro with no beats as its own text', () => {
    const { beats: _beats, ...rest } = introStep;
    const bare: Step = rest;
    expect(
      narrationFor({ kind: 'step', step: bare, location: { in: 'top' } }, makeAnswers(), COPY)?.text,
    ).toBe('The written-out version of the same thing.');
  });

  it('reads the "add another" prompt as a question', () => {
    expect(narrationFor({ kind: 'add-another', block, recordIndex: 1 }, makeAnswers(), COPY)).toEqual({
      role: 'question',
      text: 'Add another one?',
    });
  });

  it('plays the stored answer back on a reflect screen, then the way forward', () => {
    const answers = makeAnswers({ values: { q_text: '  I run  delivery for two teams. ' } });
    expect(narrationFor({ kind: 'reflect', step: textStep, location: { in: 'top' } }, answers, COPY)).toEqual({
      role: 'recap',
      text: 'I heard: I run delivery for two teams. Keep it as-is, tighten it with your AI, or say it again.',
    });
  });

  it('reads a repeatable record’s own answer back, not the top-level one', () => {
    const answers = makeAnswers({
      values: { q_text: 'the top-level answer' },
      repeatables: { items: [{ q_text: 'the second record' }, { q_text: 'the first record' }] },
    });
    expect(
      narrationFor(
        { kind: 'reflect', step: textStep, location: { in: 'repeatable', blockId: 'items', recordIndex: 1 } },
        answers,
        COPY,
      )?.text,
    ).toContain('the first record');
  });

  it('says nothing on a reflect screen with nothing stored to play back', () => {
    expect(
      narrationFor({ kind: 'reflect', step: textStep, location: { in: 'top' } }, makeAnswers(), COPY),
    ).toBeNull();
  });

  /**
   * V2.0 VB-62/VB-64 — the narrator and the screen have to be on the SAME
   * SENTENCE, and since VB-62 a question inside a repeatable phrases itself
   * from the record it is about: `entity_name` says "What's their name?" for a
   * person, and `audience_needs` says the reader's name out loud. Without the
   * record in the context this module would have read the generic fallback
   * aloud while the panel printed the specific one — someone listening and
   * someone reading would have been on two different questions.
   */
  it('speaks the question the way the record makes it read, not the fallback', () => {
    const typed: Step = { ...textStep, q: (ctx) => (ctx.record?.kind === 'person' ? 'Their name?' : 'Its name?') };
    const answers = makeAnswers({ repeatables: { items: [{ kind: 'tool' }, { kind: 'person' }] } });
    expect(
      narrationFor(
        { kind: 'step', step: typed, location: { in: 'repeatable', blockId: 'items', recordIndex: 1 } },
        answers,
        COPY,
      )?.text,
    ).toContain('Their name?');
    expect(
      narrationFor(
        { kind: 'step', step: typed, location: { in: 'repeatable', blockId: 'items', recordIndex: 0 } },
        answers,
        COPY,
      )?.text,
    ).toContain('Its name?');
    // At top level there is no record and the fallback is the honest reading.
    expect(narrationFor({ kind: 'step', step: typed, location: { in: 'top' } }, answers, COPY)?.text).toContain(
      'Its name?',
    );
  });

  it('reads a module transition as its approved lines, in the recap voice', () => {
    expect(narrationFor({ kind: 'module-intro', module }, makeAnswers(), COPY)).toEqual({
      role: 'recap',
      text: 'Now the basics. Not your job title.',
    });
  });

  it('falls back to the module’s own title when it has no transition copy', () => {
    const other: Module = { ...module, id: 'no-copy', title: 'How I Think' };
    expect(narrationFor({ kind: 'module-intro', module: other }, makeAnswers(), COPY)?.text).toBe(
      'How I Think',
    );
  });

  // The one that would be actively hostile: the interview is over, the panel
  // is handing off to Home, and a voice is still reading question forty-nine.
  it('says nothing when the flow is done', () => {
    expect(narrationFor({ kind: 'done' }, makeAnswers(), COPY)).toBeNull();
  });
});

describe('against the real ported interview', () => {
  const answers = makeAnswers();

  it('reads the first screen a person actually lands on', () => {
    const position = findPosition(contextModules, answers, new Set(), new Set());
    const narration = narrationFor(position, answers, COPY);
    expect(position.kind).toBe('step');
    expect(narration?.role).toBe('recap'); // orientation_ready is an intro
    expect(narration?.text.length ?? 0).toBeGreaterThan(20);
    expect(narration?.text).not.toContain('__');
  });

  it('has something to say on every step of the whole interview', () => {
    const steps = contextModules
      .flatMap((m) => m.nodes)
      .flatMap((node) => ('fields' in node ? node.fields : [node]));

    for (const step of steps) {
      const narration = narrationFor({ kind: 'step', step, location: { in: 'top' } }, answers, COPY);
      expect(narration, step.id).not.toBeNull();
      expect(narration?.text.trim(), step.id).not.toBe('');
      // A speech engine reads these literally; none may reach an utterance.
      expect(narration?.text, step.id).not.toContain('__');
      expect(narration?.text, step.id).not.toMatch(/\s{2}/);
    }
  });

  it('reads every rephrasing a question carries', () => {
    const withRephrasings = contextModules
      .flatMap((m) => m.nodes)
      .flatMap((node) => ('fields' in node ? node.fields : [node]))
      .filter((step) => (step.rephrasings?.length ?? 0) > 0);

    expect(withRephrasings.length).toBeGreaterThan(0);
    for (const step of withRephrasings) {
      const ctx = { answers: answers.values, repeatables: answers.repeatables };
      const spoken = new Set<string>();
      for (let i = 0; i <= (step.rephrasings?.length ?? 0); i += 1) {
        spoken.add(spokenQuestion(step, ctx, i));
      }
      expect(spoken.size, step.id).toBeGreaterThan(1);
    }
  });
});

describe('narrationForFollowUp', () => {
  it('reads the answer, in the follow-up voice', () => {
    expect(narrationForFollowUp('  Because it is  yours to change. ')).toEqual({
      role: 'followUp',
      text: 'Because it is yours to change.',
    });
  });

  it('says nothing for an empty answer', () => {
    expect(narrationForFollowUp('   ')).toBeNull();
  });
});
