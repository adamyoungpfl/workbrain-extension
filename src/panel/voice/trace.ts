/**
 * THE FLIGHT RECORDER (V3.0 pass 3d; Adam: "simplify… so it is easier to
 * troubleshoot why this has been so inconsistent").
 *
 * Every audio decision — a clip requested, an utterance queued, a voice
 * resolved or waited for, a start that never came — appends one line here,
 * whatever build. Reading it is dev-only (`wbAudio.trace()` in the panel
 * console, installed beside `wbVoices`), so the next silent moment answers
 * "where did it die?" from the machine it died on instead of another round
 * of guesswork. A ring of 100: enough for a whole splash run, never a log
 * that grows.
 *
 * Guardrails: this is a record of what the SOFTWARE did with its own
 * audio, held in memory, never stored, never sent — the build-number side
 * of the measurement test, not the person side.
 */
export interface AudioEvent {
  at: number;
  event: string;
  detail?: string;
}

const RING = 100;
const events: AudioEvent[] = [];

export function trace(event: string, detail?: string): void {
  events.push({ at: Date.now(), event, ...(detail ? { detail } : {}) });
  if (events.length > RING) events.shift();
}

export function readTrace(): readonly AudioEvent[] {
  return [...events];
}
