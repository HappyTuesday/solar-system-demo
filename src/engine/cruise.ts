import { AU_TO_KM, SPACECRAFT_CONFIG } from './constants';
import { parkBrakeThrustMagnitude, hasEffectiveThrust } from './spaceship';
import type { NavigationPlan } from './navigation';

export const CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC = 0.1 / AU_TO_KM;

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

export function computeParkStopDistanceAU(speedAUPerSec: number): number {
  if (speedAUPerSec <= 1e-20) return 0;
  const magnitude = parkBrakeThrustMagnitude(speedAUPerSec);
  const a = SPACECRAFT_CONFIG.maxThrustAU * (magnitude / 100);
  if (a <= 0) return 0;
  return (speedAUPerSec * speedAUPerSec) / (2 * a);
}

export interface CruiseGuidance {
  rendezvousDirection: [number, number, number];
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  distanceToRendezvousAU: number;
  stopDistanceAU: number;
  projectedAdvanceAU: number;
  shouldBrake: boolean;
  shouldCorrectTangential: boolean;
  radialPositive: boolean;
}

export function computeCruiseGuidance(
  position: [number, number, number],
  velocity: [number, number, number],
  plan: NavigationPlan,
): CruiseGuidance {
  const point = plan.rendezvous?.point ?? position;
  const toRendezvous: [number, number, number] = [
    point[0] - position[0],
    point[1] - position[1],
    point[2] - position[2],
  ];
  const distanceToRendezvousAU = vectorLength(toRendezvous);
  const rendezvousDirection = vectorNormalize(toRendezvous);
  const speed = vectorLength(velocity);
  const radialSpeedAUPerSec = vectorDot(velocity, rendezvousDirection);
  const tangentialReference = vectorNormalize([-rendezvousDirection[1], rendezvousDirection[0], 0]);
  const tangentialSpeedAUPerSec = vectorDot(velocity, tangentialReference);

  const stopDistanceAU = computeParkStopDistanceAU(speed);
  const projectedAdvanceAU = speed > 1e-20
    ? stopDistanceAU * (radialSpeedAUPerSec / speed)
    : 0;

  const radialPositive = radialSpeedAUPerSec > 0;
  const shouldBrake = radialPositive
    && distanceToRendezvousAU > 1e-20
    && projectedAdvanceAU >= distanceToRendezvousAU;
  const shouldCorrectTangential =
    Math.abs(tangentialSpeedAUPerSec) > CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC;

  return {
    rendezvousDirection,
    radialSpeedAUPerSec,
    tangentialSpeedAUPerSec,
    distanceToRendezvousAU,
    stopDistanceAU,
    projectedAdvanceAU,
    shouldBrake,
    shouldCorrectTangential,
    radialPositive,
  };
}

export function canEnableCruise(
  position: [number, number, number],
  velocity: [number, number, number],
  thrust: [number, number, number],
  thrustMagnitude: number,
  plan: NavigationPlan | null,
): boolean {
  if (!plan?.rendezvous) return false;
  if (hasEffectiveThrust(thrust, thrustMagnitude)) return false;
  return computeCruiseGuidance(position, velocity, plan).radialPositive;
}
