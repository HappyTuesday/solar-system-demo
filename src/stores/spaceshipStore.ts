import { create } from 'zustand';
import type { SpaceshipState, AttitudeMode } from '../types';
import { createSpaceshipState } from '../engine/orbitalInjection';
import type { NavigationPlan } from '../engine/navigation';
import { planHohmannTransfer, checkDeviation, checkPhaseCompleted } from '../engine/navigation';
import { NAVIGATION_CONFIG, MU_SUN_AU } from '../engine/constants';
import { jumpSpaceshipState } from '../engine/timeJump';

export type ExplosionPhase = 'none' | 'exploding' | 'complete';
export type Gear = 'D' | 'N' | 'R';

export interface SpaceshipStore extends SpaceshipState {
  isRunning: boolean;
  dashboardExpanded: boolean;
  simulatedTime: number;
  attitudeMode: AttitudeMode;
  targetBodyId: string | null;
  nearestBodyId: string | null;
  orbitingBodyId: string | null;

  navigationPlan: NavigationPlan | null;
  activePhaseIndex: number;
  deviationWarning: string | null;
  lastDeviationCheckTime: number;
  lastReplanTime: number;

  explosionPhase: ExplosionPhase;
  gear: Gear;
  totalDistanceKm: number;
  maxSpeedKms: number;
  sessionStartTime: number;
  crashBodyId: string | null;
  crashPosition: [number, number, number];
  crashBodyPosition: [number, number, number];

  setForwardThrust: (v: number) => void;
  setLateralThrust: (v: number) => void;
  setVerticalThrust: (v: number) => void;
  setThrustMagnitude: (m: number) => void;
  setDirection: (d: [number, number, number]) => void;
  setExploded: (bodyId: string, position: [number, number, number], bodyPosition: [number, number, number]) => void;
  setExplosionPhase: (phase: ExplosionPhase) => void;
  setGear: (g: Gear) => void;
  updateFlightStats: (distanceKm: number, speedKms: number) => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  updatePhysics: (pos: [number, number, number], vel: [number, number, number]) => void;
  setSimulatedTime: (t: number) => void;
  reset: () => void;
  yaw: (angle: number) => void;
  pitch: (angle: number) => void;
  setAttitudeMode: (mode: AttitudeMode) => void;
  setTargetBody: (id: string | null) => void;
  setNearestBodyId: (id: string | null) => void;
  setOrbitingBodyId: (id: string | null) => void;
  setNavigationPlan: (plan: NavigationPlan | null) => void;
  setActivePhaseIndex: (idx: number) => void;
  checkNavigationalDeviation: () => void;
  replanNavigation: () => void;
  timeJump: (targetTime: number) => void;
}

function rotateYaw(dir: [number, number, number], angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    dir[0] * cos - dir[1] * sin,
    dir[0] * sin + dir[1] * cos,
    dir[2],
  ];
}

function rotatePitch(dir: [number, number, number], angle: number): [number, number, number] {
  const rx = dir[1];
  const ry = -dir[0];
  const rLen = Math.sqrt(rx * rx + ry * ry);
  if (rLen < 1e-10) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [dir[0], dir[1] * cos - dir[2] * sin, dir[1] * sin + dir[2] * cos];
  }
  const kx = rx / rLen;
  const ky = ry / rLen;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = dir[0] * kx + dir[1] * ky;
  const cx = ky * dir[2];
  const cy = -kx * dir[2];
  const cz = kx * dir[1] - ky * dir[0];
  return [
    dir[0] * cos + cx * sin + kx * dot * (1 - cos),
    dir[1] * cos + cy * sin + ky * dot * (1 - cos),
    dir[2] * cos + cz * sin,
  ];
}

const now = Date.now();
const initialSpaceship = createSpaceshipState('earth', undefined, now);

const initialState = {
  ...initialSpaceship,
  isRunning: true,
  dashboardExpanded: true,
  simulatedTime: now,
  attitudeMode: 'prograde' as AttitudeMode,
  targetBodyId: null as string | null,
  nearestBodyId: 'earth' as string | null,
  orbitingBodyId: 'earth' as string | null,
  navigationPlan: null as NavigationPlan | null,
  activePhaseIndex: -1 as number,
  deviationWarning: null as string | null,
  lastDeviationCheckTime: now as number,
  lastReplanTime: 0 as number,
  explosionPhase: 'none' as ExplosionPhase,
  gear: 'N' as Gear,
  totalDistanceKm: 0,
  maxSpeedKms: 0,
  sessionStartTime: now,
  crashBodyId: null as string | null,
  crashPosition: [0, 0, 0] as [number, number, number],
  crashBodyPosition: [0, 0, 0] as [number, number, number],
};

export const useSpaceshipStore = create<SpaceshipStore>((set) => ({
  ...initialState,

  setForwardThrust: (v) => set(s => ({ thrust: [v, s.thrust[1], s.thrust[2]] })),
  setLateralThrust: (v) => set(s => ({ thrust: [s.thrust[0], v, s.thrust[2]] })),
  setVerticalThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.thrust[1], v] })),
  setThrustMagnitude: (m) => set({ thrustMagnitude: m }),
  setDirection: (d) => set({ direction: d }),
  setExploded: (bodyId, position, bodyPosition) => set({
    exploded: true,
    isRunning: false,
    explosionPhase: 'exploding',
    crashBodyId: bodyId,
    crashPosition: position,
    crashBodyPosition: bodyPosition,
  }),
  setExplosionPhase: (phase) => set({ explosionPhase: phase }),
  setGear: (g) => set(s => ({
    gear: g,
    thrust: [
      g === 'N' ? 0 : g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
      s.thrust[1],
      s.thrust[2],
    ] as [number, number, number],
  })),
  updateFlightStats: (distanceKm, speedKms) => set(s => ({
    totalDistanceKm: s.totalDistanceKm + distanceKm,
    maxSpeedKms: Math.max(s.maxSpeedKms, speedKms),
  })),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  toggleDashboard: () => set(s => ({ dashboardExpanded: !s.dashboardExpanded })),
  updatePhysics: (pos, vel) => set({ position: pos, velocity: vel }),
  setSimulatedTime: (t) => set({ simulatedTime: t }),
  reset: () => set(() => ({
    ...createSpaceshipState('earth', undefined, Date.now()),
    isRunning: true,
    dashboardExpanded: true,
    simulatedTime: Date.now(),
    attitudeMode: 'prograde' as AttitudeMode,
    targetBodyId: null as string | null,
    nearestBodyId: 'earth' as string | null,
    orbitingBodyId: 'earth' as string | null,
    navigationPlan: null as NavigationPlan | null,
    activePhaseIndex: -1 as number,
    deviationWarning: null as string | null,
    lastDeviationCheckTime: Date.now() as number,
    lastReplanTime: 0 as number,
    explosionPhase: 'none' as ExplosionPhase,
    gear: 'N' as Gear,
    totalDistanceKm: 0,
    maxSpeedKms: 0,
    sessionStartTime: Date.now(),
    crashBodyId: null as string | null,
    crashPosition: [0, 0, 0] as [number, number, number],
    crashBodyPosition: [0, 0, 0] as [number, number, number],
  })),
  yaw: (angle) => set(s => ({ direction: rotateYaw(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
  pitch: (angle) => set(s => ({ direction: rotatePitch(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
  setAttitudeMode: (mode) => set({ attitudeMode: mode }),
  setNearestBodyId: (id) => set({ nearestBodyId: id }),
  setOrbitingBodyId: (id) => set({ orbitingBodyId: id }),
  setTargetBody: (id) => set(s => {
    if (id !== null) {
      const plan = planHohmannTransfer(s.position, s.velocity, id, s.simulatedTime);
      return {
        targetBodyId: id,
        navigationPlan: plan.phases.length > 0 ? plan : null,
        activePhaseIndex: plan.phases.length > 0 ? 0 : -1,
        deviationWarning: null,
        lastReplanTime: s.simulatedTime,
      };
    }
    return {
      targetBodyId: null,
      navigationPlan: null,
      activePhaseIndex: -1,
      deviationWarning: null,
    };
  }),
  setNavigationPlan: (plan) => set({ navigationPlan: plan }),
  setActivePhaseIndex: (idx) => set({ activePhaseIndex: idx }),
  checkNavigationalDeviation: () => {
    const s = useSpaceshipStore.getState();
    if (s.targetBodyId === 'mars') return;
    if (!s.navigationPlan || s.activePhaseIndex < 0 || s.activePhaseIndex >= s.navigationPlan.phases.length) return;

    const phase = s.navigationPlan.phases[s.activePhaseIndex];
    if (!phase) return;

    // Check if current phase is complete → advance to next phase
    const done = checkPhaseCompleted(
      phase, s.position, s.velocity,
      s.navigationPlan.destinationId, s.simulatedTime,
    );
    if (done) {
      const nextIdx = s.activePhaseIndex + 1;
      if (nextIdx < s.navigationPlan.phases.length) {
        useSpaceshipStore.setState({
          activePhaseIndex: nextIdx,
          deviationWarning: null,
          thrustMagnitude: 0,
          thrust: [0, 0, 0],
        });
      }
      return;
    }

    // Deviation check for burn phases (overshoot detection)
    const isBurnPhase = phase.name.includes('提升') || phase.name.includes('降低') || phase.name.includes('捕获') || phase.name === '绕飞圆化';
    if (isBurnPhase) {
      const result = checkDeviation(s.position, s.velocity, s.navigationPlan, s.activePhaseIndex, s.simulatedTime);
      if (result.deviated && s.thrustMagnitude > 0) {
        const r = Math.sqrt(s.position[0] ** 2 + s.position[1] ** 2 + s.position[2] ** 2);
        const v2 = s.velocity[0] ** 2 + s.velocity[1] ** 2 + s.velocity[2] ** 2;
        const aCurrent = 1 / (2 / r - v2 / MU_SUN_AU);
        const aTarget = phase.targetOrbit.semiMajorAxis;
        const isForwardBurn = phase.thrustDirection === 'forward';
        const hasOvershot = isForwardBurn
          ? (aCurrent > aTarget + NAVIGATION_CONFIG.deviationThresholdAU * 10)
          : (aCurrent < aTarget - NAVIGATION_CONFIG.deviationThresholdAU * 10);
        if (hasOvershot) {
          const cooldown = s.simulatedTime - s.lastReplanTime;
          if (cooldown > NAVIGATION_CONFIG.rePlanCooldownSec * 1000) {
            useSpaceshipStore.setState({ deviationWarning: `偏离预定轨道 ${result.deviationKms.toFixed(0)} km，正在重规划...` });
            useSpaceshipStore.getState().replanNavigation();
          }
        }
      }
    }
  },
  replanNavigation: () => {
    const s = useSpaceshipStore.getState();
    if (!s.navigationPlan || s.activePhaseIndex < 0) return;
    const plan = planHohmannTransfer(s.position, s.velocity, s.navigationPlan.destinationId, s.simulatedTime);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      activePhaseIndex: Math.min(s.activePhaseIndex, plan.phases.length - 1),
      deviationWarning: '路线已重规划',
      lastReplanTime: s.simulatedTime,
    });
  },
  timeJump: (targetTime) => {
    const s = useSpaceshipStore.getState();
    if (!s.orbitingBodyId) return;
    const newShip = jumpSpaceshipState(
      { position: s.position, velocity: s.velocity, direction: s.direction, thrust: s.thrust, thrustMagnitude: s.thrustMagnitude, exploded: s.exploded },
      s.orbitingBodyId,
      s.simulatedTime,
      targetTime,
    );
    set({
      position: newShip.position,
      velocity: newShip.velocity,
      direction: newShip.direction,
      simulatedTime: targetTime,
    });
    const updated = useSpaceshipStore.getState();
    if (updated.targetBodyId) {
      const plan = planHohmannTransfer(newShip.position, newShip.velocity, updated.targetBodyId, targetTime);
      if (plan.phases.length > 0) {
        useSpaceshipStore.setState({
          navigationPlan: plan,
          activePhaseIndex: 0,
          deviationWarning: null,
        });
      }
    }
  },
}));
