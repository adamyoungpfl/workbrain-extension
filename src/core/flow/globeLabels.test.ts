import { describe, it, expect } from 'vitest';
import { GLOBE_SHORT_LABELS, globeLabelFor } from './globeLabels';
import { contextOutline } from './flow';
import type { FileOutlineNode } from '../../schema/flow.types';

/**
 * V1.5 VB-26. The ceilings below are the reason this table exists, so they are
 * asserted rather than described: a name that grows past them is a name the
 * globe will clip, and clipping is the thing VB-26 is fixing.
 */

/** Every node in the outline, parents and children, flattened. */
function everyNode(nodes: readonly FileOutlineNode[]): FileOutlineNode[] {
  return nodes.flatMap((node) => [node, ...everyNode(node.children ?? [])]);
}

const ALL = everyNode(contextOutline);

/** Measured, not chosen: at 12px / 650 / +0.08em an uppercase character
 * averages ~8.4px, and the narrowest room a rim node has on the 260px stage the
 * drawer opens Brain at is ~100px. tests/e2e/brain-globe.spec.ts proves the
 * real rendered widths; this keeps a new name from ever getting that far. */
const MAX_CHARS = 11;
/** `type.label`'s own ceiling, from design/tokens.json: "2–3 words max". */
const MAX_WORDS = 3;

describe('VB-26 — short display names for the globe', () => {
  it('every shipped section has a real entry, so the fallback stays a fallback', () => {
    for (const node of ALL) {
      expect(GLOBE_SHORT_LABELS[node.id], `${node.id} (${node.label}) has no globe name`).toBeTypeOf('string');
    }
  });

  it('names nothing that is not in the outline', () => {
    const ids = new Set(ALL.map((node) => node.id));
    for (const id of Object.keys(GLOBE_SHORT_LABELS)) {
      expect(ids.has(id), `${id} is named for a globe node that does not exist`).toBe(true);
    }
  });

  it('fits the label treatment: three words, eleven characters, no number', () => {
    for (const node of ALL) {
      const short = globeLabelFor(node);
      expect(short.length, `${short} is too long for a node label`).toBeLessThanOrEqual(MAX_CHARS);
      expect(short.split(/\s+/).length, `${short} is too many words`).toBeLessThanOrEqual(MAX_WORDS);
      expect(short, `${short} still carries the file's numbering`).not.toMatch(/^\d/);
      expect(short.trim(), 'a name with loose whitespace').toBe(short);
      expect(short.length).toBeGreaterThan(0);
    }
  });

  it('gives no two nodes the same name', () => {
    const names = ALL.map((node) => globeLabelFor(node));
    expect(new Set(names).size, `duplicate globe names: ${names.join(', ')}`).toBe(names.length);
  });

  it('is shorter than the real name, or the same — never longer', () => {
    for (const node of ALL) {
      expect(globeLabelFor(node).length, node.label).toBeLessThanOrEqual(node.label.length);
    }
  });

  it('falls back to the real name with its number stripped, rather than to nothing', () => {
    expect(globeLabelFor({ id: 'sec11', label: '11. One Too Many', questionIds: [] })).toBe('One Too Many');
    expect(globeLabelFor({ id: 'sec11-2', label: '11.2 A Child', questionIds: [] })).toBe('A Child');
    expect(globeLabelFor({ id: 'nope', label: 'No Number Here', questionIds: [] })).toBe('No Number Here');
  });

  it('leaves the file\'s own section titles untouched', () => {
    // The globe gets a short name; the file keeps its real one. If this ever
    // fails, something has rewritten CONTEXT_FILE_OUTLINE to fit a picture.
    expect(contextOutline.find((node) => node.id === 'sec6')!.label).toBe('6. How I Communicate');
    expect(contextOutline.find((node) => node.id === 'sec9')!.label).toBe('9. Context Boundaries');
  });
});
