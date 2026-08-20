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
}
/** sync — preferences only. ~100KB total, 8KB per item. Never put answers here. */
export interface SyncState { 'wb:prefs': Prefs; }

export interface Migration { to: number; up(state: unknown): unknown; }
