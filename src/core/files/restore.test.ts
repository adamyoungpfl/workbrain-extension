import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { ParsedAnswers } from './parse';
import { contextModules } from '../flow/flow';
import { buildImportedAnswers } from './restore';

/**
 * `buildImportedAnswers` is the one piece of R1-10 that isn't DOM-touching
 * — it's the pure step between `parseContextFile()`'s output and what gets
 * handed to `setLocal('wb:answers', …)`. See restore.ts's header comment
 * for exactly what it's for: every restored key gets `answeredAt`; only
 * `text`+`interpret` keys with a typed value get `reflectedAt` (matching
 * core/flow/runner.ts's `actionFor` condition exactly); and `intro`/`yesno`
 * top-level questions — which generate.ts never writes to the file at all,
 * so `parsed.values` can never contain them — get filled in so a "done"
 * interview reads back as "done" again instead of `findPosition` sending it
 * all the way back to the first intro screen (a real bug this file's tests
 * caught being fixed, found via tests/e2e/download-import.spec.ts).
 */

const introStep: Step = { id: 'welcome', module: 1, section: 0, eyebrow: 'E', q: 'Welcome', kind: 'intro' };
const plainText: Step = { id: 'bio', module: 1, section: 0, eyebrow: 'E', q: 'Describe yourself', kind: 'text', key: 'bio' };
const chipsStep: Step = {
  id: 'scope',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Work, personal, or both?',
  kind: 'chips',
  key: 'scope',
  options: [{ v: 'work', l: 'Work' }],
};
const interpretedText: Step = {
  id: 'stop_thing',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'What do you want to stop explaining?',
  kind: 'text',
  key: 'stop_thing',
  interpret: { via: 'echo', reflectPrefix: 'I heard:' },
};

const roleFor: Step = { id: 'role_for', module: 2, section: 1, eyebrow: 'E', q: 'Who is this for?', kind: 'chips', key: 'role_for', options: [{ v: 'employer', l: 'My employer' }] };
const roleMandate: Step = {
  id: 'role_mandate',
  module: 2,
  section: 1,
  eyebrow: 'E',
  q: 'What are you there to do?',
  kind: 'text',
  key: 'role_mandate',
  interpret: { via: 'echo' },
};
const rolesBlock: RepeatableBlock = {
  id: 'roles',
  addAnotherPrompt: '',
  seedFrom: { questionId: 'role_names', seedField: 'role_name' },
  fields: [roleFor, roleMandate],
};

// A gate yes-no + open-ended repeatable pair, matching the real content's
// entities_gate/entities and initiatives_gate/initiatives_records shape
// exactly (see restore.ts's header comment, point 3).
//
// V2.0 VB-61/VB-63: the block NAMES ITS GATE, and this fixture's block id is
// deliberately not the gate's id with `_gate` sliced off — that is precisely
// the shape (`initiatives_gate` -> `initiatives_records`) the old
// naming-convention guess got wrong in real content for four releases.
const thingsGate: Step = { id: 'things_gate', module: 3, section: 2, eyebrow: 'E', q: 'Anything else?', kind: 'yesno', key: 'things_gate' };
const thingName: Step = { id: 'thing_name', module: 3, section: 2, eyebrow: 'E', q: 'Name it', kind: 'text', key: 'thing_name' };
const thingsBlock: RepeatableBlock = {
  id: 'things_records',
  addAnotherPrompt: 'Another thing?',
  gateQuestionId: 'things_gate',
  skipIf: (ctx) => ctx.answers.things_gate === 'no',
  fields: [thingName],
};

// A yes-no question no block claims — restore.ts's own documented limit:
// nothing links this to a block, so it must be left alone rather than
// guessed at.
const looseYesNo: Step = { id: 'subscribe', module: 3, section: 2, eyebrow: 'E', q: 'Keep me posted?', kind: 'yesno', key: 'subscribe' };

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'Orientation',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [introStep, chipsStep, plainText, interpretedText],
  },
  { id: 'm2', n: 2, title: 'Roles', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [rolesBlock] },
  { id: 'm3', n: 3, title: 'World', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [thingsGate, thingsBlock, looseYesNo] },
];

function parsed(overrides: Partial<ParsedAnswers> = {}): ParsedAnswers {
  return { values: {}, repeatables: {}, ...overrides };
}

const AT = '2026-08-20T12:00:00.000Z';

describe('buildImportedAnswers', () => {
  it('stamps answeredAt for every top-level restored key, including an explicit skip', () => {
    const input = parsed({ values: { scope: 'work', bio: null, stop_thing: 'meetings' } });
    const result = buildImportedAnswers(input, AT, modules);

    expect(result.answeredAt).toMatchObject({ scope: AT, bio: AT, stop_thing: AT });
  });

  it('stamps reflectedAt only for a text+interpret key with a typed value', () => {
    const input = parsed({ values: { scope: 'work', bio: 'I run ops.', stop_thing: 'meetings' } });
    const result = buildImportedAnswers(input, AT, modules);

    // scope (chips) and bio (text, no interpret) never get a reflectedAt entry.
    expect(result.reflectedAt).toEqual({ stop_thing: AT });
  });

  it('does not stamp reflectedAt for an interpret-bearing question that was explicitly skipped', () => {
    const input = parsed({ values: { stop_thing: null } });
    const result = buildImportedAnswers(input, AT, modules);

    expect(result.reflectedAt).toEqual({});
    expect(result.answeredAt.stop_thing).toBe(AT);
  });

  /**
   * V2.5 VB-120 — the deliberate asymmetry with reflectedAt, pinned. The
   * file carries no stamp maps, so an import cannot know which answers the
   * AI Assist sheet landed — and it does not need to: every restored
   * interpret value is reflectedAt-stamped above, and reflectedAt alone
   * keeps the recheck shut (runner.ts's actionFor checks it first). An
   * invented assistedAt would be a recorded fact the file never contained.
   */
  it('never invents assistedAt — the import records only what the file can actually say (VB-120)', () => {
    const input = parsed({
      values: { scope: 'work', stop_thing: 'A long enough answer about meetings and their many recurring costs.' },
      repeatables: { roles: [{ role_name: 'Employee', role_mandate: 'Keep the reports accurate.' }] },
    });
    const result = buildImportedAnswers(input, AT, modules);

    expect(result.assistedAt).toBeUndefined();
    // And the import still lands "done", not back in the recheck — the
    // reflectedAt stamp is doing that job on its own.
    expect(result.reflectedAt.stop_thing).toBe(AT);
  });

  it('stamps compound keys for repeatable fields, reflectedAt only where interpret applies', () => {
    const input = parsed({
      repeatables: {
        roles: [
          { role_name: 'Employee', role_for: 'employer', role_mandate: 'Keep the reports accurate.' },
          { role_name: 'Volunteer', role_for: 'employer', role_mandate: null },
        ],
      },
    });
    const result = buildImportedAnswers(input, AT, modules);

    expect(result.answeredAt).toMatchObject({
      'roles#0#role_name': AT,
      'roles#0#role_for': AT,
      'roles#0#role_mandate': AT,
      'roles#1#role_name': AT,
      'roles#1#role_for': AT,
      'roles#1#role_mandate': AT,
    });
    // Only record 0's role_mandate is a typed interpret answer — record 1's is
    // an explicit skip (null), record 0/1's role_for isn't interpret-bearing
    // at all, and role_name has no Step (it's the seed field, never a real
    // question) so stepByKey.get() can't find it and it's correctly excluded.
    expect(result.reflectedAt).toEqual({ 'roles#0#role_mandate': AT });
  });

  it('passes through restored values/repeatables unchanged, aside from filling the intro/yesno gap', () => {
    const input = parsed({
      values: { scope: 'work', bio: null },
      repeatables: { roles: [{ role_name: 'Employee', role_for: 'employer', role_mandate: 'Own it.' }] },
    });
    const result = buildImportedAnswers(input, AT, modules);

    expect(result.values).toMatchObject(input.values);
    expect(result.repeatables).toEqual(input.repeatables);
  });

  it('fills every intro-kind top-level question with null, even for an otherwise empty import', () => {
    const result: Answers = buildImportedAnswers(parsed(), AT, modules);
    expect(result.values.welcome).toBeNull();
    expect(result.answeredAt.welcome).toBe(AT);
  });

  it('never overwrites a value parseContextFile actually did produce for a key', () => {
    // Contrived (generate.ts never writes an intro's value) but proves the
    // gap-fill only ever touches keys genuinely absent from the parsed file.
    const result = buildImportedAnswers(parsed({ values: { welcome: 'somehow present' } }), AT, modules);
    expect(result.values.welcome).toBe('somehow present');
  });

  it('infers a gate yes-no as "yes" when the block that names it has restored records', () => {
    const input = parsed({ repeatables: { things_records: [{ thing_name: 'A thing' }] } });
    const result = buildImportedAnswers(input, AT, modules);
    expect(result.values.things_gate).toBe('yes');
  });

  it('infers a gate yes-no as "no" when the block that names it has no restored records', () => {
    const result = buildImportedAnswers(parsed(), AT, modules);
    expect(result.values.things_gate).toBe('no');
  });

  it('leaves a yes-no question alone when no block claims it', () => {
    const result = buildImportedAnswers(parsed(), AT, modules);
    expect(result.values.subscribe).toBeUndefined();
    expect(result.answeredAt.subscribe).toBeUndefined();
  });

  it('returns an Answers shape with only the intro/gate keys filled in for an entirely empty import', () => {
    const result: Answers = buildImportedAnswers(parsed(), AT, modules);
    expect(result.values).toEqual({ welcome: null, things_gate: 'no' });
    expect(result.repeatables).toEqual({});
  });

  /**
   * THE BUG `gateQuestionId` EXISTS TO CLOSE, asserted against the real flow
   * rather than a fixture — because the fixture is the thing that was wrong.
   *
   * `initiatives_gate` gates `initiatives_records`, not `initiatives`. Slicing
   * `_gate` off the id found no block, read zero records, and wrote "no" into
   * every imported file however many initiatives it carried. Since V2.0 VB-63
   * that "no" is permanent and takes a REQUIRED block out of the interview, so
   * the person's own initiatives would come back unreachable.
   */
  it('imports a real file full of initiatives without declaring the section declined', () => {
    const result = buildImportedAnswers(
      parsed({
        repeatables: {
          entities: [{ entity_type: 'person', entity_name: 'Priya' }],
          initiatives_records: [{ initiative_name: 'The Q4 rebrand' }],
        },
      }),
      AT,
    );
    expect(result.values.initiatives_gate).toBe('yes');
    expect(result.values.entities_gate).toBe('yes');

    // And the blocks really are still in the interview, which is what "yes"
    // has to buy — the assertion the id-level one is a proxy for.
    const initiatives = contextModules
      .flatMap((m) => m.nodes)
      .find((n) => 'fields' in n && n.id === 'initiatives_records') as RepeatableBlock;
    expect(initiatives.skipIf?.({ answers: result.values, repeatables: result.repeatables })).toBe(false);
  });

  it('still records a genuinely empty section as declined, so nothing re-opens it', () => {
    const result = buildImportedAnswers(parsed(), AT);
    expect(result.values.initiatives_gate).toBe('no');
    expect(result.values.entities_gate).toBe('no');
  });

  it('defaults `modules` to the real ported flow when not overridden', () => {
    // Smoke check only — real content specifics are generate.test.ts/parse.test.ts's
    // job. Just confirms the default parameter wires up without throwing.
    const result = buildImportedAnswers(parsed({ values: { preferred_name: 'Jordan' } }), AT);
    expect(result.answeredAt.preferred_name).toBe(AT);
  });
});
