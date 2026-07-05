import {
  computeBodyState,
  computeLiveNavigationGuidance,
  computeEccentricity,
  computeOrbitalSemiMajorAxis,
  getOrbitingBodyId,
  getPhaseAngleDeg,
  type GuidanceMetric,
  type LiveNavigationGuidanceInput,
  type PhaseGuidance,
} from './navigation';
import { AU_TO_KM, G_AU, MU_SUN_AU, REAL_DATA } from './constants';
import { julianDate } from './orbital';

export type DirectiveAction =
  | 'wait'
  | 'turn'
  | 'ignite'
  | 'cutoff'
  | 'coast'
  | 'capture'
  | 'circularize'
  | 'arrived';

export interface NavigationCondition {
  label: string;
  current: number;
  target: number;
  unit: string;
  satisfied: boolean;
}

export interface NavigationDirective {
  action: DirectiveAction;
  title: string;
  actionText: string;
  target: string;
  reason: string;
  condition: NavigationCondition;
  metrics: GuidanceMetric[];
  progress: number;
  completed: boolean;
  shouldThrust: boolean;
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  attitudeMode: 'prograde' | 'inertial';
  desiredDirection?: [number, number, number];
  desiredDirectionLabel?: string;
  recommendedGear: 'D' | 'N' | 'R';
  recommendedThrustMagnitude: number;
  suggestedTimeScale: number;
  sourceGuidance: PhaseGuidance;
}

export type MarsMissionDirectiveInput = Omit<LiveNavigationGuidanceInput, 'destinationId'>;

type Direction3 = [number, number, number];

const EARTH_DEPARTURE_THRUST_MN = 0.2;
const EARTH_OVERBURN_CORRECTION_THRUST_MN = 0.2;
const MARS_MIDCOURSE_THRUST_MN = 0.5;
const MARS_FAR_BRAKE_THRUST_MN = 100;
const MARS_FAR_APPROACH_THRUST_MN = 35;
const MARS_FAR_APPROACH_MAX_AU = 0.15;
const MARS_MIDCOURSE_TARGET_CLOSEST_AU = MARS_FAR_APPROACH_MAX_AU * 0.2;
const MARS_TRANSFER_ENERGY_RESTORE_THRUST_MN = 0.2;
const EARTH_STABLE_ESCAPE_SPEED_KMS = 12.5;
const EARTH_STABLE_ESCAPE_HILL_FRACTION = 0.03;
const EARTH_DEPARTURE_PHASE_MIN_DEG = 80;
const EARTH_DEPARTURE_PHASE_MAX_DEG = 100;
const EARTH_DEPARTURE_ENERGY_CUTOFF_FRACTION = 0.82;

function vectorLength(v: Direction3): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vectorNormalize(v: Direction3): Direction3 {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vectorDot(a: Direction3, b: Direction3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angleDeg(a: Direction3, b: Direction3): number {
  const al = vectorLength(a);
  const bl = vectorLength(b);
  if (al < 1e-20 || bl < 1e-20) return 0;
  const cos = vectorDot(a, b) / (al * bl);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

function marsOrbitCoveredByHeliocentricOrbit(position: Direction3, velocity: Direction3): boolean {
  const marsA = REAL_DATA.mars.semiMajorAxis;
  if (!marsA) return false;
  const semiMajorAxis = computeOrbitalSemiMajorAxis(position, velocity, MU_SUN_AU);
  const eccentricity = computeEccentricity(position, velocity, MU_SUN_AU);
  if (!Number.isFinite(semiMajorAxis) || !Number.isFinite(eccentricity) || eccentricity >= 1) return false;

  const periapsis = semiMajorAxis * (1 - eccentricity);
  const apoapsis = semiMajorAxis * (1 + eccentricity);
  return marsA >= periapsis - 0.03 && marsA <= apoapsis + 0.03;
}

function computeHeliocentricTransfer(position: Direction3, velocity: Direction3) {
  const marsA = REAL_DATA.mars.semiMajorAxis;
  if (!marsA) return null;

  const semiMajorAxis = computeOrbitalSemiMajorAxis(position, velocity, MU_SUN_AU);
  const eccentricity = computeEccentricity(position, velocity, MU_SUN_AU);
  const periapsis = eccentricity < 1
    ? semiMajorAxis * (1 - eccentricity)
    : semiMajorAxis * (eccentricity - 1);
  const apoapsis = eccentricity < 1 ? semiMajorAxis * (1 + eccentricity) : Infinity;
  const overburned = !Number.isFinite(semiMajorAxis)
    || !Number.isFinite(eccentricity)
    || eccentricity >= 1
    || apoapsis > marsA + 0.35;

  return {
    semiMajorAxis,
    eccentricity,
    periapsis,
    apoapsis,
    marsA,
    overburned,
  };
}

function computeEarthRelativeState(input: MarsMissionDirectiveInput) {
  const earthState = computeBodyState('earth', julianDate(input.simulatedTime));
  if (!earthState) return null;

  const relativePosition: Direction3 = [
    input.shipPosition[0] - earthState.position[0],
    input.shipPosition[1] - earthState.position[1],
    input.shipPosition[2] - earthState.position[2],
  ];
  const relativeVelocity: Direction3 = [
    input.shipVelocity[0] - earthState.velocity[0],
    input.shipVelocity[1] - earthState.velocity[1],
    input.shipVelocity[2] - earthState.velocity[2],
  ];
  const distance = vectorLength(relativePosition);
  const speed = vectorLength(relativeVelocity);
  const muEarth = G_AU * REAL_DATA.earth.mass;
  const energy = speed * speed / 2 - muEarth / distance;
  const hillRadius = REAL_DATA.earth.semiMajorAxis!
    * Math.pow(REAL_DATA.earth.mass / (3 * REAL_DATA.sun.mass), 1 / 3);

  return {
    relativePosition,
    relativeVelocity,
    distance,
    speed,
    energy,
    escaped: energy > 0,
    hillRadius,
    prograde: vectorNormalize(relativeVelocity),
    heliocentricPrograde: vectorNormalize(earthState.velocity),
  };
}

function heliocentricTangentialPrograde(position: Direction3): Direction3 {
  const tangential: Direction3 = [-position[1], position[0], 0];
  return vectorNormalize(tangential);
}

function earthMarsTransferVInf(): number {
  const earthA = REAL_DATA.earth.semiMajorAxis;
  const marsA = REAL_DATA.mars.semiMajorAxis;
  if (!earthA || !marsA) return 0;

  const transferA = (earthA + marsA) / 2;
  const earthCircularSpeed = Math.sqrt(MU_SUN_AU / earthA);
  const transferPeriapsisSpeed = Math.sqrt(MU_SUN_AU * (2 / earthA - 1 / transferA));
  return Math.max(0, transferPeriapsisSpeed - earthCircularSpeed);
}

function earthDepartureDirective(input: MarsMissionDirectiveInput): NavigationDirective | null {
  const orbitingBodyId = getOrbitingBodyId(input.shipPosition, input.simulatedTime);
  const earthRel = computeEarthRelativeState(input);
  if (!earthRel) return null;

  const nearEarthDeparture = orbitingBodyId === 'earth' || earthRel.distance < earthRel.hillRadius * 1.2;
  if (!nearEarthDeparture) return null;

  const coversMars = marsOrbitCoveredByHeliocentricOrbit(input.shipPosition, input.shipVelocity);
  const heliocentricTransfer = computeHeliocentricTransfer(input.shipPosition, input.shipVelocity);
  const targetVInf = earthMarsTransferVInf();
  const targetDepartureEnergy = targetVInf * targetVInf / 2;
  const departureEnergyReady = earthRel.energy >= targetDepartureEnergy * EARTH_DEPARTURE_ENERGY_CUTOFF_FRACTION;
  const stableDepartureDistance = earthRel.distance >= earthRel.hillRadius * EARTH_STABLE_ESCAPE_HILL_FRACTION;
  const severeDepartureEnergyOverburned = earthRel.energy > targetDepartureEnergy * 10 && targetDepartureEnergy > 0;
  const heliocentricApoapsisOverTarget = heliocentricTransfer != null
    && Number.isFinite(heliocentricTransfer.apoapsis)
    && heliocentricTransfer.apoapsis > heliocentricTransfer.marsA + 0.15;
  const departureOverburned = earthRel.escaped
    && heliocentricTransfer?.overburned === true
    && (stableDepartureDistance || severeDepartureEnergyOverburned);
  const shouldPauseOverProjectedDeparture = input.thrustMagnitude > 0
    && coversMars
    && !earthRel.escaped
    && heliocentricApoapsisOverTarget;
  if (departureEnergyReady && coversMars && !departureOverburned) {
    const metrics: GuidanceMetric[] = [
      {
        label: '地球相对v∞能量',
        current: earthRel.energy,
        target: targetDepartureEnergy,
        unit: 'AU²/s²',
        highlight: true,
      },
      {
        label: '日心远日点覆盖',
        current: 1,
        target: 1,
        unit: '',
        highlight: true,
      },
      {
        label: '相对速度',
        current: earthRel.speed * AU_TO_KM,
        target: Math.sqrt(2 * (G_AU * REAL_DATA.earth.mass / Math.max(earthRel.distance, 1e-20) + targetDepartureEnergy)) * AU_TO_KM,
        unit: 'km/s',
        highlight: true,
      },
    ];
    const shouldCutoff = input.thrustMagnitude > 0;
    const title = shouldCutoff ? '转移轨道已建立：熄火' : '转移轨道滑行';
    const actionText = shouldCutoff
      ? '已经获得地球逃逸能量且转移轨道覆盖火星轨道，切到N档停止出发燃烧'
      : '保持空档沿转移轨道滑行，等待下一轮实时导航接近火星';

    return {
      action: shouldCutoff ? 'cutoff' : 'coast',
      title,
      actionText,
      target: '火星转移轨道',
      reason: shouldCutoff
        ? '出发燃烧目标已经达成，继续点火会放大转移轨道误差'
        : '飞船刚离开地球离场区，火星远距离接近控制尚不应接管',
      condition: {
        label: '日心远日点覆盖',
        current: 1,
        target: 1,
        unit: '',
        satisfied: true,
      },
      metrics,
      progress: 70,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: shouldCutoff ? 1 : 100000,
      sourceGuidance: {
        title,
        actionText,
        metrics,
        progress: 70,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }
  if (shouldPauseOverProjectedDeparture && heliocentricTransfer) {
    const metrics: GuidanceMetric[] = [
      {
        label: '日心远日点',
        current: heliocentricTransfer.apoapsis,
        target: heliocentricTransfer.marsA,
        unit: 'AU',
        warn: true,
      },
      {
        label: '地球相对能量',
        current: earthRel.energy,
        target: targetDepartureEnergy,
        unit: 'AU²/s²',
        highlight: departureEnergyReady,
      },
      {
        label: '相对速度',
        current: earthRel.speed * AU_TO_KM,
        target: Math.sqrt(2 * (G_AU * REAL_DATA.earth.mass / Math.max(earthRel.distance, 1e-20) + targetDepartureEnergy)) * AU_TO_KM,
        unit: 'km/s',
        highlight: true,
      },
    ];

    return {
      action: 'cutoff',
      title: '地球出发过量趋势：熄火重算',
      actionText: '当前日心远日点已明显超过火星轨道，先切到N档停止顺行点火，等待下一轮导航重新评估',
      target: '火星转移轨道',
      reason: '虽然飞船仍在地球离场区内，但继续顺行燃烧会扩大过量误差；先熄火，再按实时状态补救',
      condition: {
        label: '日心远日点',
        current: heliocentricTransfer.apoapsis,
        target: heliocentricTransfer.marsA,
        unit: 'AU',
        satisfied: false,
      },
      metrics,
      progress: 55,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: '地球出发过量趋势：熄火重算',
        actionText: '当前日心远日点已明显超过火星轨道，先切到N档停止顺行点火，等待下一轮导航重新评估',
        metrics,
        progress: 55,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }
  if (departureOverburned && heliocentricTransfer) {
    const desiredDirection = vectorNormalize([
      -input.shipVelocity[0],
      -input.shipVelocity[1],
      -input.shipVelocity[2],
    ]);
    const noseAngle = angleDeg(input.shipDirection, desiredDirection);
    const metrics: GuidanceMetric[] = [
      {
        label: '日心偏心率',
        current: heliocentricTransfer.eccentricity,
        target: 0.99,
        unit: '',
        warn: heliocentricTransfer.eccentricity >= 1,
      },
      {
        label: '日心远日点',
        current: heliocentricTransfer.apoapsis,
        target: heliocentricTransfer.marsA,
        unit: 'AU',
        warn: true,
      },
      {
        label: '地球相对速度',
        current: earthRel.speed * AU_TO_KM,
        target: 11.2,
        unit: 'km/s',
        warn: true,
      },
    ];

    if (input.thrustMagnitude > 0 && noseAngle > 6) {
      return {
        action: 'cutoff',
        title: '地球出发过燃：先熄火',
        actionText: '当前出发燃烧已经过量，先切到N档并清零推力，避免继续放大轨道误差',
        target: '地球出发过燃修正',
        reason: '飞船已经逃逸地球，但日心轨道过量或接近双曲线，不能继续顺行补燃',
        condition: {
          label: '日心偏心率',
          current: heliocentricTransfer.eccentricity,
          target: 0.99,
          unit: '',
          satisfied: false,
        },
        metrics,
        progress: 20,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
        desiredDirection,
        desiredDirectionLabel: '日心逆行修正方向',
        recommendedGear: 'N',
        recommendedThrustMagnitude: 0,
        suggestedTimeScale: 1,
        sourceGuidance: {
          title: '地球出发过燃：先熄火',
          actionText: '当前出发燃烧已经过量，先切到N档并清零推力，避免继续放大轨道误差',
          metrics,
          progress: 20,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'inertial',
        },
      };
    }

    if (noseAngle > 6) {
      return {
        action: 'turn',
        title: '地球出发过燃：调整修正方向',
        actionText: '船头对准日心逆行方向，准备反向修正过量的出发燃烧',
        target: '地球出发过燃修正',
        reason: '需要先把船头转到日心逆行修正方向，再进行反向修正点火',
        condition: {
          label: '船身夹角',
          current: noseAngle,
          target: 6,
          unit: '°',
          satisfied: false,
        },
        metrics: [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics],
        progress: Math.max(0, 100 - noseAngle),
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
        desiredDirection,
        desiredDirectionLabel: '日心逆行修正方向',
        recommendedGear: 'N',
        recommendedThrustMagnitude: 0,
        suggestedTimeScale: 1,
        sourceGuidance: {
          title: '地球出发过燃：调整修正方向',
          actionText: '船头对准日心逆行方向，准备反向修正过量的出发燃烧',
          metrics,
          progress: 20,
          completed: false,
          shouldThrust: false,
          thrustDirection: 'none',
          thrustMagnitude: 0,
          attitudeMode: 'inertial',
        },
      };
    }

    return {
      action: 'ignite',
      title: '地球出发过燃：反向修正',
      actionText: 'D档低推力沿日心逆行方向修正，直到转移轨道重新覆盖火星轨道',
      target: '地球出发过燃修正',
      reason: '日心轨道已经过量，需要反向降低能量，而不是继续顺行补燃',
      condition: {
        label: '日心远日点',
        current: heliocentricTransfer.apoapsis,
        target: heliocentricTransfer.marsA,
        unit: 'AU',
        satisfied: false,
      },
      metrics,
      progress: 30,
      completed: false,
      shouldThrust: true,
      thrustDirection: 'forward',
      thrustMagnitude: EARTH_OVERBURN_CORRECTION_THRUST_MN,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel: '日心逆行修正方向',
      recommendedGear: 'D',
      recommendedThrustMagnitude: EARTH_OVERBURN_CORRECTION_THRUST_MN,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: '地球出发过燃：反向修正',
        actionText: 'D档低推力沿日心逆行方向修正，直到转移轨道重新覆盖火星轨道',
        metrics,
        progress: 30,
        completed: false,
        shouldThrust: true,
        thrustDirection: 'forward',
        thrustMagnitude: EARTH_OVERBURN_CORRECTION_THRUST_MN,
        attitudeMode: 'inertial',
      },
    };
  }

  const phaseAngle = getPhaseAngleDeg(input.shipPosition, input.simulatedTime);
  const departureDirectionAligned = vectorDot(earthRel.prograde, earthRel.heliocentricPrograde) > 0.5;
  const phaseReady = earthRel.escaped
    || input.thrustMagnitude > 0
    || phaseAngle == null
    || (
      phaseAngle >= EARTH_DEPARTURE_PHASE_MIN_DEG
      && phaseAngle <= EARTH_DEPARTURE_PHASE_MAX_DEG
      && departureDirectionAligned
    );
  const needsEarthRelativeDepartureDirection = !earthRel.escaped
    || (
      earthRel.distance < earthRel.hillRadius * EARTH_STABLE_ESCAPE_HILL_FRACTION
      && earthRel.speed * AU_TO_KM < EARTH_STABLE_ESCAPE_SPEED_KMS
    );
  const desiredDirection = needsEarthRelativeDepartureDirection
    ? earthRel.prograde
    : heliocentricTangentialPrograde(input.shipPosition);
  const desiredDirectionLabel = needsEarthRelativeDepartureDirection ? '当前绕飞顺行方向' : '日心切向顺行补燃方向';
  const noseAngle = angleDeg(input.shipDirection, desiredDirection);

  const metrics: GuidanceMetric[] = [
    {
      label: '地球绕飞相位',
      current: phaseAngle ?? 0,
      target: 90,
      unit: '°',
      highlight: true,
      warn: !phaseReady,
    },
    {
      label: '出发方向顺行性',
      current: departureDirectionAligned ? 1 : 0,
      target: 1,
      unit: '',
      highlight: departureDirectionAligned,
      warn: !departureDirectionAligned,
    },
    {
      label: '地球相对能量',
      current: earthRel.energy,
      target: targetDepartureEnergy,
      unit: 'AU²/s²',
      highlight: departureEnergyReady,
      warn: !departureEnergyReady,
    },
    {
      label: '日心远日点覆盖',
      current: coversMars ? 1 : 0,
      target: 1,
      unit: '',
      highlight: coversMars,
      warn: !coversMars,
    },
    {
      label: '相对速度',
      current: earthRel.speed * AU_TO_KM,
      target: Math.sqrt(2 * (G_AU * REAL_DATA.earth.mass / Math.max(earthRel.distance, 1e-20) + targetDepartureEnergy)) * AU_TO_KM,
      unit: 'km/s',
      highlight: true,
    },
  ];

  if (!earthRel.escaped && !phaseReady && input.thrustMagnitude <= 0) {
    return {
      action: 'wait',
      title: '等待地球绕飞点火相位',
      actionText: '保持空档，等待飞船绕到顺向出发点后再点火',
      target: '地球出发点火相位',
      reason: '还没有到适合顺向出发的地球绕飞相位，保持空档等待物理条件满足',
      condition: {
        label: '地球绕飞相位',
        current: phaseAngle ?? 0,
        target: 90,
        unit: '°',
        satisfied: false,
      },
      metrics,
      progress: phaseAngle == null ? 0 : Math.max(0, 100 - Math.abs(phaseAngle - 90)),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel: '当前绕飞顺行方向',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 10000,
      sourceGuidance: {
        title: '等待地球绕飞点火相位',
        actionText: '保持空档，等待飞船绕到顺向出发点后再点火',
        metrics,
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  if (noseAngle > 6 && input.thrustMagnitude > 0) {
    return {
      action: 'cutoff',
      title: earthRel.escaped ? '日心补燃方向偏离：先熄火' : '地球出发方向偏离：先熄火',
      actionText: '当前推力已开启但船头偏离导航方向，先切到N档并清零推力',
      target: earthRel.escaped ? '日心顺行补燃方向' : '地球出发点火方向',
      reason: '推力方向偏离推荐方向，继续点火会放大轨道误差，必须先熄火再重新对准',
      condition: {
        label: '船身夹角',
        current: noseAngle,
        target: 6,
        unit: '°',
        satisfied: false,
      },
      metrics: [
        { label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true },
        ...metrics,
      ],
      progress: Math.max(0, 100 - noseAngle),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel,
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: earthRel.escaped ? '日心补燃方向偏离：先熄火' : '地球出发方向偏离：先熄火',
        actionText: '当前推力已开启但船头偏离导航方向，先切到N档并清零推力',
        metrics,
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  if (noseAngle > 6 && input.thrustMagnitude <= 0) {
    return {
      action: 'turn',
      title: earthRel.escaped ? '调整方向：日心顺行补燃' : '调整方向：地球出发顺行',
      actionText: earthRel.escaped
        ? '船头对准日心顺行方向，准备继续补燃抬高转移轨道'
        : '船头对准当前绕飞顺行方向，准备出发点火',
      target: earthRel.escaped ? '日心顺行补燃方向' : '地球出发点火方向',
      reason: earthRel.escaped
        ? '飞船已经逃逸地球，后续补燃必须沿日心顺行方向抬高远日点'
        : '出发燃烧前必须先对准地球相对顺行方向',
      condition: {
        label: '船身夹角',
        current: noseAngle,
        target: 6,
        unit: '°',
        satisfied: false,
      },
      metrics: [
        { label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true },
        ...metrics,
      ],
      progress: Math.max(0, 100 - noseAngle),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel,
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: earthRel.escaped ? '调整方向：日心顺行补燃' : '调整方向：地球出发顺行',
        actionText: earthRel.escaped
          ? '船头对准日心顺行方向，准备继续补燃抬高转移轨道'
          : '船头对准当前绕飞顺行方向，准备出发点火',
        metrics,
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  return {
    action: 'ignite',
    title: earthRel.escaped ? '稳定离场补燃' : '地球出发点火',
    actionText: 'D档低推力顺行加速，直到地球相对v∞能量达到火星转移需求',
    target: '火星转移轨道',
    reason: earthRel.escaped
      ? '飞船已获得地球逃逸能量，但离场裕度或日心轨道仍不足，需要按当前推荐顺行方向继续低推力补燃'
      : '飞船尚未获得火星转移所需的地球相对离场能量，需要继续顺行出发燃烧',
    condition: {
      label: earthRel.escaped ? '日心远日点覆盖' : '地球相对能量',
      current: earthRel.escaped ? (coversMars ? 1 : 0) : earthRel.energy,
      target: earthRel.escaped ? 1 : targetDepartureEnergy,
      unit: earthRel.escaped ? '' : 'AU²/s²',
      satisfied: earthRel.escaped && coversMars,
    },
    metrics,
    progress: earthRel.escaped ? 60 : 30,
    completed: false,
    shouldThrust: true,
    thrustDirection: 'forward',
    thrustMagnitude: EARTH_DEPARTURE_THRUST_MN,
    attitudeMode: 'inertial',
    desiredDirection,
    desiredDirectionLabel,
    recommendedGear: 'D',
    recommendedThrustMagnitude: EARTH_DEPARTURE_THRUST_MN,
    suggestedTimeScale: 1,
    sourceGuidance: {
      title: earthRel.escaped ? '稳定离场补燃' : '地球出发点火',
      actionText: 'D档低推力顺行加速，直到地球相对能量为正且日心远日点覆盖火星轨道',
      metrics,
      progress: 0,
      completed: false,
      shouldThrust: true,
      thrustDirection: 'forward',
      thrustMagnitude: EARTH_DEPARTURE_THRUST_MN,
      attitudeMode: 'inertial',
    },
  };
}

function marsFarApproachDirective(input: MarsMissionDirectiveInput): NavigationDirective | null {
  const marsState = computeBodyState('mars', julianDate(input.simulatedTime));
  if (!marsState) return null;

  const relativePosition: Direction3 = [
    input.shipPosition[0] - marsState.position[0],
    input.shipPosition[1] - marsState.position[1],
    input.shipPosition[2] - marsState.position[2],
  ];
  const relativeVelocity: Direction3 = [
    input.shipVelocity[0] - marsState.velocity[0],
    input.shipVelocity[1] - marsState.velocity[1],
    input.shipVelocity[2] - marsState.velocity[2],
  ];
  const distance = vectorLength(relativePosition);
  if (distance > MARS_FAR_APPROACH_MAX_AU) return null;

  const speed = vectorLength(relativeVelocity);
  const speedKms = speed * AU_TO_KM;
  const distanceRate = distance > 1e-12 ? vectorDot(relativePosition, relativeVelocity) / distance : 0;
  const closingSpeedKms = -distanceRate * AU_TO_KM;
  const hillRadius = REAL_DATA.mars.semiMajorAxis!
    * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
  if (distance <= hillRadius * 1.2) return null;
  const marsMu = G_AU * REAL_DATA.mars.mass;
  const marsRelativeEnergy = speed * speed / 2 - marsMu / distance;
  if (distance <= hillRadius * 1.5 && marsRelativeEnergy < 0) return null;

  const nearHillBoundary = distance <= hillRadius * 1.5;
  const shouldBrake = speedKms > 0.65
    || closingSpeedKms > 0.55
    || (nearHillBoundary && (speedKms > 0.55 || marsRelativeEnergy > 0));
  const shouldApproach = !shouldBrake && (closingSpeedKms < 0.2 || distanceRate > 0);
  const desiredDirection = shouldBrake
    ? vectorNormalize([-relativeVelocity[0], -relativeVelocity[1], -relativeVelocity[2]])
    : vectorNormalize([-relativePosition[0], -relativePosition[1], -relativePosition[2]]);
  const noseAngle = angleDeg(input.shipDirection, desiredDirection);
  const metrics: GuidanceMetric[] = [
    { label: '距火星', current: distance, target: hillRadius * 1.2, unit: 'AU', highlight: true },
    { label: '火星相对速度', current: speedKms, target: shouldBrake ? 0.65 : 0.2, unit: 'km/s', highlight: true, warn: shouldBrake },
    { label: '火星闭合速度', current: closingSpeedKms, target: 0.12, unit: 'km/s', highlight: !shouldBrake },
  ];

  if (!shouldBrake && !shouldApproach) {
    return {
      action: 'coast',
      title: '火星远距离接近速度已受控',
      actionText: '保持空档滑行，继续接近火星并等待下一轮导航刷新',
      target: '火星远距离接近',
      reason: '距火星已进入实时接近控制区，当前闭合速度受控，先滑行避免过度修正',
      condition: {
        label: '距火星',
        current: distance,
        target: hillRadius * 1.2,
        unit: 'AU',
        satisfied: false,
      },
      metrics,
      progress: Math.max(0, Math.min(95, (MARS_FAR_APPROACH_MAX_AU - distance) / MARS_FAR_APPROACH_MAX_AU * 100)),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: distance > 0.05 ? 100000 : distance > 0.015 ? 10000 : distance > 0.01 ? 1000 : 100,
      sourceGuidance: {
        title: '火星远距离接近速度已受控',
        actionText: '保持空档滑行，继续接近火星并等待下一轮导航刷新',
        metrics,
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  if (input.thrustMagnitude > 0 && noseAngle > 20) {
    return {
      action: 'cutoff',
      title: shouldBrake ? '火星制动方向偏离：先熄火' : '火星接近方向偏离：先熄火',
      actionText: '当前推力已开启但船头没有对准导航方向，先切到N档并清零推力',
      target: '火星远距离接近',
      reason: '推力方向偏离推荐方向，继续点火会放大接近误差，必须先熄火再重新对准',
      condition: {
        label: '船身夹角',
        current: noseAngle,
        target: 6,
        unit: '°',
        satisfied: false,
      },
      metrics: [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics],
      progress: Math.max(0, 100 - noseAngle),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel: shouldBrake ? '火星相对逆行方向' : '指向火星方向',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: shouldBrake ? '火星制动方向偏离：先熄火' : '火星接近方向偏离：先熄火',
        actionText: '当前推力已开启但船头没有对准导航方向，先切到N档并清零推力',
        metrics,
        progress: 0,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  const action = noseAngle > 6 && input.thrustMagnitude <= 0 ? 'turn' : (shouldBrake ? 'capture' : 'ignite');
  const thrustMagnitude = shouldBrake ? MARS_FAR_BRAKE_THRUST_MN : MARS_FAR_APPROACH_THRUST_MN;
  return {
    action,
    title: shouldBrake ? '火星远距离相对制动' : '火星远距离小推力接近',
    actionText: shouldBrake
      ? '船头对准火星相对逆行方向，D档点火降低相对速度'
      : '船头指向火星，D档小推力提高闭合速度',
    target: '火星远距离接近',
    reason: shouldBrake
      ? '火星接近速度过高，必须先削减相对速度，避免掠过火星'
      : '闭合速度不足或正在远离火星，需要小推力重新建立接近',
    condition: {
      label: shouldBrake ? '火星相对速度' : '火星闭合速度',
      current: shouldBrake ? speedKms : closingSpeedKms,
      target: shouldBrake ? 0.65 : 0.25,
      unit: 'km/s',
      satisfied: false,
    },
    metrics: action === 'turn'
      ? [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics]
      : metrics,
    progress: 35,
    completed: false,
    shouldThrust: action !== 'turn',
    thrustDirection: 'forward',
    thrustMagnitude,
    attitudeMode: 'inertial',
    desiredDirection,
    desiredDirectionLabel: shouldBrake ? '火星相对逆行方向' : '指向火星方向',
    recommendedGear: action === 'turn' ? 'N' : 'D',
    recommendedThrustMagnitude: action === 'turn' ? 0 : thrustMagnitude,
    suggestedTimeScale: 1,
    sourceGuidance: {
      title: shouldBrake ? '火星远距离相对制动' : '火星远距离小推力接近',
      actionText: shouldBrake
        ? '船头对准火星相对逆行方向，D档点火降低相对速度'
        : '船头指向火星，D档小推力提高闭合速度',
      metrics,
      progress: 0,
      completed: false,
      shouldThrust: action !== 'turn',
      thrustDirection: 'forward',
      thrustMagnitude,
      attitudeMode: 'inertial',
    },
  };
}

function marsMidcourseCorrectionDirective(input: MarsMissionDirectiveInput): NavigationDirective | null {
  const marsState = computeBodyState('mars', julianDate(input.simulatedTime));
  if (!marsState) return null;

  const earthRel = computeEarthRelativeState(input);
  if (earthRel && earthRel.distance < earthRel.hillRadius * 1.2) return null;

  const shipSunDistance = vectorLength(input.shipPosition);
  const marsA = REAL_DATA.mars.semiMajorAxis;
  const coversMars = marsOrbitCoveredByHeliocentricOrbit(input.shipPosition, input.shipVelocity);
  const heliocentricTransfer = computeHeliocentricTransfer(input.shipPosition, input.shipVelocity);
  const usableEllipticTransfer = heliocentricTransfer != null
    && Number.isFinite(heliocentricTransfer.semiMajorAxis)
    && Number.isFinite(heliocentricTransfer.eccentricity)
    && heliocentricTransfer.eccentricity < 1
    && Number.isFinite(heliocentricTransfer.apoapsis)
    && heliocentricTransfer.apoapsis <= heliocentricTransfer.marsA + 1.0;
  const nearMarsOrbitalRadius = marsA != null && Math.abs(shipSunDistance - marsA) < 0.08;
  if (!usableEllipticTransfer || (!coversMars && !nearMarsOrbitalRadius)) return null;

  const relativePosition: Direction3 = [
    input.shipPosition[0] - marsState.position[0],
    input.shipPosition[1] - marsState.position[1],
    input.shipPosition[2] - marsState.position[2],
  ];
  const relativeVelocity: Direction3 = [
    input.shipVelocity[0] - marsState.velocity[0],
    input.shipVelocity[1] - marsState.velocity[1],
    input.shipVelocity[2] - marsState.velocity[2],
  ];
  const distance = vectorLength(relativePosition);
  if (distance <= MARS_FAR_APPROACH_MAX_AU) return null;

  const relativeSpeedSq = vectorDot(relativeVelocity, relativeVelocity);
  if (relativeSpeedSq < 1e-24) return null;

  const distanceRate = vectorDot(relativePosition, relativeVelocity) / distance;
  const tca = -vectorDot(relativePosition, relativeVelocity) / relativeSpeedSq;
  const closestVector: Direction3 = tca > 0
    ? [
        relativePosition[0] + relativeVelocity[0] * tca,
        relativePosition[1] + relativeVelocity[1] * tca,
        relativePosition[2] + relativeVelocity[2] * tca,
      ]
    : relativePosition;
  const closestDistance = vectorLength(closestVector);
  const missPredicted = tca <= 0
    || distanceRate >= 0
    || closestDistance > MARS_MIDCOURSE_TARGET_CLOSEST_AU;
  if (!missPredicted) return null;

  const desiredDirection = vectorNormalize(
    tca > 0 && closestDistance > 1e-9
      ? [-closestVector[0], -closestVector[1], -closestVector[2]]
      : [-relativePosition[0], -relativePosition[1], -relativePosition[2]],
  );
  const noseAngle = angleDeg(input.shipDirection, desiredDirection);
  const closingSpeedKms = -distanceRate * AU_TO_KM;
  const metrics: GuidanceMetric[] = [
    {
      label: '预计最近距火星',
      current: closestDistance,
      target: MARS_MIDCOURSE_TARGET_CLOSEST_AU,
      unit: 'AU',
      highlight: true,
      warn: closestDistance > MARS_MIDCOURSE_TARGET_CLOSEST_AU,
    },
    {
      label: '距最近接近时间',
      current: tca / 86400,
      target: 0,
      unit: '天',
      warn: tca <= 0,
    },
    {
      label: '火星闭合速度',
      current: closingSpeedKms,
      target: 0.05,
      unit: 'km/s',
      warn: distanceRate >= 0,
    },
    {
      label: '距火星',
      current: distance,
      target: MARS_FAR_APPROACH_MAX_AU,
      unit: 'AU',
      highlight: true,
    },
  ];

  if (input.thrustMagnitude > 0 && noseAngle > 12) {
    return {
      action: 'cutoff',
      title: '日心交会修正方向偏离：先熄火',
      actionText: '当前推力已开启但船头偏离交会修正方向，先切到N档停止放大误差',
      target: '火星转移交会',
      reason: '当前火星交会预测会错过接近区，且推力方向不在推荐修正方向上',
      condition: {
        label: '船身夹角',
        current: noseAngle,
        target: 6,
        unit: '°',
        satisfied: false,
      },
      metrics: [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics],
      progress: Math.max(0, 100 - noseAngle),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel: '日心交会修正方向',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: '日心交会修正方向偏离：先熄火',
        actionText: '当前推力已开启但船头偏离交会修正方向，先切到N档停止放大误差',
        metrics,
        progress: 45,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  const action = noseAngle > 6 && input.thrustMagnitude <= 0 ? 'turn' : 'ignite';
  return {
    action,
    title: action === 'turn' ? '调整方向：日心交会修正' : '日心转移交会修正',
    actionText: action === 'turn'
      ? '船头对准日心交会修正方向，准备低推力修正火星错过量'
      : 'D档低推力沿交会修正方向点火，下一轮导航会继续按实际偏差刷新指引',
    target: '火星转移交会',
    reason: '当前日心轨道半径虽然覆盖火星轨道，但按当前相对运动预测无法进入火星接近区',
    condition: {
      label: '预计最近距火星',
      current: closestDistance,
      target: MARS_MIDCOURSE_TARGET_CLOSEST_AU,
      unit: 'AU',
      satisfied: false,
    },
    metrics: action === 'turn'
      ? [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics]
      : metrics,
    progress: Math.max(35, Math.min(75, (1 - closestDistance / Math.max(distance, closestDistance)) * 100)),
    completed: false,
    shouldThrust: action !== 'turn',
    thrustDirection: 'forward',
    thrustMagnitude: action === 'turn' ? 0 : MARS_MIDCOURSE_THRUST_MN,
    attitudeMode: 'inertial',
    desiredDirection,
    desiredDirectionLabel: '日心交会修正方向',
    recommendedGear: action === 'turn' ? 'N' : 'D',
    recommendedThrustMagnitude: action === 'turn' ? 0 : MARS_MIDCOURSE_THRUST_MN,
    suggestedTimeScale: 1,
    sourceGuidance: {
      title: action === 'turn' ? '调整方向：日心交会修正' : '日心转移交会修正',
      actionText: action === 'turn'
        ? '船头对准日心交会修正方向，准备低推力修正火星错过量'
        : 'D档低推力沿交会修正方向点火，下一轮导航会继续按实际偏差刷新指引',
      metrics,
      progress: 45,
      completed: false,
      shouldThrust: action !== 'turn',
      thrustDirection: 'forward',
      thrustMagnitude: action === 'turn' ? 0 : MARS_MIDCOURSE_THRUST_MN,
      attitudeMode: 'inertial',
    },
  };
}

function heliocentricTransferEnergyDirective(input: MarsMissionDirectiveInput): NavigationDirective | null {
  const earthRel = computeEarthRelativeState(input);
  if (earthRel && earthRel.distance < earthRel.hillRadius * 1.2) return null;

  const marsDistance = marsDistanceAU(input);
  if (marsDistance != null && marsDistance <= MARS_FAR_APPROACH_MAX_AU) return null;

  const transfer = computeHeliocentricTransfer(input.shipPosition, input.shipVelocity);
  if (!transfer || !Number.isFinite(transfer.eccentricity) || transfer.eccentricity >= 1) return null;
  if (!Number.isFinite(transfer.apoapsis) || !Number.isFinite(transfer.periapsis)) return null;

  const tolerance = 0.03;
  let desiredDirection: Direction3 | null = null;
  let title = '';
  let actionText = '';
  let reason = '';

  if (transfer.apoapsis < transfer.marsA - tolerance) {
    desiredDirection = heliocentricTangentialPrograde(input.shipPosition);
    title = '恢复火星转移远日点';
    actionText = '船头对准日心顺行方向，D档小推力补燃，重新把远日点抬到火星轨道';
    reason = '飞船已经离开地球，但上一次修正让远日点低于火星轨道，不能退回等待发射窗口';
  } else {
    return null;
  }

  const noseAngle = angleDeg(input.shipDirection, desiredDirection);
  const metrics: GuidanceMetric[] = [
    { label: '日心远日点', current: transfer.apoapsis, target: transfer.marsA, unit: 'AU', warn: transfer.apoapsis < transfer.marsA - tolerance },
    { label: '日心近日点', current: transfer.periapsis, target: transfer.marsA, unit: 'AU', warn: transfer.periapsis > transfer.marsA + tolerance },
    { label: '距火星', current: marsDistance ?? 0, target: MARS_FAR_APPROACH_MAX_AU, unit: 'AU', highlight: true },
  ];

  if (input.thrustMagnitude > 0 && noseAngle > 12) {
    return {
      action: 'cutoff',
      title: `${title}：先熄火`,
      actionText: '当前推力已开启但船头偏离恢复方向，先切到N档停止放大误差',
      target: '火星转移轨道',
      reason: '转移能量恢复必须按推荐方向小推力执行，先熄火再重新对准',
      condition: {
        label: '船身夹角',
        current: noseAngle,
        target: 6,
        unit: '°',
        satisfied: false,
      },
      metrics: [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics],
      progress: Math.max(0, 100 - noseAngle),
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
      desiredDirection,
      desiredDirectionLabel: title.includes('远日点') ? '日心顺行恢复方向' : '日心逆行恢复方向',
      recommendedGear: 'N',
      recommendedThrustMagnitude: 0,
      suggestedTimeScale: 1,
      sourceGuidance: {
        title: `${title}：先熄火`,
        actionText: '当前推力已开启但船头偏离恢复方向，先切到N档停止放大误差',
        metrics,
        progress: 20,
        completed: false,
        shouldThrust: false,
        thrustDirection: 'none',
        thrustMagnitude: 0,
        attitudeMode: 'inertial',
      },
    };
  }

  const action = noseAngle > 6 && input.thrustMagnitude <= 0 ? 'turn' : 'ignite';
  return {
    action,
    title: action === 'turn' ? `调整方向：${title}` : title,
    actionText,
    target: '火星转移轨道',
    reason,
    condition: {
      label: '日心远日点',
      current: transfer.apoapsis,
      target: transfer.marsA,
      unit: 'AU',
      satisfied: false,
    },
    metrics: action === 'turn'
      ? [{ label: '船身夹角', current: noseAngle, target: 6, unit: '°', warn: true }, ...metrics]
      : metrics,
    progress: 35,
    completed: false,
    shouldThrust: action !== 'turn',
    thrustDirection: 'forward',
    thrustMagnitude: action === 'turn' ? 0 : MARS_TRANSFER_ENERGY_RESTORE_THRUST_MN,
    attitudeMode: 'inertial',
    desiredDirection,
    desiredDirectionLabel: title.includes('远日点') ? '日心顺行恢复方向' : '日心逆行恢复方向',
    recommendedGear: action === 'turn' ? 'N' : 'D',
    recommendedThrustMagnitude: action === 'turn' ? 0 : MARS_TRANSFER_ENERGY_RESTORE_THRUST_MN,
    suggestedTimeScale: 1,
    sourceGuidance: {
      title: action === 'turn' ? `调整方向：${title}` : title,
      actionText,
      metrics,
      progress: 35,
      completed: false,
      shouldThrust: action !== 'turn',
      thrustDirection: 'forward',
      thrustMagnitude: action === 'turn' ? 0 : MARS_TRANSFER_ENERGY_RESTORE_THRUST_MN,
      attitudeMode: 'inertial',
    },
  };
}

function marsDistanceAU(input: MarsMissionDirectiveInput): number | null {
  const marsState = computeBodyState('mars', julianDate(input.simulatedTime));
  if (!marsState) return null;
  return vectorLength([
    input.shipPosition[0] - marsState.position[0],
    input.shipPosition[1] - marsState.position[1],
    input.shipPosition[2] - marsState.position[2],
  ]);
}

function activeCruiseCorrectionCutoff(
  input: MarsMissionDirectiveInput,
  guidance: PhaseGuidance,
): NavigationDirective | null {
  if (input.thrustMagnitude <= 0 || guidance.operation !== 'jumpTime') return null;

  const earthRel = computeEarthRelativeState(input);
  if (earthRel && earthRel.distance < earthRel.hillRadius * 1.2) return null;

  const heliocentricTransfer = computeHeliocentricTransfer(input.shipPosition, input.shipVelocity);
  if (!heliocentricTransfer) return null;

  const marsDistance = marsDistanceAU(input);
  const metrics: GuidanceMetric[] = [
    {
      label: '日心远日点',
      current: heliocentricTransfer.apoapsis,
      target: heliocentricTransfer.marsA,
      unit: 'AU',
      warn: true,
    },
    {
      label: '日心偏心率',
      current: heliocentricTransfer.eccentricity,
      target: 0.99,
      unit: '',
      warn: heliocentricTransfer.eccentricity >= 1,
    },
    {
      label: '距火星',
      current: marsDistance ?? 0,
      target: MARS_FAR_APPROACH_MAX_AU,
      unit: 'AU',
      warn: true,
    },
  ];

  return {
    action: 'cutoff',
    title: '日心交会修正过量：先熄火',
    actionText: '当前巡航修正点火已经让转移轨道偏离火星轨道，先切到N档停止继续放大误差',
    target: '火星转移交会',
    reason: '实时重算显示当前状态已经不适合继续点火；先熄火，再由下一轮导航重新规划补救动作',
    condition: {
      label: '日心远日点',
      current: heliocentricTransfer.apoapsis,
      target: heliocentricTransfer.marsA,
      unit: 'AU',
      satisfied: false,
    },
    metrics,
    progress: 20,
    completed: false,
    shouldThrust: false,
    thrustDirection: 'none',
    thrustMagnitude: 0,
    attitudeMode: 'inertial',
    recommendedGear: 'N',
    recommendedThrustMagnitude: 0,
    suggestedTimeScale: 1,
    sourceGuidance: {
      title: '日心交会修正过量：先熄火',
      actionText: '当前巡航修正点火已经让转移轨道偏离火星轨道，先切到N档停止继续放大误差',
      metrics,
      progress: 20,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
    },
  };
}

function suppressPrematureMarsCapture(
  input: MarsMissionDirectiveInput,
  guidance: PhaseGuidance,
): NavigationDirective | null {
  const marsDistance = marsDistanceAU(input);
  const captureLike = guidance.title.includes('火星相对制动')
    || guidance.title.includes('目标捕获')
    || guidance.title.includes('捕获制动');
  if (!captureLike || marsDistance == null || marsDistance <= MARS_FAR_APPROACH_MAX_AU) return null;

  const metrics: GuidanceMetric[] = [
    { label: '距火星', current: marsDistance, target: MARS_FAR_APPROACH_MAX_AU, unit: 'AU', warn: true },
  ];

  return {
    action: 'coast',
    title: '转移轨道滑行',
    actionText: '尚未进入火星局部接近区，保持空档滑行并等待实时导航刷新',
    target: '火星转移轨道',
    reason: '火星捕获制动只能在进入火星附近接近区后执行，当前距离仍属于日心转移巡航',
    condition: {
      label: '距火星',
      current: marsDistance,
      target: MARS_FAR_APPROACH_MAX_AU,
      unit: 'AU',
      satisfied: false,
    },
    metrics,
    progress: Math.max(0, Math.min(90, (1.5 - marsDistance) / 1.5 * 100)),
    completed: false,
    shouldThrust: false,
    thrustDirection: 'none',
    thrustMagnitude: 0,
    attitudeMode: 'inertial',
    recommendedGear: 'N',
    recommendedThrustMagnitude: 0,
    suggestedTimeScale: marsDistance > 0.5 ? 100000 : 10000,
    sourceGuidance: {
      title: '转移轨道滑行',
      actionText: '尚未进入火星局部接近区，保持空档滑行并等待实时导航刷新',
      metrics,
      progress: 0,
      completed: false,
      shouldThrust: false,
      thrustDirection: 'none',
      thrustMagnitude: 0,
      attitudeMode: 'inertial',
    },
  };
}

function actionFromGuidance(guidance: PhaseGuidance): DirectiveAction {
  if (guidance.operation === 'jumpTime') return 'wait';
  if (guidance.operation === 'arrived') return 'arrived';
  if (guidance.operation === 'turn') return 'turn';
  if (guidance.operation === 'ignite') {
    if (guidance.title.includes('捕获') || guidance.title.includes('制动')) return 'capture';
    if (guidance.title.includes('圆化') || guidance.title.includes('远火点') || guidance.title.includes('近火点')) return 'circularize';
    return 'ignite';
  }
  if (guidance.operation === 'cutoff') return 'cutoff';
  if (guidance.operation === 'coast') return 'coast';
  return 'wait';
}

function targetFromGuidance(guidance: PhaseGuidance): string {
  if (guidance.title.includes('火星')) return '火星';
  if (guidance.title.includes('转移')) return '火星转移轨道';
  if (guidance.title.includes('窗口')) return '地火霍曼窗口';
  return '火星';
}

function conditionFromGuidance(guidance: PhaseGuidance): NavigationCondition {
  if (guidance.operation === 'jumpTime' || guidance.title.includes('窗口')) {
    const windowMetric = guidance.metrics.find(metric => metric.label.includes('相位') || metric.label.includes('窗口'))
      ?? guidance.metrics[0];
    return {
      label: windowMetric?.label.includes('窗口') ? windowMetric.label : '地火窗口条件',
      current: windowMetric?.current ?? 0,
      target: windowMetric?.target ?? 1,
      unit: windowMetric?.unit ?? '',
      satisfied: guidance.completed,
    };
  }

  const primaryMetric = guidance.metrics.find(metric => metric.warn || metric.highlight) ?? guidance.metrics[0];
  if (!primaryMetric) {
    return {
      label: guidance.completed ? '完成状态' : '等待条件',
      current: guidance.completed ? 1 : 0,
      target: 1,
      unit: '',
      satisfied: guidance.completed,
    };
  }

  return {
    label: primaryMetric.label,
    current: primaryMetric.current,
    target: primaryMetric.target,
    unit: primaryMetric.unit,
    satisfied: guidance.completed || !primaryMetric.warn,
  };
}

function recommendedGearFromGuidance(guidance: PhaseGuidance): 'D' | 'N' | 'R' {
  if (guidance.recommendedGear) return guidance.recommendedGear;
  return guidance.shouldThrust && guidance.thrustMagnitude > 0 ? 'D' : 'N';
}

function recommendedThrustFromGuidance(guidance: PhaseGuidance): number {
  if (guidance.recommendedThrustMagnitude != null) return guidance.recommendedThrustMagnitude;
  return guidance.shouldThrust ? guidance.thrustMagnitude : 0;
}

function suggestedTimeScaleFromGuidance(guidance: PhaseGuidance): number {
  if (guidance.suggestedTimeScale != null) return guidance.suggestedTimeScale;
  if (guidance.operation === 'turn' || guidance.operation === 'ignite' || guidance.operation === 'cutoff') return 1;
  return 1000;
}

export function directiveFromPhaseGuidance(guidance: PhaseGuidance): NavigationDirective {
  const action = actionFromGuidance(guidance);
  const recommendedGear = action === 'wait' || action === 'coast' || action === 'arrived'
    ? 'N'
    : recommendedGearFromGuidance(guidance);
  const recommendedThrustMagnitude = recommendedGear === 'N' ? 0 : recommendedThrustFromGuidance(guidance);

  return {
    action,
    title: guidance.title,
    actionText: guidance.actionText,
    target: targetFromGuidance(guidance),
    reason: guidance.reason ?? guidance.actionText,
    condition: conditionFromGuidance(guidance),
    metrics: guidance.metrics,
    progress: guidance.progress,
    completed: guidance.completed,
    shouldThrust: guidance.shouldThrust,
    thrustDirection: guidance.thrustDirection,
    thrustMagnitude: guidance.thrustMagnitude,
    attitudeMode: guidance.attitudeMode,
    desiredDirection: guidance.desiredDirection,
    desiredDirectionLabel: guidance.desiredDirectionLabel,
    recommendedGear,
    recommendedThrustMagnitude,
    suggestedTimeScale: suggestedTimeScaleFromGuidance(guidance),
    sourceGuidance: guidance,
  };
}

export function computeMarsMissionDirective(input: MarsMissionDirectiveInput): NavigationDirective {
  const guidance = computeLiveNavigationGuidance({
    ...input,
    destinationId: 'mars',
  });
  if (guidance.operation === 'jumpTime' && !guidance.completed && input.thrustMagnitude <= 0) {
    const earthRel = computeEarthRelativeState(input);
    if (earthRel && earthRel.distance < earthRel.hillRadius * 1.2) {
      return directiveFromPhaseGuidance(guidance);
    }
  }

  const departureDirective = earthDepartureDirective(input);
  if (departureDirective) return departureDirective;

  if (guidance.operation !== 'arrived') {
    const farApproachDirective = marsFarApproachDirective(input);
    if (farApproachDirective) return farApproachDirective;

    const transferEnergyDirective = heliocentricTransferEnergyDirective(input);
    if (transferEnergyDirective) return transferEnergyDirective;

    const midcourseCorrectionDirective = marsMidcourseCorrectionDirective(input);
    if (midcourseCorrectionDirective) return midcourseCorrectionDirective;

    const cruiseCorrectionCutoff = activeCruiseCorrectionCutoff(input, guidance);
    if (cruiseCorrectionCutoff) return cruiseCorrectionCutoff;

    const prematureCaptureDirective = suppressPrematureMarsCapture(input, guidance);
    if (prematureCaptureDirective) return prematureCaptureDirective;
  }

  return directiveFromPhaseGuidance(guidance);
}
