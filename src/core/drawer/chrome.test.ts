import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contrastRatio } from '../color/contrast';
import type { Rgb } from '../color/contrast';
import { DOCK_BOUNDARY_MIN_CONTRAST, DOCK_FRAME, DOCK_TEXT_MIN_CONTRAST } from './chrome';

/**
 * The dock's palette, against docs/GUARDRAILS.md — read out of
 * design/tokens.json rather than restated.
 *
 * V1.4 VB-22 wrote this file about a gradient: every colour the dock put on
 * that ramp, checked at the bottom edge of the buttons, in their middle and at
 * their top edge. V1.7 VB-41 removed the ramp (core/drawer/chrome.ts), so what
 * is checked here is two flat grounds instead of one moving one — the panel's
 * canvas, which the button cluster now stands on, and the drawer's own dark
 * stage, which is unchanged from the handle down.
 *
 * Reading the tokens rather than restating them is deliberate. A test with the
 * hex values copied into it passes forever while the product drifts; this one
 * fails the moment someone edits `--globe-panel` or the stage colours, which is
 * exactly the conversation that should happen. tests/e2e/button-cluster.spec.ts
 * and tests/e2e/dock-surface.spec.ts then prove the same things about the
 * pixels a browser really painted — this proves them about the palette we
 * chose.
 */

interface TokenFile {
  color: Record<string, { value?: string } & Record<string, { value?: string }>>;
}

// From the repo root, which is where vitest runs: under jsdom `import.meta.url`
// is an http URL and readFileSync will not take one.
const tokens = JSON.parse(readFileSync(resolve(process.cwd(), 'design/tokens.json'), 'utf8')) as TokenFile;

function hex(text: string): Rgb {
  return {
    r: parseInt(text.slice(1, 3), 16),
    g: parseInt(text.slice(3, 5), 16),
    b: parseInt(text.slice(5, 7), 16),
  };
}

/** One token by name, `group.key` for the two nested palettes. Throws rather
 * than returning a default: a renamed token must break this file loudly. */
function token(name: string): Rgb {
  const [head, tail] = name.split('.');
  const group = tokens.color[head!];
  if (!group) throw new Error(`no such token group: ${head}`);
  const entry = tail === undefined ? group : (group as Record<string, { value?: string }>)[tail];
  const value = entry?.value;
  if (typeof value !== 'string') throw new Error(`no such token: ${name}`);
  return hex(value);
}

const CANVAS = token('canvas');
/**
 * The stage the dock takes its colour from, per mode.
 *
 * V1.6 VB-30 made those two the SAME colour: the drawer's head band is the
 * Brain visual's dark field in List as well, so everything drawn on it stands
 * on that field in both modes. Kept as a map rather than collapsed to one
 * constant because the two modes are still two cases that have to be checked —
 * the assertions below are the ones that would catch the day one of them drifts
 * back.
 */
const STAGE = { brain: token('globe.field'), list: token('globe.field') };

/** V1.6 VB-30. What is left of "List's own lighter stage": the ground the
 * drawer's CONTENT sits on, which the bar above it no longer shares. */
const PANE_LIST = token('surface');

describe('the frame the pane sits inside (VB-29)', () => {
  it('is the panel’s own margin', () => {
    // 8px is not a number somebody liked: it is the panel body's own margin,
    // which is why the pane's sides land in the column the rest of the product
    // already uses.
    expect(DOCK_FRAME).toBe(8);
  });
});

/**
 * V1.7 VB-41 — THE FLOOR THE BUTTON CLUSTER HAS TO CLEAR NOW.
 *
 * The containers are gone, so a nav label is no longer read against a chip cut
 * from the dock's own palette. It is read against whatever the bar is painted,
 * and the bar is painted the panel's own canvas — flat, the same at every drag
 * height, in both modes, because the fade that used to move under these
 * controls has gone with the boxes (core/drawer/chrome.ts's header).
 *
 * That makes the check simple, which is the point of it: three inks on one
 * ground. tests/e2e/button-cluster.spec.ts then proves the ground really is
 * that colour behind every control, from real pixels, at three drag heights in
 * both modes — this proves the inks we chose are legible on it.
 */
describe('the button cluster, on the panel’s own canvas (VB-41)', () => {
  it('reads every label on the canvas, well clear of the floor', () => {
    // Back and any other secondary.
    expect(contrastRatio(token('ink-2'), CANVAS)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    // Next, which is the only coloured word in the cluster.
    expect(contrastRatio(token('primary'), CANVAS)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    // Skip, the quietest thing in the bar and therefore the one worth stating:
    // --ink-3 is 4.71:1, which clears 4.5 with little to spare. If a future
    // token change takes it under, this is where that shows up.
    expect(contrastRatio(token('ink-3'), CANVAS)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
  });

  it('focuses with the panel’s own ring, which the dark stage could not use', () => {
    // On the canvas --primary is the ring every other control in the product
    // uses, and it clears 1.4.11 outright. Stated beside the reason the dock
    // needed a different one: on the drawer's dark stage the same ring is
    // 2.90:1, which is why --globe-focus exists (design/tokens.json).
    expect(contrastRatio(token('primary'), CANVAS)).toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
    expect(contrastRatio(token('primary'), STAGE.brain)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('is not carried by colour alone — and could not be, at these ratios', () => {
    // The three controls are three words, so nothing here is identified by
    // colour in the first place (Back, Next and Skip are their own labels, and
    // the two navigating ones carry a chevron as well — components/NavButton).
    // What colour adds is emphasis, and this is the statement that emphasis is
    // all it adds: the primary and the secondary are within a point of each
    // other against the canvas, so a person who cannot tell the two hues apart
    // has lost nothing but the accent.
    const primary = contrastRatio(token('primary'), CANVAS);
    const secondary = contrastRatio(token('ink-2'), CANVAS);
    expect(Math.abs(primary - secondary)).toBeLessThan(1);
  });

  it('leaves nothing standing on the deleted ramp', () => {
    // The old bar gave every control an opaque chip cut from --globe-panel so
    // the gradient could pass behind it. Nothing in the cluster has a ground of
    // its own now, and the ground it does have is the canvas — so the dark
    // set's inks would be unreadable there. Stated so a half-done revert fails
    // here rather than on a screen.
    expect(contrastRatio(token('globe.label'), CANVAS)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('globe.detail-key'), CANVAS)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
  });
});

/**
 * The dark stage did not go anywhere — VB-41 changed the bar ABOVE the drawer,
 * not the drawer. Everything below is the chrome from the handle down: the head
 * band, its two mode glyphs, the section count and the grip, which is now the
 * first dark thing under the cluster and therefore the boundary that has to
 * hold on its own.
 */
describe('Brain — the drawer’s own chrome on the dark stage', () => {
  it('bounds the grip and the pressed toggle against the field they sit on', () => {
    // The grip's two bars, which are the whole of the handle's visible
    // representation (FileDrawer.css) — and, since VB-41 took the fade away,
    // the first thing under the cluster with an edge to hold.
    expect(contrastRatio(token('globe.detail-key'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
    // The pressed mode toggle's own chip, cut from the dock's deep navy.
    expect(contrastRatio(token('globe.panel'), token('globe.label'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // And the band itself against the canvas above it. VB-41 removed the ramp
    // between the two, so this seam is now a plain edge — which only works
    // because the two colours are nowhere near each other.
    expect(contrastRatio(STAGE.brain, CANVAS)).toBeGreaterThan(DOCK_TEXT_MIN_CONTRAST * 2);
  });

  it('reads every label on the band against the band', () => {
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.detail-key'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
  });

  it('carries the bar’s own light text on the stage itself', () => {
    // The two mode toggles and the section count, which sit on the drawer's
    // head.
    expect(contrastRatio(token('globe.detail-key'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.label'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // The pressed toggle's own chip, and the ring the dark stage focuses with
    // (--primary measures 2.90:1 here, which is why it is not this).
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.focus'), STAGE.brain)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
  });
});

/**
 * V1.6 VB-30 — one head band, in both modes.
 *
 * The band takes the Brain visual's dark field in List as well, so in List it
 * deliberately sits ON a light pane. Every glyph, count and grip bar on it
 * therefore stands on a background it did not stand on before V1.6, and the
 * honest way to say so is to run List's block against the same stage Brain's is
 * run against and watch it hold.
 *
 * V1.7 VB-41 leaves this half untouched — it removed the ramp ABOVE the band,
 * not the band — so what is gone from this block is only the assertions that
 * were about controls standing in that ramp.
 */
describe('List — the drawer’s head band stands on the same dark field', () => {
  it('is the same stage as Brain: one bar, not two dressed alike', () => {
    expect(STAGE.list).toEqual(STAGE.brain);
    // …and it really is dark, not merely equal to whatever Brain happens to
    // be: a bar that reads as the globe's own field is the point of VB-30.
    expect(contrastRatio(STAGE.list, CANVAS)).toBeGreaterThan(DOCK_TEXT_MIN_CONTRAST * 2);
  });

  it('bounds everything drawn on the band against the band', () => {
    // The grip's two bars and the unpressed mode glyphs, which are non-text
    // indicators and so carry WCAG 1.4.11 rather than the text floor.
    expect(contrastRatio(token('globe.detail-key'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
    // The ring the band focuses with, and the reason it is not --primary.
    expect(contrastRatio(token('globe.focus'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
    expect(contrastRatio(token('primary'), STAGE.list)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('reads every label against a ground that clears the floor', () => {
    // The pressed mode toggle's own chip, cut from the dock's deep navy.
    expect(contrastRatio(token('globe.label'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.detail-key'), token('globe.panel'))).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // And the band's own two: the mode toggles and the section count, which
    // VB-30 says go light and STAY light.
    expect(contrastRatio(token('globe.detail-key'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    expect(contrastRatio(token('globe.label'), STAGE.list)).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    // The ink the light bar used to carry would now be unreadable — stated so
    // a half-done revert fails here rather than on a screen.
    expect(contrastRatio(token('ink-2'), STAGE.list)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
  });

  it('leaves the drawer’s own pane light, and --dock-edge with a job', () => {
    // What VB-30 did NOT change: below the bar, List is still the panel's own
    // light ground, and everything the drawer prints on it is measured there.
    expect(contrastRatio(token('ink'), PANE_LIST)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('ink-2'), PANE_LIST)).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    // --ink-3 is 4.71:1 on the canvas and 4.40:1 here, which is why the pane's
    // quiet text steps up (FileDrawer.css).
    expect(contrastRatio(token('ink-3'), PANE_LIST)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    // And why --dock-edge exists at all: --border-i is measured against
    // --canvas and drops under the floor on this pane, where the drawer's own
    // hollow pill still needs a 3:1 boundary.
    expect(contrastRatio(token('border-i'), PANE_LIST)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
    expect(contrastRatio(token('dock-edge'), PANE_LIST)).toBeGreaterThanOrEqual(
      DOCK_BOUNDARY_MIN_CONTRAST,
    );
  });
});
