import type { PhaseGuidance } from '../engine/navigation';
import { computeGuidanceSafetyTimeScale } from '../engine/navigation';
import type { NavigationDirective } from '../engine/marsMissionNavigator';
import type { AttitudeMode } from '../types';
import type { Gear } from './spaceshipStore';

type Direction3 = [number, number, number];
type GuidanceLike = PhaseGuidance | NavigationDirective;

export interface GuidanceDirectionActions {
  setDirection: (direction: Direction3) => void;
  setAttitudeMode: (mode: AttitudeMode) => void;
}

export interface GuidanceThrottleActions {
  setThrustMagnitude: (thrustMagnitude: number) => void;
  setGear: (gear: Gear) => void;
}

export interface GuidanceTimeScaleActions {
  setTimeScale: (timeScale: number) => void;
}

function vectorLength(v: Direction3): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function normalizeDirection(v: Direction3): Direction3 {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function attitudeModeFromGuidance(guidance: GuidanceLike): AttitudeMode {
  const label = 'desiredDirectionLabel' in guidance ? guidance.desiredDirectionLabel : undefined;
  if (label?.includes('日心切向顺行')) return 'heliocentric-tangential-prograde';
  if (label?.includes('日心顺行')) return 'heliocentric-prograde';
  if (label?.includes('日心逆行')) return 'heliocentric-retrograde';
  if (label?.includes('当前绕飞顺行')) return 'prograde';
  return 'inertial';
}

export function applyGuidanceDirection(
  guidance: GuidanceLike | null,
  actions: GuidanceDirectionActions,
): boolean {
  if (!guidance?.desiredDirection) return false;

  actions.setDirection(normalizeDirection(guidance.desiredDirection));
  actions.setAttitudeMode(attitudeModeFromGuidance(guidance));
  return true;
}

export function applyGuidanceThrottle(
  guidance: GuidanceLike | null,
  actions: GuidanceThrottleActions,
): boolean {
  if (!guidance || (guidance.recommendedGear == null && guidance.recommendedThrustMagnitude == null)) {
    return false;
  }

  const nextThrust = guidance.recommendedThrustMagnitude ?? 0;
  const nextGear = guidance.recommendedGear ?? (nextThrust > 0 ? 'D' : 'N');

  if (nextGear === 'N' || nextThrust <= 0) {
    actions.setThrustMagnitude(0);
    actions.setGear('N');
    return true;
  }

  actions.setThrustMagnitude(nextThrust);
  actions.setGear(nextGear);
  return true;
}

export function applyGuidanceTimeScale(
  guidance: GuidanceLike | null,
  actions: GuidanceTimeScaleActions,
): boolean {
  if (guidance?.suggestedTimeScale == null) return false;

  actions.setTimeScale(guidance.suggestedTimeScale);
  return true;
}

export function computeGuidanceAutoTimeScale(
  guidance: GuidanceLike | null,
  currentTimeScale: number,
): number | null {
  if (!guidance) return null;
  if ('action' in guidance) {
    const shouldReduce = guidance.action === 'turn'
      || guidance.action === 'ignite'
      || guidance.action === 'capture'
      || guidance.action === 'circularize'
      || guidance.action === 'cutoff'
      || guidance.action === 'arrived';
    if (!shouldReduce) return null;

    const safeScale = Math.max(1, guidance.suggestedTimeScale);
    return currentTimeScale > safeScale ? safeScale : null;
  }

  return computeGuidanceSafetyTimeScale(guidance, currentTimeScale);
}
