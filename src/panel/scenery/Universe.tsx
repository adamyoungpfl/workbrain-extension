import { BrandMark } from '../components';
import { UNIVERSE } from '../../core/splash/universe';
import './Universe.css';

/**
 * THE UNIVERSE — the splash's seven-lattice field, promoted to the app's
 * own canvas (V3.0 pass 1; Adam, 2026-09-02: "From the home page through
 * every other interview canvas… the faint animated background from the
 * start of the splash page. I want that to remain consistent across the
 * experience so it draws you back and orients you to the interview canvas
 * as compared to the main browser screen. A steady part of the console
 * type of feel to it.")
 *
 * One component, two hosts: the splash intro's globe and App's ground
 * both render THIS, so the field a person admires at the open is
 * literally the field under every screen after it — consistency by
 * construction, not by matching numbers in two files.
 *
 * Nearness is size and presence, distance is smallness, faintness and a
 * breath of blur; each lattice adds a slow linear container turn (70–160s,
 * some reversed) over the shared orbit so no two read alike. Fixed, not
 * rolled: the same universe every open. All motion is CSS transform —
 * zero scheduled frames, and prefers-reduced-motion stills every turn in
 * the stylesheet (the field stays; scenery is not motion).
 */
export { UNIVERSE } from '../../core/splash/universe';

export function Universe() {
  return (
    <div className="universe" aria-hidden="true">
      {UNIVERSE.map((u) => (
        <span
          key={`${u.x}-${u.y}`}
          className="universe-orb"
          style={{
            left: `${u.x}%`,
            top: `${u.y}%`,
            /* Exposure is the HOST's word (--universe-dim): the same field
               reads fainter under a dense screen than behind the intro's
               one card, so App lifts it a touch while the splash keeps 1 -
               one geometry, per-host light. */
            ['--presence' as string]: u.presence,
            filter: u.blur ? `blur(${u.blur}px)` : undefined,
            animationDuration: `${u.pace}s`,
            animationDirection: u.reverse ? 'reverse' : 'normal',
          }}
        >
          <BrandMark size={u.size} spin="orbit" />
        </span>
      ))}
    </div>
  );
}
