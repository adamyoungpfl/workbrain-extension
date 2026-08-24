import { describe, it, expect } from 'vitest';
import { splitRevealedSectionLabel, splitSectionLabel } from './sectionLabel';
import { contextOutline } from './flow';
import type { FileOutlineNode } from '../../schema/flow.types';

function everyNode(nodes: FileOutlineNode[]): FileOutlineNode[] {
  return nodes.flatMap((node) => [node, ...everyNode(node.children ?? [])]);
}

describe('splitSectionLabel', () => {
  it('splits a top-level section on its number', () => {
    expect(splitSectionLabel('1. About This Context')).toEqual({ numeral: '1. ', title: 'About This Context' });
  });

  it('splits a sub-section on its dotted number', () => {
    expect(splitSectionLabel('2.1 Roles')).toEqual({ numeral: '2.1 ', title: 'Roles' });
  });

  it('handles a two-digit section', () => {
    expect(splitSectionLabel('10. Reference Examples')).toEqual({ numeral: '10. ', title: 'Reference Examples' });
  });

  it('gives an unnumbered label back whole, with no numeral', () => {
    expect(splitSectionLabel('Reference Examples')).toEqual({ numeral: '', title: 'Reference Examples' });
  });

  it('never drops a character — the two halves rejoin exactly', () => {
    for (const node of everyNode(contextOutline)) {
      const { numeral, title } = splitSectionLabel(node.label);
      expect(numeral + title, node.id).toBe(node.label);
      expect(title.length, node.id).toBeGreaterThan(0);
    }
  });

  it('finds a real number on every section the flow actually ships', () => {
    for (const node of everyNode(contextOutline)) {
      expect(splitSectionLabel(node.label).numeral, node.id).toMatch(/^\d/);
    }
  });
});

describe('splitRevealedSectionLabel', () => {
  const LABEL = '10. Reference Examples';

  it('rejoins to exactly what was revealed, at every prefix length', () => {
    for (let n = 0; n <= LABEL.length; n++) {
      const revealed = LABEL.slice(0, n);
      const { numeral, title } = splitRevealedSectionLabel(LABEL, revealed);
      expect(numeral + title, `at ${n}`).toBe(revealed);
    }
  });

  it('keeps a half-typed number in the numeral half, not the title', () => {
    expect(splitRevealedSectionLabel(LABEL, '10')).toEqual({ numeral: '10', title: '' });
    expect(splitRevealedSectionLabel(LABEL, '10. Ref')).toEqual({ numeral: '10. ', title: 'Ref' });
  });
});
