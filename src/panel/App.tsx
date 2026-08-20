import './tokens.css';
import { Flow } from './surfaces/Flow';
import { contextModules } from '../core/flow/flow';

/**
 * Renders the Context interview directly — Home doesn't exist until R1-12,
 * and a vertical slice means the panel does something usable now rather
 * than stay a placeholder. Replaced by the real surface router
 * ('home' | 'flow' | 'sheet') at R1-12 — see docs/ARCHITECTURE.md.
 */
export default function App() {
  return <Flow modules={contextModules} />;
}
