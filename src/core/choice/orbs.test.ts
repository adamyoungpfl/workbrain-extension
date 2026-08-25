import { describe, it, expect } from 'vitest';
import { contextModules } from '../flow/flow';
import { ROTATION_RUNNING, viewFor, type RotationInput } from '../motion/rotation';
import { ORB_CHOICE_QUESTIONS, isOutlined, usesOrbChoice } from './orbs';

/** Every top-level question in the Context interview, flattened. */
function questions() {
  return contextModules.flatMap((module) =>
    module.nodes.flatMap((node) => ('fields' in node ? node.fields : [node])),
  );
}

describe('which questions are asked as orbs', () => {
  it('is the roles question, which is what VB-60 names', () => {
    expect(ORB_CHOICE_QUESTIONS).toEqual(['role_names']);
  });

  it('finds a real question in the shipped flow, with the shape it claims', () => {
    // Not a spelling test on a string literal: if `role_names` were renamed
    // upstream, the picker would silently never render and every assertion
    // about it would still pass.
    const step = questions().find((q) => q.id === 'role_names');
    expect(step, 'role_names is no longer in the flow').toBeDefined();
    expect(step!.kind).toBe('multi');
    expect(step!.allowCustom).toBe(true);
    expect(step!.options?.length).toBeGreaterThan(1);
    expect(usesOrbChoice(step!)).toBe(true);
  });

  it('carries no recommended option, which is the one thing an orb cannot draw yet', () => {
    // `PillGroup` gives a recommended option a ring (`suggested`), and V1.6's
    // recommendations engine sets `rec` on four questions. `role_names` is not
    // one of them, so `OrbOption` deliberately has no `suggested` — but the
    // day the engine reaches an orb question, that ring would vanish without a
    // word. This is the line that would not let it.
    for (const step of questions().filter((q) => usesOrbChoice(q))) {
      expect(step.options?.some((o) => o.rec), `${step.id} now recommends an option`).toBeFalsy();
    }
  });

  it('leaves every other question on pills', () => {
    const orbed = questions().filter((q) => usesOrbChoice(q)).map((q) => q.id);
    expect(orbed).toEqual(['role_names']);
  });

  it('needs the kind as well as the id — a question that stopped being a multi-select stops wearing orbs', () => {
    expect(usesOrbChoice({ id: 'role_names', kind: 'chips' })).toBe(false);
    expect(usesOrbChoice({ id: 'peeves', kind: 'multi' })).toBe(false);
  });
});

describe('which orb wears the travelling outline', () => {
  const input = (over: Partial<RotationInput> = {}): RotationInput => ({
    count: 6,
    mode: 'one',
    reduced: false,
    holds: [],
    life: ROTATION_RUNNING,
    ...over,
  });

  it('is one of them while it travels', () => {
    const view = viewFor(input(), 2);
    expect([0, 1, 2, 3, 4, 5].map((i) => isOutlined(view, i))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('is all of them under reduced motion — the still version says MORE', () => {
    const view = viewFor(input({ reduced: true }), 2);
    expect([0, 1, 2, 3, 4, 5].every((i) => isOutlined(view, i))).toBe(true);
  });

  it('is all of them when there is only one choice — nothing to travel between', () => {
    expect(isOutlined(viewFor(input({ count: 1 }), 0), 0)).toBe(true);
  });

  it('does not go out when the rotation stops — it freezes where it was', () => {
    // The same call `core/motion/rotation.ts` makes for the follow-up link:
    // `viewFor` is deliberately blind to `life`, so stopping freezes the
    // presentation rather than changing it. One machine, both surfaces.
    const stopped = input({ life: { kind: 'stopped', by: 'click' } });
    expect(viewFor(stopped, 3)).toEqual({ kind: 'one', index: 3 });
    expect(isOutlined(viewFor(stopped, 3), 3)).toBe(true);
  });
});
