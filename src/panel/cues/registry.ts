import { useCallback, useRef } from 'react';

/**
 * The target registry: docs/ARCHITECTURE.md — "verbs resolve targets
 * through a registry so a target name never appears in a component." A
 * component that wants to be something a cue can point at calls
 * `useCueTarget('some-name')` and spreads the returned ref callback onto
 * its own DOM node; verbs.ts and Pointer.tsx then resolve that same name
 * without ever importing the component or knowing it exists.
 *
 * Module-level and mutable by design — there is exactly one panel document,
 * so one shared registry is the right model, the same way there is one
 * `document`. Never exported for direct mutation, only through
 * register/resolve, so nothing outside this file can leave it inconsistent.
 */
const targets = new Map<string, Set<HTMLElement>>();

/** Registers `el` under `name`. Returns the matching unregister function —
 * call it (once) when the element goes away. A name may have more than one
 * element registered under it at a time: the design mock applies `sweep` to
 * a whole row of pills at once, each with its own stagger, which only works
 * if resolving one name can hand back several elements. */
export function registerCueTarget(name: string, el: HTMLElement): () => void {
  let set = targets.get(name);
  if (!set) {
    set = new Set();
    targets.set(name, set);
  }
  set.add(el);
  let active = true;
  return () => {
    if (!active) return; // idempotent — a stray double-call is harmless
    active = false;
    set!.delete(el);
    if (set!.size === 0) targets.delete(name);
  };
}

/** Zero elements for a name nothing has registered — never throws. That
 * covers both a typo in cue data and, per R1-08's scope note, every real
 * target today: no real chain has been wired into the ported flow yet. */
export function resolveCueTarget(name: string): HTMLElement[] {
  const set = targets.get(name);
  return set ? Array.from(set) : [];
}

/** Test-only: drops every registration so one spec's targets can't leak
 * into the next. Not used by any non-test code. */
export function clearCueRegistry(): void {
  targets.clear();
}

/**
 * The registration mechanism itself. Attach the returned ref callback to
 * whichever DOM node should answer to `name` (or pass `undefined` to
 * register nothing — e.g. a component still waiting on data). One hook
 * call registers exactly one element; a shared name across many elements
 * comes from many components each calling this once for themselves, not
 * from reusing a single returned callback across several nodes.
 */
export function useCueTarget<T extends HTMLElement>(name: string | undefined): (el: T | null) => void {
  const nameRef = useRef(name);
  nameRef.current = name;
  const cleanupRef = useRef<(() => void) | null>(null);

  // React calls a ref callback with `null` on unmount (and again before a
  // new node, if the ref ever moved) — that alone is enough to unregister
  // reliably, with no separate effect needed.
  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (el && nameRef.current) {
      cleanupRef.current = registerCueTarget(nameRef.current, el);
    }
  }, []);
}
