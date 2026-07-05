import { describe, expect, it } from 'vitest';
import { computePlacementVelocity } from '../placementVelocity';

describe('placementVelocity', () => {
  it('keeps tangential velocity for bodies placed inside 1 AU', () => {
    const speed = 2e-7;

    const velocity = computePlacementVelocity({
      position: [0.5, 0, 0],
      speed,
      angleDeg: 0,
    });

    expect(velocity[0]).toBeCloseTo(0, 16);
    expect(velocity[1]).toBeCloseTo(speed, 16);
    expect(velocity[2]).toBe(0);
  });

  it('uses 90 degrees as radial outward velocity', () => {
    const speed = 2e-7;

    const velocity = computePlacementVelocity({
      position: [0.5, 0, 0],
      speed,
      angleDeg: 90,
    });

    expect(velocity[0]).toBeCloseTo(speed, 16);
    expect(velocity[1]).toBeCloseTo(0, 16);
    expect(velocity[2]).toBe(0);
  });

  it('uses 180 degrees as clockwise tangential velocity', () => {
    const speed = 2e-7;

    const velocity = computePlacementVelocity({
      position: [0.5, 0, 0],
      speed,
      angleDeg: 180,
    });

    expect(velocity[0]).toBeCloseTo(0, 16);
    expect(velocity[1]).toBeCloseTo(-speed, 16);
    expect(velocity[2]).toBe(0);
  });

  it('returns zero velocity when speed is zero', () => {
    expect(computePlacementVelocity({
      position: [0.5, 0, 0],
      speed: 0,
      angleDeg: 0,
    })).toEqual([0, 0, 0]);
  });

  it('returns zero velocity at the reference center', () => {
    expect(computePlacementVelocity({
      position: [0, 0, 0],
      speed: 2e-7,
      angleDeg: 0,
    })).toEqual([0, 0, 0]);
  });
});
