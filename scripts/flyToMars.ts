/**
 * 自动导航验证：地球 -> 火星
 *
 * 每轮循环固定顺序：
 *   1. 先模拟 1s * timeScale 的物理时间
 *   2. 基于最新物理状态重新规划去火星的导航路线
 *   3. 生成本轮导航指引
 *   4. 条件满足则执行对应用户操作
 *
 * 运行: npx tsx scripts/flyToMars.ts
 * 日志: scripts/flyToMars.log.txt
 */

import * as fs from 'node:fs';
import {
  AU_TO_KM,
  G_AU,
  MU_SUN_AU,
  REAL_DATA,
  SPACECRAFT_CONFIG,
} from '../src/engine/constants';
import {
  computeBodyState,
  computeEccentricity,
  computeOrbitalSemiMajorAxis,
  planHohmannTransfer,
} from '../src/engine/navigation';
import { createSpaceshipState } from '../src/engine/orbitalInjection';
import { julianDate } from '../src/engine/orbital';
import {
  applyThrustInBodyFrame,
  rk4StepSpaceshipWithMovingBodies,
  type BodyInfo,
} from '../src/engine/spaceship';
import type { NavigationPlan } from '../src/engine/navigation';
import type { SpaceshipState } from '../src/types';

type Vector3 = [number, number, number];
type BodyId = 'sun' | 'earth' | 'mars';

interface BodyState {
  id: BodyId;
  position: Vector3;
  velocity: Vector3;
  mass: number;
  radius: number;
}

interface MissionShipState extends SpaceshipState {
  gear: number;
}

interface Snapshot {
  radius: number;
  speed: number;
  sma: number;
  ecc: number;
  apoapsis: number;
  periapsis: number;
  distEarth: number;
  distMars: number;
  earthMarsPhase: number;
  phaseError: number;
  marsRelativePhase: number;
  marsRelativeSpeed: number;
  marsDistanceRate: number;
  marsRelativeEnergy: number;
  marsOrbitSma: number;
  marsOrbitEcc: number;
  marsPeriapsis: number;
  marsApoapsis: number;
  earthRelativeEnergy: number;
  earthRelativeSpeed: number;
  earthVInf: number;
  earthDepartureAngleDeg: number;
}

type GuidanceAction = 'jumpTime' | 'ignite' | 'cutoff' | 'turn' | 'coast' | 'arrived';
type MissionPhase = 'earthOrbit' | 'transfer' | 'marsApproach' | 'arrived';
type FarMarsApproachMode = 'brake' | 'approach' | 'coast';

interface GuidanceCondition {
  label: string;
  current: number;
  target: number;
  unit: string;
  satisfied: boolean;
}

interface Guidance {
  action: GuidanceAction;
  title: string;
  target: string;
  plan: NavigationPlan;
  direction: Vector3;
  thrustMagnitude: number;
  nextTimeScale: number;
  waitSeconds: number;
  condition: GuidanceCondition;
  reason: string;
}

interface OperationResult {
  performed: boolean;
  label: string;
}

const LOG_FILE = 'scripts/flyToMars.log.txt';
const LOG_LINES: string[] = [];

const simStepSeconds = 1;
const burnTimeScale = 0.0002;
const burnSubStepSeconds = 0.02;
const coastSubStepSeconds = 3600;
const marsCaptureStartAU = 0.12;
const launchWindowToleranceRad = 0.02;
const directionToleranceDeg = 3;
const earthDepartureAngleToleranceDeg = 8;
const farMarsBrakeSpeedKmps = 2.0;
const farMarsBrakeReleaseSpeedKmps = 0.65;
const farMarsMaxClosingKmps = 0.55;
const farMarsMinClosingKmps = 0.08;
const farMarsTargetClosingKmps = 0.35;
const maxIter = 90000;
const tStart = Date.now();

const earthSma = REAL_DATA.earth.semiMajorAxis!;
const marsSma = REAL_DATA.mars.semiMajorAxis!;
const hohmannSma = (earthSma + marsSma) / 2;
const earthHillRadius = earthSma * Math.pow(REAL_DATA.earth.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
const targetDepartureVInf = Math.max(
  0,
  Math.sqrt(MU_SUN_AU * (2 / earthSma - 1 / hohmannSma)) - Math.sqrt(MU_SUN_AU / earthSma),
);
const targetDepartureEnergy = 0.5 * targetDepartureVInf * targetDepartureVInf;
const marsMu = G_AU * REAL_DATA.mars.mass;
const marsHillRadius = marsSma * Math.pow(REAL_DATA.mars.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
const marsSafeOrbitRadius = REAL_DATA.mars.radius + 20000 / AU_TO_KM;
const marsStableApoapsis = marsHillRadius * 0.35;
const marsStableEccentricity = 0.9;
const twoPi = 2 * Math.PI;

let bodies: Record<BodyId, BodyState>;
let ship: MissionShipState;
let t = tStart;
let timeScale = 1;
let missionPhase: MissionPhase = 'earthOrbit';

function logFileOnly(message: string): void {
  LOG_LINES.push(message);
}

function logEvent(message: string): void {
  LOG_LINES.push(message);
  console.log(message);
}

function commitLog(): void {
  fs.writeFileSync(LOG_FILE, `${LOG_LINES.join('\n')}\n`, 'utf-8');
}

function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : 'NaN';
}

function au(value: number): string {
  return `${formatNumber(value, 4)} AU`;
}

function kmPerSec(valueAUPerSec: number): string {
  return `${formatNumber(valueAUPerSec * AU_TO_KM, 2)} km/s`;
}

function deg(valueRad: number): string {
  return `${formatNumber(valueRad * 180 / Math.PI, 2)} deg`;
}

function missionDays(timeMs: number): string {
  return `${formatNumber((timeMs - tStart) / 86400000, 3)} d`;
}

function vecLen(v: Vector3): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vecDist(a: Vector3, b: Vector3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vecSub(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecDot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecScale(v: Vector3, scale: number): Vector3 {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function vecNormalize(v: Vector3): Vector3 {
  const len = vecLen(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function angleBetween(a: Vector3, b: Vector3): number {
  const al = vecLen(a);
  const bl = vecLen(b);
  if (al < 1e-20 || bl < 1e-20) return 0;
  const cosine = vecDot(a, b) / (al * bl);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function normalizeAngle(value: number): number {
  return ((value % twoPi) + twoPi) % twoPi;
}

function shortestAngleDiff(a: number, b: number): number {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, twoPi - diff);
}

function signedDistanceRate(from: Vector3, to: Vector3, fromVelocity: Vector3, toVelocity: Vector3): number {
  const relPos = vecSub(from, to);
  const relVel = vecSub(fromVelocity, toVelocity);
  const dist = vecLen(relPos);
  if (dist < 1e-20) return 0;
  return vecDot(relPos, relVel) / dist;
}

function makeBodyState(id: BodyId, timeMs: number): BodyState {
  const data = REAL_DATA[id];
  if (id === 'sun') {
    return {
      id,
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      mass: data.mass,
      radius: data.radius,
    };
  }

  const state = computeBodyState(id, julianDate(timeMs));
  if (!state) throw new Error(`Cannot compute body state for ${id}`);
  return {
    id,
    position: state.position,
    velocity: state.velocity,
    mass: data.mass,
    radius: data.radius,
  };
}

function refreshBodies(timeMs: number): void {
  bodies = {
    sun: makeBodyState('sun', timeMs),
    earth: makeBodyState('earth', timeMs),
    mars: makeBodyState('mars', timeMs),
  };
}

function bodiesForAbsoluteTime(timeMs: number): BodyInfo[] {
  const sun = makeBodyState('sun', timeMs);
  const earth = makeBodyState('earth', timeMs);
  const mars = makeBodyState('mars', timeMs);
  return [sun, earth, mars].map((body) => ({
    id: body.id,
    position: body.position,
    mass: body.mass,
    radius: body.radius,
  }));
}

function isNearEarth(): boolean {
  return vecDist(ship.position, bodies.earth.position) < earthHillRadius;
}

function isNearMars(): boolean {
  return vecDist(ship.position, bodies.mars.position) < Math.max(marsCaptureStartAU, marsHillRadius * 3);
}

function makeMissionShip(timeMs: number): MissionShipState {
  const earth = makeBodyState('earth', timeMs);
  const earthVelocityAngle = Math.atan2(earth.velocity[1], earth.velocity[0]);
  const base = createSpaceshipState('earth', { trueAnomaly: earthVelocityAngle - Math.PI / 2 }, timeMs);
  return {
    ...base,
    position: [...base.position],
    velocity: [...base.velocity],
    direction: vecNormalize(base.velocity),
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    gear: 0,
  };
}

function initializeMission(): void {
  t = tStart;
  refreshBodies(t);
  ship = makeMissionShip(t);
  timeScale = 1;
  missionPhase = 'earthOrbit';
}

function snapshot(): Snapshot {
  const radius = vecLen(ship.position);
  const speed = vecLen(ship.velocity);
  const sma = computeOrbitalSemiMajorAxis(ship.position, ship.velocity, MU_SUN_AU);
  const ecc = computeEccentricity(ship.position, ship.velocity, MU_SUN_AU);
  const apoapsis = ecc < 1 && sma > 0 ? sma * (1 + ecc) : Infinity;
  const periapsis = ecc < 1 && sma > 0 ? sma * (1 - ecc) : 0;
  const distEarth = vecDist(ship.position, bodies.earth.position);
  const distMars = vecDist(ship.position, bodies.mars.position);
  const earthAngle = Math.atan2(bodies.earth.position[1], bodies.earth.position[0]);
  const marsAngle = Math.atan2(bodies.mars.position[1], bodies.mars.position[0]);
  const earthMarsPhase = normalizeAngle(earthAngle - marsAngle);
  const required = requiredLaunchPhase();
  const phaseError = shortestAngleDiff(earthMarsPhase, required);
  const marsRelative = vecSub(ship.position, bodies.mars.position);
  const marsRelativePhase = Math.atan2(marsRelative[1], marsRelative[0]);
  const marsRelativeVelocity = vecSub(ship.velocity, bodies.mars.velocity);
  const marsRelativeDistance = vecLen(marsRelative);
  const marsRelativeEnergy = marsRelativeDistance > 1e-20
    ? vecDot(marsRelativeVelocity, marsRelativeVelocity) / 2 - marsMu / marsRelativeDistance
    : -Infinity;
  const marsOrbitSma = marsRelativeEnergy < 0 ? -marsMu / (2 * marsRelativeEnergy) : Infinity;
  const marsOrbitEcc = computeEccentricity(marsRelative, marsRelativeVelocity, marsMu);
  const marsPeriapsis = marsRelativeEnergy < 0 && marsOrbitEcc < 1
    ? marsOrbitSma * (1 - marsOrbitEcc)
    : 0;
  const marsApoapsis = marsRelativeEnergy < 0 && marsOrbitEcc < 1
    ? marsOrbitSma * (1 + marsOrbitEcc)
    : Infinity;
  const earthRelative = vecSub(ship.position, bodies.earth.position);
  const earthRelativeVelocity = vecSub(ship.velocity, bodies.earth.velocity);
  const earthRelativeDistance = vecLen(earthRelative);
  const earthMu = G_AU * REAL_DATA.earth.mass;
  const earthRelativeEnergy = earthRelativeDistance > 1e-20
    ? vecDot(earthRelativeVelocity, earthRelativeVelocity) / 2 - earthMu / earthRelativeDistance
    : -Infinity;
  const earthVInf = earthRelativeEnergy > 0 ? Math.sqrt(2 * earthRelativeEnergy) : 0;
  const earthDepartureAngleDeg = angleBetween(earthRelativeVelocity, bodies.earth.velocity) * 180 / Math.PI;

  return {
    radius,
    speed,
    sma,
    ecc,
    apoapsis,
    periapsis,
    distEarth,
    distMars,
    earthMarsPhase,
    phaseError,
    marsRelativePhase,
    marsRelativeSpeed: vecLen(marsRelativeVelocity),
    marsDistanceRate: signedDistanceRate(ship.position, bodies.mars.position, ship.velocity, bodies.mars.velocity),
    marsRelativeEnergy,
    marsOrbitSma,
    marsOrbitEcc,
    marsPeriapsis,
    marsApoapsis,
    earthRelativeEnergy,
    earthRelativeSpeed: vecLen(earthRelativeVelocity),
    earthVInf,
    earthDepartureAngleDeg,
  };
}

function isEarthBound(current: Snapshot): boolean {
  return isNearEarth() && current.earthRelativeEnergy < 0;
}

function refreshMissionPhase(current: Snapshot): void {
  if (missionPhase === 'arrived') return;

  if (isStableMarsOrbit(current)) {
    missionPhase = 'arrived';
    return;
  }

  if (current.distMars <= marsCaptureStartAU) {
    missionPhase = 'marsApproach';
    return;
  }

  if (missionPhase === 'earthOrbit' && !isEarthBound(current)) {
    missionPhase = 'transfer';
  }
}

function requiredLaunchPhase(): number {
  const omegaMars = Math.sqrt(MU_SUN_AU / (marsSma ** 3));
  const transferSeconds = Math.PI * Math.sqrt((hohmannSma ** 3) / MU_SUN_AU);
  return normalizeAngle(omegaMars * transferSeconds - Math.PI);
}

function secondsUntilLaunchWindow(current: Snapshot): number {
  const omegaEarth = Math.sqrt(MU_SUN_AU / (earthSma ** 3));
  const omegaMars = Math.sqrt(MU_SUN_AU / (marsSma ** 3));
  let waitAngle = requiredLaunchPhase() - current.earthMarsPhase;
  if (waitAngle < 0) waitAngle += twoPi;
  return waitAngle / Math.abs(omegaEarth - omegaMars);
}

function jumpSecondsTowardLaunchWindow(current: Snapshot): number {
  const waitSeconds = secondsUntilLaunchWindow(current);
  if (waitSeconds > 2 * 86400) return waitSeconds - 86400;
  if (waitSeconds > 6 * 3600) return 3600;
  if (waitSeconds > 600) return 300;
  return Math.max(1, Math.min(waitSeconds, 60));
}

function secondsToMarsHillBoundary(current: Snapshot): number {
  const boundary = marsHillRadius * 1.2;
  const closingRate = Math.max(0, -current.marsDistanceRate);
  if (current.distMars <= boundary) return 0;
  if (closingRate <= 1e-14) return Infinity;
  return (current.distMars - boundary) / closingRate;
}

function keplerAdvanceShip(dtSec: number): boolean {
  const r0 = vecLen(ship.position);
  const v2 = vecDot(ship.velocity, ship.velocity);
  const sma = 1 / (2 / r0 - v2 / MU_SUN_AU);
  if (sma <= 0 || !Number.isFinite(sma) || sma > 100) return false;

  const hx = ship.position[1] * ship.velocity[2] - ship.position[2] * ship.velocity[1];
  const hy = ship.position[2] * ship.velocity[0] - ship.position[0] * ship.velocity[2];
  const hz = ship.position[0] * ship.velocity[1] - ship.position[1] * ship.velocity[0];
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (hMag < 1e-20) return false;

  const vxH: Vector3 = [
    ship.velocity[1] * hz - ship.velocity[2] * hy,
    ship.velocity[2] * hx - ship.velocity[0] * hz,
    ship.velocity[0] * hy - ship.velocity[1] * hx,
  ];
  const eccVector: Vector3 = [
    vxH[0] / MU_SUN_AU - ship.position[0] / r0,
    vxH[1] / MU_SUN_AU - ship.position[1] / r0,
    vxH[2] / MU_SUN_AU - ship.position[2] / r0,
  ];
  const ecc = vecLen(eccVector);
  const eClamp = Math.min(ecc, 0.9999);
  const rDotV = vecDot(ship.position, ship.velocity);
  const sinE0 = eClamp > 1e-15 ? rDotV / (eClamp * Math.sqrt(MU_SUN_AU * sma)) : 0;
  const cosE0 = eClamp > 1e-15 ? (1 - r0 / sma) / eClamp : 1;
  const e0 = Math.atan2(sinE0, cosE0);
  const mean0 = normalizeAngle(e0 - eClamp * Math.sin(e0));
  const meanMotion = Math.sqrt(MU_SUN_AU / (sma ** 3));
  const mean1 = normalizeAngle(mean0 + meanMotion * dtSec);

  let e1 = mean1;
  for (let i = 0; i < 50; i++) {
    const delta = (mean1 - e1 + eClamp * Math.sin(e1)) / (1 - eClamp * Math.cos(e1));
    e1 += delta;
    if (Math.abs(delta) < 1e-14) break;
  }

  const cosNu = (Math.cos(e1) - eClamp) / (1 - eClamp * Math.cos(e1));
  const sinNu = Math.sqrt(1 - eClamp * eClamp) * Math.sin(e1) / (1 - eClamp * Math.cos(e1));
  const nu1 = Math.atan2(sinNu, cosNu);
  const hNorm = vecScale([hx, hy, hz], 1 / hMag);
  const eNorm = ecc > 1e-15 ? vecScale(eccVector, 1 / ecc) : [1, 0, 0];
  const qNorm: Vector3 = [
    hNorm[1] * eNorm[2] - hNorm[2] * eNorm[1],
    hNorm[2] * eNorm[0] - hNorm[0] * eNorm[2],
    hNorm[0] * eNorm[1] - hNorm[1] * eNorm[0],
  ];

  const r1 = sma * (1 - eClamp * Math.cos(e1));
  const p = sma * (1 - eClamp * eClamp);
  const sqrtMuP = Math.sqrt(MU_SUN_AU / p);
  const xPlane = r1 * Math.cos(nu1);
  const yPlane = r1 * Math.sin(nu1);
  const vxPlane = -sqrtMuP * Math.sin(nu1);
  const vyPlane = sqrtMuP * (eClamp + Math.cos(nu1));

  ship.position = [
    eNorm[0] * xPlane + qNorm[0] * yPlane,
    eNorm[1] * xPlane + qNorm[1] * yPlane,
    eNorm[2] * xPlane + qNorm[2] * yPlane,
  ];
  ship.velocity = [
    eNorm[0] * vxPlane + qNorm[0] * vyPlane,
    eNorm[1] * vxPlane + qNorm[1] * vyPlane,
    eNorm[2] * vxPlane + qNorm[2] * vyPlane,
  ];
  return true;
}

function rk4AdvanceShip(dtSec: number): void {
  const maxSubStep = ship.thrustMagnitude > 0 ? burnSubStepSeconds : coastSubStepSeconds;
  const subStep = Math.min(maxSubStep, Math.max(0.001, dtSec));
  const steps = Math.max(1, Math.ceil(dtSec / subStep));
  const actualSubStep = dtSec / steps;

  for (let i = 0; i < steps; i++) {
    const stepStart = t + i * actualSubStep * 1000;
    rk4StepSpaceshipWithMovingBodies(
      ship,
      (offsetSec) => bodiesForAbsoluteTime(stepStart + offsetSec * 1000),
      actualSubStep,
    );
  }
}

function simulatePhysicsStep(dtSec: number): void {
  if (ship.thrustMagnitude > 0 || isNearEarth() || isNearMars()) {
    rk4AdvanceShip(dtSec);
  } else {
    const advanced = keplerAdvanceShip(dtSec);
    if (!advanced) rk4AdvanceShip(dtSec);
  }

  t += dtSec * 1000;
  refreshBodies(t);
}

function progradeDirection(): Vector3 {
  return vecNormalize(ship.velocity);
}

function retrogradeDirection(): Vector3 {
  return vecScale(progradeDirection(), -1);
}

function earthDepartureDirection(): Vector3 {
  return vecNormalize(vecSub(ship.velocity, bodies.earth.velocity));
}

function marsRelativeVelocityDirection(): Vector3 {
  return vecNormalize(vecSub(ship.velocity, bodies.mars.velocity));
}

function marsRelativeRetrogradeDirection(): Vector3 {
  return vecScale(marsRelativeVelocityDirection(), -1);
}

function marsRelativeProgradeDirection(): Vector3 {
  return marsRelativeVelocityDirection();
}

function directionToMars(): Vector3 {
  return vecNormalize(vecSub(bodies.mars.position, ship.position));
}

function marsClosingSpeedKmps(current: Snapshot): number {
  return Math.max(0, -current.marsDistanceRate * AU_TO_KM);
}

function activeFarMarsBurnMode(): FarMarsApproachMode | null {
  if (ship.thrustMagnitude <= 0) return null;

  const brakeAngle = angleBetween(ship.direction, marsRelativeRetrogradeDirection());
  const approachAngle = angleBetween(ship.direction, directionToMars());
  return brakeAngle <= approachAngle ? 'brake' : 'approach';
}

function chooseFarMarsApproachMode(current: Snapshot): FarMarsApproachMode {
  const relativeSpeedKmps = current.marsRelativeSpeed * AU_TO_KM;
  const closingSpeedKmps = marsClosingSpeedKmps(current);
  const activeMode = activeFarMarsBurnMode();

  if (activeMode === 'brake') {
    return relativeSpeedKmps > farMarsBrakeReleaseSpeedKmps || closingSpeedKmps > farMarsTargetClosingKmps
      ? 'brake'
      : 'coast';
  }

  if (activeMode === 'approach') {
    return closingSpeedKmps < farMarsTargetClosingKmps && relativeSpeedKmps < farMarsBrakeSpeedKmps
      ? 'approach'
      : 'coast';
  }

  if (relativeSpeedKmps > farMarsBrakeSpeedKmps || closingSpeedKmps > farMarsMaxClosingKmps) {
    return 'brake';
  }

  if (closingSpeedKmps < farMarsMinClosingKmps) {
    return 'approach';
  }

  return 'coast';
}

function farMarsApproachDirection(mode: FarMarsApproachMode): Vector3 {
  return mode === 'brake' ? marsRelativeRetrogradeDirection() : directionToMars();
}

function correctionDirectionForSma(currentSma: number, targetSma: number): Vector3 {
  return currentSma > targetSma ? retrogradeDirection() : progradeDirection();
}

function isStableMarsOrbit(current: Snapshot): boolean {
  return current.marsRelativeEnergy < 0
    && current.marsPeriapsis > marsSafeOrbitRadius
    && current.marsApoapsis < marsStableApoapsis
    && current.marsOrbitEcc < marsStableEccentricity
    && current.distMars < marsStableApoapsis;
}

function isMarsBound(current: Snapshot): boolean {
  return current.marsRelativeEnergy < 0
    && Number.isFinite(current.marsOrbitSma)
    && Number.isFinite(current.marsApoapsis)
    && current.marsOrbitEcc < 1;
}

function isNearMarsApoapsis(current: Snapshot): boolean {
  if (!isMarsBound(current)) return false;
  const tolerance = Math.max(current.marsApoapsis * 0.04, marsSafeOrbitRadius);
  return Math.abs(current.distMars - current.marsApoapsis) <= tolerance;
}

function isNearMarsPeriapsis(current: Snapshot): boolean {
  if (!isMarsBound(current)) return false;
  const tolerance = Math.max(current.marsPeriapsis * 0.35, marsSafeOrbitRadius * 0.8);
  return Math.abs(current.distMars - current.marsPeriapsis) <= tolerance;
}

function applyShipDirection(direction: Vector3): void {
  const normalized = vecNormalize(direction);
  if (vecLen(normalized) > 0) ship.direction = normalized;
  if (ship.thrustMagnitude > 0) {
    ship.thrust = applyThrustInBodyFrame(1, 0, 0, ship.thrustMagnitude, ship.direction);
  }
}

function ignite(thrustMagnitude: number, direction: Vector3): void {
  applyShipDirection(direction);
  ship.thrustMagnitude = thrustMagnitude;
  ship.thrust = applyThrustInBodyFrame(1, 0, 0, thrustMagnitude, ship.direction);
  ship.gear = Math.max(1, Math.min(5, Math.ceil(thrustMagnitude / 20)));
}

function cutoff(): void {
  ship.thrust = [0, 0, 0];
  ship.thrustMagnitude = 0;
  ship.gear = 0;
}

function jumpTime(waitSeconds: number): number {
  const actualWaitSeconds = Math.max(1, waitSeconds);
  t += actualWaitSeconds * 1000;
  refreshBodies(t);
  ship = makeMissionShip(t);
  cutoff();
  timeScale = 1;
  return actualWaitSeconds;
}

function chooseCoastTimeScale(current: Snapshot): number {
  if (missionPhase === 'marsApproach' && current.distMars > marsHillRadius * 1.2) {
    const secondsToHillBoundary = secondsToMarsHillBoundary(current);
    if (secondsToHillBoundary > 30 * 86400) return 10000;
    if (secondsToHillBoundary > 5 * 86400) return 1000;
    if (secondsToHillBoundary > 86400) return 100;
    if (secondsToHillBoundary > 1800) return 10;
    return 1;
  }

  if (current.distMars > 1.0) return 100000;
  if (current.distMars > 0.5) return 10000;
  if (current.distMars > 0.1) return 1000;
  if (current.distMars > 0.05) return 100;
  if (current.distMars > marsCaptureStartAU) return 10;
  if (current.distMars > marsHillRadius * 1.5) return 1;
  return 0.1;
}

function condition(label: string, current: number, target: number, unit: string, satisfied: boolean): GuidanceCondition {
  return { label, current, target, unit, satisfied };
}

function chooseBoundMarsOrbitCoastTimeScale(current: Snapshot, targetApsis?: 'apoapsis' | 'periapsis'): number {
  if (targetApsis === 'apoapsis' && isNearMarsApoapsis(current)) return 1;
  if (targetApsis === 'periapsis' && isNearMarsPeriapsis(current)) return 1;
  if (!targetApsis && (isNearMarsApoapsis(current) || isNearMarsPeriapsis(current))) return 1;
  if (current.distMars > 0.001) return 10000;
  if (current.distMars > marsSafeOrbitRadius * 4) return 1000;
  if (current.distMars > marsSafeOrbitRadius * 2) return 100;
  return 10;
}

function guidanceForDirection(
  plan: NavigationPlan,
  title: string,
  target: string,
  direction: Vector3,
  thrustMagnitude: number,
  conditionValue: GuidanceCondition,
  reason: string,
): Guidance {
  const angleDeg = angleBetween(ship.direction, direction) * 180 / Math.PI;
  if (angleDeg > directionToleranceDeg) {
    return {
      action: 'turn',
      title: '调整方向',
      target,
      plan,
      direction,
      thrustMagnitude: ship.thrustMagnitude,
      nextTimeScale: ship.thrustMagnitude > 0 ? burnTimeScale : 1,
      waitSeconds: 0,
      condition: condition('船身夹角', angleDeg, directionToleranceDeg, 'deg', false),
      reason,
    };
  }

  return {
    action: 'ignite',
    title,
    target,
    plan,
    direction,
    thrustMagnitude,
    nextTimeScale: burnTimeScale,
    waitSeconds: 0,
    condition: conditionValue,
    reason,
  };
}

function createBoundMarsOrbitGuidance(current: Snapshot, plan: NavigationPlan): Guidance | null {
  if (!isMarsBound(current) || isStableMarsOrbit(current)) return null;

  const needsRaisePeriapsis = current.marsPeriapsis <= marsSafeOrbitRadius;
  const needsLowerApoapsis = current.marsApoapsis >= marsStableApoapsis
    || current.marsOrbitEcc >= marsStableEccentricity;
  const raisingDirection = marsRelativeProgradeDirection();
  const loweringDirection = marsRelativeRetrogradeDirection();

  if (ship.thrustMagnitude > 0) {
    const raising = angleBetween(ship.direction, raisingDirection) <= angleBetween(ship.direction, loweringDirection);
    const direction = raising ? raisingDirection : loweringDirection;
    const reached = raising
      ? current.marsPeriapsis > marsSafeOrbitRadius * 1.08
      : current.marsApoapsis < marsStableApoapsis
        || current.marsPeriapsis <= marsSafeOrbitRadius * 1.02;

    if (reached) {
      return {
        action: 'cutoff',
        title: '熄火',
        target: raising ? '提高近火点完成' : '降低远火点阶段完成',
        plan,
        direction,
        thrustMagnitude: 0,
        nextTimeScale: chooseBoundMarsOrbitCoastTimeScale(current),
        waitSeconds: 0,
        condition: raising
          ? condition('近火点', current.marsPeriapsis, marsSafeOrbitRadius, 'AU', true)
          : condition('远火点', current.marsApoapsis, marsStableApoapsis, 'AU', current.marsApoapsis < marsStableApoapsis),
        reason: raising
          ? '近火点已提高到安全高度，熄火后重新导航'
          : '远火点已降低或近火点接近安全下限，熄火后重新导航',
      };
    }

    return guidanceForDirection(
      plan,
      raising ? '点火提高近火点' : '点火降低远火点',
      raising ? '火星远火点顺向修正' : '火星近火点反向圆化',
      direction,
      35,
      raising
        ? condition('近火点', current.marsPeriapsis, marsSafeOrbitRadius, 'AU', false)
        : condition('远火点', current.marsApoapsis, marsStableApoapsis, 'AU', false),
      raising
        ? '火星束缚轨道近火点过低，在远火点附近顺向点火抬升近火点'
        : '火星束缚轨道远火点过大，在近火点附近反向点火降低远火点',
    );
  }

  if (needsRaisePeriapsis) {
    if (!isNearMarsApoapsis(current)) {
      return {
        action: 'coast',
        title: '滑行到远火点',
        target: '远火点提高近火点',
        plan,
        direction: raisingDirection,
        thrustMagnitude: 0,
        nextTimeScale: chooseBoundMarsOrbitCoastTimeScale(current, 'apoapsis'),
        waitSeconds: 0,
        condition: condition('距远火点差', Math.abs(current.distMars - current.marsApoapsis), marsSafeOrbitRadius, 'AU', false),
        reason: '火星束缚轨道近火点过低，先滑行到远火点再顺向点火',
      };
    }

    return guidanceForDirection(
      plan,
      '点火提高近火点',
      '火星远火点顺向修正',
      raisingDirection,
      35,
      condition('近火点', current.marsPeriapsis, marsSafeOrbitRadius, 'AU', false),
      '火星束缚轨道近火点过低，在远火点附近顺向点火抬升近火点',
    );
  }

  if (needsLowerApoapsis) {
    if (!isNearMarsPeriapsis(current)) {
      return {
        action: 'coast',
        title: '滑行到近火点',
        target: '近火点降低远火点',
        plan,
        direction: loweringDirection,
        thrustMagnitude: 0,
        nextTimeScale: chooseBoundMarsOrbitCoastTimeScale(current, 'periapsis'),
        waitSeconds: 0,
        condition: condition('距近火点差', Math.abs(current.distMars - current.marsPeriapsis), marsSafeOrbitRadius, 'AU', false),
        reason: '火星束缚轨道远火点过大，先滑行到近火点再反向点火',
      };
    }

    return guidanceForDirection(
      plan,
      '点火降低远火点',
      '火星近火点反向圆化',
      loweringDirection,
      35,
      condition('远火点', current.marsApoapsis, marsStableApoapsis, 'AU', false),
      '火星束缚轨道远火点过大，在近火点附近反向点火降低远火点',
    );
  }

  return null;
}

function createGuidance(current: Snapshot): Guidance {
  const plan = planHohmannTransfer(ship.position, ship.velocity, 'mars', t);
  const direction = missionPhase === 'earthOrbit' ? earthDepartureDirection() : progradeDirection();
  const launchWindowOpen = current.phaseError <= launchWindowToleranceRad;
  const targetDepartureSma = hohmannSma;
  const departureTolerance = 0.008;

  if (isStableMarsOrbit(current)) {
    return {
      action: 'arrived',
      title: '已进入火星绕飞轨道',
      target: '火星束缚轨道',
      plan,
      direction,
      thrustMagnitude: 0,
      nextTimeScale: 1,
      waitSeconds: 0,
      condition: condition('火星相对能量', current.marsRelativeEnergy, 0, 'AU^2/s^2', true),
      reason: `能量为负，近火点 ${au(current.marsPeriapsis)}，远火点 ${au(current.marsApoapsis)}，偏心率 ${formatNumber(current.marsOrbitEcc, 4)}`,
    };
  }

  const boundMarsOrbitGuidance = createBoundMarsOrbitGuidance(current, plan);
  if (boundMarsOrbitGuidance) return boundMarsOrbitGuidance;

  if (ship.thrustMagnitude > 0) {
    const inMarsCapture = missionPhase === 'marsApproach' || current.distMars <= marsCaptureStartAU;
    const inEarthDeparture = missionPhase === 'earthOrbit';
    const inTransferCorrection = missionPhase === 'transfer';
    const farMarsApproach = inMarsCapture && current.distMars > marsHillRadius * 1.2;
    const farMarsMode = farMarsApproach ? chooseFarMarsApproachMode(current) : 'coast';

    if (farMarsApproach && farMarsMode === 'coast') {
      return {
        action: 'cutoff',
        title: '熄火滑行',
        target: '火星远距离接近',
        plan,
        direction: directionToMars(),
        thrustMagnitude: 0,
        nextTimeScale: chooseCoastTimeScale(current),
        waitSeconds: 0,
        condition: condition('火星闭合速度', marsClosingSpeedKmps(current), farMarsTargetClosingKmps, 'km/s', true),
        reason: '远距离接近速度已受控，先熄火滑行，避免在相对制动和朝火星接近之间来回翻转',
      };
    }

    const targetSma = targetDepartureSma;
    const desiredDirection = inMarsCapture
      ? (farMarsApproach
          ? farMarsApproachDirection(farMarsMode)
          : current.marsPeriapsis > 0 && current.marsPeriapsis < marsSafeOrbitRadius
          ? marsRelativeProgradeDirection()
          : marsRelativeRetrogradeDirection())
      : inEarthDeparture
        ? earthDepartureDirection()
        : inTransferCorrection
          ? (current.apoapsis < marsSma ? progradeDirection() : retrogradeDirection())
          : correctionDirectionForSma(current.sma, targetSma);
    const shipAligned = angleBetween(ship.direction, desiredDirection) * 180 / Math.PI <= directionToleranceDeg;
    const reached = inMarsCapture
      ? (farMarsApproach
          ? false
          : isStableMarsOrbit(current))
      : inEarthDeparture
        ? current.earthRelativeEnergy >= targetDepartureEnergy
        : inTransferCorrection
          ? Math.abs(current.apoapsis - marsSma) <= 0.015
          : Math.abs(current.sma - targetSma) <= departureTolerance;
    if (reached) {
      return {
        action: 'cutoff',
        title: '熄火',
        target: inMarsCapture
          ? (farMarsApproach ? '火星远距离接近' : '火星束缚轨道')
          : (inEarthDeparture ? '地球逃逸 v∞' : '转移远日点'),
        plan,
        direction: desiredDirection,
        thrustMagnitude: 0,
        nextTimeScale: 1,
        waitSeconds: 0,
        condition: inMarsCapture
          ? condition('火星相对能量', current.marsRelativeEnergy, 0, 'AU^2/s^2', true)
          : inEarthDeparture
            ? condition('地球 v∞', current.earthVInf, targetDepartureVInf, 'AU/s', true)
            : inTransferCorrection
              ? condition('远日点', current.apoapsis, marsSma, 'AU', true)
          : condition('轨道半长轴', current.sma, targetSma, 'AU', true),
        reason: inEarthDeparture
          ? '地球相对能量已达到霍曼转移所需逃逸余速，执行熄火'
          : '当前导航目标已达到，执行熄火避免过冲',
      };
    }

    if (!shipAligned) {
      return {
        action: 'turn',
        title: '调整方向',
        target: inMarsCapture
          ? (current.distMars > marsHillRadius * 1.2
              ? (farMarsMode === 'brake' ? '火星远距离相对制动' : '火星远距离小推力接近')
              : '火星相对速度修正方向')
          : inEarthDeparture
            ? '地球公转顺行逃逸方向'
            : inTransferCorrection
              ? (current.apoapsis < marsSma ? '提高远日点' : '降低远日点')
              : (current.sma > targetSma ? '反向修正推力方向' : '顺向推力方向'),
        plan,
        direction: desiredDirection,
        thrustMagnitude: ship.thrustMagnitude,
        nextTimeScale: burnTimeScale,
        waitSeconds: 0,
        condition: condition('船身夹角', angleBetween(ship.direction, desiredDirection) * 180 / Math.PI, directionToleranceDeg, 'deg', false),
        reason: '燃烧期间根据最新导航保持船身朝向修正方向',
      };
    }

    return {
      action: 'ignite',
      title: '持续点火',
      target: inMarsCapture
        ? (current.distMars > marsHillRadius * 1.2
            ? (farMarsMode === 'brake' ? '火星远距离相对制动' : '火星远距离小推力接近')
            : '火星相对捕获制动')
        : inEarthDeparture
          ? '地球逃逸 v∞'
          : inTransferCorrection
            ? (current.apoapsis < marsSma ? '补燃提高远日点' : '反向降低远日点')
        : (current.sma > targetSma ? '转移轨道反向修正' : '提升远日点'),
      plan,
      direction: desiredDirection,
      thrustMagnitude: ship.thrustMagnitude,
      nextTimeScale: burnTimeScale,
      waitSeconds: 0,
      condition: inMarsCapture
        ? (current.distMars > marsHillRadius * 1.2
            ? condition(
                farMarsMode === 'brake' ? '火星相对速度' : '火星闭合速度',
                farMarsMode === 'brake' ? current.marsRelativeSpeed * AU_TO_KM : marsClosingSpeedKmps(current),
                farMarsMode === 'brake' ? farMarsBrakeReleaseSpeedKmps : farMarsTargetClosingKmps,
                'km/s',
                false,
              )
            : condition('火星相对能量', current.marsRelativeEnergy, 0, 'AU^2/s^2', current.marsRelativeEnergy < 0))
        : inEarthDeparture
          ? condition('地球 v∞', current.earthVInf, targetDepartureVInf, 'AU/s', false)
          : inTransferCorrection
            ? condition('远日点', current.apoapsis, marsSma, 'AU', false)
        : condition('轨道半长轴', current.sma, targetSma, 'AU', false),
      reason: farMarsApproach
        ? (farMarsMode === 'brake'
            ? '火星远距离接近速度过高，继续沿相对速度反向制动'
            : '火星远距离闭合速度不足，继续小推力朝火星接近')
        : '目标半长轴尚未达到，保持当前点火操作',
    };
  }

  if (missionPhase === 'earthOrbit') {
    const shipAligned = angleBetween(ship.direction, direction) * 180 / Math.PI <= directionToleranceDeg;
    const departurePhaseAligned = current.earthDepartureAngleDeg <= earthDepartureAngleToleranceDeg;
    if (!launchWindowOpen) {
      const waitSeconds = jumpSecondsTowardLaunchWindow(current);
      return {
        action: 'jumpTime',
        title: '等待霍曼转移窗口',
        target: '地火日心夹角',
        plan,
        direction,
        thrustMagnitude: 0,
        nextTimeScale: 1,
        waitSeconds,
        condition: condition('地火相位误差', current.phaseError, launchWindowToleranceRad, 'rad', false),
        reason: `窗口未对齐，本轮推进 ${formatNumber(waitSeconds / 86400, 3)} 天，避免跳过窗口`,
      };
    }

    if (!departurePhaseAligned) {
      return {
        action: 'coast',
        title: '等待绕飞点火相位',
        target: '地球绕飞顺行相位',
        plan,
        direction,
        thrustMagnitude: 0,
        nextTimeScale: 0.2,
        waitSeconds: 0,
        condition: condition('绕飞速度夹角', current.earthDepartureAngleDeg, earthDepartureAngleToleranceDeg, 'deg', false),
        reason: '地火窗口已满足，但飞船尚未绕到顺行逃逸点，继续低倍率滑行等待',
      };
    }

    if (!shipAligned) {
      return {
        action: 'turn',
        title: '调整方向',
        target: '出发顺向',
        plan,
        direction,
        thrustMagnitude: 0,
        nextTimeScale: 1,
        waitSeconds: 0,
        condition: condition('船身夹角', angleBetween(ship.direction, direction) * 180 / Math.PI, directionToleranceDeg, 'deg', false),
        reason: '窗口已开启，先将船身对准顺向推力方向',
      };
    }

    return {
      action: 'ignite',
      title: '点火提升远日点',
      target: '霍曼转移半长轴',
      plan,
      direction,
      thrustMagnitude: 100,
      nextTimeScale: burnTimeScale,
      waitSeconds: 0,
      condition: condition('地火相位误差', current.phaseError, launchWindowToleranceRad, 'rad', true),
      reason: '地火窗口满足，开始出发点火',
    };
  }

  if (missionPhase === 'marsApproach' || current.distMars <= marsCaptureStartAU) {
    const farMarsApproach = current.distMars > marsHillRadius * 1.2;
    const farMarsMode = farMarsApproach ? chooseFarMarsApproachMode(current) : 'coast';
    const needsRaisePeriapsis = current.marsRelativeEnergy < 0
      && current.marsPeriapsis > 0
      && current.marsPeriapsis < marsSafeOrbitRadius;

    if (farMarsApproach && farMarsMode === 'coast') {
      const coastScale = chooseCoastTimeScale(current);
      return {
        action: 'coast',
        title: '远距离接近速度已受控',
        target: '火星希尔球外沿',
        plan,
        direction: directionToMars(),
        thrustMagnitude: 0,
        nextTimeScale: coastScale,
        waitSeconds: 0,
        condition: condition('距火星', current.distMars, marsHillRadius * 1.2, 'AU', false),
        reason: `相对速度 ${formatNumber(current.marsRelativeSpeed * AU_TO_KM, 2)} km/s，闭合速度 ${formatNumber(marsClosingSpeedKmps(current), 2)} km/s，先滑行避免操作振荡`,
      };
    }

    const captureDirection = farMarsApproach
      ? farMarsApproachDirection(farMarsMode)
      : needsRaisePeriapsis
      ? marsRelativeProgradeDirection()
      : marsRelativeRetrogradeDirection();
    const shipAligned = angleBetween(ship.direction, captureDirection) * 180 / Math.PI <= directionToleranceDeg;
    if (!shipAligned) {
      return {
        action: 'turn',
        title: '调整方向',
        target: farMarsApproach
          ? (farMarsMode === 'brake' ? '远距离相对制动' : '朝火星接近')
          : needsRaisePeriapsis ? '提高近火点' : '火星捕获制动',
        plan,
        direction: captureDirection,
        thrustMagnitude: 0,
        nextTimeScale: 1,
        waitSeconds: 0,
        condition: condition('船身夹角', angleBetween(ship.direction, captureDirection) * 180 / Math.PI, directionToleranceDeg, 'deg', false),
        reason: '已进入火星接近段，按最新火星相对轨道先对准捕获推力方向',
      };
    }

    return {
      action: 'ignite',
      title: farMarsApproach
        ? (farMarsMode === 'brake' ? '点火降低火星相对速度' : '点火接近火星')
        : needsRaisePeriapsis ? '点火提高近火点' : '点火捕获火星',
      target: '火星束缚轨道',
      plan,
      direction: captureDirection,
      thrustMagnitude: farMarsApproach && farMarsMode === 'approach' ? 15 : 100,
      nextTimeScale: burnTimeScale,
      waitSeconds: 0,
      condition: farMarsApproach
        ? condition(
            farMarsMode === 'brake' ? '火星相对速度' : '火星闭合速度',
            farMarsMode === 'brake' ? current.marsRelativeSpeed * AU_TO_KM : marsClosingSpeedKmps(current),
            farMarsMode === 'brake' ? farMarsBrakeReleaseSpeedKmps : farMarsTargetClosingKmps,
            'km/s',
            false,
          )
        : condition('火星相对能量', current.marsRelativeEnergy, 0, 'AU^2/s^2', current.marsRelativeEnergy < 0),
      reason: farMarsApproach
        ? (farMarsMode === 'brake'
            ? '远距离接近火星，相对速度或闭合速度过高，先削减速度'
            : '远距离接近火星，闭合速度不足，沿火星方向小推力缩短距离')
        : needsRaisePeriapsis
        ? '已被火星捕获但近火点过低，按最新导航补救'
        : '接近火星，沿火星相对速度反向制动以进入束缚轨道',
    };
  }

  if (missionPhase === 'transfer' && current.distMars > marsCaptureStartAU
      && current.distEarth > earthHillRadius * 1.5
      && Math.abs(current.apoapsis - marsSma) > 0.02) {
    const transferDirection = current.apoapsis < marsSma ? progradeDirection() : retrogradeDirection();
    const shipAligned = angleBetween(ship.direction, transferDirection) * 180 / Math.PI <= directionToleranceDeg;
    if (!shipAligned) {
      return {
        action: 'turn',
        title: '调整方向',
        target: current.apoapsis > marsSma ? '转移轨道反向修正' : '转移轨道顺向修正',
        plan,
        direction: transferDirection,
        thrustMagnitude: 0,
        nextTimeScale: 1,
        waitSeconds: 0,
        condition: condition('远日点偏差', Math.abs(current.apoapsis - marsSma), 0.02, 'AU', false),
        reason: '重新导航发现转移远日点无法到达火星轨道，先调整船身',
      };
    }

    return {
      action: 'ignite',
      title: current.apoapsis > marsSma ? '反向修正转移轨道' : '顺向修正转移轨道',
      target: '火星轨道远日点',
      plan,
      direction: transferDirection,
      thrustMagnitude: 60,
      nextTimeScale: burnTimeScale,
      waitSeconds: 0,
      condition: condition('远日点偏差', Math.abs(current.apoapsis - marsSma), 0.02, 'AU', false),
      reason: '上一轮操作偏差导致远日点偏离火星轨道，按最新导航补救',
    };
  }

  const coastScale = chooseCoastTimeScale(current);
  return {
    action: 'coast',
    title: '滑行',
    target: '火星接近段',
    plan,
    direction,
    thrustMagnitude: 0,
    nextTimeScale: coastScale,
    waitSeconds: 0,
    condition: condition('距火星', current.distMars, marsCaptureStartAU, 'AU', current.distMars <= marsCaptureStartAU),
    reason: current.marsDistanceRate < 0
      ? '正在接近火星，按距离逐步降低时间倍率'
      : '当前相位仍需滑行，保持每轮重新规划',
  };
}

function executeGuidance(guidance: Guidance): OperationResult {
  switch (guidance.action) {
    case 'jumpTime': {
      const jumped = jumpTime(guidance.waitSeconds);
      return { performed: true, label: `jumpTime +${formatNumber(jumped / 86400, 2)} d` };
    }
    case 'ignite': {
      ignite(guidance.thrustMagnitude, guidance.direction);
      timeScale = guidance.nextTimeScale;
      return { performed: true, label: `ignite ${guidance.thrustMagnitude}% gear=${ship.gear} timeScale=${formatNumber(timeScale, 4)}` };
    }
    case 'cutoff': {
      cutoff();
      timeScale = guidance.nextTimeScale;
      if (missionPhase === 'earthOrbit') missionPhase = 'transfer';
      return { performed: true, label: `cutoff gear=${ship.gear} timeScale=${formatNumber(timeScale, 1)}` };
    }
    case 'turn': {
      applyShipDirection(guidance.direction);
      timeScale = guidance.nextTimeScale;
      return { performed: true, label: `turn prograde angle=${formatNumber(angleBetween(ship.direction, guidance.direction) * 180 / Math.PI, 3)} deg` };
    }
    case 'coast': {
      cutoff();
      const changed = Math.abs(timeScale - guidance.nextTimeScale) > 1e-9;
      timeScale = guidance.nextTimeScale;
      return { performed: changed, label: changed ? `set timeScale=${formatNumber(timeScale, 1)}` : `coast timeScale=${formatNumber(timeScale, 1)}` };
    }
    case 'arrived': {
      cutoff();
      timeScale = 1;
      missionPhase = 'arrived';
      return { performed: true, label: 'arrived: stop simulation controls' };
    }
  }
}

function bodySummary(body: BodyState): string {
  return `${body.id} r=${au(vecLen(body.position))} v=${kmPerSec(vecLen(body.velocity))} pos=(${body.position.map((v) => formatNumber(v, 5)).join(',')})`;
}

function logLoop(iter: number, dtSec: number, current: Snapshot, guidance: Guidance, operation: OperationResult): void {
  logFileOnly(`[LOOP] #${iter} T+${missionDays(t)} dt=${formatNumber(dtSec, 3)}s timeScale=${formatNumber(timeScale, 4)}`);
  logFileOnly(`[BODIES] ${bodySummary(bodies.sun)} | ${bodySummary(bodies.earth)} | ${bodySummary(bodies.mars)}`);
  logFileOnly(
    `[STATE] ship r=${au(current.radius)} v=${kmPerSec(current.speed)} ` +
    `sma=${au(current.sma)} ecc=${formatNumber(current.ecc, 5)} apo=${au(current.apoapsis)} ` +
    `distEarth=${au(current.distEarth)} distMars=${au(current.distMars)} marsVr=${kmPerSec(current.marsDistanceRate)} ` +
    `marsV=${kmPerSec(current.marsRelativeSpeed)} marsEnergy=${formatNumber(current.marsRelativeEnergy, 12)} ` +
    `marsA=${au(current.marsOrbitSma)} marsEcc=${formatNumber(current.marsOrbitEcc, 5)} ` +
    `marsPe=${au(current.marsPeriapsis)} marsAp=${au(current.marsApoapsis)} marsHill=${au(marsHillRadius)} ` +
    `thrust=${formatNumber(ship.thrustMagnitude, 1)}% gear=${ship.gear} missionPhase=${missionPhase} ` +
    `earthV=${kmPerSec(current.earthRelativeSpeed)} earthVInf=${kmPerSec(current.earthVInf)} ` +
    `earthDepartAngle=${formatNumber(current.earthDepartureAngleDeg, 2)}deg ` +
    `earthEnergy=${formatNumber(current.earthRelativeEnergy, 12)} dir=(${ship.direction.map((v) => formatNumber(v, 5)).join(',')})`,
  );
  logFileOnly(
    `[GUIDANCE] action=${guidance.action} title=${guidance.title} target=${guidance.target} ` +
    `condition=${guidance.condition.label} current=${formatNumber(guidance.condition.current, 6)}${guidance.condition.unit} ` +
    `target=${formatNumber(guidance.condition.target, 6)}${guidance.condition.unit} satisfied=${guidance.condition.satisfied} ` +
    `route=${guidance.plan.phases.map((phase) => phase.name).join(' -> ')} reason=${guidance.reason}`,
  );
  logFileOnly(`[ACTION] performed=${operation.performed} ${operation.label}`);
}

function shouldEcho(iter: number, guidance: Guidance, operation: OperationResult): boolean {
  return guidance.action === 'arrived'
    || guidance.action === 'jumpTime'
    || guidance.action === 'cutoff'
    || guidance.action === 'turn' && iter % 100 === 0
    || operation.performed && guidance.action === 'coast'
    || guidance.action === 'coast' && guidance.condition.current < 0.2 && iter % 200 === 0
    || iter % 500 === 0;
}

function echoLoop(iter: number, current: Snapshot, guidance: Guidance, operation: OperationResult): void {
  logEvent(
    `#${iter} T+${missionDays(t)} ${guidance.title} | ` +
    `r=${au(current.radius)} sma=${au(current.sma)} ecc=${formatNumber(current.ecc, 4)} ` +
    `distMars=${au(current.distMars)} marsV=${kmPerSec(current.marsRelativeSpeed)} ` +
    `marsE=${formatNumber(current.marsRelativeEnergy, 12)} | ${operation.label}`,
  );
}

function logHeader(): void {
  const initial = snapshot();
  logEvent('============================================================');
  logEvent('飞行参数日志：地球 -> 火星');
  logEvent(`起始时间: ${new Date(t).toISOString()}`);
  logEvent(`发动机: max=${formatNumber(SPACECRAFT_CONFIG.maxThrustAU * AU_TO_KM, 2)} km/s^2`);
  logEvent(`霍曼转移: earth=${au(earthSma)} mars=${au(marsSma)} transfer=${au(hohmannSma)}`);
  logEvent(`初始: distEarth=${au(initial.distEarth)} distMars=${au(initial.distMars)} phase=${deg(initial.earthMarsPhase)} required=${deg(requiredLaunchPhase())}`);
  logEvent('============================================================');
}

function logFooter(iterations: number, current: Snapshot, arrived: boolean): void {
  const smaError = Math.abs(current.sma - marsSma) / marsSma;
  logEvent('');
  logEvent('============================================================');
  logEvent(`飞行耗时: T+${missionDays(t)} · ${iterations} 轮`);
  logEvent(`最终距火星: ${au(current.distMars)} (${formatNumber(current.distMars * AU_TO_KM / 1e6, 2)} million km)`);
  logEvent(`最终 SMA: ${au(current.sma)} · 火星 SMA ${au(marsSma)} · 误差 ${formatNumber(smaError * 100, 2)}%`);
  logEvent(`最终偏心率: ${formatNumber(current.ecc, 5)} · 日心速度 ${kmPerSec(current.speed)} · 相对火星速度 ${kmPerSec(current.marsRelativeSpeed)}`);
  logEvent(
    `火星绕飞: energy=${formatNumber(current.marsRelativeEnergy, 12)} ` +
    `a=${au(current.marsOrbitSma)} ecc=${formatNumber(current.marsOrbitEcc, 5)} ` +
    `periapsis=${au(current.marsPeriapsis)} apoapsis=${au(current.marsApoapsis)} hill=${au(marsHillRadius)}`,
  );
  logEvent(arrived ? '✅ 成功进入火星绕飞轨道' : '⚠️ 未达标');
  logEvent('============================================================');
}

async function main(): Promise<void> {
  initializeMission();
  logHeader();

  let arrived = false;
  let completedIterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    const dtSec = Math.max(0.001, simStepSeconds * timeScale);
    simulatePhysicsStep(dtSec);

    const current = snapshot();
    refreshMissionPhase(current);
    const guidance = createGuidance(current);
    const operation = executeGuidance(guidance);
    refreshMissionPhase(snapshot());

    logLoop(iter, dtSec, current, guidance, operation);
    if (shouldEcho(iter, guidance, operation)) echoLoop(iter, current, guidance, operation);

    completedIterations = iter + 1;
    if (guidance.action === 'arrived') {
      arrived = true;
      break;
    }
  }

  const finalSnapshot = snapshot();
  logFooter(completedIterations, finalSnapshot, arrived);
  commitLog();
  console.log(`日志保存: ${LOG_FILE} (${LOG_LINES.length} 行)`);

  if (!arrived) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
