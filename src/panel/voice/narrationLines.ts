import { S } from '../strings';

/**
 * V3.0 pass 3g — narration lines COMPOSED in the panel rather than by
 * `narrationFor`, shared here so the render pipeline and the screens that
 * speak them can never drift apart. The ElevenLabs pass found the gap:
 * BaselineOffer composed these inline, so they had no clips and fell to
 * the engine — silence on the machine the clips exist for.
 */
/* THE GUIDE'S SCRIPT (Adam, 2026-09-03, verbatim lines): the narrator
   speaks coaching the screen does not print - his explicit direction,
   superseding the no-drift rule for the baseline errand. Each line is a
   clip (the emitter carries them) with the engine as fallback. */
export function baselineAskNarration(): string {
  return 'Let\u2019s set your prompting baseline! You are going to just write a prompt. But I want you to start that prompt with a verb. Something like \u201cplan\u201d or \u201cedit\u201d or maybe \u201csummarize\u201d? What is something you want your AI to \u201cdo\u201d for you?';
}

export function offerStepNarration(step: string): string {
  if (step === 'open')
    return 'Select a provider from the list and go to that service by clicking the \u201cGo to\u201d button. Paste your prompt into the service and send that prompt off!';
  if (step === 'return')
    return 'Last step. Copy your prompt with the button, paste it into your service, and send it. Then copy the whole response and paste it in the highlighted input box.';
  return 'Select a provider from the list and go to that service by clicking the \u201cGo to\u201d button.';
}

export function baselineOfferLandedLine(): string {
  return `${S.baselineSaved} ${S.baselineNextTitle} ${S.baselineNextBody}`;
}

/** Every composed line, for the emitter. */
export function composedNarrations(): string[] {
  return [
    baselineAskNarration(),
    offerStepNarration('copy'),
    offerStepNarration('open'),
    offerStepNarration('return'),
    baselineOfferLandedLine(),
  ];
}
