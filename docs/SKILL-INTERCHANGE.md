# Skill interchange — ids, versions, provenance, and the one format

Spec only — nothing here is built. Green-lit 2026-08-26 as NORTH-STAR.md's queued spike: the
schema that must exist BEFORE the skills library and before any further skills features, so a
hand-built skill and a library skill are the same shape from day one, and nobody's hand-built
skills need a painful migration later.

Grounded in the shipped code, not an imagined version of it:
- A skill is a repeatable record in `wb:answers:skills` — fields `skill_name`, `skill_trigger`,
  `skill_inputs`, `skill_tools`, `skill_data_home`, `skill_steps`, `skill_output`,
  `skill_autonomy`, `skill_owner` (core/flow/skillsSource.ts).
- Its stamps are compound keys `skills#<index>#<field>` in `answeredAt` (core/files/restore.ts).
- Skills.md prints a record as `## <name>` + Trigger/Inputs/Tools/Steps/Output;
  `data_home`/`autonomy`/`owner` deliberately do not print (core/files/skillsFile.ts) — they
  feed the derived Actions.md instead.
- `src/core/storage/migrations.ts` is forward-only and empty at SCHEMA_VERSION = 1 — the
  id-minting migration below has a ready home.

## The one deep hazard this spec exists to close

**Skill identity is positional today.** `skills#0#skill_steps` means "field of whichever record
is currently first." Delete or reorder a record and every later record's stamps describe the
wrong skill. Harmless in one store on one device; fatal for sync (merge needs to know WHICH
skill changed), for the library (updates need to find their skill), and for dedup on re-import.

## Principles

1. **One format.** The pack format IS the interchange format — library skills, shared skills,
   portal-synced skills, and a person's own exported skills all travel in the same envelope.
   There is no second schema to drift.
2. **Skills.md stays the human/AI-facing rendering.** The file's voice is the product; the
   envelope is machinery. The file never grows machine noise for authored skills.
3. **Everything GUARDRAILS says about packs stands**: data, never code; hostile input; markdown
   rendered as text; fetched, never pushed; degradation keeps the last good copy.
4. **No product nouns on screen.** Nobody sees "id", "version", "schema", or "pack". They see
   "your skills", "shared skills", "from the library".

## Identity

- Every skill gets a minted id at record creation: `skl_` + 10 lowercase base32 chars from
  `crypto.getRandomValues` (no dependency, no timestamp — Date-free by the same reasoning the
  workflow rules use). The NAME is display; the ID is identity. Renaming never re-mints.
- The id lives beside the record, not inside its answer fields: `wb:answers:skills` grows a
  parallel `recordIds: { skills: string[] }` (index-aligned with `repeatables.skills`).
  **Deliberately NOT a re-key of the compound stamps**: the positional keys are load-bearing
  across restore/sectionHealth/multiples, and re-keying them is a migration with a blast radius.
  The alignment invariant (ids array length === records array length, maintained by every
  add/remove) is cheap and testable; the EXPORT layer translates position → id.
- Migration (SCHEMA_VERSION 2): mint ids for existing records, index-aligned. Forward-only,
  pre-migration export written first (GUARDRAILS' migration law).

## Versions

- Per skill: `rev` (integer, bumps on any field commit) + `updatedAt` (already derivable —
  latest compound stamp; recorded denormalized in the envelope only, never stored derived).
- Per pack: the publisher's `version` (integer) + `publishedAt`. A pack update that touches a
  skill bumps that skill's own `rev` within the pack.
- Merge law (sync, later): per-field latest-wins using the compound stamps the store already
  keeps, matched ACROSS devices by skill id, never by index. Deletion travels as a tombstone —
  `deleted: [{ id, at }]` — because an absent record is indistinguishable from a never-synced
  one. Tombstones live in the same store key, capped (keep newest 100).

## Provenance — referenced vs copied (OPEN.md #3, confirmed)

Every skill carries `origin`, one of:
- `{ kind: 'authored' }` — built here. The default; prints nothing anywhere.
- `{ kind: 'referenced', packId, skillId, packVersion, publisher }` — a library skill added to
  the profile. **Read-only in the interview** (the pack's method stays the pack's), rendered
  into Skills.md like any skill, and its cached body updates when the pack updates (silently,
  degradation law: keep last good on fetch failure). "Make my own copy" is the one explicit
  action on it.
- `{ kind: 'copied', fromPackId, fromSkillId, atPackVersion }` — a fork. Fully editable, never
  auto-updated again; the trail says where it came from and nothing more.

## The envelope (`workbrain-pack@1`)

```json
{
  "format": "workbrain-pack@1",
  "pack": { "id": "pak_…", "name": "…", "publisher": "…", "version": 3, "publishedAt": "…" },
  "skills": [
    {
      "id": "skl_…",
      "rev": 7,
      "updatedAt": "2026-08-26T…Z",
      "origin": { "kind": "authored" },
      "body": {
        "skill_name": "…", "skill_trigger": "…", "skill_inputs": "…", "skill_tools": "…",
        "skill_data_home": "…", "skill_steps": "…", "skill_output": "…",
        "skill_autonomy": "…", "skill_owner": "…"
      }
    }
  ],
  "deleted": []
}
```

- `body` keys are EXACTLY the interview's field ids — one vocabulary, no mapping table to rot.
  A field the reader doesn't know is preserved on round-trip, never dropped (forward compat);
  a `format` it doesn't know is refused whole, with the existing "couldn't read that one" voice.
- A personal export is the same envelope with a `pack` of
  `{ "id": "self", "publisher": "self" }` — which is what the portal exchanges for sync, and
  what "share a skill with a teammate" attaches. One format.
- Validation at ingest (hostile input): refuse non-JSON, cap every string (name 200 chars, body
  fields 10k), cap skills per pack (100), strip nothing silently — a skill that fails caps is
  reported by name, the rest import.

## What Skills.md prints (and does not)

- Authored and copied skills: unchanged, byte-for-byte what ships today.
- Referenced skills add ONE trailing line to their block — `*(a shared skill, from <publisher>)*`
  `[DRAFT]` — human-meaningful, AI-meaningful (the AI should know a method is inherited), and
  enough for the parser to keep referenced skills out of the editable set on re-import.
- Re-import matching: by name for authored skills (today's behavior, unchanged), by the
  provenance line for referenced ones. Ids do NOT print in the file — the file is for people and
  their AIs; identity for machines travels in the envelope.

## Explicitly out of scope (build later, against this spec)

The library UI and fetch pipeline; the member key; the portal sync loop; the tombstone GC; any
server. Nothing in this spec requires them — and none of them requires changing this spec's
shapes, which is the point.

## The next buildable slice, when updates resume

SCHEMA_VERSION 2 (mint `recordIds`), the alignment invariant + tests, and `exportSkillsPack` /
`importSkillsPack` in core (pure, envelope ↔ store, with the validation caps) — small, testable,
and it makes every skill a person builds from that day forward library-ready.
