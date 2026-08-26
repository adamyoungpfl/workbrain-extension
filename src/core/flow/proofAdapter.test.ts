import { describe, it, expect } from 'vitest';
import type { FlowContext } from '../../schema/flow.types';
import { PROOF_SERVICES, BASELINE_PROMPT, evaluationPrompt } from './proofSource';
import {
  buildProofModule,
  serviceStepOptions,
  promptFor,
  proofServiceFor,
  attachHintFor,
  PROOF_BASELINE_ANSWER_KEY,
  PROOF_CONTEXT_ANSWER_KEY,
  PROOF_GRADE_TEXT_KEY,
  PROOF_SERVICE_KEY,
} from './proofAdapter';
import type { ProofCopy } from './proofAdapter';

const fixtureCopy: ProofCopy = {
  serviceOptions: serviceStepOptions([
    { key: 'chatgpt', label: 'ChatGPT' },
    { key: 'other', label: 'Something else' },
  ]),
  heading: 'Heading',
  pickAI: 'Pick AI',
  baselineQ: 'Baseline Q',
  withContextQ: 'With-context Q',
  gradeQ: 'Grade Q',
  doneQ: 'Done Q',
};

describe('serviceStepOptions', () => {
  it('maps key/label pairs to Option v/l', () => {
    expect(serviceStepOptions([{ key: 'x', label: 'X' }])).toEqual([{ v: 'x', l: 'X' }]);
  });
});

describe('buildProofModule — structure', () => {
  const module = buildProofModule(fixtureCopy);

  it('produces exactly five top-level nodes, no repeatables', () => {
    expect(module.nodes).toHaveLength(5);
    expect(module.nodes.every((n) => !('fields' in n))).toBe(true);
  });

  it('step 1 is the service picker — existing chips kind, no new rendering needed', () => {
    const step = module.nodes[0]!;
    expect('fields' in step).toBe(false);
    if ('fields' in step) throw new Error('unreachable');
    expect(step.kind).toBe('chips');
    expect(step.key).toBe(PROOF_SERVICE_KEY);
    expect(step.q).toBe('Heading');
    expect(step.hint).toBe('Pick AI');
    expect(step.options).toEqual(fixtureCopy.serviceOptions);
    expect(step.required).toBe(true);
  });

  it('steps 2-4 are kind "gen", each with a distinct genKey and outKey', () => {
    const [, baseline, withContext, grade] = module.nodes;
    if (!baseline || 'fields' in baseline) throw new Error('unreachable');
    if (!withContext || 'fields' in withContext) throw new Error('unreachable');
    if (!grade || 'fields' in grade) throw new Error('unreachable');

    expect(baseline.kind).toBe('gen');
    expect(baseline.genKey).toBe('baseline');
    expect(baseline.outKey).toBe(PROOF_BASELINE_ANSWER_KEY);
    expect(baseline.q).toBe('Baseline Q');

    expect(withContext.kind).toBe('gen');
    expect(withContext.genKey).toBe('withContext');
    expect(withContext.outKey).toBe(PROOF_CONTEXT_ANSWER_KEY);
    expect(withContext.q).toBe('With-context Q');

    expect(grade.kind).toBe('gen');
    expect(grade.genKey).toBe('grade');
    expect(grade.outKey).toBe(PROOF_GRADE_TEXT_KEY);
    expect(grade.q).toBe('Grade Q');
  });

  it('step 5 is kind "demo", the recommendations screen — no outKey, nothing to paste', () => {
    const step = module.nodes[4]!;
    if ('fields' in step) throw new Error('unreachable');
    expect(step.kind).toBe('demo');
    expect(step.genKey).toBe('recommendations');
    expect(step.outKey).toBeUndefined();
    expect(step.q).toBe('Done Q');
  });

  it('every step has a negative section — the proof loop is not part of the Context.md outline', () => {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      expect(node.section).toBeLessThan(0);
    }
  });

  it('the module itself is not required — reached by choice, not gated', () => {
    expect(module.required).toBe(false);
  });
});

describe('promptFor', () => {
  const emptyCtx: FlowContext = { answers: {}, repeatables: {} };

  it('"baseline" and "withContext" show the identical BASELINE_PROMPT, unchanged', () => {
    expect(promptFor('baseline', emptyCtx)).toBe(BASELINE_PROMPT);
    expect(promptFor('withContext', emptyCtx)).toBe(BASELINE_PROMPT);
    expect(promptFor('baseline', emptyCtx)).toBe(promptFor('withContext', emptyCtx));
  });

  it('an unknown/undefined genKey defaults to BASELINE_PROMPT rather than throwing', () => {
    expect(promptFor(undefined, emptyCtx)).toBe(BASELINE_PROMPT);
    expect(promptFor('nonsense', emptyCtx)).toBe(BASELINE_PROMPT);
  });

  it('"grade" builds the real evaluation prompt from whatever was pasted for baseline/with-context', () => {
    const ctx: FlowContext = {
      answers: { [PROOF_BASELINE_ANSWER_KEY]: 'Before text.', [PROOF_CONTEXT_ANSWER_KEY]: 'After text.' },
      repeatables: {},
    };
    expect(promptFor('grade', ctx)).toBe(evaluationPrompt('Before text.', 'After text.'));
  });

  it('"grade" degrades gracefully when baseline/with-context were skipped (null) or never answered', () => {
    const ctx: FlowContext = { answers: { [PROOF_BASELINE_ANSWER_KEY]: null }, repeatables: {} };
    const prompt = promptFor('grade', ctx);
    expect(prompt).toContain('[not captured]');
    expect(prompt).toBe(evaluationPrompt('', ''));
  });
});

/**
 * V2.3 VB-93 — the goal gate's whole payoff, CONFIRMED BINDING by Adam
 * (docs/V2.3-REFINEMENT.md): the gate must "fuel the baseline and prove it
 * at the end of the flow". When the interview's first questions captured a
 * goal, the proof asks THEIR question — never the canned line — in both
 * conditions, and the grader is told the truth about what was asked.
 */
describe('promptFor with a goal from the gate (VB-93)', () => {
  const goalCtx: FlowContext = {
    answers: { goal_want: 'Draft my Monday status update the way I would.' },
    repeatables: {},
  };

  it('the baseline IS their goal, verbatim, in both conditions', () => {
    expect(promptFor('baseline', goalCtx)).toBe('Draft my Monday status update the way I would.');
    expect(promptFor('withContext', goalCtx)).toBe(promptFor('baseline', goalCtx));
  });

  it('whitespace-padded goals are trimmed; empty or skipped goals fall back to the canned line', () => {
    const padded: FlowContext = { answers: { goal_want: '  Do the thing.  ' }, repeatables: {} };
    expect(promptFor('baseline', padded)).toBe('Do the thing.');
    const blank: FlowContext = { answers: { goal_want: '   ' }, repeatables: {} };
    expect(promptFor('baseline', blank)).toBe(BASELINE_PROMPT);
    const skipped: FlowContext = { answers: { goal_want: null }, repeatables: {} };
    expect(promptFor('baseline', skipped)).toBe(BASELINE_PROMPT);
  });

  it('the grade names their goal on the PROMPT USED line, not the canned one', () => {
    const ctx: FlowContext = {
      answers: {
        ...goalCtx.answers,
        [PROOF_BASELINE_ANSWER_KEY]: 'Before text.',
        [PROOF_CONTEXT_ANSWER_KEY]: 'After text.',
      },
      repeatables: {},
    };
    const prompt = promptFor('grade', ctx);
    expect(prompt).toContain('PROMPT USED: "Draft my Monday status update the way I would."');
    expect(prompt).not.toContain(BASELINE_PROMPT);
    expect(prompt).toBe(evaluationPrompt('Before text.', 'After text.', 'Draft my Monday status update the way I would.'));
  });

  it('evaluationPrompt without the new argument is byte-identical to before it existed', () => {
    expect(evaluationPrompt('a', 'b')).toBe(evaluationPrompt('a', 'b', BASELINE_PROMPT));
  });
});

describe('one service answer, not two (VB-93)', () => {
  it("the pick-a-service screen skips itself when the gate already asked", () => {
    const service = buildProofModule(fixtureCopy).nodes[0];
    if (service === undefined || !('kind' in service) || service.kind !== 'chips') throw new Error('expected the chips step first');
    expect(service.skipIf?.({ answers: {}, repeatables: {} })).toBeFalsy();
    expect(service.skipIf?.({ answers: { goal_service: 'claude' }, repeatables: {} })).toBe(true);
  });

  it('proofServiceFor prefers the proof pick, falls back to the gate, then to nothing', () => {
    expect(proofServiceFor({ answers: { [PROOF_SERVICE_KEY]: 'chatgpt', goal_service: 'claude' }, repeatables: {} })).toBe('chatgpt');
    expect(proofServiceFor({ answers: { goal_service: 'claude' }, repeatables: {} })).toBe('claude');
    expect(proofServiceFor({ answers: {}, repeatables: {} })).toBeUndefined();
  });
});

describe('attachHintFor', () => {
  it("returns a known service's exact attachTip plus the fixed fallback sentence", () => {
    const claude = PROOF_SERVICES.find((s) => s.key === 'claude')!;
    expect(attachHintFor('claude')).toBe(
      `${claude.attachTip} Or just paste Context.md’s text directly if you don’t see one.`,
    );
  });

  it('falls back to the "other" tip for an unknown or unselected service, never throws', () => {
    const other = PROOF_SERVICES.find((s) => s.key === 'other')!;
    expect(attachHintFor(undefined)).toBe(attachHintFor('other'));
    expect(attachHintFor('not-a-real-service')).toContain(other.attachTip);
  });
});

describe('PROOF_SERVICES — key order matches manifest.config.ts optional_host_permissions', () => {
  // Independently read from manifest.config.ts (not derived from proofSource.ts):
  // 'https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*',
  // 'https://copilot.microsoft.com/*' — in that order, plus the generic "other" this
  // extension deliberately has no host permission for.
  const manifestOrigins = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com'];

  it('the first four keys correspond 1:1, in order, to the four named AI origins', () => {
    expect(PROOF_SERVICES).toHaveLength(5);
    PROOF_SERVICES.slice(0, 4).forEach((service, i) => {
      expect(manifestOrigins[i]).toContain(service.key === 'chatgpt' ? 'chatgpt' : service.key);
    });
    expect(PROOF_SERVICES.map((s) => s.key)).toEqual(['chatgpt', 'claude', 'gemini', 'copilot', 'other']);
  });

  it('the fifth is the generic "other" fallback, with no corresponding host permission', () => {
    expect(PROOF_SERVICES[4]?.key).toBe('other');
  });
});

describe('verbatim spot-checks — independently re-typed from reading modelcitizen/src/components/WorkBrainContextInterview.tsx, not derived from proofSource.ts', () => {
  it('BASELINE_PROMPT (source line 397) is byte-identical', () => {
    expect(BASELINE_PROMPT).toBe('Draft a status update for my manager.');
  });

  it('the five-point grading rubric inside evaluationPrompt() (source lines 434-450) is byte-identical, including point 5 verbatim', () => {
    const prompt = evaluationPrompt('BEFORE_X', 'AFTER_Y');
    expect(prompt).toContain(
      'I ran the exact same prompt through an AI twice — once with nothing loaded, once with my personal Context.md file loaded. Here are both answers. Evaluate them side by side:',
    );
    expect(prompt).toContain(
      '1. Which answer is more specific to my actual role, team, and standards — and which parts prove it.',
    );
    expect(prompt).toContain('2. Which answer would need the least editing before I could send it as-is.');
    expect(prompt).toContain(
      '3. Anything the "with Context.md" answer got wrong or invented that the file doesn\'t actually support.',
    );
    expect(prompt).toContain('4. A score out of 10 for each, on how ready-to-send it is.');
    expect(prompt).toContain(
      '5. The top 2-3 specific areas of opportunity — what this Context.md file is missing or should clarify to get an even better answer.',
    );
    expect(prompt).toContain('PROMPT USED: "Draft a status update for my manager."');
    expect(prompt).toContain('BEFORE (nothing loaded):\nBEFORE_X');
    expect(prompt).toContain('AFTER (with Context.md loaded):\nAFTER_Y');
  });

  it('the four per-service attach tips (source lines 417-423) are byte-identical', () => {
    const byKey = (k: string) => PROOF_SERVICES.find((s) => s.key === k)!.attachTip;
    expect(byKey('chatgpt')).toBe('Click the + / paperclip near the message box and attach Context.md.');
    expect(byKey('claude')).toBe('Click the paperclip icon (or drag the file in) and attach Context.md.');
    expect(byKey('gemini')).toBe('Click the + / attach icon near the message box and attach Context.md.');
    expect(byKey('copilot')).toBe('Click the attach/paperclip icon near the message box and attach Context.md.');
  });

  it('the generic "something else" tip (source lines 417-423, key "other") is byte-identical', () => {
    const other = PROOF_SERVICES.find((s) => s.key === 'other')!;
    expect(other.attachTip).toBe('Look for a paperclip, +, or "attach file" icon near the message box.');
  });

  it('the shared fallback sentence (source lines 1385-1388) is byte-identical, curly apostrophes preserved', () => {
    const fallback = attachHintFor('chatgpt').replace(
      PROOF_SERVICES.find((s) => s.key === 'chatgpt')!.attachTip + ' ',
      '',
    );
    expect(fallback).toBe("Or just paste Context.md’s text directly if you don’t see one.");
  });
});
