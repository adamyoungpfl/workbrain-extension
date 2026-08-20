import { Beats, Button, FlowProgress } from '../components';
import type { Module } from '../../schema/flow.types';
import { S } from '../strings';
import './ModuleIntro.css';

/** The shape of one module's approved transition copy — see
 * src/panel/strings.ts's `moduleIntros`. Widened to a plain string-keyed
 * record here so a module id that has no transition copy is a `undefined`
 * this component can degrade on, rather than a type error at the call site. */
interface ModuleIntroCopy {
  beats: readonly string[];
  preview: readonly string[];
}
const MODULE_INTROS: Record<string, ModuleIntroCopy> = S.moduleIntros;

export function introCopyFor(moduleId: string): ModuleIntroCopy | undefined {
  return MODULE_INTROS[moduleId];
}

export interface ModuleIntroProps {
  module: Module;
  /** For the progress bar, which is computed by the caller — see Flow.tsx. */
  current: number;
  total: number;
  canGoBack: boolean;
  saveError: boolean;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * V1.1 VB-05 — the screen between two modules.
 *
 * Shown once, immediately before a module nobody has answered anything in
 * yet, and never before the first module. Which is entirely a derivation over
 * `wb:answers` — see core/flow/runner.ts's `findPosition`. **This screen
 * writes nothing.** There is no question on it, so there is nothing to
 * record; continuing advances the panel's own ephemeral viewing/history
 * state, the same mechanism Back already uses. Storing a "seen this
 * transition" marker would break docs/ARCHITECTURE.md's "nothing derived is
 * stored", and would be the sort of thing that then has to be migrated
 * forever.
 *
 * Two parts, both approved verbatim in docs/V1.1-COPY-DRAFT.md:
 *
 * - **The beats**, played at reading pace by the shared `Beats` renderer —
 *   the same mechanic `architecture_orientation` uses, not a second one.
 * - **The preview**, in ReadOnlyBlock's visual language: what this module's
 *   answers actually change downstream. It is *not* a `ReadOnlyBlock`,
 *   because that component carries a copy-to-clipboard control and there is
 *   nothing here a person would ever paste into their AI. Adding a control
 *   that copies a marketing line would be noise, and every control on screen
 *   has to earn its 44×44.
 *
 * The preview does not wait for the beats to finish. It is a stable block
 * rather than a fourth timed beat, so nothing on this screen moves under a
 * person mid-read, the panel does not reflow when a beat swaps, and a screen
 * reader gets it at the same moment everyone else does.
 */
export function ModuleIntro({
  module,
  current,
  total,
  canGoBack,
  saveError,
  onBack,
  onContinue,
}: ModuleIntroProps) {
  const copy = introCopyFor(module.id);

  return (
    <form
      className="flow modintro"
      data-position="module-intro"
      data-module-id={module.id}
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      {saveError && (
        <div role="alert" className="flow-error">
          {S.errSaveFailed}
        </div>
      )}
      <FlowProgress title={module.title} current={current} total={total} />
      {/* No authored copy for this module: the module's own title (in the bar
          above) and the way forward are still both here. Degrade, never
          break — docs/GUARDRAILS.md. A test asserts this never happens for
          the shipped flow. */}
      {copy && <Beats beats={copy.beats} />}
      {copy && copy.preview.length > 0 && (
        <div className="modintro-preview">
          {copy.preview.map((line, i) => (
            <p className="modintro-preview-line" key={i}>
              {line}
            </p>
          ))}
        </div>
      )}
      <footer className="flow-foot">
        {canGoBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            {S.back}
          </Button>
        )}
        {/* The existing, approved word for "carry on" — every other screen's
            primary button says it, and this screen is not doing anything
            different enough to deserve a word of its own. */}
        <Button type="submit" variant="primary">
          {S.next}
        </Button>
        <span className="flow-save">
          <span>{S.savedNote}</span>
          <span>{S.privacyNote}</span>
        </span>
      </footer>
    </form>
  );
}
