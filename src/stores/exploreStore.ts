import { create } from 'zustand';

export interface ExploreState {
  simulatedTime: number;
  timeScale: number;
  isRunning: boolean;
  selectedBodyId: string | null;
  showTrails: boolean;
  trailLength: number;
  zoom: number;

  setSimulatedTime: (t: number) => void;
  setTimeScale: (s: number) => void;
  toggleRunning: () => void;
  setSelectedBodyId: (id: string | null) => void;
  setShowTrails: (show: boolean) => void;
  setTrailLength: (len: number) => void;
  setZoom: (z: number) => void;
  reset: () => void;
}

const initialState = {
  simulatedTime: Date.now(),
  timeScale: 1,
  isRunning: true,
  selectedBodyId: null,
  showTrails: true,
  trailLength: 0.3,
  zoom: 1,
};

export const useExploreStore = create<ExploreState>((set) => ({
  ...initialState,

  setSimulatedTime: (t) => set({ simulatedTime: t }),
  setTimeScale: (s) => set({ timeScale: s }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  setSelectedBodyId: (id) => set({ selectedBodyId: id }),
  setShowTrails: (show) => set({ showTrails: show }),
  setTrailLength: (len) => set({ trailLength: len }),
  setZoom: (z) => set({ zoom: z }),
  reset: () => set(initialState),
}));
