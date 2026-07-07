import { create } from 'zustand';
import type { SpaceshipState, AttitudeMode } from '../types';
import { createSpaceshipState } from '../engine/orbitalInjection';
import type { NavigationPlan } from '../engine/navigation';
import { planDirectRendezvousTransfer } from '../engine/navigation';
import { AU_TO_KM } from '../engine/constants';
import { jumpSpaceshipState } from '../engine/timeJump';
import { parkBrakeSnapshot, parkBrakeThrustMagnitude, PARK_BRAKE_EPS_AU_PER_SEC } from '../engine/spaceship';

export type ExplosionPhase = 'none' | 'exploding' | 'complete';
export type Gear = 'D' | 'N' | 'R' | 'T' | 'P';

const DEG_TO_RAD = Math.PI / 180;
const TANGENTIAL_CORRECTION_EPS_AU_PER_SEC = 0.01 / AU_TO_KM;
const TANGENTIAL_CORRECTION_REFERENCE_AU_PER_SEC = 20 / AU_TO_KM;
const TANGENTIAL_CORRECTION_MAX_THRUST_MN = 20;
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
  lastReplanTime: number;

  explosionPhase: ExplosionPhase;
  gear: Gear;
  tangentialCorrectionSign: number | null;
  tangentialCorrectionLastAbs: number | null;
  parkInitialDirection: [number, number, number] | null;
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
  updateParkGear: () => void;
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
  plan: NavigationPlan | null,
): { sign: number; tangentialAbs: number; correctionDirection: [number, number, number] } | null {
  if (!plan?.rendezvous) return null;
  const toRendezvous: [number, number, number] = [
    plan.rendezvous.point[0] - position[0],
    plan.rendezvous.point[1] - position[1],
    plan.rendezvous.point[2] - position[2],
  ];
  const rendezvousDirection = vectorNormalize(toRendezvous);
  if (vectorLength(rendezvousDirection) < 1e-20) return null;

  const tangent = vectorNormalize([-rendezvousDirection[1], rendezvousDirection[0], 0]);
  if (vectorLength(tangent) < 1e-20) return null;

  const tangentialSpeed = vectorDot(velocity, tangent);
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
  const scaled = (tangentialAbs / TANGENTIAL_CORRECTION_REFERENCE_AU_PER_SEC) * TANGENTIAL_CORRECTION_MAX_THRUST_MN;
  return Math.max(
    TANGENTIAL_CORRECTION_MIN_THRUST_MN,
    Math.min(TANGENTIAL_CORRECTION_MAX_THRUST_MN, scaled),
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
  lastReplanTime: 0 as number,
  explosionPhase: 'none' as ExplosionPhase,
  gear: 'N' as Gear,
  tangentialCorrectionSign: null as number | null,
  tangentialCorrectionLastAbs: null as number | null,
  parkInitialDirection: null as [number, number, number] | null,
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
    if (g === 'P') {
      const speed = vectorLength(s.velocity);
      if (speed <= PARK_BRAKE_EPS_AU_PER_SEC) {
        return {
          gear: 'N' as Gear,
          thrust: [0, 0, 0] as [number, number, number],
          parkInitialDirection: null,
          tangentialCorrectionSign: null,
          tangentialCorrectionLastAbs: null,
        };
      }
      const initialDir = vectorNormalize(s.velocity);
      return {
        gear: 'P' as Gear,
        parkInitialDirection: initialDir,
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
      tangentialCorrectionSign: g === 'T' ? null : s.tangentialCorrectionSign,
      tangentialCorrectionLastAbs: g === 'T' ? null : s.tangentialCorrectionLastAbs,
      thrust: g === 'N' || g === 'T'
        ? [0, 0, 0] as [number, number, number]
        : [
          g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
          s.thrust[1],
          s.thrust[2],
        ] as [number, number, number],
    };
  }),
  updateParkGear: () => set(s => {
    if (s.gear !== 'P') return {};
    if (!s.parkInitialDirection) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
      };
    }
    const snap = parkBrakeSnapshot(s.velocity, s.parkInitialDirection);
    if (snap.reachedStop) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        parkInitialDirection: null,
      };
    }
    return {
      direction: snap.facingDirection,
      attitudeMode: 'inertial' as AttitudeMode,
      thrust: [-1, 0, 0] as [number, number, number],
      thrustMagnitude: snap.thrustMagnitude,
    };
  }),
  updateTangentialCorrectionGear: () => set(s => {
    if (s.gear !== 'T') return {};
    const tangential = directTangentialSpeedSnapshot(s.position, s.velocity, s.navigationPlan);
    if (!tangential) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
      };
    }
    if (s.tangentialCorrectionSign != null && tangential.sign !== s.tangentialCorrectionSign) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
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
    lastReplanTime: 0 as number,
    explosionPhase: 'none' as ExplosionPhase,
    gear: 'N' as Gear,
    tangentialCorrectionSign: null as number | null,
    tangentialCorrectionLastAbs: null as number | null,
    parkInitialDirection: null as [number, number, number] | null,
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
        lastReplanTime: s.simulatedTime,
      };
    }
    return {
      targetBodyId: null,
      navigationPlan: null,
      gear: s.gear === 'T' ? 'N' as Gear : s.gear,
      tangentialCorrectionSign: null,
      tangentialCorrectionLastAbs: null,
    };
  }),
  setNavigationPlan: (plan) => set({ navigationPlan: plan }),
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
        });
      }
    }
  },
}));
