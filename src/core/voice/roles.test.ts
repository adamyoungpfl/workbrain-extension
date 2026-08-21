import { describe, it, expect } from 'vitest';
import {
  NARRATOR_VOICE,
  VOICE_PLAN,
  VOICE_ROLES,
  isSingleVoicePlan,
  resolveVoice,
  utteranceFor,
  voiceFor,
  type InstalledVoice,
  type VoiceChoice,
  type VoicePlan,
} from './roles';

const voice = (
  name: string,
  lang: string,
  extra: Partial<InstalledVoice> = {},
): InstalledVoice => ({ name, lang, localService: true, default: false, ...extra });

/** A machine that looks like the one this was developed on: 180 voices, all
 * local, `Samantha` the en-US default. */
const MAC: InstalledVoice[] = [
  voice('Samantha', 'en-US', { default: true }),
  voice('Daniel', 'en-GB'),
  voice('Karen', 'en-AU'),
  voice('Zosia', 'pl-PL'),
];

/** Windows, where the voice names carry a locale suffix. */
const WINDOWS: InstalledVoice[] = [
  voice('Microsoft David Desktop - English (United States)', 'en-US'),
  voice('Microsoft Zira Desktop - English (United States)', 'en-US', { default: true }),
];

describe('the mapping table', () => {
  it('names all three roles', () => {
    expect(VOICE_ROLES).toEqual(['question', 'followUp', 'recap']);
    for (const role of VOICE_ROLES) expect(VOICE_PLAN[role]).toBeDefined();
  });

  // The decision docs/V1.3-REFINEMENT.md records: build for (b), ship (a).
  // When Adam picks per-content-type voices this test is what changes, and it
  // is the only thing that has to.
  it('ships one voice in all three roles', () => {
    expect(isSingleVoicePlan()).toBe(true);
    expect(voiceFor('question')).toBe(NARRATOR_VOICE);
    expect(voiceFor('followUp')).toBe(NARRATOR_VOICE);
    expect(voiceFor('recap')).toBe(NARRATOR_VOICE);
  });

  it('resolves each role through the table, so three voices is a table edit', () => {
    const other: VoiceChoice = { candidates: ['Daniel'], lang: 'en-GB', rate: 1.1, pitch: 0.9 };
    const plan: VoicePlan = { ...VOICE_PLAN, recap: other };

    expect(isSingleVoicePlan(plan)).toBe(false);
    expect(utteranceFor('question', 'Hello.', MAC, plan).voiceName).toBe('Samantha');
    expect(utteranceFor('followUp', 'Hello.', MAC, plan).voiceName).toBe('Samantha');

    const recap = utteranceFor('recap', 'Hello.', MAC, plan);
    expect(recap.voiceName).toBe('Daniel');
    expect(recap.rate).toBe(1.1);
    expect(recap.pitch).toBe(0.9);
  });
});

describe('resolveVoice', () => {
  it('takes the first installed candidate, in order', () => {
    expect(resolveVoice(NARRATOR_VOICE, MAC)?.name).toBe('Samantha');
    expect(resolveVoice({ ...NARRATOR_VOICE, candidates: ['Karen', 'Samantha'] }, MAC)?.name).toBe('Karen');
  });

  it('matches a name by prefix, for the platforms that suffix their locale', () => {
    expect(resolveVoice(NARRATOR_VOICE, WINDOWS)?.name).toBe(
      'Microsoft Zira Desktop - English (United States)',
    );
  });

  it('prefers an exact name over a longer one that merely starts the same', () => {
    const both = [voice('Zira Desktop - English', 'en-US'), voice('Zira', 'en-US')];
    expect(resolveVoice({ ...NARRATOR_VOICE, candidates: ['Zira'] }, both)?.name).toBe('Zira');
  });

  // docs/GUARDRAILS.md: no feature that only works online. Chrome's network
  // voices sound better and stop working on a plane, so a local voice wins
  // even when the network one is named first.
  it('will not choose a voice that needs a network while a local one exists', () => {
    const mixed = [
      voice('Samantha', 'en-US', { localService: false }),
      voice('Daniel', 'en-GB'),
    ];
    expect(resolveVoice(NARRATOR_VOICE, mixed)?.name).toBe('Daniel');
  });

  it('falls back to the locale, then the language, then the default voice', () => {
    const noCandidates: VoiceChoice = { ...NARRATOR_VOICE, candidates: ['Nobody'] };
    expect(resolveVoice(noCandidates, MAC)?.name).toBe('Samantha');

    const noUs = [voice('Daniel', 'en-GB'), voice('Zosia', 'pl-PL', { default: true })];
    expect(resolveVoice(noCandidates, noUs)?.name).toBe('Daniel');

    const noEnglish = [voice('Zosia', 'pl-PL'), voice('Yelda', 'tr-TR', { default: true })];
    expect(resolveVoice(noCandidates, noEnglish)?.name).toBe('Yelda');
  });

  it('takes a network voice only when nothing local is installed at all', () => {
    const remoteOnly = [voice('Google US English', 'en-US', { localService: false })];
    expect(resolveVoice(NARRATOR_VOICE, remoteOnly)?.name).toBe('Google US English');
  });

  it('hands back null on a machine with no voices, rather than inventing one', () => {
    expect(resolveVoice(NARRATOR_VOICE, [])).toBeNull();
  });
});

describe('utteranceFor', () => {
  it('describes the utterance the panel is about to speak', () => {
    expect(utteranceFor('question', 'What do you do?', MAC)).toEqual({
      text: 'What do you do?',
      voiceName: 'Samantha',
      lang: 'en-US',
      rate: 1,
      pitch: 1,
    });
  });

  it('speaks in the resolved voice’s own language, not the one asked for', () => {
    const british = [voice('Daniel', 'en-GB')];
    expect(utteranceFor('question', 'Hello.', british).lang).toBe('en-GB');
  });

  it('sets no voice when none resolves, leaving the browser its default', () => {
    const none = utteranceFor('question', 'Hello.', []);
    expect(none.voiceName).toBeNull();
    expect(none.lang).toBe('en-US');
  });
});
