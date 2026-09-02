import { describe, expect, it } from 'vitest';
import { contextModules } from './flow';
import { buildFlowLookups, resolvePhrase } from '../files/lookups';
import type { FlowContext } from '../../schema/flow.types';

/**
 * THE CAP, so this never has to be pruned again.
 *
 * Adam, 2026-08-31: *"keep all future iterations of questions capped at a set
 * number of characters so we don't have to prune again."*
 *
 * R-14's census is where the number comes from rather than taste. At 22px in
 * the panel's ~285px measure a line is roughly 32–38 characters, and two
 * thirds of the flow already sits at two or three visual lines. **120
 * characters is three lines with room**, which is the shape the interview
 * already has and the one Concept 2's turn can absorb.
 *
 * The cap is on what the PANEL SHOWS — `panelQ` where a question has one, `q`
 * otherwise. The generated file is uncapped on purpose: a document somebody
 * reads at their own width has no line budget, and shortening the file's
 * wording to fit a screen would be the screen deciding the document.
 */
const CAP = 120;
/* EXEMPT, each with its reason - not a place to park a question that grew.
   goal_want: Adam's own panel copy, verbatim (2026-09-02 baseline brief),
   on the ONE screen that is a bare prompt box rather than an interview step
   ('promptOnly') - it owns the whole panel with no drawer, so the cap this
   test enforces (a heading sharing a screen with the dock) does not
   describe it. Probed at 400px: six lines, seated. */
const EXEMPT = new Set(['goal_want']);
const CTX: FlowContext = { answers: {}, repeatables: {} };

describe('every question fits the panel', () => {
  const lookups = buildFlowLookups(contextModules);

  it(`shows no question longer than ${CAP} characters`, () => {
    const over: string[] = [];
    for (const [id, step] of lookups.stepsById) {
      if (step.kind === 'intro' || EXEMPT.has(id)) continue;
      const shown = resolvePhrase(step.panelQ ?? step.q, CTX);
      if (shown.length > CAP) over.push(`${id} (${shown.length}): ${shown.slice(0, 70)}…`);
    }
    expect(over, `add a panelQ in core/flow/overrides.ts for:\n  ${over.join('\n  ')}`).toEqual([]);
  });

  it('keeps the FILE’s wording long where the panel’s is short', () => {
    // The split is the point. If these ever match, somebody has edited `q` to
    // fit a screen — which is the thing CLAUDE.md's rule exists to stop.
    const gate = lookups.stepsById.get('initiatives_gate')!;
    expect(gate.panelQ).toBeDefined();
    expect(resolvePhrase(gate.q, CTX).length).toBeGreaterThan(CAP);
    expect(resolvePhrase(gate.panelQ!, CTX).length).toBeLessThanOrEqual(CAP);
  });

  it('leaves questions that already fit alone', () => {
    // A panelQ on a short question is a second wording to keep in step for no
    // reason, and the next person to reword one will change only one of them.
    const short = lookups.stepsById.get('preferred_name')!;
    expect(short.panelQ).toBeUndefined();
  });
});
