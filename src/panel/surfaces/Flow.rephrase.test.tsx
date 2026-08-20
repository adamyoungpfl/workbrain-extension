import { describe, it, expect } from 'vitest';
import { REPHRASE_ICON, REPHRASE_CUE_CLASS, restartRephraseCue } from './Flow';
import { mount } from '../components/testUtils';

/**
 * V1.1 VB-04's animation. Two things are worth testing here without a browser,
 * and only two — the rest is real rendered motion and is asserted in
 * tests/e2e/rephrase.spec.ts, because a class toggling is not an animation.
 *
 * First, the drawing. Splitting the glyph into a ring group and a mark group
 * was supposed to change the grouping and nothing else; the path data is a
 * transcription, and one digit lost while moving lines around produces an arc
 * that no longer closes — visible on screen, invisible in a diff. So the four
 * marks are asserted character-for-character, in their groups.
 *
 * Second, the restart. `restartRephraseCue` exists entirely for the press that
 * lands mid-flight, and its whole substance is that the layout read happens
 * *between* the removal and the re-add. That ordering is the thing that works
 * or doesn't, so it is asserted as an ordering, not by trusting the source.
 */

/** The glyph as drawn at c3f63a3, before it was grouped. */
const RING_ARC = 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1';
const RING_ARROWHEAD = 'M20.9 3.6v4.6h-4.6';
const MARK_GLYPH = 'M9.6 9.7a2.5 2.5 0 1 1 2.7 2.8v1.4';

describe('the rephrase glyph', () => {
  it('is two groups, and nothing outside them', () => {
    const { container } = mount(REPHRASE_ICON);
    const svg = container.querySelector('svg')!;
    const groups = [...svg.children];
    expect(groups.map((g) => g.tagName)).toEqual(['g', 'g']);
    expect(groups.map((g) => g.getAttribute('class'))).toEqual(['rephrase-ring', 'rephrase-mark']);
  });

  it('draws the same four marks it did as a static icon', () => {
    const { container } = mount(REPHRASE_ICON);
    const ring = container.querySelector('.rephrase-ring')!;
    const mark = container.querySelector('.rephrase-mark')!;

    expect([...ring.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual([
      RING_ARC,
      RING_ARROWHEAD,
    ]);
    expect([...mark.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual([MARK_GLYPH]);

    const dot = mark.querySelector('circle')!;
    expect(dot.getAttribute('cx')).toBe('12.3');
    expect(dot.getAttribute('cy')).toBe('16.9');
    expect(dot.getAttribute('r')).toBe('1.05');
    // The dot is the one filled mark; the rest are strokes.
    expect(dot.getAttribute('fill')).toBe('currentColor');
    expect(dot.getAttribute('stroke')).toBe('none');
  });

  it('keeps its stroke on the root, so grouping changed nothing about how it renders', () => {
    const { container } = mount(REPHRASE_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('17');
    // Neither group may carry a colour or a size of its own.
    for (const g of svg.querySelectorAll('g')) {
      expect(g.getAttribute('stroke')).toBeNull();
      expect(g.getAttribute('transform')).toBeNull();
    }
  });

  it('stays decorative — the button around it carries the name', () => {
    const { container } = mount(REPHRASE_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    // No SMIL: the motion is CSS, so reduced motion can replace it.
    expect(svg.querySelector('animate, animateTransform, set')).toBeNull();
  });
});

describe('restartRephraseCue', () => {
  /** Records every class change and every layout read, in the order they
   *  happen, by watching the element rather than the implementation. */
  function watch(el: HTMLElement) {
    const log: string[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    // MutationObserver delivers asynchronously, so the pending records are
    // pulled at each point of interest instead — which is what puts the class
    // changes and the layout read on one honest timeline.
    const flush = () => {
      for (const record of observer.takeRecords()) {
        log.push(record.oldValue?.includes(REPHRASE_CUE_CLASS) ? 'off' : 'on');
      }
    };
    Object.defineProperty(el, 'offsetWidth', {
      configurable: true,
      get: () => {
        flush();
        log.push('read');
        return 0;
      },
    });
    return {
      drain: () => {
        flush();
        observer.disconnect();
        return log;
      },
    };
  }

  it('turns the cue on for a first press', () => {
    const button = document.createElement('button');
    restartRephraseCue(button);
    expect(button.classList.contains(REPHRASE_CUE_CLASS)).toBe(true);
  });

  it('takes the cue off, forces the layout, and puts it back — in that order', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.classList.add(REPHRASE_CUE_CLASS);

    const watcher = watch(button);
    restartRephraseCue(button);
    // Off, then the layout read that commits it, then on again. Without the
    // read in the middle the browser coalesces this into no change at all and
    // the animation carries on from where it was.
    expect(watcher.drain()).toEqual(['off', 'read', 'on']);
    expect(button.classList.contains(REPHRASE_CUE_CLASS)).toBe(true);
    button.remove();
  });

  it('leaves every other class on the button alone', () => {
    const button = document.createElement('button');
    button.className = `btn btn-quiet flow-rephrase ${REPHRASE_CUE_CLASS}`;
    restartRephraseCue(button);
    expect(button.className.split(' ').sort()).toEqual(
      ['btn', 'btn-quiet', 'flow-rephrase', REPHRASE_CUE_CLASS].sort(),
    );
  });
});
