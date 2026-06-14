import { create } from 'zustand';
import type { UIState } from '../types';

interface UIStore extends UIState {
  setSelectedTool: (id: string | null) => void;
  setSelectedBodyIds: (ids: string[]) => void;
  toggleSupervision: () => void;
  setObservationTargetId: (id: string | null) => void;
  setHint: (show: boolean) => void;
  setIsPlacing: (placing: boolean) => void;
  advanceHint: () => void;
  setShowScoreModal: (show: boolean) => void;
  setPreviewPosition: (pos: [number, number, number] | null) => void;
  setPreviewSpeed: (speed: number) => void;
  setMousePositions: (canvasPos: [number, number] | null, renderPos: [number, number, number] | null, physicalPos: [number, number, number] | null) => void;
  resetUI: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedToolId: null,
  selectedBodyIds: [],
  supervisionMode: false,
  observationTargetId: null,
  showHint: false,
  isPlacing: false,
  hintIndex: 0,
  showScoreModal: false,
  previewPosition: null,
  previewSpeed: 0,
  mouseCanvasPos: null,
  mouseRenderPos: null,
  mousePhysicalPos: null,

  setSelectedTool: (id) => set({ selectedToolId: id, previewPosition: null, previewSpeed: 0 }),
  setSelectedBodyIds: (ids) => set({ selectedBodyIds: ids }),
  toggleSupervision: () => set(s => ({ supervisionMode: !s.supervisionMode })),
  setObservationTargetId: (id) => set({ observationTargetId: id }),
  setHint: (show) => set({ showHint: show }),
  setIsPlacing: (placing) => set({ isPlacing: placing }),
  advanceHint: () => set(s => ({ hintIndex: s.hintIndex + 1 })),
  setShowScoreModal: (show) => set({ showScoreModal: show }),
  setPreviewPosition: (pos) => set({ previewPosition: pos }),
  setPreviewSpeed: (speed) => set({ previewSpeed: speed }),
  setMousePositions: (canvasPos, renderPos, physicalPos) => set({ mouseCanvasPos: canvasPos, mouseRenderPos: renderPos, mousePhysicalPos: physicalPos }),
  resetUI: () => set({
    selectedToolId: null,
    selectedBodyIds: [],
    supervisionMode: false,
    observationTargetId: null,
    showHint: false,
    isPlacing: false,
    hintIndex: 0,
    showScoreModal: false,
    previewPosition: null,
    previewSpeed: 0,
    mouseCanvasPos: null,
    mouseRenderPos: null,
    mousePhysicalPos: null,
  }),
}));
