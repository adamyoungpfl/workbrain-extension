import { useEffect, useRef, useState } from 'react';
import { Button, Field, FileRow } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { applyAddRecord, multipleGroups, recordNameTaken } from '../../core/flow/multiples';
import type { MultipleGroup } from '../../core/flow/multiples';
import { positionForNewRecord, positionForRecord } from '../../core/flow/runner';
import type { Position } from '../../core/flow/runner';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './Multiples.css';

/**
 * V1.7 VB-38 — the things that come in numbers, as a screen.
 *
 * Roles, people, teams, tools, initiatives. Until now the only way to reach
 * the second of anything was to walk the interview to it, and the only way to
 * add one was to arrive at the end of that block's loop. This lists them and
 * opens one directly.
 *
 * ── IT IS A SURFACE OVER SHIPPING WIRING, NOT A SECOND RUNNER ─────────────
 *
 * Nothing here asks a question. Opening a record hands `Flow` an
 * `initialPosition` — the same deep link R1-12 built and V1.5 VB-28's
 * recommendations already use — so a record is edited by the one step runner,
 * in the interview's own screens, with its drawer, its narrator and its Back
 * history. Adding one writes through `core/flow/multiples.ts`'s
 * `applyAddRecord` and then opens it the same way. A second place that asked
 * questions would be a second place for the answer shapes to drift.
 *
 * ── THE WRITE IS THE DANGEROUS PART, AND IT IS NOT MADE HERE ──────────────
 *
 * `roles` is SEEDED: a record whose name is not also in the `role_names`
 * answer is deleted, with everything answered inside it, the next time that
 * question is re-submitted (docs/V1.4-REFINEMENT.md VB-20). This component
 * therefore never appends a record itself. It calls one core function that
 * knows both block shapes, and it refuses a name that is already taken before
 * calling it — because two records sharing a name is the same loss by another
 * route.
 *
 * ── NOTHING IS DERIVED AND STORED ─────────────────────────────────────────
 *
 * The groups, the counts and each row's name are recomputed from `wb:answers`
 * on every render (docs/ARCHITECTURE.md). The only write this screen makes is
 * the added record itself.
 */

/** A record's row glyph — a card with a line on it, drawn to the same
 * convention as FileRow's own FILE_ICON and Home's PERSON_ICON (stroke-based,
 * `currentColor`, `aria-hidden` because the row around it carries the name).
 * Deliberately not the file glyph: a role is in a file, it is not one. */
const RECORD_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="M7.5 10.5h9" />
    <path d="M7.5 14h5" />
  </svg>
);

export interface MultiplesProps {
  modules: Module[];
  outline: FileOutlineNode[];
  /** Back to Home. */
  onBack: () => void;
  /** Opens this position in the interview — see the header: this screen never
   * asks a question itself. */
  onOpen: (position: Position) => void;
}

export function Multiples({ modules, outline, onBack, onOpen }: MultiplesProps) {
  const [answers, setAnswers] = useState<Answers | null>(null);
  /** Which group's add field is open, if any. One at a time: two open name
   * fields on a 400px screen is two questions asked at once. */
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Whether a write is in flight. A ref, not state: two presses inside one
   * render would both read the same `false` from a state variable, which is
   * exactly the case this guards. */
  const savingRef = useRef(false);

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
  const ans = answers;
  const groups = multipleGroups(modules, outline, ans);

  function openAdd(blockId: string) {
    setAddingTo(blockId);
    setNameDraft('');
    setError(null);
  }

  function openRecord(blockId: string, recordIndex: number) {
    const position = positionForRecord(modules, blockId, recordIndex);
    // No position means the flow no longer holds that block — the row does
    // nothing rather than the panel breaking (core/flow/runner.ts's own note).
    if (position) onOpen(position);
  }

  /**
   * Adds the named record, then opens it at the first thing it has not
   * answered.
   *
   * ── THE WRITE IS AWAITED BEFORE THE SURFACE CHANGES ───────────────────────
   *
   * `Flow` loads `wb:answers` from storage on its own mount, so navigating
   * first would open a record that is not there yet. Same race `Flow`'s own
   * `savePending` closes before it hands off to Home.
   *
   * ── A FAILED WRITE CHANGES NOTHING, WHICH IS WHY IT LOSES NOTHING ─────────
   *
   * The add is all-or-nothing: either it saved and the record is opened, or
   * the screen is exactly as it was, with the typed name still in the field
   * and the failure printed under it. Pressing the button again is the retry.
   *
   * That is deliberately NOT docs/GUARDRAILS.md's "keep the in-memory state"
   * case, and the difference is what is at stake. There, an answer somebody
   * spent a minute on must survive a storage failure. Here the entire content
   * of the action is a name that is still on screen in the box they typed it
   * into — while keeping the unsaved record in memory would put it in the list
   * AND leave the name in the field, so the retry would be refused as a
   * duplicate of a record that does not exist. The quiet failure would be the
   * clever version.
   */
  async function submitAdd(group: MultipleGroup) {
    if (savingRef.current) return; // a second press before the first write lands
    const name = nameDraft.trim();
    if (!name) {
      setError(S.errNeedAName);
      return;
    }
    if (recordNameTaken(modules, ans, group.blockId, name)) {
      setError(S.errNameTaken);
      return;
    }
    const added = applyAddRecord(modules, ans, group.blockId, name);
    if (!added) {
      setError(S.errNeedAName);
      return;
    }

    savingRef.current = true;
    const result = await setLocal('wb:answers', added.answers);
    savingRef.current = false;
    if (!result.ok) {
      setError(S.errSaveFailed);
      return;
    }
    setAnswers(added.answers);
    setAddingTo(null);
    setNameDraft('');
    const position = positionForNewRecord(modules, added.answers, group.blockId, added.recordIndex);
    if (position) onOpen(position);
  }

  return (
    <div className="multiples">
      <h2 className="multiples-title">{S.multiplesTitle}</h2>
      <p className="multiples-sub">{S.multiplesSub}</p>

      {groups.length === 0 && <p className="multiples-empty">{S.multiplesNothing}</p>}

      {groups.map((group) => (
        <section className="multiples-group" key={group.blockId} aria-labelledby={`multiples-${group.blockId}`}>
          <h3 className="multiples-group-title" id={`multiples-${group.blockId}`}>
            {group.title}
          </h3>

          {group.records.length === 0 ? (
            <p className="multiples-empty">{S.multiplesEmptyGroup}</p>
          ) : (
            <div className="multiples-list">
              {group.records.map((record) => (
                <FileRow
                  key={`${group.blockId}-${record.index}`}
                  name={record.name || S.multipleUnnamed}
                  subtitle={S.multipleAnswered(record.answered, record.total)}
                  icon={RECORD_ICON}
                  onClick={() => openRecord(group.blockId, record.index)}
                />
              ))}
            </div>
          )}

          {addingTo === group.blockId ? (
            /* The name, asked in the interview's own words — the block's own
               first question, or the roles loop's own naming question (see
               core/flow/multiples.ts). Its label is visible: the heading above
               names the group, not the question, so a hidden label would leave
               a box with nothing printed asking for anything.

               Nothing takes focus when it appears (docs/GUARDRAILS.md) — the
               person is mid-keyboard and Tab reaches it next. */
            <form
              className="multiples-add"
              onSubmit={(e) => {
                e.preventDefault();
                void submitAdd(group);
              }}
            >
              <Field
                id={`multiples-name-${group.blockId}`}
                label={group.namePrompt}
                value={nameDraft}
                onChange={(value) => {
                  setNameDraft(value);
                  setError(null);
                }}
                placeholder={group.namePlaceholder}
              />
              {error && (
                <div role="alert" className="multiples-error">
                  {error}
                </div>
              )}
              {/* The one primary on this screen, and only while the form is
                  open — docs/design-system.html §04. Nothing else here is the
                  thing the screen wants; the rows are a list to choose from. */}
              <Button type="submit" variant="primary" size="sm">
                {S.multipleAddConfirm}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="multiples-add-open"
              aria-label={S.multipleAddTo(group.title)}
              onClick={() => openAdd(group.blockId)}
            >
              {S.multipleAdd}
            </Button>
          )}
        </section>
      ))}

      <Button type="button" variant="quiet" onClick={onBack}>
        {S.backToFiles}
      </Button>
    </div>
  );
}
