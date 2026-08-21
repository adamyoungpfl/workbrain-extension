import { describe, it, expect } from 'vitest';
import { offListOptions } from './customOptions';
import type { Step } from '../../schema/flow.types';

const roleNames: Step = {
  id: 'role_names',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Roles?',
  kind: 'multi',
  key: 'role_names',
  allowCustom: true,
  options: [
    { v: 'employee', l: 'Employee' },
    { v: 'manager', l: 'Manager / Team Lead' },
  ],
};

const textStep: Step = { id: 'name', module: 1, section: 0, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'name' };

describe('offListOptions', () => {
  it('returns nothing when every selected value is one of the question\'s own options', () => {
    expect(offListOptions(roleNames, ['employee', 'manager'])).toEqual([]);
  });

  it('builds a pill for a value the question does not carry — the whole point', () => {
    expect(offListOptions(roleNames, ['employee', 'Board member'])).toEqual([
      { v: 'Board member', l: 'Board member' },
    ]);
  });

  it('labels it with the value itself, since an off-list value is words the person typed', () => {
    const [option] = offListOptions(roleNames, ['Scout leader']);
    expect(option?.v).toBe(option?.l);
  });

  it('keeps the answer\'s own order, so a just-added name lands at the end of the row', () => {
    expect(offListOptions(roleNames, ['Coach', 'employee', 'Board member']).map((o) => o.v)).toEqual([
      'Coach',
      'Board member',
    ]);
  });

  it('never repeats one, however many times it appears in the answer', () => {
    expect(offListOptions(roleNames, ['Coach', 'Coach'])).toEqual([{ v: 'Coach', l: 'Coach' }]);
  });

  it('is empty for a question with no options at all', () => {
    expect(offListOptions(textStep, ['anything'])).toEqual([]);
  });

  it('handles a single-select the same way — `allowCustom` is not multi-only', () => {
    const chips: Step = { ...roleNames, id: 'role_for', kind: 'chips', key: 'role_for' };
    expect(offListOptions(chips, ['My book club'])).toEqual([{ v: 'My book club', l: 'My book club' }]);
  });

  it('is empty for an empty answer', () => {
    expect(offListOptions(roleNames, [])).toEqual([]);
  });
});
