/**
 * V2.7 VB-129 — the shard field: the show's physics, pure and seeded.
 *
 * A field of angular windows tumbling in the mark's gravity (Adam's Option
 * 1, docs/V2.7-SPLASH-WOW.md). Everything a frame needs is arithmetic
 * here so the painter (SplashStage.tsx) stays a draw loop and the physics
 * can be walked without a browser: orbits tighten under the pull, spin
 * follows, a consumed shard respawns at the rim, and the whole field is
 * DETERMINISTIC from its seed — the same install shows a shard-for-shard
 * repeatable field in a test while every open of the real panel seeds from
 * the clock and is subtly its own.
 */

export interface Shard {
  /** Orbit angle around the well, radians. */
  angle: number;
  /** Distance from the well's centre, px at design scale. */
  radius: number;
  /** Own rotation, radians, and its signed rate multiplier. */
  rot: number;
  spin: number;
  /** Per-shard orbital eagerness, 0.12–0.37. */
  speed: number;
  /** Which texture window this shard shows. */
  texture: number;
  /** Ken Burns phase — where the slow pan inside the mask starts. */
  kbPhase: number;
  /** Base scale multiplier, 0.55–1.3. */
  size: number;
  /** Convex polygon, local px around the shard's own origin. */
  points: [number, number][];
}

/** A tiny LCG — deterministic, dependency-free, good enough for scenery. */
export function seededRandom(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const FIELD_RIM = 470;
const CONSUMED_AT = 9;
const RESPAWN_MIN = 320;
const RESPAWN_SPREAD = 150;

export function makeField(count: number, seed: number, textureCount: number): Shard[] {
  const rand = seededRandom(seed);
  const shards: Shard[] = [];
  for (let i = 0; i < count; i++) {
    const sides = 3 + Math.floor(rand() * 2.6);
    const base = rand() * Math.PI * 2;
    const points: [number, number][] = [];
    for (let k = 0; k < sides; k++) {
      const a = base + (k / sides) * Math.PI * 2 + rand() * 0.5;
      const d = 16 + rand() * 26;
      points.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    shards.push({
      angle: rand() * Math.PI * 2,
      radius: 120 + rand() * (FIELD_RIM - 130),
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 1.6,
      speed: 0.12 + rand() * 0.25,
      texture: textureCount > 0 ? i % textureCount : 0,
      kbPhase: rand() * Math.PI * 2,
      size: 0.55 + rand() * 0.75,
      points,
    });
  }
  return shards;
}

/**
 * Advance the field by `dt` seconds under `pull` (core's pullStrength).
 * Mutates the shards in place — the painter owns them and calls this once
 * per frame; the maths is still pure in the sense that matters: same
 * field, same dt, same pull, same result.
 */
export function stepField(shards: Shard[], dt: number, pull: number, respawnRoll: () => number = Math.random): void {
  for (const shard of shards) {
    shard.angle += dt * 0.15 * pull * (0.4 + shard.speed * 8) * 0.5;
    // Gravity: the decay steepens as the shard nears the well, and the
    // whole term rides the pull — drift at rest, a rush at full pull.
    shard.radius -= dt * 3 * pull * (0.4 + shard.speed) * (shard.radius * 0.012 + 0.6);
    shard.rot += dt * 0.24 * shard.spin * pull;
    if (shard.radius <= CONSUMED_AT) {
      shard.radius = RESPAWN_MIN + respawnRoll() * RESPAWN_SPREAD;
      shard.angle = respawnRoll() * Math.PI * 2;
    }
  }
}

export interface ShardView {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** 0 at the rim → 1 at the well: the painter's depth cue. */
  near: number;
}

/** Where a shard sits on the stage, given the well's centre. The orbit is
 * gently elliptical (0.92) so the field reads as a tilted disc, not a
 * dartboard. */
export function projectShard(shard: Shard, wellX: number, wellY: number): ShardView {
  const near = Math.max(0, Math.min(1, 1 - shard.radius / (FIELD_RIM + 20)));
  return {
    x: wellX + Math.cos(shard.angle) * shard.radius,
    y: wellY + Math.sin(shard.angle) * shard.radius * 0.92,
    scale: shard.size * (0.5 + near * 0.9),
    alpha: 0.26 + near * 0.74,
    near,
  };
}

/** The Ken Burns drift inside a shard's mask, px — slow, phase-offset per
 * shard, so stills read as living footage at this scale. */
export function kenBurnsOffset(shard: Shard, tSeconds: number): { dx: number; dy: number; grow: number } {
  const wave = Math.sin(shard.kbPhase + tSeconds * 0.4);
  return { dx: 8 * wave, dy: -4.8 * wave, grow: Math.abs(8 * wave) };
}
