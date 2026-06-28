import { describe, it, expect } from 'vitest';
import {
  REAL_DATA,
  AU_TO_M,
  AU_TO_KM,
  G_AU,
  MU_SUN_AU,
  PHYSICAL_CONSTANTS,
  PLANET_ORDER,
} from '../constants';

const EPSILON = 1e-12;

describe('constants', () => {
  describe('AU conversion constants', () => {
    it('AU_TO_M should be ~1.496e11', () => {
      expect(AU_TO_M).toBeCloseTo(149597870700, 0);
    });

    it('AU_TO_KM should be ~1.496e8', () => {
      expect(AU_TO_KM).toBeCloseTo(149597870.7, 0);
    });

    it('1 AU in meters round-trips correctly', () => {
      expect(1 * AU_TO_M).toBeCloseTo(149597870700, 0);
    });

    it('1 AU in km round-trips correctly', () => {
      expect(1 * AU_TO_KM).toBeCloseTo(149597870.7, 0);
    });
  });

  describe('G_AU and MU_SUN_AU', () => {
    it('G_AU should be G_SI / AU_TO_M^3', () => {
      const expected = 6.674e-11 / (AU_TO_M * AU_TO_M * AU_TO_M);
      expect(G_AU).toBeCloseTo(expected, 30);
    });

    it('MU_SUN_AU should give correct orbital velocity for Earth', () => {
      const a = 1; // AU
      const v = Math.sqrt(MU_SUN_AU / a);
      // Expected: ~29.78 km/s
      const vKms = v * AU_TO_KM;
      expect(vKms).toBeCloseTo(29.78, 0.1);
    });

    it('MU_SUN_AU should give 1 year orbital period for Earth', () => {
      const T = 2 * Math.PI * Math.sqrt(1 / MU_SUN_AU); // seconds
      const days = T / 86400;
      expect(days).toBeCloseTo(365.25, 1);
    });
  });

  describe('REAL_DATA', () => {
    it('should have Earth semiMajorAxis ~1 AU', () => {
      expect(REAL_DATA.earth.semiMajorAxis).toBeCloseTo(1, 2);
    });

    it('should have planets sorted by increasing semiMajorAxis', () => {
      const planets = PLANET_ORDER.filter(id => id !== 'sun');
      for (let i = 1; i < planets.length; i++) {
        const a1 = REAL_DATA[planets[i - 1]].semiMajorAxis ?? 0;
        const a2 = REAL_DATA[planets[i]].semiMajorAxis ?? 0;
        expect(a2).toBeGreaterThan(a1);
      }
    });

    it('all planets should have positive semiMajorAxis', () => {
      const planets = PLANET_ORDER.filter(id => id !== 'sun');
      for (const id of planets) {
        const a = REAL_DATA[id].semiMajorAxis ?? 0;
        expect(a).toBeGreaterThan(0);
      }
    });

    it('all planets should have valid orbital data', () => {
      const planets = PLANET_ORDER.filter(id => id !== 'sun');
      for (const id of planets) {
        expect(REAL_DATA[id].orbital).toBeDefined();
      }
    });

    it('Earth radius should be in AU (small number)', () => {
      // Earth actual radius: ~6371 km = 4.258e-5 AU
      expect(REAL_DATA.earth.radius).toBeLessThan(0.001);
      expect(REAL_DATA.earth.radius).toBeGreaterThan(0);
    });

    it('Sun radius should be in AU', () => {
      // Sun actual radius: ~696340 km = 0.00465 AU
      expect(REAL_DATA.sun.radius).toBeLessThan(0.01);
      expect(REAL_DATA.sun.radius).toBeGreaterThan(0.001);
    });

    it('Earth orbitalSpeed should be in AU/s', () => {
      // Expected: 29780 m/s / 1.496e11 = 1.991e-7 AU/s
      const expected = 29780 / AU_TO_M;
      expect(REAL_DATA.earth.orbitalSpeed).toBeCloseTo(expected, EPSILON);
    });
  });

  describe('PHYSICAL_CONSTANTS', () => {
    it('should have G equal to G_AU (AU-scaled)', () => {
      expect(PHYSICAL_CONSTANTS.G).toBeCloseTo(G_AU, 30);
    });

    it('softeningFactor should be in AU scale', () => {
      expect(PHYSICAL_CONSTANTS.softeningFactor).toBeLessThan(0.01);
      expect(PHYSICAL_CONSTANTS.softeningFactor).toBeGreaterThan(0);
    });

    it('sunRadius should be in AU', () => {
      expect(PHYSICAL_CONSTANTS.sunRadius).toBeLessThan(0.01);
      expect(PHYSICAL_CONSTANTS.sunRadius).toBeGreaterThan(0);
    });
  });
});
