import { describe, it, expect } from 'vitest';
import { IDEA_ICON, IDEA_CUE_CLASS, REPHRASE_CUE_CLASS, restartIdeaCue } from './Flow';
import { mount } from '../components/testUtils';

/**
 * V1.1 VB-08's glyph and its restart. Two things are worth testing here
 * without a browser, and only two — the rest is real rendered motion and is
 * asserted in tests/e2e/ideas.spec.ts, because a class toggling is not an
 * animation.
 *
 * First, the drawing. The bulb outline is a transcription of computed
 * geometry (a 4.8-radius circle centred at 12, 9.6, closed with a neck), and
 * one digit lost while moving lines around produces an arc that no longer
 * closes — visible on screen, invisible in a diff. The rays matter even more:
 * they are invisible at rest, so a ray silently deleted or moved would only
 * ever show up in the 160ms of a press that nobody is screenshotting.
 *
 * Second, the restart. `restartIdeaCue` exists entirely for the press that
 * lands mid-flight — the normal case for a control with ten examples behind
 * it — and its whole substance is that the layout read happens *between* the
 * removal and the re-add. That ordering is the thing that works or doesn't,
 * so it is asserted as an ordering, not by trusting the source.
 */

/** The bulb, as drawn: outline, then the two base lines. */
const GLASS = ['M10.1 14A4.8 4.8 0 1 1 13.9 14v1.1h-3.8z', 'M10.2 17h3.6', 'M10.9 19.1h2.2'];
/** The five rays, left to right — a fan about the bulb's top at (12, 4.8). */
const RAYS = [
  'M8.7 3.3L7.1 2.5',
  'M9.9 1.9L8.9 0.4',
  'M12 1.2V-0.6',
  'M14.1 1.9L15.1 0.4',
  'M15.3 3.3L16.9 2.5',
];

describe('the light bulb glyph', () => {
  it('is two groups, and nothing outside them', () => {
    const { container } = mount(IDEA_ICON);
    const svg = container.querySelector('svg')!;
    const groups = [...svg.children];
    expect(groups.map((g) => g.tagName)).toEqual(['g', 'g']);
    expect(groups.map((g) => g.getAttribute('class'))).toEqual(['idea-glass', 'idea-rays']);
  });

  it('draws the bulb as an outline and two base lines', () => {
    const { container } = mount(IDEA_ICON);
    const glass = container.querySelector('.idea-glass')!;
    expect([...glass.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(GLASS);
    // Stroke-based, like every other icon in this panel — a filled bulb would
    // read as "lit", which is a state this button does not have.
    expect(glass.querySelector('[fill]')).toBeNull();
  });

  it('draws exactly five rays, and they are their own group', () => {
    const { container } = mount(IDEA_ICON);
    const rays = container.querySelector('.idea-rays')!;
    const drawn = [...rays.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    expect(drawn).toHaveLength(5);
    expect(drawn).toEqual(RAYS);
  });

  it('keeps the rays out of the resting glyph, and lets them out of the box', () => {
    // Not an inline attribute: `opacity: 0` and `overflow: visible` are
    // Flow.css's, so reduced motion and the burst are one decision in one
    // place. What this asserts is that the drawing does not contradict it —
    // no ray may carry its own opacity, and the fan really does reach past
    // the top of the 24-unit box, which is why the overflow rule exists.
    const { container } = mount(IDEA_ICON);
    const rays = [...container.querySelectorAll<SVGPathElement>('.idea-rays path')];
    for (const ray of rays) expect(ray.getAttribute('opacity')).toBeNull();
    expect(rays.some((r) => /-\d/.test(r.getAttribute('d') ?? ''))).toBe(true);
  });

  it('keeps its stroke on the root, so the groups only ever animate', () => {
    const { container } = mount(IDEA_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('17');
    expect(svg.getAttribute('fill')).toBe('none');
    // Neither group may carry a colour, a size, or a transform of its own.
    for (const g of svg.querySelectorAll('g')) {
      expect(g.getAttribute('stroke')).toBeNull();
      expect(g.getAttribute('transform')).toBeNull();
      expect(g.getAttribute('opacity')).toBeNull();
    }
  });

  it('stays decorative — the button around it carries the words', () => {
    const { container } = mount(IDEA_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    // No SMIL: the motion is CSS, so reduced motion can replace it.
    expect(svg.querySelector('animate, animateTransform, set')).toBeNull();
  });
});

describe('restartIdeaCue', () => {
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
        log.push(record.oldValue?.includes(IDEA_CUE_CLASS) ? 'off' : 'on');
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
    restartIdeaCue(button);
    expect(button.classList.contains(IDEA_CUE_CLASS)).toBe(true);
  });

  it('takes the cue off, forces the layout, and puts it back — in that order', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.classList.add(IDEA_CUE_CLASS);

    const watcher = watch(button);
    restartIdeaCue(button);
    // Off, then the layout read that commits it, then on again. Without the
    // read in the middle the browser coalesces this into no change at all and
    // the burst carries on from where it was instead of firing again.
    expect(watcher.drain()).toEqual(['off', 'read', 'on']);
    expect(button.classList.contains(IDEA_CUE_CLASS)).toBe(true);
    button.remove();
  });

  it('leaves every other class on the button alone', () => {
    const button = document.createElement('button');
    button.className = `btn btn-secondary btn-sm flow-idea ${IDEA_CUE_CLASS}`;
    restartIdeaCue(button);
    expect(button.className.split(' ').sort()).toEqual(
      ['btn', 'btn-secondary', 'btn-sm', 'flow-idea', IDEA_CUE_CLASS].sort(),
    );
  });

  it('is a different cue from rephrase, so one press cannot play the other', () => {
    expect(IDEA_CUE_CLASS).not.toBe(REPHRASE_CUE_CLASS);
    const button = document.createElement('button');
    button.classList.add(REPHRASE_CUE_CLASS);
    restartIdeaCue(button);
    expect(button.classList.contains(REPHRASE_CUE_CLASS)).toBe(true);
    expect(button.classList.contains(IDEA_CUE_CLASS)).toBe(true);
  });
});
