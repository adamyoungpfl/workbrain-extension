import { describe, expect, it } from 'vitest';
import { WRITTEN_SLIP_LINES, writtenLineFor, writtenSlip } from './writtenLine';
import { generateContextFile } from './generate';
import { contextModules } from '../flow/flow';
import type { Answers } from '../../schema/storage.types';

/**
 * BS-05c (§5) — "a two-line slip under the answer holding the actual markdown
 * that just landed."
 *
 * The claim worth testing is ACTUAL: what the slip shows is a substring of the
 * file the download writes, not a rendering that resembles one.
 */

function answers(values: Answers['values']): Answers {
  return { values, repeatables: {}, answeredAt: {}, reflectedAt: {} };
}

describe('writtenLineFor', () => {
  it('is a real substring of the generated file', () => {
    const store = answers({ stop_explaining: 'That I work in health data, every single time.' });
    const line = writtenLineFor('stop_explaining', store, contextModules);

    expect(line).not.toBeNull();
    // THE CLAIM. Not "looks like the file" — IS the file.
    expect(generateContextFile(store, '3 March 2026')).toContain(line!);
  });

  it('is the question in bold and the answer under it, the file’s own shape', () => {
    const line = writtenLineFor(
      'stop_explaining',
      answers({ stop_explaining: 'That I work in health data.' }),
      contextModules,
    );
    expect(line!.startsWith('**')).toBe(true);
    expect(line!.split('\n')[1]).toBe('That I work in health data.');
  });

  it('resolves a chips answer to its label, exactly as the file does', () => {
    const store = answers({ context_scope: 'work' });
    const line = writtenLineFor('context_scope', store, contextModules);
    expect(line).not.toBeNull();
    expect(generateContextFile(store, '3 March 2026')).toContain(line!);
    // The stored key never reaches the slip, because it never reaches the file.
    expect(line).not.toContain('work\n');
  });

  it('writes NOTHING for a skip — the drawer shows it, the slip is for momentum', () => {
    expect(writtenLineFor('stop_explaining', answers({ stop_explaining: null }), contextModules)).toBeNull();
  });

  it('writes nothing for a gate, an intro, or a question nobody answered', () => {
    expect(writtenLineFor('entities_gate', answers({ entities_gate: 'yes' }), contextModules)).toBeNull();
    expect(writtenLineFor('orientation_ready', answers({ orientation_ready: null }), contextModules)).toBeNull();
    expect(writtenLineFor('stop_explaining', answers({}), contextModules)).toBeNull();
  });

  it('writes nothing for a field of a repeatable — the record is rendered whole', () => {
    // `role_mandate` lands inside a role's own section, so no single line is
    // "the line it wrote", and naming one would invent a fact.
    const store: Answers = {
      values: {},
      repeatables: { roles: [{ role_name: 'Employee', role_mandate: 'Own the platform' }] },
      answeredAt: {},
      reflectedAt: {},
    };
    expect(writtenLineFor('role_mandate', store, contextModules)).toBeNull();
  });

  it('never returns a line for a question the flow does not have', () => {
    expect(writtenLineFor('not_a_question', answers({}), contextModules)).toBeNull();
  });
});

describe('writtenSlip', () => {
  it('leads with what the person WROTE, not the question they answered', () => {
    const slip = writtenSlip('**A question**\nfirst\nsecond\nthird');
    // The whole point of the split: the answer is the content, the question
    // is the caption. A slip that led with the question showed somebody a
    // sentence they had just finished reading.
    expect(slip).toEqual({ heading: 'A question', body: ['first', 'second'], more: 1 });
    expect(WRITTEN_SLIP_LINES).toBe(2);
  });

  it('cuts by line rather than by character, so a choice stays whole', () => {
    const slip = writtenSlip('**Which tools?**\n- Power BI\n- Teams\n- Excel');
    expect(slip!.body).toEqual(['- Power BI', '- Teams']);
    expect(slip!.more).toBe(1);
  });

  it('strips the file’s bold markers from the caption and nothing else', () => {
    const slip = writtenSlip('**Q**\nAn answer with **emphasis** inside it');
    expect(slip!.heading).toBe('Q');
    // The answer is the file's bytes, untouched — markers included.
    expect(slip!.body).toEqual(['An answer with **emphasis** inside it']);
  });

  it('says nothing was cut when nothing was', () => {
    expect(writtenSlip('**Q**\nA')).toEqual({ heading: 'Q', body: ['A'], more: 0 });
  });

  it('passes null through, and refuses a line with no answer in it', () => {
    expect(writtenSlip(null)).toBeNull();
    expect(writtenSlip('**Q only**')).toBeNull();
  });
});
