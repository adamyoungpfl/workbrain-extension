import type { LocalState } from '../../schema/storage.types';
import type { FileSlotId } from './slots';

/**
 * V1.8 VB-47 — which storage key holds which file's answers.
 *
 * Adam's decision of 2026-08-24: **`wb:answers` gets one key per flow, not
 * namespacing inside it.** Every consumer in the product already takes a whole
 * `Answers` — `findPosition`, `sectionHealthMap`, `generateContextFileParts`,
 * `parseContextFile`, `recommend`, `FileDrawer`, `FileView`, `Home` — so giving
 * each file its own `Answers` under its own key means not one of them changes.
 * Namespacing inside `wb:answers` would have touched every key lookup in the
 * product, which is the reason it was deferred twice.
 *
 * THIS TABLE IS THE WHOLE SEAM. It is the one place that knows a file id maps
 * to a storage key, so the day the Skills interview has flow data, reading its
 * answers is `getLocal(ANSWERS_KEY.skills)` and nothing else moves.
 *
 * **`wb:answers` keeps its name, so no install needs migrating.** An install
 * from before V1.8 has exactly the key it always had, holding exactly what it
 * always held; the other two are absent, and an absent key reads as `undefined`
 * — "that file has nothing in it" — everywhere answers are read. Nothing here
 * derives or stores anything: it is a constant table, and the answers it points
 * at are the person's own words, which is the one category this product does
 * persist (docs/ARCHITECTURE.md).
 */
export const ANSWERS_KEY = {
  context: 'wb:answers',
  skills: 'wb:answers:skills',
  actions: 'wb:answers:actions',
} as const satisfies Record<FileSlotId, keyof LocalState>;

/** The key one file's answers live under. */
export type AnswersKey = (typeof ANSWERS_KEY)[FileSlotId];

/** The same table as a function, for a call site holding an id rather than a
 * literal. Typed so `getLocal` still knows it is being handed an `Answers`. */
export function answersKeyFor(file: FileSlotId): AnswersKey {
  return ANSWERS_KEY[file];
}
