import { useEffect, useState } from 'react';
import { Button } from '../components';
import { HealthPill, HealthSummary, healthDetail } from '../components/SectionHealth';
import { getLocal } from '../../core/storage/client';
import { fileCanResume, fileSectionRows, fileStartTarget } from '../../core/files/fileView';
import { positionForQuestionId } from '../../core/flow/outline';
import { sectionHealthMap, summariseSectionHealth } from '../../core/freshness/sectionHealth';
import { mostRecentAnsweredAt } from '../../core/freshness/nextMove';
import { daysSince } from '../../core/freshness/clocks';
import type { Position } from '../../core/flow/runner';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './FileView.css';

/**
 * V1.7 VB-37 — one file, opened.
 *
 * Home is the shelf (VB-36). This is what a slot on it opens into: the file's
 * own sections, how each one is doing, and two ways in — run the interview for
 * the whole file, or click one section and do that part on its own.
 *
 * ── A SURFACE OVER SHIPPING WIRING, NOT NEW ROUTING ───────────────────────
 *
 * Nothing here asks a question and nothing here writes. Both doors hand `Flow`
 * a `Position` and let the one step runner do the asking, exactly as
 * `Multiples` does (V1.7 VB-38) and as Home's recommendations have since V1.5
 * VB-28:
 *
 *   · the whole file  → no position at all, so `findPosition` resumes from
 *     wherever `wb:answers` really leaves off. The single exception is a file
 *     with nothing left to ask, which would resume to `done` and hand straight
 *     back to Home — see `core/files/fileView.ts`'s `fileCanResume`, and note
 *     that it is NOT the same question as "is every section done".
 *   · one section     → `navigationTargetFor` → `positionForQuestionId`, the
 *     same pair the drawer's file tree navigates through
 *     (`FileDrawer.tsx`'s `handleNavigate`).
 *
 * A second place that asked questions would be a second place for the answer
 * shapes to drift.
 *
 * ── IT BORROWS THE DRAWER'S VOCABULARY RATHER THAN INVENTING ONE ──────────
 *
 * The pills, the detail line and the counts across the top are
 * `components/SectionHealth.tsx`'s, unchanged — the same five words, the same
 * ASCII glyphs, the same tones Home's own badges use. The drawer's list and
 * this screen are two views of one file, and a section that is "Partly" in one
 * must not be anything else in the other. The rows are drawn on `FileRow`'s
 * own `.filerow` rule for the same reason SectionHealth.tsx imports it for
 * `.badge`: one row treatment across the panel, not two that drift.
 *
 * ── NOTHING IS DERIVED AND STORED ─────────────────────────────────────────
 *
 * Every row, every pill and the file's own age are recomputed from
 * `wb:answers` on this component's mount (docs/ARCHITECTURE.md). Which surface
 * you are on is in-memory only — App.tsx holds it, and a reopen lands on Home
 * and re-derives everything.
 */

export interface FileViewProps {
  modules: Module[];
  outline: FileOutlineNode[];
  /** The file's own name, and what it is for — passed in rather than read from
   * `strings.ts` here, so the day Skills.md opens this same surface it is one
   * more call site rather than a condition inside it. */
  name: string;
  what: string;
  /** Back to the shelf. */
  onBack: () => void;
  /**
   * Opens the interview. `undefined` means "resume wherever the answers leave
   * off", which is what `Flow` does with no `initialPosition` — see the header.
   */
  onOpen: (position?: Position) => void;
}

export function FileView({ modules, outline, name, what, onBack, onOpen }: FileViewProps) {
  const [answers, setAnswers] = useState<Answers | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers').then((stored) => {
      if (!cancelled) setAnswers(stored ?? { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!answers) return null;

  const now = new Date();
  const rows = fileSectionRows(outline, modules, answers, now);
  const summary = summariseSectionHealth(outline, sectionHealthMap(outline, modules, answers, null, now));
  const canResume = fileCanResume(modules, answers);

  // The same two facts Home's own file row prints, in the same words: what the
  // file is, and how old it is. A file nobody has started says so instead.
  const lastAnswered = mostRecentAnsweredAt(answers);
  const ageDays = lastAnswered ? daysSince(lastAnswered, now) : null;
  const subtitle =
    ageDays === null ? S.notBuiltYet : `${what} · ${ageDays === 0 ? S.updatedToday : S.daysOld(ageDays)}`;

  /**
   * The whole file: resume, unless there is nothing left to resume to, in
   * which case walk it from the top — see `fileCanResume`. A start target that
   * no longer resolves degrades to a plain resume rather than to nothing
   * (core/recommend/targets.ts's own rule).
   */
  function openWholeFile() {
    if (canResume) {
      onOpen();
      return;
    }
    const target = fileStartTarget(outline);
    onOpen((target ? positionForQuestionId(modules, target) : null) ?? undefined);
  }

  function openSection(questionId: string) {
    const position = positionForQuestionId(modules, questionId);
    // No position means the ported content no longer holds that question — the
    // row does nothing rather than the panel breaking.
    if (position) onOpen(position);
  }

  const anyOpen = rows.some((row) => row.target !== null);

  return (
    <div className="fileview">
      <h2 className="fileview-title">{name}</h2>
      <p className="fileview-sub">{subtitle}</p>

      {/* The counts across the top, exactly as the drawer's list prints them. */}
      <HealthSummary summary={summary} />

      {/* The one primary on this screen (docs/design-system.html §04). The
          section rows are a list to choose from, not the thing the screen
          wants. */}
      <Button type="button" variant="primary" onClick={openWholeFile}>
        {canResume ? S.fileGoThrough : S.fileGoThroughAgain}
      </Button>

      <p className="fileview-label">{S.fileSectionsLabel}</p>
      {!anyOpen && <p className="fileview-hint">{S.fileSectionsClosed}</p>}

      <ul className="fileview-list">
        {rows.map((row) => {
          const detail = healthDetail(row.health);
          const inner = (
            <>
              <span className="nm">{row.label}</span>
              {detail && <span className="sb">{detail}</span>}
            </>
          );
          return (
            <li key={row.id} className="fileview-item">
              {row.target ? (
                <button
                  type="button"
                  className="filerow fileview-row"
                  data-section-id={row.id}
                  data-section-state={row.health.state}
                  // The row's own name says where it goes. The pill sits
                  // OUTSIDE it, so its word is read as the row's text rather
                  // than swallowed by the button's accessible name — the same
                  // decision, for the same reason, as FileTree.tsx's row.
                  aria-label={S.fileTreeGoTo(row.label)}
                  onClick={() => openSection(row.target as string)}
                >
                  <span>{inner}</span>
                </button>
              ) : (
                <div className="filerow fileview-row is-static" data-section-id={row.id} data-section-state={row.health.state}>
                  <span>{inner}</span>
                </div>
              )}
              <HealthPill state={row.health.state} />
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="quiet" onClick={onBack}>
        {S.backToFiles}
      </Button>
    </div>
  );
}
