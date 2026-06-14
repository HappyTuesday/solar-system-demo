import type { CelestialBodyTemplate, ScoringConfig } from '../types';

// ===== Real Solar System Data =====

export const REAL_DATA: Record<string, {
  mass: number;
  radius: number;
  semiMajorAxis?: number;
  orbitalSpeed?: number;
  parentId?: string;
  type: 'star' | 'planet' | 'moon';
  name: string;
}> = {
  sun: { name: '太阳', type: 'star', mass: 1.989e30, radius: 6.9634e8 },
  mercury: { name: '水星', type: 'planet', mass: 3.3011e23, radius: 2.4397e6, semiMajorAxis: 5.791e10, orbitalSpeed: 47870 },
  venus: { name: '金星', type: 'planet', mass: 4.8675e24, radius: 6.0518e6, semiMajorAxis: 1.082e11, orbitalSpeed: 35020 },
  earth: { name: '地球', type: 'planet', mass: 5.9724e24, radius: 6.371e6, semiMajorAxis: 1.496e11, orbitalSpeed: 29780 },
  mars: { name: '火星', type: 'planet', mass: 6.4171e23, radius: 3.3895e6, semiMajorAxis: 2.279e11, orbitalSpeed: 24070 },
  jupiter: { name: '木星', type: 'planet', mass: 1.8982e27, radius: 6.9911e7, semiMajorAxis: 7.786e11, orbitalSpeed: 13070 },
  saturn: { name: '土星', type: 'planet', mass: 5.6834e26, radius: 5.8232e7, semiMajorAxis: 1.434e12, orbitalSpeed: 9690 },
  uranus: { name: '天王星', type: 'planet', mass: 8.6810e25, radius: 2.5362e7, semiMajorAxis: 2.871e12, orbitalSpeed: 6810 },
  neptune: { name: '海王星', type: 'planet', mass: 1.0241e26, radius: 2.4622e7, semiMajorAxis: 4.495e12, orbitalSpeed: 5430 },
  moon: { name: '月球', type: 'moon', parentId: 'earth', mass: 7.342e22, radius: 1.7374e6, semiMajorAxis: 3.844e8, orbitalSpeed: 1022 },
  io: { name: '木卫一', type: 'moon', parentId: 'jupiter', mass: 8.9319e22, radius: 1.8216e6, semiMajorAxis: 4.217e8, orbitalSpeed: 17334 },
  europa: { name: '木卫二', type: 'moon', parentId: 'jupiter', mass: 4.7998e22, radius: 1.5608e6, semiMajorAxis: 6.711e8, orbitalSpeed: 13740 },
  ganymede: { name: '木卫三', type: 'moon', parentId: 'jupiter', mass: 1.4819e23, radius: 2.6341e6, semiMajorAxis: 1.070e9, orbitalSpeed: 10880 },
  callisto: { name: '木卫四', type: 'moon', parentId: 'jupiter', mass: 1.0759e23, radius: 2.4103e6, semiMajorAxis: 1.883e9, orbitalSpeed: 8204 },
  titan: { name: '土卫六', type: 'moon', parentId: 'saturn', mass: 1.3452e23, radius: 2.5747e6, semiMajorAxis: 1.222e9, orbitalSpeed: 5570 },
  phobos: { name: '火卫一', type: 'moon', parentId: 'mars', mass: 1.0659e16, radius: 1.1266e4, semiMajorAxis: 9.376e6, orbitalSpeed: 2138 },
  deimos: { name: '火卫二', type: 'moon', parentId: 'mars', mass: 1.4762e15, radius: 6.2e3, semiMajorAxis: 2.3463e7, orbitalSpeed: 1351 },
};

export const CELESTIAL_TEMPLATES: CelestialBodyTemplate[] = [
  { id: 'sun', name: '太阳', type: 'star', mass: REAL_DATA.sun.mass, radius: REAL_DATA.sun.radius, textureUrl: '/textures/sun.jpg' },
  { id: 'mercury', name: '水星', type: 'planet', mass: REAL_DATA.mercury.mass, radius: REAL_DATA.mercury.radius, textureUrl: '/textures/mercury.jpg', semiMajorAxis: REAL_DATA.mercury.semiMajorAxis, orbitalSpeed: REAL_DATA.mercury.orbitalSpeed },
  { id: 'venus', name: '金星', type: 'planet', mass: REAL_DATA.venus.mass, radius: REAL_DATA.venus.radius, textureUrl: '/textures/venus.jpg', semiMajorAxis: REAL_DATA.venus.semiMajorAxis, orbitalSpeed: REAL_DATA.venus.orbitalSpeed },
  { id: 'earth', name: '地球', type: 'planet', mass: REAL_DATA.earth.mass, radius: REAL_DATA.earth.radius, textureUrl: '/textures/earth.jpg', semiMajorAxis: REAL_DATA.earth.semiMajorAxis, orbitalSpeed: REAL_DATA.earth.orbitalSpeed },
  { id: 'mars', name: '火星', type: 'planet', mass: REAL_DATA.mars.mass, radius: REAL_DATA.mars.radius, textureUrl: '/textures/mars.jpg', semiMajorAxis: REAL_DATA.mars.semiMajorAxis, orbitalSpeed: REAL_DATA.mars.orbitalSpeed },
  { id: 'jupiter', name: '木星', type: 'planet', mass: REAL_DATA.jupiter.mass, radius: REAL_DATA.jupiter.radius, textureUrl: '/textures/jupiter.jpg', semiMajorAxis: REAL_DATA.jupiter.semiMajorAxis, orbitalSpeed: REAL_DATA.jupiter.orbitalSpeed },
  { id: 'saturn', name: '土星', type: 'planet', mass: REAL_DATA.saturn.mass, radius: REAL_DATA.saturn.radius, textureUrl: '/textures/saturn.jpg', semiMajorAxis: REAL_DATA.saturn.semiMajorAxis, orbitalSpeed: REAL_DATA.saturn.orbitalSpeed },
  { id: 'uranus', name: '天王星', type: 'planet', mass: REAL_DATA.uranus.mass, radius: REAL_DATA.uranus.radius, textureUrl: '/textures/uranus.jpg', semiMajorAxis: REAL_DATA.uranus.semiMajorAxis, orbitalSpeed: REAL_DATA.uranus.orbitalSpeed },
  { id: 'neptune', name: '海王星', type: 'planet', mass: REAL_DATA.neptune.mass, radius: REAL_DATA.neptune.radius, textureUrl: '/textures/neptune.jpg', semiMajorAxis: REAL_DATA.neptune.semiMajorAxis, orbitalSpeed: REAL_DATA.neptune.orbitalSpeed },
  { id: 'moon', name: '月球', type: 'moon', parentId: 'earth', mass: REAL_DATA.moon.mass, radius: REAL_DATA.moon.radius, textureUrl: '/textures/moon.jpg', semiMajorAxis: REAL_DATA.moon.semiMajorAxis, orbitalSpeed: REAL_DATA.moon.orbitalSpeed },
  { id: 'phobos', name: '火卫一', type: 'moon', parentId: 'mars', mass: REAL_DATA.phobos.mass, radius: REAL_DATA.phobos.radius, textureUrl: '/textures/phobos.jpg', semiMajorAxis: REAL_DATA.phobos.semiMajorAxis, orbitalSpeed: REAL_DATA.phobos.orbitalSpeed },
  { id: 'deimos', name: '火卫二', type: 'moon', parentId: 'mars', mass: REAL_DATA.deimos.mass, radius: REAL_DATA.deimos.radius, textureUrl: '/textures/deimos.jpg', semiMajorAxis: REAL_DATA.deimos.semiMajorAxis, orbitalSpeed: REAL_DATA.deimos.orbitalSpeed },
  { id: 'io', name: '木卫一', type: 'moon', parentId: 'jupiter', mass: REAL_DATA.io.mass, radius: REAL_DATA.io.radius, textureUrl: '/textures/io.jpg', semiMajorAxis: REAL_DATA.io.semiMajorAxis, orbitalSpeed: REAL_DATA.io.orbitalSpeed },
  { id: 'europa', name: '木卫二', type: 'moon', parentId: 'jupiter', mass: REAL_DATA.europa.mass, radius: REAL_DATA.europa.radius, textureUrl: '/textures/europa.jpg', semiMajorAxis: REAL_DATA.europa.semiMajorAxis, orbitalSpeed: REAL_DATA.europa.orbitalSpeed },
  { id: 'ganymede', name: '木卫三', type: 'moon', parentId: 'jupiter', mass: REAL_DATA.ganymede.mass, radius: REAL_DATA.ganymede.radius, textureUrl: '/textures/ganymede.jpg', semiMajorAxis: REAL_DATA.ganymede.semiMajorAxis, orbitalSpeed: REAL_DATA.ganymede.orbitalSpeed },
  { id: 'callisto', name: '木卫四', type: 'moon', parentId: 'jupiter', mass: REAL_DATA.callisto.mass, radius: REAL_DATA.callisto.radius, textureUrl: '/textures/callisto.jpg', semiMajorAxis: REAL_DATA.callisto.semiMajorAxis, orbitalSpeed: REAL_DATA.callisto.orbitalSpeed },
  { id: 'titan', name: '土卫六', type: 'moon', parentId: 'saturn', mass: REAL_DATA.titan.mass, radius: REAL_DATA.titan.radius, textureUrl: '/textures/titan.jpg', semiMajorAxis: REAL_DATA.titan.semiMajorAxis, orbitalSpeed: REAL_DATA.titan.orbitalSpeed },
];

export const PHYSICAL_CONSTANTS = {
  G: 6.674e-11,
  sunMass: 1.989e30,
  sunRadius: 6.9634e8,
  timeScale: 1e5,
  softeningFactor: 1e6,
  collisionThreshold: 5e6,
};

export const SIM_CONFIG = {
  timeStep: 0.016,
  maxSubsteps: 200,
};

export const SPATIAL_TRANSFORM = {
  orbitLogA: 300,
  orbitLogB: 0.0115,
  sunRenderRadius: 50,
  planetLogBase: 1e6,
  planetScaleFactor: 12,
  minRenderRadius: 5,
  referencePlaneColor: 0x334466,
  referencePlaneOpacity: 0.3,
  maxOrbitRadius: 2000,
};

export const DRAG_CONFIG = {
  speedScale: 2e-6,
  maxSpeed: 200000,
  arrowColor: 0x00ff00,
  guideArrowColor: 0xffaa00,
};

export const SCORING_CONFIG: ScoringConfig = {
  allowedErrorPercent: 5,
  orbitRadiusWeight: 0.3,
  massWeight: 0.25,
  velocityWeight: 0.25,
  orderWeight: 0.2,
};

export const PLANET_ORDER: string[] = [
  'sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
];

export const HINT_ORDER: string[] = [
  'sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
  'moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan',
];

export const AUDIO_FILES = {
  place: '/sounds/place.mp3',
  complete: '/sounds/complete.mp3',
  collision: '/sounds/collision.mp3',
  click: '/sounds/click.mp3',
};
