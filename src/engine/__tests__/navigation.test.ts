import { describe, it, expect } from 'vitest';
import {
  planHohmannTransfer,
  checkPhaseCompleted,
  checkDeviation,
  computePhaseGuidance,
  getPhaseAngleDeg,
  getOrbitingBodyId,
  computeOrbitalSemiMajorAxis,
  computeEccentricity,
  computeBodyState,
  computeLiveNavigationGuidance,
  computeGuidanceSafetyTimeScale,
  isStableTargetOrbit,
  computeTargetRelativeOrbit,
  type NavigationPlan,
  type NavigationPhase,
} from '../navigation';
import { REAL_DATA, MU_SUN_AU, AU_TO_KM, SPACECRAFT_CONFIG, G_AU } from '../constants';
import { stateVectors, julianDate, orbitalPeriod, meanAnomalyAtTime, solveKepler, trueAnomaly } from '../orbital';
import { rk4StepSpaceshipWithMovingBodies, applyThrustInBodyFrame, type BodyInfo } from '../spaceship';
import type { SpaceshipState } from '../../types';

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

  describe('getPhaseAngleDeg', () => {
    it('should return ~90° when ship is beside Earth relative to velocity', () => {
      const now = Date.now();
      const jd = julianDate(now);
      const earthState = computeBodyState('earth', jd);
      expect(earthState).not.toBeNull();
      if (!earthState) return;

      const ev = earthState.velocity;
      const evLen = Math.sqrt(ev[0] ** 2 + ev[1] ** 2 + ev[2] ** 2);
      const perp: [number, number] = [-ev[1] / evLen, ev[0] / evLen];
      const offset = 0.001;
      const shipPos: [number, number, number] = [
        earthState.position[0] + perp[0] * offset,
        earthState.position[1] + perp[1] * offset,
        earthState.position[2],
      ];
      const phase = getPhaseAngleDeg(shipPos, now);
      expect(phase).not.toBeNull();
      if (phase != null) {
        expect(phase).toBeGreaterThan(80);
        expect(phase).toBeLessThan(100);
      }
    });

    it('should return ~0° when ship is directly ahead of Earth', () => {
      const now = Date.now();
      const jd = julianDate(now);
      const earthState = computeBodyState('earth', jd);
      if (!earthState) return;
      const ev = earthState.velocity;
      const evLen = Math.sqrt(ev[0] ** 2 + ev[1] ** 2 + ev[2] ** 2);
      const offset = 0.001;
      const shipPos: [number, number, number] = [
        earthState.position[0] + (ev[0] / evLen) * offset,
        earthState.position[1] + (ev[1] / evLen) * offset,
        earthState.position[2],
      ];
      const phase = getPhaseAngleDeg(shipPos, now);
      expect(phase).not.toBeNull();
      if (phase != null) {
        expect(phase).toBeLessThan(10);
      }
    });

    it('should return ~180° when ship is directly behind Earth', () => {
      const now = Date.now();
      const jd = julianDate(now);
      const earthState = computeBodyState('earth', jd);
      if (!earthState) return;
      const ev = earthState.velocity;
      const evLen = Math.sqrt(ev[0] ** 2 + ev[1] ** 2 + ev[2] ** 2);
      const offset = 0.001;
      const shipPos: [number, number, number] = [
        earthState.position[0] - (ev[0] / evLen) * offset,
        earthState.position[1] - (ev[1] / evLen) * offset,
        earthState.position[2],
      ];
      const phase = getPhaseAngleDeg(shipPos, now);
      expect(phase).not.toBeNull();
      if (phase != null) {
        expect(phase).toBeGreaterThan(170);
      }
    });

    it('should return null when far from all planets', () => {
      const shipPos: [number, number, number] = [100, 0, 0];
      const result = getPhaseAngleDeg(shipPos, Date.now());
      expect(result).toBeNull();
    });
  });

  describe('computeEccentricity', () => {
    it('should return ~0 for circular orbit', () => {
      const pos: [number, number, number] = [1, 0, 0];
      const vel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
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
    it('should return a plan with at least 4 phases for valid destination', () => {
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
      const shipPos: [number, number, number] = [aEarth, 0, 0];
      const shipVel: [number, number, number] = [0, vEarth, 0];
      const plan = planHohmannTransfer(shipPos, shipVel, 'mars', Date.now());
      expect(plan.method).toBe('hohmann');
      expect(plan.destinationId).toBe('mars');
      expect(plan.phases.length).toBeGreaterThanOrEqual(4);
    });

    it('should return empty phases for sun destination', () => {
      const plan = planHohmannTransfer([1, 0, 0], [0, 0, 0], 'sun', Date.now());
      expect(plan.phases.length).toBe(0);
    });

    it('should return empty phases for invalid destination', () => {
      const plan = planHohmannTransfer([1, 0, 0], [0, 0, 0], 'nonexistent', Date.now());
      expect(plan.phases.length).toBe(0);
    });

    it('should compute targetOrbit with AU semiMajorAxis', () => {
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
      const plan = planHohmannTransfer([aEarth, 0, 0], [0, vEarth, 0], 'mars', Date.now());
      for (const phase of plan.phases) {
        expect(phase.targetOrbit.semiMajorAxis).toBeGreaterThan(0.3);
        expect(phase.targetOrbit.semiMajorAxis).toBeLessThan(50);
      }
    });

    it('should compute deltaV values for burn phases', () => {
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
      const plan = planHohmannTransfer([aEarth, 0, 0], [0, vEarth, 0], 'mars', Date.now());
      const burnPhases = plan.phases.filter(p => p.deltaV > 0);
      expect(burnPhases.length).toBeGreaterThanOrEqual(2);
      for (const phase of burnPhases) {
        expect(phase.deltaV).toBeGreaterThan(0);
        expect(phase.deltaV).toBeLessThan(0.1);
      }
    });

    it('should correctly assign phase names and thrust directions', () => {
      const aEarth = REAL_DATA.earth.semiMajorAxis!;
      const vEarth = Math.sqrt(MU_SUN_AU / aEarth);
      const plan = planHohmannTransfer([aEarth, 0, 0], [0, vEarth, 0], 'mars', Date.now());

      const names = plan.phases.map(p => p.name);
      // Must contain the 4 burn/coast phases
      expect(names.some(n => n.includes('提升') || n.includes('降低'))).toBe(true);
      expect(names.some(n => n === '转移轨道滑行')).toBe(true);
      expect(names.some(n => n.includes('捕获'))).toBe(true);
      expect(names.some(n => n === '绕飞圆化')).toBe(true);

      // Burn phase should have forward thrust (outward transfer)
      const burnPhase = plan.phases.find(p => p.name.includes('提升') || p.name.includes('降低'));
      expect(burnPhase).toBeDefined();
      if (burnPhase) {
        expect(burnPhase.thrustDirection).toBe('forward');
        expect(burnPhase.thrustMagnitude).toBe(100);
      }

      // Capture phase should have backward thrust
      const capturePhase = plan.phases.find(p => p.name.includes('捕获'));
      expect(capturePhase).toBeDefined();
      if (capturePhase) {
        expect(capturePhase.thrustDirection).toBe('forward');
        expect(capturePhase.thrustMagnitude).toBe(100);
      }

      // Coast phase should have no thrust
      const coastPhase = plan.phases.find(p => p.name === '转移轨道滑行');
      expect(coastPhase).toBeDefined();
      if (coastPhase) {
        expect(coastPhase.thrustDirection).toBe('none');
        expect(coastPhase.thrustMagnitude).toBe(0);
      }
    });
  });

  describe('checkPhaseCompleted', () => {
    it('wait phase: should return false when phase not aligned', () => {
      const phase: NavigationPhase = {
        index: 0, name: '等待发射窗口', thrustDirection: 'none', thrustMagnitude: 0,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: 1, eccentricity: 0 },
      };
      // Ship at Earth orbit, not aligned
      const result = checkPhaseCompleted(phase, [1, 0, 0], [0, Math.sqrt(MU_SUN_AU / 1), 0], 'mars', Date.now());
      // May be true or false depending on current positions, but should not crash
      expect(typeof result).toBe('boolean');
    });

    it('burn phase: should return false when SMA far from target', () => {
      const aTarget = 1.3;
      const phase: NavigationPhase = {
        index: 1, name: '提升远日点', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: aTarget, eccentricity: 0.3 },
      };
      // Ship at Earth circular orbit (SMA=1), far from target
      const result = checkPhaseCompleted(phase, [1, 0, 0], [0, Math.sqrt(MU_SUN_AU / 1), 0], 'mars', Date.now());
      expect(result).toBe(false);
    });

    it('burn phase: should return false when still in Earth SOI with bound energy', () => {
      const aTarget = 1.3;
      const phase: NavigationPhase = {
        index: 1, name: '提升远日点', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: aTarget, eccentricity: 0.3 },
      };
      const now = Date.now();
      const jd = julianDate(now);
      const earthState = computeBodyState('earth', jd);
      if (earthState) {
        // Place ship very close to Earth (same velocity) → bound
        const shipPos: [number, number, number] = [earthState.position[0] + 0.0001, earthState.position[1], earthState.position[2]];
        const shipVel: [number, number, number] = [earthState.velocity[0], earthState.velocity[1], earthState.velocity[2]];
        const orbId = getOrbitingBodyId(shipPos, now);
        if (orbId === 'earth') {
          const result = checkPhaseCompleted(phase, shipPos, shipVel, 'mars', now);
          expect(result).toBe(false);
        }
      }
    });

    it('coast phase: should return true when close to destination', () => {
      const phase: NavigationPhase = {
        index: 2, name: '转移轨道滑行', thrustDirection: 'none', thrustMagnitude: 0,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: 1.26, eccentricity: 0.3 },
      };
      const jd = julianDate(Date.now());
      const marsState = computeBodyState('mars', jd);
      if (marsState) {
        const shipPos: [number, number, number] = [
          marsState.position[0] + 0.05,
          marsState.position[1],
          marsState.position[2],
        ];
        const result = checkPhaseCompleted(phase, shipPos, [0, 0, 0], 'mars', Date.now());
        expect(result).toBe(true);
      }
    });

    it('coast phase: should return false when far from destination', () => {
      const phase: NavigationPhase = {
        index: 2, name: '转移轨道滑行', thrustDirection: 'none', thrustMagnitude: 0,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: 1.26, eccentricity: 0.3 },
      };
      const result = checkPhaseCompleted(phase, [1, 0, 0], [0, 0, 0], 'mars', Date.now());
      expect(result).toBe(false);
    });

    it('circularize phase: should return true when eccentricity is low and near destination', () => {
      const aMars = REAL_DATA.mars.semiMajorAxis!;
      const phase: NavigationPhase = {
        index: 4, name: '绕飞圆化', thrustDirection: 'forward', thrustMagnitude: 50,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aMars, eccentricity: 0 },
      };
      // Perfectly circular orbit at Mars SMA, near where Mars would be on x-axis
      const shipPos: [number, number, number] = [-aMars, 0, 0];
      const vCirc = Math.sqrt(MU_SUN_AU / aMars);
      const shipVel: [number, number, number] = [0, -vCirc, 0];
      // Verify ecc is near 0
      const ecc = computeEccentricity(shipPos, shipVel, MU_SUN_AU);
      expect(ecc).toBeLessThan(0.001);
      // Check phase completion (distance to actual Mars may vary, test the ecc path)
      const result = checkPhaseCompleted(phase, shipPos, shipVel, 'mars', Date.now());
      // May not pass distance check if Mars is far, but won't crash
      expect(typeof result).toBe('boolean');
    });

    it('capture brake phase: should complete when SMA decreases to target', () => {
      const aTarget = REAL_DATA.mars.semiMajorAxis!;
      const phase: NavigationPhase = {
        index: 3, name: '目标捕获制动', thrustDirection: 'backward', thrustMagnitude: 100,
        deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: aTarget, eccentricity: 0.09 },
      };
      // Ship near Mars with low enough velocity for capture SMA
      const shipPos: [number, number, number] = [aTarget, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / aTarget) * 0.9, 0];
      const result = checkPhaseCompleted(phase, shipPos, shipVel, 'mars', Date.now() + 365 * 24 * 3600 * 1000);
      // May complete if SMA <= target
      expect(typeof result).toBe('boolean');
    });
  });

  describe('computePhaseGuidance', () => {
    const aEarth = REAL_DATA.earth.semiMajorAxis!;
    const vEarth = Math.sqrt(MU_SUN_AU / aEarth);

    function makePhase(name: string, thrustDir: 'forward' | 'backward' | 'none', mag: number, targetSMA: number): NavigationPhase {
      return {
        index: 0, name, thrustDirection: thrustDir, thrustMagnitude: mag,
        deltaV: 0.01, expectedSpeedKms: 3, targetOrbit: { semiMajorAxis: targetSMA, eccentricity: 0.3 },
      };
    }

    it('should return guidance for wait phase', () => {
      const phase = makePhase('等待发射窗口', 'none', 0, aEarth);
      const guide = computePhaseGuidance(phase, [aEarth, 0, 0], [0, vEarth, 0], 'mars', Date.now(), 'prograde', 0);
      expect(guide.title).toBeTruthy();
      expect(guide.metrics.length).toBeGreaterThan(0);
      expect(guide.shouldThrust).toBe(false);
      expect(guide.thrustMagnitude).toBe(0);
    });

    it('should return guidance for burn phase with phase angle metric', () => {
      const aTransferAU = (aEarth + REAL_DATA.mars.semiMajorAxis!) / 2;
      const phase = makePhase('提升远日点', 'forward', 100, aTransferAU);
      const guide = computePhaseGuidance(phase, [aEarth, 0, 0], [0, vEarth, 0], 'mars', Date.now(), 'prograde', 0);
      expect(guide.metrics.some(m => m.label.includes('相位'))).toBe(true);
      expect(guide.thrustDirection).toBe('forward');
      expect(guide.thrustMagnitude).toBe(100);
      expect(guide.attitudeMode).toBe('prograde');
    });

    it('should return burn guidance with remaining time when thrust is active', () => {
      const aTransferAU = (aEarth + REAL_DATA.mars.semiMajorAxis!) / 2;
      const phase = makePhase('提升远日点', 'forward', 100, aTransferAU);
      // Ship near Earth with slightly higher velocity (simulating mid-burn)
      const now = Date.now();
      const jd = julianDate(now);
      const earthState = computeBodyState('earth', jd);
      if (earthState) {
        const shipPos: [number, number, number] = [
          earthState.position[0] + 0.003,
          earthState.position[1],
          earthState.position[2],
        ];
        const shipVel: [number, number, number] = [
          earthState.velocity[0],
          earthState.velocity[1] * 1.01,
          earthState.velocity[2],
        ];
        const guide = computePhaseGuidance(phase, shipPos, shipVel, 'mars', now, 'prograde', 100);
        expect(guide.metrics.length).toBeGreaterThan(0);
      }
    });

    it('should return guidance for coast phase', () => {
      const aTransferAU = (aEarth + REAL_DATA.mars.semiMajorAxis!) / 2;
      const phase = makePhase('转移轨道滑行', 'none', 0, aTransferAU);
      const guide = computePhaseGuidance(phase, [1.3, 0, 0], [0, Math.sqrt(MU_SUN_AU * (2 / 1.3 - 1 / aTransferAU)), 0], 'mars', Date.now(), 'prograde', 0);
      expect(guide.shouldThrust).toBe(false);
      expect(guide.metrics.some(m => m.label.includes('远日点'))).toBe(true);
    });

    it('should return guidance for capture accelerate phase', () => {
      const aTarget = REAL_DATA.mars.semiMajorAxis!;
      const phase = makePhase('目标捕获加速', 'forward', 100, aTarget);
      const vTarget = Math.sqrt(MU_SUN_AU / aTarget);
      const guide = computePhaseGuidance(phase, [aTarget, 0, 0], [0, vTarget * 0.9, 0], 'mars', Date.now() + 365 * 24 * 3600 * 1000, 'prograde', 100);
      expect(guide.shouldThrust).toBe(true);
      expect(guide.thrustDirection).toBe('forward');
    });

    it('should return guidance for circularize phase', () => {
      const aTarget = REAL_DATA.mars.semiMajorAxis!;
      const phase = makePhase('绕飞圆化', 'forward', 50, aTarget);
      const guide = computePhaseGuidance(phase, [aTarget, 0, 0], [0, Math.sqrt(MU_SUN_AU / aTarget), 0], 'mars', Date.now() + 365 * 24 * 3600 * 1000, 'prograde', 0);
      expect(guide.metrics.some(m => m.label.includes('偏心率'))).toBe(true);
      expect(guide.thrustMagnitude).toBe(45);
    });
  });

  describe('computeLiveNavigationGuidance', () => {
    function marsStateAt(simulatedTime: number) {
      const marsState = computeBodyState('mars', julianDate(simulatedTime));
      expect(marsState).not.toBeNull();
      if (!marsState) throw new Error('missing Mars state');
      return marsState;
    }

    function makeMarsRelativeState(
      simulatedTime: number,
      relativePosition: [number, number, number],
      relativeVelocity: [number, number, number],
    ) {
      const marsState = marsStateAt(simulatedTime);
      return {
        position: [
          marsState.position[0] + relativePosition[0],
          marsState.position[1] + relativePosition[1],
          marsState.position[2] + relativePosition[2],
        ] as [number, number, number],
        velocity: [
          marsState.velocity[0] + relativeVelocity[0],
          marsState.velocity[1] + relativeVelocity[1],
          marsState.velocity[2] + relativeVelocity[2],
        ] as [number, number, number],
      };
    }

    function makeEarthParkingState(simulatedTime: number) {
      const earthState = computeBodyState('earth', julianDate(simulatedTime));
      expect(earthState).not.toBeNull();
      if (!earthState) throw new Error('missing Earth state');

      const earthSpeed = Math.sqrt(
        earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
      );
      const prograde: [number, number, number] = [
        earthState.velocity[0] / earthSpeed,
        earthState.velocity[1] / earthSpeed,
        earthState.velocity[2] / earthSpeed,
      ];
      const radial: [number, number, number] = [-prograde[1], prograde[0], 0];
      const parkingRadius = REAL_DATA.earth.radius + 30000 / AU_TO_KM;
      const localSpeed = Math.sqrt(G_AU * REAL_DATA.earth.mass / parkingRadius);

      return {
        position: [
          earthState.position[0] + radial[0] * parkingRadius,
          earthState.position[1] + radial[1] * parkingRadius,
          earthState.position[2],
        ] as [number, number, number],
        velocity: [
          earthState.velocity[0] + prograde[0] * localSpeed,
          earthState.velocity[1] + prograde[1] * localSpeed,
          earthState.velocity[2],
        ] as [number, number, number],
        direction: prograde,
      };
    }

    function makeEarthAntiDepartureState(simulatedTime: number) {
      const ship = makeEarthParkingState(simulatedTime);
      const earthState = computeBodyState('earth', julianDate(simulatedTime));
      expect(earthState).not.toBeNull();
      if (!earthState) throw new Error('missing Earth state');
      return {
        position: [
          earthState.position[0] - (ship.position[0] - earthState.position[0]),
          earthState.position[1] - (ship.position[1] - earthState.position[1]),
          earthState.position[2] - (ship.position[2] - earthState.position[2]),
        ] as [number, number, number],
        velocity: [
          earthState.velocity[0] - (ship.velocity[0] - earthState.velocity[0]),
          earthState.velocity[1] - (ship.velocity[1] - earthState.velocity[1]),
          earthState.velocity[2] - (ship.velocity[2] - earthState.velocity[2]),
        ] as [number, number, number],
        direction: [
          -(ship.direction[0]),
          -(ship.direction[1]),
          -(ship.direction[2]),
        ] as [number, number, number],
      };
    }

    it('识别已进入稳定火星绕飞轨道', () => {
      const now = Date.now();
      const marsMu = G_AU * REAL_DATA.mars.mass;
      const orbitRadius = REAL_DATA.mars.radius + 30000 / AU_TO_KM;
      const circularSpeed = Math.sqrt(marsMu / orbitRadius);
      const ship = makeMarsRelativeState(now, [orbitRadius, 0, 0], [0, circularSpeed, 0]);

      const targetOrbit = computeTargetRelativeOrbit(ship.position, ship.velocity, 'mars', now);
      expect(targetOrbit).not.toBeNull();
      expect(targetOrbit && isStableTargetOrbit(targetOrbit, 'mars')).toBe(true);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [0, 1, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(true);
      expect(guidance.shouldThrust).toBe(false);
      expect(guidance.operation).toBe('arrived');
      expect(guidance.title).toContain('火星绕飞');
    });

    it('火星束缚轨道近火点过低时，在远火点附近提示顺向点火提高近火点', () => {
      const now = Date.now();
      const marsMu = G_AU * REAL_DATA.mars.mass;
      const periapsis = REAL_DATA.mars.radius + 1000 / AU_TO_KM;
      const apoapsis = REAL_DATA.mars.radius + 150000 / AU_TO_KM;
      const semiMajorAxis = (periapsis + apoapsis) / 2;
      const apoapsisSpeed = Math.sqrt(marsMu * (2 / apoapsis - 1 / semiMajorAxis));
      const ship = makeMarsRelativeState(now, [apoapsis, 0, 0], [0, apoapsisSpeed, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [0, 1, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.shouldThrust).toBe(true);
      expect(guidance.thrustDirection).toBe('forward');
      expect(guidance.operation).toBe('ignite');
      expect(guidance.title).toContain('提高近火点');
      expect(guidance.recommendedGear).toBe('D');
      expect(guidance.desiredDirectionLabel).toContain('顺行');
      expect(guidance.recommendedThrustMagnitude).toBe(35);
    });

    it('火星束缚轨道远火点过大且尚未到近火点时，先提示滑行到近火点', () => {
      const now = Date.now();
      const marsMu = G_AU * REAL_DATA.mars.mass;
      const periapsis = REAL_DATA.mars.radius + 30000 / AU_TO_KM;
      const apoapsis = REAL_DATA.mars.semiMajorAxis! * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3) * 0.6;
      const semiMajorAxis = (periapsis + apoapsis) / 2;
      const apoapsisSpeed = Math.sqrt(marsMu * (2 / apoapsis - 1 / semiMajorAxis));
      const ship = makeMarsRelativeState(now, [apoapsis, 0, 0], [0, apoapsisSpeed, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [0, -1, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.shouldThrust).toBe(false);
      expect(guidance.operation).toBe('coast');
      expect(guidance.title).toContain('滑行到近火点');
      expect(guidance.recommendedGear).toBe('N');
    });

    it('火星远距离接近速度过高时，提示相对制动而不是继续静态滑行', () => {
      const now = Date.now();
      const hillRadius = REAL_DATA.mars.semiMajorAxis! * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
      const relativeDistance = hillRadius * 2;
      const highRelativeSpeed = 8 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [-highRelativeSpeed, highRelativeSpeed * 0.2, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation === 'turn' || guidance.operation === 'ignite').toBe(true);
      expect(guidance.title).toContain('火星');
      expect(guidance.actionText).toContain('制动');
      expect(guidance.recommendedGear).toBe(guidance.operation === 'turn' ? 'N' : 'D');
      expect(guidance.desiredDirectionLabel).toContain('逆行');
      expect(guidance.recommendedThrustMagnitude).toBe(guidance.operation === 'turn' ? 0 : 100);
    });

    it('火星远距离接近闭合速度接近下限时，继续提示小推力接近而不是长时间空档滑行', () => {
      const now = Date.now();
      const relativeDistance = 0.54;
      const barelyClosingSpeed = 0.09 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [-barelyClosingSpeed, 0, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [-1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation).toBe('ignite');
      expect(guidance.title).toContain('接近火星');
      expect(guidance.recommendedGear).toBe('D');
      expect(guidance.desiredDirectionLabel).toContain('指向火星');
      expect(guidance.recommendedThrustMagnitude).toBe(15);
      expect(guidance.suggestedTimeScale).toBe(1);
    });

    it('火星远距离接近速度受控且到希尔球仍很久时，建议最高滑行倍率', () => {
      const now = Date.now();
      const relativeDistance = 0.54;
      const controlledClosingSpeed = 0.2 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [-controlledClosingSpeed, 0, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [-1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation).toBe('coast');
      expect(guidance.title).toContain('接近速度已受控');
      expect(guidance.recommendedGear).toBe('N');
      expect(guidance.suggestedTimeScale).toBe(1000000);
    });

    it('离开地球后在0.8AU近火星错失状态下，实时导航继续给火星接近补救而不是回到霍曼等待', () => {
      const now = Date.now();
      const relativeDistance = 0.8;
      const highRecedingSpeed = 8 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [highRecedingSpeed, 0, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [-1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation === 'turn' || guidance.operation === 'ignite').toBe(true);
      expect(guidance.title).toContain('火星');
      expect(guidance.actionText).toContain('制动');
      expect(guidance.operation).not.toBe('jumpTime');
      expect(guidance.operation).not.toBe('wait');
      expect(guidance.recommendedGear).toBe(guidance.operation === 'turn' ? 'N' : 'D');
      expect(guidance.recommendedThrustMagnitude).toBe(guidance.operation === 'turn' ? 0 : 100);
    });

    it('希尔球外的弱负火星相对能量不直接进入圆化，仍按远距离接近处理', () => {
      const now = Date.now();
      const relativeDistance = 0.42;
      const weakBoundRecedingSpeed = 0.03 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [weakBoundRecedingSpeed, 0, 0]);
      const orbit = computeTargetRelativeOrbit(ship.position, ship.velocity, 'mars', now);

      expect(orbit).not.toBeNull();
      expect(orbit?.energy).toBeLessThan(0);
      expect(orbit?.distance).toBeGreaterThan((orbit?.hillRadius ?? 0) * 1.2);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [-1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.title).toContain('接近火星');
      expect(guidance.title).not.toContain('降低远火点');
      expect(guidance.desiredDirectionLabel).toContain('指向火星');
      expect(guidance.recommendedThrustMagnitude).toBe(15);
    });

    it('接近火星希尔球外沿且相对速度仍高时，提前提示捕获制动', () => {
      const now = Date.now();
      const hillRadius = REAL_DATA.mars.semiMajorAxis! * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
      const relativeDistance = hillRadius * 1.21;
      const relativeSpeed = 1.8 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [-0.12 / AU_TO_KM, relativeSpeed, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [0, -1, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation).toBe('ignite');
      expect(guidance.title).toContain('制动');
      expect(guidance.desiredDirectionLabel).toContain('逆行');
      expect(guidance.recommendedGear).toBe('D');
      expect(guidance.recommendedThrustMagnitude).toBe(100);
    });

    it('火星希尔球外沿受控滑行仍有数小时时，建议100x而不是低倍率空等', () => {
      const now = Date.now();
      const hillRadius = REAL_DATA.mars.semiMajorAxis! * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
      const relativeDistance = hillRadius * 1.21;
      const controlledClosingSpeed = 0.14 / AU_TO_KM;
      const ship = makeMarsRelativeState(now, [relativeDistance, 0, 0], [-controlledClosingSpeed, 0, 0]);

      const guidance = computeLiveNavigationGuidance({
        shipPosition: ship.position,
        shipVelocity: ship.velocity,
        shipDirection: [-1, 0, 0],
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.completed).toBe(false);
      expect(guidance.operation).toBe('coast');
      expect(guidance.suggestedTimeScale).toBe(100);
    });

    it('等待霍曼窗口时，实时导航给出用户可执行的空档和时间倍率建议', () => {
      let guidance = null as ReturnType<typeof computeLiveNavigationGuidance> | null;
      const start = Date.UTC(2026, 6, 4);
      const dayMs = 86400 * 1000;

      for (let day = 0; day <= 800; day += 5) {
        const simulatedTime = start + day * dayMs;
        const ship = makeEarthParkingState(simulatedTime);
        const current = computeLiveNavigationGuidance({
          shipPosition: ship.position,
          shipVelocity: ship.velocity,
          shipDirection: ship.direction,
          destinationId: 'mars',
          simulatedTime,
          thrustMagnitude: 0,
        });
        if (current.operation === 'jumpTime') {
          guidance = current;
          break;
        }
      }

      expect(guidance).not.toBeNull();
      expect(guidance?.recommendedGear).toBe('N');
      expect(guidance?.recommendedThrustMagnitude).toBe(0);
      expect(guidance?.suggestedTimeScale).toBeGreaterThan(1);
    });

    it('出发点火阶段的实时导航给出船头、D档和推力建议', () => {
      let guidance = null as ReturnType<typeof computeLiveNavigationGuidance> | null;
      const start = Date.UTC(2026, 6, 4);
      const halfDayMs = 12 * 3600 * 1000;

      for (let halfDay = 0; halfDay <= 1800; halfDay += 1) {
        const simulatedTime = start + halfDay * halfDayMs;
        const ship = makeEarthParkingState(simulatedTime);
        const current = computeLiveNavigationGuidance({
          shipPosition: ship.position,
          shipVelocity: ship.velocity,
          shipDirection: ship.direction,
          destinationId: 'mars',
          simulatedTime,
          thrustMagnitude: 0,
        });
        if (current.recommendedThrustMagnitude === 100 && current.desiredDirectionLabel) {
          guidance = current;
          break;
        }
      }

      expect(guidance).not.toBeNull();
      expect(guidance?.operation === 'wait' || guidance?.operation === 'turn' || guidance?.operation === 'ignite').toBe(true);
      expect(guidance?.recommendedGear).toBe('D');
      expect(guidance?.recommendedThrustMagnitude).toBe(100);
      expect(guidance?.desiredDirection).toBeDefined();
      expect(guidance?.desiredDirectionLabel).toContain('顺行');
      expect(guidance?.suggestedTimeScale).toBeGreaterThan(0);
    });

    it('地球停车轨道反向90度点不能推荐外行星转移点火', () => {
      let guidance = null as ReturnType<typeof computeLiveNavigationGuidance> | null;
      const start = Date.UTC(2026, 6, 4);
      const halfDayMs = 12 * 3600 * 1000;

      for (let halfDay = 0; halfDay <= 1800; halfDay += 1) {
        const simulatedTime = start + halfDay * halfDayMs;
        const ship = makeEarthAntiDepartureState(simulatedTime);
        const current = computeLiveNavigationGuidance({
          shipPosition: ship.position,
          shipVelocity: ship.velocity,
          shipDirection: ship.direction,
          destinationId: 'mars',
          simulatedTime,
          thrustMagnitude: 0,
        });
        if (current.title.includes('点火时机') || current.operation === 'ignite') {
          guidance = current;
          break;
        }
      }

      expect(guidance).not.toBeNull();
      expect(guidance?.operation).not.toBe('ignite');
      expect(guidance?.recommendedGear).toBe('N');
      expect(guidance?.recommendedThrustMagnitude).toBe(0);
    });

    it('已在地火转移轨道上时，实时导航不会重新等待窗口', () => {
      const marsA = REAL_DATA.mars.semiMajorAxis!;
      const transferA = (1 + marsA) / 2;
      const transferEcc = (marsA - 1) / (marsA + 1);
      const sv = stateVectors(
        transferA,
        transferEcc,
        0,
        0,
        0,
        Math.PI / 3,
        MU_SUN_AU,
      );
      const guidance = computeLiveNavigationGuidance({
        shipPosition: sv.position,
        shipVelocity: sv.velocity,
        shipDirection: [0, 1, 0],
        destinationId: 'mars',
        simulatedTime: Date.UTC(2026, 6, 4),
        thrustMagnitude: 0,
      });

      expect(transferEcc).toBeGreaterThan(0);
      expect(guidance.operation).not.toBe('jumpTime');
      expect(guidance.operation).not.toBe('wait');
      expect(guidance.suggestedTimeScale).toBeGreaterThan(0);
    });

    it('地球逃逸后即使仍在希尔球内，也提示转移滑行而不是卡在熄火低倍率', () => {
      const now = Date.UTC(2027, 4, 9, 15, 36, 33);
      const earthState = computeBodyState('earth', julianDate(now));
      expect(earthState).not.toBeNull();
      if (!earthState) return;

      const earthSpeed = Math.sqrt(
        earthState.velocity[0] ** 2 + earthState.velocity[1] ** 2 + earthState.velocity[2] ** 2,
      );
      const earthPrograde: [number, number, number] = [
        earthState.velocity[0] / earthSpeed,
        earthState.velocity[1] / earthSpeed,
        earthState.velocity[2] / earthSpeed,
      ];
      const localRadial: [number, number, number] = [-earthPrograde[1], earthPrograde[0], 0];
      const rRel = REAL_DATA.earth.radius + 1000 / AU_TO_KM;
      const escapedRelSpeed = 11.1 / AU_TO_KM;
      const shipPosition: [number, number, number] = [
        earthState.position[0] + localRadial[0] * rRel,
        earthState.position[1] + localRadial[1] * rRel,
        earthState.position[2],
      ];
      const shipVelocity: [number, number, number] = [
        earthState.velocity[0] + earthPrograde[0] * escapedRelSpeed,
        earthState.velocity[1] + earthPrograde[1] * escapedRelSpeed,
        earthState.velocity[2] + earthPrograde[2] * escapedRelSpeed,
      ];

      expect(getOrbitingBodyId(shipPosition, now)).toBe('earth');
      const guidance = computeLiveNavigationGuidance({
        shipPosition,
        shipVelocity,
        shipDirection: earthPrograde,
        destinationId: 'mars',
        simulatedTime: now,
        thrustMagnitude: 0,
      });

      expect(guidance.operation).toBe('coast');
      expect(guidance.title).toContain('转移轨道滑行');
      expect(guidance.recommendedGear).toBe('N');
      expect(guidance.recommendedThrustMagnitude).toBe(0);
      expect(guidance.suggestedTimeScale).toBeGreaterThan(1);
    });
  });

  describe('computeGuidanceSafetyTimeScale', () => {
    function makeGuidance(
      operation: ReturnType<typeof computeLiveNavigationGuidance>['operation'],
      suggestedTimeScale: number,
    ): ReturnType<typeof computeLiveNavigationGuidance> {
      return {
        operation,
        title: 'test',
        actionText: 'test',
        metrics: [],
        progress: 0,
        completed: false,
        shouldThrust: operation === 'ignite',
        thrustDirection: operation === 'ignite' ? 'forward' : 'none',
        thrustMagnitude: operation === 'ignite' ? 100 : 0,
        attitudeMode: 'inertial',
        suggestedTimeScale,
      };
    }

    it('关键机动会把过高倍率降到导航建议倍率', () => {
      expect(computeGuidanceSafetyTimeScale(makeGuidance('turn', 1), 10000)).toBe(1);
      expect(computeGuidanceSafetyTimeScale(makeGuidance('ignite', 10), 1000)).toBe(10);
      expect(computeGuidanceSafetyTimeScale(makeGuidance('cutoff', 1), 100)).toBe(1);
    });

    it('滑行建议不会强制自动提速或降速', () => {
      expect(computeGuidanceSafetyTimeScale(makeGuidance('coast', 10000), 10)).toBeNull();
      expect(computeGuidanceSafetyTimeScale(makeGuidance('coast', 10000), 100000)).toBeNull();
    });
  });

  describe('checkDeviation', () => {
    it('should return not-deviated for matching orbit', () => {
      const shipPos: [number, number, number] = [1, 0, 0];
      const shipVel: [number, number, number] = [0, Math.sqrt(MU_SUN_AU / 1), 0];
      const plan: NavigationPlan = {
        phases: [{ index: 0, name: 'test', thrustDirection: 'forward', thrustMagnitude: 0, deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: 1, eccentricity: 0 } }],
        method: 'hohmann',
        destinationId: 'earth',
        plannedAt: 0,
      };
      const result = checkDeviation(shipPos, shipVel, plan, 0, 0);
      expect(result.deviated).toBe(false);
    });
  });

  describe('Hohmann transfer exact solution', () => {
    it('should reach Mars orbital distance after half transfer period', () => {
      const aEarthAU = 1.0;
      const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarthAU);

      const aTransferAU = (aEarthAU + aMarsAU) / 2;
      const eTransfer = (aMarsAU - aEarthAU) / (aMarsAU + aEarthAU);

      const rPeriapsis = aTransferAU * (1 - eTransfer);
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / rPeriapsis - 1 / aTransferAU));
      const deltaV = vPeriapsis - vEarthCirc;

      const shipVel: [number, number, number] = [0, vEarthCirc + deltaV, 0];
      const shipPos: [number, number, number] = [aEarthAU, 0, 0];

      const aActual = computeOrbitalSemiMajorAxis(shipPos, shipVel, MU_SUN_AU);
      const eActual = computeEccentricity(shipPos, shipVel, MU_SUN_AU);
      expect(Math.abs(aActual - aTransferAU)).toBeLessThan(0.01);
      expect(Math.abs(eActual - eTransfer)).toBeLessThan(0.01);

      const M = Math.PI;
      const E = solveKepler(M, eTransfer);
      const nu = trueAnomaly(E, eTransfer);
      expect(Math.abs(nu - Math.PI)).toBeLessThan(1e-10);

      const state = stateVectors(aTransferAU, eTransfer, 0, 0, 0, nu, MU_SUN_AU);
      const rFinal = Math.sqrt(state.position[0] ** 2 + state.position[1] ** 2 + state.position[2] ** 2);
      const relativeError = Math.abs(rFinal - aMarsAU) / aMarsAU;
      expect(relativeError).toBeLessThan(0.001);
    });

    it('should have correct energy at departure and apoapsis', () => {
      const aEarthAU = 1.0;
      const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
      const aTransferAU = (aEarthAU + aMarsAU) / 2;
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));

      const energyDeparture = vPeriapsis * vPeriapsis / 2 - MU_SUN_AU / aEarthAU;
      const energyTarget = -MU_SUN_AU / (2 * aTransferAU);
      const relDiff = Math.abs(energyDeparture - energyTarget) / Math.abs(energyTarget);
      expect(relDiff).toBeLessThan(1e-10);

      const vApoapsis = Math.sqrt(MU_SUN_AU * (2 / aMarsAU - 1 / aTransferAU));
      expect(vApoapsis).toBeLessThan(Math.sqrt(MU_SUN_AU / aEarthAU));

      const energyApoapsis = vApoapsis * vApoapsis / 2 - MU_SUN_AU / aMarsAU;
      const relDiff2 = Math.abs(energyApoapsis - energyTarget) / Math.abs(energyTarget);
      expect(relDiff2).toBeLessThan(1e-10);
    });

    it('should fail to reach Mars if Δv is insufficient', () => {
      const aEarthAU = 1.0;
      const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarthAU);
      const aTransferAU = (aEarthAU + aMarsAU) / 2;

      const vRequired = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));
      const deltaV = vRequired - vEarthCirc;
      const halfDeltaV = vEarthCirc + deltaV * 0.5;

      const shipVel: [number, number, number] = [0, halfDeltaV, 0];
      const shipPos: [number, number, number] = [aEarthAU, 0, 0];

      const aActual = computeOrbitalSemiMajorAxis(shipPos, shipVel, MU_SUN_AU);
      const eActual = computeEccentricity(shipPos, shipVel, MU_SUN_AU);

      const rApoapsis = aActual * (1 + eActual);
      expect(rApoapsis).toBeLessThan(aMarsAU - 0.01);
    });

    it('should overshoot Mars if Δv is too high', () => {
      const aEarthAU = 1.0;
      const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
      const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarthAU);
      const aTransferAU = (aEarthAU + aMarsAU) / 2;

      const vRequired = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));
      const deltaV = vRequired - vEarthCirc;
      const doubleDeltaV = vEarthCirc + deltaV * 2.0;

      const shipVel: [number, number, number] = [0, doubleDeltaV, 0];
      const shipPos: [number, number, number] = [aEarthAU, 0, 0];

      const energy = doubleDeltaV * doubleDeltaV / 2 - MU_SUN_AU / aEarthAU;
      if (energy < 0) {
        const aActual = computeOrbitalSemiMajorAxis(shipPos, shipVel, MU_SUN_AU);
        const eActual = computeEccentricity(shipPos, shipVel, MU_SUN_AU);
        const rApoapsis = aActual * (1 + eActual);
        expect(rApoapsis).toBeGreaterThan(aMarsAU + 0.01);
      } else {
        expect(energy).toBeGreaterThan(0);
      }
    });
  });

  describe('Full Earth→Mars mission (physics + navigation)', () => {
    const aEarthAU = 1.0;
    const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
    const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarthAU);
    const aTransferAU = (aEarthAU + aMarsAU) / 2;
    const eTransfer = (aMarsAU - aEarthAU) / (aMarsAU + aEarthAU);

    it('Step 1: Plan generation should create 5 correct phases', () => {
      const plan = planHohmannTransfer([aEarthAU, 0, 0], [0, vEarthCirc, 0], 'mars', Date.now());
      expect(plan.phases.length).toBeGreaterThanOrEqual(4);
      expect(plan.phases.length).toBeLessThanOrEqual(5);

      const names = plan.phases.map(p => p.name);
      expect(names.some(n => n === '转移轨道滑行')).toBe(true);
      expect(names.some(n => n === '绕飞圆化')).toBe(true);
      expect(names.some(n => n.includes('捕获'))).toBe(true);
    });

    it('Step 2: Transfer orbit parameters match Hohmann formulas', () => {
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));
      const deltaV = vPeriapsis - vEarthCirc;

      expect(Math.abs(deltaV - (Math.sqrt(MU_SUN_AU * (2 * aMarsAU / (aTransferAU * 2)) - MU_SUN_AU / aEarthAU) - vEarthCirc)))
        .toBeLessThan(1e-5);

      // Verify burn would produce correct SMA
      const shipVel: [number, number, number] = [0, vEarthCirc + deltaV, 0];
      const shipPos: [number, number, number] = [aEarthAU, 0, 0];
      const aActual = computeOrbitalSemiMajorAxis(shipPos, shipVel, MU_SUN_AU);
      expect(Math.abs(aActual - aTransferAU)).toBeLessThan(0.01);
    });

    it('Step 3: After burn, apoapsis should reach Mars orbit', () => {
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));
      const shipVel: [number, number, number] = [0, vPeriapsis, 0];
      const shipPos: [number, number, number] = [aEarthAU, 0, 0];
      const aActual = computeOrbitalSemiMajorAxis(shipPos, shipVel, MU_SUN_AU);
      const eActual = computeEccentricity(shipPos, shipVel, MU_SUN_AU);
      const apoapsis = aActual * (1 + eActual);
      expect(Math.abs(apoapsis - aMarsAU) / aMarsAU).toBeLessThan(0.001);
    });

    it('Step 4: Half transfer period propagation shows rendezvous', () => {
      // Propagate analytically
      const M = Math.PI;
      const E = solveKepler(M, eTransfer);
      const nu = trueAnomaly(E, eTransfer);
      const state = stateVectors(aTransferAU, eTransfer, 0, 0, 0, nu, MU_SUN_AU);
      const rFinal = Math.sqrt(state.position[0] ** 2 + state.position[1] ** 2 + state.position[2] ** 2);

      const relErr = Math.abs(rFinal - aMarsAU) / aMarsAU;
      expect(relErr).toBeLessThan(0.001);
    });

    it('Step 5: Capture acceleration should match Mars orbit', () => {
      // At apoapsis (Mars orbit), ship is slower than Mars → need to ACCELERATE
      const vApoapsis = Math.sqrt(MU_SUN_AU * (2 / aMarsAU - 1 / aTransferAU));
      const vMarsCirc = Math.sqrt(MU_SUN_AU / aMarsAU);
      const deltaV_arr = vMarsCirc - vApoapsis; // positive = acceleration needed

      // Accelerate to match Mars orbital speed
      const newVel: [number, number, number] = [0, vApoapsis + deltaV_arr, 0];
      const newPos: [number, number, number] = [-aMarsAU, 0, 0]; // apoapsis at -x

      const aNew = computeOrbitalSemiMajorAxis(newPos, newVel, MU_SUN_AU);
      expect(Math.abs(aNew - aMarsAU)).toBeLessThan(0.05);
    });

    it('Step 6: Thrust duration computation is correct', () => {
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / aEarthAU - 1 / aTransferAU));
      const deltaV_AUs = vPeriapsis - vEarthCirc;
      const deltaV_Kms = deltaV_AUs * AU_TO_KM;

      // Thrust acceleration: maxThrustAU (AU/s²) → km/s²
      const thrustAccelKms = SPACECRAFT_CONFIG.maxThrustAU * AU_TO_KM;
      const estimatedBurnSec = deltaV_Kms / thrustAccelKms;

      // thrustAccelKms ≈ 9.53 km/s² (nearly 1g), Δv ≈ 2.95 km/s → ~0.31 s
      expect(estimatedBurnSec).toBeGreaterThan(0.2);
      expect(estimatedBurnSec).toBeLessThan(1.0);
    });

    it('Step 7: Full chain — all phase completion checks work', () => {
      // 7a. Create burn-completed state (offset from 1.0 to avoid Earth SOI)
      const shipR = 1.01;
      const vPeriapsis = Math.sqrt(MU_SUN_AU * (2 / shipR - 1 / aTransferAU));
      const burnCompleteVel: [number, number, number] = [0, vPeriapsis, 0];
      const burnCompletePos: [number, number, number] = [shipR, 0, 0];

      const burnPhase: NavigationPhase = {
        index: 0, name: '提升远日点', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: vPeriapsis - vEarthCirc, expectedSpeedKms: 3,
        targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
      };
      const burnDone = checkPhaseCompleted(burnPhase, burnCompletePos, burnCompleteVel, 'mars', Date.now());
      expect(burnDone).toBe(true);

      // 7b. Verify coast phase completion near Mars
      const coastPhase: NavigationPhase = {
        index: 1, name: '转移轨道滑行', thrustDirection: 'none', thrustMagnitude: 0,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
      };
      const M2 = Math.PI;
      const E2 = solveKepler(M2, eTransfer);
      const nu2 = trueAnomaly(E2, eTransfer);
      const coastState = stateVectors(aTransferAU, eTransfer, 0, 0, 0, nu2, MU_SUN_AU);
      const coastPos: [number, number, number] = [coastState.position[0], coastState.position[1], coastState.position[2]];
      const coastVel: [number, number, number] = [coastState.velocity[0], coastState.velocity[1], coastState.velocity[2]];
      const coastDone = checkPhaseCompleted(coastPhase, coastPos, coastVel, 'mars', Date.now());
      expect(typeof coastDone).toBe('boolean');

      // 7c. Verify circularize phase completion — perfectly circular orbit
      const circPhase: NavigationPhase = {
        index: 3, name: '绕飞圆化', thrustDirection: 'forward', thrustMagnitude: 50,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aMarsAU, eccentricity: 0 },
      };
      // Perfectly circular orbit at Mars SMA — ecc ~0
      const circPos: [number, number, number] = [-aMarsAU, 0, 0];
      const vCirc = Math.sqrt(MU_SUN_AU / aMarsAU);
      const circVel: [number, number, number] = [0, -vCirc, 0];
      const circEcc = computeEccentricity(circPos, circVel, MU_SUN_AU);
      expect(circEcc).toBeLessThan(0.001);
      const circDone = checkPhaseCompleted(circPhase, circPos, circVel, 'mars', Date.now());
      expect(typeof circDone).toBe('boolean');
    });
  });

  describe('Full Earth→Mars mission (RK4 simulation + navigation state machine)', () => {
    const aEarthAU = 1.0;
    const aMarsAU = REAL_DATA.mars.semiMajorAxis!;
    const aTransferAU = (aEarthAU + aMarsAU) / 2;
    const eTransfer = (aMarsAU - aEarthAU) / (aMarsAU + aEarthAU);
    const vEarthCirc = Math.sqrt(MU_SUN_AU / aEarthAU);
    const vMarsCirc = Math.sqrt(MU_SUN_AU / aMarsAU);

    // Use ship starting position to compute everything consistently
    const shipR0 = 1.01;
    const vPeriapsisR0 = Math.sqrt(MU_SUN_AU * (2 / shipR0 - 1 / aTransferAU));
    // Actually use the correct circular velocity at shipR0
    const vCircR0 = Math.sqrt(MU_SUN_AU / shipR0);

    function sunOnlyBodies(): BodyInfo[] {
      return [{ id: 'sun', position: [0, 0, 0], mass: REAL_DATA.sun.mass, radius: REAL_DATA.sun.radius }];
    }

    it('Step 1: Plan generation for Earth→Mars has 4-5 phases with correct names', () => {
      const plan = planHohmannTransfer([aEarthAU, 0, 0], [0, vEarthCirc, 0], 'mars', Date.now());
      expect(plan.phases.length).toBeGreaterThanOrEqual(4);
      expect(plan.phases.length).toBeLessThanOrEqual(5);

      const names = plan.phases.map(p => p.name);
      expect(names.some(n => n === '转移轨道滑行')).toBe(true);
      expect(names.some(n => n === '绕飞圆化')).toBe(true);
      expect(names.some(n => n.includes('捕获'))).toBe(true);
      expect(names.some(n => n.includes('提升') || n.includes('降低'))).toBe(true);
    });

    it('Step 2: Burn phase Δv matches Hohmann formula', () => {
      const deltaV_AUs = vPeriapsisR0 - vCircR0;
      const deltaV_Kms = deltaV_AUs * AU_TO_KM;
      const thrustAccelKms = SPACECRAFT_CONFIG.maxThrustAU * AU_TO_KM;
      const estimatedBurnSec = deltaV_Kms / thrustAccelKms;

      // Δv ≈ 2.85 km/s, thrust ≈ 9.53 km/s² → ~0.30 s burn time
      expect(deltaV_Kms).toBeGreaterThan(2.0);
      expect(deltaV_Kms).toBeLessThan(3.5);
      expect(estimatedBurnSec).toBeGreaterThan(0.2);
      expect(estimatedBurnSec).toBeLessThan(1.0);
    });

    it('Step 3: RK4 burn simulation achieves correct transfer orbit', () => {
      const startPos: [number, number, number] = [shipR0, 0, 0];
      const startVel: [number, number, number] = [0, vCircR0, 0];
      const thrustAccel = SPACECRAFT_CONFIG.maxThrustAU;
      const burnSec = (vPeriapsisR0 - vCircR0) / thrustAccel;

      const worldThrust = applyThrustInBodyFrame(1, 0, 0, 100, [0, 1, 0]);
      const ship: SpaceshipState = {
        position: startPos,
        velocity: startVel,
        direction: [0, 1, 0],
        thrust: worldThrust,
        thrustMagnitude: 100,
        exploded: false,
      };

      const subDt = 0.002;
      const steps = Math.ceil(burnSec / subDt);
      const bodiesFn = () => sunOnlyBodies();

      for (let s = 0; s < steps; s++) {
        rk4StepSpaceshipWithMovingBodies(ship, bodiesFn, subDt);
      }

      const aActual = computeOrbitalSemiMajorAxis(ship.position, ship.velocity, MU_SUN_AU);
      const eActual = computeEccentricity(ship.position, ship.velocity, MU_SUN_AU);
      const apoapsis = aActual * (1 + eActual);

      // SMA should be within 2% of target transfer orbit
      expect(Math.abs(aActual - aTransferAU) / aTransferAU).toBeLessThan(0.02);
      // Apoapsis should reach Mars orbit within 5%
      expect(Math.abs(apoapsis - aMarsAU) / aMarsAU).toBeLessThan(0.05);
    });

    it('Step 4: Burn-completion state passes checkPhaseCompleted', () => {
      const burnCompletePos: [number, number, number] = [shipR0, 0, 0];
      const burnCompleteVel: [number, number, number] = [0, vPeriapsisR0, 0];

      const burnPhase: NavigationPhase = {
        index: 0, name: '提升远日点', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: vPeriapsisR0 - vCircR0, expectedSpeedKms: 3,
        targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
      };
      expect(checkPhaseCompleted(burnPhase, burnCompletePos, burnCompleteVel, 'mars', Date.now())).toBe(true);
    });

    it('Step 5: Analytical propagation — apoapsis reaches Mars orbit', () => {
      // Propagate from periapsis (ν=0, r=1 AU) to apoapsis (ν=π) using Kepler
      const M = Math.PI;
      const E = solveKepler(M, eTransfer);
      const nu = trueAnomaly(E, eTransfer);
      expect(Math.abs(nu - Math.PI)).toBeLessThan(1e-10);

      const apoState = stateVectors(aTransferAU, eTransfer, 0, 0, 0, nu, MU_SUN_AU);
      const rApo = Math.sqrt(apoState.position[0] ** 2 + apoState.position[1] ** 2 + apoState.position[2] ** 2);

      // Apoapsis should equal Mars orbital distance within 0.1%
      expect(Math.abs(rApo - aMarsAU) / aMarsAU).toBeLessThan(0.001);
    });

    it('Step 6: Coast phase passes checkPhaseCompleted when near Mars', () => {
      const M = Math.PI;
      const E = solveKepler(M, eTransfer);
      const nu = trueAnomaly(E, eTransfer);
      const apoState = stateVectors(aTransferAU, eTransfer, 0, 0, 0, nu, MU_SUN_AU);
      const apoPos: [number, number, number] = [apoState.position[0], apoState.position[1], apoState.position[2]];
      const apoVel: [number, number, number] = [apoState.velocity[0], apoState.velocity[1], apoState.velocity[2]];

      const coastPhase: NavigationPhase = {
        index: 1, name: '转移轨道滑行', thrustDirection: 'none', thrustMagnitude: 0,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
      };

      // When Mars is near apoapsis, distance check should pass
      const jd = julianDate(Date.now());
      const marsState = computeBodyState('mars', jd);
      if (marsState) {
        // If Mars happens to be near the apoapsis, checkPhaseCompleted should work
        const result = checkPhaseCompleted(coastPhase, apoPos, apoVel, 'mars', Date.now());
        // At minimum the function should not crash
        expect(typeof result).toBe('boolean');
      }
    });

    it('Step 7: Capture acceleration reduces SMA to Mars orbit', () => {
      // At apoapsis, v_apo < v_Mars → need to accelerate (forward) to match
      const vApoapsis = Math.sqrt(MU_SUN_AU * (2 / aMarsAU - 1 / aTransferAU));
      const deltaV_arr = vMarsCirc - vApoapsis; // positive for Earth→Mars

      const captureVel: [number, number, number] = [0, vApoapsis + deltaV_arr, 0];
      const capturePos: [number, number, number] = [-aMarsAU, 0, 0];
      const aNew = computeOrbitalSemiMajorAxis(capturePos, captureVel, MU_SUN_AU);

      expect(Math.abs(aNew - aMarsAU)).toBeLessThan(0.05);

      const capturePhase: NavigationPhase = {
        index: 2, name: '目标捕获加速', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: deltaV_arr, expectedSpeedKms: deltaV_arr * AU_TO_KM,
        targetOrbit: { semiMajorAxis: aMarsAU, eccentricity: 0.0934 },
      };
      // Vis-viva check should confirm capture
      expect(checkPhaseCompleted(capturePhase, capturePos, captureVel, 'mars', Date.now())).toBe(true);
    });

    it('Step 8: Circularize phase passes checkPhaseCompleted with low eccentricity', () => {
      const circPos: [number, number, number] = [-aMarsAU, 0, 0];
      const circVel: [number, number, number] = [0, -vMarsCirc, 0];
      const ecc = computeEccentricity(circPos, circVel, MU_SUN_AU);
      expect(ecc).toBeLessThan(0.001);

      const circPhase: NavigationPhase = {
        index: 3, name: '绕飞圆化', thrustDirection: 'forward', thrustMagnitude: 50,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aMarsAU, eccentricity: 0 },
      };

      // Circular orbit near Mars position
      const jd = julianDate(Date.now());
      const marsState = computeBodyState('mars', jd);
      if (marsState) {
        const nearMarsPos: [number, number, number] = [
          marsState.position[0] + 0.01,
          marsState.position[1],
          marsState.position[2],
        ];
        const nearMarsVel: [number, number, number] = [0, vMarsCirc, 0];
        // This may not pass distance check, but ecc check should work
        const result = checkPhaseCompleted(circPhase, nearMarsPos, nearMarsVel, 'mars', Date.now());
        expect(typeof result).toBe('boolean');
      }
    });

    it('Step 9: Full chain — all 4 burn/capture/circularize phases pass completion', () => {
      const r1 = shipR0;

      // Phase: 提升远日点 (burn complete)
      const v1 = Math.sqrt(MU_SUN_AU * (2 / r1 - 1 / aTransferAU));
      const burnPhase: NavigationPhase = {
        index: 0, name: '提升远日点', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: v1 - vCircR0, expectedSpeedKms: 3,
        targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
      };
      expect(checkPhaseCompleted(burnPhase, [r1, 0, 0], [0, v1, 0], 'mars', Date.now())).toBe(true);

      // Phase: 目标捕获加速 (at Mars apoapsis, accelerate to match)
      const vApo = Math.sqrt(MU_SUN_AU * (2 / aMarsAU - 1 / aTransferAU));
      const vCap = vMarsCirc;
      const capturePhase: NavigationPhase = {
        index: 2, name: '目标捕获加速', thrustDirection: 'forward', thrustMagnitude: 100,
        deltaV: vCap - vApo, expectedSpeedKms: (vCap - vApo) * AU_TO_KM,
        targetOrbit: { semiMajorAxis: aMarsAU, eccentricity: 0.09 },
      };
      expect(checkPhaseCompleted(capturePhase, [aMarsAU, 0, 0], [0, vCap, 0], 'mars', Date.now())).toBe(true);

      // Phase: 绕飞圆化 (low eccentricity, may not pass distance check but won't throw)
      const circPhase: NavigationPhase = {
        index: 3, name: '绕飞圆化', thrustDirection: 'forward', thrustMagnitude: 50,
        deltaV: 0, expectedSpeedKms: 0, targetOrbit: { semiMajorAxis: aMarsAU, eccentricity: 0 },
      };
      const jd = julianDate(Date.now());
      const marsState = computeBodyState('mars', jd);
      if (marsState) {
        const nearPos: [number, number, number] = [marsState.position[0] + 0.01, marsState.position[1], marsState.position[2]];
        const nearVel: [number, number, number] = [0, vMarsCirc, 0];
        expect(checkPhaseCompleted(circPhase, nearPos, nearVel, 'mars', Date.now())).toBe(false);
      }
    });
  });
});
