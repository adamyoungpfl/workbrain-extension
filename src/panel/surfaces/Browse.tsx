import { useEffect, useMemo, useState } from 'react';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import { outlineNodeState } from '../../core/flow/outline';
import { fileCanResume, fileStartTarget } from '../../core/files/fileView';
import { sectionHealthMap } from '../../core/freshness/sectionHealth';
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
}

export function Browse({ modules, outline, answersKey = ANSWERS_KEY.context, name, generate, onEdit, onBack, share = false }: BrowseProps) {
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
          onSelect={(node) => setSelected(node?.id ?? null)}
          selectRequest={selectRequest}
          onHome={onBack}
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
