import { create } from 'zustand';
import type { MoonPhase, EclipseType, EclipseEvent } from '../engine/eclipse';

interface EarthMoonState {
  simulatedTime: number;
  timeScale: number;
  isRunning: boolean;
  selectedBodyId: string | null;
  moonPhase: MoonPhase | null;
  eclipseType: EclipseType;
  eclipseDates: EclipseEvent[];

  setSimulatedTime: (t: number) => void;
  setTimeScale: (s: number) => void;
  toggleRunning: () => void;
  setSelectedBodyId: (id: string | null) => void;
  setMoonPhase: (p: MoonPhase) => void;
  setEclipseType: (t: EclipseType) => void;
  setEclipseDates: (d: EclipseEvent[]) => void;
  reset: () => void;
}

const initialState = {
  simulatedTime: Date.now(),
  timeScale: 3600,
  isRunning: true,
  selectedBodyId: null,
  moonPhase: null as MoonPhase | null,
  eclipseType: 'none' as EclipseType,
  eclipseDates: [] as EclipseEvent[],
};

export const useEarthMoonStore = create<EarthMoonState>((set) => ({
  ...initialState,

  setSimulatedTime: (t) => set({ simulatedTime: t }),
  setTimeScale: (s) => set({ timeScale: s }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  setSelectedBodyId: (id) => set({ selectedBodyId: id }),
  setMoonPhase: (p) => set({ moonPhase: p }),
  setEclipseType: (t) => set({ eclipseType: t }),
  setEclipseDates: (d) => set({ eclipseDates: d }),
  reset: () => set(initialState),
}));
