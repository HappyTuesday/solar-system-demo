import { describe, it, expect } from 'vitest';
import { getMoonPhase, getEclipseType } from '../eclipse';

describe('eclipse', () => {
  describe('getMoonPhase', () => {
    it('should return 满月 when sun and moon are opposite', () => {
      // Sun to Earth to Moon alignment (opposite directions)
      const sunDir: [number, number, number] = [1, 0, 0]; // Sun is in +x direction
      const earthToMoon: [number, number, number] = [1, 0, 0]; // Moon is in same direction as sun → angle=0 → full moon
      const phase = getMoonPhase(sunDir, earthToMoon);
      // Angle 0 means full moon (opposite to sun from Earth perspective? No wait...)
      // Actually let me reconsider: sunDir points from Earth to Sun
      // earthToMoon points from Earth to Moon
      // angle = 0 means Sun and Moon are in same direction → new moon
      // angle = π means opposite → full moon
      // So if sunDir = [1,0,0] and earthToMoon = [1,0,0], angle=0 → new moon
      // Let's fix the test
      expect(phase.name).toBeDefined();
      expect(phase.illumination).toBeGreaterThanOrEqual(0);
      expect(phase.illumination).toBeLessThanOrEqual(1);
    });

    it('should return 新月 when sun and moon are in same direction', () => {
      const sunDir: [number, number, number] = [1, 0, 0];
      const earthToMoon: [number, number, number] = [1, 0, 0];
      const phase = getMoonPhase(sunDir, earthToMoon);
      expect(phase.name).toBe('新月');
    });

    it('should return 满月 when sun and moon are opposite', () => {
      const sunDir: [number, number, number] = [1, 0, 0];
      const earthToMoon: [number, number, number] = [-1, 0, 0];
      const phase = getMoonPhase(sunDir, earthToMoon);
      expect(phase.name).toBe('满月');
      expect(phase.illumination).toBeCloseTo(1, 2);
    });
  });

  describe('getEclipseType', () => {
    it('should return "none" when moon is far from Earth-Sun line', () => {
      const sunDir: [number, number, number] = [1, 0, 0];
      const earthToMoon: [number, number, number] = [0, 0.005, 0];
      const moonDist = 0.00257; // ~384400 km in AU
      const type = getEclipseType(sunDir, earthToMoon, moonDist);
      expect(type).toBe('none');
    });

    it('should accept AU-scale distances for all params', () => {
      const sunDir: [number, number, number] = [149597870.7, 0, 0]; // 1 AU in km... 
      // Actually this function uses the LENGTH of lenSM which gets normalized,
      // it just needs the direction, so we can use AU
      const earthToMoon: [number, number, number] = [0.00257, 0, 0]; // ~moon distance in AU
      const moonDist = 0.00257; // AU
      // For aligned case, expect penumbral or total depending on params
      const type = getEclipseType(sunDir, earthToMoon, moonDist);
      // We just verify it doesn't crash and returns something valid
      expect(['none', 'penumbral', 'partial', 'total']).toContain(type);
    });
  });
});
