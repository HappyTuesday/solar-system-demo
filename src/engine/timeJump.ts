import type { SpaceshipState } from '../types';
import { REAL_DATA, MU_SUN_AU, G_AU } from './constants';
import { stateVectors, julianDate, solveKepler, trueAnomaly, orbitalPeriod, meanAnomalyAtTime } from './orbital';
import { rk4StepSpaceshipWithMovingBodies, type BodyInfo } from './spaceship';

export interface BodyState {
  position: [number, number, number];
  velocity: [number, number, number];
}

export interface OrbitalElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPeriapsis: number;
  trueAnomaly: number;
  meanAnomaly: number;
  period: number;
}

const TWO_PI = 2 * Math.PI;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function cartesianToKepler(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): OrbitalElements {
  const rVal = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  if (rVal < 1e-20) {
    return {
      semiMajorAxis: 0, eccentricity: 0, inclination: 0,
      raan: 0, argPeriapsis: 0, trueAnomaly: 0,
      meanAnomaly: 0, period: 1,
    };
  }

  const v2 = vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2;

  const a = 1 / (2 / rVal - v2 / mu);
  const semiMajorAxis = Math.abs(a);

  const hx = pos[1] * vel[2] - pos[2] * vel[1];
  const hy = pos[2] * vel[0] - pos[0] * vel[2];
  const hz = pos[0] * vel[1] - pos[1] * vel[0];
  const h = Math.sqrt(hx * hx + hy * hy + hz * hz);

  const eVecX = (vel[1] * hz - vel[2] * hy) / mu - pos[0] / rVal;
  const eVecY = (vel[2] * hx - vel[0] * hz) / mu - pos[1] / rVal;
  const eVecZ = (vel[0] * hy - vel[1] * hx) / mu - pos[2] / rVal;
  const eccentricity = Math.sqrt(eVecX * eVecX + eVecY * eVecY + eVecZ * eVecZ);

  let inclination: number;
  if (h < 1e-20) {
    inclination = 0;
  } else {
    inclination = Math.acos(clamp(hz / h, -1, 1));
  }

  // Node line vector: n = k̂ × h = [-hy, hx, 0]
  const nMagsq = hx * hx + hy * hy;
  const nMag = Math.sqrt(nMagsq);

  let raan = 0;
  if (nMag > 1e-15) {
    raan = Math.atan2(hx, -hy);
    if (raan < 0) raan += TWO_PI;
  }

  let argPeriapsis = 0;
  if (eccentricity > 1e-10) {
    if (nMag > 1e-15) {
      const cosArg = clamp(((-hy) * eVecX + hx * eVecY) / (nMag * eccentricity), -1, 1);
      argPeriapsis = Math.acos(cosArg);
      if (eVecZ < 0) argPeriapsis = TWO_PI - argPeriapsis;
    } else {
      argPeriapsis = Math.atan2(eVecY, eVecX);
      if (argPeriapsis < 0) argPeriapsis += TWO_PI;
    }
  }

  let trueAnomalyVal: number;
  if (eccentricity > 1e-10) {
    const cosNu = clamp((eVecX * pos[0] + eVecY * pos[1] + eVecZ * pos[2]) / (eccentricity * rVal), -1, 1);
    trueAnomalyVal = Math.acos(cosNu);
    const rvDot = pos[0] * vel[0] + pos[1] * vel[1] + pos[2] * vel[2];
    if (rvDot < 0) trueAnomalyVal = TWO_PI - trueAnomalyVal;
  } else {
    if (nMag > 1e-15) {
      const cosTheta = clamp((pos[0] * (-hy) + pos[1] * hx) / (nMag * rVal), -1, 1);
      trueAnomalyVal = Math.acos(cosTheta);
      if (pos[2] < 0) trueAnomalyVal = TWO_PI - trueAnomalyVal;
    } else {
      trueAnomalyVal = Math.atan2(pos[1], pos[0]);
      if (trueAnomalyVal < 0) trueAnomalyVal += TWO_PI;
    }
  }

  // Mean anomaly from eccentric anomaly
  let meanAnomaly: number;
  const k = 1 - eccentricity * eccentricity;
  if (k < 1e-20) {
    meanAnomaly = 0;
  } else {
    const sqrtK = Math.sqrt(k);
    const cosE = (eccentricity + Math.cos(trueAnomalyVal)) / (1 + eccentricity * Math.cos(trueAnomalyVal));
    const sinE = sqrtK * Math.sin(trueAnomalyVal) / (1 + eccentricity * Math.cos(trueAnomalyVal));
    const E = Math.atan2(sinE, cosE);
    meanAnomaly = E - eccentricity * Math.sin(E);
    if (meanAnomaly < 0) meanAnomaly += TWO_PI;
  }

  const period = semiMajorAxis > 0 ? orbitalPeriod(semiMajorAxis, mu) : 0;

  return {
    semiMajorAxis,
    eccentricity,
    inclination,
    raan,
    argPeriapsis,
    trueAnomaly: trueAnomalyVal,
    meanAnomaly,
    period,
  };
}

export function computeAllBodyStates(jd: number): Record<string, BodyState> {
  const result: Record<string, BodyState> = {};
  result['sun'] = { position: [0, 0, 0], velocity: [0, 0, 0] };

  for (const id of Object.keys(REAL_DATA)) {
    if (id === 'sun') continue;
    const data = REAL_DATA[id];
    if (!data || !data.semiMajorAxis || !data.orbital) continue;
    const o = data.orbital;
    const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_AU);
    const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
    const Mmod = ((M % TWO_PI) + TWO_PI) % TWO_PI;
    const E = solveKepler(Mmod, o.eccentricity);
    const nu = trueAnomaly(E, o.eccentricity);
    const sv = stateVectors(
      data.semiMajorAxis, o.eccentricity, o.inclination,
      o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_AU,
    );
    result[id] = {
      position: [sv.position[0], sv.position[1], sv.position[2]],
      velocity: [sv.velocity[0], sv.velocity[1], sv.velocity[2]],
    };
  }
  return result;
}

function computeBodyStateAtJd(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital || templateId === 'sun') return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_AU);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  return stateVectors(
    data.semiMajorAxis, o.eccentricity, o.inclination,
    o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_AU,
  );
}

export function jumpSpaceshipState(
  shipState: SpaceshipState,
  orbitingBodyId: string,
  currentTime: number,
  targetTime: number,
): SpaceshipState {
  const currentJd = julianDate(currentTime);
  const targetJd = julianDate(targetTime);

  // Compute orbiting body state at current and target times
  let bodyAtCurrent: { position: [number, number, number]; velocity: [number, number, number] };
  let bodyAtTarget: { position: [number, number, number]; velocity: [number, number, number] };

  if (orbitingBodyId === 'sun') {
    bodyAtCurrent = { position: [0, 0, 0], velocity: [0, 0, 0] };
    bodyAtTarget = { position: [0, 0, 0], velocity: [0, 0, 0] };
  } else {
    const bc = computeBodyStateAtJd(orbitingBodyId, currentJd);
    const bt = computeBodyStateAtJd(orbitingBodyId, targetJd);
    if (!bc || !bt) {
      return {
        ...shipState,
        position: [...shipState.position],
        velocity: [...shipState.velocity],
        direction: [...shipState.direction],
      };
    }
    bodyAtCurrent = bc;
    bodyAtTarget = bt;
  }

  // Ship state relative to orbiting body at current time
  const relPos: [number, number, number] = [
    shipState.position[0] - bodyAtCurrent.position[0],
    shipState.position[1] - bodyAtCurrent.position[1],
    shipState.position[2] - bodyAtCurrent.position[2],
  ];
  const relVel: [number, number, number] = [
    shipState.velocity[0] - bodyAtCurrent.velocity[0],
    shipState.velocity[1] - bodyAtCurrent.velocity[1],
    shipState.velocity[2] - bodyAtCurrent.velocity[2],
  ];

  // Gravitational parameter of orbiting body
  let muOrbit: number;
  if (orbitingBodyId === 'sun') {
    muOrbit = MU_SUN_AU;
  } else {
    const bodyData = REAL_DATA[orbitingBodyId];
    muOrbit = bodyData ? G_AU * bodyData.mass : G_AU * REAL_DATA.earth.mass;
  }

  const elements = cartesianToKepler(relPos, relVel, muOrbit);
  const period = elements.period;

  // Advance mean anomaly by time difference
  const dtSec = (targetTime - currentTime) / 1000; // ms to seconds
  let M0 = elements.meanAnomaly;
  if (period > 0) {
    M0 = elements.meanAnomaly + (TWO_PI / period) * dtSec;
  }
  M0 = ((M0 % TWO_PI) + TWO_PI) % TWO_PI;

  // Solve Kepler's equation to get eccentric anomaly
  const E = solveKepler(M0, elements.eccentricity);
  const nuTarget = trueAnomaly(E, elements.eccentricity);

  // Reconstruct relative state from orbital elements
  const newRel = stateVectors(
    elements.semiMajorAxis,
    elements.eccentricity,
    elements.inclination,
    elements.raan,
    elements.argPeriapsis,
    nuTarget,
    muOrbit,
  );

  // New absolute position and velocity (add orbiting body's state at target time)
  const newPosition: [number, number, number] = [
    newRel.position[0] + bodyAtTarget.position[0],
    newRel.position[1] + bodyAtTarget.position[1],
    newRel.position[2] + bodyAtTarget.position[2],
  ];
  const newVelocity: [number, number, number] = [
    newRel.velocity[0] + bodyAtTarget.velocity[0],
    newRel.velocity[1] + bodyAtTarget.velocity[1],
    newRel.velocity[2] + bodyAtTarget.velocity[2],
  ];

  // Update direction vector to match new velocity
  const vMag = Math.sqrt(newVelocity[0] ** 2 + newVelocity[1] ** 2 + newVelocity[2] ** 2);
  const newDirection: [number, number, number] = vMag > 0
    ? [newVelocity[0] / vMag, newVelocity[1] / vMag, newVelocity[2] / vMag]
    : [...shipState.direction];

  return {
    position: newPosition,
    velocity: newVelocity,
    direction: newDirection,
    thrust: shipState.thrust ? [shipState.thrust[0], shipState.thrust[1], shipState.thrust[2]] : [0, 0, 0],
    thrustMagnitude: shipState.thrustMagnitude ?? 0,
    exploded: shipState.exploded ?? false,
  };
}

export function simulateToTime(
  shipState: SpaceshipState,
  getBodies: (timeOffset: number) => BodyInfo[],
  currentTime: number,
  targetTime: number,
  maxSubsteps: number,
): void {
  const totalSimDelta = (targetTime - currentTime) / 1000;
  if (totalSimDelta <= 0) return;

  // Divide into substeps bounded by maxSubsteps
  const stepsPerFrame = Math.min(maxSubsteps, Math.max(1, Math.ceil(totalSimDelta / 0.05)));
  const dt = totalSimDelta / stepsPerFrame;

  let cumulativeTime = 0;
  for (let i = 0; i < stepsPerFrame; i++) {
    const wrappedGetBodies = (tOffset: number) => getBodies(cumulativeTime + tOffset);
    rk4StepSpaceshipWithMovingBodies(shipState, wrappedGetBodies, Math.min(dt, totalSimDelta - cumulativeTime));
    cumulativeTime += Math.min(dt, totalSimDelta - cumulativeTime);
    if (cumulativeTime >= totalSimDelta) break;
  }
}
