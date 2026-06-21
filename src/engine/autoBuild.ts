import { REAL_DATA, MU_SUN } from './constants';
import { BUILD_DATA } from './buildData';
import {
  julianDate,
  solveKepler,
  trueAnomaly,
  stateVectors,
  orbitalPeriod,
  meanAnomalyAtTime,
  computeRotationPhase,
} from './orbital';

export const AUTO_BUILD_TOTAL = 9;

export interface AutoBuildStep {
  templateId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  rotationSpeed: number;
  rotationPhase: number;
}

function computeRotationSpeed(rotationPeriod: number | undefined): number {
  if (!rotationPeriod || rotationPeriod === 0) return 0;
  return 86164 / Math.abs(rotationPeriod);
}

export function computeAutoBuildPlan(timestamp?: number): AutoBuildStep[] {
  const unixMs = timestamp ?? Date.now();
  const jd = julianDate(unixMs);
  const plan: AutoBuildStep[] = [];

  // Sun
  const sunData = REAL_DATA.sun;
  plan.push({
    templateId: 'sun',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: sunData.mass,
    rotationSpeed: computeRotationSpeed(sunData.orbital?.rotationPeriod),
    rotationPhase: computeRotationPhase(
      sunData.orbital?.rotationPhaseAtEpoch ?? 0,
      sunData.orbital?.rotationPeriod ?? 1,
      sunData.orbital?.epoch ?? 2451545.0,
      jd,
    ),
  });

  // 8 planets
  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  for (const id of planetIds) {
    const data = REAL_DATA[id];
    if (!data.semiMajorAxis || !data.orbital) continue;

    const o = data.orbital;
    const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
    const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
    const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const E = solveKepler(Mmod, o.eccentricity);
    const nu = trueAnomaly(E, o.eccentricity);

    const sv = stateVectors(
      data.semiMajorAxis, o.eccentricity, o.inclination,
      o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN,
    );

    plan.push({
      templateId: id,
      position: sv.position,
      velocity: sv.velocity,
      mass: data.mass,
      rotationSpeed: computeRotationSpeed(o.rotationPeriod),
      rotationPhase: computeRotationPhase(
        o.rotationPhaseAtEpoch, o.rotationPeriod, o.epoch, jd,
      ),
    });
  }

  return plan;
}

export function computeAutoBuildPlanForBuild(): AutoBuildStep[] {
  const plan: AutoBuildStep[] = [];

  const sunData = BUILD_DATA.sun;
  plan.push({
    templateId: 'sun',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: sunData.mass,
    rotationSpeed: computeRotationSpeed(REAL_DATA.sun.orbital?.rotationPeriod),
    rotationPhase: 0,
  });

  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  for (let i = 0; i < planetIds.length; i++) {
    const id = planetIds[i];
    const data = BUILD_DATA[id];
    if (!data || data.semiMajorAxis <= 0) continue;

    const angle = (i / planetIds.length) * Math.PI * 2;
    const x = data.semiMajorAxis * Math.cos(angle);
    const y = data.semiMajorAxis * Math.sin(angle);

    const tangentAngle = angle + Math.PI / 2;
    const vx = data.orbitalSpeed * Math.cos(tangentAngle);
    const vy = data.orbitalSpeed * Math.sin(tangentAngle);

    plan.push({
      templateId: id,
      position: [x, y, 0],
      velocity: [vx, vy, 0],
      mass: data.mass,
      rotationSpeed: computeRotationSpeed(REAL_DATA[id]?.orbital?.rotationPeriod),
      rotationPhase: 0,
    });
  }

  return plan;
}
