import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import { navigationTargetFor, outlineNodeState, repeatableBlocksForNode } from '../../core/flow/outline';
import type { SectionHealth } from '../../core/freshness/sectionHealth';
import { sectionCompletionPercent, sectionHealthMap, summariseSectionHealth } from '../../core/freshness/sectionHealth';
import { splitRevealedSectionLabel } from '../../core/flow/sectionLabel';
import { repeatableRecordTitle } from '../../core/files/generate';
import { HealthPill, HealthSummary, healthDetail } from './SectionHealth';
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
 * **Colour is still never the only signal.** A row now carries five: the ASCII
 * marker, the hidden word, the marker's FILL (hollow / tinted / solid, one per
 * tree state), the pill's own word and glyph, and the percentage. Colour is the
 * sixth and the only removable one — tests/e2e/section-health.spec.ts strips it
 * and re-reads every row, and VB-33 extended that pass to the new treatment
 * rather than replacing it.
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

/** The state marker in the glyph column. ASCII on purpose — see the module
 * comment. `aria-hidden`, because the same distinction reaches assistive tech
 * as a real word (`STATE_WORD`) instead. */
const STATE_GLYPH: Record<OutlineNodeState, string> = {
  untouched: '[ ]',
  reached: '[x]',
  current: '[>]',
};

const STATE_WORD: Record<OutlineNodeState, string> = {
  untouched: S.fileTreeStateUntouched,
  reached: S.fileTreeStateReached,
  current: S.fileTreeStateCurrent,
};

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
  modules,
  answers,
  currentQuestionId,
  health,
  expandedId,
  onToggleExpand,
  onNavigate,
}: RowProps) {
  const state = outlineNodeState(node, answers.values, currentQuestionId);
  const typedLabel = useTypewriterOnChange(node.label, `${node.id}:${state}`);
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
  const { numeral, title } = splitRevealedSectionLabel(node.label, typedLabel);
  const label = (
    <span className="filetree-label">
      {numeral && <span className="filetree-num">{numeral}</span>}
      {title}
      {state === 'current' && (
        <span className="filetree-cursor" aria-hidden="true">
          ▋
        </span>
      )}
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
   * - The PILL sits OUTSIDE it, so its word is read as the row's own text.
   *   V1.6 VB-33 moved it visually — it now sits ON the name's line, over the
   *   control's top right corner, so the meta line under it can have the whole
   *   row's width (FileTree.css's `.filetree-main`) — but it is still a
   *   SIBLING and not a child, precisely so this stays true. A state word
   *   demoted to a description is the one signal in the drawer that cannot
   *   afford to be optional.
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
   */
  const sectionHealth = health[node.id];
  const detail = sectionHealth ? healthDetail(sectionHealth) : null;
  // Null wherever the detail is: a section nobody has touched says nothing
  // beyond its pill, and "0%" would be the second thing on a row that has
  // nothing to report (see `healthDetail`).
  const percent = detail && sectionHealth ? sectionCompletionPercent(sectionHealth) : null;
  const metaLine = detail ? (
    <span className="filetree-meta" id={metaId}>
      <span className="filetree-detail">{detail}</span>
      {percent !== null && (
        <span className="filetree-percent">
          {S.sectionPercent(percent)}
          <span className="filetree-sr"> {S.sectionPercentComplete}</span>
        </span>
      )}
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
   */
  return (
    <li className={depth === 0 ? 'filetree-item' : 'filetree-item is-nested'}>
      <div
        // `has-meta` is CSS's only way to know a row has a second line: it
        // moves the pill onto the name's line so the meta line can have the
        // pill's width back (FileTree.css's `.filetree-main`).
        className={`filetree-row is-${state}${depth > 0 ? ' is-child' : ''}${metaLine ? ' has-meta' : ''}`}
        data-node-id={node.id}
        data-node-state={state}
        data-health={sectionHealth?.state}
        data-depth={depth}
      >
        <span className="filetree-glyph" aria-hidden="true">
          {STATE_GLYPH[state]}
        </span>
        {/* Said out loud for a screen reader, outside the button so it never
            competes with the button's own name. The glyph beside it says the
            same thing visually. */}
        <span className="filetree-srstate">{STATE_WORD[state]}</span>
        <span className="filetree-main">
          {clickable ? (
            <button
              type="button"
              className="filetree-nav"
              aria-label={S.fileTreeGoTo(node.label)}
              aria-describedby={detail ? metaId : undefined}
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
          {sectionHealth && <HealthPill state={sectionHealth.state} />}
        </span>
        {hasChildren ? (
          <button
            type="button"
            className="filetree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? S.fileTreeCollapse(node.label) : S.fileTreeExpand(node.label)}
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
            // Not independently clickable: there is no per-record jump target
            // in the flow — the only sensible destination is the block's own
            // start, which is already this row's parent. Making them look
            // clickable would promise an edit path that does not exist.
            <li className="filetree-item is-nested" key={`${node.id}-record-${i}`}>
              <div className="filetree-row is-record" data-depth={depth + 1}>
                <span className="filetree-glyph" aria-hidden="true">
                  {STATE_GLYPH.reached}
                </span>
                <span className="filetree-label">{title}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {expanded && (
        <ul className="filetree-list is-children">
          {childNodes.map((child) => (
            <FileTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
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
  const summary = useMemo(() => summariseSectionHealth(outline, health), [outline, health]);
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

  const name = typeof answers.values.preferred_name === 'string' ? answers.values.preferred_name.trim() : '';

  return (
    <div className="filetree">
      {/* V1.3 VB-19 — the counts across the top, doing the "what needs
          attention" job that keeping the rows in file order gives up. */}
      <HealthSummary summary={summary} />
      <p className="filetree-root">{S.fileTreeRoot(name)}</p>
      <ul className="filetree-list">
        {outline.map((node) => (
          <FileTreeRow
            key={node.id}
            node={node}
            depth={0}
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
