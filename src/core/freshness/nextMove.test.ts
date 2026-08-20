import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import { computeNextMove, mostRecentAnsweredAt, ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from './nextMove';
import { DUE_AFTER_DAYS } from './clocks';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
}

function roleRecord(name: string, durability: 'current' | 'historical' | null): Record<string, string | null> {
  return { [ROLE_NAME_SEED_FIELD]: name, [ROLE_DURABILITY_KEY]: durability };
}

describe('computeNextMove — wb:answers genuinely empty', () => {
  it('is "start" when nothing has ever been answered', () => {
    expect(computeNextMove(makeAnswers(), NOW)).toEqual({ kind: 'start' });
  });

  it('is not "start" once any top-level value exists, even with no roles', () => {
    const answers = makeAnswers({ values: { preferred_name: 'Alex' } });
    expect(computeNextMove(answers, NOW)).toEqual({ kind: 'current' });
  });

  it('is not "start" once any repeatable record exists, even an empty one', () => {
    const answers = makeAnswers({ repeatables: { entities: [{}] } });
    expect(computeNextMove(answers, NOW)).toEqual({ kind: 'current' });
  });
});

describe('computeNextMove — no roles at all', () => {
  it('is "current" when some progress exists but the roles block was never reached', () => {
    const answers = makeAnswers({ values: { preferred_name: 'Alex' } });
    expect(computeNextMove(answers, NOW)).toEqual({ kind: 'current' });
  });
});

describe('computeNextMove — durability + elapsed time, at the due boundary', () => {
  function withRole(durability: 'current' | 'historical', daysSinceAnswered: number): Answers {
    return makeAnswers({
      values: { role_names: ['manager'] },
      repeatables: { [ROLES_BLOCK_ID]: [roleRecord('Manager', durability)] },
      answeredAt: { [`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`]: daysAgo(daysSinceAnswered) },
    });
  }

  it('a current role answered one day before the threshold is not due', () => {
    expect(computeNextMove(withRole('current', DUE_AFTER_DAYS - 1), NOW)).toEqual({ kind: 'current' });
  });

  it('a current role answered exactly at the threshold is due', () => {
    const move = computeNextMove(withRole('current', DUE_AFTER_DAYS), NOW);
    expect(move.kind).toBe('due');
    if (move.kind === 'due') {
      expect(move.items).toHaveLength(1);
      expect(move.items[0]!.role).toBe('Manager');
      expect(move.items[0]!.recordIndex).toBe(0);
    }
  });

  it('a current role answered one day past the threshold is due', () => {
    expect(computeNextMove(withRole('current', DUE_AFTER_DAYS + 1), NOW).kind).toBe('due');
  });

  it('a brand-new current role (0 days) is never due', () => {
    expect(computeNextMove(withRole('current', 0), NOW)).toEqual({ kind: 'current' });
  });

  it('a historical role is never due, no matter how long ago it was answered — it is settled, not stale', () => {
    expect(computeNextMove(withRole('historical', DUE_AFTER_DAYS + 1000), NOW)).toEqual({ kind: 'current' });
  });

  it('a role with no answeredAt entry for role_durability is skipped defensively, never due', () => {
    const answers = makeAnswers({
      repeatables: { [ROLES_BLOCK_ID]: [roleRecord('Manager', 'current')] },
      // no answeredAt entry at all
    });
    expect(computeNextMove(answers, NOW)).toEqual({ kind: 'current' });
  });
});

describe('computeNextMove — the R1-12 accept line: a durability answer alone changes the next move', () => {
  it('flipping current -> historical, with no other action, moves "due" back to "current"', () => {
    const due = makeAnswers({
      repeatables: { [ROLES_BLOCK_ID]: [roleRecord('Manager', 'current')] },
      answeredAt: { [`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`]: daysAgo(DUE_AFTER_DAYS + 30) },
    });
    expect(computeNextMove(due, NOW).kind).toBe('due');

    // The only change: the same field's value flips, and its own answeredAt
    // bumps to "now" (exactly what core/flow/runner.ts's applyAnswer does
    // on a real re-answer) — nothing else about the record changes.
    const flipped = makeAnswers({
      repeatables: { [ROLES_BLOCK_ID]: [roleRecord('Manager', 'historical')] },
      answeredAt: { [`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`]: NOW.toISOString() },
    });
    expect(computeNextMove(flipped, NOW)).toEqual({ kind: 'current' });
  });
});

describe('computeNextMove — several roles, independently current or historical', () => {
  it('folds over multiple records: only the due current ones are reported', () => {
    const answers = makeAnswers({
      repeatables: {
        [ROLES_BLOCK_ID]: [
          roleRecord('Team Lead', 'current'), // due
          roleRecord('Volunteer Coordinator', 'historical'), // never due
          roleRecord('Freelance Designer', 'current'), // not yet due
        ],
      },
      answeredAt: {
        [`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`]: daysAgo(DUE_AFTER_DAYS + 10),
        [`${ROLES_BLOCK_ID}#1#${ROLE_DURABILITY_KEY}`]: daysAgo(DUE_AFTER_DAYS + 999),
        [`${ROLES_BLOCK_ID}#2#${ROLE_DURABILITY_KEY}`]: daysAgo(5),
      },
    });

    const move = computeNextMove(answers, NOW);
    expect(move.kind).toBe('due');
    if (move.kind === 'due') {
      expect(move.items.map((i) => i.recordIndex)).toEqual([0]);
      expect(move.items[0]!.role).toBe('Team Lead');
    }
  });

  it('reports every due role, not just the first', () => {
    const answers = makeAnswers({
      repeatables: {
        [ROLES_BLOCK_ID]: [roleRecord('Team Lead', 'current'), roleRecord('Freelance Designer', 'current')],
      },
      answeredAt: {
        [`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`]: daysAgo(DUE_AFTER_DAYS),
        [`${ROLES_BLOCK_ID}#1#${ROLE_DURABILITY_KEY}`]: daysAgo(DUE_AFTER_DAYS + 5),
      },
    });
    const move = computeNextMove(answers, NOW);
    expect(move.kind).toBe('due');
    if (move.kind === 'due') expect(move.items).toHaveLength(2);
  });
});

describe('mostRecentAnsweredAt', () => {
  it('is undefined when nothing has been answered', () => {
    expect(mostRecentAnsweredAt(makeAnswers())).toBeUndefined();
  });

  it('picks the latest timestamp across both answeredAt and reflectedAt', () => {
    const answers = makeAnswers({
      answeredAt: { a: daysAgo(10), b: daysAgo(2) },
      reflectedAt: { c: daysAgo(40) },
    });
    expect(mostRecentAnsweredAt(answers)).toBe(daysAgo(2));
  });
});
