import { describe, it, expect } from 'vitest';
import { chooseFile, fileLock, fileToggle, firstLocked } from './toggle';
import type { FileToggleItem } from './toggle';
import { fileSlots } from './slots';
import type { FileSlot } from './slots';

/**
 * V1.8 VB-47 — the toggle's rules, without a browser.
 *
 * The two that matter and that a rendering test could not prove on its own:
 *
 * 1. A LOCKED FILE IS NOT ENTERABLE. `chooseFile` refuses the move, whatever
 *    the surface does with the press.
 * 2. THE TOGGLE AND THE SHELF AGREE. `fileLock` is the same fold Home's own
 *    locked row prints, so the two cannot word the same file differently.
 *
 * And one that only a test can reach today: what happens when a SECOND file is
 * open. Only Context is built (`slots.ts`'s `BUILT`), so the day Skills ships
 * is the day switching first really moves — the rule is written and proved now
 * rather than discovered then.
 */

function item(id: FileToggleItem['id'], over: Partial<FileToggleItem> = {}): FileToggleItem {
  return { id, shown: false, lock: null, ...over };
}

function slot(over: Partial<FileSlot> = {}): FileSlot {
  return { id: 'skills', state: 'locked', after: 'context', afterFinished: false, ...over };
}

describe('fileLock — what a locked file may truthfully claim', () => {
  it('is nothing at all for a file that is open', () => {
    expect(fileLock(slot({ id: 'context', state: 'open', after: null }))).toBe(null);
  });

  it('names the file before it while that file is unfinished', () => {
    expect(fileLock(slot())).toEqual({ kind: 'needs', file: 'context' });
    expect(fileLock(slot({ id: 'actions', after: 'skills' }))).toEqual({ kind: 'needs', file: 'skills' });
  });

  /**
   * THE BOUNDARY THE SHELF ALREADY DEFENDS (V1.7 VB-36). "Finish Context.md
   * first" is true right up until somebody finishes Context.md, after which it
   * reads as an instruction they have already carried out. From then on the
   * only true thing left to say is that the file is not built yet.
   */
  it('swaps to "not built yet" the moment the file before it is finished', () => {
    expect(fileLock(slot({ afterFinished: true }))).toEqual({ kind: 'later' });
  });

  it('has nothing to wait on when there is no file before it', () => {
    expect(fileLock(slot({ id: 'context', after: null }))).toEqual({ kind: 'later' });
  });

  it('says exactly what the shelf says, slot for slot', () => {
    // The same fold, over the same slots, as `Home.tsx` prints. If these two
    // ever diverge the product has two opinions about one file.
    for (const finished of [{}, { context: true }, { context: true, skills: true }]) {
      for (const entry of fileSlots(finished)) {
        const lock = fileLock(entry);
        if (entry.state === 'open') expect(lock).toBe(null);
        else if (entry.after && !entry.afterFinished) expect(lock).toEqual({ kind: 'needs', file: entry.after });
        else expect(lock).toEqual({ kind: 'later' });
      }
    }
  });
});

describe('fileToggle — one item per file', () => {
  it('is the three files in build order, whichever one is shown', () => {
    expect(fileToggle('context', {}).map((entry) => entry.id)).toEqual(['context', 'skills', 'actions']);
  });

  it('marks exactly one of them as the file on screen', () => {
    const items = fileToggle('context', {});
    expect(items.filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['context']);
  });

  it('locks the two files that are not built, and unlocks Context', () => {
    const items = fileToggle('context', {});
    expect(items.map((entry) => entry.lock === null)).toEqual([true, false, false]);
  });

  it('finishing the file before it now UNLOCKS Skills — V2.2, the promise kept', () => {
    // Until V2.2 this test pinned the opposite: finished Context still left
    // Skills at {kind:'later'}, because the Skills interview did not exist.
    // It does now, so "Finish Context.md first" finally does what it says.
    expect(fileToggle('context', {}).find((entry) => entry.id === 'skills')!.lock).toEqual({
      kind: 'needs',
      file: 'context',
    });
    expect(fileToggle('context', { context: true }).find((entry) => entry.id === 'skills')!.lock).toBeNull();
    // Actions stays locked either way — it is derived, never entered
    // (docs/V2.2-SKILLS-ACTIONS-DECISIONS.md #1).
    expect(fileToggle('context', { context: true }).find((entry) => entry.id === 'actions')!.lock).not.toBeNull();
  });
});

describe('chooseFile — a locked file is not enterable', () => {
  const today = fileToggle('context', {});

  it('refuses a locked file and leaves the current one on screen', () => {
    expect(chooseFile('context', 'skills', today)).toBe('context');
    expect(chooseFile('context', 'actions', today)).toBe('context');
  });

  it('refuses a file that is not on the toggle at all, silently', () => {
    // Degrades to no move rather than to an error — docs/GUARDRAILS.md.
    expect(chooseFile('context', 'skills', [item('context', { shown: true })])).toBe('context');
  });

  it('picking the file already on screen is not a change', () => {
    expect(chooseFile('context', 'context', today)).toBe('context');
  });

  /** The day Skills.md is built. The rule is the same one, and the move it
   * refuses today is the move it makes then. */
  it('moves to an open file, and back again', () => {
    const both = [item('context', { shown: true }), item('skills'), item('actions', { lock: { kind: 'later' } })];
    expect(chooseFile('context', 'skills', both)).toBe('skills');
    expect(chooseFile('skills', 'context', both)).toBe('context');
    expect(chooseFile('skills', 'actions', both)).toBe('skills');
  });
});

describe('firstLocked — the file the strip explains by default', () => {
  it('is the next one along, so the line says what is coming and what brings it', () => {
    expect(firstLocked(fileToggle('context', {}))!.id).toBe('skills');
  });

  it('is nothing at all when every file is open', () => {
    expect(firstLocked([item('context', { shown: true }), item('skills')])).toBe(null);
  });
});
