import { describe, it, expect, beforeEach } from 'vitest';
import { useSpaceshipStore } from '../spaceshipStore';
import type { NavigationPlan } from '../../engine/navigation';
import { REAL_DATA, MU_SUN_AU, AU_TO_KM } from '../../engine/constants';

function makeDirectPlan(point: [number, number, number] = [2, 0, 0]): NavigationPlan {
  return {
    destinationId: 'mars',
    plannedAt: 0,
    rendezvous: {
      point,
      plannedFrom: [1, 0, 0],
      targetTimeToRendezvousSec: 86400,
      shipIdealCruiseSpeedAUPerSec: 100 / AU_TO_KM,
      arrivalMaxRelativeSpeedAUPerSec: 0.65 / AU_TO_KM,
      rendezvousTime: 86400 * 1000,
      validUntil: 86400 * 1000,
    },
  };
}

describe('spaceshipStore navigation lifecycle', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
    const aEarth = REAL_DATA.earth.semiMajorAxis!;
    const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
    useSpaceshipStore.setState({
      position: [aEarth, 0, 0],
      velocity: [0, vEarth, 0],
      attitudeMode: 'prograde',
      simulatedTime: Date.now(),
    });
  });

  it('setTargetBody should populate plan with phases', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan).not.toBeNull();
    expect(s.navigationPlan?.destinationId).toBe('mars');
    expect(s.navigationPlan?.rendezvous).toBeDefined();
  });

  it('setTargetBody(null) should clear plan', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    useSpaceshipStore.getState().setTargetBody(null);
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan).toBeNull();
  });

  it('maybeReplanRendezvous should replace an expired uncaptured rendezvous plan', () => {
    const now = Date.UTC(2027, 4, 13, 6);
    const oldPlan = makeDirectPlan([2, 0, 0]);
    oldPlan.plannedAt = now - 10_000;
    oldPlan.rendezvous!.rendezvousTime = now - 1;
    useSpaceshipStore.setState({
      targetBodyId: 'mars',
      navigationPlan: oldPlan,
      simulatedTime: now,
      orbitingBodyId: 'sun',
      position: [1, 0, 0],
      velocity: [0, Math.sqrt(MU_SUN_AU), 0],
    });

    useSpaceshipStore.getState().maybeReplanRendezvous();
    const s2 = useSpaceshipStore.getState();

    expect(s2.navigationPlan?.rendezvous?.rendezvousTime).toBeGreaterThan(now);
    expect(s2.navigationPlan?.rendezvous?.point).not.toEqual([2, 0, 0]);
  });

  it('maybeReplanRendezvous should keep the plan before rendezvous time or after target capture', () => {
    const now = Date.UTC(2027, 4, 13, 6);
    const futurePlan = makeDirectPlan([2, 0, 0]);
    futurePlan.rendezvous!.rendezvousTime = now + 1_000;
    useSpaceshipStore.setState({
      targetBodyId: 'mars',
      navigationPlan: futurePlan,
      simulatedTime: now,
      orbitingBodyId: 'sun',
    });

    useSpaceshipStore.getState().maybeReplanRendezvous();
    expect(useSpaceshipStore.getState().navigationPlan?.rendezvous?.point).toEqual([2, 0, 0]);

    const capturedPlan = makeDirectPlan([3, 0, 0]);
    capturedPlan.rendezvous!.rendezvousTime = now - 1;
    useSpaceshipStore.setState({
      targetBodyId: 'mars',
      navigationPlan: capturedPlan,
      simulatedTime: now,
      orbitingBodyId: 'mars',
    });

    useSpaceshipStore.getState().maybeReplanRendezvous();
    expect(useSpaceshipStore.getState().navigationPlan?.rendezvous?.point).toEqual([3, 0, 0]);
  });

  it('guided D gear setup should keep visible thrust magnitude and actual forward thrust in sync', () => {
    useSpaceshipStore.getState().setThrustMagnitude(35);
    useSpaceshipStore.getState().setGear('D');

    const s = useSpaceshipStore.getState();
    expect(s.thrustMagnitude).toBe(35);
    expect(s.gear).toBe('D');
    expect(s.thrust[0]).toBe(1);
  });

  it('neutral gear keeps the visible throttle but clears all effective thrust', () => {
    useSpaceshipStore.getState().setThrustMagnitude(35);
    useSpaceshipStore.getState().setGear('D');
    useSpaceshipStore.getState().setForwardThrust(1);
    useSpaceshipStore.getState().setLateralThrust(1);
    useSpaceshipStore.getState().setVerticalThrust(-1);
    useSpaceshipStore.getState().setGear('N');

    const s = useSpaceshipStore.getState();
    expect(s.thrustMagnitude).toBe(35);
    expect(s.gear).toBe('N');
    expect(s.thrust).toEqual([0, 0, 0]);
  });

  it('tangential correction gear turns toward tangential counter-thrust and returns to neutral after crossing zero', () => {
    useSpaceshipStore.setState({
      navigationPlan: makeDirectPlan(),
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [0, 1e-7, 0],
      direction: [1, 0, 0],
      thrustMagnitude: 80,
      thrust: [0, 0.25, -0.25],
      gear: 'N',
      attitudeMode: 'prograde',
    });

    useSpaceshipStore.getState().setGear('T');
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    let s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.thrust).toEqual([1, 0, 0]);
    expect(s.direction[0]).toBeCloseTo(0, 12);
    expect(s.direction[1]).toBeCloseTo(-1, 12);
    expect(s.direction[2]).toBeCloseTo(0, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);
    expect(s.thrustMagnitude).toBeLessThan(80);

    const rendezvousDirection: [number, number, number] = [1, 0, 0];
    expect(s.direction[0] * rendezvousDirection[0] + s.direction[1] * rendezvousDirection[1] + s.direction[2] * rendezvousDirection[2])
      .toBeCloseTo(0, 12);

    useSpaceshipStore.setState({ velocity: [0, -1e-7, 0] });
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.thrust).toEqual([0, 0, 0]);
    expect(s.thrustMagnitude).toBe(0);
  });

  it('guided neutral setup should clear actual forward thrust', () => {
    useSpaceshipStore.getState().setThrustMagnitude(35);
    useSpaceshipStore.getState().setGear('D');
    useSpaceshipStore.getState().setThrustMagnitude(0);
    useSpaceshipStore.getState().setGear('N');

    const s = useSpaceshipStore.getState();
    expect(s.thrustMagnitude).toBe(0);
    expect(s.gear).toBe('N');
    expect(s.thrust[0]).toBe(0);
  });

  it('yawDegrees should support 0.1 degree attitude adjustment', () => {
    useSpaceshipStore.setState({
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
    });

    useSpaceshipStore.getState().yawDegrees(0.1);

    const s = useSpaceshipStore.getState();
    const expectedAngle = Math.PI / 1800;
    expect(s.direction[0]).toBeCloseTo(Math.cos(expectedAngle), 12);
    expect(s.direction[1]).toBeCloseTo(Math.sin(expectedAngle), 12);
    expect(s.direction[2]).toBeCloseTo(0, 12);
    expect(s.attitudeMode).toBe('inertial');
  });

  it('pitchDegrees should support larger attitude steps through the same degree API', () => {
    useSpaceshipStore.setState({
      direction: [1, 0, 0],
      attitudeMode: 'target',
    });

    useSpaceshipStore.getState().pitchDegrees(10);

    const s = useSpaceshipStore.getState();
    const expectedAngle = Math.PI / 18;
    expect(s.direction[0]).toBeCloseTo(Math.cos(expectedAngle), 12);
    expect(s.direction[1]).toBeCloseTo(0, 12);
    expect(s.direction[2]).toBeCloseTo(Math.sin(expectedAngle), 12);
    expect(s.attitudeMode).toBe('inertial');
  });

  it('timeJump should update position, velocity, and simulatedTime', () => {
    useSpaceshipStore.getState().reset();
    const posBefore = [...useSpaceshipStore.getState().position];
    const timeBefore = useSpaceshipStore.getState().simulatedTime;

    useSpaceshipStore.getState().timeJump(timeBefore + 3600000);

    const s = useSpaceshipStore.getState();
    expect(s.simulatedTime).toBe(timeBefore + 3600000);
    expect(s.position[0]).not.toBe(posBefore[0]);
    expect(s.direction.length).toBe(3);
  });

  it('timeJump should preserve the active direct rendezvous point before the rendezvous window is exhausted', () => {
    const timeBefore = Date.UTC(2027, 4, 13, 6);
    const plan = makeDirectPlan([2, 0.5, 0]);
    plan.plannedAt = timeBefore;
    plan.rendezvous!.rendezvousTime = timeBefore + 10 * 86400 * 1000;
    plan.rendezvous!.validUntil = timeBefore + 2 * 86400 * 1000;
    useSpaceshipStore.setState({
      simulatedTime: timeBefore,
      targetBodyId: 'mars',
      navigationPlan: plan,
      orbitingBodyId: 'sun',
    });

    useSpaceshipStore.getState().timeJump(timeBefore + 3600 * 1000);

    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan?.rendezvous?.point).toEqual([2, 0.5, 0]);
  });

  it('timeJump should be a no-op when orbitingBodyId is null', () => {
    useSpaceshipStore.getState().reset();
    useSpaceshipStore.setState({ orbitingBodyId: null });
    const posBefore = [...useSpaceshipStore.getState().position];
    const timeBefore = useSpaceshipStore.getState().simulatedTime;

    useSpaceshipStore.getState().timeJump(timeBefore + 6000000);

    const s = useSpaceshipStore.getState();
    expect(s.position[0]).toBe(posBefore[0]);
    expect(s.simulatedTime).toBe(timeBefore);
  });

  it('replanNavigation should generate a fresh rendezvous-only plan', () => {
    useSpaceshipStore.getState().setTargetBody('mars');

    useSpaceshipStore.getState().replanNavigation();
    const s2 = useSpaceshipStore.getState();
    expect(s2.navigationPlan).not.toBeNull();
    expect(s2.navigationPlan?.destinationId).toBe('mars');
    expect(s2.navigationPlan?.rendezvous).toBeDefined();
  });

  it('setGear(P) faces prograde, applies reverse brake thrust, and records initial direction', () => {
    useSpaceshipStore.setState({
      position: [1, 0, 0],
      velocity: [0, 2e-7, 0],
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('P');

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.thrust).toEqual([-1, 0, 0]);
    expect(s.direction[0]).toBeCloseTo(0, 12);
    expect(s.direction[1]).toBeCloseTo(1, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);
    expect(s.parkInitialDirection).not.toBeNull();
  });

  it('setGear(P) falls back to N when speed is essentially zero', () => {
    useSpaceshipStore.setState({
      velocity: [0, 0, 0],
      gear: 'N',
    });

    useSpaceshipStore.getState().setGear('P');

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.parkInitialDirection).toBeNull();
  });

  it('leaving P clears parkInitialDirection', () => {
    useSpaceshipStore.setState({
      velocity: [0, 2e-7, 0],
      gear: 'N',
      thrustMagnitude: 0,
    });
    useSpaceshipStore.getState().setGear('P');
    expect(useSpaceshipStore.getState().parkInitialDirection).not.toBeNull();

    useSpaceshipStore.getState().setGear('N');
    expect(useSpaceshipStore.getState().parkInitialDirection).toBeNull();
  });

  it('thrust setters are inert while in P gear', () => {
    useSpaceshipStore.setState({
      velocity: [0, 2e-7, 0],
      gear: 'N',
      thrustMagnitude: 0,
    });
    useSpaceshipStore.getState().setGear('P');

    useSpaceshipStore.getState().setLateralThrust(1);
    useSpaceshipStore.getState().setVerticalThrust(1);

    const s = useSpaceshipStore.getState();
    expect(s.thrust[1]).toBe(0);
    expect(s.thrust[2]).toBe(0);
  });

  it('park gear brakes while moving forward and returns to neutral after crossing zero', () => {
    useSpaceshipStore.setState({
      position: [1, 0, 0],
      velocity: [0, 2e-7, 0],
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('P');
    useSpaceshipStore.getState().updateParkGear();

    let s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.thrust).toEqual([-1, 0, 0]);
    expect(s.direction[1]).toBeCloseTo(1, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);

    // Velocity has crossed through zero to the opposite direction
    useSpaceshipStore.setState({ velocity: [0, -2e-7, 0] });
    useSpaceshipStore.getState().updateParkGear();

    s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.thrust).toEqual([0, 0, 0]);
    expect(s.thrustMagnitude).toBe(0);
    expect(s.parkInitialDirection).toBeNull();
  });

  it('updateParkGear is a no-op when not in P gear', () => {
    useSpaceshipStore.setState({
      gear: 'D',
      thrust: [1, 0, 0],
      thrustMagnitude: 50,
    });
    useSpaceshipStore.getState().updateParkGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('D');
    expect(s.thrust).toEqual([1, 0, 0]);
    expect(s.thrustMagnitude).toBe(50);
  });
});

describe('T-gear attitude restore', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
  });

  it('restores previous attitude mode after tangential correction completes', () => {
    const plan = makeDirectPlan([2, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [0.001, 0.001, 0], // tangential non-zero -> T engages
      attitudeMode: 'rendezvous',
    });

    useSpaceshipStore.getState().setGear('T');
    expect(useSpaceshipStore.getState().gear).toBe('T');

    // Run the active correction so attitude flips to 'inertial'.
    useSpaceshipStore.getState().updateTangentialCorrectionGear();
    expect(useSpaceshipStore.getState().attitudeMode).toBe('inertial');

    // Force tangential to zero so the correction completes and returns to N.
    useSpaceshipStore.setState({ velocity: [0.001, 0, 0] });
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.attitudeMode).toBe('rendezvous');
  });
});

describe('cruise mode', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
  });

  function setupCruisable() {
    const plan = makeDirectPlan([2, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [1e-6, 0, 0], // radial positive, tiny
      thrust: [0, 0, 0],
      thrustMagnitude: 0,
      gear: 'N',
      attitudeMode: 'prograde',
      cruiseActive: false,
    });
  }

  it('toggleCruise enables only when preconditions hold and sets rendezvous attitude', () => {
    setupCruisable();
    useSpaceshipStore.getState().toggleCruise();
    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.attitudeMode).toBe('rendezvous');
  });

  it('toggleCruise does nothing when radial velocity is non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().toggleCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when rendezvous disappears', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, navigationPlan: null });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when user takes over with D gear', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, gear: 'D' });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when radial velocity turns non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise engages T gear when tangential exceeds threshold', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [1e-6, 1e-6, 0] });
    useSpaceshipStore.getState().updateCruise();
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.cruiseActive).toBe(true);
  });

  it('updateCruise engages P gear and exits when brake is predicted to reach', () => {
    setupCruisable();
    // Fast radial velocity so predicted stop overshoots the 1 AU gap.
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [4e-4, 0, 0] });
    useSpaceshipStore.getState().updateCruise();
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.cruiseActive).toBe(false);
  });
});
