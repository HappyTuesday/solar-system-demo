import { REAL_DATA, MU_SUN, AU_TO_M, NAVIGATION_CONFIG, MU_SUN_AU } from './constants';
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

const BODY_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

// Hill sphere radius for each body (AU)
function getHillRadiusAU(bodyId: string): number {
  if (bodyId === 'sun') return Infinity;
  const data = REAL_DATA[bodyId];
  if (!data?.semiMajorAxis) return 0;
  const a = data.semiMajorAxis / AU_TO_M; // AU
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

    const bx = state.position[0] * SCALE;
    const by = state.position[1] * SCALE;
    const bz = state.position[2] * SCALE;
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
  return (data?.semiMajorAxis ?? 1.496e11) / AU_TO_M;
}

export function getNearestBodySemiMajorAxis(
  shipPosition: [number, number, number],
  simulatedTime: number,
): number {
  const bodyId = findNearestBodyId(shipPosition, simulatedTime);
  if (bodyId === 'sun') return 0;
  const data = REAL_DATA[bodyId];
  return (data?.semiMajorAxis ?? 1.496e11) / AU_TO_M;
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
      bx = state.position[0] * SCALE;
      by = state.position[1] * SCALE;
      bz = state.position[2] * SCALE;
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
  const aTargetMeters = destData.semiMajorAxis;
  const aTargetAU = aTargetMeters / AU_TO_M;
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
      name: goingOutward ? '目标捕获制动' : '目标捕获加速',
      thrustDirection: goingOutward ? 'backward' : 'forward',
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

  const aCurrentAU = getNearestBodySemiMajorAxis(shipPosition);
    const destData = REAL_DATA[plan.destinationId];
    if (!destData || !destData.semiMajorAxis) return false;
    const aTargetAU = destData.semiMajorAxis / AU_TO_M;
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
    const dx = destState.position[0] * SCALE - shipPosition[0];
    const dy = destState.position[1] * SCALE - shipPosition[1];
    const dz = destState.position[2] * SCALE - shipPosition[2];
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
  const aTargetAU = destData.semiMajorAxis / AU_TO_M;
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
        bodyState.position[0] * SCALE,
        bodyState.position[1] * SCALE,
        bodyState.position[2] * SCALE,
      ];
      const bodyVelAU: [number, number, number] = [
        bodyState.velocity[0] * SCALE,
        bodyState.velocity[1] * SCALE,
        bodyState.velocity[2] * SCALE,
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
