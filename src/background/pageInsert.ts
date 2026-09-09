/**
 * V3.0 pass 5c — the injected half of Tier 1. SELF-CONTAINED on purpose:
 * chrome.scripting.executeScript serializes this function's source into
 * the service's page, where module scope does not exist — so it stands on
 * page globals alone. DOM code lives here and not in core because core
 * must run without a browser; the selector data it receives is
 * core/assist/composer.ts's, the pure half both sides share.
 *
 * It PASTES; the person SENDS. It returns only whether the prompt landed —
 * nothing on the page is read, and the reply could not reach us if it
 * wanted to.
 */
export const PAGE_INSERT = (selectors: string[], text: string): boolean => {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      return true;
    }
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      el.focus();
      /* execCommand is deprecated and still the one insertion React-style
         editors reliably hear; the textContent line is its own fallback. */
      const inserted =
        typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
      if (!inserted) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      }
      return true;
    }
  }
  return false;
};
