# Dependencies

Every runtime dependency is a thing that can break in six months, get a CVE, or quietly start
phoning home. This product's whole claim is that nothing leaves the browser, and each package
is one more place that could stop being true.

## Runtime — 2

| Package | Why |
|---|---|
| `react` | The panel is a small app with real state. Also the reason the existing interview logic ports rather than gets rewritten. |
| `react-dom` | Required by the above. |

That is the list. **Adding a third requires a decision, recorded here, with a reason that
survives the question "could we write this in 40 lines?"**

## Explicitly rejected

| Package class | Instead |
|---|---|
| Date library | `Intl.DateTimeFormat` and plain arithmetic. Freshness needs day counts, not calendars. |
| Icon set | Inline SVG. There are about twenty icons in the whole product. |
| Markdown renderer | Skill pack bodies render as **text**. A renderer is an HTML-injection surface on untrusted third-party content — see `src/schema/PACKS.md`. |
| Animation library | Four cues, all CSS keyframes. |
| State manager | Derived state and `useReducer`. Nothing here is complex enough. |
| Analytics / error reporting | Forbidden — see `docs/GUARDRAILS.md`. |
| UI kit / component library | The design system is nine components and they are specified. |

## Build-time notes

`ajv` validates skill packs against the JSON Schema. It is dev-only for schema compilation;
the compiled validator ships, the compiler does not.
