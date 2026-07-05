import type { CelestialBodyTemplate, ScoringConfig } from '../types';

export interface OrbitalDatum {
  eccentricity: number;
  inclination: number;
  longitudeAscendingNode: number;
  argumentOfPeriapsis: number;
  meanAnomalyAtEpoch: number;
  epoch: number;
  axialTilt: number;
  rotationPeriod: number;
  rotationPhaseAtEpoch: number;
}

// ===== Unit System =====
// All distances in AU, all velocities in AU/s.
// Conversion constants for display only.

export const AU_TO_KM = 149597870.7;
export const AU_TO_M = AU_TO_KM * 1000;

// G in AU³/(kg·s²): G_SI / AU_TO_M³
const G_SI = 6.674e-11;
export const G_AU = G_SI / (AU_TO_M * AU_TO_M * AU_TO_M);

const SUN_MASS = 1.989e30;
export const MU_SUN_AU = G_AU * SUN_MASS;

// ===== Real Solar System Data (all distances in AU, velocities in AU/s) =====

export const REAL_DATA: Record<string, {
  mass: number;
  radius: number;
  semiMajorAxis?: number;
  orbitalSpeed?: number;
  parentId?: string;
  type: 'star' | 'planet' | 'moon';
  name: string;
  orbital?: OrbitalDatum;
}> = {
  sun: {
    name: '太阳', type: 'star', mass: SUN_MASS, radius: 696340 / AU_TO_KM,
    orbital: {
      eccentricity: 0, inclination: 0, longitudeAscendingNode: 0, argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0, epoch: 2451545.0,
      axialTilt: 0.1265,
      rotationPeriod: 2164320,
      rotationPhaseAtEpoch: 0,
    },
  },
  mercury: {
    name: '水星', type: 'planet', mass: 3.3011e23, radius: 2439.7 / AU_TO_KM,
    semiMajorAxis: 57910000 / AU_TO_KM, orbitalSpeed: 47.87 / AU_TO_KM,
    orbital: {
      eccentricity: 0.20563,
      inclination: 0.12226,
      longitudeAscendingNode: 0.84355,
      argumentOfPeriapsis: 0.50842,
      meanAnomalyAtEpoch: 3.05066,
      epoch: 2451545.0,
      axialTilt: 0.0005,
      rotationPeriod: 5067014,
      rotationPhaseAtEpoch: 0,
    },
  },
  venus: {
    name: '金星', type: 'planet', mass: 4.8675e24, radius: 6051.8 / AU_TO_KM,
    semiMajorAxis: 108200000 / AU_TO_KM, orbitalSpeed: 35.02 / AU_TO_KM,
    orbital: {
      eccentricity: 0.00677,
      inclination: 0.05925,
      longitudeAscendingNode: 1.33823,
      argumentOfPeriapsis: 0.95817,
      meanAnomalyAtEpoch: 0.87982,
      epoch: 2451545.0,
      axialTilt: 2.873,
      rotationPeriod: -20995200,
      rotationPhaseAtEpoch: 0,
    },
  },
  earth: {
    name: '地球', type: 'planet', mass: 5.9724e24, radius: 6371 / AU_TO_KM,
    semiMajorAxis: 149597870.7 / AU_TO_KM, orbitalSpeed: 29.78 / AU_TO_KM,
    orbital: {
      eccentricity: 0.01671,
      inclination: 0.0,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 1.79662,
      meanAnomalyAtEpoch: 6.24006,
      epoch: 2451545.0,
      axialTilt: 0.408,
      rotationPeriod: 86164,
      rotationPhaseAtEpoch: 0,
    },
  },
  mars: {
    name: '火星', type: 'planet', mass: 6.4171e23, radius: 3389.5 / AU_TO_KM,
    semiMajorAxis: 227900000 / AU_TO_KM, orbitalSpeed: 24.07 / AU_TO_KM,
    orbital: {
      eccentricity: 0.09340,
      inclination: 0.03229,
      longitudeAscendingNode: 0.86474,
      argumentOfPeriapsis: 4.99897,
      meanAnomalyAtEpoch: 0.33015,
      epoch: 2451545.0,
      axialTilt: 0.440,
      rotationPeriod: 88643,
      rotationPhaseAtEpoch: 0,
    },
  },
  jupiter: {
    name: '木星', type: 'planet', mass: 1.8982e27, radius: 69911 / AU_TO_KM,
    semiMajorAxis: 778600000 / AU_TO_KM, orbitalSpeed: 13.07 / AU_TO_KM,
    orbital: {
      eccentricity: 0.04839,
      inclination: 0.02278,
      longitudeAscendingNode: 1.75220,
      argumentOfPeriapsis: 4.77725,
      meanAnomalyAtEpoch: 0.35355,
      epoch: 2451545.0,
      axialTilt: 0.054,
      rotationPeriod: 35730,
      rotationPhaseAtEpoch: 0,
    },
  },
  saturn: {
    name: '土星', type: 'planet', mass: 5.6834e26, radius: 58232 / AU_TO_KM,
    semiMajorAxis: 1434000000 / AU_TO_KM, orbitalSpeed: 9.69 / AU_TO_KM,
    orbital: {
      eccentricity: 0.05386,
      inclination: 0.04343,
      longitudeAscendingNode: 1.97728,
      argumentOfPeriapsis: 5.90366,
      meanAnomalyAtEpoch: 0.83302,
      epoch: 2451545.0,
      axialTilt: 0.466,
      rotationPeriod: 38362,
      rotationPhaseAtEpoch: 0,
    },
  },
  uranus: {
    name: '天王星', type: 'planet', mass: 8.6810e25, radius: 25362 / AU_TO_KM,
    semiMajorAxis: 2871000000 / AU_TO_KM, orbitalSpeed: 6.81 / AU_TO_KM,
    orbital: {
      eccentricity: 0.04726,
      inclination: 0.01346,
      longitudeAscendingNode: 1.28995,
      argumentOfPeriapsis: 2.97336,
      meanAnomalyAtEpoch: 2.54806,
      epoch: 2451545.0,
      axialTilt: 1.707,
      rotationPeriod: -62064,
      rotationPhaseAtEpoch: 0,
    },
  },
  neptune: {
    name: '海王星', type: 'planet', mass: 1.0241e26, radius: 24622 / AU_TO_KM,
    semiMajorAxis: 4495000000 / AU_TO_KM, orbitalSpeed: 5.43 / AU_TO_KM,
    orbital: {
      eccentricity: 0.00859,
      inclination: 0.03091,
      longitudeAscendingNode: 2.29758,
      argumentOfPeriapsis: 0.77102,
      meanAnomalyAtEpoch: 4.39846,
      epoch: 2451545.0,
      axialTilt: 0.494,
      rotationPeriod: 57996,
      rotationPhaseAtEpoch: 0,
    },
  },
  moon: {
    name: '月球', type: 'moon', parentId: 'earth', mass: 7.342e22, radius: 1737.4 / AU_TO_KM,
    semiMajorAxis: 384400 / AU_TO_KM, orbitalSpeed: 1.022 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0549,
      inclination: 0.08980,
      longitudeAscendingNode: 2.1831,
      argumentOfPeriapsis: 5.5504,
      meanAnomalyAtEpoch: 2.3610,
      epoch: 2451545.0,
      axialTilt: 0.1,
      rotationPeriod: 2360585,
      rotationPhaseAtEpoch: 0,
    },
  },
  phobos: {
    name: '火卫一', type: 'moon', parentId: 'mars', mass: 1.0659e16, radius: 11.266 / AU_TO_KM,
    semiMajorAxis: 9376 / AU_TO_KM, orbitalSpeed: 2.138 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0151,
      inclination: 0.01745,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 27540,
      rotationPhaseAtEpoch: 0,
    },
  },
  deimos: {
    name: '火卫二', type: 'moon', parentId: 'mars', mass: 1.4762e15, radius: 6.2 / AU_TO_KM,
    semiMajorAxis: 23463 / AU_TO_KM, orbitalSpeed: 1.351 / AU_TO_KM,
    orbital: {
      eccentricity: 0.00033,
      inclination: 0.0208,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 109080,
      rotationPhaseAtEpoch: 0,
    },
  },
  io: {
    name: '木卫一', type: 'moon', parentId: 'jupiter', mass: 8.9319e22, radius: 1821.6 / AU_TO_KM,
    semiMajorAxis: 421700 / AU_TO_KM, orbitalSpeed: 17.334 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0041,
      inclination: 0.00041,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 152856,
      rotationPhaseAtEpoch: 0,
    },
  },
  europa: {
    name: '木卫二', type: 'moon', parentId: 'jupiter', mass: 4.7998e22, radius: 1560.8 / AU_TO_KM,
    semiMajorAxis: 671100 / AU_TO_KM, orbitalSpeed: 13.74 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0094,
      inclination: 0.00821,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 306822,
      rotationPhaseAtEpoch: 0,
    },
  },
  ganymede: {
    name: '木卫三', type: 'moon', parentId: 'jupiter', mass: 1.4819e23, radius: 2634.1 / AU_TO_KM,
    semiMajorAxis: 1070000 / AU_TO_KM, orbitalSpeed: 10.88 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0013,
      inclination: 0.00349,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 618169,
      rotationPhaseAtEpoch: 0,
    },
  },
  callisto: {
    name: '木卫四', type: 'moon', parentId: 'jupiter', mass: 1.0759e23, radius: 2410.3 / AU_TO_KM,
    semiMajorAxis: 1883000 / AU_TO_KM, orbitalSpeed: 8.204 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0074,
      inclination: 0.00489,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 1442200,
      rotationPhaseAtEpoch: 0,
    },
  },
  titan: {
    name: '土卫六', type: 'moon', parentId: 'saturn', mass: 1.3452e23, radius: 2574.7 / AU_TO_KM,
    semiMajorAxis: 1222000 / AU_TO_KM, orbitalSpeed: 5.57 / AU_TO_KM,
    orbital: {
      eccentricity: 0.0288,
      inclination: 0.00541,
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 1377800,
      rotationPhaseAtEpoch: 0,
    },
  },
};

export const SIMPLIFIED_RADII: Record<string, number> = {
  sun: 40,
  jupiter: 25,
  saturn: 22,
  uranus: 18,
  neptune: 18,
  earth: 14,
  venus: 13,
  mars: 11,
  mercury: 9,
};

export const CELESTIAL_TEMPLATES: CelestialBodyTemplate[] = [
  {
    id: 'sun',
    name: '太阳',
    type: 'star',
    mass: REAL_DATA.sun.mass,
    radius: SIMPLIFIED_RADII.sun,
    textureUrl: '/textures/sun.jpg',
  },
  {
    id: 'mercury',
    name: '水星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.mercury.mass,
    radius: SIMPLIFIED_RADII.mercury,
    textureUrl: '/textures/mercury.jpg',
    semiMajorAxis: REAL_DATA.mercury.semiMajorAxis,
    orbitalSpeed: REAL_DATA.mercury.orbitalSpeed,
  },
  {
    id: 'venus',
    name: '金星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.venus.mass,
    radius: SIMPLIFIED_RADII.venus,
    textureUrl: '/textures/venus.jpg',
    semiMajorAxis: REAL_DATA.venus.semiMajorAxis,
    orbitalSpeed: REAL_DATA.venus.orbitalSpeed,
  },
  {
    id: 'earth',
    name: '地球',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.earth.mass,
    radius: SIMPLIFIED_RADII.earth,
    textureUrl: '/textures/earth.jpg',
    semiMajorAxis: REAL_DATA.earth.semiMajorAxis,
    orbitalSpeed: REAL_DATA.earth.orbitalSpeed,
  },
  {
    id: 'mars',
    name: '火星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.mars.mass,
    radius: SIMPLIFIED_RADII.mars,
    textureUrl: '/textures/mars.jpg',
    semiMajorAxis: REAL_DATA.mars.semiMajorAxis,
    orbitalSpeed: REAL_DATA.mars.orbitalSpeed,
  },
  {
    id: 'jupiter',
    name: '木星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.jupiter.mass,
    radius: SIMPLIFIED_RADII.jupiter,
    textureUrl: '/textures/jupiter.jpg',
    semiMajorAxis: REAL_DATA.jupiter.semiMajorAxis,
    orbitalSpeed: REAL_DATA.jupiter.orbitalSpeed,
  },
  {
    id: 'saturn',
    name: '土星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.saturn.mass,
    radius: SIMPLIFIED_RADII.saturn,
    textureUrl: '/textures/saturn.jpg',
    semiMajorAxis: REAL_DATA.saturn.semiMajorAxis,
    orbitalSpeed: REAL_DATA.saturn.orbitalSpeed,
  },
  {
    id: 'uranus',
    name: '天王星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.uranus.mass,
    radius: SIMPLIFIED_RADII.uranus,
    textureUrl: '/textures/uranus.jpg',
    semiMajorAxis: REAL_DATA.uranus.semiMajorAxis,
    orbitalSpeed: REAL_DATA.uranus.orbitalSpeed,
  },
  {
    id: 'neptune',
    name: '海王星',
    type: 'planet',
    parentId: 'sun',
    mass: REAL_DATA.neptune.mass,
    radius: SIMPLIFIED_RADII.neptune,
    textureUrl: '/textures/neptune.jpg',
    semiMajorAxis: REAL_DATA.neptune.semiMajorAxis,
    orbitalSpeed: REAL_DATA.neptune.orbitalSpeed,
  },
];

export const PHYSICAL_CONSTANTS = {
  G: G_AU,
  sunMass: SUN_MASS,
  sunRadius: REAL_DATA.sun.radius,
  timeScale: 1e5,
  softeningFactor: 1e6 / AU_TO_M,
  collisionThreshold: 5e6 / AU_TO_M,
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
  referencePlaneColor: 0x000000,
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
  allowedErrorPercent: 25,
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

// Backward compatibility aliases
export const MU_SUN = MU_SUN_AU;

export const SPACECRAFT_DRAGON2 = {
  name: 'Crew Dragon 2',
  mass: 10500,
  length: 8.1,
  diameter: 4.0,
  collisionRadiusAU: 0,
  maxThrustAU: 6.3667e-8,
  defaultOrbit: {
    semiMajorAxis: 6771 / AU_TO_KM,
    eccentricity: 0,
    inclination: 0,
    raan: 0,
    argPeriapsis: 0,
    trueAnomaly: 0,
  },
};

export const SPACECRAFT_CONFIG = SPACECRAFT_DRAGON2;

export const NAVIGATION_CONFIG = {
  deviationCheckInterval: 5,
  deviationThresholdAU: 0.01,
  phaseCompletionThresholdAU: 0.02,
  rePlanCooldownSec: 30,
  thrustWindowMinDeg: 30,
  thrustWindowMaxDeg: 150,
  orbitCircularizationEcc: 0.01,
  approachDistanceAU: 0.1,
  arrivalDistanceAU: 0.05,
};
