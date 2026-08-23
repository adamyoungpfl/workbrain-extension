export const SCHEMA_VERSION = 1;

export interface Meta { schemaVersion: number; installedAt: string; }

export interface Answers {
  values: Record<string, import('./flow.types').AnswerValue>;
  repeatables: Record<string, Record<string, import('./flow.types').AnswerValue>[]>;
  /** ISO date per question id for top-level answers; for a repeatable field,
   * keyed `${blockId}#${recordIndex}#${fieldKey}` instead, since a plain
   * field key would collide across records. This is what freshness clocks
   * read. See docs/ARCHITECTURE.md, "wb:answers, precisely". */
  answeredAt: Record<string, string>;
  /** R1-07 reflect step. Same key convention as `answeredAt` (plain key at
   * top level, `${blockId}#${recordIndex}#${fieldKey}` inside a repeatable).
   * A text question with `interpret` set is answered-but-not-yet-reflected
   * when its key is in `values`/the record but not in here — that state is
   * what resumes into the reflect screen on a fresh mount instead of being
   * treated as done. Set once the person picks Keep or Tighten; never set
   * by Skip, since there is nothing typed to play back. */
  reflectedAt: Record<string, string>;
}

export interface Skill {
  id: string;
  title: string;
  body: string;
  /** 'self' = they wrote it; otherwise the pack id it came from */
  source: 'self' | string;
  addedAt: string;
}

export interface PackSubscription {
  url: string;
  packId: string;
  revision: number;
  cachedAt: string;
  /** last good copy — kept so a failed fetch degrades to this */
  skills: Skill[];
}

export interface ScoreEntry { at: string; value: number; }

export interface ReportState {
  /** computed once from a chat export; the "before" */
  baseline?: {
    computedAt: string;
    conversations: number;
    spanDays: number;
    setupTaxChars: number;
    correctionsPerConversation: number;
    /** the phrases the audit found, so we can count them going forward */
    repeatedPhrases: { text: string; conversations: number }[];
  };
  scores: ScoreEntry[];
  /** rolling counts from tier-2 observation, if enabled */
  ongoing?: {
    since: string;
    conversations: number;
    setupTaxChars: number;
    correctionsPerConversation: number;
    phrasesSeen: Record<string, number>;
  };
}

/**
 * V1.5 VB-28 — the one thing the recommendations engine persists.
 *
 * Recommendation id -> the ISO date it was hidden. Everything else about a
 * recommendation is recomputed from `wb:answers` on every render; a dismissal
 * cannot be, because the gap that produced the offer is still there. See
 * src/core/recommend/dismissals.ts for the full justification, and
 * docs/ARCHITECTURE.md's storage contract for where the key sits.
 */
export interface Dismissals { dismissed: Record<string, string>; }

export interface Prefs {
  narrator: boolean;
  mic: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  handoff: 'manual' | 'fill' | 'auto';
  packUrls: string[];
}

/** local */
export interface LocalState {
  'wb:meta': Meta;
  'wb:answers': Answers;
  'wb:skills': Skill[];
  'wb:packs': PackSubscription[];
  'wb:report': ReportState;
  /** V1.5 VB-28. Its own key rather than a field on another: it is written
   * on a tap and read on every open, and docs/ARCHITECTURE.md splits local
   * storage "by write frequency so a small change does not rewrite
   * everything". Absent on every install before V1.5, which reads as "nothing
   * hidden" with no migration — see core/recommend/dismissals.ts. */
  'wb:recs': Dismissals;
}
/** sync — preferences only. ~100KB total, 8KB per item. Never put answers here. */
export interface SyncState { 'wb:prefs': Prefs; }

export interface Migration { to: number; up(state: unknown): unknown; }
