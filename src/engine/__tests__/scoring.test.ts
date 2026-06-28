import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '../../types';
import { scoreBuild, calculateErrors } from '../scoring';

function makeBody(
  id: string,
  templateId: string,
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  mass: number,
): CelestialBody {
  return {
    id,
    templateId,
    position: [x, y, z],
    velocity: [vx, vy, vz],
    mass,
    placedAt: 0,
    rotationSpeed: 0,
    rotationPhase: 0,
  };
}

import { REAL_DATA, PLANET_ORDER } from '../constants';

describe('scoring', () => {
  describe('scoreBuild', () => {
    it('should return score 0 for no bodies', () => {
      const result = scoreBuild([]);
      expect(result.totalScore).toBe(0);
    });

    it('should return non-zero score for planets in correct order', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, REAL_DATA.sun.mass);
      // Place planets in order matching the reference data positions
      const planets = PLANET_ORDER
        .filter(id => id !== 'sun' && REAL_DATA[id]?.type === 'planet')
        .slice(0, 2); // just mercury and venus
      const bodies = [sun];
      for (const planetId of planets) {
        const d = REAL_DATA[planetId];
        const a = d.semiMajorAxis ?? 0;
        const v = d.orbitalSpeed ?? 0;
        bodies.push(makeBody(`p-${planetId}`, planetId, a, 0, 0, 0, v, 0, d.mass));
      }
      const result = scoreBuild(bodies);
      // Two correctly placed planets with correct masses and velocities should score > 0
      expect(result.totalScore).toBeGreaterThan(0);
    });

    it('should give lower score for wrong body at position', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, REAL_DATA.sun.mass);
      // Put mercury at Earth's position (wrong body)
      const wrongPlanet = makeBody('wp', 'mercury', 1, 0, 0, 0, 1.991e-7, 0, REAL_DATA.mercury.mass);
      const result = scoreBuild([sun, wrongPlanet]);
      expect(result.totalScore).toBeLessThan(100);
    });

    it('should return planetScores object', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, REAL_DATA.sun.mass);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, REAL_DATA.earth.mass);
      const result = scoreBuild([sun, earth]);
      expect(typeof result.planetScores).toBe('object');
    });
  });

  describe('calculateErrors', () => {
    it('should return error data for planets', () => {
      const sun = makeBody('s', 'sun', 0, 0, 0, 0, 0, 0, REAL_DATA.sun.mass);
      const earth = makeBody('e', 'earth', 1, 0, 0, 0, 1.991e-7, 0, REAL_DATA.earth.mass);
      const errors = calculateErrors([sun, earth]);
      expect(errors[earth.id]).toBeDefined();
      expect(errors[earth.id].name).toBeDefined();
    });
  });
});
