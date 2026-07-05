import { describe, it, expect } from 'vitest';
import type { SpaceshipState } from '../../types';
import {
  applyThrustInBodyFrame,
  computeSpaceshipAcceleration,
  checkSpaceshipCollision,
  rk4StepSpaceshipWithMovingBodies,
  predictTrajectory,
  type BodyInfo,
} from '../spaceship';
import { SPACECRAFT_CONFIG, G_AU, MU_SUN_AU } from '../constants';

const EPSILON = 1e-12;

function makeShip(
  px = 1.0, py = 0, pz = 0,
  vx = 0, vy = 1.991e-7, vz = 0,
): SpaceshipState {
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  return {
    position: [px, py, pz],
    velocity: [vx, vy, vz],
    direction: speed > 0 ? [vx / speed, vy / speed, vz / speed] : [0, 1, 0],
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
  };
}

function makeSun(): BodyInfo {
  return { id: 'sun', position: [0, 0, 0], mass: 1.989e30, radius: 0.00465 };
}

describe('spaceship', () => {
  describe('applyThrustInBodyFrame', () => {
    it('should return zero when magnitude is zero', () => {
      const result = applyThrustInBodyFrame(0, 0, 0, 0, [1, 0, 0]);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });

    it('should produce forward thrust along direction', () => {
      const result = applyThrustInBodyFrame(1, 0, 0, 100, [1, 0, 0]);
      // Forward thrust should be along direction
      expect(result[0]).toBeGreaterThan(0);
      expect(result[1]).toBeCloseTo(0, 10);
      expect(result[2]).toBeCloseTo(0, 10);
    });

    it('should produce backward thrust opposite to direction', () => {
      const result = applyThrustInBodyFrame(-1, 0, 0, 100, [1, 0, 0]);
      expect(result[0]).toBeLessThan(0);
    });

    it('should scale with magnitude', () => {
      const full = applyThrustInBodyFrame(1, 0, 0, 100, [1, 0, 0]);
      const half = applyThrustInBodyFrame(1, 0, 0, 50, [1, 0, 0]);
      expect(full[0]).toBeCloseTo(half[0] * 2, 10);
    });
  });

  describe('computeSpaceshipAcceleration', () => {
    it('should produce sunward acceleration when near Sun', () => {
      const ship = makeShip(1.0, 0, 0, 0, 0, 0);
      const acc = computeSpaceshipAcceleration(ship, [makeSun()]);
      // Gravitational acceleration should be toward Sun (negative x)
      expect(acc[0]).toBeLessThan(0);
      // Magnitude should be ~MU_SUN_AU / r²
      const expectedMag = MU_SUN_AU / (1 * 1);
      expect(Math.abs(acc[0])).toBeCloseTo(expectedMag, EPSILON);
    });

    it('should include thrust in acceleration', () => {
      const ship = makeShip(1.0, 0, 0, 0, 0, 0);
      ship.thrust = [1e-10, 0, 0];
      const acc = computeSpaceshipAcceleration(ship, [makeSun()]);
      // The x acceleration should be gravity + thrust (thrust is already acceleration)
      const gravityOnly = -MU_SUN_AU / (1 * 1);
      expect(acc[0]).toBeCloseTo(gravityOnly + 1e-10, EPSILON);
    });
  });

  describe('checkSpaceshipCollision', () => {
    it('should return null when far from bodies', () => {
      const ship = makeShip(100, 0, 0);
      const result = checkSpaceshipCollision(ship, [makeSun()]);
      expect(result).toBeNull();
    });

    it('should detect collision with overlapping body', () => {
      const ship = makeShip(0.001, 0, 0);
      const result = checkSpaceshipCollision(ship, [makeSun()]);
      expect(result).toBe('sun');
    });
  });

  describe('rk4StepSpaceshipWithMovingBodies', () => {
    it('should advance spaceship position', () => {
      const ship = makeShip(1, 0, 0, 0, 2e-7, 0);
      const originalX = ship.position[0];
      rk4StepSpaceshipWithMovingBodies(ship, () => [makeSun()], 1000);
      expect(ship.position[0]).not.toBe(originalX);
    });
  });

  describe('predictTrajectory', () => {
    it('should return array of position points', () => {
      const ship = makeShip(1, 0, 0, 0, 2e-7, 0);
      const points = predictTrajectory(ship, () => [makeSun()], 60, 10);
      expect(points.length).toBe(10);
      expect(points[0].length).toBe(3);
    });
  });
});
