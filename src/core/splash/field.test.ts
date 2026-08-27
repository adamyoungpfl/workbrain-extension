import { describe, it, expect } from 'vitest';
import {
  FIELD_RIM,
  kenBurnsOffset,
  makeField,
  projectShard,
  seededRandom,
  stepField,
} from './field';

/** V2.7 VB-129 — the shard field's physics, walked without a browser. */

describe('seededRandom', () => {
  it('is deterministic per seed, and different across seeds', () => {
    const a1 = seededRandom(42);
    const a2 = seededRandom(42);
    const b = seededRandom(43);
    const runA1 = [a1(), a1(), a1()];
    const runA2 = [a2(), a2(), a2()];
    const runB = [b(), b(), b()];
    expect(runA1).toEqual(runA2);
    expect(runA1).not.toEqual(runB);
    for (const v of runA1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('makeField', () => {
  it('builds the asked-for field, shard-for-shard repeatable from its seed', () => {
    const a = makeField(26, 7, 5);
    const b = makeField(26, 7, 5);
    expect(a).toEqual(b);
    expect(a).toHaveLength(26);
  });

  it('every shard is a drawable window: 3–5 points, inside the rim, textured', () => {
    const field = makeField(30, 99, 5);
    for (const shard of field) {
      expect(shard.points.length).toBeGreaterThanOrEqual(3);
      expect(shard.points.length).toBeLessThanOrEqual(5);
      expect(shard.radius).toBeGreaterThan(0);
      expect(shard.radius).toBeLessThanOrEqual(FIELD_RIM);
      expect(shard.texture).toBeGreaterThanOrEqual(0);
      expect(shard.texture).toBeLessThan(5);
      for (const [x, y] of shard.points) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(45);
      }
    }
  });

  it('spreads the textures across the field', () => {
    const field = makeField(20, 3, 5);
    expect(new Set(field.map((s) => s.texture)).size).toBe(5);
  });
});

describe('stepField — the gravity', () => {
  it('tightens every orbit, faster under a stronger pull', () => {
    const gentle = makeField(12, 5, 5);
    const hard = makeField(12, 5, 5);
    const before = gentle.map((s) => s.radius);
    stepField(gentle, 1 / 60, 0.16, () => 0.5);
    stepField(hard, 1 / 60, 3.4, () => 0.5);
    gentle.forEach((shard, i) => {
      const gentleFall = before[i]! - shard.radius;
      const hardFall = before[i]! - hard[i]!.radius;
      expect(gentleFall).toBeGreaterThan(0);
      expect(hardFall).toBeGreaterThan(gentleFall);
    });
  });

  it('a consumed shard respawns out at the rim with a fresh bearing', () => {
    const field = makeField(1, 11, 5);
    const shard = field[0]!;
    shard.radius = 8; // inside the well's mouth
    stepField(field, 1 / 60, 1, () => 0.5);
    expect(shard.radius).toBeGreaterThan(300);
    expect(shard.radius).toBeLessThan(FIELD_RIM + 1);
  });

  it('advances angle and rotation with time and pull, and holds at rest-rate', () => {
    const moving = makeField(6, 21, 5);
    const angles = moving.map((s) => s.angle);
    stepField(moving, 1 / 60, 2, () => 0.5);
    moving.forEach((shard, i) => {
      expect(shard.angle).not.toBe(angles[i]);
    });
  });
});

describe('projectShard', () => {
  it('maps rim → far/faint/small and well → near/bright/full', () => {
    const field = makeField(1, 31, 5);
    const shard = field[0]!;
    shard.radius = FIELD_RIM;
    const far = projectShard(shard, 200, 330);
    shard.radius = 20;
    const close = projectShard(shard, 200, 330);
    expect(far.alpha).toBeLessThan(close.alpha);
    expect(far.scale).toBeLessThan(close.scale);
    expect(close.near).toBeGreaterThan(0.9);
    expect(far.near).toBeLessThan(0.1);
  });

  it('orbits are gently elliptical — the field is a tilted disc', () => {
    const field = makeField(1, 8, 5);
    const shard = field[0]!;
    shard.radius = 200;
    shard.angle = Math.PI / 2; // straight down
    const view = projectShard(shard, 200, 330);
    expect(view.y - 330).toBeCloseTo(200 * 0.92, 5);
  });
});

describe('kenBurnsOffset', () => {
  it('drifts slowly, bounded, and differently per shard phase', () => {
    const field = makeField(2, 17, 5);
    const a = kenBurnsOffset(field[0]!, 1);
    const b = kenBurnsOffset(field[1]!, 1);
    expect(Math.abs(a.dx)).toBeLessThanOrEqual(8);
    expect(a.grow).toBeGreaterThanOrEqual(0);
    expect(a.dx).not.toBeCloseTo(b.dx, 3);
    // And it genuinely moves with time.
    const later = kenBurnsOffset(field[0]!, 3);
    expect(later.dx).not.toBeCloseTo(a.dx, 3);
  });
});
