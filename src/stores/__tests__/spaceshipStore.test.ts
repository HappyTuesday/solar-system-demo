import { describe, it, expect, beforeEach } from 'vitest';
import { useSpaceshipStore } from '../spaceshipStore';
import { useExploreStore } from '../exploreStore';
import type { NavigationPlan } from '../../engine/navigation';
import { computeBodyState } from '../../engine/navigation';
import { REAL_DATA, MU_SUN_AU, AU_TO_KM } from '../../engine/constants';
import type { BodyInfo } from '../../engine/spaceship';
import { julianDate } from '../../engine/orbital';

const SUN: BodyInfo = { id: 'sun', position: [0, 0, 0], mass: REAL_DATA.sun.mass, radius: REAL_DATA.sun.radius };

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
    stages: [
      { id: 'rendezvous', target: { kind: 'rendezvous', point } },
      { id: 'gravity-boundary', target: { kind: 'gravity-boundary', bodyId: 'mars' } },
      { id: 'destination', target: { kind: 'body', bodyId: 'mars' } },
    ],
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
    expect(s.currentNavigationTarget).toEqual({
      kind: 'rendezvous',
      point: s.navigationPlan?.rendezvous?.point,
    });
    expect(s.currentNavigationStageIndex).toBe(0);
  });

  it('setTargetBody(null) should clear plan', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    useSpaceshipStore.getState().setTargetBody(null);
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan?.rendezvous).toBeUndefined();
    expect(s.currentNavigationTarget).toBeNull();
    expect(s.currentNavigationStageIndex).toBeNull();
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
      currentNavigationTarget: { kind: 'rendezvous', point: [2, 0, 0] },
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

  it('tangential correction uses full thrust for a large tangential error', () => {
    useSpaceshipStore.setState({
      currentNavigationTarget: { kind: 'rendezvous', point: [2, 0, 0] },
      position: [1, 0, 0],
      velocity: [0, 20 / AU_TO_KM, 0],
      direction: [1, 0, 0],
      gear: 'N',
      attitudeMode: 'prograde',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('T');
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.direction[0]).toBeCloseTo(0, 12);
    expect(s.direction[1]).toBeCloseTo(-1, 12);
    expect(s.direction[2]).toBeCloseTo(0, 12);
    expect(s.thrustMagnitude).toBe(100);
  });

  it('tangential correction keeps the minimum thrust in the fine-adjustment range', () => {
    useSpaceshipStore.setState({
      currentNavigationTarget: { kind: 'rendezvous', point: [2, 0, 0] },
      position: [1, 0, 0],
      velocity: [0, 0.5 / AU_TO_KM, 0],
      direction: [1, 0, 0],
      gear: 'N',
      attitudeMode: 'prograde',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('T');
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    expect(useSpaceshipStore.getState().thrustMagnitude).toBe(1);
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

  it('setGear(P) enters heliocentric holding when speed is essentially zero', () => {
    useSpaceshipStore.setState({
      velocity: [0, 0, 0],
      gear: 'N',
    });

    useSpaceshipStore.getState().setGear('P');

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.parkPhase).toBe('holding');
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

  it('park gear transitions from braking to heliocentric holding after crossing zero', () => {
    useSpaceshipStore.setState({
      position: [1, 0, 0],
      velocity: [0, 2e-7, 0],
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('P');
    useSpaceshipStore.getState().updateParkGear([SUN]);

    let s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.thrust).toEqual([-1, 0, 0]);
    expect(s.direction[1]).toBeCloseTo(1, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);

    // Velocity has crossed through zero to the opposite direction
    useSpaceshipStore.setState({ velocity: [0, -2e-7, 0] });
    useSpaceshipStore.getState().updateParkGear([SUN]);

    s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.parkPhase).toBe('holding');
    expect(s.thrust).toEqual([1, 0, 0]);
    expect(s.thrustMagnitude).toBeGreaterThan(0);
    expect(s.direction[0]).toBeGreaterThan(0);
  });

  it('updateParkGear is a no-op when not in P gear', () => {
    useSpaceshipStore.setState({
      gear: 'D',
      thrust: [1, 0, 0],
      thrustMagnitude: 50,
    });
    useSpaceshipStore.getState().updateParkGear([SUN]);

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
      currentNavigationTarget: { kind: 'rendezvous', point: plan.rendezvous!.point },
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

  it('corrects relative tangential velocity against the destination after rendezvous completion', () => {
    const now = Date.UTC(2027, 4, 13, 6);
    const marsState = computeBodyState('mars', julianDate(now));
    expect(marsState).not.toBeNull();
    if (!marsState) return;

    useSpaceshipStore.setState({
      navigationPlan: null,
      targetBodyId: 'mars',
      currentNavigationTarget: { kind: 'body', bodyId: 'mars' },
      simulatedTime: now,
      position: [marsState.position[0] + 0.01, marsState.position[1], marsState.position[2]],
      velocity: [marsState.velocity[0], marsState.velocity[1] + 1e-6, marsState.velocity[2]],
      attitudeMode: 'target',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('T');
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.thrust).toEqual([1, 0, 0]);
    expect(s.direction[1]).toBeLessThan(0);
  });
});

describe('cruise mode', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
    useExploreStore.getState().reset();
  });

  function setupCruisable() {
    const plan = makeDirectPlan([2, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      currentNavigationTarget: { kind: 'rendezvous', point: plan.rendezvous!.point },
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
    useSpaceshipStore.getState().toggleCruise(1000);
    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.attitudeMode).toBe('rendezvous');
    expect(s.cruisePhase).toBe('coasting');
  });

  it('takes over D gear by clearing thrust, selecting N, and aiming at the rendezvous', () => {
    setupCruisable();
    useSpaceshipStore.setState({
      gear: 'D',
      thrust: [1, 0, 0],
      thrustMagnitude: 50,
      attitudeMode: 'prograde',
    });

    useSpaceshipStore.getState().toggleCruise(1000);

    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.gear).toBe('N');
    expect(s.thrust).toEqual([0, 0, 0]);
    expect(s.attitudeMode).toBe('rendezvous');
  });

  it('toggleCruise does nothing when radial velocity is non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().toggleCruise(1000);
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when rendezvous disappears', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, navigationPlan: null, currentNavigationTarget: null });
    useSpaceshipStore.getState().updateCruise(1000);
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when user takes over with D gear', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, gear: 'D' });
    useSpaceshipStore.getState().updateCruise(1000);
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when radial velocity turns non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().updateCruise(1000);
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise engages T gear when tangential exceeds threshold', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [1e-6, 1e-6, 0] });
    useSpaceshipStore.getState().updateCruise(1000);
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.cruiseActive).toBe(true);
  });

  it('engages T gear when the tangential-to-radial ratio is exactly 0.01', () => {
    setupCruisable();
    useSpaceshipStore.setState({
      cruiseActive: true,
      velocity: [1e-6, 1e-8, 0],
      orbitingBodyId: 'sun',
    });

    useSpaceshipStore.getState().updateCruise(1000);

    expect(useSpaceshipStore.getState().gear).toBe('T');
  });

  it('updateCruise engages P gear and exits when brake is predicted to reach', () => {
    setupCruisable();
    // Fast radial velocity so predicted stop overshoots the 1 AU gap.
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [4e-4, 0, 0] });
    useSpaceshipStore.getState().updateCruise(1000);
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.cruiseActive).toBe(false);
  });

  it('uses seven-day time jumps at 1x instead of raising the simulation time scale', () => {
    setupCruisable();
    const timeBefore = useSpaceshipStore.getState().simulatedTime;
    const plan = makeDirectPlan([2, 0, 0]);
    plan.rendezvous!.rendezvousTime = timeBefore + 10 * 86400 * 1000;
    useSpaceshipStore.setState({ navigationPlan: plan, orbitingBodyId: 'sun' });
    useExploreStore.getState().setTimeScale(1000);
    useSpaceshipStore.setState({ velocity: [1e-6, 0, 0] });

    useSpaceshipStore.getState().toggleCruise(1000);
    expect(useSpaceshipStore.getState().cruiseActive).toBe(true);
    expect(useExploreStore.getState().timeScale).toBe(1);

    useSpaceshipStore.getState().updateCruise(1000);
    expect(useSpaceshipStore.getState().simulatedTime).toBe(timeBefore + 7 * 86400 * 1000);
    expect(useSpaceshipStore.getState().cruiseNextJumpAtMs).toBe(1200);

    useSpaceshipStore.getState().updateCruise(1100);
    expect(useSpaceshipStore.getState().simulatedTime).toBe(timeBefore + 7 * 86400 * 1000);
    expect(useSpaceshipStore.getState().gear).toBe('N');
    expect(useSpaceshipStore.getState().cruiseActive).toBe(true);
  });

  it('checks and engages tangential correction before another time jump', () => {
    setupCruisable();
    useSpaceshipStore.setState({ velocity: [1e-6, 1e-6, 0] });

    useSpaceshipStore.getState().toggleCruise(1000);
    useSpaceshipStore.getState().updateCruise(2000);

    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.gear).toBe('T');
  });

  it('does not jump while tangential correction is active', () => {
    setupCruisable();
    const timeBefore = useSpaceshipStore.getState().simulatedTime;
    useSpaceshipStore.setState({ gear: 'T', cruiseActive: true, cruiseNextJumpAtMs: 0 });

    useSpaceshipStore.getState().updateCruise(1000);

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.simulatedTime).toBe(timeBefore);
  });

  it('keeps cruise active without a time jump inside the final minute before braking', () => {
    const plan = makeDirectPlan([1.00003, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [1e-6, 0, 0],
      thrust: [0, 0, 0],
      thrustMagnitude: 0,
      gear: 'N',
      cruiseActive: true,
      cruisePhase: 'coasting',
      cruiseNextJumpAtMs: 0,
      orbitingBodyId: 'sun',
      currentNavigationTarget: { kind: 'rendezvous', point: plan.rendezvous!.point },
      currentNavigationStageIndex: 0,
    });
    const timeBefore = useSpaceshipStore.getState().simulatedTime;

    useSpaceshipStore.getState().updateCruise(1000);

    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.gear).toBe('N');
    expect(s.simulatedTime).toBe(timeBefore);
  });

  it('engages P at the braking window and restores the prior time scale', () => {
    setupCruisable();
    useExploreStore.getState().setTimeScale(1000);
    useSpaceshipStore.setState({ velocity: [4e-4, 0, 0] });

    useSpaceshipStore.getState().toggleCruise(1000);
    useSpaceshipStore.getState().updateCruise(1000);

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.cruiseActive).toBe(false);
    expect(useExploreStore.getState().timeScale).toBe(1000);
  });

  it('completes rendezvous by engaging P without changing physical state', () => {
    const plan = makeDirectPlan([1.04, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      currentNavigationTarget: { kind: 'rendezvous', point: plan.rendezvous!.point },
      currentNavigationStageIndex: 0,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [1e-6, 2e-7, 0],
      gear: 'N',
      cruiseActive: false,
    });

    useSpaceshipStore.getState().maybeCompleteRendezvous();
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan?.rendezvous).toBeUndefined();
    expect(s.position).toEqual([1, 0, 0]);
    expect(s.velocity).toEqual([1e-6, 2e-7, 0]);
    expect(s.gear).toBe('P');
    expect(s.currentNavigationTarget).toEqual({ kind: 'gravity-boundary', bodyId: 'mars' });
    expect(s.currentNavigationStageIndex).toBe(1);
  });

  it('keeps the gravity-boundary stage active until the ship approaches the Hill boundary', () => {
    const now = Date.UTC(2027, 4, 13, 6);
    const marsState = computeBodyState('mars', julianDate(now));
    expect(marsState).not.toBeNull();
    if (!marsState) return;
    const hillRadius = REAL_DATA.mars.semiMajorAxis! * Math.pow(
      REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass),
      1 / 3,
    );
    const plan = makeDirectPlan();
    useSpaceshipStore.setState({
      navigationPlan: plan,
      currentNavigationTarget: { kind: 'gravity-boundary', bodyId: 'mars' },
      currentNavigationStageIndex: 1,
      targetBodyId: 'mars',
      simulatedTime: now,
      position: [marsState.position[0] + hillRadius * 2, marsState.position[1], marsState.position[2]],
      velocity: marsState.velocity,
      gear: 'N',
    });

    useSpaceshipStore.getState().maybeCompleteRendezvous();

    const s = useSpaceshipStore.getState();
    expect(s.currentNavigationStageIndex).toBe(1);
    expect(s.currentNavigationTarget).toEqual({ kind: 'gravity-boundary', bodyId: 'mars' });
  });
});
