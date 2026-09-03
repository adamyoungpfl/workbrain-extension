import { announce, bumpWord, resetWords } from './activity';
import { trace } from './trace';

/**
 * THE CLIP PLAYER (V3.0 pass 3d; Adam: "simplify the relationship between
 * the queues and audio files to normalize the way they are playing").
 *
 * Fixed cues stop riding the speech engine entirely. They are BUNDLED
 * AUDIO FILES (public/cues/*.m4a — placeholder renders of the approved
 * lines today, ElevenLabs file-for-file later), played through an
 * HTMLAudioElement: the MEDIA path, the one route Adam's machine has
 * never failed, with none of the OS speech daemon's moods. Only dynamic
 * text (question narration) still needs synthesis.
 *
 * One clip at a time, replace-not-queue — the same semantics speak() has
 * always had. The dance rides a steady tick, since a file has no word
 * boundaries. Resolves false on ANY failure (missing file, jsdom's bare
 * Audio, an autoplay refusal) so the caller can fall back to the engine —
 * degradation, never silence by surprise.
 */
let current: HTMLAudioElement | null = null;
let tick = 0;

export function stopClip(): void {
  if (!current) return;
  trace('clip:stop');
  const el = current;
  current = null;
  window.clearInterval(tick);
  try {
    el.pause();
  } catch {
    /* Silent, per docs/GUARDRAILS.md — stopping is best-effort. */
  }
  announce(false);
}

export function playClip(name: string): Promise<boolean> {
  stopClip();
  return new Promise((resolve) => {
    let el: HTMLAudioElement;
    try {
      el = new Audio(`cues/${name}.m4a`);
    } catch {
      trace('clip:no-audio-element', name);
      resolve(false);
      return;
    }
    current = el;
    let settled = false;
    const settle = (ok: boolean, why: string) => {
      if (settled) return;
      settled = true;
      trace(ok ? 'clip:done' : 'clip:failed', `${name} ${why}`);
      if (current === el) {
        current = null;
        window.clearInterval(tick);
        announce(false);
      }
      resolve(ok);
    };
    el.onplaying = () => {
      trace('clip:playing', name);
      resetWords();
      announce(true);
      window.clearInterval(tick);
      /* The dance's heartbeat: a tick close to speech's own word cadence,
         so a clip and an utterance move the peaks the same way. */
      tick = window.setInterval(() => {
        bumpWord();
        announce(true);
      }, 260);
    };
    el.onended = () => settle(true, 'ended');
    el.onerror = () => settle(false, 'error');
    trace('clip:play', name);
    const played = el.play();
    if (played && typeof played.catch === 'function') {
      played.catch((reason) => settle(false, `rejected ${String(reason).slice(0, 60)}`));
    }
  });
}
