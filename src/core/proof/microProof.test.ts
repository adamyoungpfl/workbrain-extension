import { describe, expect, it } from 'vitest';
import { microProofTask } from './microProof';
import type { Answers } from '../../schema/storage.types';

function answers(partial: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...partial };
}

describe('the micro-proof task', () => {
  it('leans on a named person first — the name coming back is what lands', () => {
    const a = answers({ repeatables: { entities: [{ entity_name: 'Priya' }] } });
    expect(microProofTask(a)).toMatchObject({ rung: 'person', name: 'Priya' });
    expect(microProofTask(a).task).toContain('Priya');
  });

  it('falls to a named initiative when nobody has been named', () => {
    const a = answers({ repeatables: { initiatives_records: [{ initiative_name: 'Northstar' }] } });
    expect(microProofTask(a)).toMatchObject({ rung: 'initiative', name: 'Northstar' });
  });

  it('falls to their role', () => {
    const a = answers({ repeatables: { roles: [{ role_name: 'Head of Ops' }] } });
    expect(microProofTask(a)).toMatchObject({ rung: 'role', name: 'Head of Ops' });
    expect(microProofTask(a).task).toContain('Head of Ops');
  });

  it('falls to their own words about what they do', () => {
    const a = answers({ values: { self_description: 'I run the intake process.' } });
    expect(microProofTask(a).rung).toBe('self');
  });

  it('falls to the goal they named at question two', () => {
    const a = answers({ values: { goal_want: 'Write my Monday update.' } });
    expect(microProofTask(a)).toMatchObject({ rung: 'goal', task: 'Write my Monday update.' });
  });

  /**
   * NEVER AN APOLOGY. Somebody who skipped their way here still gets a real
   * errand — the file itself is what makes the answer good, and the last
   * rung needs nothing else.
   */
  it('always produces a task, even from an empty file', () => {
    const task = microProofTask(answers()).task;
    expect(task.length).toBeGreaterThan(10);
    expect(task).not.toContain('undefined');
  });

  it('ignores a record that exists but was never named', () => {
    const a = answers({
      repeatables: { entities: [{ entity_name: '  ' }], roles: [{ role_name: 'Head of Ops' }] },
    });
    expect(microProofTask(a).rung).toBe('role');
  });

  /**
   * THE FINDING THAT MOVED IT. At the SECOND run boundary — the end of About
   * Me, where P4 originally put this — `entities` and `initiatives_records`
   * have not been asked yet: they live in My World and Initiatives. So the
   * ladder could only ever reach its role rung there, and the review's own
   * example was unbuildable. Adam moved it to the end of My World.
   */
  it('reaches only the role rung on what About Me can have collected', () => {
    const asFarAsAboutMe = answers({
      values: { preferred_name: 'Ada', self_description: 'I run the intake process.' },
      repeatables: { roles: [{ role_name: 'Head of Ops' }] },
    });
    expect(microProofTask(asFarAsAboutMe).rung).toBe('role');

    // …and one module later, it can do what the review actually asked for.
    const afterMyWorld = answers({
      ...asFarAsAboutMe,
      repeatables: { ...asFarAsAboutMe.repeatables, entities: [{ entity_name: 'Priya' }] },
    });
    expect(microProofTask(afterMyWorld)).toMatchObject({ rung: 'person', name: 'Priya' });
  });
});
