import type { CueEvent, CueLink, CueSpec } from '../../schema/flow.types';

/**
 * The cue engine: docs/ARCHITECTURE.md's "Cue engine" section, R1-08.
 *
 * This file is the pure chain runner only — no DOM, no chrome.*, no React.
 * It knows how to read a `CueSpec` string and how to walk a `CueLink[]`,
 * and nothing about what a "target" actually is. Real targets, real verbs,
 * and the real DOM live in registry.ts / verbs.ts / Pointer.tsx; useCueChain.ts
 * wires this runner to all three. Kept separate so this file (the part with
 * the actual advancing logic TESTING.md names) is testable with fixture
 * strings and spy functions — no jsdom element required at all.
 */

export type CueVerbName = 'sweep' | 'ring' | 'ringViolet' | 'focus' | 'bob' | 'point';

const KNOWN_VERBS: ReadonlySet<string> = new Set<CueVerbName>([
  'sweep',
  'ring',
  'ringViolet',
  'focus',
  'bob',
  'point',
]);

export interface ParsedCueSpec {
  verb: CueVerbName;
  target: string;
  /** `point` only — the pointer overlay's caption, from `point:target|label`. */
  label?: string;
}

/**
 * `verb:target`, or `point:target|label` for the cross-surface pointer (see
 * docs/ARCHITECTURE.md's cue example). A spec naming a verb this engine
 * doesn't recognise parses to `null` rather than throwing — the cue
 * invariant is "cues accelerate; they never gate" (docs/ARCHITECTURE.md),
 * and docs/GUARDRAILS.md's degradation table has no entry for "the content
 * is malformed" that isn't some flavour of "keep going, do less." A bad
 * line of cue data should never be able to take the question around it
 * down with it.
 */
export function parseCueSpec(spec: CueSpec): ParsedCueSpec | null {
  const colon = spec.indexOf(':');
  const verbPart = colon < 0 ? spec : spec.slice(0, colon);
  const rest = colon < 0 ? '' : spec.slice(colon + 1);
  if (!KNOWN_VERBS.has(verbPart)) return null;
  const verb = verbPart as CueVerbName;

  if (verb === 'point') {
    const bar = rest.indexOf('|');
    if (bar < 0) return { verb, target: rest };
    return { verb, target: rest.slice(0, bar), label: rest.slice(bar + 1) };
  }
  return { verb, target: rest };
}

/**
 * Everything the chain runner needs from its surroundings, injected so the
 * runner itself never touches the DOM, a registry, or React state directly.
 * `TTarget` is left generic on purpose — engine.test.ts uses plain strings
 * as stand-in "elements" and never mounts a real DOM node; useCueChain.ts
 * instantiates this with `HTMLElement` for the real panel.
 */
export interface CueEngineDeps<TTarget = unknown> {
  /** Resolves a target name to zero, one, or many targets — see registry.ts. */
  resolve: (target: string) => TTarget[];
  /** Marks `elements` with `cue`. Called once per spec in a link's `play`,
   * after `clearAll` has already run for this link. */
  apply: (cue: ParsedCueSpec, elements: TTarget[]) => void;
  /** Clears every mark the previous link left, including before link 0 —
   * a chain always starts from nothing rather than assuming the DOM is
   * already clean. */
  clearAll: () => void;
  /** The current link's `say`, or `undefined` once nothing is playing
   * (a link with no `say`, or the chain has run off the end). */
  announce: (text: string | undefined) => void;
}

export interface CueChainController {
  /** 0-based index of the link currently playing; equals `links.length`
   * once the chain has run off the end. */
  readonly index: number;
  readonly done: boolean;
  /** Hands the chain an event. Advances exactly one link if it matches the
   * *current* link's `until`; every other event is a no-op — a person can
   * click around, type elsewhere, whatever, and only the one thing the
   * current cue is actually waiting for moves the chain forward. */
  fire: (event: CueEvent) => void;
  /** Clears whatever is currently playing and ends the chain immediately —
   * for unmount, or leaving the step before its cues finished on their own. */
  stop: () => void;
}

/**
 * The chain runner itself. Plays link 0 synchronously before returning, then
 * advances exactly one link per matching `fire` call — see
 * docs/TESTING.md §2's "given a chain, firing the `until` events in order
 * advances exactly one link at a time, and firing an unrelated event
 * advances nothing," which is exactly what engine.test.ts asserts.
 */
export function runCueChain<TTarget = unknown>(
  links: readonly CueLink[],
  deps: CueEngineDeps<TTarget>,
): CueChainController {
  let index = -1;

  function play() {
    deps.clearAll();
    const link = links[index];
    if (!link) {
      deps.announce(undefined);
      return;
    }
    for (const spec of link.play) {
      const parsed = parseCueSpec(spec);
      if (!parsed) continue; // degrade silently — see parseCueSpec's comment
      deps.apply(parsed, deps.resolve(parsed.target));
    }
    deps.announce(link.say);
  }

  function advance() {
    index += 1;
    play();
  }

  advance(); // link 0 plays as soon as the chain starts, per ARCHITECTURE.md

  return {
    get index() {
      return index;
    },
    get done() {
      return index >= links.length;
    },
    fire(event: CueEvent) {
      const link = links[index];
      if (link && link.until === event) advance();
    },
    stop() {
      index = links.length;
      deps.clearAll();
      deps.announce(undefined);
    },
  };
}
