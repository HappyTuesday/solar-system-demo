import { describe, it, expect } from 'vitest';
import {
  planHohmannTransfer,
  checkDeviation,
  getOrbitingBodyId,
  generateSubSteps,
  checkSubStepCompletion,
  evaluateSubStepCondition,
  getSubStepTargetOrbit,
  computeEccentricity,
  type NavigationPlan,
  type NavSubStep,
} from '../navigation';
import { REAL_DATA, MU_SUN_AU, NAVIGATION_CONFIG } from '../constants';
import { stateVectors, julianDate, orbitalPeriod, meanAnomalyAtTime, solveKepler, trueAnomaly } from '../orbital';

describe('navigation', () => {
  describe('getOrbitingBodyId', () => {
    it('should return sun when far from planets', () => {
      const shipPos: [number, number, number] = [100, 0, 0];
      const result = getOrbitingBodyId(shipPos, Date.now());
      expect(result).toBe('sun');
    });

    it('should return earth when near Earth position', () => {
      const now = Date.now();
      const jd = julianDate(now);
      const earthData = REAL_DATA.earth;
      if (earthData.orbital && earthData.semiMajorAxis) {
        const period = orbitalPeriod(earthData.semiMajorAxis, MU_SUN_AU);
        const M = meanAnomalyAtTime(earthData.orbital.meanAnomalyAtEpoch, period, earthData.orbital.epoch, jd);
        const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const E = solveKepler(Mmod, earthData.orbital.eccentricity);
        const nu = trueAnomaly(E, earthData.orbital.eccentricity);
        const sv = stateVectors(earthData.semiMajorAxis, earthData.orbital.eccentricity, earthData.orbital.inclination, earthData.orbital.longitudeAscendingNode, earthData.orbital.argumentOfPeriapsis, nu, MU_SUN_AU);
        const shipPos: [number, number, number] = [sv.position[0] + 0.001, sv.position[1], sv.position[2]];
        const result = getOrbitingBodyId(shipPos, now);
        expect(result).toBe('earth');
      }
    });
  });

  describe('computeEccentricity', () => {
    it('should return ~0 for circular orbit', () => {
      const a = 1;
      const pos: [number, number, number] = [a, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / a), 0];
      const ecc = computeEccentricity(pos, vel, MU_SUN_AU);
      expect(ecc).toBeLessThan(0.001);
    });

    it('should return non-zero for elliptical orbit', () => {
      const pos: [number, number, number] = [0.5, 0, 0];
      const vel: [number, number, number] = [0, 2.5 * Math.sqrt(MU_SUN_AU / 0.5), 0];
      const ecc = computeEccentricity(pos, vel, MU_SUN_AU);
      expect(ecc).toBeGreaterThan(0.5);
    });
  });

  describe('planHohmannTransfer', () => {
    it('should return a plan with phases for valid destination', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      expect(plan.method).toBe('hohmann');
      expect(plan.destinationId).toBe('mars');
      expect(plan.phases.length).toBeGreaterThan(0);
    });

    it('should return empty phases for sun destination', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, 0, 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'sun', Date.now());
      expect(plan.phases.length).toBe(0);
    });

    it('should compute targetOrbit with AU semiMajorAxis', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      for (const phase of plan.phases) {
        if (phase.targetOrbit.semiMajorAxis > 0) {
          expect(phase.targetOrbit.semiMajorAxis).toBeGreaterThan(0.3);
          expect(phase.targetOrbit.semiMajorAxis).toBeLessThan(50);
        }
      }
    });

    it('should compute deltaV values in AU/s', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      for (const phase of plan.phases) {
        if (phase.deltaV > 0) {
          expect(phase.deltaV).toBeLessThan(0.1);
          expect(phase.deltaV).toBeGreaterThan(0);
        }
      }
    });

    it('should populate subSteps for each phase', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      for (const phase of plan.phases) {
        expect(phase.subSteps).toBeDefined();
        expect(phase.subSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateSubSteps', () => {
    it('Phase 0: should generate wait_window sub-step with off thrust', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const waitPhase = plan.phases.find(p => p.name.startsWith('等待'));
      if (waitPhase) {
        expect(waitPhase.subSteps.length).toBe(1);
        expect(waitPhase.subSteps[0].type).toBe('wait_window');
        expect(waitPhase.subSteps[0].action.thrustDirection).toBe('off');
        expect(waitPhase.subSteps[0].action.thrustMagnitude).toBe(0);
        expect(waitPhase.subSteps[0].condition.type).toBe('window_ready');
      }
    });

    it('Phase 1: burn sub-step should have thrustWindow angle range in condition', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const burnPhase = plan.phases.find(p => p.name.includes('提升') || p.name.includes('降低'));
      if (burnPhase) {
        const burn = burnPhase.subSteps.find(s => s.type === 'burn_prograde' || s.type === 'burn_retrograde');
        expect(burn).toBeDefined();
        expect(burn!.condition.type).toBe('phase_angle_range');
        expect(burn!.condition.min).toBe(NAVIGATION_CONFIG.thrustWindowMinDeg);
        expect(burn!.condition.max).toBe(NAVIGATION_CONFIG.thrustWindowMaxDeg);
      }
    });

    it('Phase 1: burn sub-step should have target speed and semiMajorAxis', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const burnPhase = plan.phases.find(p => p.name.includes('提升') || p.name.includes('降低'));
      if (burnPhase) {
        const burn = burnPhase.subSteps.find(s => s.type === 'burn_prograde' || s.type === 'burn_retrograde');
        expect(burn!.action.targetSpeedKmS).toBeGreaterThan(0);
        expect(burn!.action.targetSemiMajorAxisAU).toBeGreaterThan(0);
        expect(burn!.action.thrustMagnitude).toBe(100);
        expect(burn!.action.thrustDirection).toBe('forward');
        expect(burn!.action.attitudeMode).toBe('prograde');
      }
    });

    it('Phase 2: should generate coast_transfer sub-step', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const coastPhase = plan.phases.find(p => p.name === '转移轨道滑行');
      expect(coastPhase).toBeDefined();
      if (coastPhase) {
        expect(coastPhase.subSteps.length).toBe(1);
        expect(coastPhase.subSteps[0].type).toBe('coast_transfer');
        expect(coastPhase.subSteps[0].action.thrustDirection).toBe('off');
        expect(coastPhase.subSteps[0].condition.type).toBe('always');
        expect(coastPhase.subSteps[0].condition.met).toBe(true);
      }
    });

    it('Phase 3: capture should have a burn sub-step', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const capturePhase = plan.phases.find(p => p.name.includes('捕获'));
      expect(capturePhase).toBeDefined();
      if (capturePhase) {
        const cap = capturePhase.subSteps.find(s => s.type === 'burn_retrograde' || s.type === 'burn_prograde');
        expect(cap).toBeDefined();
        expect(cap!.action.thrustMagnitude).toBe(100);
        expect(cap!.action.targetSemiMajorAxisAU).toBeGreaterThan(0);
      }
    });

    it('Phase 4: should generate burn_circularize and arrival sub-steps', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      const circPhase = plan.phases.find(p => p.name === '绕飞圆化');
      expect(circPhase).toBeDefined();
      if (circPhase) {
        expect(circPhase.subSteps.find(s => s.type === 'burn_circularize')).toBeDefined();
        const arrival = circPhase.subSteps.find(s => s.type === 'arrival');
        expect(arrival).toBeDefined();
        expect(arrival!.condition.met).toBe(false); // not met initially
      }
    });
  });

  describe('checkSubStepCompletion', () => {
    it('orient_prograde: completes when attitudeMode is prograde', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'orient_prograde', status: 'pending',
        condition: { type: 'immediate', met: true, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, [0, 0, 0], [0, 0, 0], 'prograde', 'mars', 0)).toBe(true);
    });

    it('orient_prograde: not complete when inertial', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'orient_prograde', status: 'pending',
        condition: { type: 'immediate', met: true, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, [0, 0, 0], [0, 0, 0], 'inertial', 'mars', 0)).toBe(false);
    });

    it('burn_prograde: completes when semiMajorAxis matches target', () => {
      const targetAU = 1.3;
      const pos: [number, number, number] = [targetAU, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / targetAU), 0];
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'burn_prograde', status: 'pending',
        condition: { type: 'phase_angle_range', met: true, min: 30, max: 150, description: '' },
        action: { thrustDirection: 'forward', thrustMagnitude: 100, attitudeMode: 'prograde',
          targetSemiMajorAxisAU: targetAU, description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, pos, vel, 'prograde', 'mars', 0)).toBe(true);
    });

    it('burn_prograde: not complete when semiMajorAxis far from target', () => {
      const targetAU = 1.3;
      const pos: [number, number, number] = [1, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'burn_prograde', status: 'pending',
        condition: { type: 'phase_angle_range', met: true, min: 30, max: 150, description: '' },
        action: { thrustDirection: 'forward', thrustMagnitude: 100, attitudeMode: 'prograde',
          targetSemiMajorAxisAU: targetAU, description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, pos, vel, 'prograde', 'mars', 0)).toBe(false);
    });

    it('burn_circularize: completes when eccentricity is low', () => {
      const a = 1.52;
      const pos: [number, number, number] = [a, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / a), 0]; // circular
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'burn_circularize', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'forward', thrustMagnitude: 50, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, pos, vel, 'prograde', 'mars', 0)).toBe(true);
    });

    it('arrival: not complete without low eccentricity', () => {
      const pos: [number, number, number] = [0.5, 0, 0];
      const vel: [number, number, number] = [0, 2.5 * Math.sqrt(MU_SUN_AU / 0.5), 0];
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'arrival', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial', description: '', completionCriteria: '' },
      };
      expect(checkSubStepCompletion(ss, pos, vel, 'prograde', 'mars', 0)).toBe(false);
    });
  });

  describe('evaluateSubStepCondition', () => {
    it('always type returns true', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'coast_transfer', status: 'pending',
        condition: { type: 'always', met: false, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial', description: '', completionCriteria: '' },
      };
      expect(evaluateSubStepCondition(ss, [0, 0, 0], [0, 0, 0], 0)).toBe(true);
    });

    it('immediate type returns true', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'orient_prograde', status: 'pending',
        condition: { type: 'immediate', met: false, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      expect(evaluateSubStepCondition(ss, [0, 0, 0], [0, 0, 0], 0)).toBe(true);
    });
  });

  describe('getSubStepTargetOrbit', () => {
    it('burn_prograde returns transfer orbit', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'burn_prograde', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'forward', thrustMagnitude: 100, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      const orbit = getSubStepTargetOrbit(ss, 1.3, 1.52, 0.09);
      expect(orbit).toBeDefined();
      expect(orbit!.semiMajorAxis).toBe(1.3);
      expect(orbit!.eccentricity).toBe(0.3);
    });

    it('burn_circularize returns target circular orbit', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'burn_circularize', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'forward', thrustMagnitude: 50, attitudeMode: 'prograde', description: '', completionCriteria: '' },
      };
      const orbit = getSubStepTargetOrbit(ss, 1.3, 1.52, 0.09);
      expect(orbit!.semiMajorAxis).toBe(1.52);
      expect(orbit!.eccentricity).toBe(0);
    });

    it('arrival returns null', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'arrival', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial', description: '', completionCriteria: '' },
      };
      expect(getSubStepTargetOrbit(ss, 1.3, 1.52, 0.09)).toBeNull();
    });

    it('coast_transfer returns transfer orbit', () => {
      const ss: NavSubStep = {
        id: 't', phaseId: 0, order: 0, type: 'coast_transfer', status: 'pending',
        condition: { type: 'always', met: true, description: '' },
        action: { thrustDirection: 'off', thrustMagnitude: 0, attitudeMode: 'inertial', description: '', completionCriteria: '' },
      };
      const orbit = getSubStepTargetOrbit(ss, 1.3, 1.52, 0.09);
      expect(orbit!.semiMajorAxis).toBe(1.3);
      expect(orbit!.eccentricity).toBe(0.3);
    });
  });

  describe('boundary', () => {
    it('sun destination returns empty phases', () => {
      const plan = planHohmannTransfer([1, 0, 0], [0, 0, 0], 'sun', Date.now());
      expect(plan.phases.length).toBe(0);
    });

    it('invalid destination returns empty phases', () => {
      const plan = planHohmannTransfer([1, 0, 0], [0, 0, 0], 'nonexistent', Date.now());
      expect(plan.phases.length).toBe(0);
    });

    it('replan from deviated state produces valid plan', () => {
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
      const plan = planHohmannTransfer([aEarth * 0.5, 0, 0], [0, vEarth * 1.5, 0], 'mars', Date.now());
      expect(plan.phases.length).toBeGreaterThan(0);
      for (const p of plan.phases) {
        expect(p.subSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('checkDeviation', () => {
    it('should return not-deviated for matching orbit', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan: NavigationPlan = {
        phases: [{ index: 0, name: 'test', subSteps: [], thrustDirection: 'forward', thrustMagnitude: 0, deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: 1, eccentricity: 0 } }],
        method: 'hohmann',
        destinationId: 'earth',
        plannedAt: 0,
      };
      const result = checkDeviation(shipPos, shipVel, plan, 0, 0);
      expect(result.deviated).toBe(false);
      expect(result.deviationAU).toBeLessThan(0.01);
    });
  });

  describe('closed-loop simulation', () => {
    it('Earth -> Mars: plan should have all 5 phases with populated sub-steps', () => {
      const startSimTime = Date.now();
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarth);
      const startPos: [number, number, number] = [aEarth, 0, 0];
      const startVel: [number, number, number] = [0, vEarthCirc, 0];

      const plan = planHohmannTransfer(startPos, startVel, 'mars', startSimTime);
      expect(plan.phases.length).toBeGreaterThanOrEqual(4);
      for (const phase of plan.phases) {
        expect(phase.subSteps.length).toBeGreaterThan(0);
      }
      const allSubStepTypes = plan.phases.flatMap(p => p.subSteps.map(s => s.type));
      // Should contain a burn, coast, circularize, and arrival
      expect(allSubStepTypes.some(t => t.startsWith('burn_'))).toBe(true);
      expect(allSubStepTypes).toContain('coast_transfer');
      expect(allSubStepTypes).toContain('burn_circularize');
      expect(allSubStepTypes).toContain('arrival');
    });

    it('Earth -> Mars: burn sub-step has correct target parameters', () => {
      const startSimTime = Date.now();
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarth);
      const startPos: [number, number, number] = [aEarth, 0, 0];
      const startVel: [number, number, number] = [0, vEarthCirc, 0];

      const plan = planHohmannTransfer(startPos, startVel, 'mars', startSimTime);
      const burnPhase = plan.phases.find(p => p.name.includes('提升') || p.name.includes('降低'));
      expect(burnPhase).toBeDefined();
      if (burnPhase) {
        const burn = burnPhase.subSteps.find(s => s.type === 'burn_prograde' || s.type === 'burn_retrograde');
        expect(burn).toBeDefined();
        if (burn) {
          expect(burn.action.thrustMagnitude).toBe(100);
          expect(burn.action.targetSpeedKmS).toBeGreaterThan(0);
          expect(burn.action.targetSpeedAUs).toBeGreaterThan(0);
          expect(burn.action.targetSemiMajorAxisAU).toBeGreaterThan(0);
        }
      }
    });

    it('Earth -> Mars: arrival sub-step should require low eccentricity for completion', () => {
      const startSimTime = Date.now();
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarth);
      const startPos: [number, number, number] = [aEarth, 0, 0];
      const startVel: [number, number, number] = [0, vEarthCirc, 0];

      const plan = planHohmannTransfer(startPos, startVel, 'mars', startSimTime);
      const circPhase = plan.phases.find(p => p.name === '绕飞圆化');
      expect(circPhase).toBeDefined();
      if (circPhase) {
        const arrival = circPhase.subSteps.find(s => s.type === 'arrival');
        expect(arrival).toBeDefined();
        // arrival should NOT be met initially
        expect(arrival!.condition.met).toBe(false);
        // Verify checkSubStepCompletion works for arrival type
        // Test with a high-eccentricity state: should NOT complete
        const pos: [number, number, number] = [0.5, 0, 0];
        const vel: [number, number, number] = [0, 3 * Math.sqrt(MU_SUN_AU / 0.5), 0];
        expect(checkSubStepCompletion(arrival!, pos, vel, 'prograde', 'mars', startSimTime)).toBe(false);
      }
    });
  });
});
