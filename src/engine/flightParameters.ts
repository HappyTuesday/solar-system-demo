import { AU_TO_KM, G_AU, MU_SUN_AU, NAVIGATION_CONFIG, REAL_DATA } from './constants';
import {
  computeBodyState,
  computeEccentricity,
  computeOrbitalSemiMajorAxis,
  getOrbitingBodyId,
  getPhaseAngleDeg,
} from './navigation';
import { julianDate } from './orbital';

type Direction3 = [number, number, number];

export interface FlightParameterInput {
  shipPosition: Direction3;
  shipVelocity: Direction3;
  destinationId: string;
  simulatedTime: number;
  thrustMagnitude: number;
}

export interface FlightParameterRow {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}

interface OrbitalDebugState {
  r: number;
  aHelio: number;
  ecc: number;
  speedKms: number;
  orbitingId: string;
  energy: number;
  orbitType: 'bound' | 'parabolic' | 'hyperbolic';
  relEnergy: number | null;
  hasEscapeVelocity: boolean;
  radialSpeedKms: number;
  tangentialSpeedKms: number;
  flightPathAngleDeg: number;
  apoapsis: number;
  periapsis: number;
}

function computeOrbitalDebug(input: FlightParameterInput): OrbitalDebugState {
  const { shipPosition, shipVelocity, simulatedTime } = input;
  const r = Math.sqrt(shipPosition[0] ** 2 + shipPosition[1] ** 2 + shipPosition[2] ** 2);
  const v2 = shipVelocity[0] ** 2 + shipVelocity[1] ** 2 + shipVelocity[2] ** 2;
  const aHelio = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN_AU);
  const ecc = computeEccentricity(shipPosition, shipVelocity, MU_SUN_AU);
  const speedAUs = Math.sqrt(v2);
  const speedKms = speedAUs * AU_TO_KM;
  const orbitingId = getOrbitingBodyId(shipPosition, simulatedTime);
  const energy = v2 / 2 - MU_SUN_AU / r;
  const orbitType: OrbitalDebugState['orbitType'] = energy < -1e-20
    ? 'bound'
    : energy > 1e-20
      ? 'hyperbolic'
      : 'parabolic';

  let relEnergy: number | null = null;
  let hasEscapeVelocity = false;
  if (orbitingId !== 'sun') {
    const orbitingData = REAL_DATA[orbitingId];
    if (orbitingData) {
      const bodyState = computeBodyState(orbitingId, julianDate(simulatedTime));
      if (bodyState) {
        const drx = shipPosition[0] - bodyState.position[0];
        const dry = shipPosition[1] - bodyState.position[1];
        const drz = shipPosition[2] - bodyState.position[2];
        const dvx = shipVelocity[0] - bodyState.velocity[0];
        const dvy = shipVelocity[1] - bodyState.velocity[1];
        const dvz = shipVelocity[2] - bodyState.velocity[2];
        const rRel = Math.sqrt(drx * drx + dry * dry + drz * drz);
        const vRel2 = dvx * dvx + dvy * dvy + dvz * dvz;
        relEnergy = vRel2 / 2 - G_AU * orbitingData.mass / rRel;
        hasEscapeVelocity = relEnergy > 0;
      }
    }
  }

  const radialSpeed = r > 0
    ? (shipPosition[0] * shipVelocity[0] + shipPosition[1] * shipVelocity[1] + shipPosition[2] * shipVelocity[2]) / r
    : 0;
  const radialSpeedKms = radialSpeed * AU_TO_KM;
  const crossX = shipPosition[1] * shipVelocity[2] - shipPosition[2] * shipVelocity[1];
  const crossY = shipPosition[2] * shipVelocity[0] - shipPosition[0] * shipVelocity[2];
  const crossZ = shipPosition[0] * shipVelocity[1] - shipPosition[1] * shipVelocity[0];
  const tangentialSpeed = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / r;
  const tangentialSpeedKms = tangentialSpeed * AU_TO_KM;
  const flightPathAngleDeg = Math.atan2(radialSpeed, tangentialSpeed) * 180 / Math.PI;
  const apoapsis = ecc < 1 ? aHelio * (1 + ecc) : Infinity;
  const periapsis = ecc < 1 ? aHelio * (1 - ecc) : aHelio * (ecc - 1);

  return {
    r,
    aHelio,
    ecc,
    speedKms,
    orbitingId,
    energy,
    orbitType,
    relEnergy,
    hasEscapeVelocity,
    radialSpeedKms,
    tangentialSpeedKms,
    flightPathAngleDeg,
    apoapsis,
    periapsis,
  };
}

function computeDistanceToDestination(input: FlightParameterInput): number | null {
  const destState = computeBodyState(input.destinationId, julianDate(input.simulatedTime));
  if (!destState) return null;
  const dx = destState.position[0] - input.shipPosition[0];
  const dy = destState.position[1] - input.shipPosition[1];
  const dz = destState.position[2] - input.shipPosition[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeFlightParameterRows(input: FlightParameterInput): FlightParameterRow[] {
  const orb = computeOrbitalDebug(input);
  const distToDest = computeDistanceToDestination(input);
  const phaseAngleDeg = getPhaseAngleDeg(input.shipPosition, input.simulatedTime);

  return [
    { label: '环绕天体', value: orb.orbitingId, highlight: orb.orbitingId !== 'sun' },
    { label: '推力', value: input.thrustMagnitude > 0 ? `${input.thrustMagnitude} MN` : '0', warn: input.thrustMagnitude === 0 },
    {
      label: '轨道类型',
      value: orb.orbitType === 'bound' ? '椭圆' : orb.orbitType === 'parabolic' ? '抛物线' : '双曲线',
      highlight: orb.orbitType === 'bound',
      warn: orb.orbitType === 'hyperbolic',
    },
    { label: '日心半长轴', value: `${orb.aHelio.toFixed(4)} AU`, highlight: true },
    { label: '偏心率', value: `${orb.ecc.toFixed(4)}`, highlight: orb.ecc < 0.01 },
    { label: '日心距(r)', value: `${orb.r.toFixed(4)} AU` },
    { label: '日心速度', value: `${orb.speedKms.toFixed(2)} km/s`, highlight: true },
    { label: '能量', value: `${orb.energy.toExponential(3)}`, highlight: true },
    { label: '航迹角', value: `${orb.flightPathAngleDeg.toFixed(2)}°` },
    { label: '径向/切向速度', value: `${orb.radialSpeedKms.toFixed(1)} / ${orb.tangentialSpeedKms.toFixed(1)} km/s` },
    { label: '远日点', value: orb.apoapsis === Infinity ? '∞' : `${orb.apoapsis.toFixed(4)} AU` },
    { label: '近日点', value: `${orb.periapsis.toFixed(4)} AU` },
    {
      label: '逃逸速度',
      value: orb.relEnergy != null
        ? `${orb.hasEscapeVelocity ? '已达成' : '未达成'} (ε=${orb.relEnergy.toExponential(2)})`
        : '--',
      highlight: orb.hasEscapeVelocity,
      warn: orb.orbitingId !== 'sun' && !orb.hasEscapeVelocity,
    },
    { label: '相位角', value: phaseAngleDeg != null ? `${phaseAngleDeg.toFixed(2)}°` : '-- (已脱离行星)' },
    { label: '距目标天体', value: distToDest != null ? `${distToDest.toFixed(4)} AU` : '--' },
    { label: '阈值(半长轴)', value: `${NAVIGATION_CONFIG.phaseCompletionThresholdAU} AU` },
    { label: '阈值(接近)', value: `${NAVIGATION_CONFIG.approachDistanceAU} AU` },
    { label: '阈值(到达)', value: `${NAVIGATION_CONFIG.arrivalDistanceAU} AU` },
    { label: '阈值(偏心率)', value: `${NAVIGATION_CONFIG.orbitCircularizationEcc}` },
  ];
}
