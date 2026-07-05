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
import { hasEffectiveThrust } from '../../engine/spaceship';
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

function updateAttitudeModeFromBodies(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  bodies: ReturnType<typeof advanceExploreShipPhysics>['finalBodies'],
): void {
  const shipStore = useSpaceshipStore.getState();
  if (shipStore.attitudeMode === 'inertial') return;

  let nearestDist = Infinity;
  let nearestPosition: [number, number, number] = [0, 0, 0];
  let nearestVelocity: [number, number, number] = [0, 0, 0];
  for (const body of bodies) {
    const dx = body.position[0] - shipPosition[0];
    const dy = body.position[1] - shipPosition[1];
    const dz = body.position[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPosition = body.position;
      nearestVelocity = body.velocity;
    }
  }

  if (shipStore.attitudeMode === 'prograde') {
    const rvx = shipVelocity[0] - nearestVelocity[0];
    const rvy = shipVelocity[1] - nearestVelocity[1];
    const rvz = shipVelocity[2] - nearestVelocity[2];
    const rv = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    if (rv > 1e-15) shipStore.setDirection([rvx / rv, rvy / rv, rvz / rv]);
    return;
  }

  if (shipStore.attitudeMode === 'heliocentric-tangential-prograde') {
    const tx = -shipPosition[1];
    const ty = shipPosition[0];
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len > 1e-15) shipStore.setDirection([tx / len, ty / len, 0]);
    return;
  }

  if (shipStore.attitudeMode === 'heliocentric-prograde' || shipStore.attitudeMode === 'heliocentric-retrograde') {
    const speed = Math.sqrt(shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2);
    if (speed > 1e-15) {
      const sign = shipStore.attitudeMode === 'heliocentric-retrograde' ? -1 : 1;
      shipStore.setDirection([
        sign * shipVelocity[0] / speed,
        sign * shipVelocity[1] / speed,
        sign * shipVelocity[2] / speed,
      ]);
    }
    return;
  }

  if (shipStore.attitudeMode === 'nadir') {
    const dx = nearestPosition[0] - shipPosition[0];
    const dy = nearestPosition[1] - shipPosition[1];
    const dz = nearestPosition[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 1e-15) shipStore.setDirection([dx / dist, dy / dist, dz / dist]);
    return;
  }

  if (shipStore.attitudeMode === 'target' && shipStore.targetBodyId) {
    const targetBody = bodies.find(body => body.id === shipStore.targetBodyId);
    const targetPosition = shipStore.targetBodyId === 'sun'
      ? [0, 0, 0] as [number, number, number]
      : targetBody?.position;
    if (!targetPosition) return;

    const dx = targetPosition[0] - shipPosition[0];
    const dy = targetPosition[1] - shipPosition[1];
    const dz = targetPosition[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 1e-15) shipStore.setDirection([dx / dist, dy / dist, dz / dist]);
  }
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
  updateAttitudeModeFromBodies(physics.ship.position, physics.ship.velocity, physics.finalBodies);

  const updated = useSpaceshipStore.getState();
  const elapsed = (updated.simulatedTime - updated.lastDeviationCheckTime) / 1000;
  if (elapsed > 5 || hasEffectiveThrust(updated.thrust, updated.thrustMagnitude)) {
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
  it('keeps the legacy Mars guidance loop numerically stable with real stores and explore physics', { timeout: 30000 }, () => {
    const startTime = Date.UTC(2026, 6, 4);
    resetExploreStores(startTime);
    useSpaceshipStore.getState().setTargetBody('mars');

    let finalGuidance: NavigationDirective | null = null;
    let previousTraceKey = '';
    let minMarsDistance = Infinity;
    const trace: string[] = [];
    for (let iter = 0; iter < 5000; iter++) {
      stepExplorePhysics(0.1);
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

    expect(finalGuidance, summary).not.toBeNull();
    expect(shipStore.exploded, summary).toBe(false);
    expect(shipStore.simulatedTime, summary).toBeGreaterThan(startTime);
    expect(Number.isFinite(minMarsDistance), summary).toBe(true);
    expect(helioA, summary).toBeGreaterThan(0);
    expect(helioEcc, summary).toBeGreaterThanOrEqual(0);
    if (orbit) {
      expect(Number.isFinite(orbit.distance), summary).toBe(true);
      expect(isStableTargetOrbit(orbit, 'mars') || finalGuidance?.action !== 'arrived', summary).toBe(true);
    }
  });
});
