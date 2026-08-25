import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { isOutlined } from '../../core/choice/orbs';
import { rovingTarget, toggleChoice } from '../../core/choice/roving';
import {
  HIGHLIGHT_RADIUS,
  LIMB_INNER,
  SHADE_RADIUS,
  orbLight,
  stagePoint,
  type OrbLight,
} from '../../core/globe/lighting';
import {
  ORB_PULSE_MS,
  ORB_ROTATE_MS,
  ROTATION_RUNNING,
  isRunning,
  nextIndex,
  stopRotation,
  viewFor,
  type RotationHold,
  type RotationInput,
  type RotationInteraction,
} from '../../core/motion/rotation';
import { childNodeGradient } from './BrainGlobe';
import { prefersReducedMotion } from '../cues/verbs';
import { S } from '../strings';
import './OrbGroup.css';

/**
 * ═══ V2.0 VB-60 — CHOOSING ONE OR MANY, AS ORBS ═══════════════════════════
 *
 * docs/V2.0-REFINEMENT.md VB-60, in its own words: the roles question "stops
 * being pills. Options become **inactive, dimmed orbs with a glowing outline
 * that rotates through the available choices**, indicating you can pick one or
 * several. **Add-new becomes a smaller, faintly glowing orb with a pulsing
 * `+`** — an anchor to action when nothing on screen looks clickable."
 *
 * ── IT IS THE BRAIN'S ORB, NOT A CIRCLE THAT LOOKS LIKE ONE ──────────────
 *
 * Every part of the object comes from where the object already lives:
 *
 * - **The colour** is `childNodeGradient` — the same five gradients the globe's
 *   child cluster wears and the same ones V1.8 VB-45 put on the List's rows,
 *   taken from the same function rather than a second cycle that happens to
 *   look similar (see BrainGlobe.tsx's note on why that function is exported).
 * - **The light** is `core/globe/lighting.ts`'s `SCENE_LIGHT` — the ONE light
 *   in the product — read through `orbLight`, the same pure function the globe
 *   and the List both call. The three painted layers, their sizes and the limb
 *   are the same constants, published from core so this file holds no
 *   arithmetic about a light it cannot see.
 * - **The hairline** is the orb's own deep colour, inset, exactly as VB-45 put
 *   it on the List's orbs and for exactly the same measured reason: the globe's
 *   colours were chosen against a near-black field and the lightest of them is
 *   about 2.7:1 on this near-white pane, under the 3:1 WCAG 1.4.11 asks of a
 *   graphic that carries meaning. The ring is over 12:1 whatever the fill does.
 *
 * WHERE EACH ORB STANDS UNDER THAT LIGHT IS MEASURED, and that is the one place
 * this surface departs from FileTree.tsx, which models. The reason is in
 * `stagePoint`'s own header: a wrapping flow's positions depend on the width of
 * the words, on the panel's width, and on how many roles the person has added,
 * so a model here would be a different layout that the light was computed for
 * and nobody could see. Seven orbs, measured when the options or the panel's
 * width change and never on a keystroke.
 *
 * ── SELECTION IS NEVER THE GLOW ─────────────────────────────────────────
 *
 * The task is explicit and so is docs/GUARDRAILS.md: nothing distinguished by
 * colour alone, and selection may not be carried by glow. Picked carries THREE
 * signals, none of which is a hue:
 *
 *   1. **A tick drawn inside the orb** — the same stroked path VB-45 puts in a
 *      `lit` row's orb, in the orb's own deep colour. A shape, so greyscale
 *      keeps it whole.
 *   2. **The fill goes to full strength.** An unpicked orb is mixed most of the
 *      way to the canvas — "inactive, dimmed" — so picked and unpicked differ in
 *      LIGHTNESS, which is what survives when hue is removed.
 *   3. **The label goes to 600.** Weight, which is neither shape nor colour.
 *
 * Plus `aria-pressed`, which is the same distinction for anyone not looking at
 * it at all. tests/e2e/orb-choice.spec.ts strips every colour from the document
 * and re-measures all of it.
 *
 * ── THE TRAVELLING OUTLINE IS core/motion/rotation.ts ────────────────────
 *
 * docs/V2.0-REFINEMENT.md FLAG 1, decided by Adam on 2026-08-24: "the rotation
 * stops permanently on any interaction and never resumes... **The same rule
 * governs VB-60's rotating orb outline.** One implementation, both places."
 *
 * So there is no rotation in this file. There is a `RotationLife` from the same
 * module `components/DeepDive.tsx` holds, stopped through the same
 * `stopRotation`, read through the same `viewFor` and `isRunning`, and fed the
 * same `stoppedBy` the surface hands the follow-up link — which is what makes
 * "a keypress in the answer field stops the orbs too" true without this
 * component knowing that an answer field exists. The only local value is
 * `ORB_ROTATE_MS`, and the reason a turn here is shorter than a turn there is
 * written on the constant.
 *
 * `viewFor`'s `{kind:'all'}` is the still equivalent, and it needs no code of
 * its own: under `prefers-reduced-motion` every orb is outlined at once, which
 * says "any of these, one or several" more completely than the moving version
 * ever does (docs/GUARDRAILS.md — the still version carries the instruction).
 *
 * **THE PULSING `+` STOPS WITH IT.** It is on the same life, so the first thing
 * a person does to this question takes every moving thing in the group still,
 * together, rather than leaving one cue breathing beside a stopped one.
 *
 * ── AND IT IS STILL PillGroup's KEYBOARD ────────────────────────────────
 *
 * Roving tabindex, arrows both axes, Home/End, Space and Enter selecting
 * through native button activation, a real `role="group"` named by the
 * question. Not reimplemented — `core/choice/roving.ts` is the arithmetic and
 * `PillGroup` calls the same function, so the two groups cannot drift apart.
 * Every orb's pressable box is at least 44×44 whatever the paint is doing;
 * VB-15's split lives in OrbGroup.css next to the numbers.
 */

/** The tick inside a picked orb — VB-45's `lit` mark, on VB-45's 12×12 grid,
 * so the shape a chosen orb wears here is the shape a reached section wears in
 * the List. Drawn, never a font glyph: `✓` renders as an all-but-invisible dot
 * in this panel's font stack, which would put the whole signal back on colour
 * (components/DeepDive.tsx found this first). */
const PICKED_MARK = 'M2.9 6.2 L5.1 8.4 L9.1 3.9';

/** The `+` inside the add-new orb, on the same grid and in the same stroke. */
const ADD_MARK = 'M6 2.6 L6 9.4 M2.6 6 L9.4 6';

/**
 * The paint, at 28px for a choice and 20px for the add control — "a **smaller**
 * orb", VB-60's own word. Declared here rather than only in CSS because the
 * light's offsets are fractions of the orb's radius and the mark is drawn on a
 * 12-unit grid, so both files have to agree about one number.
 */
const ORB_PX = 28;
const ADD_ORB_PX = 20;

/**
 * How hard the light paints on THIS surface — FileTree.tsx's three gains,
 * unchanged, because this is the same size of orb on the same colour of ground.
 * They are per-surface for the reason core/globe/lighting.ts gives for
 * reporting `shade` as a physical quantity rather than an opacity: a 28px orb
 * on a white pane has nothing like the room to darken that a 12px orb on a
 * near-black stage has.
 */
const PICKER_LIMB = 0.42;
const PICKER_SPEC = 0.62;
const PICKER_TERMINATOR = 0.85;

/** Lit from straight ahead — what an orb looks like for the one frame before
 * the group has been measured, and in a test with no layout. `orbLight`'s own
 * neutral answer, not a guess of one. */
const NEUTRAL_LIGHT: OrbLight = orbLight({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

/**
 * NO `suggested` HERE, AND THAT IS A DECISION WITH A TEST ON IT.
 *
 * `PillOption` carries one, and `PillGroup` draws a recommended option with a
 * tinted ring — V1.6's recommendations engine sets `rec` on four questions.
 * None of them is an orb question, so there is nothing for this to draw and a
 * prop that is never true is a prop nobody maintains. If the engine ever
 * reaches one, `core/choice/orbs.test.ts` fails rather than the ring quietly
 * disappearing, and the ring is what has to be designed then: on this surface
 * "a ring around the orb" is already the travelling outline's shape, so it
 * cannot simply be borrowed.
 */
export interface OrbOption {
  value: string;
  label: string;
}

export interface OrbGroupProps {
  /** The group's accessible name — the question, as `PillGroup` takes it. */
  legend: string;
  options: OrbOption[];
  mode: 'single' | 'multi';
  value: string[];
  onChange: (value: string[]) => void;
  /** Opens the same "+ add your own" field the pill row opens. VB-60 changes
   * the trigger's paint, never the mechanism — see Flow.tsx's `addCustom`. */
  onAddOwn?: (() => void) | undefined;
  /**
   * V2.0 VB-57's prop, on VB-60's surface and for the same reason: an
   * interaction the SURFACE saw somewhere else in the question area — typing an
   * answer, pressing rephrase, clicking blank space — ends this rotation for
   * good exactly as one of the group's own does. `null` while nothing has
   * happened; it can only ever go from `null` to a reason.
   */
  stoppedBy?: RotationInteraction | null | undefined;
}

/** `prefers-reduced-motion`, live — the same standing question DeepDive.tsx
 * asks, for the same reason: whether a rotation is scheduled at all has to
 * change when the person changes the setting, not the next time they press
 * something. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    if (!query?.addEventListener) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Every orb's place under the one light, measured from the boxes actually
 * painted and converted through `core/globe/lighting.ts`'s `stagePoint`.
 *
 * Re-measured when the option list changes (someone added a role of their own)
 * and when the group's box changes (the side panel is resizable, and the flow
 * rewraps when it does). Not on selection, not on a turn of the rotation, and
 * never on a keystroke — none of those move an orb.
 *
 * A `ResizeObserver` where there is one, and nothing at all where there is not:
 * without it the light is simply the one measured at mount, which is the whole
 * feature at every width the panel is not being dragged through. Degradation is
 * mandatory (docs/GUARDRAILS.md) and this is what it costs here.
 */
function useOrbLights(count: number): [OrbLight[], (node: HTMLDivElement | null) => void] {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [lights, setLights] = useState<OrbLight[]>([]);

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const frame = { left: box.left, top: box.top, width: box.width, height: box.height };
    const next = [...root.querySelectorAll<HTMLElement>('[data-orb]')].map((el) => {
      const orb = el.getBoundingClientRect();
      return orbLight(stagePoint(orb.left + orb.width / 2, orb.top + orb.height / 2, frame));
    });
    setLights((current) =>
      current.length === next.length && current.every((light, i) => light.hx === next[i]!.hx && light.hy === next[i]!.hy)
        ? current
        : next,
    );
  };

  useLayoutEffect(measure, [count]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [count]);

  const setRoot = (node: HTMLDivElement | null) => {
    rootRef.current = node;
  };
  return [lights, setRoot];
}

/**
 * One orb, lit.
 *
 * The custom properties are exactly FileTree.tsx's `SectionOrb`'s, produced by
 * the same two converters over the same core numbers — `half` turns a fraction
 * of the radius into a percentage of the box (a circle's half-box is one
 * radius), `mix` turns core's physical 0..1 quantities into the percentages
 * `color-mix` wants. Identical inputs, identical stylesheet arithmetic:
 * that is what makes this the same object rather than a lookalike.
 */
function Orb({
  gradient,
  light,
  picked,
  add,
  outlined,
  pulsing,
}: {
  gradient: number;
  light: OrbLight;
  picked: boolean;
  add?: boolean;
  outlined: boolean;
  pulsing?: boolean;
}) {
  const half = (fraction: number) => `${(fraction * 50).toFixed(2)}%`;
  const mix = (amount: number) => `${Math.min(100, Math.max(0, amount * 100)).toFixed(1)}%`;
  return (
    <span
      className={add ? 'orbchoice-orb is-add' : 'orbchoice-orb'}
      data-orb=""
      data-gradient={gradient}
      data-picked={picked ? 'true' : 'false'}
      data-outlined={outlined ? 'true' : 'false'}
      data-pulsing={pulsing ? 'true' : 'false'}
      style={
        {
          '--orb-px': `${add ? ADD_ORB_PX : ORB_PX}px`,
          '--orb-hx': half(light.hx),
          '--orb-hy': half(light.hy),
          '--orb-sx': half(light.sx),
          '--orb-sy': half(light.sy),
          '--orb-spec-r': half(HIGHLIGHT_RADIUS),
          '--orb-shade-r': half(SHADE_RADIUS),
          '--orb-limb-inner': `${(LIMB_INNER * 100).toFixed(0)}%`,
          // Folded here rather than in `calc()`, exactly as FileTree.tsx does
          // it, so the stylesheet holds no arithmetic about a light it cannot
          // see — and so a test can read core's own numbers off the element.
          '--orb-spec-mix': mix(light.highlight * PICKER_SPEC),
          '--orb-shade-mix': mix(light.shade * PICKER_TERMINATOR),
          '--orb-limb-mix': mix(PICKER_LIMB),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {(picked || add) && (
        <svg className="orbchoice-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          <path
            d={add ? ADD_MARK : PICKED_MARK}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

export function OrbGroup({
  legend,
  options,
  mode,
  value,
  onChange,
  onAddOwn,
  stoppedBy = null,
}: OrbGroupProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length + (onAddOwn ? 1 : 0);
  const selectedIndex = options.findIndex((o) => value.includes(o.value));
  const [rovingIndex, setRovingIndex] = useState(Math.max(0, selectedIndex));
  /**
   * Clamped at render, not stored clamped.
   *
   * The tab stop is "the control whose index is the roving one", so an index
   * that has fallen off the end of a shorter list leaves the group with NO tab
   * stop — reachable by pointer, unreachable by Tab, and silent about it. The
   * list here only ever grows ("+ add your own" appends), so this cannot happen
   * today; it is one `min` against the day a caller hands over a shorter one.
   */
  const roving = Math.min(rovingIndex, count - 1);
  const [lights, setRoot] = useOrbLights(count);

  // ── FLAG 1's rotation, from the follow-up link's own module ──────────
  const reduced = useReducedMotion();
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [ownLife, setOwnLife] = useState(ROTATION_RUNNING);
  const life = stoppedBy ? stopRotation(ownLife, stoppedBy) : ownLife;
  const stop = (by: RotationInteraction) => setOwnLife((current) => stopRotation(current, by));

  const holds: RotationHold[] = [];
  if (hovered) holds.push('hover');
  const rotation: RotationInput = { count: options.length, mode: 'one', reduced, holds, life };
  const view = viewFor(rotation, turn);
  const running = isRunning(rotation);

  /**
   * The turn. An interval, torn down whenever `running` goes false — the hover
   * hold and the terminal stop alike, so a stopped outline is not merely
   * ignoring a clock still ticking under it. After a stop there is nothing to
   * start: `isRunning` can never come back true for this question
   * (core/motion/rotation.ts — there is no `resumeRotation`).
   */
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTurn((current) => nextIndex(current, options.length));
    }, ORB_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [running, options.length]);

  function focusItem(index: number) {
    setRovingIndex(index);
    itemRefs.current[index]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = rovingTarget(e.key, index, count);
    if (target === null) return;
    e.preventDefault();
    focusItem(target);
  }

  return (
    <div
      className="orbgroup"
      ref={setRoot}
      // The pulse's length, from the same core module the turn's length comes
      // from, so the one file that decides how long a beat lasts is the one
      // that decides how long a turn lasts.
      style={{ '--orb-pulse': `${ORB_PULSE_MS}ms` } as CSSProperties}
      role="group"
      // The question, plus what the travelling outline says to the eye and
      // cannot say to a screen reader. See S.orbPickHint.
      aria-label={`${legend} ${S.orbPickHint}`}
      data-rotating={running ? 'true' : 'false'}
      // Hover holds it while the pointer is resting on the way past — the one
      // reason left that lets go (core/motion/rotation.ts). On the group rather
      // than an orb, so the outline cannot arrive under a pointer that is on
      // its way somewhere else.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // FLAG 1's three, in capture, exactly as DeepDive.tsx wires them: a press
      // stops the clock before the selection it makes re-renders, and a click
      // on the group's own padding is still a person touching this question.
      onClickCapture={() => stop('click')}
      onKeyDownCapture={() => stop('key')}
      onFocusCapture={() => stop('focus')}
    >
      {options.map((option, index) => {
        const picked = value.includes(option.value);
        return (
          <button
            key={option.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            className="orbchoice"
            aria-pressed={picked}
            tabIndex={index === roving ? 0 : -1}
            onClick={() => {
              setRovingIndex(index);
              onChange(toggleChoice(value, option.value, mode));
            }}
            onFocus={() => setRovingIndex(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <span className="orbchoice-paint">
              <Orb
                gradient={childNodeGradient(index)}
                light={lights[index] ?? NEUTRAL_LIGHT}
                picked={picked}
                outlined={isOutlined(view, index)}
              />
              <span className="orbchoice-label">{option.label}</span>
            </span>
          </button>
        );
      })}
      {onAddOwn && (
        <button
          ref={(el) => {
            itemRefs.current[options.length] = el;
          }}
          type="button"
          className="orbchoice orbchoice-add"
          tabIndex={options.length === roving ? 0 : -1}
          onClick={() => {
            setRovingIndex(options.length);
            onAddOwn();
          }}
          onFocus={() => setRovingIndex(options.length)}
          onKeyDown={(e) => handleKeyDown(e, options.length)}
        >
          <span className="orbchoice-paint">
            {/* Outside the rotation on purpose — VB-60 rotates "through the
                available choices", and this is not one of them, it is the way
                out of the list. Its own cue is the pulse, and the pulse runs on
                the same life so everything in the group goes still together. */}
            <Orb
              gradient={childNodeGradient(options.length)}
              light={lights[options.length] ?? NEUTRAL_LIGHT}
              picked={false}
              add
              outlined={false}
              pulsing={running}
            />
            <span className="orbchoice-label">{S.addYourOwnOrb}</span>
          </span>
        </button>
      )}
    </div>
  );
}
