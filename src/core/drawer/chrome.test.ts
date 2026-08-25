import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contrastRatio } from '../color/contrast';
import type { Rgb } from '../color/contrast';
import {
  DOCK_BOUNDARY_MIN_CONTRAST,
  DOCK_LINE_TOKEN,
  DOCK_ORB_TOKENS,
  DOCK_ROLES,
  DOCK_SURFACE_TOKEN,
  DOCK_TEXT_MIN_CONTRAST,
  dockRoleFloor,
} from './chrome';

/**
 * The dock's palette, against docs/GUARDRAILS.md — read out of
 * design/tokens.json rather than restated.
 *
 * V1.4 VB-22 wrote this file about a gradient. V1.7 VB-41 removed the ramp and
 * it became two flat grounds — the panel's canvas under the button cluster, and
 * the drawer's dark stage from the handle down.
 *
 * **V1.9 VB-50 makes the drawer's half of that ONE ground.** The pane the
 * List's rows used to sit on is gone; so are the hover tints, the pressed
 * chips and the white frame around the whole thing. Every control in the drawer
 * — the trail's rungs, the file chips, the view bar's two glyphs, the list's
 * rows and their orbs, the work shelf, the file preview — is now read against
 * `--globe-field` and nothing else. So the shape of this file changes with it:
 * where it used to check a handful of inks against two grounds, it now walks
 * the palette core declares (`DOCK_ROLES`) against the one surface core names
 * (`DOCK_SURFACE_TOKEN`).
 *
 * Reading the tokens rather than restating them is deliberate. A test with the
 * hex values copied into it passes forever while the product drifts; this one
 * fails the moment someone edits `--globe-field` or any role drawn on it, which
 * is exactly the conversation that should happen. tests/e2e/one-surface.spec.ts
 * then proves the same things about the pixels a browser really painted — this
 * proves them about the palette we chose.
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
/** The one surface, named by core rather than by this file. */
const FIELD = token(DOCK_SURFACE_TOKEN);

/**
 * V1.9 VB-50 — ONE SURFACE, TOP EDGE TO BOTTOM EDGE.
 *
 * This is the block that pays for the task's central risk: removing the tints
 * removed the grounds half these controls were being measured against, so every
 * one of them now has to hold against the field itself.
 */
describe('one surface, and everything drawn on it (VB-50)', () => {
  it('is really dark, and really is the globe’s own field', () => {
    // A bar that reads as the globe's own field is the point (VB-30), and one
    // colour from the drawer's top edge to the panel's bottom is VB-50's.
    expect(contrastRatio(FIELD, CANVAS)).toBeGreaterThan(DOCK_TEXT_MIN_CONTRAST * 2);
  });

  it('clears every role’s own floor against that one colour', () => {
    const measured: string[] = [];
    for (const role of DOCK_ROLES) {
      const ratio = contrastRatio(token(role.token), FIELD);
      measured.push(`--${role.name} (${role.token}) ${ratio.toFixed(2)}:1 — ${role.what}`);
      expect(ratio, `--${role.name} carries ${role.what}`).toBeGreaterThanOrEqual(dockRoleFloor(role.kind));
    }
    // Printed, because "it passes" is worth less than the numbers when the
    // next person is choosing a colour to add to this list.
    console.log(`\n  VB-50 palette on ${DOCK_SURFACE_TOKEN}\n${measured.map((l) => `    ${l}`).join('\n')}\n`);
  });

  it('keeps the five orbs above 1.4.11 on it, since a row now wears them there too', () => {
    // V1.8 VB-45 put the globe's orbs in the list's rows. While the list sat on
    // a near-white pane those fills needed a hairline to clear 3:1 at all
    // (FileTree.css); on the field they are the colours they were chosen for.
    for (const orb of DOCK_ORB_TOKENS) {
      expect(contrastRatio(token(orb), FIELD), `${orb} on the field`).toBeGreaterThanOrEqual(
        DOCK_BOUNDARY_MIN_CONTRAST,
      );
    }
  });

  it('leaves the light palette unusable here, so a half-done revert fails loudly', () => {
    // The inks the List's pane carried until VB-50. Stated as failures on
    // purpose: if a rule anywhere goes back to `--ink` or `--primary` inside the
    // drawer, this is the sentence explaining why the screen went unreadable.
    expect(contrastRatio(token('ink'), FIELD)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('ink-2'), FIELD)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('ink-3'), FIELD)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('green'), FIELD)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('amber'), FIELD)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    // And the ring, which is the reason `--dock-accent` is not `--primary`:
    // 2.90:1 here, under the floor for a non-text indicator.
    expect(contrastRatio(token('primary'), FIELD)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('finds --dock-edge no longer needed, and keeps it anyway — measured, not assumed', () => {
    // A finding worth writing down rather than quietly acting on. `--dock-edge`
    // was cut at V1.6 because `--border-i` measured 2.92:1 on the LIGHT pane the
    // drawer's content used to sit on, under WCAG 1.4.11's floor for a boundary
    // that carries meaning. VB-50 deletes that pane — and on the field the two
    // are 6.30:1 and 5.26:1, so both would do.
    expect(contrastRatio(token('border-i'), FIELD)).toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
    expect(contrastRatio(token('dock-edge'), FIELD)).toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
    // It stays because the drawer already dresses from `--dock-edge` in four
    // places and one name for one job is worth more than deleting a token that
    // is doing no harm. The reason it exists has changed, though, and this is
    // where that is recorded: it is the drawer's edge, not a rescue from a
    // ground that no longer exists.
    expect(contrastRatio(token('border-i'), token('surface'))).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('exempts exactly one hairline, and says why', () => {
    // docs/GUARDRAILS.md floors an interactive border at 3:1 and names
    // `--divider` as the exception, because a divider carries no meaning. This
    // is that variable's opposite number on the field: it is under the floor,
    // deliberately, and it is the ONLY thing in the drawer that is.
    expect(contrastRatio(token(DOCK_LINE_TOKEN), FIELD)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
    // …and it is still a visible line rather than the field repainted on
    // itself, which is the way this exemption could be abused.
    expect(contrastRatio(token(DOCK_LINE_TOKEN), FIELD)).toBeGreaterThan(1.5);
  });

  it('reads the accent against the ink it sits beside, not only against the field', () => {
    // Nothing in the drawer is distinguished by colour alone, but the chosen
    // view, the current rung and the live section are all accent against quiet
    // ink on one ground — so the two have to be tellable apart as well as
    // legible. Both clear the text floor on the field, and they are far enough
    // apart in luminance to read as two levels.
    const accent = contrastRatio(token('globe.focus'), FIELD);
    const quiet = contrastRatio(token('globe.detail-key'), FIELD);
    expect(accent).toBeGreaterThan(quiet);
  });
});

/**
 * V1.7 VB-41's half of the dock, untouched by VB-50.
 *
 * The button cluster stands on the panel's own canvas ABOVE the drawer. VB-50
 * is a decision about the lower panel — the drawer, top edge to bottom edge —
 * and the mockup's nav row inside that panel is VB-53's business, not this
 * task's. So these three assertions are exactly as V1.7 left them, and the fact
 * that they still pass is the statement that VB-50 stopped where it said it
 * would.
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

  it('focuses with the panel’s own ring, which the dark surface could not use', () => {
    // On the canvas --primary is the ring every other control in the product
    // uses, and it clears 1.4.11 outright. Stated beside the reason the drawer
    // needed a different one: on the field the same ring is 2.90:1, which is
    // why --globe-focus exists (design/tokens.json).
    expect(contrastRatio(token('primary'), CANVAS)).toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
    expect(contrastRatio(token('primary'), FIELD)).toBeLessThan(DOCK_BOUNDARY_MIN_CONTRAST);
  });

  it('leaves nothing standing on the deleted ramp', () => {
    // The old bar gave every control an opaque chip cut from --globe-panel so
    // the gradient could pass behind it. Nothing in the cluster has a ground of
    // its own now, and the ground it does have is the canvas — so the dark
    // set's inks would be unreadable there.
    expect(contrastRatio(token('globe.label'), CANVAS)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
    expect(contrastRatio(token('globe.detail-key'), CANVAS)).toBeLessThan(DOCK_TEXT_MIN_CONTRAST);
  });

  it('meets the drawer at a plain edge, because the two colours are nowhere near each other', () => {
    // VB-41 removed the ramp between the canvas and the drawer's field, and
    // VB-50 leaves that seam exactly where it was — it is now the lower panel's
    // top edge, and it is the one seam in the panel that is meant to show.
    expect(contrastRatio(FIELD, CANVAS)).toBeGreaterThan(DOCK_TEXT_MIN_CONTRAST * 2);
  });
});
