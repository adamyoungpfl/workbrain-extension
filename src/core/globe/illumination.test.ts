import { describe, it, expect } from 'vitest';
import {
  EDGE_LIGHT_LEVEL,
  edgeBrightness,
  edgeLight,
  globeNodeState,
  isUnifiedGlow,
  sectionGlows,
} from './illumination';
import type { GlobeNodeState } from './illumination';
import { sectionHealthMap } from '../freshness/sectionHealth';
import { halfLifeFor } from '../freshness/halfLives';
import type { FileOutlineNode, Module, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.5 VB-25.
 *
 * Two layers, the same two `sectionHealth.test.ts` uses: the edge table proved
 * exhaustively at every combination of endpoint states, and the unified-glow
 * predicate proved against the REAL `sectionHealthMap` over a synthetic flow —
 * so "complete and fresh" is whatever VB-19 says it is, on the day the clock
 * says it, rather than a second opinion written here.
 */

const NOW = new Date('2026-08-23T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

const STATES: GlobeNodeState[] = ['active', 'inactive', 'structural'];

describe('VB-25 — an edge is a function of both its endpoints', () => {
  it('is defined at every combination of endpoint states, and never anything else', () => {
    const seen = new Set<string>();
    for (const a of STATES) {
      for (const b of STATES) {
        const light = edgeLight(a, b);
        expect(['bright', 'mid', 'dim'], `${a} + ${b}`).toContain(light);
        seen.add(`${a}+${b}`);
      }
    }
    // Nine, not six: the table is total, not "the cases we happened to think of".
    expect(seen.size).toBe(9);
  });

  it('two answered ends are bright, one is mid, neither is dim', () => {
    expect(edgeLight('active', 'active')).toBe('bright');
    expect(edgeLight('active', 'inactive')).toBe('mid');
    expect(edgeLight('inactive', 'active')).toBe('mid');
    expect(edgeLight('inactive', 'inactive')).toBe('dim');
  });

  it('a structural vertex conducts whatever the section at the other end carries', () => {
    expect(edgeLight('structural', 'active')).toBe('bright');
    expect(edgeLight('active', 'structural')).toBe('bright');
    expect(edgeLight('structural', 'inactive')).toBe('dim');
    expect(edgeLight('inactive', 'structural')).toBe('dim');
    // Never reachable on an icosahedron — the poles are opposite each other —
    // but the rule has no hole in it.
    expect(edgeLight('structural', 'structural')).toBe('dim');
  });

  it('has no direction: an edge read from either end is the same edge', () => {
    for (const a of STATES) for (const b of STATES) expect(edgeLight(a, b)).toBe(edgeLight(b, a));
  });

  it('turns down, never off — an unanswered branch is still part of the model', () => {
    expect(EDGE_LIGHT_LEVEL.dim).toBeGreaterThan(0);
    expect(EDGE_LIGHT_LEVEL.dim).toBeLessThan(EDGE_LIGHT_LEVEL.mid);
    expect(EDGE_LIGHT_LEVEL.mid).toBeLessThan(EDGE_LIGHT_LEVEL.bright);
    expect(EDGE_LIGHT_LEVEL.bright).toBe(1);
    // Far enough apart to be told apart on a 260px stage: each step is at
    // least a third of the one above it.
    expect(EDGE_LIGHT_LEVEL.mid / EDGE_LIGHT_LEVEL.bright).toBeLessThan(0.7);
    expect(EDGE_LIGHT_LEVEL.dim / EDGE_LIGHT_LEVEL.mid).toBeLessThan(0.7);
  });

  it('brightness is the level of the light, for every combination', () => {
    for (const a of STATES) for (const b of STATES) expect(edgeBrightness(a, b)).toBe(EDGE_LIGHT_LEVEL[edgeLight(a, b)]);
  });

  it('reads the tree\'s own three states, and calls a vertex with no section structural', () => {
    expect(globeNodeState('current')).toBe('active');
    expect(globeNodeState('reached')).toBe('active');
    expect(globeNodeState('untouched')).toBe('inactive');
    expect(globeNodeState(null)).toBe('structural');
    expect(globeNodeState(undefined)).toBe('structural');
  });

  it('spreads along the structure: one more answered section can only brighten edges', () => {
    // A four-node chain, answered left to right. Nothing ever gets dimmer.
    const chain: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const levels = (answered: number) =>
      chain.map(([a, b]) =>
        edgeBrightness(a < answered ? 'active' : 'inactive', b < answered ? 'active' : 'inactive'),
      );

    let previous = levels(0);
    expect(previous).toEqual([EDGE_LIGHT_LEVEL.dim, EDGE_LIGHT_LEVEL.dim, EDGE_LIGHT_LEVEL.dim]);
    for (let answered = 1; answered <= 4; answered++) {
      const next = levels(answered);
      next.forEach((value, i) => expect(value, `edge ${i} at ${answered} answered`).toBeGreaterThanOrEqual(previous[i]!));
      previous = next;
    }
    expect(previous).toEqual([EDGE_LIGHT_LEVEL.bright, EDGE_LIGHT_LEVEL.bright, EDGE_LIGHT_LEVEL.bright]);
  });
});

// ── The unified state, against the real health derivation ──────────────────

function step(id: string, over: Partial<Step> = {}): Step {
  return { id, module: 1, section: 0, eyebrow: 'E', q: 'Q?', kind: 'text', key: id, ...over };
}

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'M',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [step('name'), step('about'), step('world'), step('voice')],
  },
];

/** Two top-level sections, one of them with a child, so the roll-up is in play
 * — a stale child has to break the glow through its parent. */
const outline: FileOutlineNode[] = [
  {
    id: 'sec2',
    label: '2. About Me',
    questionIds: ['name'],
    children: [{ id: 'sec2-1', label: '2.1 Roles', questionIds: ['about'] }],
  },
  { id: 'sec3', label: '3. My World', questionIds: ['world'] },
  { id: 'sec6', label: '6. How I Communicate', questionIds: ['voice'] },
];

function answers(over: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...over };
}

/** Everything answered, everything stamped today. */
function fresh(): Answers {
  const today = daysAgo(0);
  return answers({
    values: { name: 'Ada', about: 'A manager', world: 'A team', voice: 'Plain' },
    answeredAt: { name: today, about: today, world: today, voice: today },
  });
}

const health = (a: Answers, currentQuestionId: string | null = null, now: Date = NOW) =>
  sectionHealthMap(outline, modules, a, currentQuestionId, now);

describe('VB-25 — the unified state', () => {
  it('holds only when every section is answered, complete and fresh', () => {
    const map = health(fresh());
    for (const node of outline) expect(map[node.id]!.state, node.id).toBe('done');
    expect(isUnifiedGlow(outline, map)).toBe(true);
  });

  it('one stale section breaks it — which is the whole point of it', () => {
    const a = fresh();
    // `3. My World` runs a 120-day clock (core/freshness/halfLives.ts). One day
    // past it, and nothing else touched.
    const stale = halfLifeFor('sec3') + 1;
    a.answeredAt.world = daysAgo(stale);
    const map = health(a);
    expect(map.sec3!.state).toBe('due');
    expect(map.sec2!.state).toBe('done');
    expect(isUnifiedGlow(outline, map)).toBe(false);
    // ...and it comes back on its own when that one answer is refreshed. The
    // glow is what maintenance buys, not something spent.
    a.answeredAt.world = daysAgo(0);
    expect(isUnifiedGlow(outline, health(a))).toBe(true);
  });

  it('a stale CHILD breaks it through its parent, on the child\'s own clock', () => {
    const a = fresh();
    a.answeredAt.about = daysAgo(halfLifeFor('sec2-1') + 1);
    const map = health(a);
    expect(map['sec2-1']!.state).toBe('due');
    expect(map.sec2!.state).toBe('due');
    expect(isUnifiedGlow(outline, map)).toBe(false);
  });

  it('one unanswered question anywhere breaks it', () => {
    const half = fresh();
    delete half.values.name;
    delete half.answeredAt.name;
    // Half of `2. About Me`: its own question gone, its child still answered.
    expect(health(half).sec2!.state).toBe('partly');
    expect(isUnifiedGlow(outline, health(half))).toBe(false);

    const none = fresh();
    delete none.values.voice;
    delete none.answeredAt.voice;
    expect(health(none).sec6!.state).toBe('not-yet');
    expect(isUnifiedGlow(outline, health(none))).toBe(false);
  });

  it('a skipped question is not an answered one, so it does not glow', () => {
    const a = fresh();
    a.values.voice = null;
    expect(isUnifiedGlow(outline, health(a))).toBe(false);
  });

  it('standing in a finished section does not break it', () => {
    // `here` wins over every other state in sectionHealth.ts, so a complete,
    // fresh section reports `here` while somebody is reading it. The picture
    // must not change because of where the cursor is.
    const map = health(fresh(), 'voice');
    expect(map.sec6!.state).toBe('here');
    expect(isUnifiedGlow(outline, map)).toBe(true);
  });

  it('standing in an UNfinished section still breaks it', () => {
    const a = fresh();
    delete a.values.voice;
    delete a.answeredAt.voice;
    const map = health(a, 'voice');
    expect(map.sec6!.state).toBe('here');
    expect(isUnifiedGlow(outline, map)).toBe(false);
  });

  it('an empty file is not unified, and neither is an empty outline', () => {
    expect(isUnifiedGlow(outline, health(answers()))).toBe(false);
    expect(isUnifiedGlow([], health(fresh()))).toBe(false);
    expect(isUnifiedGlow(outline, undefined)).toBe(false);
  });

  it('a section with no health record at all does not glow', () => {
    const map = health(fresh());
    delete map.sec3;
    expect(isUnifiedGlow(outline, map)).toBe(false);
    expect(sectionGlows(undefined)).toBe(false);
  });
});
