import { REAL_DATA, MU_SUN_AU, AU_TO_KM, NAVIGATION_CONFIG } from './constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';

export type NavSubStepType =
  | 'wait_window'
  | 'wait_departure_tangent'
  | 'burn_prograde'
  | 'burn_retrograde'
  | 'burn_circularize'
  | 'coast_transfer'
  | 'coast_approach'
  | 'orient_prograde'
  | 'orient_target'
  | 'arrival';

export type NavSubStepStatus = 'pending' | 'ready' | 'active' | 'completed';

export type NavSubStepConditionType =
  | 'phase_angle_range'
  | 'semi_major_axis_range'
  | 'distance_range'
  | 'window_ready'
  | 'immediate'
  | 'always';

export interface NavSubStepCondition {
  type: NavSubStepConditionType;
  min?: number;
  max?: number;
  met: boolean;
  description: string;
}

export interface NavSubStepAction {
  thrustDirection: 'forward' | 'backward' | 'off';
  thrustMagnitude: number;
  attitudeMode: 'prograde' | 'inertial' | 'target';
  targetSpeedKmS?: number;
  targetSpeedAUs?: number;
  targetSemiMajorAxisAU?: number;
  description: string;
  completionCriteria: string;
}

export interface NavSubStep {
  id: string;
  phaseId: number;
  order: number;
  type: NavSubStepType;
  status: NavSubStepStatus;
  condition: NavSubStepCondition;
  action: NavSubStepAction;
}

export interface NavigationPhase {
  index: number;
  name: string;
  subSteps: NavSubStep[];
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

const BODY_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

// Hill sphere radius for each body (AU)
function getHillRadiusAU(bodyId: string): number {
  if (bodyId === 'sun') return Infinity;
  const data = REAL_DATA[bodyId];
  if (!data?.semiMajorAxis) return 0;
  const a = data.semiMajorAxis; // already in AU
  const m = data.mass;
  const M = REAL_DATA.sun.mass;
  return a * Math.pow(m / (3 * M), 1 / 3);
}

// Find which body the ship is gravitationally orbiting
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

    const bx = state.position[0];
    const by = state.position[1];
    const bz = state.position[2];
    const dx = shipPosition[0] - bx;
    const dy = shipPosition[1] - by;
    const dz = shipPosition[2] - bz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const hillR = getHillRadiusAU(id);
    if (dist < hillR) return id;
  }
  return 'sun';
}

// Get the effective heliocentric semi-major axis of the body the ship is orbiting
export function getOrbitingBodySemiMajorAxis(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number {
  const bodyId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (bodyId === 'sun') return 0;
  const data = REAL_DATA[bodyId];
  return data?.semiMajorAxis ?? 0;
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

export function planHohmannTransfer(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): NavigationPlan {
  const aCurrentAU = getNearestBodySemiMajorAxis(shipPosition, simulatedTime);

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

  // --- Launch window calculation ---
  const jd = julianDate(simulatedTime);

  // Current angular positions (relative to sun at origin)
  const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
  const targetState = destinationId === 'sun' ? null : computeBodyState(destinationId, jd);
  let hasWaitingPhase = false;
  let waitDays = 0;

  if (targetState) {
    const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);

    // Orbital angular velocities (rad/s) - using MU_SUN_AU for AU-scaled coordinates
    const omegaShip = Math.sqrt(MU_SUN_AU / (aCurrentAU * aCurrentAU * aCurrentAU));
    const omegaTarget = Math.sqrt(MU_SUN_AU / (aTargetAU * aTargetAU * aTargetAU));

    // Transfer time (seconds, half period of transfer ellipse)
    const transferTimeSec = Math.PI * Math.sqrt(
      (aTransferAU * aTransferAU * aTransferAU) / MU_SUN_AU
    );

    // Target's angular travel during transfer
    const targetTravelAngle = omegaTarget * transferTimeSec;

    // Required phase angle: for outward, ship should lead target by (PI - targetTravelAngle)
    // for inward, target should lead ship by (PI - targetTravelAngle)
    let requiredPhaseAngle: number;
    let currentPhaseAngle: number;

    if (goingOutward) {
      requiredPhaseAngle = Math.PI - targetTravelAngle;
      currentPhaseAngle = shipAngle - targetAngle;
    } else {
      requiredPhaseAngle = targetTravelAngle - Math.PI;
      currentPhaseAngle = targetAngle - shipAngle;
    }

    // Normalize to [0, 2π)
    const TWO_PI = 2 * Math.PI;
    const requiredNorm = ((requiredPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
    const currentNorm = ((currentPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;

    // Angular difference to wait for
    let angleToWait = requiredNorm - currentNorm;
    if (angleToWait < 0) angleToWait += TWO_PI;

    // Synodic period between ship orbital motion and target
    const synodicPeriod = TWO_PI / Math.abs(omegaShip - omegaTarget);
    const synodicDays = synodicPeriod / 86400;

    if (angleToWait > 0.05) { // More than ~3 degrees off — need waiting
      waitDays = (angleToWait / TWO_PI) * synodicDays;
      if (waitDays < 1) waitDays = 1;
      hasWaitingPhase = true;
    }
  }

  const phases: NavigationPhase[] = [];

  // Add waiting phase if needed
  if (hasWaitingPhase) {
    phases.push({
      index: 0,
      name: '等待发射窗口',
      subSteps: [],
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
      subSteps: [],
      thrustDirection: goingOutward ? 'forward' : 'backward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV1),
      expectedSpeedKms: Math.abs(deltaV1) * AU_TO_KM,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: phaseOffset + 1,
      name: '转移轨道滑行',
      subSteps: [],
      thrustDirection: 'none',
      thrustMagnitude: 0,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: phaseOffset + 2,
      name: goingOutward ? '目标捕获制动' : '目标捕获加速',
      subSteps: [],
      thrustDirection: goingOutward ? 'backward' : 'forward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV3),
      expectedSpeedKms: Math.abs(deltaV3) * AU_TO_KM,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: destData.orbital?.eccentricity ?? 0 },
    },
    {
      index: phaseOffset + 3,
      name: '绕飞圆化',
      subSteps: [],
      thrustDirection: 'forward',
      thrustMagnitude: 50,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: 0 },
    },
  );

  // Populate sub-steps for each phase
  for (const phase of phases) {
    const deltaV1AUs = Math.abs(deltaV1);
    phase.subSteps = generateSubSteps(
      shipPosition, shipVelocity, 'prograde',
      phase, destinationId,
      aCurrentAU, aTargetAU, aTransferAU,
      goingOutward, deltaV1AUs,
      simulatedTime,
    );
  }

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

  // Waiting window phase: check if phase angle condition is met
  if (phase.name.startsWith('等待')) {
    const jd = julianDate(simulatedTime);
    const targetState = computeBodyState(plan.destinationId, jd);
    if (!targetState) return false;

    const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
    const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);

    const aCurrentAU = getNearestBodySemiMajorAxis(shipPosition, simulatedTime);
    const destData = REAL_DATA[plan.destinationId];
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

    return diff < 0.05 || Math.abs(diff - TWO_PI) < 0.05; // within ~3 degrees
  }

  // Coast phase (transfer orbit)
  if (phase.thrustDirection === 'none') {
    const jd = julianDate(simulatedTime);
    const destState = computeBodyState(plan.destinationId, jd);
    if (!destState) return false;
    const dx = destState.position[0] - shipPosition[0];
    const dy = destState.position[1] - shipPosition[1];
    const dz = destState.position[2] - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < 0.1;
  }

  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
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

export function checkWindowReady(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  simulatedTime: number,
): { windowReady: boolean; remainingDays: number } {
  if (currentPhaseIdx < 0 || currentPhaseIdx >= plan.phases.length) {
    return { windowReady: false, remainingDays: 0 };
  }

  const phase = plan.phases[currentPhaseIdx];
  if (!phase.name.startsWith('等待')) {
    return { windowReady: false, remainingDays: 0 };
  }

  const jd = julianDate(simulatedTime);
  const targetState = computeBodyState(plan.destinationId, jd);
  if (!targetState) return { windowReady: false, remainingDays: 0 };

  const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
  const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);

  const aCurrentAU = getOrbitingBodySemiMajorAxis(shipPosition, simulatedTime);
  const destData = REAL_DATA[plan.destinationId];
  if (!destData?.semiMajorAxis) return { windowReady: false, remainingDays: 0 };
  const aTargetAU = destData.semiMajorAxis;
  const goingOutward = aTargetAU > aCurrentAU;

  const muSun = MU_SUN_AU;
  const omegaShip = Math.sqrt(muSun / (aCurrentAU * aCurrentAU * aCurrentAU));
  const omegaTarget = Math.sqrt(muSun / (aTargetAU * aTargetAU * aTargetAU));
  const aTransferAU = (aCurrentAU + aTargetAU) / 2;
  const transferTimeSec = Math.PI * Math.sqrt(
    (aTransferAU * aTransferAU * aTransferAU) / muSun
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
  const currentNorm = ((currentPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
  const requiredNorm = ((requiredPhaseAngle % TWO_PI) + TWO_PI) % TWO_PI;
  const diff = Math.abs(currentNorm - requiredNorm);
  const orbitalAligned = diff < 0.1 || Math.abs(diff - TWO_PI) < 0.1;

  // Check departure tangent if orbiting a planet
  let departureReady = true;
  const orbitingBodyId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingBodyId !== 'sun' && orbitingBodyId !== plan.destinationId) {
    const bodyState = computeBodyState(orbitingBodyId, jd);
    if (bodyState) {
      const bodyPosAU: [number, number, number] = [
        bodyState.position[0],
        bodyState.position[1],
        bodyState.position[2],
      ];
      const bodyVelAU: [number, number, number] = [
        bodyState.velocity[0],
        bodyState.velocity[1],
        bodyState.velocity[2],
      ];
      const rx = shipPosition[0] - bodyPosAU[0];
      const ry = shipPosition[1] - bodyPosAU[1];
      const rz = shipPosition[2] - bodyPosAU[2];
      const bv = Math.sqrt(bodyVelAU[0] ** 2 + bodyVelAU[1] ** 2 + bodyVelAU[2] ** 2);
      if (bv > 1e-15) {
        const vnx = bodyVelAU[0] / bv;
        const vny = bodyVelAU[1] / bv;
        const vnz = bodyVelAU[2] / bv;
        const dot = rx * vnx + ry * vny + rz * vnz;
        const rr = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const cosAngle = rr > 1e-15 ? dot / rr : 0;
        departureReady = goingOutward ? cosAngle > -0.3 : cosAngle < 0.3;
      }
    }
  }

  // Real-time remaining days: phase difference / synodic angular rate
  let angleToWait = requiredNorm - currentNorm;
  if (angleToWait < 0) angleToWait += TWO_PI;
  const synodicRate = Math.abs(omegaShip - omegaTarget);
  const remainingDays = orbitalAligned ? 0 : (angleToWait / synodicRate) / 86400;

  return {
    windowReady: orbitalAligned && departureReady,
    remainingDays,
  };
}

// ===== Sub-step condition evaluation =====

function evaluatePhaseAngle(
  shipPosition: [number, number, number],
  simulatedTime: number,
  cond: NavSubStepCondition,
): boolean {
  const jd = julianDate(simulatedTime);
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  if (orbitingId === 'sun') return true;
  const bodyState = computeBodyState(orbitingId, jd);
  if (!bodyState) return false;
  const rx = shipPosition[0] - bodyState.position[0];
  const ry = shipPosition[1] - bodyState.position[1];
  const bv = bodyState.velocity;
  const bvLen = Math.sqrt(bv[0] ** 2 + bv[1] ** 2 + bv[2] ** 2);
  if (bvLen < 1e-15) return true;
  const dot = (rx * bv[0] + ry * bv[1]) / bvLen;
  const rr = Math.sqrt(rx * rx + ry * ry);
  if (rr < 1e-15) return true;
  const cosAngle = dot / rr;
  const phaseAngleDeg = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI;
  const minDeg = cond.min ?? 30;
  const maxDeg = cond.max ?? 150;
  return phaseAngleDeg >= minDeg && phaseAngleDeg <= maxDeg;
}

function evaluateSemiMajorAxisCondition(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  cond: NavSubStepCondition,
): boolean {
  const a = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  const targetAU = cond.max ?? cond.min ?? 0;
  return Math.abs(a - targetAU) < NAVIGATION_CONFIG.phaseCompletionThresholdAU;
}

export function evaluateSubStepCondition(
  subStep: NavSubStep,
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  simulatedTime: number,
): boolean {
  const cond = subStep.condition;
  switch (cond.type) {
    case 'always':
    case 'immediate':
      return true;
    case 'phase_angle_range':
      return evaluatePhaseAngle(shipPosition, simulatedTime, cond);
    case 'semi_major_axis_range':
      return evaluateSemiMajorAxisCondition(shipPosition, shipVelocity, cond);
    case 'window_ready':
      return false; // handled externally by checkWindowReady
    default:
      return false;
  }
}

// ===== Sub-step completion check =====

export function checkWaitWindowComplete(
  shipPosition: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): boolean {
  const jd = julianDate(simulatedTime);
  const targetState = computeBodyState(destinationId, jd);
  if (!targetState) return false;
  const shipAngle = Math.atan2(shipPosition[1], shipPosition[0]);
  const targetAngle = Math.atan2(targetState.position[1], targetState.position[0]);
  const aCurrentAU = getNearestBodySemiMajorAxis(shipPosition, simulatedTime);
  const destData = REAL_DATA[destinationId];
  if (!destData || !destData.semiMajorAxis) return false;
  const aTargetAU = destData.semiMajorAxis;
  const goingOutward = aTargetAU > aCurrentAU;
  const muSun = MU_SUN_AU;
  const omegaTarget = Math.sqrt(muSun / (aTargetAU * aTargetAU * aTargetAU));
  const aTransferAU = (aCurrentAU + aTargetAU) / 2;
  const transferTimeSec = Math.PI * Math.sqrt((aTransferAU * aTransferAU * aTransferAU) / muSun);
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

export function checkSubStepCompletion(
  subStep: NavSubStep,
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  attitudeMode: string,
  destinationId: string,
  simulatedTime: number,
): boolean {
  switch (subStep.type) {
    case 'orient_prograde':
      return attitudeMode === 'prograde';
    case 'orient_target':
      return attitudeMode === 'target';
    case 'burn_prograde':
    case 'burn_retrograde': {
      const targetAU = subStep.action.targetSemiMajorAxisAU;
      if (targetAU == null) return false;
      const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
      return Math.abs(aCurrent - targetAU) < NAVIGATION_CONFIG.phaseCompletionThresholdAU;
    }
    case 'burn_circularize': {
      const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
      return ecc < NAVIGATION_CONFIG.orbitCircularizationEcc;
    }
    case 'coast_transfer':
    case 'coast_approach': {
      const jd = julianDate(simulatedTime);
      const destState = computeBodyState(destinationId, jd);
      if (!destState) return false;
      const dx = destState.position[0] - shipPosition[0];
      const dy = destState.position[1] - shipPosition[1];
      const dz = destState.position[2] - shipPosition[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return dist < NAVIGATION_CONFIG.approachDistanceAU;
    }
    case 'arrival': {
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
    default:
      return false;
  }
}

// ===== Sub-step generation =====

function generateWaitWindowSubSteps(phase: NavigationPhase): NavSubStep[] {
  const phaseId = phase.index;
  return [{
    id: `phase${phaseId}_wait`, phaseId, order: 0, type: 'wait_window', status: 'pending',
    condition: { type: 'window_ready', met: false, description: '日心相位差达到霍曼转移要求（±3°）' },
    action: {
      thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial',
      description: '保持当前轨道惯性飞行\n无需推力操作\n窗口到达后自动进入下一阶段',
      completionCriteria: '日心相位差满足霍曼要求',
    },
  }];
}

function generateOrbitalManeuverSubSteps(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  attitudeMode: string,
  phase: NavigationPhase,
  aTransferAU: number,
  goingOutward: boolean,
  deltaV1AUs: number,
): NavSubStep[] {
  const phaseId = phase.index;
  const vCurrentAUs = Math.sqrt(shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2);
  const targetSpeedAUs = vCurrentAUs + deltaV1AUs;
  const targetSpeedKmS = targetSpeedAUs * AU_TO_KM;
  const subSteps: NavSubStep[] = [];

  if (attitudeMode !== 'prograde') {
    subSteps.push({
      id: `phase${phaseId}_orient`, phaseId, order: 0, type: 'orient_prograde', status: 'pending',
      condition: { type: 'immediate', met: true, description: '切换姿态模式为顺向保持' },
      action: {
        thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde',
        description: '点击「顺向保持」按钮\n飞船方向自动对准速度矢量',
        completionCriteria: '姿态模式切换为顺向',
      },
    });
  }

  const orderOffset = subSteps.length;
  subSteps.push({
    id: `phase${phaseId}_burn`, phaseId, order: orderOffset,
    type: goingOutward ? 'burn_prograde' : 'burn_retrograde', status: 'pending',
    condition: {
      type: 'phase_angle_range',
      min: NAVIGATION_CONFIG.thrustWindowMinDeg,
      max: NAVIGATION_CONFIG.thrustWindowMaxDeg,
      met: false,
      description: `飞船相位角在 ${NAVIGATION_CONFIG.thrustWindowMinDeg}°~${NAVIGATION_CONFIG.thrustWindowMaxDeg}° 范围`,
    },
    action: {
      thrustDirection: 'forward', thrustMagnitude: 100, attitudeMode: 'prograde',
      targetSpeedKmS, targetSpeedAUs, targetSemiMajorAxisAU: aTransferAU,
      description: `正向推力 100MN · 保持顺向模式\n推力方向与飞船速度方向一致\n目标日心速度：${targetSpeedKmS.toFixed(2)} km/s（当前 ${(vCurrentAUs * AU_TO_KM).toFixed(2)} km/s）\n目标半长轴：${aTransferAU.toFixed(3)} AU`,
      completionCriteria: `日心半长轴达到 ${aTransferAU.toFixed(3)} AU`,
    },
  });

  return subSteps;
}

function generateCoastSubSteps(phase: NavigationPhase): NavSubStep[] {
  const phaseId = phase.index;
  return [{
    id: `phase${phaseId}_coast`, phaseId, order: 0, type: 'coast_transfer', status: 'pending',
    condition: { type: 'always', met: true, description: '沿转移轨道惯性滑行' },
    action: {
      thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial',
      description: '关闭推力，沿转移椭圆轨道惯性滑行\n无需任何操作\n耐心等待约半个转移周期',
      completionCriteria: `距目标天体距离 < ${NAVIGATION_CONFIG.approachDistanceAU} AU`,
    },
  }];
}

function generateCaptureSubSteps(
  attitudeMode: string,
  phase: NavigationPhase,
  aTargetAU: number,
  goingOutward: boolean,
): NavSubStep[] {
  const phaseId = phase.index;
  const vTargetOrbitAUs = Math.sqrt(MU_SUN_AU / aTargetAU);
  const targetSpeedKmS = vTargetOrbitAUs * AU_TO_KM;
  const subSteps: NavSubStep[] = [];

  if (attitudeMode !== 'prograde') {
    subSteps.push({
      id: `phase${phaseId}_orient`, phaseId, order: 0, type: 'orient_prograde', status: 'pending',
      condition: { type: 'immediate', met: true, description: '切换姿态模式为顺向保持' },
      action: {
        thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde',
        description: '点击「顺向保持」按钮', completionCriteria: '姿态模式切换为顺向',
      },
    });
  }

  const orderOffset = subSteps.length;
  subSteps.push({
    id: `phase${phaseId}_capture`, phaseId, order: orderOffset,
    type: goingOutward ? 'burn_retrograde' : 'burn_prograde', status: 'pending',
    condition: { type: 'always', met: true, description: '接近目标天体，执行捕获机动' },
    action: {
      thrustDirection: goingOutward ? 'backward' : 'forward',
      thrustMagnitude: 100, attitudeMode: 'prograde',
      targetSpeedKmS, targetSpeedAUs: vTargetOrbitAUs, targetSemiMajorAxisAU: aTargetAU,
      description: `${goingOutward ? '逆向推力减速制动' : '正向推力加速'} · 推力 100MN\n保持顺向模式\n目标日心速度：${targetSpeedKmS.toFixed(2)} km/s（目标天体轨道速度）`,
      completionCriteria: `日心半长轴达到 ${aTargetAU.toFixed(3)} AU`,
    },
  });

  return subSteps;
}

function generateCircularizeSubSteps(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  attitudeMode: string,
  phase: NavigationPhase,
  aTargetAU: number,
): NavSubStep[] {
  const phaseId = phase.index;
  const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  const needsSemiMajorAdjust = Math.abs(aCurrent - aTargetAU) > NAVIGATION_CONFIG.phaseCompletionThresholdAU;
  const mag = needsSemiMajorAdjust ? 50 : 30;
  const subSteps: NavSubStep[] = [];

  if (attitudeMode !== 'prograde') {
    subSteps.push({
      id: `phase${phaseId}_orient`, phaseId, order: 0, type: 'orient_prograde', status: 'pending',
      condition: { type: 'immediate', met: true, description: '切换姿态模式为顺向保持' },
      action: {
        thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde',
        description: '点击「顺向保持」按钮', completionCriteria: '姿态模式切换为顺向',
      },
    });
  }

  const orderOffset = subSteps.length;
  subSteps.push({
    id: `phase${phaseId}_circ`, phaseId, order: orderOffset,
    type: 'burn_circularize', status: 'pending',
    condition: { type: 'always', met: true, description: '轨道接近目标，开始圆化' },
    action: {
      thrustDirection: 'forward', thrustMagnitude: mag, attitudeMode: 'prograde',
      targetSemiMajorAxisAU: aTargetAU,
      description: `微调推力 ${mag}MN · 保持顺向模式\n目标偏心率 < ${NAVIGATION_CONFIG.orbitCircularizationEcc}\n当前偏心率：${ecc.toFixed(4)}`,
      completionCriteria: `偏心率 < ${NAVIGATION_CONFIG.orbitCircularizationEcc}`,
    },
  });

  subSteps.push({
    id: `phase${phaseId}_arrival`, phaseId, order: orderOffset + 1,
    type: 'arrival', status: 'pending',
    condition: { type: 'always', met: false, description: '轨道已圆化，接近目标天体' },
    action: {
      thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial',
      description: '已到达目标天体，关闭推力', completionCriteria: `偏心率 < ${NAVIGATION_CONFIG.orbitCircularizationEcc} 且距离 < ${NAVIGATION_CONFIG.arrivalDistanceAU} AU`,
    },
  });

  return subSteps;
}

export function generateSubSteps(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  attitudeMode: string,
  phase: NavigationPhase,
  destinationId: string,
  aCurrentAU: number,
  aTargetAU: number,
  aTransferAU: number,
  goingOutward: boolean,
  deltaV1AUs: number,
  _simulatedTime: number,
): NavSubStep[] {
  switch (phase.name) {
    case '等待发射窗口':
      return generateWaitWindowSubSteps(phase);
    case '提升远日点':
    case '降低近日点':
      return generateOrbitalManeuverSubSteps(shipPosition, shipVelocity, attitudeMode, phase, aTransferAU, goingOutward, deltaV1AUs);
    case '转移轨道滑行':
      return generateCoastSubSteps(phase);
    case '目标捕获制动':
    case '目标捕获加速':
      return generateCaptureSubSteps(attitudeMode, phase, aTargetAU, goingOutward);
    case '绕飞圆化':
      return generateCircularizeSubSteps(shipPosition, shipVelocity, attitudeMode, phase, aTargetAU);
    default:
      return [];
  }
}

export function getSubStepTargetOrbit(
  subStep: NavSubStep,
  aTransferAU: number,
  aTargetAU: number,
  destEcc: number,
): { semiMajorAxis: number; eccentricity: number } | null {
  switch (subStep.type) {
    case 'burn_prograde':
      return { semiMajorAxis: aTransferAU, eccentricity: 0.3 };
    case 'burn_retrograde':
      return { semiMajorAxis: aTargetAU, eccentricity: destEcc };
    case 'burn_circularize':
      return { semiMajorAxis: aTargetAU, eccentricity: 0 };
    case 'coast_transfer':
      return { semiMajorAxis: aTransferAU, eccentricity: 0.3 };
    default:
      return null;
  }
}
