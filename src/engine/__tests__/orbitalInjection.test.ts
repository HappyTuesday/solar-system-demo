import { describe, it, expect } from 'vitest';
import { createSpaceshipState } from '../orbitalInjection';
import { REAL_DATA, SPACECRAFT_CONFIG, MU_SUN_AU } from '../constants';

const EPSILON = 1e-10;

describe('orbitalInjection', () => {
  describe('createSpaceshipState', () => {
    it('should create a spaceship near Earth', () => {
      const state = createSpaceshipState('earth');
      expect(state.position.length).toBe(3);
      expect(state.velocity.length).toBe(3);
      expect(state.direction.length).toBe(3);
      expect(state.exploded).toBe(false);
    });

    it('should produce position in AU range', () => {
      const state = createSpaceshipState('earth');
      const r = Math.sqrt(state.position[0] ** 2 + state.position[1] ** 2 + state.position[2] ** 2);
      // Should be near 1 AU (Earth's orbit)
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.1);
    });

    it('should produce velocity in AU/s range', () => {
      const state = createSpaceshipState('earth');
      const v = Math.sqrt(state.velocity[0] ** 2 + state.velocity[1] ** 2 + state.velocity[2] ** 2);
      // Should be near Earth's orbital velocity in AU/s
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(0.001);
    });

    it('should apply orbit overrides', () => {
      const state = createSpaceshipState('earth', {
        semiMajorAxis: 0.0001, // overridden to a very close orbit
      });
      expect(state.position.length).toBe(3);
    });

    it('should throw for invalid target body', () => {
      expect(() => createSpaceshipState('nonexistent' as string)).toThrow();
    });
  });
});
