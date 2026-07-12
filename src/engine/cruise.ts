import { SPACECRAFT_CONFIG } from './constants';
import { parkBrakeThrustMagnitude } from './spaceship';
import type { NavigationPlan, ResolvedNavigationTarget } from './navigation';

export const CRUISE_TANGENTIAL_RATIO_TRIGGER = 0.01;
export const CRUISE_TIME_JUMP_STEPS_SECONDS = [604800, 86400, 43200, 21600, 10800, 3600, 1800, 600, 60] as const;

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

export function computeCruiseJumpSeconds(guidance: CruiseGuidance): number {
  if (!guidance.radialPositive || guidance.shouldBrake) return 0;
  const coastDistanceAU = Math.max(0, guidance.distanceToRendezvousAU - guidance.projectedAdvanceAU);
  if (guidance.radialSpeedAUPerSec <= 1e-20 || coastDistanceAU <= 1e-20) return 0;
  const coastSeconds = coastDistanceAU / guidance.radialSpeedAUPerSec;
  return CRUISE_TIME_JUMP_STEPS_SECONDS.find(step => step <= coastSeconds) ?? 0;
}

export function computeCruiseGuidance(
  position: [number, number, number],
  velocity: [number, number, number],
  target: NavigationPlan | ResolvedNavigationTarget,
): CruiseGuidance {
  const resolved = 'position' in target
    ? target
    : { position: target.rendezvous?.point ?? position, velocity: [0, 0, 0] as [number, number, number] };
  const point = resolved.position;
  const toRendezvous: [number, number, number] = [
    point[0] - position[0],
    point[1] - position[1],
    point[2] - position[2],
  ];
  const distanceToRendezvousAU = vectorLength(toRendezvous);
  const rendezvousDirection = vectorNormalize(toRendezvous);
  const relativeVelocity: [number, number, number] = [velocity[0] - resolved.velocity[0], velocity[1] - resolved.velocity[1], velocity[2] - resolved.velocity[2]];
  const speed = vectorLength(relativeVelocity);
  const radialSpeedAUPerSec = vectorDot(relativeVelocity, rendezvousDirection);
  const tangentialReference = vectorNormalize([-rendezvousDirection[1], rendezvousDirection[0], 0]);
  const tangentialSpeedAUPerSec = vectorDot(relativeVelocity, tangentialReference);

  const stopDistanceAU = computeParkStopDistanceAU(speed);
  const projectedAdvanceAU = speed > 1e-20
    ? stopDistanceAU * (radialSpeedAUPerSec / speed)
    : 0;

  const radialPositive = radialSpeedAUPerSec > 0;
  const shouldBrake = radialPositive
    && distanceToRendezvousAU > 1e-20
    && projectedAdvanceAU >= distanceToRendezvousAU;
  const shouldCorrectTangential =
    radialPositive
    && Math.abs(tangentialSpeedAUPerSec) / radialSpeedAUPerSec >= CRUISE_TANGENTIAL_RATIO_TRIGGER;

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
  target: NavigationPlan | ResolvedNavigationTarget | null,
): boolean {
  if (!target) return false;
  return computeCruiseGuidance(position, velocity, target).radialPositive;
}
