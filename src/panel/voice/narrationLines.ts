import { S } from '../strings';

/**
 * V3.0 pass 3g — narration lines COMPOSED in the panel rather than by
 * `narrationFor`, shared here so the render pipeline and the screens that
 * speak them can never drift apart. The ElevenLabs pass found the gap:
 * BaselineOffer composed these inline, so they had no clips and fell to
 * the engine — silence on the machine the clips exist for.
 */
export function baselineOfferAskLine(): string {
  return `${S.baselineTitle}. ${S.baselineStep1} — ${S.baselineStep2} — ${S.baselineStep3}.`;
}

export function baselineOfferLandedLine(): string {
  return `${S.baselineSaved} ${S.baselineNextTitle} ${S.baselineNextBody}`;
}

/** Every composed line, for the emitter. */
export function composedNarrations(): string[] {
  return [baselineOfferAskLine(), baselineOfferLandedLine()];
}
