import { describe, expect, it } from 'vitest';
import { createSpaceshipState } from '../../engine/orbitalInjection';
import { AU_TO_KM, MU_SUN_AU, REAL_DATA } from '../../engine/constants';
import {
  computeEccentricity,
  computeOrbitalSemiMajorAxis,
  computeTargetRelativeOrbit,
  isStableTargetOrbit,
} from '../../engine/navigation';
import { computeMarsMissionDirective, type NavigationDirective } from '../../engine/marsMissionNavigator';
import { advanceExploreShipPhysics } from '../../engine/exploreSimulation';
import {
  applyGuidanceDirection,
  applyGuidanceThrottle,
  applyGuidanceTimeScale,
  computeGuidanceAutoTimeScale,
} from '../guidanceControls';
import { useExploreStore } from '../exploreStore';
import { useSpaceshipStore } from '../spaceshipStore';

function resetExploreStores(startTime: number): void {
  const ship = createSpaceshipState('earth', undefined, startTime);
  useSpaceshipStore.getState().reset();
  useSpaceshipStore.setState({
    ...ship,
    isRunning: true,
    simulatedTime: startTime,
    attitudeMode: 'prograde',
    targetBodyId: null,
    nearestBodyId: 'earth',
    orbitingBodyId: 'earth',
    navigationPlan: null,
    activePhaseIndex: -1,
    deviationWarning: null,
    lastDeviationCheckTime: startTime,
    lastReplanTime: 0,
    gear: 'N',
  });
  useExploreStore.setState({
    timeScale: 100,
    isRunning: true,
    selectedBodyId: null,
  });
}

function updateOrbitingBodyFromBodies(
  shipPosition: [number, number, number],
  bodies: ReturnType<typeof advanceExploreShipPhysics>['finalBodies'],
): void {
  let nearestDist = Infinity;
  let nearestBodyId = 'sun';
  let orbitingBodyId = 'sun';

  for (const body of bodies) {
    const dx = body.position[0] - shipPosition[0];
    const dy = body.position[1] - shipPosition[1];
    const dz = body.position[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestBodyId = body.id;
    }

    if (body.id !== 'sun') {
      const data = REAL_DATA[body.id];
      if (data?.semiMajorAxis) {
        const hillR = data.semiMajorAxis * Math.pow(data.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
        if (dist < hillR) orbitingBodyId = body.id;
      }
    }
  }

  useSpaceshipStore.getState().setNearestBodyId(nearestBodyId);
  useSpaceshipStore.getState().setOrbitingBodyId(orbitingBodyId);
}

function stepExplorePhysics(frameDt: number): void {
  const shipStore = useSpaceshipStore.getState();
  const physics = advanceExploreShipPhysics({
    ship: {
      position: shipStore.position,
      velocity: shipStore.velocity,
      direction: shipStore.direction,
      thrust: shipStore.thrust,
      thrustMagnitude: shipStore.thrustMagnitude,
      exploded: shipStore.exploded,
    },
    simulatedTime: shipStore.simulatedTime,
    frameDt,
    timeScale: useExploreStore.getState().timeScale,
  });

  shipStore.updateFlightStats(physics.travelKm, physics.speedKms);
  shipStore.setSimulatedTime(physics.simulatedTime);
  shipStore.updatePhysics(physics.ship.position, physics.ship.velocity);
  updateOrbitingBodyFromBodies(physics.ship.position, physics.finalBodies);

  const updated = useSpaceshipStore.getState();
  const elapsed = (updated.simulatedTime - updated.lastDeviationCheckTime) / 1000;
  if (elapsed > 5 || updated.thrustMagnitude > 0) {
    useSpaceshipStore.setState({ lastDeviationCheckTime: updated.simulatedTime });
    updated.checkNavigationalDeviation();
  }
}

function operateFromLatestGuidance(): NavigationDirective {
  const shipStore = useSpaceshipStore.getState();
  const guidance = computeMarsMissionDirective({
    shipPosition: shipStore.position,
    shipVelocity: shipStore.velocity,
    shipDirection: shipStore.direction,
    simulatedTime: shipStore.simulatedTime,
    thrustMagnitude: shipStore.thrustMagnitude,
  });

  const currentScale = useExploreStore.getState().timeScale;
  const safeScale = computeGuidanceAutoTimeScale(guidance, currentScale);
  if (safeScale != null) {
    useExploreStore.getState().setTimeScale(safeScale);
  } else {
    applyGuidanceTimeScale(guidance, {
      setTimeScale: useExploreStore.getState().setTimeScale,
    });
  }

  applyGuidanceDirection(guidance, {
    setDirection: useSpaceshipStore.getState().setDirection,
    setAttitudeMode: useSpaceshipStore.getState().setAttitudeMode,
  });
  applyGuidanceThrottle(guidance, {
    setThrustMagnitude: useSpaceshipStore.getState().setThrustMagnitude,
    setGear: useSpaceshipStore.getState().setGear,
  });

  return guidance;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) return value.toExponential(3);
  return value.toFixed(6);
}

function formatFlightSummary(
  guidance: NavigationDirective | null,
  orbit: ReturnType<typeof computeTargetRelativeOrbit>,
  helioA: number,
  helioEcc: number,
  trace: string[],
  minMarsDistance: number,
): string {
  const shipStore = useSpaceshipStore.getState();
  const missionDays = (shipStore.simulatedTime - Date.UTC(2026, 6, 4)) / 86400000;
  const orbitSummary = orbit
    ? [
        `marsDistAU=${formatNumber(orbit.distance)}`,
        `marsSpeedKms=${formatNumber(orbit.speed * AU_TO_KM)}`,
        `marsDistanceRateKms=${formatNumber(orbit.distanceRate * AU_TO_KM)}`,
        `marsEnergy=${formatNumber(orbit.energy)}`,
        `marsPeriapsisAU=${formatNumber(orbit.periapsis)}`,
        `marsApoapsisAU=${formatNumber(orbit.apoapsis)}`,
        `marsEcc=${formatNumber(orbit.eccentricity)}`,
        `marsHillAU=${formatNumber(orbit.hillRadius)}`,
        `marsSafeAU=${formatNumber(orbit.safeOrbitRadius)}`,
      ].join(', ')
    : 'marsOrbit=null';

  return [
    `guidance=${guidance?.action ?? 'null'}:${guidance?.title ?? 'null'}`,
    `reason=${guidance?.reason ?? 'null'}`,
    `missionDays=${formatNumber(missionDays)}`,
    `timeScale=${useExploreStore.getState().timeScale}`,
    `gear=${shipStore.gear}`,
    `thrustMagnitude=${shipStore.thrustMagnitude}`,
    `helioA=${formatNumber(helioA)}`,
    `helioEcc=${formatNumber(helioEcc)}`,
    `minMarsDistAU=${formatNumber(minMarsDistance)}`,
    `trace=${trace.join(' > ')}`,
    orbitSummary,
  ].join(' | ');
}

describe('explore Mars guided flight loop', () => {
  it('reaches a stable Mars orbit using real stores, live guidance, and explore physics', { timeout: 240000 }, () => {
    resetExploreStores(Date.UTC(2026, 6, 4));
    useSpaceshipStore.getState().setTargetBody('mars');

    let finalGuidance: NavigationDirective | null = null;
    let previousTraceKey = '';
    let minMarsDistance = Infinity;
    const trace: string[] = [];
    for (let iter = 0; iter < 130000; iter++) {
      stepExplorePhysics(1);
      finalGuidance = operateFromLatestGuidance();
      const currentStore = useSpaceshipStore.getState();
      const currentOrbit = computeTargetRelativeOrbit(
        currentStore.position,
        currentStore.velocity,
        'mars',
        currentStore.simulatedTime,
      );
      if (currentOrbit) {
        minMarsDistance = Math.min(minMarsDistance, currentOrbit.distance);
      }
      const traceKey = `${finalGuidance.action}:${finalGuidance.title}`;
      if (traceKey !== previousTraceKey) {
        trace.push(`${iter}@${formatNumber((currentStore.simulatedTime - Date.UTC(2026, 6, 4)) / 86400000)}d:${traceKey}`);
        if (trace.length > 12) trace.shift();
        previousTraceKey = traceKey;
      }
      if (finalGuidance.action === 'arrived') break;
    }

    const shipStore = useSpaceshipStore.getState();
    const orbit = computeTargetRelativeOrbit(
      shipStore.position,
      shipStore.velocity,
      'mars',
      shipStore.simulatedTime,
    );
    const helioA = computeOrbitalSemiMajorAxis(shipStore.position, shipStore.velocity, MU_SUN_AU);
    const helioEcc = computeEccentricity(shipStore.position, shipStore.velocity, MU_SUN_AU);

    const summary = formatFlightSummary(finalGuidance, orbit, helioA, helioEcc, trace, minMarsDistance);

    expect(finalGuidance?.action, summary).toBe('arrived');
    expect(orbit, summary).not.toBeNull();
    expect(helioA, summary).toBeGreaterThan(0);
    expect(helioEcc, summary).toBeGreaterThanOrEqual(0);
    expect(orbit && isStableTargetOrbit(orbit, 'mars'), summary).toBe(true);
  });
});
