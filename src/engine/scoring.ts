import type { CelestialBody, ScoringResult, SingleScore } from '../types';
import { REAL_DATA, PLANET_ORDER, SCORING_CONFIG } from './constants';
import { vec3Length } from './physics';

function orbitRadius(body: CelestialBody, sunPosition?: [number, number, number]): number {
  const origin = sunPosition ?? [0, 0, 0];
  const dx = body.position[0] - origin[0];
  const dy = body.position[1] - origin[1];
  const dz = body.position[2] - origin[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function scoreBuild(bodies: CelestialBody[]): ScoringResult {
  const config = SCORING_CONFIG;
  const sun = bodies.find(b => b.templateId === 'sun');
  const sunPos = sun?.position;

  const planetBodies = bodies.filter(b => {
    const data = REAL_DATA[b.templateId];
    return data && data.type === 'planet';
  });

  const sortedPlaced = [...planetBodies].sort(
    (a, b) => orbitRadius(a, sunPos) - orbitRadius(b, sunPos)
  );

  const refPlanets = PLANET_ORDER
    .filter(id => id !== 'sun' && REAL_DATA[id]?.type === 'planet')
    .map(id => REAL_DATA[id]);

  const planetScores: Record<string, SingleScore> = {};
  let totalWeightedSum = 0;
  let count = 0;

  for (let i = 0; i < Math.min(sortedPlaced.length, refPlanets.length); i++) {
    const placed = sortedPlaced[i];
    const ref = refPlanets[i];
    const data = REAL_DATA[placed.templateId];

    const actualR = orbitRadius(placed, sunPos);
    let orbitRadiusScore = 0;
    if (ref.semiMajorAxis && actualR > 0) {
      const radiusError = Math.abs(actualR - (ref.semiMajorAxis ?? 0)) / (ref.semiMajorAxis ?? 1) * 100;
      orbitRadiusScore = Math.max(0, config.orbitRadiusWeight
        * Math.max(0, 1 - radiusError / config.allowedErrorPercent));
    }

    const massError = Math.abs(placed.mass - ref.mass) / ref.mass * 100;
    const massScore = Math.max(0, config.massWeight
      * Math.max(0, 1 - massError / config.allowedErrorPercent));

    const actualSpeed = vec3Length(placed.velocity);
    let velocityScore = 0;
    if (ref.orbitalSpeed) {
      const speedError = Math.abs(actualSpeed - ref.orbitalSpeed) / ref.orbitalSpeed * 100;
      velocityScore = Math.max(0, config.velocityWeight
        * Math.max(0, 1 - speedError / config.allowedErrorPercent));
    }

    const expectedId = PLANET_ORDER[i + 1];
    const orderCorrect = placed.templateId === expectedId;
    const orderScore = orderCorrect ? config.orderWeight : 0;

    const total = (orbitRadiusScore + massScore + velocityScore + orderScore)
      / (config.orbitRadiusWeight + config.massWeight + config.velocityWeight + config.orderWeight);

    planetScores[placed.id] = {
      name: data?.name ?? placed.templateId,
      orbitRadiusScore: Math.round(orbitRadiusScore * 1000) / 1000,
      massScore: Math.round(massScore * 1000) / 1000,
      velocityScore: Math.round(velocityScore * 1000) / 1000,
      orderScore: Math.round(orderScore * 1000) / 1000,
      total: Math.round(total * 1000) / 1000,
    };

    totalWeightedSum += total;
    count++;
  }

  const missingCount = Math.max(0, refPlanets.length - sortedPlaced.length);
  const effectiveCount = count + missingCount;
  const penaltyFactor = effectiveCount > 0 ? count / effectiveCount : 0;
  const totalScore = count > 0
    ? Math.round(Math.max(0, Math.min(100, (totalWeightedSum / count) * 100 * penaltyFactor)))
    : 0;

  return { totalScore, planetScores };
}

export function calculateErrors(bodies: CelestialBody[]): Record<string, {
  name: string;
  orbitRadiusError: number;
  massError: number;
  speedError: number;
}> {
  const sun = bodies.find(b => b.templateId === 'sun');
  const sunPos = sun?.position;
  const errors: Record<string, ReturnType<typeof calculateErrors>[string]> = {};

  for (const body of bodies) {
    const data = REAL_DATA[body.templateId];
    if (!data || data.type === 'star') continue;

    const actualR = orbitRadius(body, sunPos);
    const actualSpeed = vec3Length(body.velocity);

    const orbitRadiusError = data.semiMajorAxis
      ? Math.abs(actualR - data.semiMajorAxis) / data.semiMajorAxis * 100
      : 0;
    const massError = Math.abs(body.mass - data.mass) / data.mass * 100;
    const speedError = data.orbitalSpeed
      ? Math.abs(actualSpeed - data.orbitalSpeed) / data.orbitalSpeed * 100
      : 0;

    errors[body.id] = {
      name: data.name,
      orbitRadiusError: Math.round(orbitRadiusError * 100) / 100,
      massError: Math.round(massError * 100) / 100,
      speedError: Math.round(speedError * 100) / 100,
    };
  }

  return errors;
}
