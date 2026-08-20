import { describe, it, expect } from 'vitest';
import { Button } from './Button';
import { Banner } from './Banner';
import { mount } from './testUtils';

describe('Banner', () => {
  it('always says why it appeared and renders the fix as body text', () => {
    const { container } = mount(
      <Banner title="Three parts of your file are out of date">
        Two questions brings it current.
      </Banner>,
    );
    expect(container.querySelector('h5')?.textContent).toBe('Three parts of your file are out of date');
    expect(container.querySelector('p')?.textContent).toBe('Two questions brings it current.');
  });

  it('defaults to the amber (attention) variant with no extra class', () => {
    const { container } = mount(<Banner title="t">b</Banner>);
    const banner = container.querySelector('.banner')!;
    expect(banner.className.trim()).toBe('banner');
  });

  it.each(['info', 'good'] as const)('applies the %s variant class', (variant) => {
    const { container } = mount(
      <Banner variant={variant} title="t">
        b
      </Banner>,
    );
    expect(container.querySelector('.banner')?.className).toContain(variant);
  });

  it('defaults its heading to h5 (docs/design-system.html) but lets a caller pick the level that fits its own nesting', () => {
    const { container } = mount(<Banner title="t">b</Banner>);
    expect(container.querySelector('h5')).not.toBeNull();

    const { container: c2 } = mount(
      <Banner headingLevel={2} title="t">
        b
      </Banner>,
    );
    expect(c2.querySelector('h2')?.textContent).toBe('t');
    expect(c2.querySelector('h5')).toBeNull();
  });

  it('can carry an action, e.g. a Button, alongside the fix text', () => {
    const { container } = mount(
      <Banner title="Three parts are out of date" action={<Button size="sm">Answer 2 questions</Button>}>
        You said your team-lead role was good for about a year.
      </Banner>,
    );
    const btn = container.querySelector('button')!;
    expect(btn.textContent).toBe('Answer 2 questions');
  });
});
