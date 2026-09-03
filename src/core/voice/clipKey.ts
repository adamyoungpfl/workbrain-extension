/**
 * V3.0 pass 3f — the narration clip's name is a hash of its EXACT spoken
 * text. FNV-1a 32-bit in base36: stable across build script (node) and
 * panel (browser), collision-safe at the scale of one interview's worth
 * of lines, and self-invalidating - reworded copy hashes elsewhere, so a
 * stale clip can never speak old words; the miss just falls back to the
 * engine until the render script runs again.
 */
export function clipKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
