/**
 * Enumerate every STATIC narration line the interview can speak (empty
 * answers — interpolated lines differ at runtime, miss their hash, and
 * fall back to the engine by design). Run by scripts/narration.mjs via
 * Node 24's native type-stripping; also imported by the drift test.
 */
import { contextModules, contextOutline } from '../src/core/flow/flow';
import { jumpTargets } from '../src/core/flow/jumpTo';
import { positionForQuestionId } from '../src/core/flow/outline';
import { narrationFor } from '../src/core/voice/narration';
import { NARRATION_COPY } from '../src/panel/voice/copy';
import { clipKey } from '../src/core/voice/clipKey';
import { composedNarrations } from '../src/panel/voice/narrationLines';
import type { Answers } from '../src/schema/storage.types';

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

export function staticNarrations(): { key: string; text: string }[] {
  const out = new Map<string, string>();
  for (const target of jumpTargets(contextModules, contextOutline, EMPTY)) {
    const pos = positionForQuestionId(contextModules, target.questionId);
    if (!pos) continue;
    const narration = narrationFor(pos, EMPTY, NARRATION_COPY);
    if (narration?.text) out.set(clipKey(narration.text), narration.text);
  }
  for (const module of contextModules) {
    const narration = narrationFor({ kind: 'module-intro', module }, EMPTY, NARRATION_COPY);
    if (narration?.text) out.set(clipKey(narration.text), narration.text);
  }
  for (const text of composedNarrations()) out.set(clipKey(text), text);
  return [...out.entries()].map(([key, text]) => ({ key, text }));
}
