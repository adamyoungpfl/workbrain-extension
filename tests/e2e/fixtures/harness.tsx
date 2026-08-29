import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/panel/tokens.css';
import {
  Button,
  PillGroup,
  VerticalPick,
  Field,
  ReadOnlyBlock,
  FileRow,
  Banner,
  Meter,
  Toast,
  Sheet,
} from '../../../src/panel/components';
import { SCOPE_GLYPHS } from '../../../src/panel/components/choiceGlyphs';
import { CueAnnouncer, Pointer, useCueChain, useCueTarget } from '../../../src/panel/cues';
import type { CueLink } from '../../../src/schema/flow.types';

const CUE_LABEL_STYLE = {
  fontWeight: 700,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
};

/**
 * Combines two ref callbacks into one — used below so the demo's own text
 * field can serve as both the `focus` verb's target and the `point` verb's
 * anchor (the element the pointer overlay draws *from*). A test-fixture-only
 * helper; nothing in src/panel/** needs this today because nothing there
 * yet attaches two cue names to one node.
 */
function mergeRefs<T>(...refs: Array<(el: T | null) => void>): (el: T | null) => void {
  return (el) => refs.forEach((ref) => ref(el));
}

/**
 * R1-08's cue engine has no real content wired up anywhere yet (see the
 * module doc comment in src/panel/cues/engine.ts — deciding which real
 * question gets which cue is a separate, later decision). This demo exists
 * so npm run a11y and tests/e2e/cues.spec.ts have a real, driveable chain to
 * scan/exercise, the same reason the rest of this harness exists for the
 * R1-03 components before Home/Flow could compose them.
 */
function CueEngineDemo() {
  const chain: CueLink[] = useMemo(
    () => [
      { play: ['sweep:cue-demo-choices'], until: 'choice', say: 'Choose one of the three options.' },
      { play: ['ring:cue-demo-next'], until: 'next', say: 'Press Next.' },
      {
        play: ['focus:cue-demo-field', 'point:cue-demo-attach|Attach it here'],
        until: 'paste',
        say: 'Type in the field, then look for the highlighted target.',
      },
      { play: ['ringViolet:cue-demo-next', 'bob:cue-demo-download'], until: 'download', say: 'Nearly done — download when ready.' },
    ],
    [],
  );
  const { say, pointer, fire } = useCueChain(chain);

  const choiceRefA = useCueTarget<HTMLButtonElement>('cue-demo-choices');
  const choiceRefB = useCueTarget<HTMLButtonElement>('cue-demo-choices');
  const choiceRefC = useCueTarget<HTMLButtonElement>('cue-demo-choices');
  const nextRef = useCueTarget<HTMLButtonElement>('cue-demo-next');
  const fieldRef = useCueTarget<HTMLInputElement>('cue-demo-field');
  const anchorRef = useCueTarget<HTMLInputElement>('cue-anchor');
  const attachRef = useCueTarget<HTMLDivElement>('cue-demo-attach');
  const downloadRef = useCueTarget<HTMLButtonElement>('cue-demo-download');

  return (
    <section aria-label="Cue engine">
      <p style={CUE_LABEL_STYLE}>Cue engine (R1-08 demo — no real content wired up yet)</p>
      <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
        <button ref={choiceRefA} type="button" className="btn btn-secondary" data-testid="cue-choice-a" onClick={() => fire('choice')}>
          A
        </button>
        <button ref={choiceRefB} type="button" className="btn btn-secondary" data-testid="cue-choice-b" onClick={() => fire('choice')}>
          B
        </button>
        <button ref={choiceRefC} type="button" className="btn btn-secondary" data-testid="cue-choice-c" onClick={() => fire('choice')}>
          C
        </button>
      </div>
      <p style={{ margin: '0 0 12px' }}>
        <button ref={nextRef} type="button" className="btn btn-primary" data-testid="cue-next" onClick={() => fire('next')}>
          Next
        </button>
      </p>
      <div style={{ marginBottom: 12 }}>
        {/* A raw input rather than the <Field> component: Field.tsx doesn't
            forward a ref (nothing in src/panel/** needs one today), and
            this fixture needs the same node registered under two cue
            names at once (see mergeRefs above). Styled with Field.css's
            own `.field` class so it still looks and focuses like a real
            one. */}
        <label className="field-label" htmlFor="cue-demo-field">
          Cue demo field
        </label>
        <input
          id="cue-demo-field"
          className="field"
          data-testid="cue-field"
          placeholder="Type, then look for the pointer"
          onChange={() => fire('paste')}
          ref={mergeRefs(fieldRef, anchorRef)}
        />
      </div>
      <div
        ref={attachRef}
        data-testid="cue-attach"
        style={{
          border: '1px solid var(--border-i)',
          borderRadius: 'var(--r-md)',
          padding: '12px 14px',
          marginBottom: 12,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        Attach target
      </div>
      <p style={{ margin: 0 }}>
        <button ref={downloadRef} type="button" className="btn btn-secondary" data-testid="cue-download" onClick={() => fire('download')}>
          Download
        </button>
      </p>
      <CueAnnouncer text={say} />
      <Pointer state={pointer} />
    </section>
  );
}

const CROSS_SURFACE_CHAIN: CueLink[] = [
  { play: ['point:page.demo-composer|Ask it here'], until: 'next', say: 'This points at a live AI site — not reachable this release.' },
];

/**
 * A one-link chain that plays a `point` cue at a `page.*` target as soon as
 * it mounts — a live AI site's composer, which this release cannot reach
 * without a host permission it doesn't have (docs/RELEASE-1.md's
 * out-of-scope list). Exists so tests/e2e/cues.spec.ts can prove, in a real
 * browser and not just jsdom (Pointer.test.tsx already covers this case
 * there), that the whole path from a running chain through Pointer.tsx
 * really does render nothing for it, rather than throwing or — worse —
 * silently trying to point at the wrong, same-document element.
 */
function CrossSurfacePointerDemo() {
  const { pointer } = useCueChain(CROSS_SURFACE_CHAIN);
  return (
    <section aria-label="Cue engine — cross-surface point (no-op)" data-testid="cue-cross-surface">
      <Pointer state={pointer} />
    </section>
  );
}

/**
 * Not shipped in the panel bundle. Mounts every R1-03 component in its
 * varied states so npm run a11y has something real to scan — Home/Flow
 * don't exist to compose them until R1-06/R1-12. See tests/e2e/a11y.spec.ts.
 */
function Harness() {
  const [singlePill, setSinglePill] = useState<string[]>(['both']);
  const [multiPill, setMultiPill] = useState<string[]>(['drafting']);
  // V2.5 VB-118 — the vertical pick's tile grammar, in the harness for the
  // same reason the pills are: npm run a11y scans real markup here.
  const [tilePick, setTilePick] = useState<string[]>(['work']);
  const [notes, setNotes] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: 24 }}>
      <h1>Component harness</h1>
      <section aria-label="Button">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Button</p>
        <Button variant="primary">Start the interview</Button>
        <Button variant="secondary">Download the file</Button>
        <Button variant="ai">Put it in Claude</Button>
        <Button variant="quiet">Skip</Button>
        <Button variant="primary" disabled>
          Next
        </Button>
        <Button variant="secondary" size="sm">
          Small
        </Button>
      </section>

      <section aria-label="Pill">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Pill</p>
        <PillGroup
          legend="Work, home, or both?"
          mode="single"
          options={[
            { value: 'work', label: 'Work' },
            { value: 'home', label: 'Home' },
            { value: 'both', label: 'Both', suggested: true },
          ]}
          value={singlePill}
          onChange={setSinglePill}
          onAddOwn={() => {}}
        />
        <PillGroup
          legend="What do you use AI for?"
          mode="multi"
          options={[
            { value: 'drafting', label: 'Drafting' },
            { value: 'code', label: 'Code' },
          ]}
          value={multiPill}
          onChange={setMultiPill}
        />
      </section>

      <section aria-label="VerticalPick">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>VerticalPick</p>
        <VerticalPick
          legend="Are we building this primarily for your work, personal life, or both?"
          options={[
            { value: 'work', label: 'Work', glyph: SCOPE_GLYPHS.work },
            { value: 'personal', label: 'Personal', glyph: SCOPE_GLYPHS.personal },
            { value: 'both', label: 'Both', glyph: SCOPE_GLYPHS.both },
          ]}
          value={tilePick}
          onChange={setTilePick}
        />
      </section>

      <section aria-label="Field">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Field</p>
        <Field
          id="notes"
          label="What do you keep re-explaining?"
          as="textarea"
          value={notes}
          onChange={setNotes}
          help="However it comes out. We'll tidy it on the next screen."
        />
        <Field
          id="name"
          label="Your name"
          value=""
          onChange={() => {}}
          error="Add a name so the file has something to call you. First name is plenty."
        />
      </section>

      <section aria-label="ReadOnlyBlock">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>ReadOnlyBlock</p>
        <ReadOnlyBlock tag="Ask your AI this">Draft a status update for my manager.</ReadOnlyBlock>
      </section>

      <section aria-label="FileRow">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>FileRow</p>
        <FileRow
          name="Context.md"
          subtitle="Updated today · 10 of 10 sections"
          badge={{ label: 'Current', tone: 'fresh' }}
        />
        <FileRow
          name="Skills.md"
          subtitle="4 skills · 2 from your team"
          badge={{ label: '3 to review', tone: 'due' }}
        />
        <FileRow name="Actions.md" subtitle="Finish Skills.md first" locked />
      </section>

      <section aria-label="Banner">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Banner</p>
        <Banner headingLevel={2} title="Three parts of your file are out of date">
          Two questions brings it current.
        </Banner>
        <Banner headingLevel={2} variant="good" title="Your file is current">
          Nothing to do. Come back when something changes at work.
        </Banner>
        <Banner headingLevel={2} variant="info" title="A quick note">
          This is the info variant.
        </Banner>
      </section>

      <section aria-label="Meter">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Meter</p>
        <Meter
          value={46}
          name="How much of your work brain is set up"
          label="set up"
          step={{ current: 'Current: Repeat', spoken: 'Current: Repeat. Next Up: Act.' }}
          segments={[
            { label: 'Name', percent: 100 },
            { label: 'Repeat', percent: 35 },
            { label: 'Act', percent: 0 },
            { label: 'Share', percent: 50 },
          ]}
        />
      </section>

      <section aria-label="Toast">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Toast</p>
        <Toast message="Added to Context.md · updated today" />
      </section>

      <section aria-label="Sheet">
        <p style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>Sheet</p>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Capture a thought">
          <Field id="capture" label="What happened?" as="textarea" value="" onChange={() => {}} />
          <Button onClick={() => setSheetOpen(false)}>Save</Button>
        </Sheet>
      </section>

      <CueEngineDemo />
      <CrossSurfacePointerDemo />
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
}
