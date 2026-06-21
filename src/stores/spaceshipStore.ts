import { create } from 'zustand';
import type { SpaceshipState } from '../types';
import { createSpaceshipState } from '../engine/spaceship';

export interface SpaceshipStore extends SpaceshipState {
  isRunning: boolean;
  dashboardExpanded: boolean;
  simulatedTime: number;

  setForwardThrust: (v: number) => void;
  setLateralThrust: (v: number) => void;
  setVerticalThrust: (v: number) => void;
  setThrustMagnitude: (m: number) => void;
  setDirection: (d: [number, number, number]) => void;
  setExploded: () => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  updatePhysics: (pos: [number, number, number], vel: [number, number, number]) => void;
  setSimulatedTime: (t: number) => void;
  reset: () => void;
}

const initialSpaceship = createSpaceshipState();

const initialState = {
  ...initialSpaceship,
  isRunning: true,
  dashboardExpanded: true,
  simulatedTime: Date.now(),
};

export const useSpaceshipStore = create<SpaceshipStore>((set) => ({
  ...initialState,

  setForwardThrust: (v) => set(s => ({ thrust: [v, s.thrust[1], s.thrust[2]] })),
  setLateralThrust: (v) => set(s => ({ thrust: [s.thrust[0], v, s.thrust[2]] })),
  setVerticalThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.thrust[1], v] })),
  setThrustMagnitude: (m) => set({ thrustMagnitude: m }),
  setDirection: (d) => set({ direction: d }),
  setExploded: () => set({ exploded: true, isRunning: false }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  toggleDashboard: () => set(s => ({ dashboardExpanded: !s.dashboardExpanded })),
  updatePhysics: (pos, vel) => set({ position: pos, velocity: vel }),
  setSimulatedTime: (t) => set({ simulatedTime: t }),
  reset: () => set({
    ...createSpaceshipState(),
    isRunning: true,
  dashboardExpanded: true,
    simulatedTime: Date.now(),
  }),
}));
