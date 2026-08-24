/**
 * V1.6 VB-33 — a section's label, split into its number and its name.
 *
 * The file's own section titles carry their ordering in the text: "1. About
 * This Context", "2.1 Roles". That is correct for the generated Markdown, where
 * the number IS the heading, and it is the reason VB-33's reference screen can
 * ask for a numbered badge without any new data — the numeral is already there.
 *
 * WHAT THIS IS FOR. The list row prints the whole label, unchanged, and always
 * has (`tests/e2e/file-tree.spec.ts` asserts a resumed session shows every
 * label whole). What VB-33 changes is only how the two halves are *set*: the
 * numeral quiet, the name loud. Splitting is therefore a presentation concern
 * with a pure-string answer, which is exactly the sort of thing that belongs in
 * `core/` with a test rather than as a regex inlined in a component.
 *
 * NOTHING IS EVER DROPPED. `numeral + title` is byte-identical to the label it
 * came from — the separating space stays on the numeral — so a caller that
 * renders both halves renders the original string. A label with no leading
 * number returns an empty numeral and the whole label as its title, so an
 * outline that grows an unnumbered section still draws.
 */

/** "1. ", "10. ", "2.1 " — the file's own two numbering shapes, with the space
 * that follows kept, so the two halves rejoin exactly. */
const LEADING_NUMBER = /^\d+(?:\.\d+)?\.?\s+/;

export interface SectionLabelParts {
  /** "1. " or "2.1 ", trailing space included. Empty when there is no number. */
  numeral: string;
  /** Everything after it. The whole label when there is no number. */
  title: string;
}

export function splitSectionLabel(label: string): SectionLabelParts {
  const match = LEADING_NUMBER.exec(label);
  if (!match) return { numeral: '', title: label };
  return { numeral: match[0], title: label.slice(match[0].length) };
}

/**
 * The same split against a label that is only partly printed.
 *
 * The list types a row's name out character by character when its state changes
 * (FileTree.tsx's `useTypewriterOnChange`), so the string being rendered is a
 * PREFIX of the real one. Splitting the prefix on its own would mis-file a
 * half-typed "1." as a title, so the boundary is taken from the full label and
 * applied to however much of it has been revealed.
 */
export function splitRevealedSectionLabel(label: string, revealed: string): SectionLabelParts {
  const { numeral } = splitSectionLabel(label);
  return { numeral: revealed.slice(0, numeral.length), title: revealed.slice(numeral.length) };
}
