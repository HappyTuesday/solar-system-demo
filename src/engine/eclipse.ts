import { REAL_DATA, MU_SUN_AU, G_AU } from './constants';
import { orbitalPeriod, meanAnomalyAtTime, solveKepler, trueAnomaly, stateVectors } from './orbital';

const MU_EARTH_AU = G_AU * REAL_DATA.earth.mass;

export type MoonPhaseName =
  | '新月' | '蛾眉月' | '上弦月' | '盈凸月'
  | '满月' | '亏凸月' | '下弦月' | '残月';

export interface MoonPhase {
  name: MoonPhaseName;
  angle: number;
  illumination: number;
}

export type EclipseType = 'none' | 'penumbral' | 'partial' | 'total';

export interface EclipseEvent {
  date: Date;
  type: EclipseType;
  peakJD: number;
}

export function getMoonPhase(
  sunDir: [number, number, number],
  earthToMoon: [number, number, number],
): MoonPhase {
  const lenSM = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
  const lenEM = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
  const dot = (sunDir[0] * earthToMoon[0] + sunDir[1] * earthToMoon[1] + sunDir[2] * earthToMoon[2]) / (lenSM * lenEM);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  const phases: { max: number; name: MoonPhaseName }[] = [
    { max: Math.PI / 8, name: '新月' },
    { max: 3 * Math.PI / 8, name: '蛾眉月' },
    { max: 5 * Math.PI / 8, name: '上弦月' },
    { max: 7 * Math.PI / 8, name: '盈凸月' },
    { max: 9 * Math.PI / 8, name: '满月' },
    { max: 11 * Math.PI / 8, name: '亏凸月' },
    { max: 13 * Math.PI / 8, name: '下弦月' },
    { max: 2 * Math.PI, name: '残月' },
  ];

  const name = phases.find(p => angle < p.max)?.name ?? '满月';
  const illumination = (1 - Math.cos(angle)) / 2;

  return { name, angle, illumination };
}

export function getEclipseType(
  sunDir: [number, number, number],
  earthToMoon: [number, number, number],
  moonDist: number,
): EclipseType {
  const lenSM = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
  const lenEM = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
  const dot = (sunDir[0] * earthToMoon[0] + sunDir[1] * earthToMoon[1] + sunDir[2] * earthToMoon[2]) / (lenSM * lenEM);

  if (dot < 0.9995) return 'none';

  const earthRadius = REAL_DATA.earth.radius;
  const sunRadius = REAL_DATA.sun.radius;
  const distSE = lenSM;
  const umbraAngle = Math.atan2(sunRadius - earthRadius, distSE);
  const moonOffsetAngle = Math.abs(Math.PI - Math.acos(dot));
  const shadowRadius = earthRadius * Math.sin(umbraAngle) * moonDist;

  if (moonOffsetAngle * moonDist < shadowRadius * 0.3) return 'total';
  if (moonOffsetAngle * moonDist < shadowRadius * 0.7) return 'partial';
  if (moonOffsetAngle * moonDist < shadowRadius * 1.2) return 'penumbral';
  return 'none';
}

export function predictEclipses(startJD: number, count: number): EclipseEvent[] {
  const events: EclipseEvent[] = [];
  const jdStep = 2 / 24;
  const maxJD = startJD + 400;
  const moonA = REAL_DATA.moon.semiMajorAxis!;
  const moonE = 0.0549;
  const moonI = 0.0898;
  const moonOmega = 2.183;
  const moonOmegaBar = 5.552;
  const moonEpoch = 2451545.0;

  for (let jd = startJD; jd < maxJD && events.length < count; jd += jdStep) {
    const earthData = REAL_DATA.earth;
    if (!earthData.orbital || !earthData.semiMajorAxis) continue;

    const earthPeriod = orbitalPeriod(earthData.semiMajorAxis, MU_SUN_AU);
    const earthM = meanAnomalyAtTime(earthData.orbital.meanAnomalyAtEpoch, earthPeriod, earthData.orbital.epoch, jd);
    const earthMmod = ((earthM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const earthE = solveKepler(earthMmod, earthData.orbital.eccentricity);
    const earthNu = trueAnomaly(earthE, earthData.orbital.eccentricity);
    const earthSV = stateVectors(earthData.semiMajorAxis, earthData.orbital.eccentricity, earthData.orbital.inclination, earthData.orbital.longitudeAscendingNode, earthData.orbital.argumentOfPeriapsis, earthNu, MU_SUN_AU);

    const moonPeriod = orbitalPeriod(moonA, MU_EARTH_AU);
    const moonM = meanAnomalyAtTime(0.529, moonPeriod, moonEpoch, jd);
    const moonMmod = ((moonM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const moonEVal = solveKepler(moonMmod, moonE);
    const moonNu = trueAnomaly(moonEVal, moonE);
    const moonSV = stateVectors(moonA, moonE, moonI, moonOmega, moonOmegaBar, moonNu, MU_EARTH_AU);

    const sunDir: [number, number, number] = [-earthSV.position[0], -earthSV.position[1], -earthSV.position[2]];
    const moonDist = Math.sqrt(moonSV.position[0] ** 2 + moonSV.position[1] ** 2 + moonSV.position[2] ** 2);

    const eclipseType = getEclipseType(sunDir, moonSV.position, moonDist);
    if (eclipseType !== 'none') {
      const lastEvent = events[events.length - 1];
      if (!lastEvent || jd - lastEvent.peakJD > 0.5) {
        events.push({
          date: new Date((jd - 2440587.5) * 86400000),
          type: eclipseType,
          peakJD: jd,
        });
      }
    }
  }

  return events;
}
