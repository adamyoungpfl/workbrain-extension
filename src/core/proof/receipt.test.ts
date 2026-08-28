import { describe, expect, it } from 'vitest';
import { buildProofReceipt, proofReceiptName } from './receipt';

const base = {
  task: 'Draft a short update to my manager.',
  before: 'Hi [Manager], I wanted to give you an update.',
  after: 'Priya — Northstar is through migration testing.',
  ticked: ["Used Priya's name", 'Knew Northstar is mine'],
  of: 4,
  on: '27 August 2026',
};

describe('the proof receipt', () => {
  it('holds the ask and both answers, verbatim', () => {
    const md = buildProofReceipt(base);
    expect(md).toContain('Draft a short update to my manager.');
    expect(md).toContain('Hi [Manager], I wanted to give you an update.');
    expect(md).toContain('Priya — Northstar is through migration testing.');
  });

  it('reads in the order somebody reads it back: ask, before, after, count', () => {
    const md = buildProofReceipt(base);
    expect(md.indexOf('What I asked')).toBeLessThan(md.indexOf('without my file'));
    expect(md.indexOf('without my file')).toBeLessThan(md.indexOf('with my file'));
    expect(md.indexOf('with my file')).toBeLessThan(md.indexOf('got right'));
  });

  it('lists what they ticked, and says who judged it', () => {
    const md = buildProofReceipt(base);
    expect(md).toContain("- Used Priya's name");
    expect(md).toContain('- Knew Northstar is mine');
    expect(md).toContain('**2 of 4**, judged by me — Workbrain never read either answer.');
  });

  it('says so plainly when nothing was ticked', () => {
    const md = buildProofReceipt({ ...base, ticked: [] });
    expect(md).toContain('_Nothing ticked._');
    expect(md).toContain('**0 of 4**');
  });

  /**
   * DEGRADE, NEVER BREAK. Somebody can reach the end having skipped an
   * errand — proof.spec.ts walks exactly that — and a receipt with an empty
   * heading under it reads like a broken file rather than an honest one.
   */
  it('names a missing answer rather than leaving a hole', () => {
    const md = buildProofReceipt({ ...base, before: '', after: '   ' });
    expect(md).toContain('_Not captured._');
    expect(md).not.toMatch(/\n\n\n\n/);
  });

  it('stamps the date it was made, and says where it was made', () => {
    expect(buildProofReceipt(base)).toContain('_27 August 2026 · made with Workbrain, on this machine._');
  });

  it('names the file so two of them sort', () => {
    expect(proofReceiptName('27 August 2026')).toBe('Workbrain proof — 27 August 2026.md');
    expect(proofReceiptName('27 August 2026').endsWith('.md')).toBe(true);
  });
});
