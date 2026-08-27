import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { AssistSheet, ASSIST_PROMPT_ICON, ASSIST_SEND_SCENE } from './AssistSheet';
import { ASSIST_ICON } from './Flow';
import { ASSIST_ENCOURAGING_LEAD, ASSIST_LINE_COPY, ASSIST_LINE_RETURN } from '../../core/flow/assistCopy';
import { mount } from '../components/testUtils';
import { S } from '../strings';

/**
 * V2.5 VB-119 — the AI Assist sheet, without a browser. Two halves, the
 * standing split (Flow.idea.test.tsx's reasoning):
 *
 *  - The drawings. Every glyph here is a transcription — a digit lost in a
 *    refactor is invisible in a diff and visible on screen — so each one is
 *    pinned character-for-character.
 *  - The walk. Step 1 → copy → step 2 → started → step 3 → submit is the
 *    feature's skeleton and is pure component behaviour; the real dimmed
 *    sheet, the narrator, the pulse landing in the flow's own input and the
 *    focus hand-backs are driven in tests/e2e/interview-me.spec.ts against
 *    the built extension.
 */

function stubClipboard(): { written: string[] } {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return { written };
}

function click(el: Element | null) {
  act(() => (el as HTMLElement).click());
}

/** Let the clipboard promise's .then land — copy advances asynchronously. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

const PROMPT = 'Interview me about this.\n\nPut the answer in one fenced code block (three backticks).';

function sheetProps(over: Partial<Parameters<typeof AssistSheet>[0]> = {}) {
  return {
    prompt: PROMPT,
    serviceLabel: 'ChatGPT' as string | undefined,
    serviceUrl: 'https://chatgpt.com/' as string | undefined,
    onClose: () => {},
    onSubmit: (_: string) => {},
    ...over,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

// ── the drawings ───────────────────────────────────────────────────────────

describe('the assist chip glyph (ASSIST_ICON)', () => {
  it('is two groups — the bubble and the spark — and nothing outside them', () => {
    const { container } = mount(ASSIST_ICON);
    const svg = container.querySelector('svg')!;
    const groups = [...svg.children];
    expect(groups.map((g) => g.tagName)).toEqual(['g', 'g']);
    expect(groups.map((g) => g.getAttribute('class'))).toEqual(['assist-bubble', 'assist-spark']);
  });

  it('draws the bubble and the four-point spark exactly as transcribed', () => {
    const { container } = mount(ASSIST_ICON);
    expect(container.querySelector('.assist-bubble path')!.getAttribute('d')).toBe(
      'M5 5h14a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-7.6L7 20v-3.5H5A2.5 2.5 0 0 1 2.5 14V7.5A2.5 2.5 0 0 1 5 5z',
    );
    expect(container.querySelector('.assist-spark path')!.getAttribute('d')).toBe(
      'M12 7.1l0.95 2.45 2.45 0.95-2.45 0.95L12 13.9l-0.95-2.45-2.45-0.95 2.45-0.95z',
    );
  });

  it('keeps the panel icon convention: stroke on the root, decorative, no SMIL', () => {
    const { container } = mount(ASSIST_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('17');
    expect(svg.querySelector('animate, animateTransform, set')).toBeNull();
  });
});

describe('the prompt-page glyph (ASSIST_PROMPT_ICON)', () => {
  it('draws a folded page with two written lines, as transcribed', () => {
    const { container } = mount(ASSIST_PROMPT_ICON);
    expect([...container.querySelectorAll('.assist-prompt-page path')].map((p) => p.getAttribute('d'))).toEqual([
      'M7 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5z',
      'M13.5 3.5V8.5h5',
    ]);
    expect([...container.querySelectorAll('.assist-prompt-lines path')].map((p) => p.getAttribute('d'))).toEqual([
      'M9 13h6',
      'M9 16.5h4.5',
    ]);
  });
});

describe('the paste-and-send scene (ASSIST_SEND_SCENE)', () => {
  it('is three groups — composer, paste, send — so the css can move the beats separately', () => {
    const { container } = mount(ASSIST_SEND_SCENE);
    const svg = container.querySelector('svg')!;
    expect([...svg.children].map((g) => g.getAttribute('class'))).toEqual([
      'assist-scene-composer',
      'assist-scene-paste',
      'assist-scene-send',
    ]);
  });

  it('is generic — a rounded composer, two text lines, a circled up arrow; no vendor anything', () => {
    const { container } = mount(ASSIST_SEND_SCENE);
    const composer = container.querySelector('.assist-scene-composer rect')!;
    expect(composer.getAttribute('rx')).toBe('10');
    expect([...container.querySelectorAll('.assist-scene-paste path')]).toHaveLength(2);
    expect(container.querySelector('.assist-scene-send circle')).not.toBeNull();
    // Decorative: the printed step line above it carries the instruction.
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    // No SMIL — the loop is CSS, so reduced motion can replace it with the
    // finished still (AssistSheet.css).
    expect(container.querySelector('animate, animateTransform, set')).toBeNull();
  });
});

// ── the walk ───────────────────────────────────────────────────────────────

describe('AssistSheet — the stepped mini-interview', () => {
  it('rides the sanctioned Sheet, full height: dialog, aria-modal=false, --full', () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    const card = container.querySelector('.sheet-card')!;
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('false');
    expect(card.classList.contains('sheet-card--full')).toBe(true);
    expect(card.classList.contains('assist-sheet')).toBe(true);
  });

  it('step 1: the copy line, the prompt in trust chrome, and the glowing copy control', () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    expect(container.querySelector('.assist-steps')!.getAttribute('data-assist-step')).toBe('1');
    expect(container.querySelector('.assist-line')!.textContent).toBe(ASSIST_LINE_COPY);
    // The exact prompt is visible before it goes anywhere (GUARDRAILS).
    expect(container.querySelector('.readonly')!.textContent).toContain('three backticks');
    // The copy control wears the flow's one sanctioned cue.
    const copy = container.querySelector('.assist-copy')!;
    expect(copy.classList.contains('flow-highlight')).toBe(true);
    // Not the encouraging variant unless asked.
    expect(container.querySelector('.assist-lead')).toBeNull();
  });

  it('copy puts the prompt on the clipboard and auto-advances to step 2, announcing Copied', async () => {
    const clip = stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    expect(clip.written).toEqual([PROMPT]);
    expect(container.querySelector('.assist-steps')!.getAttribute('data-assist-step')).toBe('2');
    expect(container.querySelector('.assist-live')!.textContent).toBe(S.copied);
  });

  it("the ReadOnlyBlock's own corner copy is the same completion — it advances too", async () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    click(container.querySelector('.readonly .copy'));
    await settle();
    expect(container.querySelector('.assist-steps')!.getAttribute('data-assist-step')).toBe('2');
  });

  it('step 2 names their AI, opens a plain door to it, and rescues focus onto the advance', async () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    expect(container.querySelector('.assist-line')!.textContent).toBe('Paste it into ChatGPT.');
    const link = container.querySelector<HTMLAnchorElement>('.assist-link')!;
    expect(link.getAttribute('href')).toBe('https://chatgpt.com/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.textContent).toBe(S.assistOpenService('ChatGPT'));
    // The scene rides beside the words, decorative.
    expect(container.querySelector('.assist-scene')).not.toBeNull();
    // Focus was rescued from the unmounted copy control onto the step's own
    // next action — the Popover's stranded-focus rule, not a steal.
    expect(document.activeElement?.textContent).toBe(S.assistStarted);
  });

  it("step 2 with no service: 'your AI', no door at all — the instruction still works", async () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps({ serviceLabel: undefined, serviceUrl: undefined })} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    expect(container.querySelector('.assist-line')!.textContent).toBe('Paste it into your AI.');
    expect(container.querySelector('.assist-link')).toBeNull();
  });

  it('step 3: the return line, the highlighted box focused and ready for the paste', async () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistStarted)!);
    expect(container.querySelector('.assist-steps')!.getAttribute('data-assist-step')).toBe('3');
    expect(container.querySelector('.assist-line')!.textContent).toBe(ASSIST_LINE_RETURN);
    const box = container.querySelector<HTMLTextAreaElement>('#assist-reply')!;
    // Highlighted while empty — the sanctioned cue saying "here" — and
    // focused, so the very next keystroke is the paste itself.
    expect(box.classList.contains('flow-highlight')).toBe(true);
    expect(document.activeElement).toBe(box);
  });

  it('typing into the box takes the highlight off — the cue has done its job', async () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps()} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistStarted)!);
    const box = container.querySelector<HTMLTextAreaElement>('#assist-reply')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(box, 'landed');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(box.classList.contains('flow-highlight')).toBe(false);
  });

  it('submit runs the existing normalize path: fenced unwraps, plain is never reformatted', async () => {
    stubClipboard();
    const onSubmit = vi.fn();
    const { container } = mount(<AssistSheet {...sheetProps({ onSubmit })} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistStarted)!);
    const box = container.querySelector<HTMLTextAreaElement>('#assist-reply')!;
    const type = (text: string) =>
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
        setter.call(box, text);
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const submit = () => click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistUse)!);

    type('Narration first.\n```\n- One thing\n- Another\n```');
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith('One thing\nAnother');

    type('- My own dashes, my own business.');
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith('- My own dashes, my own business.');
  });

  it('an empty submit says what to do next, and never closes over nothing', async () => {
    stubClipboard();
    const onSubmit = vi.fn();
    const { container } = mount(<AssistSheet {...sheetProps({ onSubmit })} />);
    click(container.querySelector('.assist-copy'));
    await settle();
    click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistStarted)!);
    click([...container.querySelectorAll('button')].find((b) => b.textContent === S.assistUse)!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('.field-errmsg, [role="alert"]')?.textContent).toBe(S.assistNeedPaste);
  });

  it('VB-120: the encouraging variant leads with the offer, and only then instructs', () => {
    stubClipboard();
    const { container } = mount(<AssistSheet {...sheetProps({ encouraging: true })} />);
    const lead = container.querySelector('.assist-lead')!;
    expect(lead.textContent).toBe(ASSIST_ENCOURAGING_LEAD);
    expect(container.querySelector('.assist-line')!.textContent).toBe(ASSIST_LINE_COPY);
    // Reading order: the offer, then the instruction.
    expect(lead.nextElementSibling?.classList.contains('assist-line')).toBe(true);
  });
});
