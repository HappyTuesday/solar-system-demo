// --- Celestial Body Template (toolbar definition) ---

export type CelestialBodyId = string;

export type CelestialBodyType = 'star' | 'planet' | 'moon';

export interface CelestialBodyTemplate {
  id: CelestialBodyId;
  name: string;
  type: CelestialBodyType;
  parentId?: CelestialBodyId;
  mass: number;
  radius: number;
  textureUrl: string;
  semiMajorAxis?: number;
  orbitalSpeed?: number;
}

// --- Runtime Celestial Body Instance ---

export interface CelestialBody {
  id: string;
  templateId: CelestialBodyId;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  placedAt: number;
  rotationSpeed: number;
  rotationPhase: number;
}

// --- Build State ---

export interface BuildState {
  id: string;
  bodies: CelestialBody[];
  startedAt: number | null;
  completedAt: number | null;
  isRunning: boolean;
  simulatedTime: number;
  buildElapsedMs: number;
  hintIndex: number;
  isAutoBuilding: boolean;
  autoBuildProgress: number;
}

// --- Build Record (persistence) ---

export type BuildStatus = 'building' | 'completed' | 'cancelled';

export interface BuildRecord {
  id: string;
  createdAt: number;
  completedAt: number | null;
  status: BuildStatus;
  score: number | null;
  buildTimeMs: number | null;
  snapshot: string;
}

// --- Scoring ---

export interface SingleScore {
  name: string;
  orbitRadiusScore: number;
  massScore: number;
  velocityScore: number;
  orderScore: number;
  total: number;
}

export interface ScoringResult {
  totalScore: number;
  planetScores: Record<string, SingleScore>;
}

export interface ScoringConfig {
  allowedErrorPercent: number;
  orbitRadiusWeight: number;
  massWeight: number;
  velocityWeight: number;
  orderWeight: number;
}

// --- UI State ---

export interface TrailDebugInfo {
  bodyId: string;
  templateId: string;
  writeIndex: number;
  activeCount: number;
  sourceRange: string;
  destRange: string;
}

export interface UIState {
  selectedToolId: CelestialBodyId | null;
  selectedBodyIds: string[];
  supervisionMode: boolean;
  showHint: boolean;
  isPlacing: boolean;
  hintIndex: number;
  showScoreModal: boolean;
  previewPosition: [number, number] | null;
  previewSpeed: number;
  mousePhysicalPos: [number, number] | null;
  showTrails: boolean;
  trailLength: number;
}

// --- Spaceship State ---

export type AttitudeMode =
  | 'inertial'
  | 'prograde'
  | 'heliocentric-tangential-prograde'
  | 'heliocentric-prograde'
  | 'heliocentric-retrograde'
  | 'nadir'
  | 'target'
  | 'rendezvous';

export interface SpaceshipState {
  position: [number, number, number];
  velocity: [number, number, number];
  direction: [number, number, number];
  thrust: [number, number, number];
  thrustMagnitude: number;
  exploded: boolean;
}
