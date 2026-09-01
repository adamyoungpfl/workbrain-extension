import { describe, it, expect, beforeAll } from 'vitest';
import { FlowProgress } from './FlowProgress';
import { mount } from './testUtils';
import { S } from '../strings';

/**
 * V1.2 VB-10 put a typewriter on the label. jsdom has no `matchMedia` at all,
 * so `prefersReducedMotion()` would fall through to "not reduced" and every
 * mount below would start a real 10ms interval updating state outside `act` —
 * noise that says nothing about this component. Declaring the preference is
 * the same move FileTree.test.tsx makes, for the same reason: these tests are
 * about structure, and the printing itself is asserted in Typed.test.tsx and,
 * where it actually matters, in a real browser in tests/e2e/typewriter.spec.ts.
 */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('FlowProgress', () => {
  it('shows the module title and nothing else', () => {
    const { container } = mount(<FlowProgress title="About Me" current={12} total={38} />);
    expect(container.querySelector('.flowprogress-title')?.textContent).toBe('About Me');
    expect(container.textContent).toBe('About Me');
  });

  it('prints no digit anywhere on screen — that is the whole point of the bar', () => {
    const { container } = mount(<FlowProgress title="How I Communicate" current={12} total={38} />);
    expect(container.textContent).not.toMatch(/\d/);
  });

  /**
   * O6b (Adam, 2026-08-28) — the count is not spoken either.
   *
   * This test used to assert the opposite, on the reasoning that removing a
   * number visually is a design choice and losing it for a screen reader is a
   * bug. D1's point is that the number is not worth having: it is something to
   * bargain with. Giving it to one audience and not the other hands the
   * bargaining chip to the person who cannot see the marks.
   *
   * The ROLE stays. A progressbar with no `aria-valuenow` is ARIA's own
   * indeterminate state — announced by name, as progress, with no figure —
   * and the role is what keeps the module title announced exactly once.
   */
  it('is a progressbar with no value at all, in either shape', () => {
    for (const props of [
      { title: 'Orientation', current: 3, total: 38 },
      { title: 'Orientation', current: 3, total: 38, run: { done: 2, of: 5, label: 'Second run of three' } },
    ]) {
      const { container } = mount(<FlowProgress {...props} />);
      const bar = container.querySelector('[role="progressbar"]')!;
      expect(bar).not.toBeNull();
      for (const attr of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext']) {
        expect(bar.getAttribute(attr), attr).toBeNull();
      }
      // And nothing else on the strip smuggles one back in.
      expect(container.innerHTML).not.toMatch(/aria-value/);
    }
  });

  it('names the bar with the module title, and announces it only once', () => {
    const { container } = mount(<FlowProgress title="Initiatives" current={1} total={38} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Initiatives');
    // Everything visible inside is hidden from the tree, so a screen reader
    // hears "Initiatives" as the bar's name, not as a paragraph and then
    // again as a label.
    expect(container.querySelector('.flowprogress-title')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.flowprogress-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills the track in proportion to how far in the question is', () => {
    const { container } = mount(<FlowProgress title="My World" current={19} total={38} />);
    const fill = container.querySelector('.flowprogress-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('is never distinguished by the fill alone — the title always names the module', () => {
    const first = mount(<FlowProgress title="Orientation" current={1} total={38} />);
    const last = mount(<FlowProgress title="Reference Examples" current={38} total={38} />);
    expect(first.container.querySelector('.flowprogress-title')?.textContent).toBe('Orientation');
    expect(last.container.querySelector('.flowprogress-title')?.textContent).toBe('Reference Examples');
    expect((last.container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('100%');
  });

  it('clamps rather than overflowing when the index runs past the total', () => {
    const { container } = mount(<FlowProgress title="The proof" current={9} total={5} />);
    expect((container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('100%');
    // O6b removed the value the second half of this used to check. The drawing
    // is the only account of position now, and clamping it is the whole claim.
  });

  it('degrades to unnamed progress if a module ever arrives without a title', () => {
    // The fallback name used to be the spoken count, and O6b took that away.
    // Not reachable with the shipped data — every module has a title — and
    // an unnamed progressbar is the honest degradation, not a number nobody
    // asked for smuggled back in through the one door left open.
    const { container } = mount(<FlowProgress title="" current={2} total={38} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('');
    // The mark's own path data is full of digits; what matters is that no
    // number is announced or printed.
    expect(bar.textContent).not.toMatch(/\d/);
    expect(bar.outerHTML).not.toMatch(/aria-value/);
  });

  it('does not divide by zero on an empty flow', () => {
    const { container } = mount(<FlowProgress title="Orientation" current={0} total={0} />);
    expect((container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('0%');
  });

});

/* ── V2.9 — THE HOME DOOR MOVED (Adam, 2026-09-02) ─────────────────────────

   The mark used to sit at the head of this row and go Home, and these tests
   held two real claims about it: that it drew the STATIC pose rather than a
   spinning one, and that it communicated by icon alone as a judged exception
   to §1.

   Both are retired with the control. The mark is in the opposite corner now
   driving the narrator, and Home moved into the jump sheet — so the exception
   to §1 is retired rather than merely relocated, which is the better outcome:
   there is no icon-only control in this header at all any more.

   WHAT REPLACES THEM is the claim the new arrangement makes. */

describe('FlowProgress — the label and bar are the way out', () => {
  it('is a real control, named, when there is somewhere to jump', () => {
    const { container } = mount(
      <FlowProgress title="About Me" current={5} total={38} onJumpTo={() => {}} />,
    );
    const jump = container.querySelector('.flowprogress-jump')!;
    expect(jump.tagName).toBe('BUTTON');
    expect(jump.getAttribute('aria-label')).toBe(S.jumpOpen);
    // The title is still inside it, so the control is the status line itself
    // rather than a button sitting next to one.
    expect(jump.textContent).toContain('About Me');
  });

  it('draws no mark at all — the row starts at the panel edge', () => {
    // The left slot going empty is the point: this row now begins exactly
    // where the question block below it does.
    const { container } = mount(
      <FlowProgress title="About Me" current={5} total={38} onJumpTo={() => {}} />,
    );
    expect(container.querySelector('.flowprogress-mark')).toBeNull();
  });

  it('is not a control at all when there is nowhere to jump', () => {
    // A button that does nothing is worse than no button: it is a promise the
    // screen cannot keep, and it takes a tab stop to make it.
    const { container } = mount(<FlowProgress title="About Me" current={5} total={38} />);
    expect(container.querySelector('.flowprogress-jump')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });
});

/* ── BS-05a (§5) — the run, as marks ─────────────────────────────────────── */

describe('FlowProgress — a run of five', () => {
  const run = { done: 1, of: 5, label: 'second run of two' };

  it('draws one mark per question in the run, and no bar', () => {
    const { container } = mount(<FlowProgress title="About Me" current={3} total={38} run={run} />);
    expect(container.querySelectorAll('.flowprogress-beat')).toHaveLength(5);
    expect(container.querySelector('.flowprogress-track')).toBeNull();
  });

  it('marks what is behind, what they are on, and what is left', () => {
    const { container } = mount(<FlowProgress title="About Me" current={3} total={38} run={run} />);
    const states = [...container.querySelectorAll('.flowprogress-beat')].map((b) => b.getAttribute('data-state'));
    expect(states).toEqual(['done', 'here', 'left', 'left', 'left']);
  });

  /** D1, held strictly: no digit anywhere in the panel's own voice. */
  it('still prints no digit — the whole point of the row', () => {
    const { container } = mount(<FlowProgress title="About Me" current={3} total={38} run={run} />);
    expect(container.textContent).toBe('About Me');
    expect(container.textContent).not.toMatch(/\d/);
  });

  /**
   * The words §5 asks for are SPOKEN rather than printed — the header will
   * not take another line (see the component's own note). The marks carry it
   * for the eye by width and ring, never colour alone.
   */
  /**
   * O6b — the run's own count is not spoken either.
   *
   * BS-05a replaced the global total with a run-scoped one ("four left in
   * this run") on the reasoning that five is a number people do not bargain
   * with. Adam's call is that the panel simply does not verbalize a count:
   * the marks are the account, for everybody.
   */
  it('speaks no count at all, run or global', () => {
    const { container } = mount(<FlowProgress title="About Me" current={3} total={38} run={run} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuetext')).toBeNull();
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('aria-valuemax')).toBeNull();
    // The module title, and nothing numeric anywhere in the announced tree.
    expect(bar.getAttribute('aria-label')).toBe('About Me');
    expect(container.innerHTML).not.toMatch(/38|aria-value/);
  });

  it('keeps the bar for a flow with no runs — the proof loop', () => {
    const { container } = mount(<FlowProgress title="The proof" current={2} total={5} />);
    expect(container.querySelector('.flowprogress-track')).not.toBeNull();
    expect(container.querySelectorAll('.flowprogress-beat')).toHaveLength(0);
  });
});