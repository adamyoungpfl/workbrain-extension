import { describe, it, expect } from 'vitest';
import { S } from './strings';
import { ALL_PROOF_SERVICES, SERVICE_PERSONAS, personaForService } from '../core/flow/serviceThemes';
import { GOAL_GATE_NODES } from '../core/flow/overrides';
import { PERSONA_GLYPHS } from './components/choiceGlyphs';
import { Pill, PillGroup } from './components/Pill';
import { mount } from './components/testUtils';

/**
 * V2.4 VB-105 — the census that keeps "one list, one look" true.
 *
 * The service list renders in two places — the goal gate's chips
 * (core/flow/overrides.ts) and the proof loop's picker (S.proofServiceOptions
 * via App.tsx) — and both must carry the same seven services, the same labels
 * and the same personas. This is the panel-side half of the assertion: it can
 * import both worlds (a test may; shipped core code may not import panel),
 * so it is where the two lists meet.
 *
 * And the FLAG 4 contract, rendered: a themed pill's accessible name is its
 * label and nothing else — the persona is paint.
 */

const gateOptions = (() => {
  const node = GOAL_GATE_NODES.find((n) => n.kind === 'question' && n.id === 'goal_service');
  if (!node || node.kind !== 'question') throw new Error('goal_service missing from GOAL_GATE_NODES');
  return node.options ?? [];
})();

describe('one service list, three holders (VB-105)', () => {
  const keys = ALL_PROOF_SERVICES.map((s) => s.key);

  it("the proof picker's chips carry exactly the merged list's keys, in order", () => {
    expect(S.proofServiceOptions.map((o) => o.key)).toEqual(keys);
  });

  it("the goal gate's chips carry exactly the merged list's keys, in order", () => {
    expect(gateOptions.map((o) => o.key)).toEqual(keys);
  });

  it('both holders print the same label per key — the gate and the picker are one look', () => {
    for (const option of S.proofServiceOptions) {
      expect(gateOptions.find((o) => o.key === option.key)?.label, option.key).toBe(option.label);
    }
  });

  it('every service has a persona and every persona has a drawing', () => {
    for (const key of keys) {
      const persona = personaForService(key);
      expect(persona, key).toBeTruthy();
      expect(PERSONA_GLYPHS[persona!], `${key} -> ${persona}`).toBeTruthy();
    }
    expect(Object.keys(PERSONA_GLYPHS).sort()).toEqual(Object.values(SERVICE_PERSONAS).sort());
  });
});

describe('a themed pill (FLAG 4: design-only)', () => {
  it("carries the persona as paint — classes and an aria-hidden drawing, never words", () => {
    const { container, unmount } = mount(
      <Pill pressed={false} tone="scholar" glyph={PERSONA_GLYPHS.scholar}>
        Claude
      </Pill>,
    );
    const button = container.querySelector('button')!;
    expect(button.classList.contains('pill-themed')).toBe(true);
    expect(button.classList.contains('pill-theme-scholar')).toBe(true);
    const svg = button.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    // The accessible name is the label, full stop: the glyph adds no text and
    // the persona word appears nowhere a person or a screen reader meets it.
    expect(button.textContent).toBe('Claude');
    expect(button.getAttribute('aria-label')).toBeNull();
    unmount();
  });

  it('renders plain when a value has no persona — the graceful unthemed path', () => {
    const { container, unmount } = mount(<Pill pressed={false}>Anything</Pill>);
    const button = container.querySelector('button')!;
    expect(button.className).toBe('pill');
    expect(button.querySelector('.pill-glyph')).toBeNull();
    unmount();
  });

  it('every persona glyph is stroke-drawn, decorative, and free of its own colour', () => {
    for (const [persona, drawing] of Object.entries(PERSONA_GLYPHS)) {
      const { container, unmount } = mount(drawing);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden'), persona).toBe('true');
      expect(svg.getAttribute('stroke'), persona).toBe('currentColor');
      expect(svg.getAttribute('fill'), persona).toBe('none');
      expect(svg.getAttribute('viewBox'), persona).toBe('0 0 24 24');
      // No hard-coded colour and no SMIL — paint is the theme classes' job,
      // motion is CSS's, so reduced-motion stays one decision in one place.
      expect(svg.querySelector('[stroke]:not(svg), [fill]:not(svg)'), persona).toBeNull();
      expect(svg.querySelector('animate, animateTransform, set'), persona).toBeNull();
      unmount();
    }
  });

  it('a themed group keeps its keyboard contract — themes change paint, not the pattern', () => {
    const options = S.proofServiceOptions.map((o) => {
      const persona = personaForService(o.key);
      return {
        value: o.key,
        label: o.label,
        ...(persona ? { tone: persona, glyph: PERSONA_GLYPHS[persona] } : {}),
      };
    });
    const { container, unmount } = mount(
      <PillGroup legend="Which AI do you use most?" options={options} mode="single" value={[]} onChange={() => {}} />,
    );
    const pills = [...container.querySelectorAll<HTMLButtonElement>('.pill')];
    expect(pills).toHaveLength(7);
    // Roving tabindex: exactly one stop in the Tab order.
    expect(pills.filter((p) => p.tabIndex === 0)).toHaveLength(1);
    // Every chip is named by its label alone.
    expect(pills.map((p) => p.textContent)).toEqual(S.proofServiceOptions.map((o) => o.label));
    unmount();
  });
});
