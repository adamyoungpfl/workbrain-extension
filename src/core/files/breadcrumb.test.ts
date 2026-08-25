import { describe, it, expect } from 'vitest';
import { breadcrumbTrail, crumbCountShown } from './breadcrumb';
import { BRAIN_NAV_HOME, chooseNav, pullBack } from '../globe/workBrain';
import { fileToggle } from './toggle';

/**
 * V1.9 VB-52 — the trail's rules, without a browser.
 *
 * The three that matter, and that a rendering test could not prove:
 *
 * 1. THE TRAIL IS A FUNCTION OF `BrainNav`. It holds nothing of its own, so
 *    pressing a segment and zooming out in the Brain cannot end up describing
 *    two different places — the decision of 2026-08-24 exists to prevent
 *    exactly that drift.
 * 2. THE LAST RUNG IS NEVER A CONTROL. A breadcrumb whose end navigates to the
 *    screen you are already on is a control that lies.
 * 3. `pullBack` AND THE TRAIL AGREE. Pressing `Work brain` is `pullBack`, and
 *    the trail the drawer then draws is the work tier's one-rung trail.
 */

const AT_WORK = pullBack(BRAIN_NAV_HOME);

describe('breadcrumbTrail — the shape of the trail at each tier', () => {
  it('is one rung at the work brain, and that rung is where you are', () => {
    expect(breadcrumbTrail(AT_WORK, true)).toEqual([
      { id: 'work', file: 'context', current: true, pressable: false },
    ]);
  });

  it('is work → file → section inside a file with a section under way', () => {
    expect(breadcrumbTrail(BRAIN_NAV_HOME, true).map((crumb) => crumb.id)).toEqual(['work', 'file', 'section']);
  });

  it('drops the section rung when the file has not been started', () => {
    const trail = breadcrumbTrail(BRAIN_NAV_HOME, false);
    expect(trail.map((crumb) => crumb.id)).toEqual(['work', 'file']);
    // The file becomes the end of the trail, so it is what "you are here" now
    // points at — there is no empty rung hanging off a separator.
    expect(trail[trail.length - 1]!.current).toBe(true);
  });

  it('marks exactly one rung as current, at every tier', () => {
    for (const nav of [AT_WORK, BRAIN_NAV_HOME]) {
      for (const hasSection of [true, false]) {
        expect(breadcrumbTrail(nav, hasSection).filter((crumb) => crumb.current)).toHaveLength(1);
      }
    }
  });

  it('never makes the rung you are standing on pressable', () => {
    for (const nav of [AT_WORK, BRAIN_NAV_HOME]) {
      for (const hasSection of [true, false]) {
        for (const crumb of breadcrumbTrail(nav, hasSection)) {
          // The file rung is the switcher and stays pressable even when it is
          // the end of the trail — pressing it offers the files rather than
          // going anywhere.
          if (crumb.current && crumb.id !== 'file') expect(crumb.pressable).toBe(false);
        }
      }
    }
  });

  it('carries the file on every rung, so the trail can name it without looking elsewhere', () => {
    for (const crumb of breadcrumbTrail(BRAIN_NAV_HOME, true)) expect(crumb.file).toBe('context');
  });
});

describe('the trail and the zoom are one navigation', () => {
  it('pressing Work brain is pullBack, and the trail follows on its own', () => {
    const inside = BRAIN_NAV_HOME;
    expect(breadcrumbTrail(inside, true)).toHaveLength(3);
    const out = pullBack(inside);
    expect(breadcrumbTrail(out, true)).toHaveLength(1);
    // And back in through the very function the globe's file nodes run.
    const back = chooseNav(out, 'context', fileToggle('context', { context: false }));
    expect(back).toEqual(BRAIN_NAV_HOME);
    expect(breadcrumbTrail(back, true).map((crumb) => crumb.id)).toEqual(['work', 'file', 'section']);
  });

  it('a locked file refuses the move, so the trail does not move either', () => {
    const items = fileToggle('context', { context: false });
    const refused = chooseNav(BRAIN_NAV_HOME, 'skills', items);
    expect(refused).toBe(BRAIN_NAV_HOME);
    expect(breadcrumbTrail(refused, true)[1]!.file).toBe('context');
  });
});

describe('crumbCountShown', () => {
  it('counts the sections of a file only while the trail is inside one', () => {
    expect(crumbCountShown(BRAIN_NAV_HOME)).toBe(true);
    expect(crumbCountShown(AT_WORK)).toBe(false);
  });
});
