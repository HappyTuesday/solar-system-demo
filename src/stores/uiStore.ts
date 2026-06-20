import { create } from 'zustand';
import type { UIState } from '../types';
import { setLinearScale, getLinearScale, getSizeMultiplier, setSizeMultiplier } from '../engine/coordinateTransform';

interface UIStore extends UIState {
  clickPosPhysical: [number, number] | null;
  setSelectedTool: (id: string | null) => void;
  setSelectedBodyIds: (ids: string[]) => void;
  toggleSupervision: () => void;
  setHint: (show: boolean) => void;
  setIsPlacing: (placing: boolean) => void;
  advanceHint: () => void;
  setShowScoreModal: (show: boolean) => void;
  setPreviewPosition: (pos: [number, number] | null) => void;
  setPreviewSpeed: (speed: number) => void;
  setMousePositions: (pos: [number, number] | null) => void;
  setClickPosPhysical: (pos: [number, number] | null) => void;
  setShowTrails: (show: boolean) => void;
  setTrailLength: (len: number) => void;
  linearScale: number;
  setLinearScaleValue: (v: number) => void;
  sizeMultiplier: number;
  setSizeMultiplierValue: (v: number) => void;
  resetUI: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedToolId: null,
  selectedBodyIds: [],
  supervisionMode: false,
  showHint: false,
  isPlacing: false,
  hintIndex: 0,
  showScoreModal: false,
  previewPosition: null,
  previewSpeed: 0,
  showTrails: true,
  trailLength: 0.5,
  linearScale: getLinearScale(),
  sizeMultiplier: getSizeMultiplier(),
  mousePhysicalPos: null,
  clickPosPhysical: null,

  setSelectedTool: (id) => set({ selectedToolId: id, previewPosition: null, previewSpeed: 0 }),
  setSelectedBodyIds: (ids) => set({ selectedBodyIds: ids }),
  toggleSupervision: () => set(s => ({ supervisionMode: !s.supervisionMode })),
  setHint: (show) => set({ showHint: show }),
  setIsPlacing: (placing) => set({ isPlacing: placing }),
  advanceHint: () => set(s => ({ hintIndex: s.hintIndex + 1 })),
  setShowScoreModal: (show) => set({ showScoreModal: show }),
  setPreviewPosition: (pos) => set({ previewPosition: pos }),
  setPreviewSpeed: (speed) => set({ previewSpeed: speed }),
  setShowTrails: (show) => set({ showTrails: show }),
  setTrailLength: (len) => set({ trailLength: len }),
  setLinearScaleValue: (v) => {
    setLinearScale(v);
    set({ linearScale: v });
  },
  setSizeMultiplierValue: (v) => {
    setSizeMultiplier(v);
    set({ sizeMultiplier: v });
  },
  setClickPosPhysical: (pos) => set({ clickPosPhysical: pos }),
  setMousePositions: (pos) => set({ mousePhysicalPos: pos }),
  resetUI: () => {
    set({
      selectedToolId: null,
      selectedBodyIds: [],
      supervisionMode: false,
      showHint: false,
      isPlacing: false,
      hintIndex: 0,
      showScoreModal: false,
      previewPosition: null,
      previewSpeed: 0,
      mousePhysicalPos: null,
      clickPosPhysical: null,
    });
  },
}));