import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NARRATOR_VOICE } from '../../core/voice/roles';
import { installedVoices, isSpeaking, narratorSupported, speak, stopSpeaking } from './speech';

/**
 * The panel half of V1.3 VB-18, against a fake speech engine.
 *
 * jsdom has no Web Speech API at all, which makes it the right place to prove
 * both halves of the degradation rule: a browser without one is silent and
 * says nothing about it, and a browser with one gets a cancel before every
 * single utterance.
 */

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

interface SpokenRecord {
  text: string;
  voice: FakeVoice | null;
  lang: string;
  rate: number;
  pitch: number;
}

class FakeUtterance {
  voice: FakeVoice | null = null;
  lang = '';
  rate = 1;
  pitch = 1;
  constructor(public text: string) {}
}

class FakeSynth {
  speaking = false;
  pending = false;
  cancels = 0;
  spoken: SpokenRecord[] = [];
  /** Every call, in order, so "cancel came first" is assertable rather than
   * inferred from two counters. */
  calls: string[] = [];

  constructor(private voices: FakeVoice[]) {}

  getVoices(): FakeVoice[] {
    return this.voices;
  }

  setVoices(voices: FakeVoice[]): void {
    this.voices = voices;
  }

  speak(utterance: FakeUtterance): void {
    this.calls.push('speak');
    this.speaking = true;
    this.spoken.push({
      text: utterance.text,
      voice: utterance.voice,
      lang: utterance.lang,
      rate: utterance.rate,
      pitch: utterance.pitch,
    });
  }

  cancel(): void {
    this.calls.push('cancel');
    this.cancels += 1;
    this.speaking = false;
  }

  addEventListener(): void {}
}

const voice = (name: string, lang: string, extra: Partial<FakeVoice> = {}): FakeVoice => ({
  name,
  lang,
  localService: true,
  default: false,
  ...extra,
});

const scope = globalThis as unknown as {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
};

function install(voices: FakeVoice[]): FakeSynth {
  const synth = new FakeSynth(voices);
  scope.speechSynthesis = synth;
  scope.SpeechSynthesisUtterance = FakeUtterance;
  return synth;
}

function uninstall(): void {
  delete scope.speechSynthesis;
  delete scope.SpeechSynthesisUtterance;
}

afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
});

describe('a browser with no speech engine', () => {
  beforeEach(uninstall);

  it('reports no narrator, and every call is a silent no-op', () => {
    expect(narratorSupported()).toBe(false);
    expect(isSpeaking()).toBe(false);
    expect(() => speak({ role: 'question', text: 'Anyone there?' })).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });

  it('is not a browser with half an API either', () => {
    scope.speechSynthesis = new FakeSynth([]);
    // No `SpeechSynthesisUtterance` to construct: not narratable.
    expect(narratorSupported()).toBe(false);
  });
});

describe('speak', () => {
  it('cancels whatever is being said before it says anything', () => {
    const synth = install([voice('Samantha', 'en-US', { default: true })]);
    speak({ role: 'question', text: 'First question.' });
    speak({ role: 'question', text: 'Second question.' });

    expect(synth.calls).toEqual([
      /* V3.0 pass 3c round two: no cancel before a FIRST utterance on a
         quiet engine - the no-op storm is what wedged the Mac daemon. The
         second speak interrupts real speech, and cancels. */
      'speak',
      'cancel',
      'speak',
    ]);
    expect(synth.spoken.map((s) => s.text)).toEqual(['First question.', 'Second question.']);
  });

  it('speaks in the voice the role table resolves to, with its rate and pitch', () => {
    const samantha = voice('Samantha', 'en-US', { default: true });
    const synth = install([voice('Daniel', 'en-GB'), samantha]);

    speak({ role: 'question', text: 'What do you do?' });

    const [spoken] = synth.spoken;
    expect(spoken?.voice).toBe(samantha);
    expect(spoken?.lang).toBe('en-US');
    expect(spoken?.rate).toBe(NARRATOR_VOICE.rate);
    expect(spoken?.pitch).toBe(NARRATOR_VOICE.pitch);
  });

  it('leaves the voice unset when the engine has none, rather than throwing', () => {
    const synth = install([]);
    speak({ role: 'recap', text: 'Nothing installed here.' });

    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]?.voice).toBeNull();
  });

  it('says nothing at all for empty text', () => {
    const synth = install([voice('Samantha', 'en-US')]);
    speak({ role: 'question', text: '   ' });
    expect(synth.calls).toEqual([]);
  });
});

describe('stopSpeaking', () => {
  it('cancels, and is safe when nothing is speaking', () => {
    const synth = install([voice('Samantha', 'en-US')]);
    speak({ role: 'question', text: 'Halfway through this sen—' });
    expect(isSpeaking()).toBe(true);

    stopSpeaking();
    expect(isSpeaking()).toBe(false);
    /* V3.0 pass 3c round two: cancel is CONDITIONAL now - it only fires
       when something is being said or queued, because no-op cancel storms
       are what wedged the Mac speech daemon. The count reflects the new
       claim: none before a first utterance on a quiet engine, one to stop
       it, none for stopping silence. */
    expect(synth.cancels).toBe(1);

    stopSpeaking();
    expect(synth.cancels).toBe(1);
  });
});

describe('installedVoices', () => {
  it('hands core the plain shape it decides over', () => {
    install([voice('Samantha', 'en-US', { default: true })]);
    expect(installedVoices()).toEqual([
      { name: 'Samantha', lang: 'en-US', localService: true, default: true },
    ]);
  });

  // getVoices() is empty until the engine has loaded, and on some platforms
  // empties again mid-session. A question must not be read in the wrong voice
  // because of the moment it happened to be asked.
  it('keeps the last real list when the engine hands back an empty one', () => {
    const synth = install([voice('Samantha', 'en-US')]);
    expect(installedVoices()).toHaveLength(1);

    synth.setVoices([]);
    expect(installedVoices()).toEqual([
      { name: 'Samantha', lang: 'en-US', localService: true, default: false },
    ]);
  });
});
