import { create } from 'zustand';
import type { SpaceshipState, AttitudeMode } from '../types';
import { createSpaceshipState } from '../engine/orbitalInjection';
import type { NavigationPlan, NavigationTarget } from '../engine/navigation';
import { navigationTargetArrivalDistanceAU, planDirectRendezvousTransfer, resolveCurrentNavigationTarget } from '../engine/navigation';
import { AU_TO_KM } from '../engine/constants';
import { jumpSpaceshipState } from '../engine/timeJump';
import {
  parkBrakeSnapshot,
  parkBrakeThrustMagnitude,
  parkHoldSnapshot,
  orbitInsertSnapshot,
  PARK_BRAKE_EPS_AU_PER_SEC,
  type BodyInfo,
} from '../engine/spaceship';
import {
  canEnableCruise,
  computeCruiseGuidance,
  computeCruiseJumpSeconds,
} from '../engine/cruise';
import { useExploreStore } from './exploreStore';

export type ExplosionPhase = 'none' | 'exploding' | 'complete';
export type Gear = 'D' | 'N' | 'R' | 'T' | 'P' | 'O';
export type ParkPhase = 'braking' | 'holding';
export type CruisePhase = 'idle' | 'coasting';

const DEG_TO_RAD = Math.PI / 180;
const TANGENTIAL_CORRECTION_EPS_AU_PER_SEC = 0.01 / AU_TO_KM;
const TANGENTIAL_CORRECTION_FINE_SPEED_AU_PER_SEC = 1 / AU_TO_KM;
const TANGENTIAL_CORRECTION_FULL_THRUST_SPEED_AU_PER_SEC = 20 / AU_TO_KM;
const TANGENTIAL_CORRECTION_MAX_THRUST_MN = 100;
const TANGENTIAL_CORRECTION_MIN_THRUST_MN = 1;

export interface SpaceshipStore extends SpaceshipState {
  isRunning: boolean;
  dashboardExpanded: boolean;
  simulatedTime: number;
  attitudeMode: AttitudeMode;
  targetBodyId: string | null;
  nearestBodyId: string | null;
  orbitingBodyId: string | null;

  navigationPlan: NavigationPlan | null;
  currentNavigationTarget: NavigationTarget | null;
  currentNavigationStageIndex: number | null;
  lastReplanTime: number;

  explosionPhase: ExplosionPhase;
  gear: Gear;
  tangentialCorrectionSign: number | null;
  tangentialCorrectionLastAbs: number | null;
  tangentialCorrectionPrevAttitude: AttitudeMode | null;
  parkInitialDirection: [number, number, number] | null;
  parkPhase: ParkPhase | null;
  cruiseActive: boolean;
  cruisePhase: CruisePhase;
  cruiseNextJumpAtMs: number | null;
  cruisePreviousTimeScale: number | null;
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
  updateTangentialCorrectionGear: () => void;
  updateParkGear: (bodies: BodyInfo[]) => void;
  updateOrbitGear: (bodies: BodyInfo[]) => void;
  toggleCruise: (nowMs: number) => void;
  updateCruise: (nowMs: number) => void;
  maybeCompleteRendezvous: () => void;
  updateFlightStats: (distanceKm: number, speedKms: number) => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  updatePhysics: (pos: [number, number, number], vel: [number, number, number]) => void;
  setSimulatedTime: (t: number) => void;
  reset: () => void;
  yaw: (angle: number) => void;
  pitch: (angle: number) => void;
  yawDegrees: (angleDegrees: number) => void;
  pitchDegrees: (angleDegrees: number) => void;
  setAttitudeMode: (mode: AttitudeMode) => void;
  setTargetBody: (id: string | null) => void;
  setNearestBodyId: (id: string | null) => void;
  setOrbitingBodyId: (id: string | null) => void;
  setNavigationPlan: (plan: NavigationPlan | null) => void;
  maybeReplanRendezvous: () => void;
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

function vectorLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vectorNormalize(v: [number, number, number]): [number, number, number] {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vectorDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function directTangentialSpeedSnapshot(
  position: [number, number, number],
  velocity: [number, number, number],
  currentNavigationTarget: NavigationTarget | null,
  simulatedTime: number,
): { sign: number; tangentialAbs: number; correctionDirection: [number, number, number] } | null {
  const target = resolveCurrentNavigationTarget(currentNavigationTarget, position, simulatedTime);
  if (!target) return null;
  const toTarget: [number, number, number] = [
    target.position[0] - position[0],
    target.position[1] - position[1],
    target.position[2] - position[2],
  ];
  const targetDirection = vectorNormalize(toTarget);
  if (vectorLength(targetDirection) < 1e-20) return null;

  const tangent = vectorNormalize([-targetDirection[1], targetDirection[0], 0]);
  if (vectorLength(tangent) < 1e-20) return null;

  const relativeVelocity: [number, number, number] = [
    velocity[0] - target.velocity[0],
    velocity[1] - target.velocity[1],
    velocity[2] - target.velocity[2],
  ];
  const tangentialSpeed = vectorDot(relativeVelocity, tangent);
  if (Math.abs(tangentialSpeed) <= TANGENTIAL_CORRECTION_EPS_AU_PER_SEC) return null;

  const sign = tangentialSpeed > 0 ? 1 : -1;
  const tangentialAbs = Math.abs(tangentialSpeed);
  const correctionDirection: [number, number, number] = [
    -sign * tangent[0],
    -sign * tangent[1],
    -sign * tangent[2],
  ];
  return { sign, tangentialAbs, correctionDirection };
}

function tangentialCorrectionThrustMagnitude(tangentialAbs: number): number {
  if (tangentialAbs <= TANGENTIAL_CORRECTION_FINE_SPEED_AU_PER_SEC) {
    return TANGENTIAL_CORRECTION_MIN_THRUST_MN;
  }
  const ratio = (tangentialAbs - TANGENTIAL_CORRECTION_FINE_SPEED_AU_PER_SEC)
    / (TANGENTIAL_CORRECTION_FULL_THRUST_SPEED_AU_PER_SEC - TANGENTIAL_CORRECTION_FINE_SPEED_AU_PER_SEC);
  return Math.min(
    TANGENTIAL_CORRECTION_MAX_THRUST_MN,
    TANGENTIAL_CORRECTION_MIN_THRUST_MN
      + ratio * (TANGENTIAL_CORRECTION_MAX_THRUST_MN - TANGENTIAL_CORRECTION_MIN_THRUST_MN),
  );
}

function shouldReplanAfterTimeJump(plan: NavigationPlan | null, targetTime: number): boolean {
  if (!plan?.rendezvous) return true;
  return targetTime > plan.rendezvous.rendezvousTime;
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
  currentNavigationTarget: null as NavigationTarget | null,
  currentNavigationStageIndex: null as number | null,
  lastReplanTime: 0 as number,
  explosionPhase: 'none' as ExplosionPhase,
  gear: 'N' as Gear,
  tangentialCorrectionSign: null as number | null,
  tangentialCorrectionLastAbs: null as number | null,
  tangentialCorrectionPrevAttitude: null as AttitudeMode | null,
  parkInitialDirection: null as [number, number, number] | null,
  parkPhase: null as ParkPhase | null,
  cruiseActive: false,
  cruisePhase: 'idle' as CruisePhase,
  cruiseNextJumpAtMs: null as number | null,
  cruisePreviousTimeScale: null as number | null,
  totalDistanceKm: 0,
  maxSpeedKms: 0,
  sessionStartTime: now,
  crashBodyId: null as string | null,
  crashPosition: [0, 0, 0] as [number, number, number],
  crashBodyPosition: [0, 0, 0] as [number, number, number],
};

export const useSpaceshipStore = create<SpaceshipStore>((set) => ({
  ...initialState,

  setForwardThrust: (v) => set(s => ({ thrust: [s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v, s.thrust[1], s.thrust[2]] })),
  setLateralThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v, s.thrust[2]] })),
  setVerticalThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.thrust[1], s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v] })),
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
  setGear: (g) => set(s => {
    if (g === 'O' && !s.orbitingBodyId) {
      return {};
    }
    if (g === 'P') {
      const speed = vectorLength(s.velocity);
      if (speed <= PARK_BRAKE_EPS_AU_PER_SEC) {
        return {
          gear: 'P' as Gear,
          thrust: [0, 0, 0] as [number, number, number],
          parkInitialDirection: null,
          parkPhase: 'holding' as ParkPhase,
          tangentialCorrectionSign: null,
          tangentialCorrectionLastAbs: null,
        };
      }
      const initialDir = vectorNormalize(s.velocity);
      return {
        gear: 'P' as Gear,
        parkInitialDirection: initialDir,
        parkPhase: 'braking' as ParkPhase,
        attitudeMode: 'inertial' as AttitudeMode,
        direction: initialDir,
        thrust: [-1, 0, 0] as [number, number, number],
        thrustMagnitude: parkBrakeThrustMagnitude(speed),
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
      };
    }
    return {
      gear: g,
      parkInitialDirection: null,
      parkPhase: null,
      tangentialCorrectionSign: g === 'T' ? null : s.tangentialCorrectionSign,
      tangentialCorrectionLastAbs: g === 'T' ? null : s.tangentialCorrectionLastAbs,
      tangentialCorrectionPrevAttitude: g === 'T' ? s.attitudeMode : s.tangentialCorrectionPrevAttitude,
      thrust: g === 'N' || g === 'T'
        ? [0, 0, 0] as [number, number, number]
        : [
          g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
          s.thrust[1],
          s.thrust[2],
        ] as [number, number, number],
    };
  }),
  updateParkGear: (bodies) => set(s => {
    if (s.gear !== 'P') return {};
    if (s.parkPhase === 'braking' && s.parkInitialDirection) {
      const snap = parkBrakeSnapshot(s.velocity, s.parkInitialDirection);
      if (!snap.reachedStop) {
        return {
          direction: snap.facingDirection,
          attitudeMode: 'inertial' as AttitudeMode,
          thrust: [-1, 0, 0] as [number, number, number],
          thrustMagnitude: snap.thrustMagnitude,
        };
      }
    }
    const hold = parkHoldSnapshot(s.position, s.velocity, bodies);
    if (vectorLength(hold.facingDirection) < 1e-20 || hold.thrustMagnitude <= 0) {
      return {
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        parkPhase: 'holding' as ParkPhase,
      };
    }
    return {
      direction: hold.facingDirection,
      attitudeMode: 'inertial' as AttitudeMode,
      thrust: [1, 0, 0] as [number, number, number],
      thrustMagnitude: hold.thrustMagnitude,
      parkPhase: 'holding' as ParkPhase,
    };
  }),
  updateOrbitGear: (bodies) => set(s => {
    if (s.gear !== 'O') return {};
    if (!s.orbitingBodyId) {
      return { gear: 'N' as Gear, thrust: [0, 0, 0] as [number, number, number], thrustMagnitude: 0 };
    }
    const body = bodies.find(candidate => candidate.id === s.orbitingBodyId);
    if (!body) {
      return { gear: 'N' as Gear, thrust: [0, 0, 0] as [number, number, number], thrustMagnitude: 0 };
    }
    const resolved = resolveCurrentNavigationTarget(
      { kind: 'body', bodyId: s.orbitingBodyId },
      s.position,
      s.simulatedTime,
    );
    if (!resolved) {
      return { gear: 'N' as Gear, thrust: [0, 0, 0] as [number, number, number], thrustMagnitude: 0 };
    }
    const snap = orbitInsertSnapshot(s.position, s.velocity, body, resolved.velocity);
    if (snap.converged) {
      return { gear: 'N' as Gear, thrust: [0, 0, 0] as [number, number, number], thrustMagnitude: 0 };
    }
    return { direction: snap.facingDirection, attitudeMode: 'inertial' as AttitudeMode, thrust: [1, 0, 0] as [number, number, number], thrustMagnitude: snap.thrustMagnitude };
  }),
  toggleCruise: (nowMs) => {
    const s = useSpaceshipStore.getState();
    if (s.cruiseActive) {
      if (s.cruisePreviousTimeScale != null) {
        useExploreStore.getState().setTimeScale(s.cruisePreviousTimeScale);
      }
      useSpaceshipStore.setState({
        cruiseActive: false,
        cruisePhase: 'idle',
        cruiseNextJumpAtMs: null,
        cruisePreviousTimeScale: null,
      });
      return;
    }
    const cruiseTarget = resolveCurrentNavigationTarget(s.currentNavigationTarget, s.position, s.simulatedTime);
    if (!canEnableCruise(s.position, s.velocity, cruiseTarget)) return;
    if (s.gear === 'D' || s.gear === 'R') {
      useSpaceshipStore.getState().setGear('N');
    }

    const currentTimeScale = useExploreStore.getState().timeScale;
    useSpaceshipStore.setState({
      cruiseActive: true,
      cruisePhase: 'coasting',
      cruiseNextJumpAtMs: nowMs,
      cruisePreviousTimeScale: currentTimeScale,
      attitudeMode: 'rendezvous' as AttitudeMode,
    });
    useExploreStore.getState().setTimeScale(1);
  },
  updateCruise: (nowMs) => {
    const finishCruise = () => {
      const current = useSpaceshipStore.getState();
      if (current.cruisePreviousTimeScale != null) {
        useExploreStore.getState().setTimeScale(current.cruisePreviousTimeScale);
      }
      useSpaceshipStore.setState({
        cruiseActive: false,
        cruisePhase: 'idle',
        cruiseNextJumpAtMs: null,
        cruisePreviousTimeScale: null,
      });
    };
    const s = useSpaceshipStore.getState();
    if (!s.cruiseActive) return;
    const cruiseTarget = resolveCurrentNavigationTarget(s.currentNavigationTarget, s.position, s.simulatedTime);
    if (!cruiseTarget) {
      finishCruise();
      return;
    }
    if (s.gear === 'D' || s.gear === 'R') {
      finishCruise();
      return;
    }
    if (!s.orbitingBodyId) {
      finishCruise();
      return;
    }
    if (s.gear === 'T') return;
    const g = computeCruiseGuidance(s.position, s.velocity, cruiseTarget);
    if (!g.radialPositive) {
      finishCruise();
      return;
    }
    if (g.shouldBrake) {
      useSpaceshipStore.getState().setGear('P');
      finishCruise();
      return;
    }
    if (g.shouldCorrectTangential) {
      useSpaceshipStore.getState().setGear('T');
      return;
    }
    if (s.cruiseNextJumpAtMs != null && nowMs < s.cruiseNextJumpAtMs) return;
    const jumpSeconds = Math.min(
      computeCruiseJumpSeconds(g),
      s.currentNavigationStageIndex === 0 && s.navigationPlan?.rendezvous
        ? Math.max(0, (s.navigationPlan.rendezvous.rendezvousTime - s.simulatedTime) / 1000)
        : Infinity,
    );
    if (jumpSeconds < 60) return;
    useSpaceshipStore.getState().timeJump(s.simulatedTime + jumpSeconds * 1000);
    useSpaceshipStore.setState({ cruiseNextJumpAtMs: nowMs + 200 });
  },
  updateTangentialCorrectionGear: () => set(s => {
    if (s.gear !== 'T') return {};
    const tangential = directTangentialSpeedSnapshot(
      s.position,
      s.velocity,
      s.currentNavigationTarget,
      s.simulatedTime,
    );
    if (!tangential) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
        attitudeMode: (s.tangentialCorrectionPrevAttitude ?? s.attitudeMode) as AttitudeMode,
        tangentialCorrectionPrevAttitude: null,
      };
    }
    if (s.tangentialCorrectionSign != null && tangential.sign !== s.tangentialCorrectionSign) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
        attitudeMode: (s.tangentialCorrectionPrevAttitude ?? s.attitudeMode) as AttitudeMode,
        tangentialCorrectionPrevAttitude: null,
      };
    }
    return {
      direction: tangential.correctionDirection,
      attitudeMode: 'inertial' as AttitudeMode,
      thrust: [1, 0, 0] as [number, number, number],
      thrustMagnitude: tangentialCorrectionThrustMagnitude(tangential.tangentialAbs),
      tangentialCorrectionSign: tangential.sign,
      tangentialCorrectionLastAbs: tangential.tangentialAbs,
    };
  }),
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
    currentNavigationTarget: null as NavigationTarget | null,
    currentNavigationStageIndex: null as number | null,
    lastReplanTime: 0 as number,
    explosionPhase: 'none' as ExplosionPhase,
    gear: 'N' as Gear,
    tangentialCorrectionSign: null as number | null,
    tangentialCorrectionLastAbs: null as number | null,
    tangentialCorrectionPrevAttitude: null as AttitudeMode | null,
    parkInitialDirection: null as [number, number, number] | null,
    parkPhase: null as ParkPhase | null,
    cruiseActive: false,
    cruisePhase: 'idle' as CruisePhase,
    cruiseNextJumpAtMs: null as number | null,
    cruisePreviousTimeScale: null as number | null,
    totalDistanceKm: 0,
    maxSpeedKms: 0,
    sessionStartTime: Date.now(),
    crashBodyId: null as string | null,
    crashPosition: [0, 0, 0] as [number, number, number],
    crashBodyPosition: [0, 0, 0] as [number, number, number],
  })),
  yaw: (angle) => set(s => ({ direction: rotateYaw(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
  pitch: (angle) => set(s => ({ direction: rotatePitch(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
  yawDegrees: (angleDegrees) => set(s => ({
    direction: rotateYaw(s.direction, angleDegrees * DEG_TO_RAD),
    attitudeMode: 'inertial' as AttitudeMode,
  })),
  pitchDegrees: (angleDegrees) => set(s => ({
    direction: rotatePitch(s.direction, angleDegrees * DEG_TO_RAD),
    attitudeMode: 'inertial' as AttitudeMode,
  })),
  setAttitudeMode: (mode) => set({ attitudeMode: mode }),
  setNearestBodyId: (id) => set({ nearestBodyId: id }),
  setOrbitingBodyId: (id) => set({ orbitingBodyId: id }),
  setTargetBody: (id) => set(s => {
    if (id !== null) {
      const plan = planDirectRendezvousTransfer(s.position, s.velocity, id, s.simulatedTime);
      return {
        targetBodyId: id,
        navigationPlan: plan.rendezvous ? plan : null,
        currentNavigationTarget: plan.rendezvous
          ? { kind: 'rendezvous' as const, point: plan.rendezvous.point }
          : { kind: 'body' as const, bodyId: id },
        currentNavigationStageIndex: plan.rendezvous ? 0 : 2,
        lastReplanTime: s.simulatedTime,
      };
    }
    return {
      targetBodyId: null,
      navigationPlan: null,
      currentNavigationTarget: null,
      currentNavigationStageIndex: null,
      gear: s.gear === 'T' ? 'N' as Gear : s.gear,
      tangentialCorrectionSign: null,
      tangentialCorrectionLastAbs: null,
    };
  }),
  setNavigationPlan: (plan) => set({
    navigationPlan: plan,
    currentNavigationTarget: plan?.rendezvous
      ? { kind: 'rendezvous', point: plan.rendezvous.point }
      : null,
    currentNavigationStageIndex: plan?.rendezvous ? 0 : null,
  }),
  maybeCompleteRendezvous: () => {
    const s = useSpaceshipStore.getState();
    if (s.currentNavigationStageIndex == null || !s.currentNavigationTarget) return;
    const resolvedTarget = resolveCurrentNavigationTarget(s.currentNavigationTarget, s.position, s.simulatedTime);
    if (!resolvedTarget) return;
    const point = resolvedTarget.position;
    const distance = vectorLength([
      point[0] - s.position[0],
      point[1] - s.position[1],
      point[2] - s.position[2],
    ]);
    if (distance <= navigationTargetArrivalDistanceAU(s.currentNavigationTarget)) {
      if (s.currentNavigationStageIndex === 0) useSpaceshipStore.getState().setGear('P');
      const nextStageIndex = s.currentNavigationStageIndex + 1;
      const nextTarget = s.navigationPlan?.stages?.[nextStageIndex]?.target ?? null;
      useSpaceshipStore.setState({
        navigationPlan: s.currentNavigationStageIndex === 0 && s.navigationPlan
          ? { ...s.navigationPlan, rendezvous: undefined }
          : s.navigationPlan,
        currentNavigationTarget: nextTarget,
        currentNavigationStageIndex: nextTarget ? nextStageIndex : null,
      });
    }
  },
  maybeReplanRendezvous: () => {
    const s = useSpaceshipStore.getState();
    if (!s.navigationPlan?.rendezvous || !s.targetBodyId) return;
    if (s.orbitingBodyId === s.targetBodyId) return;
    if (s.simulatedTime < s.navigationPlan.rendezvous.rendezvousTime) return;
    useSpaceshipStore.getState().replanNavigation();
  },
  replanNavigation: () => {
    const s = useSpaceshipStore.getState();
    const destinationId = s.targetBodyId ?? s.navigationPlan?.destinationId;
    if (!destinationId) return;
    const plan = planDirectRendezvousTransfer(s.position, s.velocity, destinationId, s.simulatedTime);
    useSpaceshipStore.setState({
      navigationPlan: plan.rendezvous ? plan : null,
      currentNavigationTarget: plan.rendezvous
        ? { kind: 'rendezvous', point: plan.rendezvous.point }
        : { kind: 'body', bodyId: destinationId },
      currentNavigationStageIndex: plan.rendezvous ? 0 : 2,
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
    if (updated.targetBodyId && shouldReplanAfterTimeJump(updated.navigationPlan, targetTime)) {
      const plan = planDirectRendezvousTransfer(newShip.position, newShip.velocity, updated.targetBodyId, targetTime);
      if (plan.rendezvous) {
        useSpaceshipStore.setState({
          navigationPlan: plan,
          currentNavigationTarget: { kind: 'rendezvous', point: plan.rendezvous.point },
          currentNavigationStageIndex: 0,
        });
      }
    }
  },
}));
