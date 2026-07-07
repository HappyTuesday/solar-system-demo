import { REAL_DATA, G_AU, SPACECRAFT_CONFIG, MU_SUN_AU } from './constants';
import { stateVectors, julianDate, solveKepler, trueAnomaly, orbitalPeriod, meanAnomalyAtTime } from './orbital';
import type { SpaceshipState } from '../types';

export interface OrbitElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPeriapsis: number;
  trueAnomaly: number;
}

function keplerToRelativeState(
  elements: OrbitElements,
  mu: number,
): { position: [number, number, number]; velocity: [number, number, number] } {
  return stateVectors(
    elements.semiMajorAxis,
    elements.eccentricity,
    elements.inclination,
    elements.raan,
    elements.argPeriapsis,
    elements.trueAnomaly,
    mu,
  );
}

function computeBodyState(
  templateId: string,
  jd: number,
): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_AU);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  return stateVectors(
    data.semiMajorAxis, o.eccentricity, o.inclination,
    o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_AU,
  );
}

export function createSpaceshipState(
  targetBodyId: string = 'earth',
  orbitOverrides?: Partial<OrbitElements>,
  now: number = Date.now(),
): SpaceshipState {
  const jd = julianDate(now);
  const bodyState = computeBodyState(targetBodyId, jd);

  if (!bodyState) {
    throw new Error(`Cannot compute state for target body: ${targetBodyId}`);
  }

  const targetData = REAL_DATA[targetBodyId];
  const muTarget = G_AU * targetData.mass;
  const def = SPACECRAFT_CONFIG.defaultOrbit;

  const elements: OrbitElements = {
    semiMajorAxis: orbitOverrides?.semiMajorAxis ?? def.semiMajorAxis,
    eccentricity: orbitOverrides?.eccentricity ?? def.eccentricity,
    inclination: orbitOverrides?.inclination ?? def.inclination,
    raan: orbitOverrides?.raan ?? def.raan,
    argPeriapsis: orbitOverrides?.argPeriapsis ?? def.argPeriapsis,
    trueAnomaly: orbitOverrides?.trueAnomaly ?? def.trueAnomaly,
  };

  const rel = keplerToRelativeState(elements, muTarget);

  const position: [number, number, number] = [
    bodyState.position[0] + rel.position[0],
    bodyState.position[1] + rel.position[1],
    bodyState.position[2] + rel.position[2],
  ];

  const velocity: [number, number, number] = [
    bodyState.velocity[0] + rel.velocity[0],
    bodyState.velocity[1] + rel.velocity[1],
    bodyState.velocity[2] + rel.velocity[2],
  ];

  const relSpeed = Math.sqrt(
    rel.velocity[0] ** 2 + rel.velocity[1] ** 2 + rel.velocity[2] ** 2,
  );
  const direction: [number, number, number] = relSpeed > 0
    ? [rel.velocity[0] / relSpeed, rel.velocity[1] / relSpeed, rel.velocity[2] / relSpeed]
    : [0, 1, 0];

  return {
    position,
    velocity,
    direction,
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
  };
}
