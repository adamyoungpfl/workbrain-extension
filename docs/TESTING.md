# Testing an MV3 extension

Three layers. Most of the value is in the first, which needs no browser at all —
that is the whole reason `core/` is pure.

## 1. Unit — `npm run test`

Vitest over `src/core/**`. Fast, no browser, no mocks of `chrome.*` because `core/`
never touches it.

Must have tests, with exact expected values against fixtures:

- `core/files` — **round-trip property test**: `parse(generate(a)) ≈ a` over generated answer
  sets. This is the backup story; if it regresses, people lose their file.
- `core/audit/signals` — every metric asserted against `tests/fixtures/chatgpt-export.sample.json`,
  whose expected values are documented in `tests/fixtures/EXPECTED.md`.
- `core/audit/parsers/*` — each parser normalises its fixture to the same `Conversation[]`.
- `core/freshness` — durability answer + elapsed time → due/not-due, at boundaries.
- `core/storage/migrations` — every migration, forward from every prior version, including
  the failure path that restores from the pre-migration export.
- `core/packs/verify` — schema rejection cases: unknown field, oversized body, `http:` URL,
  HTML in a body, a slot path that escapes the answers object.
- `core/report/metrics` — including `n < 10` producing "too early to say" rather than a number.

## 2. Component — `npm run test`

Vitest + jsdom over `src/panel/components`. Each component asserts its states
(default / hover / focus / disabled / loading) and its accessible name and role.

The cue engine gets its own test: given a chain, firing the `until` events in order advances
exactly one link at a time, and firing an unrelated event advances nothing.

## 3. Integration — `npm run e2e`

Playwright, loading the built extension. The pattern:

```ts
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
  ],
});
// resolve the generated extension id from the service worker
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
```

**Driving the side panel.** Playwright cannot open Chrome's panel chrome directly. Open the
panel document as an ordinary page instead — `chrome-extension://<id>/panel.html` — which runs
the same code with the same APIs. Set the viewport to 400px wide so layout assertions are real.
Reserve true panel-opening for a manual smoke checklist.

**Test hooks in the DOM.** `Flow.tsx` (R1-06) renders `data-position="step" | "add-another"` and
`data-step-id="<id>"` on its root `<form>` — not user-facing, purely so a spec can tell apart two
things that render identically (a real `yesno` question and an "add another?" prompt both show as
two pills, Yes/No) without guessing from text content, and can drive a full pass generically
instead of hardcoding question wording (`tests/e2e/flow.spec.ts` does this — it imports
`contextModules` directly rather than hardcoding order/count). Extend this pattern rather than
inventing a new one per surface — e.g. a future Reflect-step spec should get its own
`data-position="reflect"`, not a fresh ad hoc hook.

Integration must cover:
- A full pass through the Context interview to a generated file, keyboard only. (R1-06 covers the
  keyboard-only pass itself; "to a generated file" completes once R1-09/R1-10 exist.)
- Import of a file previously exported, producing the same answers.
- A site whose composer selector is missing: the posture silently falls back to manual and
  **no error is shown**. Assert the absence of an error, explicitly.
- A pack fetch that 404s: the last good pack still renders.

## 4. Accessibility — `npm run a11y`

`@axe-core/playwright` over each panel surface at 400px and at 200% zoom, plus:
- every control ≥ 44×44
- focus visible on every focusable element after a full Tab pass
- `prefers-reduced-motion: reduce` — cues render their still form and are still visible

## What not to test

Do not snapshot-test markup. Do not test that a colour equals a hex. Do not mock `chrome.*`
deeply — if a test needs an elaborate `chrome` mock, the logic is in the wrong layer.
