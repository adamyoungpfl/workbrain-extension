import { describe, it, expect } from 'vitest';
import { contextModules } from './flow';
import {
  FAMOUS_FIRSTS,
  FAMOUS_LASTS,
  NAME_CYCLE,
  NAME_GENERATOR_QUESTIONS,
  generatedNameAt,
  usesNameGenerator,
} from './nameGenerator';

/**
 * V2.4 VB-109 — the name generator. The test that matters most here is the
 * audit: THE CROSS PRODUCT MUST NEVER RECONSTRUCT A REAL FAMOUS PERSON (or a
 * famous fictional character — "Sherlock Holmes" out of a joke machine is the
 * same failure). The audit is encoded as data: every pool name carries its
 * well-known bearers, and the walk below checks all 156 combinations against
 * all of them. Growing a pool without growing the maps fails the census.
 */

// ── the audit maps: who actually goes by these names ───────────────────────

/** For each FIRST in the pool: surnames of its well-known bearers (real or
 * famously fictional). None of these may appear in FAMOUS_LASTS. */
const KNOWN_BEARERS_BY_FIRST: Record<string, string[]> = {
  Wolfgang: ['Mozart', 'Puck', 'Petersen'],
  Cleopatra: ['Jones'], // the film character; the queen herself is mononymous
  Elvis: ['Presley', 'Costello'],
  Frida: ['Kahlo'],
  Sherlock: ['Holmes'],
  Hermione: ['Granger', 'Norris'],
  Napoleon: ['Bonaparte', 'Dynamite', 'Hill'],
  Amelia: ['Earhart', 'Bedelia', 'Pond'],
  Galileo: ['Galilei'],
  Beatrix: ['Potter', 'Kiddo'],
  Wednesday: ['Addams'],
  Leonardo: ['DiCaprio'], // da Vinci is a toponym, and 'Vinci' is not in the pool either
};

/** For each LAST in the pool: first names of its well-known bearers. None of
 * these may appear in FAMOUS_FIRSTS. */
const KNOWN_BEARERS_BY_LAST: Record<string, string[]> = {
  Einstein: ['Albert'],
  Shakespeare: ['William'],
  Tesla: ['Nikola'],
  Picasso: ['Pablo', 'Paloma'],
  Houdini: ['Harry'],
  Newton: ['Isaac', 'Olivia', 'Huey', 'Cam', 'Thandiwe'],
  Darwin: ['Charles'],
  Austen: ['Jane'],
  Dickinson: ['Emily', 'Bruce', 'Angie'],
  Chaplin: ['Charlie', 'Geraldine', 'Ben'],
  Nightingale: ['Florence'],
  Magellan: ['Ferdinand'],
  Copernicus: ['Nicolaus'],
};

describe('the pools never rebuild a real name (VB-109, the hard rule)', () => {
  it('carries an audit entry for every pool name — the census that keeps the audit honest', () => {
    expect(Object.keys(KNOWN_BEARERS_BY_FIRST).sort()).toEqual([...FAMOUS_FIRSTS].sort());
    expect(Object.keys(KNOWN_BEARERS_BY_LAST).sort()).toEqual([...FAMOUS_LASTS].sort());
  });

  it("no first name's famous bearer can be completed by the last-name pool", () => {
    for (const [first, surnames] of Object.entries(KNOWN_BEARERS_BY_FIRST)) {
      for (const surname of surnames) {
        expect(FAMOUS_LASTS.includes(surname), `"${first} ${surname}" would be reconstructible`).toBe(false);
      }
    }
  });

  it("no last name's famous bearer can be completed by the first-name pool", () => {
    for (const [last, firsts] of Object.entries(KNOWN_BEARERS_BY_LAST)) {
      for (const first of firsts) {
        expect(FAMOUS_FIRSTS.includes(first), `"${first} ${last}" would be reconstructible`).toBe(false);
      }
    }
  });

  it('the whole cross product clears the denylist built from both maps', () => {
    const denylist = new Set<string>();
    for (const [first, surnames] of Object.entries(KNOWN_BEARERS_BY_FIRST)) {
      for (const surname of surnames) denylist.add(`${first} ${surname}`);
    }
    for (const [last, firsts] of Object.entries(KNOWN_BEARERS_BY_LAST)) {
      for (const first of firsts) denylist.add(`${first} ${last}`);
    }
    for (const first of FAMOUS_FIRSTS) {
      for (const last of FAMOUS_LASTS) {
        expect(denylist.has(`${first} ${last}`), `${first} ${last}`).toBe(false);
      }
    }
  });

  it('the two pools share no name with each other — a first is never also a last', () => {
    for (const first of FAMOUS_FIRSTS) expect(FAMOUS_LASTS.includes(first), first).toBe(false);
  });
});

describe('generatedNameAt — deterministic, cycling, total', () => {
  it('is a pure function of seed and press count', () => {
    expect(generatedNameAt(42, 0)).toBe(generatedNameAt(42, 0));
    expect(generatedNameAt(42, 7)).toBe(generatedNameAt(42, 7));
    expect(generatedNameAt(0, 0)).toBe(`${FAMOUS_FIRSTS[0]} ${FAMOUS_LASTS[0]}`);
  });

  it('always produces "First Last" out of the two pools', () => {
    for (let press = 0; press < 20; press++) {
      const [first, last, ...rest] = generatedNameAt(123, press).split(' ');
      expect(rest).toEqual([]);
      expect(FAMOUS_FIRSTS).toContain(first);
      expect(FAMOUS_LASTS).toContain(last);
    }
  });

  it('walks every combination once before repeating any — the whole point of coprime pools', () => {
    const seen = new Set<string>();
    for (let press = 0; press < NAME_CYCLE; press++) seen.add(generatedNameAt(9, press));
    expect(seen.size).toBe(NAME_CYCLE);
    expect(NAME_CYCLE).toBe(FAMOUS_FIRSTS.length * FAMOUS_LASTS.length);
    // ...and press NAME_CYCLE starts the same walk over.
    expect(generatedNameAt(9, NAME_CYCLE)).toBe(generatedNameAt(9, 0));
  });

  it('changes both halves on every consecutive press — it reads as a new name, not a variant', () => {
    for (let press = 0; press < 30; press++) {
      const [f1, l1] = generatedNameAt(5, press).split(' ');
      const [f2, l2] = generatedNameAt(5, press + 1).split(' ');
      expect(f1).not.toBe(f2);
      expect(l1).not.toBe(l2);
    }
  });

  it('different seeds start the walk in different places', () => {
    const starts = new Set<string>();
    for (let seed = 0; seed < 12; seed++) starts.add(generatedNameAt(seed, 0));
    expect(starts.size).toBeGreaterThan(1);
  });

  it('survives hostile counts the way ideaAt does — floored, folded, total', () => {
    expect(generatedNameAt(0, -3)).toBe(generatedNameAt(0, 3));
    expect(generatedNameAt(0, 2.9)).toBe(generatedNameAt(0, 2));
    expect(generatedNameAt(Number.NaN, Number.POSITIVE_INFINITY)).toBe(generatedNameAt(0, 0));
  });
});

describe('which questions get the generator', () => {
  it('the two name questions, and they exist in the shipped flow as text questions', () => {
    expect(NAME_GENERATOR_QUESTIONS).toEqual(['preferred_name', 'professional_name']);
    const steps = contextModules.flatMap((m) => m.nodes.flatMap((n) => ('fields' in n ? n.fields : [n])));
    for (const id of NAME_GENERATOR_QUESTIONS) {
      const step = steps.find((s) => s.id === id);
      expect(step, id).toBeTruthy();
      expect(step!.kind, id).toBe('text');
      expect(usesNameGenerator(step!), id).toBe(true);
    }
  });

  it('claims nothing else — not other text questions, not a name question of another kind', () => {
    expect(usesNameGenerator({ id: 'stop_explaining', kind: 'text' })).toBe(false);
    expect(usesNameGenerator({ id: 'preferred_name', kind: 'chips' })).toBe(false);
  });

  it("professional_name's blank-means-same-name survives: still optional, still says so", () => {
    const steps = contextModules.flatMap((m) => m.nodes.flatMap((n) => ('fields' in n ? n.fields : [n])));
    const step = steps.find((s) => s.id === 'professional_name')!;
    // The ported semantics the generator must not disturb (VB-109): the
    // question stays skippable and its own words still offer the blank.
    expect(step.required).toBe(false);
    expect(typeof step.q === 'function' ? step.q({ answers: {}, repeatables: {} }) : step.q).toContain(
      'Leave this blank',
    );
    expect(step.ph).toBe("Leave blank if it's the same");
  });
});

describe('the names as copy', () => {
  it('every generated name is two words — the 20-word sentence rule holds by construction', () => {
    // Proper nouns deliberately skip the Flesch-Kincaid harness (see the
    // module header: syllable-counting "Copernicus" measures nothing), but
    // the sentence-length rule is still asserted rather than waved at.
    for (const first of FAMOUS_FIRSTS) {
      for (const last of FAMOUS_LASTS) {
        expect(`${first} ${last}`.split(/\s+/)).toHaveLength(2);
      }
    }
  });
});
