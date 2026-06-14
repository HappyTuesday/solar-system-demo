import { REAL_DATA } from './constants';

export interface AutoBuildStep {
  templateId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  rotationSpeed: number;
}

const ROTATION_SPEEDS: Record<string, number> = {
  sun: 0.1,
  mercury: 0.03,
  venus: 0.02,
  earth: 1.0,
  mars: 0.9,
  jupiter: 2.5,
  saturn: 2.0,
  uranus: 1.0,
  neptune: 0.8,
  moon: 0.05,
  phobos: 0.1,
  deimos: 0.1,
  io: 0.15,
  europa: 0.1,
  ganymede: 0.1,
  callisto: 0.08,
  titan: 0.08,
};

export function computeAutoBuildPlan(): AutoBuildStep[] {
  const plan: AutoBuildStep[] = [];

  plan.push({
    templateId: 'sun',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: REAL_DATA.sun.mass,
    rotationSpeed: ROTATION_SPEEDS.sun,
  });

  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const planetPositions: Record<string, [number, number, number]> = {};
  const planetVelocities: Record<string, [number, number, number]> = {};

  planetIds.forEach((id, i) => {
    const data = REAL_DATA[id];
    if (!data.semiMajorAxis || !data.orbitalSpeed) return;
    const angle = (i * Math.PI * 2) / 8;
    const x = data.semiMajorAxis * Math.cos(angle);
    const y = data.semiMajorAxis * Math.sin(angle);
    const vx = -data.orbitalSpeed * Math.sin(angle);
    const vy = data.orbitalSpeed * Math.cos(angle);

    planetPositions[id] = [x, y, 0];
    planetVelocities[id] = [vx, vy, 0];

    plan.push({
      templateId: id,
      position: [x, y, 0],
      velocity: [vx, vy, 0],
      mass: data.mass,
      rotationSpeed: ROTATION_SPEEDS[id] ?? 0,
    });
  });

  const moonIds = ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan'];
  const moonAngles: Record<string, number> = {
    moon: Math.PI / 6,
    phobos: Math.PI / 3,
    deimos: (Math.PI * 2) / 3,
    io: Math.PI / 4,
    europa: (Math.PI * 3) / 4,
    ganymede: (Math.PI * 5) / 4,
    callisto: (Math.PI * 7) / 4,
    titan: 0,
  };

  moonIds.forEach((id) => {
    const data = REAL_DATA[id];
    if (!data.semiMajorAxis || !data.orbitalSpeed || !data.parentId) return;
    const parentPos = planetPositions[data.parentId];
    const parentVel = planetVelocities[data.parentId];
    if (!parentPos) return;

    const angle = moonAngles[id] ?? Math.random() * Math.PI * 2;
    const dx = data.semiMajorAxis * Math.cos(angle);
    const dy = data.semiMajorAxis * Math.sin(angle);
    const dvx = -data.orbitalSpeed * Math.sin(angle);
    const dvy = data.orbitalSpeed * Math.cos(angle);

    plan.push({
      templateId: id,
      position: [parentPos[0] + dx, parentPos[1] + dy, 0],
      velocity: [(parentVel?.[0] ?? 0) + dvx, (parentVel?.[1] ?? 0) + dvy, 0],
      mass: data.mass,
      rotationSpeed: ROTATION_SPEEDS[id] ?? 0,
    });
  });

  return plan;
}

export const AUTO_BUILD_PLAN = computeAutoBuildPlan();
