import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { navigationTargetFor, outlineNodeState, repeatableBlocksForNode } from '../../core/flow/outline';
import type { SectionHealth } from '../../core/freshness/sectionHealth';
import { sectionCompletionPercent, sectionHealthMap } from '../../core/freshness/sectionHealth';
import type { SectionLife } from '../../core/freshness/sectionLife';
import { sectionLife } from '../../core/freshness/sectionLife';
import { splitSectionLabel } from '../../core/flow/sectionLabel';
import { repeatableRecordTitle } from '../../core/files/generate';
import { childNodeGradient, sectionNodeGradient } from './BrainGlobe';
import { HIGHLIGHT_RADIUS, LIMB_INNER, SHADE_RADIUS, orbLight } from '../../core/globe/lighting';
import type { OrbLight } from '../../core/globe/lighting';
import { healthFreshness } from './SectionHealth';
import { prefersReducedMotion } from '../cues/verbs';
import { S } from '../strings';
import './FileTree.css';

/**
 * V1.1 VB-07 — the living file tree.
 *
 * A port of `FileTree` + `FileTreeRow` from
 * ../modelcitizen/src/components/WorkBrainContextInterview.tsx (source lines
 * ~1648-1831) and their CSS in ../modelcitizen/src/app/globals.css
 * (~5788-5860). See docs/CONTENT-SOURCES.md's VB-07 rows. The behaviour is
 * ported; only the layout is re-authored, because the source is a 360px
 * right-hand grid column and this is a 400px panel (see FileDrawer.tsx).
 *
 * Everything on screen is derived, every render, from `wb:answers` plus the
 * question currently being asked — see core/flow/outline.ts. Nothing about a
 * section's state is stored, exactly like the position it is computed from
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * Three deliberate departures from the source, all of them fixes:
 *
 * 1. **Unreached rows are legible.** The source renders them below contrast
 *    threshold on purpose, arguing WCAG's disabled-control exemption. This
 *    repo's docs/GUARDRAILS.md writes no such exemption, so `untouched` rows
 *    use `--ink-3` (4.71:1) and the difference is carried by colour *family*
 *    instead: untouched is neutral ink, reached and current are two strengths
 *    of the one green (see FileTree.css).
 * 2. **State is never colour alone.** Every row carries an ASCII marker in
 *    the glyph column — `[ ]` untouched, `[x]` written, `[>]` writing now —
 *    and a visually hidden word saying the same thing for a screen reader.
 *    Deliberately ASCII: `▸`/`▾` render as an all-but-invisible dot in this
 *    panel's font stack (a real finding, see components/DeepDive.tsx), which
 *    would put the whole signal back on colour.
 * 3. **The disclosure chevron is drawn, not typed**, for the same reason.
 *
 * ── V1.6 VB-33 — the same tree, in a different register ───────────────────
 *
 * VB-33 restyles List from the terminal listing it was into a set of
 * collapsible section rows. **No derivation is new and no behaviour is new**:
 * `core/freshness/sectionHealth` (VB-19) already computed the five states, the
 * counts and the staleness, and the accordion below — one section open at a
 * time, following whichever section is being answered — already worked. What
 * changed is the layout, the type and one genuinely new number:
 *
 *   · **The percentage.** `sectionCompletionPercent`, one real ratio of the
 *     two counts already printed beside it. The long note over that function
 *     says why that is not the composite score docs/GUARDRAILS.md bans, and
 *     that note is the one to read before touching this.
 *   · **The chevron moved to the far edge** and the state marker took the row's
 *     left, which is where VB-33's reference puts it and where VB-32 wants a
 *     flying orb to land. `core/drawer/mode.ts`'s `endOf` still measures that
 *     marker's box, so it is still deliberately small — see FileTree.css.
 *   · **The number left the name's weight.** A section's label still prints
 *     whole ("1. About This Context"); `splitSectionLabel` only lets the "1."
 *     be set quietly so the name is the loud thing.
 *
 * **Colour is still never the only signal.** A row carries the marker, the
 * hidden word, the marker's FILL (hollow / tinted / solid, one per tree state)
 * and the percentage. Colour is the removable one — tests/e2e/
 * section-health.spec.ts strips it and re-reads every row, and every revision
 * since VB-33 has extended that pass rather than replacing it.
 *
 * ── V1.8 VB-45 + VB-46 — the row carries the brain's orb ──────────────────
 *
 * VB-45: "The icons left of each section label in List become **the coloured
 * orbs from the Brain visual**, so an orb stays the same object across both
 * views and the morph reads as one thing moving rather than two things
 * swapping." So the marker tile is now a real orb, in the section's OWN colour
 * from the globe — `sectionNodeGradient` is the one place that knows which
 * sphere a section wears, and the flying node of VB-32's morph already wore it
 * (FileDrawer.css). The three objects — sphere, flying node, row marker — are
 * now one object in three places.
 *
 * **THE GREYSCALE GUARANTEE IS NOT TRADED AWAY FOR THAT.** VB-33 kept the
 * ASCII tile precisely because state has to survive colour being removed, and
 * VB-45 says so in the same breath: "the orb must carry state without colour
 * too: shape, fill, or a mark." It carries all three, one per state, and any
 * one of them is enough on its own:
 *
 *   · dim  — hollow. No fill at all, a dashed edge, and no mark inside it.
 *   · lit  — solid fill, with a TICK drawn in it.
 *   · live — solid fill, with a CARET (the old `[>]`, drawn), inside a RING
 *            that the dim and lit orbs do not have.
 *
 * Plus the hidden word beside it, and the count and percentage at the right
 * end. Colour remains the removable signal, and tests/e2e/section-health.spec.ts
 * strips it and re-reads all of it.
 *
 * ── V2.0 VB-55 + VB-56 — two things taken off the row ─────────────────────
 *
 * VB-55 removes the status pill from the right end of every row and VB-56
 * removes the blinking cursor from the section being written. Both were extra
 * tellings of facts the row says elsewhere; the one place that was not true —
 * a section that has aged past its clock — is answered on the ORB, not by
 * putting the pill back. The reasoning for both lives beside the code: see the
 * VB-55 note over `sectionHealth` in `FileTreeRow` and the VB-56 note over
 * `label`.
 *
 * **The orb's box is still the morph's landing target.** `core/drawer/mode.ts`'s
 * `endOf` sizes every flying node from `min(width, height) / 2` of
 * `.filetree-glyph`; VB-19 already had to repair that once. The tile was 26x18
 * and the orb is 18x18, so the size a node lands at is unchanged and only the
 * centre moves — which is measured from the live DOM on every morph, never
 * computed. tests/e2e/drawer-modes.spec.ts pins the landing to a pixel.
 *
 * VB-46 bundles the COUNT, the PERCENTAGE and the STATUS at the row's right
 * end, and greys a row at 0 of X. Which rows are lit is
 * `core/freshness/sectionLife.ts` — ONE pure function, which BrainGlobe reads
 * too, because implementing "which row is live" twice is how the two views
 * drift apart.
 *
 * ── V1.9 VB-54 — and the orb is LIT, by the globe's own light ─────────────
 *
 * VB-54 gives the Brain one fixed light and shades every orb from its own
 * position under it. The row orbs are the same orbs, so they are lit by the
 * same function — `orbLight` in core/globe/lighting.ts, called with this row's
 * own place in the column (`listOrbLight` below).
 *
 * THAT SHARING IS THE POINT AND NOT A TIDINESS. VB-45's whole claim is that an
 * orb is one object across the two views, which is what makes the drawer's
 * morph read as one thing moving. A row's orb flying out of a sphere lit one
 * way and landing lit another would break that at the one moment somebody is
 * actually watching the object move.
 *
 * NOTHING ABOUT STATE CHANGED. The light is on the FILL, and the fill is only
 * one of the signals: a hollow `dim` orb is not lit at all, and every filled
 * one carries the identical three layers whatever its state — so shading says
 * nothing here that the fill, the mark and the ring were not already saying.
 * tests/e2e/lit-orbs.spec.ts re-reads that with every colour stripped, and
 * re-measures the deep hairline VB-45 added for WCAG 1.4.11.
 */

/**
 * The typewriter, ported unchanged in mechanic from the source's
 * `useTypewriterOnChange`: a row's label reprints itself character by
 * character whenever *its own* state changes, at 15ms a character.
 *
 * The load-bearing detail is that it does NOT animate on mount. Adam's own
 * framing in the source — "the file tree also loads in like a terminal... but
 * I want to keep the previously modified... a lighter version" — means a
 * resumed session must not replay every already-written row. Only a row that
 * transitions while you are watching types itself.
 *
 * Reduced motion is read at the moment a transition happens rather than
 * captured at mount, because this component deliberately never remounts (see
 * FileDrawer.tsx) and would otherwise hold a stale preference for the whole
 * interview.
 */
function useTypewriterOnChange(text: string, stateKey: string, speedMs = 15): string {
  const [revealed, setRevealed] = useState(text.length);
  const seenRef = useRef<string | null>(null);

  useEffect(() => {
    const isFirstRun = seenRef.current === null;
    if (seenRef.current === stateKey) return;
    seenRef.current = stateKey;
    if (isFirstRun || !text || prefersReducedMotion()) {
      setRevealed(text.length);
      return;
    }
    setRevealed(0);
    const id = setInterval(() => {
      setRevealed((n) => {
        if (n >= text.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, speedMs);
    return () => clearInterval(id);
  }, [stateKey, text, speedMs]);

  return text.slice(0, revealed);
}

/**
 * V1.8 VB-45 — the mark inside the orb, one per state, DRAWN rather than
 * typed.
 *
 * The tile these replace printed `[x]` / `[>]` / `[ ]` in mono, which was the
 * right answer while the marker was three characters wide. Inside an 18px orb
 * there is no room for three characters, so the same distinction is drawn: a
 * tick where the old `[x]` was, a caret where the old `[>]` was, and nothing
 * at all inside a hollow orb where the old `[ ]` was empty too.
 *
 * Still not a font glyph, for the reason components/DeepDive.tsx first found:
 * `▸` renders as an all-but-invisible dot in this panel's font stack, which
 * would put the whole signal back on colour.
 */
const LIFE_MARK: Record<SectionLife, string | null> = {
  dim: null,
  lit: 'M2.9 6.2 L5.1 8.4 L9.1 3.9',
  live: 'M4.7 3.3 L7.4 6 L4.7 8.7',
};

/** The same three words the tile said, keyed by the same rule the orb is drawn
 * from. `aria-hidden` on the orb, because this is where the distinction
 * reaches assistive tech. */
const LIFE_WORD: Record<SectionLife, string> = {
  dim: S.fileTreeStateUntouched,
  lit: S.fileTreeStateReached,
  live: S.fileTreeStateCurrent,
};

/**
 * V1.9 VB-54 — WHERE A ROW'S ORB STANDS UNDER THE ONE LIGHT.
 *
 * The Brain's orbs have real positions to be lit from; a row's orb has a place
 * in a list, so this is the conversion between the two. It is a MODEL of the
 * layout and not a measurement of it, deliberately: reading every row's box
 * back out of the DOM to light it would put a layout read on every keystroke of
 * the interview, and the rows really are an evenly-spaced column — the model
 * and the measurement would agree to within a pixel.
 *
 *   x  −0.86, near the pane's left edge, which is where the orb column sits.
 *      A child row is indented, so it steps a little further in.
 *   y  where the row is down the list, mapped onto core's −1 (top) to +1
 *      (bottom).
 *   z  0 — the pane is flat. It is the ROW's own position that varies, which
 *      is the whole of what makes a column of orbs read as one lit object.
 *
 * WHY IT MATTERS THAT THIS IS THE SAME FUNCTION THE GLOBE CALLS. V1.8 VB-45's
 * whole argument is that an orb is one object across both views, so the morph
 * reads as one thing moving. Two lighting rules would make the top row's orb
 * fly out of a sphere lit one way and land lit another, at the exact moment
 * somebody is watching it — which is the one moment the difference is
 * unmissable.
 */
const LIST_ORB_X = -0.86;
const LIST_INDENT = 0.05;

function listOrbLight(place: number, depth: number): OrbLight {
  return orbLight({ x: LIST_ORB_X + depth * LIST_INDENT, y: place * 2 - 1, z: 0 });
}

/**
 * How hard the light paints on THIS surface — the List's counterpart to
 * BrainGlobe.tsx's four gain constants, and separate from them for the reason
 * core/globe/lighting.ts gives for reporting `shade` as a physical quantity: an
 * 18px orb on a near-white pane has nothing like the room to darken that a
 * 12px orb on a near-black stage has.
 *
 * `LIST_LIMB` is the biggest of the three and that is not an accident. The row
 * orbs sit in a column almost directly beneath the light — `shade` for the top
 * row is about 0.015 — so almost nothing here is being said by the DIRECTION,
 * and the roundness has to come from the curvature. The two directional terms
 * are the ones that change down the column, and they are what makes it a lit
 * column rather than ten identically-shaded circles.
 */
const LIST_LIMB = 0.42;
const LIST_SPEC = 0.62;
const LIST_TERMINATOR = 0.85;

/**
 * The section's orb, at the row's left edge.
 *
 * `gradient` is the section's own colour in the Brain visual — the whole point
 * of VB-45 — and it is `sectionNodeGradient`'s answer rather than a second
 * cycle, so the row's orb, the sphere it comes from and the node that flies
 * between them cannot pick different colours.
 *
 * `light` is V1.9 VB-54's, and it arrives as custom properties rather than as a
 * class, because there is no finite set of classes for "where this orb stands
 * relative to a point" — which is exactly the difference between this and the
 * per-orb gradients V1.4 VB-23 deleted from the globe, where the highlight sat
 * in each orb's own local box and every orb wore the identical one.
 *
 * The offsets are fractions of the orb's RADIUS (core/globe/lighting.ts) and
 * the box is a circle, so half the box is one radius and a fraction of it is
 * that fraction of 50% — which is what `half` converts. `mix` turns core's
 * physical 0..1 quantities into the percentages `color-mix` wants, so
 * FileTree.css holds no arithmetic at all about a light it cannot see.
 *
 * The class name is unchanged on purpose: `.filetree-glyph` is what
 * `core/drawer/mode.ts`'s morph measures and what four specs find this by.
 */
function SectionOrb({ life, gradient, light }: { life: SectionLife; gradient: number; light: OrbLight }) {
  const mark = LIFE_MARK[life];
  const half = (fraction: number) => `${(fraction * 50).toFixed(2)}%`;
  const mix = (amount: number) => `${Math.min(100, Math.max(0, amount * 100)).toFixed(1)}%`;
  return (
    <span
      className="filetree-glyph"
      data-life={life}
      data-gradient={gradient}
      style={
        {
          '--orb-hx': half(light.hx),
          '--orb-hy': half(light.hy),
          '--orb-sx': half(light.sx),
          '--orb-sy': half(light.sy),
          // Published from core rather than restated in the stylesheet, so the
          // blob is the same size relative to the orb in both views.
          '--orb-spec-r': half(HIGHLIGHT_RADIUS),
          '--orb-shade-r': half(SHADE_RADIUS),
          '--orb-limb-inner': `${(LIMB_INNER * 100).toFixed(0)}%`,
          // How strongly each of the three layers paints on THIS orb. Folded
          // here rather than in `calc()` so the stylesheet holds no arithmetic
          // about a light it cannot see — and so a test can read the numbers
          // core produced straight off the element.
          '--orb-spec-mix': mix(light.highlight * LIST_SPEC),
          '--orb-shade-mix': mix(light.shade * LIST_TERMINATOR),
          '--orb-limb-mix': mix(LIST_LIMB),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {mark && (
        <svg className="filetree-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          <path d={mark} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** Points right when closed, down when open. Drawn rather than typed, same
 * convention and same reason as components/DeepDive.tsx's `Chevron`. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? 'filetree-chevron is-open' : 'filetree-chevron'}
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 3.5 L10.5 8 L6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RowProps {
  node: FileOutlineNode;
  depth: number;
  /** V1.8 VB-45. Which of the globe's five colours this section's orb wears —
   * decided by `sectionNodeGradient` from the node's position in the file, and
   * passed down rather than derived here so a child row can be handed its own
   * place in its parent's cluster instead of a top-level one. */
  gradient: number;
  /** V1.9 VB-54. How far down the list this row sits, 0 at the top and 1 at the
   * bottom — the one thing a row's orb needs in order to know where it stands
   * under the scene light. Passed rather than derived for the same reason
   * `gradient` is: a nested row's place is its parent's business, not its own. */
  place: number;
  /** How much of the list one top-level section occupies, so an expanded
   * section can spread its children inside its own slot instead of over the
   * whole pane. */
  slot: number;
  modules: Module[];
  answers: Answers;
  currentQuestionId: string | null;
  /** V1.3 VB-19 — every node's health, keyed by node id, computed once for
   * the whole tree by `FileTree` (see its `health` memo). Passed down rather
   * than derived per row: a per-row derivation would walk all twelve modules
   * once for every row, on every keystroke. */
  health: Record<string, SectionHealth>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onNavigate: (questionId: string) => void;
}

/**
 * One section. A real component rather than a render helper specifically so
 * it can hold `useTypewriterOnChange` — a row's label never changes, only its
 * state does, and the hook needs per-row memory of the last state it printed.
 *
 * Keyed by `node.id` by its parent, and the whole tree is mounted once for
 * the life of the interview, so that memory survives moving between
 * questions. If this were remounted per position, every row would look like a
 * first mount and nothing would ever type itself.
 */
function FileTreeRow({
  node,
  depth,
  gradient,
  place,
  slot,
  modules,
  answers,
  currentQuestionId,
  health,
  expandedId,
  onToggleExpand,
  onNavigate,
}: RowProps) {
  const state = outlineNodeState(node, answers.values, currentQuestionId);
  // V2.3 VB-96 — the person reads "About Me", not "2. About Me". Ingredients,
  // not requirements: the numeral stays in the outline and the generated file
  // (verbatim-port boundary, round-trip), and disappears everywhere a person
  // reads. The typewriter now types the title alone.
  const displayTitle = splitSectionLabel(node.label).title;
  const typedLabel = useTypewriterOnChange(displayTitle, `${node.id}:${state}`);
  const metaId = useId();

  // Records the generated file gives their own titled block — role names,
  // entity names, initiative names. Shown as sub-items so the tree has the
  // same shape as the file (core/flow/outline.ts's `repeatableBlocksForNode`).
  const records: string[] = [];
  for (const block of repeatableBlocksForNode(modules, node)) {
    for (const record of answers.repeatables[block.id] ?? []) records.push(repeatableRecordTitle(block, record));
  }

  const childNodes = node.children ?? [];
  const hasChildren = childNodes.length > 0;
  const expanded = hasChildren && expandedId === node.id;

  // Only a written or in-progress section is a real link. Jumping ahead to a
  // section nobody has reached would skip past required questions the flow
  // otherwise guarantees get asked — this is review navigation ("go back to
  // something you already said"), never a shortcut through the interview.
  const target = navigationTargetFor(node);
  const clickable = state !== 'untouched' && !!target;

  /**
   * V1.6 VB-33 — the label prints WHOLE, and only its two halves are set
   * differently: the file's own numbering quiet, the section's name loud.
   *
   * Split from the full label rather than from what has been typed so far
   * (core/flow/sectionLabel.ts), because the typewriter above renders a prefix
   * and a half-printed "1." would otherwise be filed as the start of a name.
   * `numeral + title` is byte-identical to `typedLabel`, so every assertion
   * that a resumed session shows a whole label still reads one.
   */
  const title = typedLabel;
  /**
   * ── V2.0 VB-56 — THE BLINKING CURSOR IS GONE ─────────────────────────────
   *
   * V1.1 VB-07 printed a `▋` after the section being written and blinked it on
   * a 2.2s `steps(1)` clock, ported from the sibling app's terminal aesthetic
   * along with the typewriter it sat beside. VB-56 removes it: "the pulse on
   * the left icon is enough... the panel has moved past that register."
   *
   * NOTHING WAS BEING SAID ONLY BY IT. The live section is the one wearing a
   * ring on its orb (VB-46), the one whose row says "Writing now" out loud
   * (`LIFE_WORD` below), and the one the flow is standing in. The cursor was a
   * fourth telling on a screen where V1.9 has been removing perpetual motion
   * one cue at a time, and it is the only one of the four that moved.
   */
  const label = (
    <span className="filetree-label">

      {title}
    </span>
  );

  /**
   * V1.3 VB-19 — the two things a row now says about itself.
   *
   * WHERE EACH ONE SITS IS AN ACCESSIBILITY DECISION, NOT A LAYOUT ONE. The
   * navigate control carries an `aria-label`, and an accessible name replaces
   * an element's contents, so anything put inside it is on screen but absent
   * from the accessibility tree.
   *
   * - The STATE WORD sits OUTSIDE it, so it is read as the row's own text
   *   rather than demoted to a description. V1.3 VB-19 to V1.9 that word was
   *   the pill's; V2.0 VB-55 takes the pill away and the rule is unchanged for
   *   what is left of it — see the VB-55 note below.
   * - The DETAIL sits INSIDE it, bound back as `aria-describedby`. Inside is
   *   what lets the control be one 44px box holding both lines instead of a
   *   44px box with a line hanging under it — which would push every answered
   *   row to nearly sixty pixels and halve what the drawer's default peek can
   *   show. `aria-describedby` is what stops that costing a screen reader the
   *   line: a description is computed from the referenced element wherever it
   *   lives, including inside the thing it describes.
   *
   * V1.6 VB-33 ADDS THE PERCENTAGE AS A THIRD THING ON THAT SAME LINE, hard
   * right. Two reasons it is its own element rather than another clause in
   * `healthDetail`'s string:
   *
   *   1. Room. "13 of 13 · 100% · answered 11 months ago" is forty characters
   *      in a column about two hundred pixels wide, and a meta line that wraps
   *      takes the row past the 44px band every other row keeps. Setting the
   *      figure apart at the right of the line costs nothing and reads as the
   *      headline number it is. (What actually bought the room is the layout
   *      change in FileTree.css; this is what made the room usable.)
   *   2. It can carry its own word. "54%" alone, met without the count beside
   *      it, is a percentage of nothing named — so the element says "complete"
   *      out loud for a screen reader while the eye reads it off the count.
   *
   * The describedby id moved from the detail line to the wrapper around both,
   * so the description a screen reader gets is still the WHOLE meta line.
   *
   * ── V1.8 VB-46: THE COUNT JOINS THE PERCENTAGE AT THE RIGHT END ──────────
   *
   * "Per row, bundle **X of Y**, **%**, and the status pairing at the **right
   * end** of the row." So the count leaves the freshness clause it used to lead
   * (`healthDetail`) and stands with the figure it is the numerator of, hard
   * right. What is left of the meta line at its LEFT is the one clause the
   * figures cannot carry — how long ago, or what was passed on.
   *
   * `healthDetail` itself is UNTOUCHED, because `FileView` (V1.7) still prints
   * it whole and a row there has no right-hand column to bundle into.
   * `healthFreshness` is that same function's second half, exported so the two
   * surfaces cannot word the same clause differently.
   *
   * AND THE 0-STATE NOW PRINTS. VB-19 suppressed the count on a section nobody
   * had touched, on the grounds that "0 of 6" was a second line about nothing.
   * VB-46 overrules that outright — "A row at **0 of X** is **greyed out**,
   * showing **0%**" — and the row can afford it now: the count sits in a column
   * that already exists rather than opening a line of its own.
   *
   * ── V2.0 VB-55: THE PILL GOES, THE COUNT AND THE FIGURE STAY ─────────────
   *
   * "Remove the `[x] Done` / `[>] Here` marker from the right end of each row…
   * keep the count/percentage that share that column." The right end is now two
   * figures rather than three things, and the row's status is the ORB at its
   * left edge, which VB-45 already drew in three greyscale-proof treatments
   * (hollow+dashed / filled+tick / filled+caret+ring).
   *
   * **THE PILL WAS NOT PURELY REDUNDANT, AND THE DIFFERENCE IS `due`.** The orb
   * reads `core/freshness/sectionLife.ts` — three states — and the pill read
   * `sectionHealth.state` — five. Four of the five map onto something the row
   * still says without any colour at all:
   *
   *   here     → the orb's caret and ring, and "Writing now" out loud.
   *   not-yet  → the orb hollow and empty, and "0 of 13" printed.
   *   partly   → the clause "2 skipped", and a count short of its total.
   *   done     → the orb's tick, "13 of 13", "100%".
   *
   * `due` is the fifth, and it is `done` plus one fact: this section is past its
   * own clock (core/freshness/halfLives.ts). Both are finished, both are lit,
   * both read 100% — so with the pill gone the ONLY thing separating them was
   * `--row-accent`, amber against green. That is precisely the "distinguished by
   * colour alone" docs/GUARDRAILS.md rules out, and deleting the pill without
   * noticing would have shipped it.
   *
   * SO THE MARKER GOT STRONGER RATHER THAN THE PILL COMING BACK, which is what
   * VB-55 itself asks for. Two signals replace the one that went:
   *
   *   1. VISIBLE — a dashed ring around the due section's orb (FileTree.css).
   *      A SHAPE, on the object that already carries state, told apart from the
   *      live row's solid three-ring and from the hollow orb's dashed EDGE by
   *      being outside a filled orb. It survives greyscale, which is the whole
   *      point, and it is still one object rather than a chip beside one.
   *   2. SPOKEN — the pill's own word, `sectionStateDue`, kept as a hidden word
   *      in the exact place in the row the pill occupied, so the reading order
   *      a screen reader gets is byte-identical to what it was. A cue that is
   *      drawn for the eye and dropped for the ear is not a smaller pill, it is
   *      a regression, and this is the one state where the picture and the
   *      three-way orb vocabulary genuinely disagree.
   *
   * The other four states add no hidden word, deliberately: their sentence is
   * already in the row twice over, and a second copy of "Done" beside "13 of 13
   * · 100% complete" is noise in the one place noise is expensive.
   *
   * `HealthPill` itself is untouched and still renders on `FileView` (V1.7),
   * whose rows have no right-hand column and no orb — see components/
   * SectionHealth.tsx. VB-55 is about the drawer's List, not about the
   * vocabulary.
   */
  const sectionHealth = health[node.id];
  const freshness = sectionHealth ? healthFreshness(sectionHealth) : null;
  // Null only where the section genuinely asks nothing: 0% of no questions is
  // not a fact about the file (see `sectionCompletionPercent`).
  const percent = sectionHealth ? sectionCompletionPercent(sectionHealth) : null;
  const counts =
    sectionHealth && percent !== null ? (
      <span className="filetree-counts">
        <span className="filetree-count">{S.sectionAnsweredOf(sectionHealth.answered, sectionHealth.total)}</span>
        <span className="filetree-percent">
          {S.sectionPercent(percent)}
          <span className="filetree-sr"> {S.sectionPercentComplete}</span>
        </span>
      </span>
    ) : null;
  const metaLine =
    freshness || counts ? (
      <span className="filetree-meta" id={metaId}>
        {freshness && <span className="filetree-detail">{freshness}</span>}
        {counts}
      </span>
    ) : null;

  /**
   * V1.6 VB-33 — the row, left to right.
   *
   * THE MARKER LEADS AND THE CHEVRON TRAILS, which is the reverse of what
   * V1.1 shipped. Both moves come from VB-33's reference and both are load
   * bearing beyond taste:
   *
   *   · The marker at the row's left edge is where a section's orb lands when
   *     the Brain visual becomes the list — `core/drawer/mode.ts` measures
   *     `.filetree-glyph`'s own box, so the mark is what the orb turns into
   *     rather than something it fades out beside (VB-32).
   *   · The chevron at the far edge stops a 44px control standing between the
   *     panel edge and every section name, which is what made the old list
   *     read as a tree rather than as a list of sections.
   *
   * The tab order follows the same order: go to the section, then open it.
   *
   * V1.8 VB-46 hangs `data-life` off the row as well as off the orb, because
   * the greying is the whole row's — the count, the figure and the name all
   * step back together on a section at 0 of X — and one attribute is what lets
   * the stylesheet say that once (FileTree.css).
   */
  const life = sectionLife({
    health: sectionHealth,
    current: state === 'current',
    reached: state === 'reached',
  });
  return (
    <li className={depth === 0 ? 'filetree-item' : 'filetree-item is-nested'}>
      <div
        className={`filetree-row is-${state}${depth > 0 ? ' is-child' : ''}`}
        data-node-id={node.id}
        data-node-state={state}
        data-life={life}
        data-health={sectionHealth?.state}
        data-depth={depth}
      >
        <SectionOrb life={life} gradient={gradient} light={listOrbLight(place, depth)} />
        {/* Said out loud for a screen reader, outside the button so it never
            competes with the button's own name. The orb beside it says the
            same thing visually. */}
        <span className="filetree-srstate">{LIFE_WORD[life]}</span>
        <span className="filetree-main">
          {clickable ? (
            <button
              type="button"
              className="filetree-nav"
              aria-label={S.fileTreeGoTo(displayTitle)}
              aria-describedby={metaLine ? metaId : undefined}
              onClick={() => onNavigate(target)}
            >
              {label}
              {metaLine}
            </button>
          ) : (
            <span className="filetree-static">
              {label}
              {metaLine}
            </span>
          )}
          {/* V2.0 VB-55 — THE STATUS PILL IS GONE FROM THE ROW, AND THIS IS
              WHAT IT LEFT BEHIND: one hidden word, on the one state the
              picture cannot draw. See the long note above `sectionHealth`. */}
          {/* `.filetree-sr`, the panel's hidden-word rule, plus a hook of its
              own: the percentage's "complete" wears the same class a few lines
              up, and a test asking for "the row's hidden word" must not have
              to guess which of the two it got (FileTree.css says so where the
              class is defined). */}
          {sectionHealth?.state === 'due' && (
            <span className="filetree-sr" data-health-word="due">
              {S.sectionStateDue}
            </span>
          )}
        </span>
        {hasChildren ? (
          <button
            type="button"
            className="filetree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? S.fileTreeCollapse(displayTitle) : S.fileTreeExpand(displayTitle)}
            onClick={() => onToggleExpand(node.id)}
          >
            <Chevron open={expanded} />
          </button>
        ) : (
          <span className="filetree-toggle-spacer" aria-hidden="true" />
        )}
      </div>
      {/* Records are not behind the disclosure — they follow their own row
          wherever it renders, exactly as the source does. The accordion holds
          one id at a time, so gating them on it would mean a record under a
          CHILD section could never be shown at all. */}
      {records.length > 0 && (
        <ul className="filetree-list is-records">
          {records.map((title, i) => (
            // Not independently clickable. V1.7 VB-38 built the per-record
            // jump this once said did not exist (core/flow/runner.ts's
            // `positionForRecord`), but it put it on a screen whose whole job
            // is choosing between records — and the tree stays what it has
            // always been, a picture of the file. Two places offering the same
            // edit would be two places to keep in step.
            <li className="filetree-item is-nested" key={`${node.id}-record-${i}`}>
              <div className="filetree-row is-record" data-depth={depth + 1}>
                {/* A record is a thing the file HOLDS, not a section of it, so
                    it gets the orb's shape at a smaller size and none of its
                    colour — it has no sphere in the globe to be the same
                    object as (FileTree.css). */}
                <span className="filetree-glyph" data-life="lit" aria-hidden="true" />
                <span className="filetree-label">{title}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {expanded && (
        <ul className="filetree-list is-children">
          {childNodes.map((child, childIndex) => (
            <FileTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              // Its place in its parent's own cluster, which is the colour the
              // globe gives it when the camera flies into this section
              // (BrainGlobe.tsx's `childLayout`).
              gradient={childNodeGradient(childIndex)}
              /* V1.9 VB-54. A child sits INSIDE its parent's slot in the list,
                 so its place under the light is its parent's, nudged down by
                 how far through the expanded group it is. That keeps an open
                 section's orbs on the same smooth gradient as the rows above
                 and below it rather than restarting the column. */
              place={place + ((childIndex + 1) / (childNodes.length + 1) - 0.5) * slot}
              slot={slot}
              modules={modules}
              answers={answers}
              currentQuestionId={currentQuestionId}
              health={health}
              expandedId={expandedId}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface FileTreeProps {
  outline: FileOutlineNode[];
  modules: Module[];
  answers: Answers;
  /** The question on screen, or null when the panel is between questions. */
  currentQuestionId: string | null;
  /** The top-level section holding `currentQuestionId`, or null — passed in
   * rather than recomputed so the drawer and the tree cannot disagree about
   * which section is active. */
  currentSectionId: string | null;
  onNavigate: (questionId: string) => void;
}

/**
 * The whole outline, complete from question one, dim until reached.
 *
 * **Accordion.** One top-level section shows its children at a time, defaulting
 * to whichever section is being answered, and re-syncing whenever that
 * changes. Expanding a different section overrides that until the active
 * section itself moves on — held as an override *paired with* the section it
 * was made against, rather than as a state reset from an effect, so there is
 * never a render where the two disagree (the same reasoning behind Flow.tsx's
 * remount-per-position rule).
 */
export function FileTree({ outline, modules, answers, currentQuestionId, currentSectionId, onNavigate }: FileTreeProps) {
  const [override, setOverride] = useState<{ against: string | null; id: string | null } | null>(null);

  /**
   * V1.3 VB-19 — what "now" means for the whole drawer, stamped once when
   * the tree mounts.
   *
   * Not `new Date()` inline: a fresh Date every render changes the memo's
   * dependency every render, so the memo would never hit and all twelve
   * modules would be re-walked on every keystroke of the interview. That is
   * the same trap FileDrawer.tsx's `generatedOn` already documents. Freshness
   * is measured in days and a panel session is measured in minutes, so a
   * clock that does not tick during one is not a lie.
   */
  const [now] = useState(() => new Date());
  const health = useMemo(
    () => sectionHealthMap(outline, modules, answers, currentQuestionId, now),
    [outline, modules, answers, currentQuestionId, now],
  );
  // Adjusting state during render, the documented React escape hatch for
  // "derive from props" — cheaper and less error-prone than an effect, which
  // would render one frame with the stale expansion first. The override is
  // dropped outright (not merely ignored) the moment the active section moves,
  // so returning to a section later re-opens it rather than resurrecting a
  // collapse the person made two questions ago.
  if (override && override.against !== currentSectionId) setOverride(null);
  const expandedId = override ? override.id : currentSectionId;

  function toggleExpand(id: string) {
    setOverride({ against: currentSectionId, id: expandedId === id ? null : id });
  }

  return (
    <div className="filetree">
      {/* V1.8 VB-47 TOOK TWO THINGS OFF THE TOP OF THIS LIST.

          The counts (`HealthSummary`) and the root line ("Ada — Context.md")
          both stood here; the file-type toggle stands in their place now, one
          level up in the drawer itself, because choosing a file is the
          drawer's job and not the tree's (surfaces/FileDrawer.tsx).

          Neither is missed. VB-46 moved the counts into the rows — every row
          carries its own count, percentage and status at its right end — and
          the toggle's pressed segment names the file, which is all the root
          line ever said. `HealthSummary` itself is untouched and still
          renders on `FileView`, where a row has no right-hand column to bundle
          a count into (components/SectionHealth.tsx). */}
      <ul className="filetree-list">
        {outline.map((node, index) => (
          <FileTreeRow
            key={node.id}
            node={node}
            depth={0}
            // V1.8 VB-45 — the colour this section's orb wears in the Brain
            // visual, from the one place that knows (BrainGlobe.tsx).
            gradient={sectionNodeGradient(index)}
            /* V1.9 VB-54 — how far down the list this row sits, which is all
               core needs to light its orb from the one scene light. The middle
               of the row's own slot, so the first and last orbs are inside the
               pane rather than on its very edges. */
            place={(index + 0.5) / outline.length}
            slot={1 / outline.length}
            modules={modules}
            answers={answers}
            currentQuestionId={currentQuestionId}
            health={health}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}
