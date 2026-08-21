import { describe, it, expect } from 'vitest';
import { DEFAULT_HALF_LIFE_DAYS, SECTION_HALF_LIFE_DAYS, halfLifeFor } from './halfLives';
import { DUE_AFTER_DAYS } from './clocks';
import { contextOutline } from '../flow/flow';
import type { FileOutlineNode } from '../../schema/flow.types';

function flatten(nodes: FileOutlineNode[]): FileOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe('the per-section half-life table', () => {
  it('gives every shipped section an explicit entry — the default is a fallback, not the policy', () => {
    const missing = flatten(contextOutline)
      .map((node) => node.id)
      .filter((id) => !(id in SECTION_HALF_LIFE_DAYS));
    expect(missing).toEqual([]);
  });

  it('names no section that is not in the outline', () => {
    const ids = new Set(flatten(contextOutline).map((node) => node.id));
    expect(Object.keys(SECTION_HALF_LIFE_DAYS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('falls back to the documented default for an id it has never heard of', () => {
    expect(halfLifeFor('sec-that-does-not-exist')).toBe(DEFAULT_HALF_LIFE_DAYS);
    expect(DEFAULT_HALF_LIFE_DAYS).toBe(DUE_AFTER_DAYS);
  });

  it('keeps Roles on exactly the clock Home\'s due-role banner uses', () => {
    // If these two ever drift, Home can say a role is due while the drawer
    // says 2.1 Roles is fine. See halfLives.ts's "ROLES IS PINNED" note.
    expect(halfLifeFor('sec2-1')).toBe(DUE_AFTER_DAYS);
  });

  it('ages the churning sections faster than the durable ones', () => {
    // The product judgement, asserted rather than left to a comment: the two
    // sections about the world move quickest, the two about the person move
    // slowest, and no section is shorter than a quarter or longer than two
    // years.
    const world = Math.max(halfLifeFor('sec3'), halfLifeFor('sec4'));
    const person = Math.min(halfLifeFor('sec5'), halfLifeFor('sec6'));
    expect(world).toBeLessThan(person);
    for (const days of Object.values(SECTION_HALF_LIFE_DAYS)) {
      expect(days).toBeGreaterThanOrEqual(90);
      expect(days).toBeLessThanOrEqual(730);
    }
  });
});
