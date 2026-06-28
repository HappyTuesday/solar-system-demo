import { describe, it, expect } from 'vitest';
import { BUILD_DATA, type BuildBodyData } from '../buildData';
import { G_AU } from '../constants';

const EPSILON = 1e-12;

describe('buildData', () => {
  describe('BUILD_DATA', () => {
    it('should have sun, 8 planets', () => {
      expect(BUILD_DATA.sun).toBeDefined();
      expect(BUILD_DATA.mercury).toBeDefined();
      expect(BUILD_DATA.venus).toBeDefined();
      expect(BUILD_DATA.earth).toBeDefined();
      expect(BUILD_DATA.mars).toBeDefined();
      expect(BUILD_DATA.jupiter).toBeDefined();
      expect(BUILD_DATA.saturn).toBeDefined();
      expect(BUILD_DATA.uranus).toBeDefined();
      expect(BUILD_DATA.neptune).toBeDefined();
    });

    it('should have semiMajorAxis in AU range', () => {
      const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
      for (const id of planetIds) {
        const data = BUILD_DATA[id];
        if (data.semiMajorAxis > 0) {
          // BUILD_DATA planets have simplified semiMajorAxis in AU
          expect(data.semiMajorAxis).toBeGreaterThan(0.01);
          expect(data.semiMajorAxis).toBeLessThan(100);
        }
      }
    });

    it('should compute orbital speed from semiMajorAxis using G_AU', () => {
      // For Sun-orbit: v = sqrt(G_AU * sunMass / a)
      const earthData = BUILD_DATA.earth;
      if (earthData.semiMajorAxis > 0) {
        // The orbital speed should be approximately sqrt(μ/a)
        const expected = Math.sqrt(G_AU * BUILD_DATA.sun.mass / earthData.semiMajorAxis);
        expect(earthData.orbitalSpeed).toBeCloseTo(expected, EPSILON);
      }
    });

    it('all planets should have orbitalSpeed > 0', () => {
      const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
      for (const id of planetIds) {
        expect(BUILD_DATA[id].orbitalSpeed).toBeGreaterThan(0);
      }
    });

    it('sun should have orbitalSpeed 0', () => {
      expect(BUILD_DATA.sun.orbitalSpeed).toBe(0);
    });

    it('radii should be in AU range', () => {
      const allIds = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
      for (const id of allIds) {
        const data = BUILD_DATA[id];
        expect(data.radius).toBeGreaterThan(0);
        expect(data.radius).toBeLessThan(1);
      }
    });
  });
});
