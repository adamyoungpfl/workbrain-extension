import { describe, it, expect } from 'vitest';
import { recordChildrenFor, relativeAge } from './recordRows';
import { halfLifeFor } from './halfLives';
import { contextModules, contextOutline } from '../flow/flow';
import type { Answers } from '../../schema/storage.types';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

describe('relativeAge', () => {
  it('prints the short forms the row edge has room for', () => {
    expect(relativeAge(daysAgo(0), NOW)).toBe('today');
    expect(relativeAge(daysAgo(3), NOW)).toBe('3d');
    expect(relativeAge(daysAgo(14), NOW)).toBe('2w');
    expect(relativeAge(daysAgo(95), NOW)).toBe('3mo');
    expect(relativeAge(daysAgo(400), NOW)).toBe('1y');
  });

  it('never goes negative on a clock skewed slightly ahead, and never throws on junk', () => {
    expect(relativeAge(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe('today');
    expect(relativeAge('not a date', NOW)).toBe('');
  });
});

describe('recordChildrenFor, against the real ported flow', () => {
  const sec3 = contextOutline.find((n) => n.id === 'sec3')!;

  function withEntities(): Answers {
    return {
      values: { entities_gate: 'yes' },
      repeatables: {
        entities: [
          { entity_type: 'person', entity_name: 'Dana', entity_relevance: 'My manager.' },
          { entity_type: 'system-tool', entity_name: 'Jira', entity_relevance: 'Where work lives.' },
        ],
      },
      answeredAt: {
        'entities#0#entity_name': daysAgo(2),
        'entities#0#entity_relevance': daysAgo(1),
        'entities#1#entity_name': daysAgo(halfLifeFor('sec3') + 10),
      },
      reflectedAt: {},
    };
  }

  it('one sub-row per record, named by the record, freshest field wins', () => {
    const rows = recordChildrenFor(sec3, contextModules, withEntities(), NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.label).toBe('Dana');
    expect(rows[0]!.lastAt).toBe(daysAgo(1)); // relevance is fresher than name
    expect(rows[0]!.stale).toBe(false);
    expect(rows[1]!.label).toBe('Jira');
    expect(rows[1]!.stale).toBe(true); // past sec3's half-life — the prune ritual's trigger
  });

  it('ids are stable and self-describing, so expansion state can key off them', () => {
    const rows = recordChildrenFor(sec3, contextModules, withEntities(), NOW);
    expect(rows[0]!.id).toBe('sec3#rec#entities#0');
    expect(rows[1]!.id).toBe('sec3#rec#entities#1');
  });

  it('a section with no records has no sub-rows, and never throws', () => {
    const empty: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
    expect(recordChildrenFor(sec3, contextModules, empty, NOW)).toEqual([]);
  });

  it('a record nobody has touched yet still rows up, unnamed and unaged rather than invisible', () => {
    const answers: Answers = {
      values: {},
      repeatables: { entities: [{}] },
      answeredAt: {},
      reflectedAt: {},
    };
    const rows = recordChildrenFor(sec3, contextModules, answers, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('1.');
    expect(rows[0]!.lastAt).toBeNull();
    expect(rows[0]!.stale).toBe(false);
  });
});
