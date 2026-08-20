import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

/** Shared render helper for component tests. Not itself a test file. */
export function mount(children: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(children));
  return {
    container,
    rerender: (next: ReactElement) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
