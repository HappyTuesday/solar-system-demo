import { describe, it, expect } from 'vitest';
import {
  CRUISE_TANGENTIAL_RATIO_TRIGGER,
  CRUISE_TIME_JUMP_STEPS_SECONDS,
  computeParkStopDistanceAU,
  computeCruiseGuidance,
  computeCruiseJumpSeconds,
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

  it('flags shouldCorrectTangential when the tangential-to-radial ratio exceeds the trigger', () => {
    const radial = 1e-6;
    const gAbove = computeCruiseGuidance(
      [0, 0, 0],
      [radial, radial * CRUISE_TANGENTIAL_RATIO_TRIGGER * 2, 0],
      planTo([1, 0, 0]),
    );
    const gBelow = computeCruiseGuidance(
      [0, 0, 0],
      [radial, radial * CRUISE_TANGENTIAL_RATIO_TRIGGER * 0.5, 0],
      planTo([1, 0, 0]),
    );
    expect(gAbove.shouldCorrectTangential).toBe(true);
    expect(gBelow.shouldCorrectTangential).toBe(false);
  });

  it('flags tangential correction exactly at the 0.01 ratio threshold', () => {
    const radial = 1e-6;
    const g = computeCruiseGuidance(
      [0, 0, 0],
      [radial, radial * CRUISE_TANGENTIAL_RATIO_TRIGGER, 0],
      planTo([1, 0, 0]),
    );

    expect(g.shouldCorrectTangential).toBe(true);
  });

  it('marks radial as non-positive when moving away', () => {
    const g = computeCruiseGuidance([0, 0, 0], [-1e-6, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(false);
  });
});

describe('computeCruiseJumpSeconds', () => {
  function guidance(overrides: Partial<ReturnType<typeof computeCruiseGuidance>> = {}) {
    return {
      rendezvousDirection: [1, 0, 0] as [number, number, number],
      radialSpeedAUPerSec: 1,
      tangentialSpeedAUPerSec: 0,
      distanceToRendezvousAU: 1_000_000,
      stopDistanceAU: 2,
      projectedAdvanceAU: 2,
      shouldBrake: false,
      shouldCorrectTangential: false,
      radialPositive: true,
      ...overrides,
    };
  }

  it('jumps 7 days while the braking window is farther away', () => {
    const result = computeCruiseJumpSeconds(guidance());

    expect(result).toBe(CRUISE_TIME_JUMP_STEPS_SECONDS[0]);
  });

  it('selects a 24-hour jump when 48 hours remain before the braking window', () => {
    const result = computeCruiseJumpSeconds(guidance({ distanceToRendezvousAU: 172_802 }));

    expect(result).toBe(CRUISE_TIME_JUMP_STEPS_SECONDS[1]);
  });

  it('selects a 12-hour jump when 20 hours remain before the braking window', () => {
    const result = computeCruiseJumpSeconds(guidance({ distanceToRendezvousAU: 72_002 }));

    expect(result).toBe(CRUISE_TIME_JUMP_STEPS_SECONDS[2]);
  });

  it('selects a 6-hour jump when 8 hours remain before the braking window', () => {
    const result = computeCruiseJumpSeconds(guidance({ distanceToRendezvousAU: 28_802 }));

    expect(result).toBe(CRUISE_TIME_JUMP_STEPS_SECONDS[3]);
  });

  it('does not jump when less than one minute remains before the braking window', () => {
    const result = computeCruiseJumpSeconds(guidance({ distanceToRendezvousAU: 61.9 }));

    expect(result).toBe(0);
  });

  it('does not jump once the braking condition is already met', () => {
    const result = computeCruiseJumpSeconds(guidance({ shouldBrake: true }));

    expect(result).toBe(0);
  });

  it('does not jump when radial motion is non-positive', () => {
    const result = computeCruiseJumpSeconds(guidance({ radialSpeedAUPerSec: 0, radialPositive: false }));

    expect(result).toBe(0);
  });
});

describe('canEnableCruise', () => {
  const plan = planTo([1, 0, 0]);

  it('true when rendezvous exists and radial velocity is positive', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], plan)).toBe(true);
  });

  it('false without a rendezvous plan', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], null)).toBe(false);
  });

  it('false when radial speed is not positive', () => {
    expect(canEnableCruise([0, 0, 0], [-1e-6, 0, 0], plan)).toBe(false);
  });
});
