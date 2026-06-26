import { REAL_DATA, MU_SUN, AU_TO_M, NAVIGATION_CONFIG } from './constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';

const SCALE = 1 / AU_TO_M;
const AU_TO_KM = 1.496e8;

export interface NavigationPhase {
  index: number;
  name: string;
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  deltaV: number;
  expectedSpeedKms: number;
  targetOrbit: {
    semiMajorAxis: number;
    eccentricity: number;
  };
}

export interface NavigationPlan {
  phases: NavigationPhase[];
  method: 'hohmann';
  destinationId: string;
  plannedAt: number;
}

function computeBodyState(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  return stateVectors(
    data.semiMajorAxis, o.eccentricity, o.inclination,
    o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN,
  );
}

function computeOrbitalSemiMajorAxis(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  const v2 = vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2;
  const a = 1 / (2 / r - v2 / mu);
  return Math.abs(a);
}

export function planHohmannTransfer(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): NavigationPlan {
  const aCurrentAU = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);

  if (destinationId === 'sun') {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }

  const destData = REAL_DATA[destinationId];
  if (!destData || !destData.semiMajorAxis) {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }
  const aTargetMeters = destData.semiMajorAxis;
  const aTargetAU = aTargetMeters / AU_TO_M;
  const aTransferAU = (aCurrentAU + aTargetAU) / 2;

  const goingOutward = aTargetAU > aCurrentAU;

  const deltaV1 = Math.sqrt(MU_SUN / aCurrentAU) *
    (Math.sqrt(2 * aTargetAU / (aCurrentAU + aTargetAU)) - 1);

  const deltaV3 = Math.sqrt(MU_SUN / aTargetAU) *
    (1 - Math.sqrt(2 * aCurrentAU / (aCurrentAU + aTargetAU)));

  const phases: NavigationPhase[] = [
    {
      index: 0,
      name: goingOutward ? '提升远日点' : '降低近日点',
      thrustDirection: goingOutward ? 'forward' : 'backward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV1) * SCALE,
      expectedSpeedKms: Math.abs(deltaV1) / 1000,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: 1,
      name: '转移轨道滑行',
      thrustDirection: 'none',
      thrustMagnitude: 0,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: 2,
      name: goingOutward ? '目标捕获制动' : '目标捕获加速',
      thrustDirection: goingOutward ? 'backward' : 'forward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV3) * SCALE,
      expectedSpeedKms: Math.abs(deltaV3) / 1000,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: destData.orbital?.eccentricity ?? 0 },
    },
    {
      index: 3,
      name: '绕飞圆化',
      thrustDirection: 'forward',
      thrustMagnitude: 50,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: 0 },
    },
  ];

  return { phases, method: 'hohmann', destinationId, plannedAt: simulatedTime };
}

export function checkPhaseCompletion(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  simulatedTime: number,
): boolean {
  if (currentPhaseIdx < 0 || currentPhaseIdx >= plan.phases.length) return false;

  const phase = plan.phases[currentPhaseIdx];
  if (phase.thrustDirection === 'none') {
    const jd = julianDate(simulatedTime);
    const destState = computeBodyState(plan.destinationId, jd);
    if (!destState) return false;
    const dx = destState.position[0] * SCALE - shipPosition[0];
    const dy = destState.position[1] * SCALE - shipPosition[1];
    const dz = destState.position[2] * SCALE - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < 0.1;
  }

  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);
  const aTarget = phase.targetOrbit.semiMajorAxis;
  const diff = Math.abs(aCurrent - aTarget);
  return diff < NAVIGATION_CONFIG.phaseCompletionThresholdAU;
}

export function checkDeviation(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  _simulatedTime: number,
): { deviated: boolean; deviationAU: number; deviationKms: number } {
  if (currentPhaseIdx < 0 || currentPhaseIdx >= plan.phases.length) {
    return { deviated: false, deviationAU: 0, deviationKms: 0 };
  }

  const phase = plan.phases[currentPhaseIdx];
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);
  const aTarget = phase.targetOrbit.semiMajorAxis;
  const devAU = Math.abs(aCurrent - aTarget);
  const devKms = devAU * AU_TO_KM;

  return {
    deviated: devAU > NAVIGATION_CONFIG.deviationThresholdAU * 2,
    deviationAU: devAU,
    deviationKms: devKms,
  };
}
