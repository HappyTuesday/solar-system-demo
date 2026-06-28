import { describe, it, expect } from 'vitest';
import type { SpaceshipState } from '../../types';
import { stateVectors, julianDate, orbitalPeriod } from '../orbital';
import { createSpaceshipState } from '../orbitalInjection';
import {
  cartesianToKepler,
  computeAllBodyStates,
  jumpSpaceshipState,
  simulateToTime,
} from '../timeJump';
import { REAL_DATA, MU_SUN_AU, G_AU } from '../constants';
import { computeBodyState } from '../navigation';
import { type BodyInfo } from '../spaceship';

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

function makeCircularShip(
  rAU: number,
  mu: number = MU_SUN_AU,
): SpaceshipState {
  const vCircular = Math.sqrt(mu / rAU);
  return {
    position: [rAU, 0, 0],
    velocity: [0, vCircular, 0],
    direction: [0, 1, 0],
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
  };
}

describe('cartesianToKepler', () => {
  it('should recover circular orbit elements', () => {
    const a = 1;
    const sv = stateVectors(a, 0, 0, 0, 0, 0, MU_SUN_AU);
    const elements = cartesianToKepler(sv.position, sv.velocity, MU_SUN_AU);
    expect(elements.semiMajorAxis).toBeCloseTo(a, 8);
    expect(elements.eccentricity).toBeCloseTo(0, 8);
    expect(elements.inclination).toBeCloseTo(0, 8);
  });

  it('should recover eccentric orbit elements', () => {
    const a = 1.5;
    const e = 0.3;
    const sv = stateVectors(a, e, 0, 0, 0, 1.0, MU_SUN_AU);
    const elements = cartesianToKepler(sv.position, sv.velocity, MU_SUN_AU);
    expect(elements.semiMajorAxis).toBeCloseTo(a, 8);
    expect(elements.eccentricity).toBeCloseTo(e, 8);
  });

  it('should recover inclined orbit elements', () => {
    const i = Math.PI / 6;
    const sv = stateVectors(1, 0, i, 1, 0, 0, MU_SUN_AU);
    const elements = cartesianToKepler(sv.position, sv.velocity, MU_SUN_AU);
    expect(elements.inclination).toBeCloseTo(i, 8);
  });

  it('should round-trip: elements → state → elements', () => {
    const sv = stateVectors(1, 0.2, 0.5, 1.0, 2.0, 3.0, MU_SUN_AU);
    const elements = cartesianToKepler(sv.position, sv.velocity, MU_SUN_AU);

    // Reconstruct state from recovered elements
    const sv2 = stateVectors(
      elements.semiMajorAxis,
      elements.eccentricity,
      elements.inclination,
      elements.raan,
      elements.argPeriapsis,
      elements.trueAnomaly,
      MU_SUN_AU,
    );

    // Positions should match closely
    expect(sv2.position[0]).toBeCloseTo(sv.position[0], 8);
    expect(sv2.position[1]).toBeCloseTo(sv.position[1], 8);
    expect(sv2.position[2]).toBeCloseTo(sv.position[2], 8);
    // Velocities should match closely
    expect(sv2.velocity[0]).toBeCloseTo(sv.velocity[0], 8);
    expect(sv2.velocity[1]).toBeCloseTo(sv.velocity[1], 8);
    expect(sv2.velocity[2]).toBeCloseTo(sv.velocity[2], 8);
  });

  it('should compute correct period for circular orbit', () => {
    const a = 1;
    const sv = stateVectors(a, 0, 0, 0, 0, 0, MU_SUN_AU);
    const elements = cartesianToKepler(sv.position, sv.velocity, MU_SUN_AU);
    const expectedPeriod = orbitalPeriod(a, MU_SUN_AU);
    expect(elements.period).toBeCloseTo(expectedPeriod, 8);
  });
});

describe('computeAllBodyStates', () => {
  it('should return sun at origin', () => {
    const states = computeAllBodyStates(julianDate(J2000));
    expect(states['sun'].position[0]).toBeCloseTo(0, 8);
    expect(states['sun'].position[1]).toBeCloseTo(0, 8);
    expect(states['sun'].position[2]).toBeCloseTo(0, 8);
  });

  it('should return all 8 planets', () => {
    const states = computeAllBodyStates(julianDate(J2000));
    const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    for (const id of planetIds) {
      expect(states[id]).toBeDefined();
      expect(states[id].position.length).toBe(3);
      expect(states[id].velocity.length).toBe(3);
    }
  });

  it('should produce different positions at different times', () => {
    const jd1 = julianDate(J2000);
    const jd2 = julianDate(J2000 + 86400000); // 1 day later
    const states1 = computeAllBodyStates(jd1);
    const states2 = computeAllBodyStates(jd2);
    const dist = Math.sqrt(
      (states2['earth'].position[0] - states1['earth'].position[0]) ** 2 +
      (states2['earth'].position[1] - states1['earth'].position[1]) ** 2 +
      (states2['earth'].position[2] - states1['earth'].position[2]) ** 2
    );
    expect(dist).toBeGreaterThan(0);
  });

  it('should match computeBodyState from navigation', () => {
    const jd = julianDate(J2000);
    const myStates = computeAllBodyStates(jd);
    for (const id of Object.keys(REAL_DATA)) {
      if (id === 'sun') continue;
      const ref = computeBodyState(id, jd);
      if (!ref) continue;
      expect(myStates[id].position[0]).toBeCloseTo(ref.position[0], 8);
      expect(myStates[id].position[1]).toBeCloseTo(ref.position[1], 8);
      expect(myStates[id].position[2]).toBeCloseTo(ref.position[2], 8);
    }
  });
});

describe('jumpSpaceshipState', () => {
  it('should jump 1 hour and produce consistent state', () => {
    const state = createSpaceshipState('earth', undefined, J2000);
    const jumped = jumpSpaceshipState(state, 'earth', J2000, J2000 + 3600000);
    expect(jumped.position.length).toBe(3);
    expect(jumped.velocity.length).toBe(3);
    expect(jumped.direction.length).toBe(3);
    expect(jumped.exploded).toBe(false);
    expect(jumped.thrustMagnitude).toBe(state.thrustMagnitude);
  });

  it('should be near the Earth position at both times', () => {
    const state = createSpaceshipState('earth', undefined, J2000);
    const jd = julianDate(J2000);
    const earthState1 = computeBodyState('earth', jd);

    const jumped = jumpSpaceshipState(state, 'earth', J2000, J2000 + 3600000);
    const jd2 = julianDate(J2000 + 3600000);
    const earthState2 = computeBodyState('earth', jd2);

    if (earthState1 && earthState2) {
      // Distance from ship to Earth center should be small (orbiting nearby)
      const dist1 = Math.sqrt(
        (state.position[0] - earthState1.position[0]) ** 2 +
        (state.position[1] - earthState1.position[1]) ** 2 +
        (state.position[2] - earthState1.position[2]) ** 2
      );
      const dist2 = Math.sqrt(
        (jumped.position[0] - earthState2.position[0]) ** 2 +
        (jumped.position[1] - earthState2.position[1]) ** 2 +
        (jumped.position[2] - earthState2.position[2]) ** 2
      );
      // After jumping, ship should still be near the Earth (within ~0.01 AU)
      expect(dist1).toBeLessThan(0.01);
      expect(dist2).toBeLessThan(0.01);
    }
  });

  it('should conserve specific orbital energy relative to orbiting body', () => {
    const state = createSpaceshipState('earth', undefined, J2000);
    const jd = julianDate(J2000);
    const earthState1 = computeBodyState('earth', jd);

    const jumped = jumpSpaceshipState(state, 'earth', J2000, J2000 + 3600000);
    const jd2 = julianDate(J2000 + 3600000);
    const earthState2 = computeBodyState('earth', jd2);

    if (earthState1 && earthState2) {
      // Relative position/velocity to Earth
      const relPos = [
        state.position[0] - earthState1.position[0],
        state.position[1] - earthState1.position[1],
        state.position[2] - earthState1.position[2],
      ];
      const relVel = [
        state.velocity[0] - earthState1.velocity[0],
        state.velocity[1] - earthState1.velocity[1],
        state.velocity[2] - earthState1.velocity[2],
      ];
      const muEarth = G_AU * REAL_DATA.earth.mass;
      const r1 = Math.sqrt(relPos[0] ** 2 + relPos[1] ** 2 + relPos[2] ** 2);
      const v1_2 = relVel[0] ** 2 + relVel[1] ** 2 + relVel[2] ** 2;
      const energy1 = v1_2 / 2 - muEarth / r1;

      const relPos2 = [
        jumped.position[0] - earthState2.position[0],
        jumped.position[1] - earthState2.position[1],
        jumped.position[2] - earthState2.position[2],
      ];
      const relVel2 = [
        jumped.velocity[0] - earthState2.velocity[0],
        jumped.velocity[1] - earthState2.velocity[1],
        jumped.velocity[2] - earthState2.velocity[2],
      ];
      const r2 = Math.sqrt(relPos2[0] ** 2 + relPos2[1] ** 2 + relPos2[2] ** 2);
      const v2_2 = relVel2[0] ** 2 + relVel2[1] ** 2 + relVel2[2] ** 2;
      const energy2 = v2_2 / 2 - muEarth / r2;

      expect(energy1).toBeCloseTo(energy2, 6);
    }
  });

  it('should handle orbiting around Sun', () => {
    const ship = makeCircularShip(1.0, MU_SUN_AU);
    const jumped = jumpSpaceshipState(ship, 'sun', J2000, J2000 + 3600000);
    expect(jumped.position.length).toBe(3);
    // Distance from Sun should be preserved
    const r1 = Math.sqrt(ship.position[0] ** 2 + ship.position[1] ** 2 + ship.position[2] ** 2);
    const r2 = Math.sqrt(jumped.position[0] ** 2 + jumped.position[1] ** 2 + jumped.position[2] ** 2);
    expect(r2).toBeCloseTo(r1, 6);
  });

  it('should update direction vector to match new velocity', () => {
    const state = createSpaceshipState('earth', undefined, J2000);
    const jumped = jumpSpaceshipState(state, 'earth', J2000, J2000 + 60000);
    const vMag = Math.sqrt(
      jumped.velocity[0] ** 2 + jumped.velocity[1] ** 2 + jumped.velocity[2] ** 2
    );
    if (vMag > 0) {
      const dirDot = (
        jumped.direction[0] * jumped.velocity[0] / vMag +
        jumped.direction[1] * jumped.velocity[1] / vMag +
        jumped.direction[2] * jumped.velocity[2] / vMag
      );
      expect(dirDot).toBeCloseTo(1, 10);
    }
  });
});

describe('consistency: time jump vs physical simulation', () => {
  function getMovingBodies(initialTime: number, timeOffset: number): BodyInfo[] {
    const currentTimeMs = initialTime + timeOffset * 1000;
    const jd = julianDate(currentTimeMs);
    const bodies: BodyInfo[] = [];
    bodies.push({ id: 'sun', position: [0, 0, 0], mass: REAL_DATA.sun.mass, radius: REAL_DATA.sun.radius });
    for (const id of Object.keys(REAL_DATA)) {
      if (id === 'sun') continue;
      const data = REAL_DATA[id];
      if (!data || !data.semiMajorAxis || !data.orbital) continue;
      const state = computeBodyState(id, jd);
      if (!state) continue;
      bodies.push({
        id,
        position: [state.position[0], state.position[1], state.position[2]],
        mass: data.mass,
        radius: data.radius,
      });
    }
    return bodies;
  }

  it('should match physical simulation within tolerance (1 hour)', () => {
    const now = J2000;
    const ship = createSpaceshipState('earth', undefined, now);

    // Jump to 1 hour later
    const jumped = jumpSpaceshipState(ship, 'earth', now, now + 3600000);

    // Run physical simulation for 1 hour
    const simShip: SpaceshipState = {
      ...ship,
      position: [...ship.position],
      velocity: [...ship.velocity],
    } as SpaceshipState;
    const getBodies = (offset: number) => getMovingBodies(now, offset);
    simulateToTime(simShip, getBodies, now, now + 3600000, 200);

    // Compare positions (AU) — should be very close
    const posDiff = Math.sqrt(
      (simShip.position[0] - jumped.position[0]) ** 2 +
      (simShip.position[1] - jumped.position[1]) ** 2 +
      (simShip.position[2] - jumped.position[2]) ** 2
    );
    // Position difference should be small (< ~750 km = 5e-6 AU)
    expect(posDiff).toBeLessThan(5e-6);

    // Velocity difference should be small
    const velDiff = Math.sqrt(
      (simShip.velocity[0] - jumped.velocity[0]) ** 2 +
      (simShip.velocity[1] - jumped.velocity[1]) ** 2 +
      (simShip.velocity[2] - jumped.velocity[2]) ** 2
    );
    expect(velDiff).toBeLessThan(1e-10);
  });

  it('should match physical simulation within tolerance (1 day)', () => {
    const now = J2000;
    const ship = createSpaceshipState('earth', undefined, now);
    const jumped = jumpSpaceshipState(ship, 'earth', now, now + 86400000);

    const simShip: SpaceshipState = {
      ...ship,
      position: [...ship.position],
      velocity: [...ship.velocity],
    } as SpaceshipState;
    const getBodies = (offset: number) => getMovingBodies(now, offset);
    simulateToTime(simShip, getBodies, now, now + 86400000, 10000);

    const posDiff = Math.sqrt(
      (simShip.position[0] - jumped.position[0]) ** 2 +
      (simShip.position[1] - jumped.position[1]) ** 2 +
      (simShip.position[2] - jumped.position[2]) ** 2
    );
    // For 1 day, position diff should still be small (< ~1500 km = 1e-5 AU)
    expect(posDiff).toBeLessThan(1e-5);
  });

  it('should match physical simulation within tolerance (circular solar orbit, 1 day)', () => {
    const now = J2000;
    const ship = makeCircularShip(1.0, MU_SUN_AU);
    const jumped = jumpSpaceshipState(ship, 'sun', now, now + 86400000);

    const simShip: SpaceshipState = {
      ...ship,
      position: [...ship.position],
      velocity: [...ship.velocity],
    } as SpaceshipState;
    const getBodies = (offset: number) => getMovingBodies(now, offset);
    simulateToTime(simShip, getBodies, now, now + 86400000, 200);

    const posDiff = Math.sqrt(
      (simShip.position[0] - jumped.position[0]) ** 2 +
      (simShip.position[1] - jumped.position[1]) ** 2 +
      (simShip.position[2] - jumped.position[2]) ** 2
    );
    expect(posDiff).toBeLessThan(1e-6);
  });
});
