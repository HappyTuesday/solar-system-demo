import { REAL_DATA, MU_SUN_AU, AU_TO_KM, NAVIGATION_CONFIG, G_AU, SPACECRAFT_CONFIG } from './constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';

// ===== Types =====

export interface NavigationPhase {
  index: number;
  name: string;
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  deltaV: number;
  expectedSpeedKms: number;
  expectedWaitDays?: number;
  waitEndTime?: number;
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

export interface GuidanceMetric {
  label: string;
  current: number;
  target: number;
  unit: string;
  highlight?: boolean;
  warn?: boolean;
}

export interface PhaseGuidance {
  operation?: 'wait' | 'jumpTime' | 'turn' | 'ignite' | 'cutoff' | 'coast' | 'arrived';
  title: string;
  actionText: string;
  metrics: GuidanceMetric[];
  progress: number;
  completed: boolean;
  shouldThrust: boolean;
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  attitudeMode: 'prograde' | 'inertial';
  estimatedRemaining?: number;
  desiredDirection?: [number, number, number];
  desiredDirectionLabel?: string;
  recommendedGear?: 'D' | 'N' | 'R';
  recommendedThrustMagnitude?: number;
  suggestedTimeScale?: number;
  reason?: string;
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

export interface LiveNavigationGuidanceInput {
  shipPosition: [number, number, number];
  shipVelocity: [number, number, number];
  shipDirection: [number, number, number];
  destinationId: string;
  simulatedTime: number;
  thrustMagnitude: number;
}

const MARS_LIVE_APPROACH_RADIUS_AU = 1.5;

export function computeGuidanceSafetyTimeScale(
  guidance: PhaseGuidance | null,
  currentTimeScale: number,
): number | null {
  if (!guidance?.suggestedTimeScale) return null;
  const shouldReduce = guidance.operation === 'turn'
    || guidance.operation === 'ignite'
    || guidance.operation === 'cutoff'
    || guidance.operation === 'arrived';
  if (!shouldReduce) return null;

  const safeScale = Math.max(1, guidance.suggestedTimeScale);
  return currentTimeScale > safeScale ? safeScale : null;
}

// ===== Body state computation (Keplerian, shared with PhaseGuide) =====

export function computeBodyState(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
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

export function computeOrbitalSemiMajorAxis(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  const v2 = vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2;
  const a = 1 / (2 / r - v2 / mu);
  return Math.abs(a);
}

export function computeEccentricity(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  const hx = pos[1] * vel[2] - pos[2] * vel[1];
  const hy = pos[2] * vel[0] - pos[0] * vel[2];
  const hz = pos[0] * vel[1] - pos[1] * vel[0];
  const h2 = hx * hx + hy * hy + hz * hz;
  if (h2 < 1e-30) return 0;
  const eVecX = (vel[1] * hz - vel[2] * hy) / mu - pos[0] / r;
  const eVecY = (vel[2] * hx - vel[0] * hz) / mu - pos[1] / r;
  const eVecZ = (vel[0] * hy - vel[1] * hx) / mu - pos[2] / r;
  return Math.sqrt(eVecX * eVecX + eVecY * eVecY + eVecZ * eVecZ);
}

function vectorLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vectorNormalize(v: [number, number, number]): [number, number, number] {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vectorScale(v: [number, number, number], scalar: number): [number, number, number] {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function vectorDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angleBetweenVectors(a: [number, number, number], b: [number, number, number]): number {
  const al = vectorLength(a);
  const bl = vectorLength(b);
  if (al < 1e-20 || bl < 1e-20) return 0;
  const cos = vectorDot(a, b) / (al * bl);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
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

function stableApoapsisForBody(bodyId: string): number {
  return hillRadiusForBody(bodyId) * 0.35;
}

function stableEccentricityForBody(_bodyId: string): number {
  return 0.9;
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

  const relativePosition: [number, number, number] = [
    shipPosition[0] - targetState.position[0],
    shipPosition[1] - targetState.position[1],
    shipPosition[2] - targetState.position[2],
  ];
  const relativeVelocity: [number, number, number] = [
    shipVelocity[0] - targetState.velocity[0],
    shipVelocity[1] - targetState.velocity[1],
    shipVelocity[2] - targetState.velocity[2],
  ];

  const distance = vectorLength(relativePosition);
  const speed = vectorLength(relativeVelocity);
  const mu = G_AU * targetData.mass;
  const energy = distance > 1e-20 ? speed * speed / 2 - mu / distance : Infinity;
  const eccentricity = distance > 1e-20 ? computeEccentricity(relativePosition, relativeVelocity, mu) : Infinity;
  const semiMajorAxis = energy < 0 ? -mu / (2 * energy) : Infinity;
  const periapsis = energy < 0 && eccentricity < 1 ? semiMajorAxis * (1 - eccentricity) : Infinity;
  const apoapsis = energy < 0 && eccentricity < 1 ? semiMajorAxis * (1 + eccentricity) : Infinity;
  const distanceRate = distance > 1e-20 ? vectorDot(relativePosition, relativeVelocity) / distance : 0;

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
    hillRadius: hillRadiusForBody(destinationId),
    safeOrbitRadius: safeOrbitRadiusForBody(destinationId),
    stableApoapsis: stableApoapsisForBody(destinationId),
    stableEccentricity: stableEccentricityForBody(destinationId),
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

// ===== Hill sphere / orbiting body =====

const BODY_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

function getHillRadiusAU(bodyId: string): number {
  if (bodyId === 'sun') return Infinity;
  const data = REAL_DATA[bodyId];
  if (!data?.semiMajorAxis) return 0;
  const a = data.semiMajorAxis;
  const m = data.mass;
  const M = REAL_DATA.sun.mass;
  return a * Math.pow(m / (3 * M), 1 / 3);
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

    const dx = shipPosition[0] - state.position[0];
    const dy = shipPosition[1] - state.position[1];
    const dz = shipPosition[2] - state.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const hillR = getHillRadiusAU(id);
    if (dist < hillR) return id;
  }
  return 'sun';
}

export function getOrbitingBodySemiMajorAxis(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number {
  const bodyId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (bodyId === 'sun') return 0;
  const data = REAL_DATA[bodyId];
  return data?.semiMajorAxis ?? 0;
}

export function getStableReferenceSemiMajorAxis(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  simulatedTime: number,
): number {
  const bodyId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (bodyId === 'sun') {
    return computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  }
  const data = REAL_DATA[bodyId];
  return data?.semiMajorAxis ?? computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
}

export function getNearestBodySemiMajorAxis(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number {
  const bodyId = findNearestBodyId(shipPosition, simulatedTime);
  if (bodyId === 'sun') return 0;
  const data = REAL_DATA[bodyId];
  return data?.semiMajorAxis ?? 0;
}

function findNearestBodyId(
  shipPosition: [number, number, number],
  simulatedTime: number,
): string {
  const jd = julianDate(simulatedTime);
  let nearestDist = Infinity;
  let nearestId = 'sun';

  for (const id of BODY_IDS) {
    let bx: number; let by: number; let bz: number;
    if (id === 'sun') {
      bx = 0; by = 0; bz = 0;
    } else {
      const state = computeBodyState(id, jd);
      if (!state) continue;
      bx = state.position[0];
      by = state.position[1];
      bz = state.position[2];
    }
    const dx = shipPosition[0] - bx;
    const dy = shipPosition[1] - by;
    const dz = shipPosition[2] - bz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = id;
    }
  }
  return nearestId;
}

// ===== Phase angle around orbiting body =====

export function getPhaseAngleDeg(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number | null {
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingId === 'sun') return null;
  const jd = julianDate(simulatedTime);
  const bodyState = computeBodyState(orbitingId, jd);
  if (!bodyState) return null;
  const rx = shipPosition[0] - bodyState.position[0];
  const ry = shipPosition[1] - bodyState.position[1];
  const rz = shipPosition[2] - bodyState.position[2];
  const bv = bodyState.velocity;
  const bvLen = Math.sqrt(bv[0] ** 2 + bv[1] ** 2 + bv[2] ** 2);
  if (bvLen < 1e-15) return null;
  const dot = (rx * bv[0] + ry * bv[1] + rz * bv[2]) / bvLen;
  const rr = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rr < 1e-15) return null;
  const cosAngle = dot / rr;
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI;
}

// ===== Phase-guided departure =====

function getPhaseAngleDegForDeparture(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number | null {
  return getPhaseAngleDeg(shipPosition, simulatedTime);
}

// ===== Plan generation =====

export function planHohmannTransfer(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): NavigationPlan {
  const aCurrentAU = getStableReferenceSemiMajorAxis(shipPosition, shipVelocity, simulatedTime);

  if (destinationId === 'sun') {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }

  const destData = REAL_DATA[destinationId];
  if (!destData || !destData.semiMajorAxis) {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }
  const aTargetAU = destData.semiMajorAxis;
  const aTransferAU = (aCurrentAU + aTargetAU) / 2;

  const goingOutward = aTargetAU > aCurrentAU;

  const deltaV1 = Math.sqrt(MU_SUN_AU / aCurrentAU) *
    (Math.sqrt(2 * aTargetAU / (aCurrentAU + aTargetAU)) - 1);

  const deltaV3 = Math.sqrt(MU_SUN_AU / aTargetAU) *
    (1 - Math.sqrt(2 * aCurrentAU / (aCurrentAU + aTargetAU)));

  const jd = julianDate(simulatedTime);
  const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
  const targetState = destinationId === 'sun' ? null : computeBodyState(destinationId, jd);
  let hasWaitingPhase = false;
  let waitDays = 0;

  if (targetState) {
    const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);
    const omegaShip = Math.sqrt(MU_SUN_AU / (aCurrentAU * aCurrentAU * aCurrentAU));
    const omegaTarget = Math.sqrt(MU_SUN_AU / (aTargetAU * aTargetAU * aTargetAU));
    const transferTimeSec = Math.PI * Math.sqrt(
      (aTransferAU * aTransferAU * aTransferAU) / MU_SUN_AU
    );
    const targetTravelAngle = omegaTarget * transferTimeSec;

    let requiredPhaseAngle: number;
    let currentPhaseAngle: number;

    if (goingOutward) {
      requiredPhaseAngle = Math.PI - targetTravelAngle;
      currentPhaseAngle = shipAngle - targetAngle;
    } else {
      requiredPhaseAngle = targetTravelAngle - Math.PI;
      currentPhaseAngle = targetAngle - shipAngle;
    }

    const TWO_PI = 2 * Math.PI;
    const requiredNorm = ((requiredPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
    const currentNorm = ((currentPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;

    let angleToWait = requiredNorm - currentNorm;
    if (angleToWait < 0) angleToWait += TWO_PI;

    const synodicPeriod = TWO_PI / Math.abs(omegaShip - omegaTarget);
    const synodicDays = synodicPeriod / 86400;

    if (angleToWait > 0.05) {
      waitDays = (angleToWait / TWO_PI) * synodicDays;
      if (waitDays < 1) waitDays = 1;
      hasWaitingPhase = true;
    }
  }

  const phases: NavigationPhase[] = [];

  if (hasWaitingPhase) {
    phases.push({
      index: 0,
      name: '等待发射窗口',
      thrustDirection: 'none',
      thrustMagnitude: 0,
      deltaV: 0,
      expectedSpeedKms: 0,
      expectedWaitDays: waitDays,
      waitEndTime: simulatedTime + waitDays * 86400 * 1000,
      targetOrbit: { semiMajorAxis: aCurrentAU, eccentricity: 0 },
    });
  }

  const phaseOffset = hasWaitingPhase ? 1 : 0;

  phases.push(
    {
      index: phaseOffset,
      name: goingOutward ? '提升远日点' : '降低近日点',
      thrustDirection: goingOutward ? 'forward' : 'backward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV1),
      expectedSpeedKms: Math.abs(deltaV1) * AU_TO_KM,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: phaseOffset + 1,
      name: '转移轨道滑行',
      thrustDirection: 'none',
      thrustMagnitude: 0,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: phaseOffset + 2,
      name: goingOutward ? '目标捕获加速' : '目标捕获制动',
      thrustDirection: goingOutward ? 'forward' : 'backward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV3),
      expectedSpeedKms: Math.abs(deltaV3) * AU_TO_KM,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: destData.orbital?.eccentricity ?? 0 },
    },
    {
      index: phaseOffset + 3,
      name: '绕飞圆化',
      thrustDirection: 'forward',
      thrustMagnitude: 50,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: 0 },
    },
  );

  return { phases, method: 'hohmann', destinationId, plannedAt: simulatedTime };
}

// ===== Deviation checking =====

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
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  const aTarget = phase.targetOrbit.semiMajorAxis;
  const devAU = Math.abs(aCurrent - aTarget);
  const devKms = devAU * AU_TO_KM;

  return {
    deviated: devAU > NAVIGATION_CONFIG.deviationThresholdAU * 2,
    deviationAU: devAU,
    deviationKms: devKms,
  };
}

// ===== Phase completion check =====

export function checkPhaseCompleted(
  phase: NavigationPhase,
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): boolean {
  if (!phase) return false;

  // Phase 1: 等待发射窗口 — heliocentric phase angle aligned
  if (phase.name.startsWith('等待')) {
    const jd = julianDate(simulatedTime);
    const targetState = computeBodyState(destinationId, jd);
    if (!targetState) return false;

    const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
    const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);

    const aCurrentAU = getStableReferenceSemiMajorAxis(shipPosition, shipVelocity, simulatedTime);
    const destData = REAL_DATA[destinationId];
    if (!destData || !destData.semiMajorAxis) return false;
    const aTargetAU = destData.semiMajorAxis;
    const goingOutward = aTargetAU > aCurrentAU;

    const muSun = MU_SUN_AU;
    const omegaTarget = Math.sqrt(muSun / (aTargetAU * aTargetAU * aTargetAU));
    const aTransferAU = (aCurrentAU + aTargetAU) / 2;
    const transferTimeSec = Math.PI * Math.sqrt(
      (aTransferAU * aTransferAU * aTransferAU) / muSun
    );
    const targetTravelAngle = omegaTarget * transferTimeSec;

    let currentPhaseAngle: number;
    let requiredPhaseAngle: number;
    if (goingOutward) {
      requiredPhaseAngle = Math.PI - targetTravelAngle;
      currentPhaseAngle = shipAngle - targetAngle;
    } else {
      requiredPhaseAngle = targetTravelAngle - Math.PI;
      currentPhaseAngle = targetAngle - shipAngle;
    }

    const TWO_PI = 2 * Math.PI;
    const currentNorm = ((currentPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
    const requiredNorm = ((requiredPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
    const diff = Math.abs(currentNorm - requiredNorm);

    return diff < 0.05 || Math.abs(diff - TWO_PI) < 0.05;
  }

  // Phase 3: 转移轨道滑行 — distance to destination
  if (phase.thrustDirection === 'none') {
    const jd = julianDate(simulatedTime);
    const destState = computeBodyState(destinationId, jd);
    if (!destState) return false;
    const dx = destState.position[0] - shipPosition[0];
    const dy = destState.position[1] - shipPosition[1];
    const dz = destState.position[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < NAVIGATION_CONFIG.approachDistanceAU;
  }

  // Phase 5: 绕飞圆化 — low eccentricity + near destination
  if (phase.name === '绕飞圆化') {
    const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
    if (ecc >= NAVIGATION_CONFIG.orbitCircularizationEcc) return false;
    const jd = julianDate(simulatedTime);
    const destState = computeBodyState(destinationId, jd);
    if (!destState) return false;
    const dx = destState.position[0] - shipPosition[0];
    const dy = destState.position[1] - shipPosition[1];
    const dz = destState.position[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < NAVIGATION_CONFIG.arrivalDistanceAU;
  }

  // Phase 2 (提升远日点) & Phase 4 (目标捕获): heliocentric velocity matching via vis-viva
  // First check: if still in orbiting body's SOI, handle escape/capture
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingId !== 'sun') {
    const orbitingData = REAL_DATA[orbitingId];
    if (orbitingData) {
      const jdBody = julianDate(simulatedTime);
      const bodyState = computeBodyState(orbitingId, jdBody);
      if (bodyState) {
        const drx = shipPosition[0] - bodyState.position[0];
        const dry = shipPosition[1] - bodyState.position[1];
        const drz = shipPosition[2] - bodyState.position[2];
        const dvx = shipVelocity[0] - bodyState.velocity[0];
        const dvy = shipVelocity[1] - bodyState.velocity[1];
        const dvz = shipVelocity[2] - bodyState.velocity[2];
        const rRel = Math.sqrt(drx * drx + dry * dry + drz * drz);
        const vRel2 = dvx * dvx + dvy * dvy + dvz * dvz;
        const muBody = G_AU * orbitingData.mass;
        const energyRel = vRel2 / 2 - muBody / rRel;
        // For departure (forward) burn: must escape planet first.
        // Once escaped, check if hyperbolic excess is sufficient for Hohmann transfer.
        if (phase.thrustDirection === 'forward') {
          if (energyRel <= 0) return false;
          // v_inf² = 2 × energyRel (hyperbolic excess energy)
          const vInf = Math.sqrt(2 * energyRel);
          const vBodyOrbit = Math.sqrt(bodyState.velocity[0] ** 2 + bodyState.velocity[1] ** 2 + bodyState.velocity[2] ** 2);
          const targetAU = phase.targetOrbit.semiMajorAxis;
          const vPeriapsisTarget = Math.sqrt(MU_SUN_AU * (2 / orbitingData.semiMajorAxis! - 1 / targetAU));
          const vInfRequired = vPeriapsisTarget - vBodyOrbit;
          // Departure burn must be close to the required hyperbolic excess.
          // A loose threshold cuts thrust early and leaves the ship on an
          // Earth-like heliocentric orbit that cannot reach Mars.
          if (vInfRequired > 0 && vInf >= vInfRequired * 0.985) return true;
        }
        // For capture (backward) burn: must be captured by planet first
        if (phase.thrustDirection === 'backward' && energyRel > 0) return false;
      }
    }
  }

  // Use vis-viva to check if current velocity matches the target orbit at current radius
  const targetAU = phase.targetOrbit.semiMajorAxis;
  const r = Math.sqrt(shipPosition[0] ** 2 + shipPosition[1] ** 2 + shipPosition[2] ** 2);
  const vCurrent2 = shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2;
  const vTarget2 = MU_SUN_AU * (2 / r - 1 / targetAU);
  if (vTarget2 <= 0) return false;
  const vRelDiff = Math.abs(Math.sqrt(vCurrent2) - Math.sqrt(vTarget2));
  const tolerance = Math.sqrt(vTarget2) * 0.02;

  if (phase.thrustDirection === 'forward') {
    return vCurrent2 >= vTarget2 && vRelDiff < tolerance;
  } else {
    return vCurrent2 <= vTarget2 && vRelDiff < tolerance;
  }
}

// ===== Real-time phase guidance =====

export function computePhaseGuidance(
  phase: NavigationPhase,
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
  attitudeMode: string,
  thrustMagnitude: number,
): PhaseGuidance {
  const completed = checkPhaseCompleted(phase, shipPosition, shipVelocity, destinationId, simulatedTime);
  const destName = REAL_DATA[destinationId]?.name ?? destinationId;
  const r = Math.sqrt(shipPosition[0] ** 2 + shipPosition[1] ** 2 + shipPosition[2] ** 2);
  const v2 = shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2;
  const speedKms = Math.sqrt(v2) * AU_TO_KM;
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  const targetAU = phase.targetOrbit.semiMajorAxis;
  const thrustAccelKms = SPACECRAFT_CONFIG.maxThrustAU * AU_TO_KM;

  switch (phase.name) {
    case '等待发射窗口': {
      const jd = julianDate(simulatedTime);
      const targetState = computeBodyState(destinationId, jd);
      if (!targetState) {
        return {
          title: '等待发射窗口',
          actionText: '保持当前轨道，等待地火相位对齐',
          metrics: [],
          progress: 0,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'prograde',
        };
      }

      const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
      const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);
      const aCurrentAU = getStableReferenceSemiMajorAxis(shipPosition, shipVelocity, simulatedTime);
      const destData = REAL_DATA[destinationId];
      if (!destData?.semiMajorAxis) {
        return {
          title: '等待发射窗口',
          actionText: '目标轨道数据不足，暂时保持滑行',
          metrics: [],
          progress: 0,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'prograde',
        };
      }
      const aTargetAU = destData.semiMajorAxis;
      const goingOutward = aTargetAU > aCurrentAU;
      const omegaShip = Math.sqrt(MU_SUN_AU / (aCurrentAU * aCurrentAU * aCurrentAU));
      const omegaTarget = Math.sqrt(MU_SUN_AU / (aTargetAU * aTargetAU * aTargetAU));
      const aTransferAU = (aCurrentAU + aTargetAU) / 2;
      const transferTimeSec = Math.PI * Math.sqrt((aTransferAU ** 3) / MU_SUN_AU);
      const targetTravelAngle = omegaTarget * transferTimeSec;

      let requiredPhase: number;
      let currentPhase: number;
      if (goingOutward) {
        requiredPhase = Math.PI - targetTravelAngle;
        currentPhase = shipAngle - targetAngle;
      } else {
        requiredPhase = targetTravelAngle - Math.PI;
        currentPhase = targetAngle - shipAngle;
      }

      const TWO_PI = 2 * Math.PI;
      const requiredNorm = ((requiredPhase % TWO_PI) + TWO_PI) % TWO_PI;
      const currentNorm = ((currentPhase % TWO_PI) + TWO_PI) % TWO_PI;
      const requiredDeg = requiredNorm * 180 / Math.PI;
      const currentDeg = currentNorm * 180 / Math.PI;
      const diffDeg = ((requiredNorm - currentNorm + TWO_PI) % TWO_PI) * 180 / Math.PI;
      const synodicRate = Math.abs(omegaShip - omegaTarget);
      const remainingDays = completed ? 0 : ((requiredNorm - currentNorm + TWO_PI) % TWO_PI) / synodicRate / 86400;

      return {
        title: completed ? '窗口已就绪！' : '等待发射窗口',
        actionText: completed ? '发射窗口已对齐，即将进入下一阶段' : '保持当前轨道惯性飞行 · 无需推力操作',
        metrics: [
          { label: '地火相位差', current: currentDeg, target: requiredDeg, unit: '°', highlight: true },
          { label: '角度偏差', current: diffDeg, target: 0, unit: '°', warn: !completed },
          { label: '预计等待', current: remainingDays, target: 0, unit: '日', highlight: true },
        ],
        progress: completed ? 100 : Math.max(0, 100 - Math.min(100, diffDeg / 2)),
        estimatedRemaining: remainingDays * 86400,
        completed,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'prograde',
      };
    }

    case '提升远日点':
    case '降低近日点': {
      const isOutward = phase.name.includes('提升');
      const phaseAngleDeg = getPhaseAngleDegForDeparture(shipPosition, simulatedTime);
      const phaseAngleInRange = phaseAngleDeg != null
        && phaseAngleDeg >= NAVIGATION_CONFIG.thrustWindowMinDeg
        && phaseAngleDeg <= NAVIGATION_CONFIG.thrustWindowMaxDeg;
      let burnDirectionAligned = true;

      // Compute Hohmann target velocity components and remaining Δv
      const aDepartAU = 1.0; // simplified; actual departure SMA is ~1 AU
      const destDataInternal = REAL_DATA[destinationId];
      const aDestAU = destDataInternal?.semiMajorAxis ?? 1.52;
      const aTransAU = (aDepartAU + aDestAU) / 2;
      const vDepartTarget = Math.sqrt(MU_SUN_AU * (2 / aDepartAU - 1 / aTransAU));
      const vEarthOrbit = Math.sqrt(MU_SUN_AU / aDepartAU);
      const vInfRequiredKms = (vDepartTarget - vEarthOrbit) * AU_TO_KM;

      // Earth-relative state
      const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
      let vRelNowKms = 0;
      let vRelTargetKms = 0;
      let remainingDeltaVKms = 0;
      let estimatedBurnSec = 0;
      let escaped = false;

      if (orbitingId !== 'sun') {
        const jd = julianDate(simulatedTime);
        const bodyState = computeBodyState(orbitingId, jd);
        if (bodyState) {
          const drx = shipPosition[0] - bodyState.position[0];
          const dry = shipPosition[1] - bodyState.position[1];
          const drz = shipPosition[2] - bodyState.position[2];
          const dvx = shipVelocity[0] - bodyState.velocity[0];
          const dvy = shipVelocity[1] - bodyState.velocity[1];
          const dvz = shipVelocity[2] - bodyState.velocity[2];
          vRelNowKms = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz) * AU_TO_KM;
          const bodySpeed = Math.sqrt(
            bodyState.velocity[0] ** 2 + bodyState.velocity[1] ** 2 + bodyState.velocity[2] ** 2,
          );
          const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
          if (bodySpeed > 1e-15 && relSpeed > 1e-15) {
            const alignment = (dvx * bodyState.velocity[0] + dvy * bodyState.velocity[1] + dvz * bodyState.velocity[2]) / (relSpeed * bodySpeed);
            burnDirectionAligned = isOutward ? alignment > 0.35 : alignment < -0.35;
          }
          const rRel = Math.sqrt(drx * drx + dry * dry + drz * drz);
          const muBody = G_AU * (REAL_DATA[orbitingId]?.mass ?? 0);
          const vEscLocal = Math.sqrt(2 * muBody / rRel) * AU_TO_KM;
          vRelTargetKms = Math.sqrt(vInfRequiredKms * vInfRequiredKms + vEscLocal * vEscLocal);
          remainingDeltaVKms = Math.max(0, vRelTargetKms - vRelNowKms);
          estimatedBurnSec = thrustMagnitude > 0 && remainingDeltaVKms > 0
            ? remainingDeltaVKms / thrustAccelKms
            : 0;
          const relEnergy = vRelNowKms * vRelNowKms / 2 / (AU_TO_KM * AU_TO_KM) - muBody / rRel;
          escaped = relEnergy > 0;
        }
      }

      if (completed) {
        return {
          title: '已完成',
          actionText: '半长轴已达目标，即将进入转移轨道滑行',
          metrics: [
            { label: '日心半长轴', current: aCurrent, target: targetAU, unit: 'AU', highlight: true },
          ],
          progress: 100,
          completed: true,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'prograde',
        };
      }

      const title = thrustMagnitude > 0
        ? (escaped ? '已逃逸！正在提升日心能量' : '正在加速...')
        : (phaseAngleInRange && burnDirectionAligned ? '点火时机良好' : '等待点火时机');
      const actionText = thrustMagnitude > 0
        ? '全推力 100MN 顺向加速 · 不要松油门直至系统提示完成'
        : '准备全推力 100MN 顺向加速（绕飞相位85-95°时点燃）';
      const metrics: GuidanceMetric[] = [
        { label: '绕飞相位', current: phaseAngleDeg ?? 0, target: 90, unit: '°', highlight: true, warn: phaseAngleDeg != null && !phaseAngleInRange },
      ];
      if (orbitingId !== 'sun') {
        metrics.push(
          { label: '相对速度', current: vRelNowKms, target: vRelTargetKms, unit: 'km/s', highlight: true },
          { label: '还差 Δv', current: remainingDeltaVKms, target: 0, unit: 'km/s', highlight: remainingDeltaVKms > 0.1 },
        );
        if (thrustMagnitude > 0 && estimatedBurnSec > 0) {
          metrics.push(
            { label: '预计推力结束', current: estimatedBurnSec, target: 0, unit: '秒', highlight: true },
          );
        }
        metrics.push({
          label: '逃逸状态', current: escaped ? 1 : 0, target: 1, unit: '', highlight: escaped,
        });
        metrics.push({
          label: '点火方向', current: burnDirectionAligned ? 1 : 0, target: 1, unit: '', highlight: burnDirectionAligned, warn: !burnDirectionAligned,
        });
      }
      metrics.push(
        { label: '日心半长轴', current: aCurrent, target: targetAU, unit: 'AU', highlight: true },
        { label: '日心速度', current: speedKms, target: targetAU > 0 ? Math.sqrt(MU_SUN_AU * (2 / r - 1 / targetAU)) * AU_TO_KM : 0, unit: 'km/s' },
      );

      const smaProgress = Math.min(100, Math.max(0, (aCurrent - 1) / (targetAU - 1) * 100));

      return {
        title,
        actionText,
        metrics,
        progress: completed ? 100 : smaProgress,
        completed: false,
        shouldThrust: (phaseAngleInRange && burnDirectionAligned) || thrustMagnitude > 0,
        thrustDirection: isOutward ? 'forward' : 'backward',
        thrustMagnitude: 100,
        attitudeMode: 'prograde',
        estimatedRemaining: estimatedBurnSec > 0 ? estimatedBurnSec : undefined,
      };
    }

    case '转移轨道滑行': {
      const jd = julianDate(simulatedTime);
      const destState = computeBodyState(destinationId, jd);
      let distToDest = Infinity;
      if (destState) {
        const dx = destState.position[0] - shipPosition[0];
        const dy = destState.position[1] - shipPosition[1];
        const dz = destState.position[2] - shipPosition[2];
        distToDest = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
      const apoapsis = ecc < 1 ? aCurrent * (1 + ecc) : Infinity;
      const periapsis = ecc < 1 ? aCurrent * (1 - ecc) : aCurrent * (ecc - 1);
      const destSMA = REAL_DATA[destinationId]?.semiMajorAxis ?? 0;
      const canReach = apoapsis === Infinity || apoapsis >= destSMA - 0.01;

      const distKmM = distToDest * AU_TO_KM / 1e6;

      return {
        title: completed ? '即将到达' : (!canReach ? '⚠ 远日点不足' : '转移滑行中'),
        actionText: completed ? '已到达目标天体附近！' : '关闭推力 · 沿转移椭圆轨道惯性滑行',
        metrics: [
          { label: '日心半长轴', current: aCurrent, target: targetAU, unit: 'AU' },
          { label: '远日点', current: apoapsis === Infinity ? 999 : apoapsis, target: destSMA, unit: 'AU', warn: !canReach, highlight: true },
          { label: '近日点', current: periapsis, target: 0, unit: 'AU' },
          { label: '偏心率', current: ecc, target: 0, unit: '' },
          { label: '距' + destName, current: distToDest, target: NAVIGATION_CONFIG.approachDistanceAU, unit: 'AU', highlight: true },
          { label: '距' + destName + '(万km)', current: distKmM, target: 0, unit: '万km' },
          { label: '轨道能量', current: v2 / 2 - MU_SUN_AU / r, target: 0, unit: 'AU²/s²' },
        ],
        progress: Math.min(100, Math.max(0, Math.min(100, (1 - distToDest / 2) * 100))),
        completed,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'prograde',
      };
    }

    case '目标捕获制动':
    case '目标捕获加速': {
      if (completed) {
        return {
          title: '已完成',
          actionText: '半长轴已达目标，即将进入绕飞圆化',
          metrics: [
            { label: '日心半长轴', current: aCurrent, target: targetAU, unit: 'AU', highlight: true },
          ],
          progress: 100,
          completed: true,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'prograde',
        };
      }

      const remainingDVKms = Math.abs(speedKms - Math.sqrt(MU_SUN_AU * (2 / r - 1 / targetAU)) * AU_TO_KM);
      const estimatedBurnSec2 = thrustMagnitude > 0 && remainingDVKms > 0
        ? remainingDVKms / thrustAccelKms
        : 0;
      const isBraking = phase.name.includes('制动');

      const burnProgress = targetAU > 0
        ? Math.min(100, Math.max(0,
            isBraking
              ? ((aCurrent - targetAU) / 0.3) * 100
              : ((targetAU - aCurrent) / 0.3) * 100
          ))
        : 0;

      return {
        title: thrustMagnitude > 0 ? (isBraking ? '正在制动' : '正在加速') : (isBraking ? '准备制动' : '准备加速'),
        actionText: thrustMagnitude > 0
          ? `全推力 100MN ${isBraking ? '逆向减速' : '顺向加速'}`
          : `打开全推力 100MN ${isBraking ? '逆向减速' : '顺向加速'}`,
        metrics: [
          { label: '日心半长轴', current: aCurrent, target: targetAU, unit: 'AU', highlight: true },
          { label: '还差 Δv', current: remainingDVKms, target: 0, unit: 'km/s', highlight: remainingDVKms > 0.1 },
          ...(estimatedBurnSec2 > 0 ? [{ label: '预计推力结束', current: estimatedBurnSec2, target: 0, unit: '秒', highlight: true }] : []),
          { label: '日心速度', current: speedKms, target: targetAU > 0 ? Math.sqrt(MU_SUN_AU / targetAU) * AU_TO_KM : 0, unit: 'km/s' },
        ],
        progress: burnProgress,
        completed: false,
        shouldThrust: true,
        thrustDirection: phase.thrustDirection,
        thrustMagnitude: 100,
        attitudeMode: 'prograde',
        estimatedRemaining: estimatedBurnSec2 > 0 ? estimatedBurnSec2 : undefined,
      };
    }

    case '绕飞圆化': {
      const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
      const jd = julianDate(simulatedTime);
      const destState = computeBodyState(destinationId, jd);
      let distToDest2 = Infinity;
      if (destState) {
        const dx = destState.position[0] - shipPosition[0];
        const dy = destState.position[1] - shipPosition[1];
        const dz = destState.position[2] - shipPosition[2];
        distToDest2 = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const eccProgress = Math.min(100, Math.max(0, (1 - ecc / 0.05) * 100));

      return {
        title: completed ? '已完成！已到达' + destName : '圆化轨道',
        actionText: completed ? '已到达' + destName + '！导航完成' : '微调推力 · 圆化轨道 · 45MN 顺向保持',
        metrics: [
          { label: '偏心率', current: ecc, target: NAVIGATION_CONFIG.orbitCircularizationEcc, unit: '', highlight: true, warn: ecc >= NAVIGATION_CONFIG.orbitCircularizationEcc },
          { label: '半长轴', current: aCurrent, target: targetAU, unit: 'AU' },
          { label: '距' + destName, current: distToDest2, target: NAVIGATION_CONFIG.arrivalDistanceAU, unit: 'AU', highlight: true },
        ],
        progress: Math.min(eccProgress, completed ? 100 : 99),
        completed,
        shouldThrust: !completed,
        thrustDirection: 'forward',
        thrustMagnitude: 45,
        attitudeMode: 'prograde',
      };
    }

    default:
      return {
        title: phase.name,
        actionText: '',
        metrics: [],
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'prograde',
      };
  }
}

function isBoundTargetOrbit(orbit: TargetRelativeOrbit): boolean {
  return orbit.energy < 0
    && Number.isFinite(orbit.semiMajorAxis)
    && Number.isFinite(orbit.apoapsis)
    && orbit.eccentricity < 1;
}

function isNearTargetApoapsis(orbit: TargetRelativeOrbit): boolean {
  if (!isBoundTargetOrbit(orbit)) return false;
  const tolerance = Math.max(orbit.apoapsis * 0.04, orbit.safeOrbitRadius);
  return Math.abs(orbit.distance - orbit.apoapsis) <= tolerance;
}

function isNearTargetPeriapsis(orbit: TargetRelativeOrbit): boolean {
  if (!isBoundTargetOrbit(orbit)) return false;
  const tolerance = Math.max(orbit.periapsis * 0.35, orbit.safeOrbitRadius * 0.8);
  return Math.abs(orbit.distance - orbit.periapsis) <= tolerance;
}

function relativeProgradeDirection(orbit: TargetRelativeOrbit): [number, number, number] {
  return vectorNormalize(orbit.relativeVelocity);
}

function relativeRetrogradeDirection(orbit: TargetRelativeOrbit): [number, number, number] {
  return vectorScale(relativeProgradeDirection(orbit), -1);
}

function directionToTarget(orbit: TargetRelativeOrbit): [number, number, number] {
  return vectorScale(vectorNormalize(orbit.relativePosition), -1);
}

function targetOrbitMetrics(orbit: TargetRelativeOrbit): GuidanceMetric[] {
  return [
    { label: `距${orbit.targetName}`, current: orbit.distance, target: orbit.stableApoapsis, unit: 'AU', highlight: true },
    { label: `${orbit.targetName}相对速度`, current: orbit.speed * AU_TO_KM, target: 0, unit: 'km/s', highlight: true },
    { label: `${orbit.targetName}相对能量`, current: orbit.energy, target: 0, unit: 'AU²/s²', highlight: orbit.energy < 0, warn: orbit.energy >= 0 },
    { label: '近点', current: Number.isFinite(orbit.periapsis) ? orbit.periapsis : 999, target: orbit.safeOrbitRadius, unit: 'AU', warn: orbit.periapsis <= orbit.safeOrbitRadius },
    { label: '远点', current: Number.isFinite(orbit.apoapsis) ? orbit.apoapsis : 999, target: orbit.stableApoapsis, unit: 'AU', warn: orbit.apoapsis >= orbit.stableApoapsis },
    { label: '偏心率', current: Number.isFinite(orbit.eccentricity) ? orbit.eccentricity : 999, target: orbit.stableEccentricity, unit: '', warn: orbit.eccentricity >= orbit.stableEccentricity },
  ];
}

function guidanceWithDirection(
  input: LiveNavigationGuidanceInput,
  title: string,
  actionText: string,
  operation: 'turn' | 'ignite',
  desiredDirection: [number, number, number],
  desiredDirectionLabel: string,
  thrustDirection: 'forward' | 'backward',
  thrustMagnitude: number,
  metrics: GuidanceMetric[],
  reason: string,
): PhaseGuidance {
  const angleDeg = angleBetweenVectors(input.shipDirection, desiredDirection) * 180 / Math.PI;
  const needsTurn = angleDeg > 6;
  if (needsTurn) {
    return {
      operation: 'turn',
      title: `调整方向：${title}`,
      actionText,
      metrics: [
        { label: '船身夹角', current: angleDeg, target: 6, unit: '°', warn: true },
        ...metrics,
      ],
      progress: Math.max(0, 100 - angleDeg),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel,
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      reason,
    };
  }

  return {
    operation,
    title,
    actionText,
    metrics,
    progress: 20,
    completed: false,
    shouldThrust: true,
    thrustDirection,
    thrustMagnitude,
    attitudeMode: 'inertial',
    desiredDirection,
    desiredDirectionLabel,
    recommendedGear: 'D',
    recommendedThrustMagnitude: thrustMagnitude,
    suggestedTimeScale: 1,
    reason,
  };
}

function chooseTargetCoastTimeScale(orbit: TargetRelativeOrbit, targetApsis?: 'apoapsis' | 'periapsis'): number {
  if (targetApsis === 'apoapsis' && isNearTargetApoapsis(orbit)) return 1;
  if (targetApsis === 'periapsis' && isNearTargetPeriapsis(orbit)) return 1;
  if (targetApsis) {
    const targetDistance = targetApsis === 'apoapsis' ? orbit.apoapsis : orbit.periapsis;
    const distanceToApsis = Math.abs(orbit.distance - targetDistance);
    if (distanceToApsis > 0.003) return 100000;
    if (distanceToApsis > 0.001) return 10000;
    if (distanceToApsis > orbit.safeOrbitRadius * 4) return 1000;
    if (distanceToApsis > orbit.safeOrbitRadius * 2) return 100;
  }
  if (orbit.distance > 0.001) return 10000;
  if (orbit.distance > orbit.safeOrbitRadius * 4) return 1000;
  if (orbit.distance > orbit.safeOrbitRadius * 2) return 100;
  return 10;
}

function farTargetApproachMode(orbit: TargetRelativeOrbit): 'brake' | 'approach' | 'coast' {
  const relativeSpeedKms = orbit.speed * AU_TO_KM;
  const closingSpeedKms = Math.max(0, -orbit.distanceRate * AU_TO_KM);
  if (orbit.distance <= orbit.hillRadius * 2 && relativeSpeedKms > 0.65) return 'brake';
  if (relativeSpeedKms > 2.0 || closingSpeedKms > 0.55) return 'brake';
  if (closingSpeedKms < 0.12) return 'approach';
  return 'coast';
}

function chooseFarTargetCoastTimeScale(orbit: TargetRelativeOrbit): number {
  const boundary = orbit.hillRadius * 1.2;
  const closingRate = Math.max(0, -orbit.distanceRate);
  if (closingRate <= 1e-16 || orbit.distance <= boundary) return 1;
  const secondsToBoundary = (orbit.distance - boundary) / closingRate;
  if (secondsToBoundary > 30 * 86400) return 1000000;
  if (secondsToBoundary > 5 * 86400) return 100000;
  if (secondsToBoundary > 86400) return 10000;
  if (secondsToBoundary > 1800) return 100;
  if (secondsToBoundary > 300) return 10;
  return 1;
}

function computeFarMarsApproachGuidance(
  input: LiveNavigationGuidanceInput,
  orbit: TargetRelativeOrbit,
): PhaseGuidance {
  const mode = farTargetApproachMode(orbit);
  if (mode === 'coast') {
    return {
      operation: 'coast',
      title: '火星远距离接近速度已受控',
      actionText: '关闭推力滑行，接近火星希尔球时再降低时间倍率',
      metrics: targetOrbitMetrics(orbit),
      progress: 45,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection: directionToTarget(orbit),
      desiredDirectionLabel: '指向火星方向',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: chooseFarTargetCoastTimeScale(orbit),
      reason: '火星相对速度和闭合速度已受控，避免在制动和接近之间频繁切换',
    };
  }

  const direction = mode === 'approach'
    ? directionToTarget(orbit)
    : relativeRetrogradeDirection(orbit);
  const title = mode === 'approach' ? '点火接近火星' : '火星相对制动';
  const actionText = mode === 'approach'
    ? '船头对准火星方向，D档小推力接近，建立受控闭合速度'
    : '船头对准火星相对逆行方向，D档制动，先降低火星相对速度';

  return guidanceWithDirection(
    input,
    title,
    actionText,
    'ignite',
    direction,
    mode === 'approach' ? '指向火星方向' : '火星相对逆行方向',
    mode === 'approach' ? 'forward' : 'backward',
    mode === 'approach' ? 15 : 100,
    [
      {
        label: mode === 'approach' ? '火星闭合速度' : '火星相对速度',
        current: mode === 'approach' ? Math.max(0, -orbit.distanceRate * AU_TO_KM) : orbit.speed * AU_TO_KM,
        target: mode === 'approach' ? 0.35 : 0.65,
        unit: 'km/s',
        highlight: true,
      },
      ...targetOrbitMetrics(orbit),
    ],
    mode === 'approach'
      ? '火星远距离闭合速度不足，先朝火星小推力接近'
      : '火星接近速度过高，优先执行相对制动以便后续捕获',
  );
}

function computeMarsLiveGuidance(input: LiveNavigationGuidanceInput, orbit: TargetRelativeOrbit): PhaseGuidance | null {
  if (isStableTargetOrbit(orbit, 'mars')) {
    return {
      operation: 'arrived',
      title: '已进入火星绕飞轨道',
      actionText: '保持熄火，飞船已处于火星稳定束缚轨道',
      metrics: targetOrbitMetrics(orbit),
      progress: 100,
      completed: true,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      reason: '火星相对机械能为负，近火点、远火点和偏心率均处于稳定绕飞范围内',
    };
  }

  const isEarthDepartureOrbit = getOrbitingBodyId(input.shipPosition, input.simulatedTime) === 'earth';
  const withinMarsLiveApproach = !isEarthDepartureOrbit
    && orbit.distance <= Math.max(MARS_LIVE_APPROACH_RADIUS_AU, orbit.hillRadius * 3);
  const isFarMarsApproach = orbit.distance > orbit.hillRadius * 1.2;

  if (withinMarsLiveApproach && isFarMarsApproach) {
    return computeFarMarsApproachGuidance(input, orbit);
  }

  if (isBoundTargetOrbit(orbit)) {
    const needsRaisePeriapsis = orbit.periapsis <= orbit.safeOrbitRadius;
    const needsLowerApoapsis = orbit.apoapsis >= orbit.stableApoapsis
      || orbit.eccentricity >= orbit.stableEccentricity;

    if (needsRaisePeriapsis) {
      const direction = relativeProgradeDirection(orbit);
      if (!isNearTargetApoapsis(orbit)) {
        return {
          operation: 'coast',
          title: '滑行到远火点',
          actionText: '保持熄火，等飞船接近远火点后再顺向点火提高近火点',
          metrics: [
            { label: '距远火点差', current: Math.abs(orbit.distance - orbit.apoapsis), target: orbit.safeOrbitRadius, unit: 'AU', highlight: true },
            ...targetOrbitMetrics(orbit),
          ],
          progress: 40,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'inertial',
          desiredDirection: direction,
          desiredDirectionLabel: '火星相对顺行方向',
          recommendedGear: 'N',
          recommendedThrustMagnitude: 0,
          suggestedTimeScale: chooseTargetCoastTimeScale(orbit, 'apoapsis'),
          reason: '火星束缚轨道近火点过低，必须在远火点附近顺向点火抬高近火点',
        };
      }
      return guidanceWithDirection(
        input,
        '点火提高近火点',
        '船头对准火星相对顺行方向，D档点火，提高近火点到安全高度',
        'ignite',
        direction,
        '火星相对顺行方向',
        'forward',
        35,
        targetOrbitMetrics(orbit),
        '火星束缚轨道近火点过低，正在执行远火点顺向修正',
      );
    }

    if (needsLowerApoapsis) {
      const direction = relativeRetrogradeDirection(orbit);
      if (!isNearTargetPeriapsis(orbit)) {
        return {
          operation: 'coast',
          title: '滑行到近火点',
          actionText: '保持熄火，等飞船接近近火点后再反向点火降低远火点',
          metrics: [
            { label: '距近火点差', current: Math.abs(orbit.distance - orbit.periapsis), target: orbit.safeOrbitRadius, unit: 'AU', highlight: true },
            ...targetOrbitMetrics(orbit),
          ],
          progress: 55,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'inertial',
          desiredDirection: direction,
          desiredDirectionLabel: '火星相对逆行方向',
          recommendedGear: 'N',
          recommendedThrustMagnitude: 0,
          suggestedTimeScale: chooseTargetCoastTimeScale(orbit, 'periapsis'),
          reason: '火星束缚轨道远火点过大或偏心率过高，必须在近火点附近反向点火降低远火点',
        };
      }
      return guidanceWithDirection(
        input,
        '点火降低远火点',
        '船头对准火星相对逆行方向，D档点火，降低远火点并圆化绕飞轨道',
        'ignite',
        direction,
        '火星相对逆行方向',
        'backward',
        35,
        targetOrbitMetrics(orbit),
        '火星束缚轨道远火点过大，正在执行近火点反向圆化',
      );
    }

    return {
      operation: 'coast',
      title: '火星束缚轨道滑行',
      actionText: '保持熄火，等待下一个近火点或远火点进行精修',
      metrics: targetOrbitMetrics(orbit),
      progress: 70,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: chooseTargetCoastTimeScale(orbit),
      reason: '飞船已被火星捕获，但仍需等待合适的轨道位置继续修正',
    };
  }

  if (withinMarsLiveApproach) {
    return guidanceWithDirection(
      input,
      '火星相对制动',
      '船头对准火星相对逆行方向，D档制动，先降低火星相对速度',
      'ignite',
      relativeRetrogradeDirection(orbit),
      '火星相对逆行方向',
      'backward',
      100,
      [
        {
          label: '火星相对速度',
          current: orbit.speed * AU_TO_KM,
          target: 0.65,
          unit: 'km/s',
          highlight: true,
        },
        ...targetOrbitMetrics(orbit),
      ],
      '已接近火星希尔球，优先执行相对制动以便进入束缚轨道',
    );
  }

  return null;
}

function relativeProgradeFromOrbitingBody(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  simulatedTime: number,
): [number, number, number] {
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingId === 'sun') return vectorNormalize(shipVelocity);

  const bodyState = computeBodyState(orbitingId, julianDate(simulatedTime));
  if (!bodyState) return vectorNormalize(shipVelocity);

  return vectorNormalize([
    shipVelocity[0] - bodyState.velocity[0],
    shipVelocity[1] - bodyState.velocity[1],
    shipVelocity[2] - bodyState.velocity[2],
  ]);
}

function hasEscapedCurrentOrbitingBody(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  simulatedTime: number,
): boolean {
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingId === 'sun') return true;

  const orbitingData = REAL_DATA[orbitingId];
  const bodyState = computeBodyState(orbitingId, julianDate(simulatedTime));
  if (!orbitingData || !bodyState) return false;

  const relPosition: [number, number, number] = [
    shipPosition[0] - bodyState.position[0],
    shipPosition[1] - bodyState.position[1],
    shipPosition[2] - bodyState.position[2],
  ];
  const relVelocity: [number, number, number] = [
    shipVelocity[0] - bodyState.velocity[0],
    shipVelocity[1] - bodyState.velocity[1],
    shipVelocity[2] - bodyState.velocity[2],
  ];
  const distance = vectorLength(relPosition);
  if (distance < 1e-12) return false;

  const speed2 = vectorDot(relVelocity, relVelocity);
  const relativeEnergy = speed2 / 2 - (G_AU * orbitingData.mass) / distance;
  return relativeEnergy > 0;
}

function enrichFallbackGuidance(
  input: LiveNavigationGuidanceInput,
  phase: NavigationPhase,
  fallback: PhaseGuidance,
): PhaseGuidance {
  if (phase.name.startsWith('等待')) {
    return {
      ...fallback,
      operation: 'jumpTime',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 100000,
    };
  }

  if (fallback.completed) {
    return {
      ...fallback,
      operation: 'cutoff',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
    };
  }

  if (phase.thrustDirection === 'none') {
    return {
      ...fallback,
      operation: 'coast',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 10000,
    };
  }

  const prograde = relativeProgradeFromOrbitingBody(input.shipPosition, input.shipVelocity, input.simulatedTime);
  const desiredDirection = phase.thrustDirection === 'backward'
    ? vectorScale(prograde, -1)
    : prograde;
  const angleDeg = angleBetweenVectors(input.shipDirection, desiredDirection) * 180 / Math.PI;
  const needsTurn = angleDeg > 6;
  const directionLabel = phase.thrustDirection === 'backward' ? '当前绕飞逆行方向' : '当前绕飞顺行方向';
  const readyToBurn = fallback.shouldThrust;

  return {
    ...fallback,
    operation: needsTurn ? 'turn' : readyToBurn ? 'ignite' : 'wait',
    shouldThrust: !needsTurn && readyToBurn,
    desiredDirection,
    desiredDirectionLabel: directionLabel,
    recommendedGear: needsTurn || !readyToBurn ? 'N' : 'D',
    recommendedThrustMagnitude: needsTurn || !readyToBurn ? 0 : phase.thrustMagnitude,
    suggestedTimeScale: needsTurn || readyToBurn ? 1 : 10,
  };
}

function computeHeliocentricTransferCoastGuidance(
  input: LiveNavigationGuidanceInput,
  targetOrbit: TargetRelativeOrbit | null,
): PhaseGuidance | null {
  const destination = REAL_DATA[input.destinationId];
  if (!destination?.semiMajorAxis) return null;
  if (!hasEscapedCurrentOrbitingBody(input.shipPosition, input.shipVelocity, input.simulatedTime)) return null;

  const a = computeOrbitalSemiMajorAxis(input.shipPosition, input.shipVelocity, MU_SUN_AU);
  const ecc = computeEccentricity(input.shipPosition, input.shipVelocity, MU_SUN_AU);
  if (!Number.isFinite(a) || !Number.isFinite(ecc) || a <= 0 || ecc >= 1) return null;

  const periapsis = a * (1 - ecc);
  const apoapsis = a * (1 + ecc);
  const targetA = destination.semiMajorAxis;
  const tolerance = Math.max(0.08, targetA * 0.05);
  const targetReachedByOrbit = targetA >= periapsis - tolerance && targetA <= apoapsis + tolerance;
  if (!targetReachedByOrbit) return null;

  const distanceToTarget = targetOrbit?.distance ?? 0;
  const suggestedTimeScale = distanceToTarget < 0.13
    ? 1000
    : 100000;
  const r = vectorLength(input.shipPosition);

  return {
    operation: 'coast',
    title: '转移轨道滑行',
    actionText: `当前日心转移轨道已覆盖${destination.name}轨道，保持空档滑行并等待接近`,
    metrics: [
      { label: '日心距', current: r, target: targetA, unit: 'AU', highlight: true },
      { label: '近日点', current: periapsis, target: Math.min(periapsis, targetA), unit: 'AU' },
      { label: '远日点', current: apoapsis, target: Math.max(apoapsis, targetA), unit: 'AU', highlight: true },
      { label: `距${destination.name}`, current: distanceToTarget, target: 0.1, unit: 'AU', highlight: true },
    ],
    progress: Math.max(0, Math.min(100, (r - periapsis) / Math.max(apoapsis - periapsis, 1e-9) * 100)),
    completed: false,
    shouldThrust: false,
    thrustDirection: 'none',
    thrustMagnitude: 0,
    attitudeMode: 'inertial',
    recommendedGear: 'N',
    recommendedThrustMagnitude: 0,
    suggestedTimeScale,
    reason: '飞船已经在通往目标轨道的日心转移椭圆上，重新规划不应退回等待发射窗口',
  };
}

export function computeLiveNavigationGuidance(input: LiveNavigationGuidanceInput): PhaseGuidance {
  const targetData = REAL_DATA[input.destinationId];
  if (!targetData) {
    return {
      operation: 'coast',
      title: '暂无导航',
      actionText: '目标天体不存在',
      metrics: [],
      progress: 0,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
    };
  }

  const targetOrbit = computeTargetRelativeOrbit(
    input.shipPosition,
    input.shipVelocity,
    input.destinationId,
    input.simulatedTime,
  );

  if (input.destinationId === 'mars' && targetOrbit) {
    const marsGuidance = computeMarsLiveGuidance(input, targetOrbit);
    if (marsGuidance) return marsGuidance;
  }

  const transferGuidance = computeHeliocentricTransferCoastGuidance(input, targetOrbit);
  if (transferGuidance) return transferGuidance;

  const plan = planHohmannTransfer(
    input.shipPosition,
    input.shipVelocity,
    input.destinationId,
    input.simulatedTime,
  );
  const phase = plan.phases[0];
  if (phase) {
    const fallback = computePhaseGuidance(
      phase,
      input.shipPosition,
      input.shipVelocity,
      input.destinationId,
      input.simulatedTime,
      'inertial',
      input.thrustMagnitude,
    );
    const enriched = enrichFallbackGuidance(input, phase, fallback);
    return {
      ...enriched,
      reason: '尚未进入目标天体捕获区，沿用实时重算的霍曼转移阶段指引',
    };
  }

  return {
    operation: 'coast',
    title: `前往${targetData.name}`,
    actionText: '保持当前状态并等待下一轮导航刷新',
    metrics: targetOrbit ? targetOrbitMetrics(targetOrbit) : [],
    progress: 0,
    completed: false,
    shouldThrust: false,
    thrustDirection: 'none',
    thrustMagnitude: 0,
    attitudeMode: 'inertial',
    reason: '当前状态暂无可执行机动',
  };
}
