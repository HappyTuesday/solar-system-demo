import { describe, it, expect, beforeEach } from 'vitest';
import { useSpaceshipStore } from '../spaceshipStore';
import type { NavigationPhase } from '../../engine/navigation';
import { REAL_DATA, MU_SUN_AU } from '../../engine/constants';

function makePhase(
  name: string, thrustDir: 'forward' | 'backward' | 'none', mag: number, targetSMA: number,
): NavigationPhase {
  return {
    index: 0, name, thrustDirection: thrustDir, thrustMagnitude: mag,
    deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: targetSMA, eccentricity: 0.3 },
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
    expect(s2.thrustMagnitude).toBe(0);
  });

  it('checkNavigationalDeviation should NOT crash when no plan', () => {
    useSpaceshipStore.getState().setTargetBody(null);
    expect(() => useSpaceshipStore.getState().checkNavigationalDeviation()).not.toThrow();
  });

  it('phase advance should reset thrust to zero', () => {
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
    });

    useSpaceshipStore.getState().checkNavigationalDeviation();
    const s2 = useSpaceshipStore.getState();
    expect(s2.thrustMagnitude).toBe(0);
    expect(s2.thrust).toEqual([0, 0, 0]);
  });

  it('Mars live directives should not let the legacy plan check clear freshly applied thrust', () => {
    useSpaceshipStore.getState().setTargetBody('mars');
    const s = useSpaceshipStore.getState();
    const plan = s.navigationPlan!;
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

  it('guided D gear setup should keep visible thrust magnitude and actual forward thrust in sync', () => {
    useSpaceshipStore.getState().setThrustMagnitude(35);
    useSpaceshipStore.getState().setGear('D');

    const s = useSpaceshipStore.getState();
    expect(s.thrustMagnitude).toBe(35);
    expect(s.gear).toBe('D');
    expect(s.thrust[0]).toBe(1);
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
