# Skill packs — fetch and trust rules

A pack is **third-party content fetched over the network**. Treat every field as hostile input.

## Fetch

- HTTPS only. Reject `http:`, `file:`, `data:`, and anything with credentials in the URL.
- Hard size cap: **512 KB**. Abort the stream past it.
- Timeout 10s. On failure keep the last good cached copy and say nothing unless the person is
  looking at the pack screen.
- Check at most once per 24h per pack, and on explicit "check for updates".
- Send no identifying headers. No cookies (`credentials: 'omit'`). The publisher learns that
  *someone* fetched, and nothing else.

## Validate

- Validate against `skillpack.schema.json` before anything else. Reject the whole pack on failure —
  never partially apply.
- `additionalProperties: false` everywhere is deliberate. An unknown field means a newer format
  we do not understand; refuse it and prompt to update the extension.

## Render

- `body` is Markdown, rendered as **text**. No HTML parsing, no `dangerouslySetInnerHTML`,
  no `innerHTML`, no `eval`, no `new Function`, no template engine that executes.
- Slots are substituted by plain string replacement of `{{key}}`. A slot value never becomes markup.
- `from` paths resolve against the person's local answers **in the panel**. The pack never receives them.

## Apply

- An update is **offered**, never applied silently. Show what changed: skills added, removed, edited.
- Pack skills are read-only and marked in `Skills.md` as belonging to the pack. "Make my own copy"
  is an explicit action that detaches it.
- Unsubscribing removes pack skills and leaves everything the person wrote. This is the same
  mechanism as "take it with you" on a job change.

## What packs cannot do

Read anything. Report anything. Require anything. Expire. Lock a person out of their own file.
Data flows down only.
