import { create } from 'zustand';
import type { UIState } from '../types';

interface UIStore extends UIState {
  setSelectedTool: (id: string | null) => void;
  setSelectedBodyIds: (ids: string[]) => void;
  toggleSupervision: () => void;
  setHint: (show: boolean) => void;
  setIsPlacing: (placing: boolean) => void;
  advanceHint: () => void;
  setShowScoreModal: (show: boolean) => void;
  setPreviewPosition: (pos: [number, number, number] | null) => void;
  setPreviewSpeed: (speed: number) => void;
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

  setSelectedTool: (id) => set({ selectedToolId: id, previewPosition: null, previewSpeed: 0 }),
  setSelectedBodyIds: (ids) => set({ selectedBodyIds: ids }),
  toggleSupervision: () => set(s => ({ supervisionMode: !s.supervisionMode })),
  setHint: (show) => set({ showHint: show }),
  setIsPlacing: (placing) => set({ isPlacing: placing }),
  advanceHint: () => set(s => ({ hintIndex: s.hintIndex + 1 })),
  setShowScoreModal: (show) => set({ showScoreModal: show }),
  setPreviewPosition: (pos) => set({ previewPosition: pos }),
  setPreviewSpeed: (speed) => set({ previewSpeed: speed }),
  resetUI: () => set({
    selectedToolId: null,
    selectedBodyIds: [],
    supervisionMode: false,
    showHint: false,
    isPlacing: false,
    hintIndex: 0,
    showScoreModal: false,
    previewPosition: null,
    previewSpeed: 0,
  }),
}));
