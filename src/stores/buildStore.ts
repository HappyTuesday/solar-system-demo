import { create } from 'zustand';
import type { BuildState, CelestialBody } from '../types';
import { scoreBuild } from '../engine/scoring';
import { advanceSimulation as engineAdvanceSimulation } from '../engine/physics';
import { PHYSICAL_CONSTANTS } from '../engine/constants';

let instanceCounter = 0;

function generateId(): string {
  return `build-${Date.now()}-${++instanceCounter}`;
}

function generateBodyId(templateId: string): string {
  return `${templateId}-${Date.now()}-${++instanceCounter}`;
}

interface Command {
  type: 'place' | 'remove' | 'modifyMass';
  execute: () => void;
  undo: () => void;
}

interface BuildStore extends BuildState {
  timeScale: number;
  setTimeScale: (scale: number) => void;
  adjustTimeScale: (delta: number) => void;
  startBuild: () => void;
  pauseBuild: () => void;
  resumeBuild: () => void;
  completeBuild: () => { score: number; planetScores: Record<string, unknown> } | null;
  placeBody: (templateId: string, position: [number, number, number], velocity: [number, number, number], mass: number, rotationSpeed?: number, rotationPhase?: number) => void;
  removeBody: (instanceId: string) => void;
  modifyMass: (instanceId: string, mass: number) => void;
  modifyRotationSpeed: (instanceId: string, speed: number) => void;
  advanceSimulation: (dt: number, dimension?: 2 | 3) => void;
  resetBuild: () => void;
  loadSnapshot: (state: BuildState) => void;
  getSnapshot: () => BuildState;
  undoStack: Command[];
  redoStack: Command[];
  pushCommand: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  updateBuildElapsed: (elapsed: number) => void;
  setAutoBuilding: (v: boolean) => void;
  setAutoBuildProgress: (v: number) => void;
}

const initialState: BuildState = {
  id: generateId(),
  bodies: [],
  startedAt: null,
  completedAt: null,
  isRunning: false,
  simulatedTime: 0,
  buildElapsedMs: 0,
  hintIndex: 0,
  isAutoBuilding: false,
  autoBuildProgress: 0,
};

export const useBuildStore = create<BuildStore>((set, get) => ({
  ...initialState,
  timeScale: PHYSICAL_CONSTANTS.timeScale,

  setTimeScale: (scale) => set({ timeScale: Math.max(1e4, Math.min(1e6, scale)) }),

  adjustTimeScale: (delta) => {
    const next = get().timeScale + delta;
    set({ timeScale: Math.max(1e4, Math.min(1e6, next)) });
  },

  startBuild: () => set({ startedAt: Date.now(), isRunning: true }),

  pauseBuild: () => set({ isRunning: false }),

  resumeBuild: () => set({ isRunning: true }),

  completeBuild: () => {
    const state = get();
    if (!state.startedAt) return null;

    const completedAt = Date.now();
    const buildElapsedMs = completedAt - state.startedAt;
    const result = scoreBuild(state.bodies);

    set({ completedAt, buildElapsedMs, isRunning: false });
    return { score: result.totalScore, planetScores: result.planetScores };
  },

  placeBody: (templateId, position, velocity, mass, rotationSpeed, rotationPhase) => {
    const body: CelestialBody = {
      id: generateBodyId(templateId),
      templateId,
      position: [...position] as [number, number, number],
      velocity: [...velocity] as [number, number, number],
      mass,
      placedAt: Date.now(),
      rotationSpeed: rotationSpeed ?? 0,
      rotationPhase: rotationPhase ?? 0,
    };

    set(state => ({ bodies: [...state.bodies, body] }));

    get().pushCommand({
      type: 'place',
      execute: () => set(state => ({ bodies: [...state.bodies, body] })),
      undo: () => set(state => ({ bodies: state.bodies.filter(b => b.id !== body.id) })),
    });
  },

  removeBody: (instanceId) => {
    const state = get();
    const removed = state.bodies.find(b => b.id === instanceId);
    if (!removed) return;

    set(s => ({ bodies: s.bodies.filter(b => b.id !== instanceId) }));

    get().pushCommand({
      type: 'remove',
      execute: () => set(s => ({ bodies: s.bodies.filter(b => b.id !== instanceId) })),
      undo: () => set(s => ({ bodies: [...s.bodies, removed] })),
    });
  },

  modifyMass: (instanceId, mass) => {
    const state = get();
    const oldMass = state.bodies.find(b => b.id === instanceId)?.mass;
    if (oldMass === undefined) return;

    set(s => ({ bodies: s.bodies.map(b => (b.id === instanceId ? { ...b, mass } : b)) }));

    get().pushCommand({
      type: 'modifyMass',
      execute: () => set(s => ({ bodies: s.bodies.map(b => (b.id === instanceId ? { ...b, mass } : b)) })),
      undo: () => set(s => ({ bodies: s.bodies.map(b => (b.id === instanceId ? { ...b, mass: oldMass } : b)) })),
    });
  },

  modifyRotationSpeed: (instanceId, speed) => {
    set(s => ({ bodies: s.bodies.map(b => (b.id === instanceId ? { ...b, rotationSpeed: speed } : b)) }));
  },

  advanceSimulation: (dt, dimension = 2) => {
    const state = get();
    const bodies = state.bodies;
    const simDelta = engineAdvanceSimulation(bodies, dt, state.timeScale, dimension);
    set({ simulatedTime: state.simulatedTime + simDelta });
  },

  resetBuild: () => set({ ...initialState, id: generateId(), timeScale: PHYSICAL_CONSTANTS.timeScale }),

  loadSnapshot: (state) => set({ ...state }),

  getSnapshot: () => {
    const s = get();
    return {
      id: s.id,
      bodies: s.bodies.map(b => ({ ...b })),
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      isRunning: false,
      simulatedTime: s.simulatedTime,
      buildElapsedMs: s.buildElapsedMs,
      hintIndex: s.hintIndex,
      isAutoBuilding: s.isAutoBuilding,
      autoBuildProgress: s.autoBuildProgress,
    };
  },

  undoStack: [],
  redoStack: [],

  pushCommand: (cmd) => {
    set(state => ({
      undoStack: [...state.undoStack, cmd].slice(-50),
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get();
    const cmd = state.undoStack[state.undoStack.length - 1];
    if (!cmd) return;
    cmd.undo();
    set({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, cmd],
    });
  },

  redo: () => {
    const state = get();
    const cmd = state.redoStack[state.redoStack.length - 1];
    if (!cmd) return;
    cmd.execute();
    set({
      undoStack: [...state.undoStack, cmd],
      redoStack: state.redoStack.slice(0, -1),
    });
  },

  updateBuildElapsed: (elapsed) => set({ buildElapsedMs: elapsed }),

  setAutoBuilding: (v) => set({ isAutoBuilding: v, autoBuildProgress: v ? 0 : 0 }),

  setAutoBuildProgress: (v) => set({ autoBuildProgress: v }),
}));
