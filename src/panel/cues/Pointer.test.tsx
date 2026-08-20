import { afterEach, describe, expect, it } from 'vitest';
import { Pointer } from './Pointer';
import { clearCueRegistry, registerCueTarget } from './registry';
import { mount } from '../components/testUtils';

afterEach(() => {
  clearCueRegistry();
  document.body.replaceChildren();
});

describe('Pointer', () => {
  it('renders nothing when no point cue is active', () => {
    const { container } = mount(<Pointer state={null} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.cue-pointer-label')).toBeNull();
  });

  it('renders nothing when the target has not been registered — no anchor either, in this case', () => {
    const { container } = mount(<Pointer state={{ target: 'nowhere' }} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing when the target is registered but the anchor is not', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    registerCueTarget('demo-attach', target);
    const { container } = mount(<Pointer state={{ target: 'demo-attach' }} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws a path and a ring once both the anchor and the target are registered, and shows the label', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const anchor = document.createElement('input');
    const target = document.createElement('div');
    host.appendChild(anchor);
    host.appendChild(target);
    registerCueTarget('cue-anchor', anchor);
    registerCueTarget('demo-attach', target);

    const { container } = mount(<Pointer state={{ target: 'demo-attach', label: 'Attach it here' }} />);

    expect(container.querySelector('.cue-pointer-path')).not.toBeNull();
    expect(container.querySelector('.cue-pointer-ring')).not.toBeNull();
    expect(container.textContent).toContain('Attach it here');
  });

  it('supports a non-default anchor name', () => {
    const anchor = document.createElement('input');
    const target = document.createElement('div');
    document.body.appendChild(anchor);
    document.body.appendChild(target);
    registerCueTarget('custom-anchor', anchor);
    registerCueTarget('demo-attach', target);

    const { container } = mount(<Pointer state={{ target: 'demo-attach' }} anchor="custom-anchor" />);
    expect(container.querySelector('.cue-pointer-path')).not.toBeNull();
  });

  it('a page.* target parses fine (per engine.test.ts) but Pointer never attempts to draw toward it — no host permission for a live AI site this release (docs/RELEASE-1.md out-of-scope list)', () => {
    // Registered under that very name as a misuse check: even if something
    // *does* answer to a "page." name in-document, the prefix alone is
    // enough to keep Pointer from resolving or drawing toward it.
    const misregistered = document.createElement('div');
    document.body.appendChild(misregistered);
    registerCueTarget('page.composer', misregistered);
    registerCueTarget('cue-anchor', document.createElement('input'));

    const { container } = mount(<Pointer state={{ target: 'page.composer', label: 'Ask it here' }} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toContain('Ask it here');
  });

  it('is aria-hidden — the overlay is decorative; the instruction itself travels through CueAnnouncer, not this component', () => {
    const { container } = mount(<Pointer state={null} />);
    expect(container.querySelector('.cue-pointer-layer')?.getAttribute('aria-hidden')).toBe('true');
  });
});
