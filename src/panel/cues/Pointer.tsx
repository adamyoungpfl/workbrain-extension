import { useLayoutEffect, useRef, useState } from 'react';
import { resolveCueTarget } from './registry';
import './Pointer.css';

/** What the `point` verb is currently pointing at, or `null` when no
 * `point` cue is active. Carried as data (not a DOM class) because drawing
 * the overlay needs geometry — where the anchor and target actually are —
 * that a class toggle alone can't express. See useCueChain.ts, which is
 * what actually produces this from a running chain. */
export interface PointerState {
  target: string;
  label?: string;
}

export interface PointerProps {
  state: PointerState | null;
  /** Registry name of the element the pointer draws *from* — normally
   * whatever field the person is currently looking at. Defaults to the one
   * name this codebase's cue data is expected to register consistently for
   * that purpose, so most callers never need to pass this explicitly. */
  anchor?: string;
}

interface Geometry {
  path: string;
  ringX: number;
  ringY: number;
  labelX: number;
  labelY: number;
}

const DEFAULT_ANCHOR = 'cue-anchor';
const PAGE_TARGET_PREFIX = 'page.';

/**
 * The `point` verb's cross-surface pointer overlay — R1-08. "Cross-surface"
 * names what the verb is *for* (docs/ARCHITECTURE.md's example points into
 * a live AI site's composer), not what this release can do: reaching an
 * element on another tab needs a host permission, which
 * docs/RELEASE-1.md's out-of-scope list explicitly withholds this release
 * ("any host permission"). So a target named `page.*` is recognised —
 * parsed the same as any other target, never throwing — and then
 * deliberately never resolved or drawn toward. Only a same-document,
 * registry-resolved target actually gets an overlay.
 */
export function Pointer({ state, anchor = DEFAULT_ANCHOR }: PointerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const isCrossSurface = state !== null && state.target.startsWith(PAGE_TARGET_PREFIX);

  useLayoutEffect(() => {
    if (!state || isCrossSurface) {
      setGeometry(null);
      return;
    }
    const layer = layerRef.current;
    const targetEl = resolveCueTarget(state.target)[0];
    const anchorEl = resolveCueTarget(anchor)[0];
    if (!layer || !targetEl || !anchorEl) {
      setGeometry(null);
      return;
    }

    const layerRect = layer.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    const tr = targetEl.getBoundingClientRect();

    const x1 = ar.left - layerRect.left - 4;
    const y1 = ar.top - layerRect.top + Math.min(ar.height / 2, 40);
    const x2 = tr.right - layerRect.left + 10;
    const y2 = tr.top - layerRect.top + tr.height / 2;
    const cx = (x1 + x2) / 2;

    setGeometry({
      path: `M${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
      ringX: tr.left - layerRect.left + tr.width / 2,
      ringY: y2,
      labelX: tr.left - layerRect.left + tr.width / 2,
      labelY: tr.top - layerRect.top,
    });
  }, [state, anchor, isCrossSurface]);

  return (
    <div className="cue-pointer-layer" ref={layerRef} aria-hidden="true">
      {geometry && (
        <svg className="cue-pointer-svg">
          <path className="cue-pointer-path" d={geometry.path} />
          <circle className="cue-pointer-ring" cx={geometry.ringX} cy={geometry.ringY} r={10} />
        </svg>
      )}
      {geometry && state?.label && (
        <div className="cue-pointer-label" style={{ left: geometry.labelX, top: geometry.labelY }}>
          {state.label}
        </div>
      )}
    </div>
  );
}
