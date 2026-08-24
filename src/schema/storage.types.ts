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
  /**
   * V1.8 VB-42. `'all'` once the person has pressed the follow-ups' visible
   * stop; `'rotate'` until then. WCAG 2.2.2 requires the stop to exist, and
   * remembering it is what keeps it from being 26 separate presses — one per
   * question carrying follow-ups. A stated preference, like `narrator`, which
   * is the one category of thing this product does store.
   */
  followUps: 'rotate' | 'all';
  /**
   * V1.8 VB-49. False once the OS-dictation hint has been dismissed, or once
   * the person has typed into the question that carries it — either way it
   * never appears again. Not a microphone and not a capability: there is no
   * mic in this product (see core/flow/dictation.ts).
   */
  dictationHint: boolean;
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

/**
 * session — V1.7 VB-34. `chrome.storage.session` lives in memory and is thrown
 * away when the browser closes. It is not persistence and must never be used
 * as any: nothing here survives a restart, nothing here is backed up by
 * Download, and nothing here is worth a migration.
 *
 * It exists because the panel document does not. Chrome destroys the side
 * panel's document when the panel is closed, so a plain module variable means
 * "once per panel open", and Adam's decision on VB-34 is once per *session*:
 * "a splash on every open is a toll booth on someone's own work". A session
 * outliving a panel close is exactly what this area is, and the only area
 * that is.
 *
 * This does not weaken docs/ARCHITECTURE.md's "nothing derived is stored".
 * That rule is about `chrome.storage.local` and `.sync` — the two areas that
 * are still there tomorrow. `wb:splash` records nothing about the person, is
 * unreadable five minutes after they quit Chrome, and needs no permission
 * beyond the `storage` one already granted at install.
 */
export interface SessionState {
  /** True once the splash has been shown in this browser session. */
  'wb:splash': boolean;
}

export interface Migration { to: number; up(state: unknown): unknown; }
