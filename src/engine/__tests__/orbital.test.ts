import { describe, it, expect } from 'vitest';
import {
  stateVectors,
  orbitalPeriod,
  solveKepler,
  trueAnomaly,
  julianDate,
  meanAnomalyAtTime,
} from '../orbital';
import { MU_SUN_AU } from '../constants';

describe('orbital', () => {
  describe('solveKepler', () => {
    it('should converge for M=0, e=0', () => {
      expect(solveKepler(0, 0)).toBeCloseTo(0, 12);
    });

    it('should converge for M=π/2, e=0.1', () => {
      const E = solveKepler(Math.PI / 2, 0.1);
      // Verify: M = E - e*sin(E)
      const Mcheck = E - 0.1 * Math.sin(E);
      expect(Mcheck).toBeCloseTo(Math.PI / 2, 10);
    });

    it('should converge for M=π, e=0.5', () => {
      const E = solveKepler(Math.PI, 0.5);
      const Mcheck = E - 0.5 * Math.sin(E);
      expect(Mcheck).toBeCloseTo(Math.PI, 10);
    });

    it('should handle high eccentricity e=0.9', () => {
      const E = solveKepler(1.0, 0.9);
      const Mcheck = E - 0.9 * Math.sin(E);
      expect(Mcheck).toBeCloseTo(1.0, 8);
    });
  });

  describe('trueAnomaly', () => {
    it('should give ν=0 for E=0, e=0', () => {
      expect(trueAnomaly(0, 0)).toBeCloseTo(0, 12);
    });

    it('should give ν=π for E=π, e=0', () => {
      expect(trueAnomaly(Math.PI, 0)).toBeCloseTo(Math.PI, 12);
    });
  });

  describe('stateVectors', () => {
    it('should give Earth-like position at 1 AU for e=0 orbit', () => {
      const sv = stateVectors(1, 0, 0, 0, 0, 0, MU_SUN_AU);
      const r = Math.sqrt(sv.position[0] ** 2 + sv.position[1] ** 2 + sv.position[2] ** 2);
      expect(r).toBeCloseTo(1, 10);
    });

    it('should give Earth-like velocity for circular orbit at 1 AU', () => {
      const sv = stateVectors(1, 0, 0, 0, 0, 0, MU_SUN_AU);
      const v = Math.sqrt(sv.velocity[0] ** 2 + sv.velocity[1] ** 2 + sv.velocity[2] ** 2);
      const expected = Math.sqrt(MU_SUN_AU / 1); // circular velocity
      expect(v).toBeCloseTo(expected, 10);
    });

    it('should return 3D positions for inclined orbits', () => {
      const sv = stateVectors(1, 0.1, Math.PI / 4, Math.PI / 3, 0, Math.PI / 2, MU_SUN_AU);
      expect(sv.position[2]).not.toBeCloseTo(0, 10);
    });

    it('should return consistent position and velocity vectors', () => {
      const sv = stateVectors(0.5, 0.3, 0.1, 0.2, 0.3, 1.0, MU_SUN_AU);
      const r = Math.sqrt(sv.position[0] ** 2 + sv.position[1] ** 2 + sv.position[2] ** 2);
      const v = Math.sqrt(sv.velocity[0] ** 2 + sv.velocity[1] ** 2 + sv.velocity[2] ** 2);
      expect(r).toBeGreaterThan(0);
      expect(v).toBeGreaterThan(0);
    });

    it('should produce physically consistent specific energy', () => {
      // For Keplerian orbits: v²/2 - μ/r = -μ/(2a) = constant
      const a = 1.5;
      const e = 0.2;
      const sv = stateVectors(a, e, 0.3, 0.5, 0.7, 1.2, MU_SUN_AU);
      const r = Math.sqrt(sv.position[0] ** 2 + sv.position[1] ** 2 + sv.position[2] ** 2);
      const v2 = sv.velocity[0] ** 2 + sv.velocity[1] ** 2 + sv.velocity[2] ** 2;
      const energy = v2 / 2 - MU_SUN_AU / r;
      const expectedEnergy = -MU_SUN_AU / (2 * a);
      expect(energy).toBeCloseTo(expectedEnergy, 8);
    });
  });

  describe('orbitalPeriod', () => {
    it('should give ~365.25 days for Earth orbit at 1 AU', () => {
      const T = orbitalPeriod(1, MU_SUN_AU);
      const days = T / 86400;
      expect(days).toBeCloseTo(365.25, 1);
    });

    it('should satisfy Kepler third law: T² ∝ a³', () => {
      const T1 = orbitalPeriod(1, MU_SUN_AU);
      const T2 = orbitalPeriod(2, MU_SUN_AU);
      const ratio = (T2 * T2) / (T1 * T1);
      expect(ratio).toBeCloseTo(8, 1); // (2/1)³ = 8
    });
  });

  describe('julianDate', () => {
    it('should give J2000.0 (2451545.0) for 2000-01-01 12:00 UTC', () => {
      const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
      const jd = julianDate(j2000);
      expect(jd).toBeCloseTo(2451545.0, 2);
    });
  });

  describe('meanAnomalyAtTime', () => {
    it('should give M0 at epoch', () => {
      const M = meanAnomalyAtTime(1.0, 1000, 2451545.0, 2451545.0);
      expect(M).toBeCloseTo(1.0, 10);
    });

    it('should increase by 2π over one orbital period', () => {
      const period = 10000; // seconds
      const epoch = 2451545.0;
      const M1 = meanAnomalyAtTime(0, period, epoch, epoch + period / 86400);
      expect(M1).toBeCloseTo(2 * Math.PI, 6);
    });
  });
});
