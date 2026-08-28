import { useEffect, useMemo, useState } from 'react';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import { listNodeIds, outlineNodeState } from '../../core/flow/outline';
import { fileCanResume, fileStartTarget } from '../../core/files/fileView';
import { sectionHealthMap } from '../../core/freshness/sectionHealth';
import { nodeDetailsByNode } from '../../core/flow/nodeDetails';
import { nodeSummaries } from '../../core/flow/nodeSummary';
import { getLocal, setLocal } from '../../core/storage/client';
import { ANSWERS_KEY, type AnswersKey } from '../../core/files/answersKey';
import { BrainGlobe } from '../components/BrainGlobe';
import { FileTree } from '../components/FileTree';
import { Button } from '../components/Button';
import { S } from '../strings';
import { SkillsShare } from './SkillsShare';
import './Browse.css';

/**
 * V2.4 VB-102 · VB-103 — the browse canvas: what a file row on Home opens
 * onto. The Brain on top, the List below, and ONE selection between them —
 * press a row and its orb centers in the picture; press an orb and its row
 * lights. Entering questions is the Edit button's single job (decision 7a:
 * a browse click selects, never navigates).
 *
 * This surface RETIRES FileView (decision 6): one display style for the
 * list, everywhere. FileView's affordances live on — Download is here,
 * section rows are the list's own, import stays on Home, and Actions.md
 * keeps its plain reader (there is no interview behind a derived file).
 *
 * Derivation only, nothing stored: answers come from the file's own store,
 * states and health are recomputed per render exactly as the drawer
 * recomputes them (docs/ARCHITECTURE.md's "nothing derived is stored").
 */

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

export interface BrowseProps {
  modules: Module[];
  outline: FileOutlineNode[];
  /** Which answer store this file reads — context by default. */
  answersKey?: AnswersKey;
  /** The file's printed name — the heading, and the download's filename. */
  name: string;
  /** The file's own generator, composed by App so this surface stays
   * file-agnostic. */
  generate: (answers: Answers) => string;
  /** The Edit button's one job: `null` = resume at findPosition; a
   * question id = start over from the file's own first question (the old
   * "go through them again" door, for a finished file — a resume would
   * land on 'done' and bounce straight back). */
  onEdit: (startAt: string | null) => void;
  onBack: () => void;
  /** V2.5 VB-124 — the skills canvas carries the share/backup row; other
   * files do not (App decides). */
  share?: boolean;
  /** BS-07c (§7.2) — where a leaf card's "Open the list" goes: §8's
   * multiples screen. Absent, the card still draws and the action does
   * nothing, which is the degradation a picture owes (GUARDRAILS). */
  onMultiples?: (() => void) | undefined;
}

export function Browse({ modules, outline, answersKey = ANSWERS_KEY.context, name, generate, onEdit, onBack, share = false, onMultiples }: BrowseProps) {
  /** BS-07c — the one fact the card needs that the globe cannot see. Built
   * once per surface, not per hover (core/flow/outline.ts). */
  const listNodes = useMemo(() => listNodeIds(modules, outline), [modules, outline]);
  const [answers, setAnswers] = useState<Answers | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getLocal(answersKey).then((stored) => {
      if (!cancelled) setAnswers((stored as Answers | undefined) ?? EMPTY);
    });
    return () => {
      cancelled = true;
    };
  }, [answersKey]);

  // VB-103 — the one selection. The nonce distinguishes a repeat press of
  // the same row (the globe should still answer); globe-originated selects
  // update the id WITHOUT a new request, so the two halves never loop.
  const [selected, setSelected] = useState<string | null>(null);
  const [selectRequest, setSelectRequest] = useState<{ id: string; nonce: number } | null>(null);

  const ans = answers ?? EMPTY;
  const [now] = useState(() => new Date());
  const states = useMemo(() => {
    const map: Record<string, OutlineNodeState> = {};
    for (const node of outline) map[node.id] = outlineNodeState(node, ans.values, null);
    return map;
  }, [outline, ans]);
  const health = useMemo(() => sectionHealthMap(outline, modules, ans, null, now), [outline, modules, ans, now]);
  /* BS-07c — the two folds the globe wants and this surface never handed it.
     The same functions the drawer calls, on the same inputs. */
  const details = useMemo(() => nodeDetailsByNode(outline, ans, modules), [outline, ans, modules]);
  const summaries = useMemo(() => nodeSummaries(outline, ans, health, modules), [outline, ans, health, modules]);

  if (!answers) return null;

  function handleDownload() {
    const text = generate(ans);
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="browse">
      <div className="browse-head">
        <h2 className="browse-title">{name}</h2>
        <Button type="button" variant="quiet" onClick={onBack}>
          {S.back}
        </Button>
      </div>
      {/* The Brain, on top — the same globe the drawer shows, standing on the
          one canvas. Its drawn house and its tier chrome lead Home/back
          through onHome, the VB-112 door. */}
      <div className="browse-stage">
        <BrainGlobe
          sections={outline}
          states={states}
          health={health}
          size={300}
          /* BS-07c (§7.2) — THIS SURFACE NEVER PASSED THESE, and it shows.
             Browse has drawn the globe since V2.4 without `summaries` or
             `details`, so its detail panel has always been empty: every leaf
             said "Nothing written here yet" on a finished file. Invisible
             while the panel was two lines of free text, and the first thing
             you see now that the card leads with what the node holds. Same
             folds the drawer feeds it, so the two surfaces cannot disagree
             about one node. */
          details={details}
          summaries={summaries}
          onSelect={(node) => setSelected(node?.id ?? null)}
          selectRequest={selectRequest}
          /* BS-07c (§7.2) — the leaf card's one action, part 5. The card
             names the move; this routes it. A list opens §8's Multiples
             screen, everything else opens that node's own question. */
          listNodes={listNodes}
          onLeafAct={(node, wantsList) => {
            if (wantsList) onMultiples?.();
            else onEdit(fileStartTarget([node]));
          }}
        />
      </div>
      <div className="browse-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => onEdit(fileCanResume(modules, ans) ? null : fileStartTarget(outline))}
        >
          {S.browseEdit}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDownload}>
          {S.filePreviewDownload}
        </Button>
      </div>
      {share && (
        <SkillsShare
          answers={ans}
          onAnswers={(next) => {
            setAnswers(next);
            void setLocal(answersKey, next);
          }}
        />
      )}
      {/* The List, below — the same rows the drawer shows, in select mode:
          a press mirrors into the Brain and goes nowhere (VB-103). */}
      <div className="browse-list">
        <FileTree
          outline={outline}
          modules={modules}
          answers={ans}
          currentQuestionId={null}
          currentSectionId={null}
          onNavigate={() => {}}
          onSelectSection={(id) => {
            setSelected(id);
            setSelectRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
          }}
          selectedId={selected}
        />
      </div>
    </div>
  );
}
