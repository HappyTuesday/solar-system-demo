import { REAL_DATA, MU_SUN_AU, AU_TO_KM, G_AU, SPACECRAFT_CONFIG } from './constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';

export interface DirectRendezvousInfo {
  point: [number, number, number];
  plannedFrom: [number, number, number];
  targetTimeToRendezvousSec: number;
  shipIdealCruiseSpeedAUPerSec: number;
  arrivalMaxRelativeSpeedAUPerSec: number;
  rendezvousTime: number;
  validUntil: number;
  invalidReason?: string;
}

export interface NavigationPlan {
  destinationId: string;
  plannedAt: number;
  rendezvous?: DirectRendezvousInfo;
}

export interface DirectRendezvousMetrics {
  distanceToRendezvousAU: number;
  targetDistanceToRendezvousAU: number;
  speedAUPerSec: number;
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  effectiveSpeedAUPerSec: number;
  idealCruiseSpeedAUPerSec: number;
  shipTimeToRendezvousSec: number;
  targetTimeToRendezvousSec: number;
  velocityAngleErrorDeg: number;
  noseAngleErrorDeg: number;
  arrivalMaxRelativeSpeedAUPerSec: number;
  rendezvousDirection: [number, number, number];
}

export interface RendezvousDisplayParams {
  targetTimeToRendezvousSec: number;
  shipTimeToRendezvousSec: number;
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  noseAngleDeg: number;
  velocityAngleDeg: number;
  captureHelioSpeedMinAUPerSec: number;
  captureHelioSpeedMaxAUPerSec: number;
  escapeSpeedAUPerSec: number | null;
  distanceToTargetAU: number;
  distanceToRendezvousAU: number;
}

export interface TargetRelativeOrbit {
  targetId: string;
  targetName: string;
  relativePosition: [number, number, number];
  relativeVelocity: [number, number, number];
  distance: number;
  speed: number;
  distanceRate: number;
  energy: number;
  semiMajorAxis: number;
  eccentricity: number;
  periapsis: number;
  apoapsis: number;
  hillRadius: number;
  safeOrbitRadius: number;
  stableApoapsis: number;
  stableEccentricity: number;
}

const BODY_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

function vectorLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vectorNormalize(v: [number, number, number]): [number, number, number] {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vectorDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vectorSubtract(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeBodyState(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_AU);
  const meanAnomaly = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const normalizedMeanAnomaly = ((meanAnomaly % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const eccentricAnomaly = solveKepler(normalizedMeanAnomaly, o.eccentricity);
  const anomaly = trueAnomaly(eccentricAnomaly, o.eccentricity);
  return stateVectors(
    data.semiMajorAxis,
    o.eccentricity,
    o.inclination,
    o.longitudeAscendingNode,
    o.argumentOfPeriapsis,
    anomaly,
    MU_SUN_AU,
  );
}

export function computeOrbitalSemiMajorAxis(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = vectorLength(pos);
  const v2 = vectorDot(vel, vel);
  return Math.abs(1 / (2 / r - v2 / mu));
}

export function computeEccentricity(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = vectorLength(pos);
  const hx = pos[1] * vel[2] - pos[2] * vel[1];
  const hy = pos[2] * vel[0] - pos[0] * vel[2];
  const hz = pos[0] * vel[1] - pos[1] * vel[0];
  const h2 = hx * hx + hy * hy + hz * hz;
  if (h2 < 1e-30 || r < 1e-20) return 0;
  const eVecX = (vel[1] * hz - vel[2] * hy) / mu - pos[0] / r;
  const eVecY = (vel[2] * hx - vel[0] * hz) / mu - pos[1] / r;
  const eVecZ = (vel[0] * hy - vel[1] * hx) / mu - pos[2] / r;
  return Math.sqrt(eVecX * eVecX + eVecY * eVecY + eVecZ * eVecZ);
}

function angleBetweenVectors(a: [number, number, number], b: [number, number, number]): number {
  const al = vectorLength(a);
  const bl = vectorLength(b);
  if (al < 1e-20 || bl < 1e-20) return 0;
  const cos = vectorDot(a, b) / (al * bl);
  return Math.acos(clamp(cos, -1, 1));
}

export function signedAngleDeg(
  current: [number, number, number],
  target: [number, number, number],
): number {
  const currentLen = vectorLength(current);
  const targetLen = vectorLength(target);
  if (currentLen < 1e-20 || targetLen < 1e-20) return 0;
  const unsigned = angleBetweenVectors(current, target) * 180 / Math.PI;
  const crossZ = target[0] * current[1] - target[1] * current[0];
  return crossZ >= 0 ? unsigned : -unsigned;
}

function hillRadiusForBody(bodyId: string): number {
  if (bodyId === 'sun') return Infinity;
  const data = REAL_DATA[bodyId];
  if (!data?.semiMajorAxis) return 0;
  return data.semiMajorAxis * Math.pow(data.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
}

function safeOrbitRadiusForBody(bodyId: string): number {
  const data = REAL_DATA[bodyId];
  if (!data) return 0;
  return data.radius + 20000 / AU_TO_KM;
}

export function computeTargetRelativeOrbit(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): TargetRelativeOrbit | null {
  if (destinationId === 'sun') return null;
  const targetData = REAL_DATA[destinationId];
  if (!targetData) return null;

  const targetState = computeBodyState(destinationId, julianDate(simulatedTime));
  if (!targetState) return null;

  const relativePosition = vectorSubtract(shipPosition, targetState.position);
  const relativeVelocity = vectorSubtract(shipVelocity, targetState.velocity);
  const distance = vectorLength(relativePosition);
  const speed = vectorLength(relativeVelocity);
  const mu = G_AU * targetData.mass;
  const energy = distance > 1e-20 ? speed * speed / 2 - mu / distance : Infinity;
  const eccentricity = distance > 1e-20 ? computeEccentricity(relativePosition, relativeVelocity, mu) : Infinity;
  const semiMajorAxis = energy < 0 ? -mu / (2 * energy) : Infinity;
  const periapsis = energy < 0 && eccentricity < 1 ? semiMajorAxis * (1 - eccentricity) : Infinity;
  const apoapsis = energy < 0 && eccentricity < 1 ? semiMajorAxis * (1 + eccentricity) : Infinity;
  const distanceRate = distance > 1e-20 ? vectorDot(relativePosition, relativeVelocity) / distance : 0;
  const hillRadius = hillRadiusForBody(destinationId);

  return {
    targetId: destinationId,
    targetName: targetData.name,
    relativePosition,
    relativeVelocity,
    distance,
    speed,
    distanceRate,
    energy,
    semiMajorAxis,
    eccentricity,
    periapsis,
    apoapsis,
    hillRadius,
    safeOrbitRadius: safeOrbitRadiusForBody(destinationId),
    stableApoapsis: hillRadius * 0.35,
    stableEccentricity: 0.9,
  };
}

export function isStableTargetOrbit(orbit: TargetRelativeOrbit, destinationId: string): boolean {
  return orbit.targetId === destinationId
    && orbit.energy < 0
    && orbit.periapsis > orbit.safeOrbitRadius
    && orbit.apoapsis < orbit.stableApoapsis
    && orbit.eccentricity < orbit.stableEccentricity
    && orbit.distance < orbit.stableApoapsis;
}

export function getOrbitingBodyId(
  shipPosition: [number, number, number],
  simulatedTime: number,
): string {
  const jd = julianDate(simulatedTime);

  for (const id of BODY_IDS) {
    if (id === 'sun') continue;
    const data = REAL_DATA[id];
    if (!data?.semiMajorAxis) continue;

    const state = computeBodyState(id, jd);
    if (!state) continue;

    const dist = vectorLength(vectorSubtract(shipPosition, state.position));
    if (dist < hillRadiusForBody(id)) return id;
  }
  return 'sun';
}

function estimateDirectCruiseSpeed(distanceAU: number): number {
  const minSpeed = 8 / AU_TO_KM;
  const maxSpeed = 300 / AU_TO_KM;
  const accelLimited = Math.sqrt(Math.max(1e-12, SPACECRAFT_CONFIG.maxThrustAU * distanceAU * 0.08));
  return clamp(accelLimited, minSpeed, maxSpeed);
}

export function planDirectRendezvousTransfer(
  shipPosition: [number, number, number],
  _shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): NavigationPlan {
  if (destinationId === 'sun') {
    return { destinationId, plannedAt: simulatedTime };
  }

  const destination = REAL_DATA[destinationId];
  if (!destination?.semiMajorAxis || !destination.orbital) {
    return { destinationId, plannedAt: simulatedTime };
  }

  let targetState = computeBodyState(destinationId, julianDate(simulatedTime));
  if (!targetState) {
    return { destinationId, plannedAt: simulatedTime };
  }

  for (let i = 0; i < 4; i++) {
    const distance = vectorLength(vectorSubtract(targetState.position, shipPosition));
    const idealSpeed = estimateDirectCruiseSpeed(distance);
    const rendezvousTimeSec = clamp(distance / idealSpeed, 3 * 86400, 820 * 86400);
    const futureTarget = computeBodyState(destinationId, julianDate(simulatedTime + rendezvousTimeSec * 1000));
    if (!futureTarget) break;
    targetState = futureTarget;
  }

  const rendezvousPoint = targetState.position;
  const finalDistance = vectorLength(vectorSubtract(rendezvousPoint, shipPosition));
  const idealSpeed = estimateDirectCruiseSpeed(finalDistance);
  const rendezvousTimeSec = clamp(finalDistance / idealSpeed, 3 * 86400, 820 * 86400);
  const arrivalMaxRelativeSpeedAUPerSec = 0.65 / AU_TO_KM;

  return {
    destinationId,
    plannedAt: simulatedTime,
    rendezvous: {
      point: rendezvousPoint,
      plannedFrom: shipPosition,
      targetTimeToRendezvousSec: rendezvousTimeSec,
      shipIdealCruiseSpeedAUPerSec: idealSpeed,
      arrivalMaxRelativeSpeedAUPerSec,
      rendezvousTime: simulatedTime + rendezvousTimeSec * 1000,
      validUntil: simulatedTime + Math.min(rendezvousTimeSec * 0.2, 20 * 86400) * 1000,
    },
  };
}

export function computeDirectRendezvousMetrics(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  shipDirection: [number, number, number],
  plan: NavigationPlan,
  simulatedTime: number,
): DirectRendezvousMetrics {
  const rendezvous = plan.rendezvous;
  const targetState = computeBodyState(plan.destinationId, julianDate(simulatedTime));
  const point = rendezvous?.point ?? targetState?.position ?? shipPosition;
  const toRendezvous = vectorSubtract(point, shipPosition);
  const distanceToRendezvousAU = vectorLength(toRendezvous);
  const rendezvousDirection = vectorNormalize(toRendezvous);
  const speedAUPerSec = vectorLength(shipVelocity);
  const radialSpeedAUPerSec = vectorDot(shipVelocity, rendezvousDirection);
  const tangentialReference = vectorNormalize([-rendezvousDirection[1], rendezvousDirection[0], 0]);
  const tangentialSpeedAUPerSec = vectorDot(shipVelocity, tangentialReference);
  const effectiveSpeedAUPerSec = Math.max(0, radialSpeedAUPerSec);
  const shipTimeToRendezvousSec = effectiveSpeedAUPerSec > 1e-20
    ? distanceToRendezvousAU / effectiveSpeedAUPerSec
    : Infinity;
  const targetDistanceToRendezvousAU = targetState
    ? vectorLength(vectorSubtract(point, targetState.position))
    : Infinity;
  const targetTimeToRendezvousSec = Math.max(0, ((rendezvous?.rendezvousTime ?? simulatedTime) - simulatedTime) / 1000);

  return {
    distanceToRendezvousAU,
    targetDistanceToRendezvousAU,
    speedAUPerSec,
    radialSpeedAUPerSec,
    tangentialSpeedAUPerSec,
    effectiveSpeedAUPerSec,
    idealCruiseSpeedAUPerSec: rendezvous?.shipIdealCruiseSpeedAUPerSec ?? 0,
    shipTimeToRendezvousSec,
    targetTimeToRendezvousSec,
    velocityAngleErrorDeg: signedAngleDeg(shipVelocity, rendezvousDirection),
    noseAngleErrorDeg: signedAngleDeg(shipDirection, rendezvousDirection),
    arrivalMaxRelativeSpeedAUPerSec: rendezvous?.arrivalMaxRelativeSpeedAUPerSec ?? 0.65 / AU_TO_KM,
    rendezvousDirection,
  };
}

export function computeRendezvousDisplayParams(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  shipDirection: [number, number, number],
  plan: NavigationPlan,
  simulatedTime: number,
  orbitingBodyId: string | null,
): RendezvousDisplayParams {
  const metrics = computeDirectRendezvousMetrics(
    shipPosition,
    shipVelocity,
    shipDirection,
    plan,
    simulatedTime,
  );
  const targetState = computeBodyState(plan.destinationId, julianDate(simulatedTime));
  const targetSpeedAUPerSec = targetState ? vectorLength(targetState.velocity) : 0;
  const captureMargin = metrics.arrivalMaxRelativeSpeedAUPerSec;
  const targetPosition = targetState?.position ?? plan.rendezvous?.point ?? shipPosition;

  let escapeSpeedAUPerSec: number | null = null;
  if (orbitingBodyId && orbitingBodyId !== 'sun') {
    const bodyData = REAL_DATA[orbitingBodyId];
    const bodyState = computeBodyState(orbitingBodyId, julianDate(simulatedTime));
    if (bodyData && bodyState) {
      const distanceToBody = vectorLength(vectorSubtract(shipPosition, bodyState.position));
      if (distanceToBody > 1e-20) {
        escapeSpeedAUPerSec = Math.sqrt((2 * G_AU * bodyData.mass) / distanceToBody);
      }
    }
  }

  return {
    targetTimeToRendezvousSec: metrics.targetTimeToRendezvousSec,
    shipTimeToRendezvousSec: metrics.shipTimeToRendezvousSec,
    radialSpeedAUPerSec: metrics.radialSpeedAUPerSec,
    tangentialSpeedAUPerSec: metrics.tangentialSpeedAUPerSec,
    noseAngleDeg: metrics.noseAngleErrorDeg,
    velocityAngleDeg: metrics.velocityAngleErrorDeg,
    captureHelioSpeedMinAUPerSec: Math.max(0, targetSpeedAUPerSec - captureMargin),
    captureHelioSpeedMaxAUPerSec: targetSpeedAUPerSec + captureMargin,
    escapeSpeedAUPerSec,
    distanceToTargetAU: vectorLength(vectorSubtract(shipPosition, targetPosition)),
    distanceToRendezvousAU: metrics.distanceToRendezvousAU,
  };
}

export function computeRendezvousDirection(
  shipPosition: [number, number, number],
  plan: NavigationPlan | null,
): [number, number, number] | null {
  if (!plan?.rendezvous) return null;
  const toRendezvous = vectorSubtract(plan.rendezvous.point, shipPosition);
  const direction = vectorNormalize(toRendezvous);
  return vectorLength(direction) > 0 ? direction : null;
}
