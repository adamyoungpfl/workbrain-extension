/**
 * Chat history audit.
 *
 * The person requests their own export from the platform and gives us the file.
 * We never scrape, so this needs no host permission and no site cooperation.
 *
 * HARD RULE: the raw export never touches chrome.storage and never leaves the device.
 * Only candidates the person explicitly ticks are persisted, in their edited form.
 */

export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'copilot';

/** Every parser normalises to this. Signal extraction only ever sees this shape. */
export interface Conversation {
  id: string;
  title?: string;
  createdAt?: number;          // epoch ms
  messages: Message[];
}

export interface Message {
  role: 'user' | 'assistant';
  text: string;
  at?: number;
  /**
   * True when this node had siblings in the source — an edit or regeneration.
   * ChatGPT stores messages as a tree for exactly this reason, so every branch
   * point is a moment the person was not satisfied. Free correction signal.
   */
  branchPoint?: boolean;
}

export interface ChatExportParser {
  id: PlatformId;
  /** cheap sniff — filename, top-level shape. Must not read the whole file. */
  detect(file: File): Promise<boolean>;
  /** stream so a large export never freezes the panel; run inside a worker */
  parse(file: File, onProgress?: (pct: number) => void): AsyncIterable<Conversation>;
}

// ---------------------------------------------------------------- signals

export interface RepeatedPhrase {
  text: string;              // quoted back to the person verbatim
  conversations: number;     // how many distinct conversations it appeared in
  firstSeen?: number;
  lastSeen?: number;
}

export interface EntityCandidate {
  name: string;
  mentions: number;
  kind?: 'person' | 'system' | 'project' | 'unknown';  // heuristic only, always editable
}

export interface TopicCluster {
  label: string;
  conversations: number;
  distinctDays: number;
}

export interface AuditResult {
  conversations: number;
  spanDays: number;
  repeatedPhrases: RepeatedPhrase[];
  corrections: { count: number; perConversation: number; examples: string[] };
  entities: EntityCandidate[];
  topics: TopicCluster[];
  setupTaxChars: number;      // median
  vocabulary: string[];
}

export interface AuditOptions {
  /** a phrase must recur in at least this many distinct conversations */
  minConversations: number;   // default 3
  /** word-length window for shingling */
  shingle: [number, number];  // default [5, 8]
  /** cap so a huge export stays responsive */
  maxConversations?: number;
}
