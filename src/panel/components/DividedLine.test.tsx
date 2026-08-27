import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { contextModules } from '../../core/flow/flow';
import { offeredLineOptions } from '../../core/choice/dividedLine';
import type { RepeatableBlock } from '../../schema/flow.types';
import { LINE_CUSTOM_GLYPH, ROLE_FOR_GLYPHS } from './choiceGlyphs';
import { DividedLine } from './DividedLine';
import { mount } from './testUtils';

/**
 * V2.5 VB-122 — the divided line, at the component boundary.
 *
 * The e2e spec (divided-line.spec.ts) drives the real screen, including the
 * drag; what belongs here is the census and the contract: every option key
 * the reshaped role_for can put on the line has a drawing, the group is real
 * buttons with aria-pressed and a roving tabindex, activation crosses (and
 * only reports — nothing advances), a second cross replaces the first, and
 * the crossed option refuses to un-cross itself.
 */

const roleFor = (() => {
  const roles = contextModules
    .flatMap((m) => m.nodes)
    .find((n): n is RepeatableBlock => 'fields' in n && n.id === 'roles');
  const step = roles?.fields.find((f) => f.id === 'role_for');
  if (!step) throw new Error('role_for missing from the shipped flow');
  return step;
})();

const OPTIONS = offeredLineOptions(roleFor).map((o) => ({
  value: o.v,
  label: o.l,
  glyph: ROLE_FOR_GLYPHS[o.v],
}));

describe('the census — a drawing for every key the line can show', () => {
  it('covers every option the reshaped role_for ships, offered and held alike', () => {
    const keys = (roleFor.options ?? []).map((o) => o.v);
    expect(keys).toEqual(['myself', 'family', 'team', 'my-clients', 'community', 'employer', 'clients', 'organization']);
    for (const key of keys) {
      expect(ROLE_FOR_GLYPHS[key], `glyph for "${key}"`).toBeTruthy();
    }
  });

  it('every drawing is stroke-drawn and decorative, the house convention', () => {
    const drawings = [...Object.entries(ROLE_FOR_GLYPHS), ['custom', LINE_CUSTOM_GLYPH] as const];
    for (const [key, drawing] of drawings) {
      const { container, unmount } = mount(drawing);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden'), key).toBe('true');
      expect(svg.getAttribute('stroke'), key).toBe('currentColor');
      expect(svg.getAttribute('fill'), key).toBe('none');
      unmount();
    }
  });
});

describe('the crossing contract — chips + Next underneath (FLAG 4 mechanics)', () => {
  it('is one named group of real buttons, each carrying glyph + label and nothing else', () => {
    const { container, unmount } = mount(
      <DividedLine legend="Who is it for?" options={OPTIONS} value={[]} onChange={() => {}} />,
    );
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Who is it for?');
    const buttons = group.querySelectorAll<HTMLButtonElement>('.dline-opt');
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      // A submit here would be the auto-advance the guardrail bans.
      expect(button.getAttribute('type')).toBe('button');
      expect(button.querySelector('.dline-glyph svg')).toBeTruthy();
    }
    const names = [...buttons].map((b) => b.textContent);
    expect(names).toEqual(['Myself', 'My family', 'My team', 'My clients', 'My community']);
    // The divider is drawn, and drawn as paint.
    expect(group.querySelector('.dline-divider[aria-hidden="true"]')).toBeTruthy();
    unmount();
  });

  it('activation crosses: the choice is reported, never advanced', () => {
    let reported: string[] | null = null;
    const { container, unmount } = mount(
      <DividedLine
        legend="Who is it for?"
        options={OPTIONS}
        value={[]}
        onChange={(next) => {
          reported = next;
        }}
      />,
    );
    act(() => container.querySelector<HTMLButtonElement>('.dline-opt')!.click());
    expect(reported).toEqual(['myself']);
    unmount();
  });

  it('crossing a second option replaces the first — single select on a drawing', () => {
    let reported: string[] | null = null;
    const { container, unmount } = mount(
      <DividedLine
        legend="Who is it for?"
        options={OPTIONS}
        value={['myself']}
        onChange={(next) => {
          reported = next;
        }}
      />,
    );
    const buttons = container.querySelectorAll<HTMLButtonElement>('.dline-opt');
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    act(() => buttons[2]!.click());
    expect(reported).toEqual(['team']);
    unmount();
  });

  it('the crossed option refuses to un-cross itself — no way back to nothing picked', () => {
    let calls = 0;
    const { container, unmount } = mount(
      <DividedLine
        legend="Who is it for?"
        options={OPTIONS}
        value={['myself']}
        onChange={() => {
          calls += 1;
        }}
      />,
    );
    act(() => container.querySelector<HTMLButtonElement>('.dline-opt')!.click());
    expect(calls).toBe(0);
    unmount();
  });

  it('carries a roving tabindex seeded on the stored selection, add-your-own last', () => {
    const { container, unmount } = mount(
      <DividedLine legend="Who is it for?" options={OPTIONS} value={['team']} onChange={() => {}} onAddOwn={() => {}} />,
    );
    const stops = [...container.querySelectorAll<HTMLButtonElement>('.dline-opt, .dline-add')];
    expect(stops).toHaveLength(6);
    expect(stops.map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1', '-1', '-1']);
    unmount();
  });

  it('a held entry renders like any other option — its label is its ported one', () => {
    const withHeld = [...OPTIONS, { value: 'employer', label: 'My employer', glyph: ROLE_FOR_GLYPHS.employer }];
    const { container, unmount } = mount(
      <DividedLine legend="Who is it for?" options={withHeld} value={['employer']} onChange={() => {}} />,
    );
    const pressed = container.querySelector('.dline-opt[aria-pressed="true"]')!;
    expect(pressed.textContent).toBe('My employer');
    unmount();
  });
});
