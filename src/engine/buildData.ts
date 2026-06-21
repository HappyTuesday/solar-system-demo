import { REAL_DATA, PHYSICAL_CONSTANTS } from './constants';
import type { CelestialBodyTemplate, CelestialBodyId, CelestialBodyType } from '../types';

const G = PHYSICAL_CONSTANTS.G;
const MSUN = PHYSICAL_CONSTANTS.sunMass;

export interface BuildBodyData {
  id: CelestialBodyId;
  name: string;
  type: CelestialBodyType;
  mass: number;
  radius: number;
  semiMajorAxis: number;
  orbitalSpeed: number;
  displayRadius: number;
  displayOrbit: number;
  textureUrl: string;
  isAdjusted: true;
}

function computeOrbitalSpeed(semiMajorAxis: number): number {
  return Math.sqrt((G * MSUN) / semiMajorAxis);
}

const raw: Omit<BuildBodyData, 'orbitalSpeed' | 'isAdjusted'>[] = [
  {
    id: 'sun',
    name: '太阳',
    type: 'star',
    mass: REAL_DATA.sun.mass,
    radius: 5.0e9,
    semiMajorAxis: 0,
    displayRadius: 50,
    displayOrbit: 0,
    textureUrl: '/textures/sun.jpg',
  },
  {
    id: 'mercury',
    name: '水星',
    type: 'planet',
    mass: REAL_DATA.mercury.mass,
    radius: 1.0e9,
    semiMajorAxis: 1.00e10,
    displayRadius: 10,
    displayOrbit: 100,
    textureUrl: '/textures/mercury.jpg',
  },
  {
    id: 'venus',
    name: '金星',
    type: 'planet',
    mass: REAL_DATA.venus.mass,
    radius: 1.4e9,
    semiMajorAxis: 1.54e10,
    displayRadius: 14,
    displayOrbit: 154,
    textureUrl: '/textures/venus.jpg',
  },
  {
    id: 'earth',
    name: '地球',
    type: 'planet',
    mass: REAL_DATA.earth.mass,
    radius: 1.6e9,
    semiMajorAxis: 2.05e10,
    displayRadius: 16,
    displayOrbit: 205,
    textureUrl: '/textures/earth.jpg',
  },
  {
    id: 'mars',
    name: '火星',
    type: 'planet',
    mass: REAL_DATA.mars.mass,
    radius: 1.1e9,
    semiMajorAxis: 2.65e10,
    displayRadius: 11,
    displayOrbit: 265,
    textureUrl: '/textures/mars.jpg',
  },
  {
    id: 'jupiter',
    name: '木星',
    type: 'planet',
    mass: REAL_DATA.jupiter.mass,
    radius: 4.0e9,
    semiMajorAxis: 6.08e10,
    displayRadius: 40,
    displayOrbit: 608,
    textureUrl: '/textures/jupiter.jpg',
  },
  {
    id: 'saturn',
    name: '土星',
    type: 'planet',
    mass: REAL_DATA.saturn.mass,
    radius: 3.5e9,
    semiMajorAxis: 9.25e10,
    displayRadius: 35,
    displayOrbit: 925,
    textureUrl: '/textures/saturn.jpg',
  },
  {
    id: 'uranus',
    name: '天王星',
    type: 'planet',
    mass: REAL_DATA.uranus.mass,
    radius: 2.8e9,
    semiMajorAxis: 1.49e11,
    displayRadius: 28,
    displayOrbit: 1491,
    textureUrl: '/textures/uranus.jpg',
  },
  {
    id: 'neptune',
    name: '海王星',
    type: 'planet',
    mass: REAL_DATA.neptune.mass,
    radius: 2.6e9,
    semiMajorAxis: 2.00e11,
    displayRadius: 26,
    displayOrbit: 2000,
    textureUrl: '/textures/neptune.jpg',
  },
];

export const BUILD_DATA: Record<string, BuildBodyData> = {};
for (const item of raw) {
  BUILD_DATA[item.id] = {
    ...item,
    orbitalSpeed: item.semiMajorAxis > 0 ? computeOrbitalSpeed(item.semiMajorAxis) : 0,
    isAdjusted: true as const,
  };
}

export const BUILD_CELESTIAL_TEMPLATES: CelestialBodyTemplate[] = raw.map(item => ({
  id: item.id,
  name: item.name,
  type: item.type,
  parentId: item.type === 'planet' ? 'sun' : undefined,
  mass: item.mass,
  radius: item.displayRadius,
  textureUrl: item.textureUrl,
  semiMajorAxis: item.displayOrbit > 0 ? item.semiMajorAxis : undefined,
  orbitalSpeed: item.semiMajorAxis > 0 ? computeOrbitalSpeed(item.semiMajorAxis) : undefined,
}));
