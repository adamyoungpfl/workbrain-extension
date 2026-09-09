# File Hub add-ons — scoped, not built

Adam's ruling on docs/OPEN.md #7 (2026-09-09): "let's scope format and the
parser as possible add ons." These are the scopes. Neither is scheduled;
either can be picked up as a slice.

## Add-on A — the reformat hand-off (an incompatible file, reshaped by THEIR AI)

**What it is.** When `readContextFile` rejects a file (wrong shape, not
unreadable), offer one more door on the rejection line: "Ask your AI to
reshape it." Pressing it copies a prompt that contains the person's pasted
file content and the target shape (the same section skeleton
`generateContextFile` writes), asking their AI to emit a Workbrain-shaped
Context.md they can download and bring back in.

**Why this shape.** GUARDRAILS: we never transmit and never run generative
work ourselves - the person's own AI does all reshaping, through the same
copy/paste seam every other hand-off uses. The prompt is visible before
sending, like R-16.

**Scope.**
- `core/files/reformatPrompt.ts` - pure: (fileText, skeleton) → prompt
  string. Unit-tested against the roundtrip fixtures.
- One rejection-line door in UploadSheet + one string family.
- No storage, no new permissions, no network. Degrades to the plain
  rejection when clipboard is unavailable.

**Acceptance.** A file that fails the parser shows the door; the copied
prompt contains the file verbatim and the target skeleton; a reshaped file
produced that way imports cleanly.

## Add-on B — the Skills.md parser

**What it is.** `parseSkillsFile` in core/files, the read-side twin of
`skillsFile.ts`'s generator, so a Skills.md travels IN through the File Hub
the way Context.md does (today skills import only as .workbrain-pack.json).

**Scope.**
- `core/files/parseSkills.ts` + roundtrip test (generate → parse →
  regenerate byte-stable, the contract parse.test.ts already proves for
  Context).
- `readSkillsFile` beside `readContextFile` in FileActions; the UploadSheet
  (or a picker step) telling the two apart by their own headers, never by
  filename alone.
- The File Hub's upload door accepts either; the replace-warning names
  which file it is about to replace.

**Acceptance.** A downloaded Skills.md re-imports losslessly; a
non-Workbrain .md still gets the calm rejection; Context import is
untouched.
