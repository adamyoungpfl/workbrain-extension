import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contextModules } from '../../core/flow/flow';
import { VERTICAL_PICK_QUESTIONS, usesVerticalPick } from '../../core/choice/verticalPick';
import { contrastRatio } from '../../core/color/contrast';
import type { Rgb } from '../../core/color/contrast';
import { SCOPE_GLYPHS } from './choiceGlyphs';
import { VerticalPick } from './VerticalPick';
import { mount } from './testUtils';

/**
 * V2.4 VB-108, rebuilt by V2.5 VB-118 — the vertical pick as icon tiles, at
 * the component boundary.
 *
 * The e2e spec (vertical-pick.spec.ts) drives the real screen; what belongs
 * here is the census and the contract: every choice the REAL context_scope
 * ships has a drawing, the tile grammar keeps the chips-and-Next semantics
 * (selection only reports — there is nothing here to advance), the label is
 * the whole accessible name, and — VB-118's own words, "contrast measured" —
 * the WCAG arithmetic run over every ink/ground pair the stylesheet names.
 */

const contextScope = (() => {
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if (!('fields' in node) && node.id === 'context_scope') return node;
    }
  }
  throw new Error('context_scope missing from the shipped flow');
})();

describe('the census — glyphs keyed by the ported option keys', () => {
  it('covers every choice context_scope actually ships, 1:1', () => {
    const keys = (contextScope.options ?? []).map((o) => o.v);
    expect(keys).toEqual(['work', 'personal', 'both']);
    expect(Object.keys(SCOPE_GLYPHS).sort()).toEqual([...keys].sort());
  });

  it('the shipped context_scope is the question the seam claims', () => {
    expect(usesVerticalPick(contextScope)).toBe(true);
    expect(VERTICAL_PICK_QUESTIONS).toEqual(['context_scope']);
  });

  it('every scope glyph is stroke-drawn and decorative, like every icon here', () => {
    for (const [key, drawing] of Object.entries(SCOPE_GLYPHS)) {
      const { container, unmount } = mount(drawing);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden'), key).toBe('true');
      expect(svg.getAttribute('stroke'), key).toBe('currentColor');
      expect(svg.getAttribute('fill'), key).toBe('none');
      expect(svg.querySelector('animate, animateTransform, set'), key).toBeNull();
      unmount();
    }
  });
});

describe('the tile grammar — VB-118 (chips + Next underneath, tiles on top)', () => {
  const options = (contextScope.options ?? []).map((o) => ({
    value: o.v,
    label: o.l,
    glyph: SCOPE_GLYPHS[o.v],
  }));

  it('is one named group of real buttons: glyph, label, radio mark per tile', () => {
    const { container, unmount } = mount(
      <VerticalPick legend="Scope" options={options} value={[]} onChange={() => {}} />,
    );
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Scope');
    expect(group.classList.contains('vpick')).toBe(true);
    const tiles = group.querySelectorAll<HTMLButtonElement>('.vpick-tile');
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      // A submit here would be the auto-advance the guardrail bans; the tile
      // is type="button", so activation cannot submit the form around it.
      expect(tile.getAttribute('type')).toBe('button');
      expect(tile.querySelector('.vpick-glyph svg')).toBeTruthy();
      expect(tile.querySelector('.vpick-label')).toBeTruthy();
      expect(tile.querySelector('.vpick-radio')).toBeTruthy();
    }
    unmount();
  });

  it('a click selects and only selects — the choice is reported, never advanced', () => {
    let reported: string[] | null = null;
    const { container, unmount } = mount(
      <VerticalPick
        legend="Scope"
        options={options}
        value={[]}
        onChange={(next) => {
          reported = next;
        }}
      />,
    );
    const first = container.querySelector<HTMLButtonElement>('.vpick-tile')!;
    act(() => first.click());
    expect(reported).toEqual(['work']);
    unmount();
  });

  it('selection is single — reporting replaces, never accumulates', () => {
    let reported: string[] | null = null;
    const { container, unmount } = mount(
      <VerticalPick
        legend="Scope"
        options={options}
        value={['work']}
        onChange={(next) => {
          reported = next;
        }}
      />,
    );
    const tiles = container.querySelectorAll<HTMLButtonElement>('.vpick-tile');
    expect(tiles[0]!.getAttribute('aria-pressed')).toBe('true');
    act(() => tiles[2]!.click());
    expect(reported).toEqual(['both']);
    unmount();
  });

  it('keeps the labels as the whole accessible name — glyph and radio add no words', () => {
    const { container, unmount } = mount(
      <VerticalPick legend="Scope" options={options} value={[]} onChange={() => {}} />,
    );
    const names = [...container.querySelectorAll('.vpick-tile')].map((t) => t.textContent);
    expect(names).toEqual(['Work', 'Personal', 'Both']);
    unmount();
  });

  it('carries a roving tabindex, seeded on the stored selection', () => {
    const { container, unmount } = mount(
      <VerticalPick legend="Scope" options={options} value={['personal']} onChange={() => {}} />,
    );
    const tabIndexes = [...container.querySelectorAll('.vpick-tile')].map((t) => t.getAttribute('tabindex'));
    expect(tabIndexes).toEqual(['-1', '0', '-1']);
    unmount();
  });

  it('the compact face is the same grammar with a class, nothing else', () => {
    const { container, unmount } = mount(
      <VerticalPick legend="Scope" options={options} value={[]} onChange={() => {}} size="compact" />,
    );
    const group = container.querySelector('[role="group"]')!;
    expect(group.classList.contains('vpick')).toBe(true);
    expect(group.classList.contains('vpick-compact')).toBe(true);
    expect(group.querySelectorAll('.vpick-tile')).toHaveLength(3);
    unmount();
  });
});

/**
 * VB-118's "contrast measured", literally: every ink/ground pair
 * VerticalPick.css names, run through core/color/contrast.ts's WCAG
 * arithmetic against design/tokens.json's own values — so a future palette
 * edit that sinks a pair under its floor fails here, by number, not in a
 * review. The flow sits on the app-wide --ground (V2.4 VB-111), which is why
 * the radio ring is --select-ring and not --border-i (2.92:1 there).
 */
describe('the stylesheet holds its floors, measured', () => {
  // From the repo root, which is where vitest runs: under jsdom
  // `import.meta.url` is an http URL and readFileSync will not take one
  // (chrome.test.ts's own precedent, same file, same reason).
  const tokens = JSON.parse(
    readFileSync(resolve(process.cwd(), 'design/tokens.json'), 'utf8'),
  ) as { color: Record<string, { value?: string }> };

  function rgb(name: string): Rgb {
    const value = tokens.color[name]?.value;
    if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) throw new Error(`no hex token "${name}"`);
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
    };
  }

  const floors: [string, string, string, number][] = [
    // label ink on every ground a tile can wear
    ['ink', 'ground', 'label at rest on the app ground', 4.5],
    ['ink', 'sunken', 'label on the hover wash', 4.5],
    ['ink', 'primary-tint', 'label on the selected wash', 4.5],
    // the radio ring (interactive boundary) on the same three grounds
    ['select-ring', 'ground', 'radio ring at rest', 3],
    ['select-ring', 'sunken', 'radio ring on hover', 3],
    ['primary', 'primary-tint', 'radio ring + dot when selected', 3],
    // the free-standing drawing, both disc states
    ['primary', 'primary-tint', 'glyph on its disc at rest', 3],
    ['ink-inv', 'primary', 'glyph on the selected disc', 3],
    // the focus ring on the ground it is drawn over
    ['primary', 'ground', 'focus ring', 3],
  ];

  for (const [fg, bg, what, floor] of floors) {
    it(`${what}: --${fg} on --${bg} ≥ ${floor}:1`, () => {
      const ratio = contrastRatio(rgb(fg), rgb(bg));
      expect(ratio, `${what} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
    });
  }
});
