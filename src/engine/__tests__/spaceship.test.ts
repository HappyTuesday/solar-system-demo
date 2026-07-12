import { describe, it, expect } from 'vitest';
import type { SpaceshipState } from '../../types';
import {
  applyThrustInBodyFrame,
  computeSpaceshipAcceleration,
  checkSpaceshipCollision,
  hasEffectiveThrust,
  rk4StepSpaceshipWithMovingBodies,
  predictTrajectory,
  parkBrakeThrustMagnitude,
  parkBrakeSnapshot,
  computeGravityAcceleration,
  parkHoldSnapshot,
  orbitInsertSnapshot,
  clampSpeedToMax,
  MAX_SHIP_SPEED_AU_PER_SEC,
  type BodyInfo,
} from '../spaceship';
import { MU_SUN_AU, AU_TO_KM } from '../constants';

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

  describe('hasEffectiveThrust', () => {
    it('should require both nonzero magnitude and a nonzero body-frame thrust vector', () => {
      expect(hasEffectiveThrust([1, 0, 0], 35)).toBe(true);
      expect(hasEffectiveThrust([0, 0, 0], 35)).toBe(false);
      expect(hasEffectiveThrust([1, 0, 0], 0)).toBe(false);
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

  describe('parkBrakeThrustMagnitude', () => {
    it('should clamp to max thrust at or above reference speed', () => {
      const refSpeed = 30 / AU_TO_KM;
      expect(parkBrakeThrustMagnitude(refSpeed)).toBeCloseTo(100, 6);
      expect(parkBrakeThrustMagnitude(refSpeed * 5)).toBe(100);
    });

    it('should clamp to min thrust near zero speed', () => {
      expect(parkBrakeThrustMagnitude(0)).toBe(1);
    });

    it('should scale linearly between min and max', () => {
      const halfRef = 15 / AU_TO_KM;
      expect(parkBrakeThrustMagnitude(halfRef)).toBeCloseTo(50, 6);
    });
  });

  describe('parkBrakeSnapshot', () => {
    it('should face along current velocity and report not stopped while moving forward', () => {
      const v: [number, number, number] = [0, 2e-7, 0];
      const snap = parkBrakeSnapshot(v, [0, 1, 0]);
      expect(snap.reachedStop).toBe(false);
      expect(snap.facingDirection[0]).toBeCloseTo(0, 12);
      expect(snap.facingDirection[1]).toBeCloseTo(1, 12);
      expect(snap.facingDirection[2]).toBeCloseTo(0, 12);
      expect(snap.thrustMagnitude).toBeGreaterThan(0);
    });

    it('should report stopped once velocity crosses the initial forward direction', () => {
      const snap = parkBrakeSnapshot([0, -2e-7, 0], [0, 1, 0]);
      expect(snap.reachedStop).toBe(true);
    });

    it('should report stopped when speed is essentially zero', () => {
      const snap = parkBrakeSnapshot([0, 0, 0], [0, 1, 0]);
      expect(snap.reachedStop).toBe(true);
    });
  });

  describe('parkHoldSnapshot', () => {
    it('faces opposite the local gravitational acceleration to hold a stationary heliocentric position', () => {
      const gravity = computeGravityAcceleration([1, 0, 0], [makeSun()]);
      const hold = parkHoldSnapshot([1, 0, 0], [0, 0, 0], [makeSun()]);

      expect(gravity[0]).toBeLessThan(0);
      expect(hold.facingDirection[0]).toBeGreaterThan(0);
      expect(hold.thrustMagnitude).toBeGreaterThan(0);
    });

    it('adds damping opposite residual heliocentric velocity', () => {
      const hold = parkHoldSnapshot([1, 0, 0], [0, 1e-7, 0], [makeSun()]);

      expect(hold.targetAcceleration[1]).toBeLessThan(0);
      expect(hold.facingDirection[1]).toBeLessThan(0);
    });

    it('caps hold thrust at the spacecraft maximum without changing the target direction', () => {
      const body: BodyInfo = { id: 'heavy', position: [0, 0, 0], mass: 1e38, radius: 1 };
      const hold = parkHoldSnapshot([1, 0, 0], [0, 0, 0], [body]);

      expect(hold.thrustMagnitude).toBe(100);
      expect(hold.facingDirection[0]).toBeGreaterThan(0);
    });
  });

  describe('orbitInsertSnapshot', () => {
    it('prioritizes radial braking when entering orbit with a large climb speed', () => {
      const earth: BodyInfo = {
        id: 'earth',
        position: [0, 0, 0],
        mass: 5.9724e24,
        radius: 6371 / AU_TO_KM,
      };
      const lowOrbitRadius = earth.radius + 430 / AU_TO_KM;
      const snap = orbitInsertSnapshot(
        [lowOrbitRadius, 0, 0],
        [20 / AU_TO_KM, 0, 0],
        earth,
        [0, 0, 0],
      );

      expect(snap.facingDirection[0]).toBeLessThan(-0.99);
      expect(snap.thrustMagnitude).toBe(100);
    });
  });

  describe('clampSpeedToMax', () => {
    it('returns velocity unchanged when below the cap', () => {
      const v: [number, number, number] = [1e-7, 0, 0];
      expect(clampSpeedToMax(v, MAX_SHIP_SPEED_AU_PER_SEC)).toEqual(v);
    });

    it('caps speed at 1000 km/s', () => {
      expect(MAX_SHIP_SPEED_AU_PER_SEC * AU_TO_KM).toBeCloseTo(1000, 6);
    });

    it('scales an over-cap velocity to exactly the cap, preserving direction', () => {
      const over: [number, number, number] = [3 * MAX_SHIP_SPEED_AU_PER_SEC, 4 * MAX_SHIP_SPEED_AU_PER_SEC, 0];
      const clamped = clampSpeedToMax(over, MAX_SHIP_SPEED_AU_PER_SEC);
      const speed = Math.sqrt(clamped[0] ** 2 + clamped[1] ** 2 + clamped[2] ** 2);
      expect(speed).toBeCloseTo(MAX_SHIP_SPEED_AU_PER_SEC, 15);
      // original direction was (0.6, 0.8, 0)
      expect(clamped[0] / speed).toBeCloseTo(0.6, 12);
      expect(clamped[1] / speed).toBeCloseTo(0.8, 12);
    });

    it('returns a zero vector safely', () => {
      expect(clampSpeedToMax([0, 0, 0], MAX_SHIP_SPEED_AU_PER_SEC)).toEqual([0, 0, 0]);
    });
  });
});
