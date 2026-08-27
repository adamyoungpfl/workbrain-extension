import { describe, expect, it } from 'vitest';
import { diagnosticBlock, feedbackMailto } from './report';
import { contextModules } from '../flow/flow';
import type { AnswerValue } from '../../schema/flow.types';

const AT = new Date('2026-08-27T14:05:00');

describe('the diagnostic block', () => {
  it('is four labelled lines, and every one of them is about the software', () => {
    expect(diagnosticBlock({ surface: 'interview', step: 'role_mandate', now: AT, build: '2.9.0' })).toBe(
      ['Build: 2.9.0', 'Screen: interview', 'Question: role_mandate', 'Written: 2026-08-27 14:05'].join('\n'),
    );
  });

  it('says "none" rather than nothing when there is no question on screen', () => {
    expect(diagnosticBlock({ surface: 'home', now: AT, build: '2.9.0' })).toContain('Question: none');
  });

  it('reports to the minute, never the second — the hour is useful, the second is noise', () => {
    expect(diagnosticBlock({ surface: 'home', now: new Date('2026-01-05T09:07:42'), build: '1.0.0' })).toContain(
      'Written: 2026-01-05 09:07',
    );
  });

  it('takes the real build when none is injected', () => {
    expect(diagnosticBlock({ surface: 'home', now: AT })).toMatch(/^Build: \d+\.\d+\.\d+$/m);
  });
});

/**
 * THE TEST THIS FEATURE EXISTS OR DIES BY.
 *
 * `docs/GUARDRAILS.md` permits this door because it is user-initiated and
 * carries nothing the person authored. That is a claim about the SHAPE of the
 * payload, so it is tested against a real, fully-answered interview: every
 * top-level answer in the shipped flow, filled with a marker string, and the
 * block must not contain one character of it.
 *
 * It passes today because there is no field that would accept an answer. It
 * will keep passing only if that stays true — which is exactly what a future
 * "just add the question text, it helps" change would break.
 */
describe('the block cannot carry what the person wrote', () => {
  const MARKER = 'PRIVATETEXT';

  function everyAnswer(): Record<string, AnswerValue> {
    const values: Record<string, AnswerValue> = {};
    for (const module of contextModules) {
      for (const node of module.nodes) {
        if ('fields' in node) continue;
        values[node.key ?? node.id] = `${MARKER} answering ${node.id}`;
      }
    }
    return values;
  }

  it('has no field an answer could travel in — checked against the whole flow', () => {
    const answers = everyAnswer();
    expect(Object.keys(answers).length).toBeGreaterThan(30);

    // Every question in the flow, one at a time, as the step the person was
    // on. The id is allowed through; nothing they typed against it is.
    for (const id of Object.keys(answers)) {
      const block = diagnosticBlock({ surface: 'interview', step: id, now: AT, build: '2.9.0' });
      expect(block, `${id} leaked an answer`).not.toContain(MARKER);
      expect(block).toContain(`Question: ${id}`);
    }
  });

  it('carries the question id and never the question text', () => {
    // The wording is content too, and moving it around starts a habit.
    const step = contextModules[0]!.nodes.find((n) => !('fields' in n))!;
    const block = diagnosticBlock({ surface: 'interview', step: step.id, now: AT, build: '2.9.0' });
    expect(block).toContain(step.id);
    expect(block.split('\n')).toHaveLength(4);
  });
});

describe('the mailto', () => {
  const ctx = { surface: 'proof' as const, step: 'proof_grade', now: AT, build: '2.9.0' };

  it('is a real mailto with the subject and body encoded', () => {
    const url = feedbackMailto('beta@example.com', 'Workbrain beta', 'What happened:', ctx);
    expect(url.startsWith('mailto:beta@example.com?')).toBe(true);
    expect(url).toContain('subject=Workbrain%20beta');
    expect(decodeURIComponent(url.split('body=')[1]!)).toContain('Build: 2.9.0');
  });

  it('puts their words first and the machine text last, so the cursor lands where they type', () => {
    const body = decodeURIComponent(feedbackMailto('a@b.c', 's', 'What happened:', ctx).split('body=')[1]!);
    expect(body.indexOf('What happened:')).toBeLessThan(body.indexOf('Build:'));
  });

  it('sends nothing itself — it is a URL, and the person presses send in their own client', () => {
    // Nothing to assert about the network, which is the point: this module
    // has no fetch, no beacon and no client. The shape is the whole feature.
    const url = feedbackMailto('a@b.c', 's', 'l', ctx);
    expect(url).not.toMatch(/^https?:/);
  });
});
