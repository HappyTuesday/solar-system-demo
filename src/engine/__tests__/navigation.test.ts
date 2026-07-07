import { describe, it, expect } from 'vitest';
import {
  computeBodyState,
  computeDirectRendezvousMetrics,
  computeEccentricity,
  computeOrbitalSemiMajorAxis,
  computeRendezvousDisplayParams,
  computeRendezvousDirection,
  computeTargetRelativeOrbit,
  getOrbitingBodyId,
  isStableTargetOrbit,
  planDirectRendezvousTransfer,
  signedAngleDeg,
  type NavigationPlan,
} from '../navigation';
import { AU_TO_KM, G_AU, MU_SUN_AU, REAL_DATA } from '../constants';
import { julianDate } from '../orbital';

describe('navigation', () => {
  describe('signedAngleDeg', () => {
    it('preserves left/right sign around the ecliptic plane', () => {
      expect(signedAngleDeg([0, 1, 0], [1, 0, 0])).toBeCloseTo(90, 8);
      expect(signedAngleDeg([0, -1, 0], [1, 0, 0])).toBeCloseTo(-90, 8);
      expect(signedAngleDeg([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 8);
    });
  });

  describe('core orbital helpers', () => {
    it('computes circular heliocentric orbit elements', () => {
      const pos: [number, number, number] = [1, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU), 0];

      expect(computeOrbitalSemiMajorAxis(pos, vel, MU_SUN_AU)).toBeCloseTo(1, 8);
      expect(computeEccentricity(pos, vel, MU_SUN_AU)).toBeLessThan(0.001);
    });

    it('detects whether the ship is inside a planet Hill sphere', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const earthState = computeBodyState('earth', julianDate(now));
      expect(earthState).not.toBeNull();
      if (!earthState) return;

      const shipPos: [number, number, number] = [
        earthState.position[0] + 0.001,
        earthState.position[1],
        earthState.position[2],
      ];

      expect(getOrbitingBodyId(shipPos, now)).toBe('earth');
      expect(getOrbitingBodyId([100, 0, 0], now)).toBe('sun');
    });

    it('computes target-relative orbit and stable-orbit classification', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const marsState = computeBodyState('mars', julianDate(now));
      expect(marsState).not.toBeNull();
      if (!marsState) return;

      const orbitRadiusAU = REAL_DATA.mars.radius + 30000 / AU_TO_KM;
      const muMars = G_AU * REAL_DATA.mars.mass;
      const circularSpeed = Math.sqrt(muMars / orbitRadiusAU);
      const shipPos: [number, number, number] = [
        marsState.position[0] + orbitRadiusAU,
        marsState.position[1],
        marsState.position[2],
      ];
      const shipVel: [number, number, number] = [
        marsState.velocity[0],
        marsState.velocity[1] + circularSpeed,
        marsState.velocity[2],
      ];

      const orbit = computeTargetRelativeOrbit(shipPos, shipVel, 'mars', now);

      expect(orbit).not.toBeNull();
      if (!orbit) return;
      expect(orbit.energy).toBeLessThan(0);
      expect(orbit.distance).toBeCloseTo(orbitRadiusAU, 12);
      expect(isStableTargetOrbit(orbit, 'mars')).toBe(true);
    });
  });

  describe('planDirectRendezvousTransfer', () => {
    it('builds a rendezvous-only plan without phase or method fields', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const plan = planDirectRendezvousTransfer([1, 0, 0], [0, 0, 0], 'mars', now);

      expect(plan.destinationId).toBe('mars');
      expect(plan.plannedAt).toBe(now);
      expect(plan.rendezvous).toBeDefined();
      expect('phases' in plan).toBe(false);
      expect('method' in plan).toBe(false);
      expect(plan.rendezvous?.targetTimeToRendezvousSec).toBeGreaterThan(0);
      expect(plan.rendezvous?.shipIdealCruiseSpeedAUPerSec).toBeGreaterThan(0);
      expect(plan.rendezvous?.arrivalMaxRelativeSpeedAUPerSec).toBeCloseTo(0.65 / AU_TO_KM, 12);
    });

    it('allows direct rendezvous cruise targets above the old 120 km/s cap', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const plan = planDirectRendezvousTransfer([-8, 0, 0], [0, 0, 0], 'mars', now);

      expect(plan.rendezvous).toBeDefined();
      expect((plan.rendezvous?.shipIdealCruiseSpeedAUPerSec ?? 0) * AU_TO_KM).toBeGreaterThan(120);
      expect((plan.rendezvous?.shipIdealCruiseSpeedAUPerSec ?? 0) * AU_TO_KM).toBeLessThanOrEqual(300);
    });
  });

  describe('computeDirectRendezvousMetrics', () => {
    it('decomposes rendezvous-relative radial and tangential speed', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const plan = planDirectRendezvousTransfer([1, 0, 0], [0, 0, 0], 'mars', now);
      expect(plan.rendezvous).toBeDefined();
      if (!plan.rendezvous) return;

      const direction = computeDirectRendezvousMetrics(
        [1, 0, 0],
        [0, 0, 0],
        [1, 0, 0],
        plan,
        now,
      ).rendezvousDirection;
      const tangentialRaw: [number, number, number] = [-direction[1], direction[0], 0];
      const tangentialLength = Math.sqrt(vectorDot(tangentialRaw, tangentialRaw));
      const tangential: [number, number, number] = [
        tangentialRaw[0] / tangentialLength,
        tangentialRaw[1] / tangentialLength,
        0,
      ];
      const shipVelocity: [number, number, number] = [
        direction[0] * (3 / AU_TO_KM) + tangential[0] * (4 / AU_TO_KM),
        direction[1] * (3 / AU_TO_KM) + tangential[1] * (4 / AU_TO_KM),
        direction[2] * (3 / AU_TO_KM),
      ];

      const metrics = computeDirectRendezvousMetrics([1, 0, 0], shipVelocity, [-1, 0, 0], plan, now);

      expect(metrics.radialSpeedAUPerSec * AU_TO_KM).toBeCloseTo(3, 6);
      expect(metrics.tangentialSpeedAUPerSec * AU_TO_KM).toBeCloseTo(4, 6);
      expect(metrics.effectiveSpeedAUPerSec * AU_TO_KM).toBeCloseTo(3, 6);
    });
  });

  describe('computeRendezvousDisplayParams', () => {
    it('returns live rendezvous-only display parameters with clockwise angles negative', () => {
      const now = Date.UTC(2027, 4, 13, 6);
      const plan: NavigationPlan = {
        destinationId: 'mars',
        plannedAt: now,
        rendezvous: {
          point: [2, 0, 0],
          plannedFrom: [1, 0, 0],
          targetTimeToRendezvousSec: 120,
          shipIdealCruiseSpeedAUPerSec: 3 / AU_TO_KM,
          arrivalMaxRelativeSpeedAUPerSec: 0.65 / AU_TO_KM,
          rendezvousTime: now + 120_000,
          validUntil: now + 60_000,
        },
      };
      const targetState = computeBodyState('mars', julianDate(now));
      expect(targetState).not.toBeNull();
      if (!targetState) return;

      const params = computeRendezvousDisplayParams(
        [1, 0, 0],
        [3 / AU_TO_KM, 4 / AU_TO_KM, 0],
        [0, -1, 0],
        plan,
        now,
        'earth',
      );

      expect(params.targetTimeToRendezvousSec).toBe(120);
      expect(params.shipTimeToRendezvousSec).toBeCloseTo(AU_TO_KM / 3, 6);
      expect(params.radialSpeedAUPerSec * AU_TO_KM).toBeCloseTo(3, 6);
      expect(params.tangentialSpeedAUPerSec * AU_TO_KM).toBeCloseTo(4, 6);
      expect(params.noseAngleDeg).toBeCloseTo(-90, 6);
      expect(params.velocityAngleDeg).toBeGreaterThan(0);

      const targetSpeed = Math.sqrt(vectorDot(targetState.velocity, targetState.velocity));
      expect(params.captureHelioSpeedMinAUPerSec).toBeCloseTo(Math.max(0, targetSpeed - 0.65 / AU_TO_KM), 12);
      expect(params.captureHelioSpeedMaxAUPerSec).toBeCloseTo(targetSpeed + 0.65 / AU_TO_KM, 12);
      expect(params.escapeSpeedAUPerSec).not.toBeNull();
      expect(params.distanceToTargetAU).toBeGreaterThan(0);
      expect(params.distanceToRendezvousAU).toBeCloseTo(1, 12);

      const clockwiseVelocity = computeRendezvousDisplayParams(
        [1, 0, 0],
        [3 / AU_TO_KM, -4 / AU_TO_KM, 0],
        [1, 0, 0],
        plan,
        now,
        null,
      );
      expect(clockwiseVelocity.velocityAngleDeg).toBeLessThan(0);

      const unreachable = computeRendezvousDisplayParams(
        [1, 0, 0],
        [-1 / AU_TO_KM, 0, 0],
        [1, 0, 0],
        plan,
        now + 240_000,
        null,
      );
      expect(unreachable.targetTimeToRendezvousSec).toBe(0);
      expect(unreachable.shipTimeToRendezvousSec).toBe(Infinity);
      expect(unreachable.escapeSpeedAUPerSec).toBeNull();
    });
  });

  describe('computeRendezvousDirection', () => {
    it('returns a unit direction from the ship to the active rendezvous point', () => {
      const plan: NavigationPlan = {
        destinationId: 'mars',
        plannedAt: 0,
        rendezvous: {
          point: [4, 5, 0],
          plannedFrom: [1, 1, 0],
          targetTimeToRendezvousSec: 1,
          shipIdealCruiseSpeedAUPerSec: 1,
          arrivalMaxRelativeSpeedAUPerSec: 1,
          rendezvousTime: 1,
          validUntil: 1,
        },
      };

      const direction = computeRendezvousDirection([1, 1, 0], plan);

      expect(direction).toEqual([0.6, 0.8, 0]);
      expect(computeRendezvousDirection([4, 5, 0], plan)).toBeNull();
      expect(computeRendezvousDirection([1, 1, 0], { destinationId: 'mars', plannedAt: 0 })).toBeNull();
    });
  });
});

function vectorDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
