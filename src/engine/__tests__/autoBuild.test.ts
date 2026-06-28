import { describe, it, expect } from 'vitest';
import { computeAutoBuildPlan, computeAutoBuildPlanForBuild } from '../autoBuild';

describe('autoBuild', () => {
  describe('computeAutoBuildPlan', () => {
    it('should return 9 steps (sun + 8 planets)', () => {
      const plan = computeAutoBuildPlan(Date.now());
      expect(plan.length).toBe(9);
    });

    it('first step should be sun at origin', () => {
      const plan = computeAutoBuildPlan(Date.now());
      expect(plan[0].templateId).toBe('sun');
      expect(plan[0].position[0]).toBe(0);
      expect(plan[0].position[1]).toBe(0);
      expect(plan[0].position[2]).toBe(0);
    });

    it('all planet positions should be in AU range', () => {
      const plan = computeAutoBuildPlan(Date.now());
      for (let i = 1; i < plan.length; i++) {
        const p = plan[i];
        const r = Math.sqrt(p.position[0] ** 2 + p.position[1] ** 2 + p.position[2] ** 2);
        // Planets orbit between ~0.3 and ~30 AU
        expect(r).toBeGreaterThan(0.1);
        expect(r).toBeLessThan(50);
      }
    });

    it('all velocities should be in AU/s', () => {
      const plan = computeAutoBuildPlan(Date.now());
      for (const step of plan) {
        const v = Math.sqrt(step.velocity[0] ** 2 + step.velocity[1] ** 2 + step.velocity[2] ** 2);
        if (v > 0) {
          // Orbital velocities in AU/s should be small (< 0.001)
          expect(v).toBeLessThan(0.001);
        }
      }
    });
  });

  describe('computeAutoBuildPlanForBuild', () => {
    it('should return 9 steps', () => {
      const plan = computeAutoBuildPlanForBuild();
      expect(plan.length).toBe(9);
    });

    it('sun should be at origin', () => {
      const plan = computeAutoBuildPlanForBuild();
      expect(plan[0].templateId).toBe('sun');
      expect(plan[0].position[0]).toBe(0);
      expect(plan[0].position[1]).toBe(0);
      expect(plan[0].position[2]).toBe(0);
    });
  });
});
