import { describe, expect, it } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module, Step } from '../../schema/flow.types';
import { featuredMove, maintenanceQueue, nextAfter } from './queue';
import { halfLifeFor } from './halfLives';

const NOW = new Date('2026-09-02T12:00:00.000Z');
/** An ISO stamp `days` before NOW. */
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const step = (id: string, over: Partial<Step> = {}): Step =>
  ({ kind: 'text', id, q: `Q ${id}?`, ...over }) as Step;

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'M',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [step('beat', { kind: 'intro' }), step('name'), step('about'), step('voice')],
  },
];

const outline: FileOutlineNode[] = [
  { id: 'sec2', label: '2. About Me', questionIds: ['beat', 'name', 'about'] },
  { id: 'sec6', label: '6. How I Communicate', questionIds: ['voice'] },
];

function answers(over: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...over };
}

describe('maintenanceQueue (V3.0 pass 7)', () => {
  it('a fresh file is all open items, in file order, intros skipped', () => {
    const q = maintenanceQueue(modules, outline, answers(), NOW);
    expect(q.map((i) => i.questionId)).toEqual(['name', 'about', 'voice']);
    expect(q.every((i) => i.kind === 'open')).toBe(true);
    expect(q[0]!.section).toBe('About Me');
  });

  it('an answer inside its half-life is neither open nor stale', () => {
    const a = answers({
      values: { name: 'x' },
      answeredAt: { name: ago(halfLifeFor('sec2') - 1) },
    });
    const q = maintenanceQueue(modules, outline, a, NOW);
    expect(q.map((i) => i.questionId)).toEqual(['about', 'voice']);
  });

  it('an answer past its own section half-life goes stale, with its age', () => {
    const a = answers({
      values: { name: 'x' },
      answeredAt: { name: ago(halfLifeFor('sec2') + 3) },
    });
    const q = maintenanceQueue(modules, outline, a, NOW);
    const stale = q.find((i) => i.questionId === 'name');
    expect(stale?.kind).toBe('stale');
    expect(stale?.ageDays).toBe(halfLifeFor('sec2') + 3);
    // File order holds: the stale item keeps its seat, no re-ranking.
    expect(q.map((i) => i.questionId)).toEqual(['name', 'about', 'voice']);
  });
});

describe('featuredMove — build actions outrank maintenance', () => {
  it('features the first open item while any exists', () => {
    const a = answers({
      values: { name: 'x' },
      answeredAt: { name: ago(halfLifeFor('sec2') + 30) },
    });
    const q = maintenanceQueue(modules, outline, a, NOW);
    expect(featuredMove(q)?.questionId).toBe('about');
  });

  it('with no build actions, features the OLDEST stale answer', () => {
    // voice stays fresh inside its own half-life; the two sec2 answers are
    // both stale, and the older of THEM leads - oldest by answeredAt, not
    // by position.
    const a = answers({
      values: { name: 'x', about: 'y', voice: 'z' },
      answeredAt: {
        name: ago(halfLifeFor('sec2') + 10),
        about: ago(halfLifeFor('sec2') + 40),
        voice: ago(1),
      },
    });
    const q = maintenanceQueue(modules, outline, a, NOW);
    expect(q.map((i) => i.questionId)).toEqual(['name', 'about']);
    expect(featuredMove(q)?.questionId).toBe('about');
  });

  it('an empty queue features nothing', () => {
    expect(featuredMove([])).toBeNull();
  });
});

describe('nextAfter — the Word-style sweep', () => {
  const a = answers();
  const q = maintenanceQueue(modules, outline, a, NOW); // name, about, voice

  it('moves to the next item in file order', () => {
    expect(nextAfter(q, 'name')?.questionId).toBe('about');
  });

  it('wraps past the end — the whole doc, from wherever you are', () => {
    expect(nextAfter(q, 'voice')?.questionId).toBe('name');
  });

  it('is null only when nothing else needs a hand', () => {
    expect(nextAfter([q[0]!], 'name')).toBeNull();
    expect(nextAfter([], 'anything')).toBeNull();
  });
});
