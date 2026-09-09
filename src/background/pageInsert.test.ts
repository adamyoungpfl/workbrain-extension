// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { COMPOSER_SELECTORS, HANDOFF_ORIGINS } from '../core/assist/composer';
import { PAGE_INSERT } from './pageInsert';

/* Pass 5c — what these tests really pin is that PAGE_INSERT stands on page
   globals alone and does the two insertions the four composers need. DOM
   here is built by hand, never by markup strings. */

const editable = (id: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute('contenteditable', 'true');
  document.body.appendChild(el);
  return el;
};

describe('the sanctioned list', () => {
  it('is the four named origins of GUARDRAILS, and no more', () => {
    expect(Object.keys(HANDOFF_ORIGINS).sort()).toEqual(['chatgpt', 'claude', 'copilot', 'gemini']);
  });
  it('every origin has at least one composer selector', () => {
    for (const key of Object.keys(HANDOFF_ORIGINS)) {
      expect(COMPOSER_SELECTORS[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('PAGE_INSERT', () => {
  it('fills a textarea through the native setter and says so with an input event', () => {
    document.body.replaceChildren();
    const box = document.createElement('textarea');
    box.id = 'userInput';
    document.body.appendChild(box);
    let heard = '';
    box.addEventListener('input', () => {
      heard = box.value;
    });
    expect(PAGE_INSERT(['textarea#userInput'], 'Summarize this thread.')).toBe(true);
    expect(heard).toBe('Summarize this thread.');
  });

  it('fills a contenteditable composer', () => {
    document.body.replaceChildren();
    const box = editable('prompt-textarea');
    expect(PAGE_INSERT(['#prompt-textarea'], 'One prompt, in my own words.')).toBe(true);
    expect(box.textContent).toContain('One prompt');
  });

  it('tries candidates in order and lands on the first present', () => {
    document.body.replaceChildren();
    editable('anon');
    expect(PAGE_INSERT(COMPOSER_SELECTORS['chatgpt']!, 'x')).toBe(true);
  });

  it('returns false when no composer exists — the caller does nothing, silently', () => {
    document.body.replaceChildren();
    document.body.appendChild(document.createElement('main'));
    expect(PAGE_INSERT(COMPOSER_SELECTORS['claude']!, 'x')).toBe(false);
  });
});
