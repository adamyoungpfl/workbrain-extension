import { useEffect, useMemo, useRef, useState } from 'react';
import { FileTree } from '../components';
import { contextFileDate, generateContextFileParts } from '../../core/files/generate';
import type { ContextFileSection } from '../../core/files/generate';
import {
  currentQuestionIdFor,
  currentSectionId as sectionIdFor,
  outlineNodeState,
  positionForQuestionId,
} from '../../core/flow/outline';
import type { Position } from '../../core/flow/runner';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './FileDrawer.css';

/**
 * V1.1 VB-07 + VB-07b — the file drawer.
 *
 * Two views of the same thing, stacked: the outline tree filling in as the
 * interview goes (components/FileTree.tsx), and the real Context.md text
 * assembling underneath it.
 *
 * **Why a drawer and not the ported layout.** In the sibling app the tree is a
 * 360px right-hand grid column, and its own responsive rule stacks it *below*
 * the question. In a 400px side panel that means it scrolls off screen while
 * you answer — the exact thing this feature exists to prevent. So the layout,
 * and only the layout, is re-authored: docked to the bottom of the panel,
 * always at least partly visible, collapsed to a peek by default.
 *
 * **Not a `Sheet`.** docs/design-system.html scopes Sheet to "a short,
 * self-contained task" and calls it "the only overlay in the system"; it
 * covers the panel. This is persistent and non-blocking. It never traps focus,
 * never takes focus, and never covers the question — the flow surface reserves
 * exactly the drawer's height beneath itself (see Flow.css's `.flowshell`), so
 * the question and its controls stay reachable with the drawer open.
 *
 * **Open/closed is ephemeral.** Session state owned here, never persisted —
 * the same rule `Flow`'s `history` and `declinedBlocks` follow.
 */

export interface FileDrawerProps {
  outline: FileOutlineNode[];
  modules: Module[];
  answers: Answers;
  position: Position;
  open: boolean;
  onToggle: () => void;
  /** Navigating from a written row — resolved to a real `Position` here and
   * handed to `Flow`, which already knows how to view an arbitrary position
   * (its `viewing` state, built at R1-12 for Home's deep-link). */
  onNavigate: (position: Position) => void;
}

const BODY_ID = 'filedrawer-body';

export function FileDrawer({ outline, modules, answers, position, open, onToggle, onNavigate }: FileDrawerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const currentQuestionId = currentQuestionIdFor(position);
  const currentSectionId = sectionIdFor(outline, currentQuestionId);

  // Stamped once per panel session, not inline in the memo below — a fresh
  // `new Date()` on every render would change the dependency every time and
  // the memo would never hit, which is the specific trap VB-07b calls out.
  const [generatedOn] = useState(contextFileDate);
  const parts = useMemo(
    () => generateContextFileParts(answers, generatedOn, modules, outline),
    [answers, generatedOn, modules, outline],
  );

  const reached = outline.filter((node) => outlineNodeState(node, answers.values, currentQuestionId) !== 'untouched').length;

  /**
   * Keeps the section being written inside the peek.
   *
   * Deliberately not `Element.scrollIntoView`: that scrolls every scrollable
   * ancestor, so in a fixed drawer it also drags the page behind it and moves
   * the question the person is reading. Setting the container's own
   * `scrollTop` moves exactly one box.
   */
  useEffect(() => {
    const box = bodyRef.current;
    if (!box || !currentSectionId) return;
    const row = box.querySelector<HTMLElement>(`.filetree-row[data-node-id="${currentSectionId}"]`);
    if (!row) return;
    box.scrollTop = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
  }, [currentSectionId, open]);

  function handleNavigate(questionId: string) {
    const target = positionForQuestionId(modules, questionId);
    // Degrade silently (docs/GUARDRAILS.md): a section whose first question id
    // no longer exists in the flow simply does nothing rather than erroring.
    if (target) onNavigate(target);
  }

  return (
    <aside className={open ? 'filedrawer is-open' : 'filedrawer'} data-open={open}>
      <h2 className="filedrawer-head">
        <button type="button" className="filedrawer-toggle" aria-expanded={open} aria-controls={BODY_ID} onClick={onToggle}>
          <svg
            className={open ? 'filedrawer-chevron is-open' : 'filedrawer-chevron'}
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 3.5 L10.5 8 L6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="filedrawer-title">{S.fileTreeHeading}</span>
          <span className="filedrawer-count">{S.sectionsOf(reached, outline.length)}</span>
        </button>
      </h2>
      <div className="filedrawer-body" id={BODY_ID} ref={bodyRef}>
        <FileTree
          outline={outline}
          modules={modules}
          answers={answers}
          currentQuestionId={currentQuestionId}
          currentSectionId={currentSectionId}
          onNavigate={handleNavigate}
        />
        <FilePreview sections={parts.sections} />
      </div>
    </aside>
  );
}

/**
 * VB-07b — the real file text, assembling.
 *
 * No reveal machinery: `generateContextFileParts` already omits a section with
 * nothing in it (see `renderFileSection`'s early return on an empty body), so
 * sections genuinely appear as they are answered. The same function writes the
 * download, so the preview cannot drift from the artifact.
 *
 * A section that appears while you are watching fades in; one that was already
 * there when the drawer mounted does not, on the same reasoning as the tree's
 * typewriter. Tracked in a ref rather than state because it must not itself
 * cause a render — it is a record of what has already been shown.
 */
function FilePreview({ sections }: { sections: ContextFileSection[] }) {
  const seenRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    const isFirstRun = seenRef.current === null;
    const seen = seenRef.current ?? new Set<string>();
    seenRef.current = seen;
    const fresh = new Set<string>();
    for (const section of sections) {
      if (seen.has(section.id)) continue;
      seen.add(section.id);
      if (!isFirstRun) fresh.add(section.id);
    }
    setNewIds(fresh);
  }, [sections]);

  return (
    <div className="filepreview">
      <p className="filepreview-note">{S.filePreviewNote}</p>
      {sections.map((section) => (
        <pre className={newIds.has(section.id) ? 'filepreview-section is-new' : 'filepreview-section'} key={section.id}>
          {section.text}
        </pre>
      ))}
    </div>
  );
}
