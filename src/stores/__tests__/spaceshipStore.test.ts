import { describe, it, expect, beforeEach } from 'vitest';
import { useSpaceshipStore } from '../spaceshipStore';
import type { NavigationPhase, NavigationPlan } from '../../engine/navigation';
import { computeBodyState } from '../../engine/navigation';
import { REAL_DATA, MU_SUN_AU, G_AU, AU_TO_KM } from '../../engine/constants';
import { julianDate } from '../../engine/orbital';

function makePhase(
  name: string, thrustDir: 'forward' | 'backward' | 'none', mag: number, targetSMA: number,
): NavigationPhase {
  return {
    index: 0, name, thrustDirection: thrustDir, thrustMagnitude: mag,
    deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: targetSMA, eccentricity: 0.3 },
  };
}

function makeDirectPlan(point: [number, number, number] = [2, 0, 0]): NavigationPlan {
  return {
    method: 'direct-rendezvous',
    destinationId: 'mars',
    plannedAt: 0,
    phases: [
      {
        index: 0,
        name: '加速到汇合滑行速度',
        thrustDirection: 'forward',
        thrustMagnitude: 100,
        deltaV: 0,
        expectedSpeedKms: 0,
        targetOrbit: { semiMajorAxis: REAL_DATA.mars.semiMajorAxis!, eccentricity: 0.2 },
      },
    ],
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
    expect(s.activePhaseIndex).toBe(0);
    expect(s.navigationPlan!.phases.length).toBeGreaterThanOrEqual(4);
  });

  it('setTargetBody(null) should clear plan', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    useSpaceshipStore.getState().setTargetBody(null);
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan).toBeNull();
    expect(s.activePhaseIndex).toBe(-1);
  });

  it('checkNavigationalDeviation should NOT advance phase when burn is incomplete', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    const plan = s.navigationPlan!;
    // Replace phases with test phase that won't complete
    plan.phases = [
      makePhase('提升远日点', 'forward', 100, 2.0),
    ];
    useSpaceshipStore.setState({ navigationPlan: { ...plan }, activePhaseIndex: 0 });

    const phaseBefore = useSpaceshipStore.getState().activePhaseIndex;
    useSpaceshipStore.getState().checkNavigationalDeviation();
    expect(useSpaceshipStore.getState().activePhaseIndex).toBe(phaseBefore);
  });

  it('checkNavigationalDeviation should advance phase when burn is complete', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    const aTransferAU = (1.0 + REAL_DATA.mars.semiMajorAxis!) / 2;
    const plan = s.navigationPlan!;
    plan.phases = [
      makePhase('提升远日点', 'forward', 100, aTransferAU),
      makePhase('转移轨道滑行', 'none', 0, aTransferAU),
    ];
    // Ship far from Earth (in interplanetary space) with correct transfer orbit velocity
    const shipR = 1.01; // slightly beyond 1 AU, away from Earth
    const vBurn = Math.sqrt(MU_SUN_AU * (2 / shipR - 1 / aTransferAU));
    useSpaceshipStore.setState({
      navigationPlan: { ...plan },
      targetBodyId: 'venus',
      activePhaseIndex: 0,
      position: [shipR, 0, 0],
      velocity: [0, vBurn, 0],
      orbitingBodyId: 'sun', // ensure we skip SOI check
    });

    useSpaceshipStore.getState().checkNavigationalDeviation();
    const s2 = useSpaceshipStore.getState();
    expect(s2.activePhaseIndex).toBe(1);
  });

  it('checkNavigationalDeviation should NOT crash when no plan', () => {
    useSpaceshipStore.getState().setTargetBody(null);
    expect(() => useSpaceshipStore.getState().checkNavigationalDeviation()).not.toThrow();
  });

  it('phase advance should not change manual thrust controls', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    const aTransferAU = (1.0 + REAL_DATA.mars.semiMajorAxis!) / 2;
    const plan = s.navigationPlan!;
    plan.phases = [
      makePhase('提升远日点', 'forward', 100, aTransferAU),
      makePhase('转移轨道滑行', 'none', 0, aTransferAU),
    ];
    const shipR = 1.01;
    const vBurn = Math.sqrt(MU_SUN_AU * (2 / shipR - 1 / aTransferAU));
    useSpaceshipStore.setState({
      navigationPlan: { ...plan },
      targetBodyId: 'venus',
      activePhaseIndex: 0,
      position: [shipR, 0, 0],
      velocity: [0, vBurn, 0],
      orbitingBodyId: 'sun',
      thrustMagnitude: 100,
      thrust: [1, 0, 0],
      gear: 'D',
    });

    useSpaceshipStore.getState().checkNavigationalDeviation();
    const s2 = useSpaceshipStore.getState();
    expect(s2.activePhaseIndex).toBe(1);
    expect(s2.gear).toBe('D');
    expect(s2.thrustMagnitude).toBe(100);
    expect(s2.thrust).toEqual([1, 0, 0]);
  });

  it('Mars live directives should not let the legacy plan check clear freshly applied thrust', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    const plan = s.navigationPlan!;
    plan.method = 'hohmann';
    plan.phases = [
      makePhase('提升远日点', 'forward', 100, 1),
      makePhase('转移轨道滑行', 'none', 0, 1),
    ];
    useSpaceshipStore.setState({
      targetBodyId: 'mars',
      navigationPlan: { ...plan },
      activePhaseIndex: 0,
      position: [1, 0, 0],
      velocity: [0, Math.sqrt(MU_SUN_AU), 0],
      orbitingBodyId: 'sun',
      thrustMagnitude: 1,
      thrust: [1, 0, 0],
      gear: 'D',
    });

    useSpaceshipStore.getState().checkNavigationalDeviation();
    const s2 = useSpaceshipStore.getState();

    expect(s2.activePhaseIndex).toBe(0);
    expect(s2.thrustMagnitude).toBe(1);
    expect(s2.thrust).toEqual([1, 0, 0]);
    expect(s2.gear).toBe('D');
  });

  it('direct Mars route should advance after escaping Earth so the route UI updates', () => {
    const now = Date.UTC(2026, 6, 5);
    const earthState = computeBodyState('earth', julianDate(now));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const relativeDistanceAU = 0.0001;
    const earthMu = G_AU * REAL_DATA.earth.mass;
    const escapeSpeedAUPerSec = Math.sqrt((2 * earthMu) / relativeDistanceAU);
    useSpaceshipStore.setState({
      simulatedTime: now,
      position: [
        earthState.position[0] + relativeDistanceAU,
        earthState.position[1],
        earthState.position[2],
      ],
      velocity: [
        earthState.velocity[0],
        earthState.velocity[1] + escapeSpeedAUPerSec * 1.05,
        earthState.velocity[2],
      ],
      orbitingBodyId: 'earth',
    });
    useSpaceshipStore.getState().setTargetBody('mars');

    expect(useSpaceshipStore.getState().navigationPlan?.method).toBe('direct-rendezvous');
    expect(useSpaceshipStore.getState().activePhaseIndex).toBe(0);

    useSpaceshipStore.getState().checkNavigationalDeviation();

    expect(useSpaceshipStore.getState().activePhaseIndex).toBe(1);
  });

  it('direct route should keep D thrust when advancing into the next forward acceleration stage', () => {
    const now = Date.UTC(2026, 6, 5);
    const earthState = computeBodyState('earth', julianDate(now));
    expect(earthState).not.toBeNull();
    if (!earthState) return;

    const relativeDistanceAU = 0.0001;
    const earthMu = G_AU * REAL_DATA.earth.mass;
    const escapeSpeedAUPerSec = Math.sqrt((2 * earthMu) / relativeDistanceAU);
    useSpaceshipStore.setState({
      simulatedTime: now,
      position: [
        earthState.position[0] + relativeDistanceAU,
        earthState.position[1],
        earthState.position[2],
      ],
      velocity: [
        earthState.velocity[0],
        earthState.velocity[1] + escapeSpeedAUPerSec * 1.05,
        earthState.velocity[2],
      ],
      orbitingBodyId: 'earth',
    });
    useSpaceshipStore.getState().setTargetBody('mars');
    useSpaceshipStore.getState().setThrustMagnitude(100);
    useSpaceshipStore.getState().setGear('D');

    useSpaceshipStore.getState().checkNavigationalDeviation();

    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan?.method).toBe('direct-rendezvous');
    expect(s.activePhaseIndex).toBe(1);
    expect(s.navigationPlan?.phases[1]?.name).toBe('加速到汇合滑行速度');
    expect(s.gear).toBe('D');
    expect(s.thrustMagnitude).toBe(100);
    expect(s.thrust[0]).toBe(1);
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
      activePhaseIndex: 0,
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
      activePhaseIndex: 2,
      orbitingBodyId: 'sun',
    });

    useSpaceshipStore.getState().timeJump(timeBefore + 3600 * 1000);

    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan?.method).toBe('direct-rendezvous');
    expect(s.navigationPlan?.rendezvous?.point).toEqual([2, 0.5, 0]);
    expect(s.activePhaseIndex).toBe(2);
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

  it('replanNavigation should generate new plan and keep phase index close', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    expect(s.navigationPlan).not.toBeNull();
    const oldPhaseIdx = s.activePhaseIndex;

    useSpaceshipStore.getState().replanNavigation();
    const s2 = useSpaceshipStore.getState();
    expect(s2.navigationPlan).not.toBeNull();
    expect(s2.activePhaseIndex).toBeLessThanOrEqual(oldPhaseIdx + 1);
  });
});
