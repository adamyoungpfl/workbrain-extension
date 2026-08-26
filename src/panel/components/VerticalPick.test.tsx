import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { contextModules } from '../../core/flow/flow';
import { VERTICAL_PICK_QUESTIONS, usesVerticalPick } from '../../core/choice/verticalPick';
import { SCOPE_GLYPHS } from './choiceGlyphs';
import { PillGroup } from './Pill';
import { mount } from './testUtils';

/**
 * V2.4 VB-108 — the vertical pick list, at the component boundary.
 *
 * The e2e spec (vertical-pick.spec.ts) drives the real screen; what belongs
 * here is the census and the contract: every choice the REAL context_scope
 * ships has a drawing, the vertical posture is the same .pillgroup grammar
 * (one component — FLAG 5), and selection still never auto-advances anything
 * (there is nothing here to advance: the group only calls onChange).
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

describe('the vertical posture — one component, stood up (FLAG 5)', () => {
  const options = (contextScope.options ?? []).map((o) => ({
    value: o.v,
    label: o.l,
    glyph: SCOPE_GLYPHS[o.v],
  }));

  it('is the same .pillgroup with a modifier — every existing selector still matches', () => {
    const { container, unmount } = mount(
      <PillGroup legend="Scope" options={options} mode="single" value={[]} onChange={() => {}} variant="vertical" />,
    );
    const group = container.querySelector('[role="group"]')!;
    expect(group.classList.contains('pillgroup')).toBe(true);
    expect(group.classList.contains('pillgroup-vertical')).toBe(true);
    const pills = group.querySelectorAll('.pill');
    expect(pills).toHaveLength(3);
    for (const pill of pills) expect(pill.querySelector('.pill-glyph svg')).toBeTruthy();
    unmount();
  });

  it('without the variant, nothing about the group changed', () => {
    const { container, unmount } = mount(
      <PillGroup legend="Scope" options={options} mode="single" value={[]} onChange={() => {}} />,
    );
    expect(container.querySelector('.pillgroup-vertical')).toBeNull();
    unmount();
  });

  it('a click selects and only selects — the choice is reported, never advanced', () => {
    let reported: string[] | null = null;
    const { container, unmount } = mount(
      <PillGroup
        legend="Scope"
        options={options}
        mode="single"
        value={[]}
        onChange={(next) => {
          reported = next;
        }}
        variant="vertical"
      />,
    );
    const first = container.querySelector<HTMLButtonElement>('.pill')!;
    // A submit here would be the auto-advance the guardrail bans; the pill is
    // type="button", so activation cannot submit the form around it.
    expect(first.getAttribute('type')).toBe('button');
    act(() => first.click());
    expect(reported).toEqual(['work']);
    unmount();
  });

  it('keeps the labels as the whole accessible name — the glyph adds no words', () => {
    const { container, unmount } = mount(
      <PillGroup legend="Scope" options={options} mode="single" value={[]} onChange={() => {}} variant="vertical" />,
    );
    const names = [...container.querySelectorAll('.pill')].map((p) => p.textContent);
    expect(names).toEqual(['Work', 'Personal', 'Both']);
    unmount();
  });
});
