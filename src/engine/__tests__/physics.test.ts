import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '../../types';
import {
  computeAccelerations,
  rk4Step,
  detectCollisions,
  advanceSimulation,
  vec3Length,
  getBodyRadius,
} from '../physics';
import { PHYSICAL_CONSTANTS, G_AU, MU_SUN_AU } from '../constants';

function makeBody(
  id: string,
  templateId: string,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  mass: number,
): CelestialBody {
  return {
    id,
    templateId,
    position: [x, y, z],
    velocity: [vx, vy, vz],
    mass,
    placedAt: 0,
    rotationSpeed: 0,
    rotationPhase: 0,
  };
}

const EPSILON = 1e-10;

describe('physics', () => {
  describe('vec3Length', () => {
    it('should compute Euclidean norm', () => {
      expect(vec3Length([3, 4, 0])).toBeCloseTo(5, 10);
      expect(vec3Length([1, 1, 1])).toBeCloseTo(Math.sqrt(3), 10);
    });
  });

  describe('computeAccelerations', () => {
    it('should produce sunward acceleration for Earth at 1 AU', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, 5.9724e24);
      const acc = computeAccelerations([sun, earth], PHYSICAL_CONSTANTS.softeningFactor);

      // Sun should accelerate toward Earth (positive x)
      expect(acc[0][0]).toBeGreaterThan(0);
      // Earth should accelerate toward Sun (negative x)
      expect(acc[1][0]).toBeLessThan(0);

      // Magnitude: G_AU * Msun / r² ≈ 3.964e-14 AU/s²
      const expectedAcc = MU_SUN_AU / (1 * 1);
      expect(Math.abs(acc[1][0])).toBeCloseTo(expectedAcc, EPSILON);
    });

    it('should conserve total momentum (equal and opposite forces)', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 0, 0, 5.9724e24);
      const acc = computeAccelerations([sun, earth], PHYSICAL_CONSTANTS.softeningFactor);

      const totalForceX = acc[0][0] * sun.mass + acc[1][0] * earth.mass;
      expect(totalForceX).toBeCloseTo(0, EPSILON);
    });

    it('should work in 2D mode', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 0, 0, 5.9724e24);
      const acc = computeAccelerations([sun, earth], PHYSICAL_CONSTANTS.softeningFactor, 2);
      // Z acceleration should be zero in 2D mode
      expect(acc[0][2]).toBe(0);
      expect(acc[1][2]).toBe(0);
    });

    it('should handle multiple bodies', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const e1 = makeBody('e1', 'earth', 1, 0, 0, 0, 0, 0, 1e24);
      const e2 = makeBody('e2', 'earth', -1, 0, 0, 0, 0, 0, 1e24);
      const acc = computeAccelerations([sun, e1, e2], PHYSICAL_CONSTANTS.softeningFactor);

      // Symmetrical bodies should have symmetrical accelerations
      expect(acc[1][0]).toBeCloseTo(-acc[2][0], 8);
      expect(acc[1][1]).toBeCloseTo(-acc[2][1], 8);
    });
  });

  describe('rk4Step', () => {
    it('should advance bodies in time (verify positions change)', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, 5.9724e24);
      const originalX = earth.position[0];
      rk4Step([sun, earth], 10000); // 10000 seconds
      // Earth should have moved
      expect(earth.position[0]).not.toBeCloseTo(originalX, 10);
    });

    it('should approximately conserve energy for small dt', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, 5.9724e24);

      const r = Math.sqrt(earth.position[0] ** 2 + earth.position[1] ** 2);
      const v2 = earth.velocity[0] ** 2 + earth.velocity[1] ** 2;
      const initialEnergy = v2 / 2 - MU_SUN_AU / r;

      // Small dt
      rk4Step([sun, earth], 600); // 10 minutes

      const r2 = Math.sqrt(earth.position[0] ** 2 + earth.position[1] ** 2);
      const v2_2 = earth.velocity[0] ** 2 + earth.velocity[1] ** 2;
      const finalEnergy = v2_2 / 2 - MU_SUN_AU / r2;

      const relError = Math.abs((finalEnergy - initialEnergy) / initialEnergy);
      expect(relError).toBeLessThan(0.001);
    });
  });

  describe('detectCollisions', () => {
    it('should detect collision when bodies overlap', () => {
      const a = makeBody('a', 'earth', 0, 0, 0, 0, 0, 0, 5.9724e24);
      const b = makeBody('b', 'earth', 1e-6, 0, 0, 0, 0, 0, 5.9724e24);
      const events = detectCollisions([a, b]);
      expect(events.length).toBe(1);
    });

    it('should not detect collision when bodies are far apart', () => {
      const a = makeBody('a', 'earth', 0, 0, 0, 0, 0, 0, 5.9724e24);
      const b = makeBody('b', 'earth', 1, 0, 0, 0, 0, 0, 5.9724e24);
      const events = detectCollisions([a, b]);
      expect(events.length).toBe(0);
    });

    it('should merge bodies on collision (mass conservation)', () => {
      const a = makeBody('a', 'earth', 0, 0, 0, 0, 0, 0, 1e24);
      const b = makeBody('b', 'earth', 1e-12, 0, 0, 0, 0, 0, 2e24);
      const events = detectCollisions([a, b]);
      expect(events.length).toBe(1);
      expect(events[0].mergedBody.mass).toBeCloseTo(3e24, 20);
    });
  });

  describe('advanceSimulation', () => {
    it('should return simDelta', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, 5.9724e24);
      const simDelta = advanceSimulation([sun, earth], 0.016, 1e5);
      expect(simDelta).toBeGreaterThan(0);
    });

    it('should return 0 for less than 2 bodies', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, 1.989e30);
      const result = advanceSimulation([sun], 0.016, 1e5);
      expect(result).toBe(0);
    });
  });

  describe('getBodyRadius', () => {
    it('should return AU-scale radius for Earth', () => {
      const r = getBodyRadius('earth');
      expect(r).toBeGreaterThan(1e-6);
      expect(r).toBeLessThan(0.01);
    });

    it('should return 0 for unknown template', () => {
      expect(getBodyRadius('nonexistent')).toBe(0);
    });
  });
});
