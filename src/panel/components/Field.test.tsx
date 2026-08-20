import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { Field } from './Field';
import { mount } from './testUtils';

// React overrides the native value setter to track "real" changes; setting
// `.value` directly doesn't fire it, so the subsequent input event is a no-op
// unless we go through the native setter first — the same trick user-event uses.
function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Field', () => {
  it('associates the label with the input via htmlFor/id', () => {
    const { container } = mount(
      <Field id="name" label="Your name" value="" onChange={() => {}} />,
    );
    const label = container.querySelector('label')!;
    const input = container.querySelector('input')!;
    expect(label.getAttribute('for')).toBe('name');
    expect(input.id).toBe('name');
  });

  it('renders a textarea when as="textarea"', () => {
    const { container } = mount(
      <Field as="textarea" id="notes" label="Notes" value="" onChange={() => {}} />,
    );
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('calls onChange with the new value as the person types', () => {
    let current = '';
    const { container, rerender } = mount(
      <Field
        id="name"
        label="Your name"
        value={current}
        onChange={(v) => {
          current = v;
        }}
      />,
    );
    const input = container.querySelector('input')!;
    typeInto(input, 'Ada');
    expect(current).toBe('Ada');
    rerender(<Field id="name" label="Your name" value={current} onChange={() => {}} />);
    expect(input.value).toBe('Ada');
  });

  it('shows help text tied to the field via aria-describedby, no error state', () => {
    const { container } = mount(
      <Field
        id="name"
        label="Your name"
        value=""
        onChange={() => {}}
        help="First name is plenty."
      />,
    );
    const input = container.querySelector('input')!;
    const help = container.querySelector('.field-help')!;
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBe(help.id);
    expect(help.textContent).toBe('First name is plenty.');
  });

  it('an error says what to do next and is tied via aria-describedby + aria-invalid', () => {
    const { container } = mount(
      <Field
        id="name"
        label="Your name"
        value=""
        onChange={() => {}}
        error="Add a name so the file has something to call you."
      />,
    );
    const input = container.querySelector('input')!;
    const err = container.querySelector('.field-errmsg')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(err.id);
    expect(input.className).toContain('field-err');
    expect(err.textContent).toContain('Add a name');
  });
});
