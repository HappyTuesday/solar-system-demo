import { describe, it, expect } from 'vitest';
import {
  CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC,
  computeParkStopDistanceAU,
  computeCruiseGuidance,
  canEnableCruise,
} from '../cruise';
import type { NavigationPlan } from '../navigation';
import { AU_TO_KM, SPACECRAFT_CONFIG } from '../constants';

function planTo(point: [number, number, number]): NavigationPlan {
  return {
    destinationId: 'mars',
    plannedAt: 0,
    rendezvous: {
      point,
      plannedFrom: [0, 0, 0],
      targetTimeToRendezvousSec: 86400,
      shipIdealCruiseSpeedAUPerSec: 100 / AU_TO_KM,
      arrivalMaxRelativeSpeedAUPerSec: 0.65 / AU_TO_KM,
      rendezvousTime: 86400 * 1000,
      validUntil: 86400 * 1000,
    },
  };
}

describe('computeParkStopDistanceAU', () => {
  it('returns 0 for near-zero speed', () => {
    expect(computeParkStopDistanceAU(0)).toBe(0);
  });

  it('uses uniform-deceleration s = v^2/(2a) at capped high speed', () => {
    const speed = 4e-4; // AU/s, well above 30 km/s -> thrust capped at 100 MN
    const a = SPACECRAFT_CONFIG.maxThrustAU; // magnitude/100 = 1
    const expected = (speed * speed) / (2 * a);
    expect(computeParkStopDistanceAU(speed)).toBeCloseTo(expected, 6);
  });

  it('is smaller at low speed than at high speed', () => {
    expect(computeParkStopDistanceAU(1e-7)).toBeLessThan(computeParkStopDistanceAU(4e-4));
    expect(computeParkStopDistanceAU(1e-7)).toBeGreaterThan(0);
  });
});

describe('computeCruiseGuidance', () => {
  it('flags shouldBrake when projected stop reaches the rendezvous point', () => {
    const g = computeCruiseGuidance([0, 0, 0], [4e-4, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(true);
    expect(g.distanceToRendezvousAU).toBeCloseTo(1, 6);
    expect(g.shouldBrake).toBe(true);
  });

  it('does not brake when far and slow', () => {
    const g = computeCruiseGuidance([0, 0, 0], [1e-6, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(true);
    expect(g.shouldBrake).toBe(false);
    expect(g.shouldCorrectTangential).toBe(false);
  });

  it('flags shouldCorrectTangential above the trigger threshold', () => {
    const above = CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC * 2;
    const below = CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC * 0.5;
    const gAbove = computeCruiseGuidance([0, 0, 0], [1e-6, above, 0], planTo([1, 0, 0]));
    const gBelow = computeCruiseGuidance([0, 0, 0], [1e-6, below, 0], planTo([1, 0, 0]));
    expect(gAbove.shouldCorrectTangential).toBe(true);
    expect(gBelow.shouldCorrectTangential).toBe(false);
  });

  it('marks radial as non-positive when moving away', () => {
    const g = computeCruiseGuidance([0, 0, 0], [-1e-6, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(false);
  });
});

describe('canEnableCruise', () => {
  const plan = planTo([1, 0, 0]);

  it('true when rendezvous exists, no thrust, radial positive', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [0, 0, 0], 0, plan)).toBe(true);
  });

  it('false without a rendezvous plan', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [0, 0, 0], 0, null)).toBe(false);
  });

  it('false when there is effective thrust', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [1, 0, 0], 50, plan)).toBe(false);
  });

  it('false when radial speed is not positive', () => {
    expect(canEnableCruise([0, 0, 0], [-1e-6, 0, 0], [0, 0, 0], 0, plan)).toBe(false);
  });
});
