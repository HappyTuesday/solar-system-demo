import type { SpaceshipState } from '../types';
import { SPACESHIP, PHYSICAL_CONSTANTS, REAL_DATA, G_AU, AU_TO_M } from './constants';
import { vec3Length } from './physics';

const EARTH_SO = 0.003; // Earth sphere of influence in AU

export function createSpaceshipState(): SpaceshipState {
  const earthOrbitAU = 1.0;
  const pos: [number, number, number] = [
    earthOrbitAU + EARTH_SO,
    0,
    0,
  ];

  const earthOrbitalSpeedAU = (REAL_DATA.earth.orbitalSpeed ?? 29780) / AU_TO_M;
  const orbitSpeed = Math.sqrt(
    (G_AU * REAL_DATA.earth.mass) /
    (EARTH_SO * AU_TO_M)
  );
  const orbitSpeedAU = orbitSpeed / AU_TO_M;

  const vel: [number, number, number] = [
    0,
    earthOrbitalSpeedAU + orbitSpeedAU,
    0,
  ];

  const dir: [number, number, number] = [0, 1, 0];

  return {
    position: pos,
    velocity: vel,
    direction: dir,
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
  };
}

function vec3Normalize(v: [number, number, number]): [number, number, number] {
  const len = vec3Length(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function applyThrustInBodyFrame(
  forwardBack: number,
  leftRight: number,
  upDown: number,
  magnitude: number,
  direction: [number, number, number],
): [number, number, number] {
  if (magnitude <= 0) return [0, 0, 0];

  const dir = vec3Normalize(direction);

  const refUp: [number, number, number] =
    Math.abs(dir[2]) > 0.9999 ? [0, 1, 0] : [0, 0, 1];

  const right = vec3Normalize([
    dir[1] * refUp[2] - dir[2] * refUp[1],
    dir[2] * refUp[0] - dir[0] * refUp[2],
    dir[0] * refUp[1] - dir[1] * refUp[0],
  ]);
  const up = vec3Normalize([
    right[1] * dir[2] - right[2] * dir[1],
    right[2] * dir[0] - right[0] * dir[2],
    right[0] * dir[1] - right[1] * dir[0],
  ]);

  const thrustAccel = SPACESHIP.maxThrustAU * (magnitude / 100);
  const tx = dir[0] * forwardBack * thrustAccel +
            right[0] * leftRight * thrustAccel +
            up[0] * upDown * thrustAccel;
  const ty = dir[1] * forwardBack * thrustAccel +
            right[1] * leftRight * thrustAccel +
            up[1] * upDown * thrustAccel;
  const tz = dir[2] * forwardBack * thrustAccel +
            right[2] * leftRight * thrustAccel +
            up[2] * upDown * thrustAccel;

  return [tx, ty, tz];
}

export interface BodyInfo {
  position: [number, number, number];
  mass: number;
  radius: number;
}

export function computeSpaceshipAcceleration(
  spaceship: SpaceshipState,
  bodies: BodyInfo[],
  softening: number = PHYSICAL_CONSTANTS.softeningFactor,
): [number, number, number] {
  let ax = 0, ay = 0, az = 0;
  const [sx, sy, sz] = spaceship.position;

  for (const body of bodies) {
    const dx = sx - body.position[0];
    const dy = sy - body.position[1];
    const dz = sz - body.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const distSoft = Math.sqrt(dist * dist + softening * softening);
    const factor = G_AU / (distSoft * distSoft * distSoft);
    ax -= factor * dx * body.mass;
    ay -= factor * dy * body.mass;
    az -= factor * dz * body.mass;
  }

  const thrustWorld = spaceship.thrust;
  ax += thrustWorld[0] / SPACESHIP.mass;
  ay += thrustWorld[1] / SPACESHIP.mass;
  az += thrustWorld[2] / SPACESHIP.mass;

  return [ax, ay, az];
}

export function rk4StepSpaceship(
  spaceship: SpaceshipState,
  bodies: BodyInfo[],
  dt: number,
): void {
  const softening = PHYSICAL_CONSTANTS.softeningFactor;

  // k1
  const k1v = computeSpaceshipAcceleration(spaceship, bodies, softening);
  const k1r: [number, number, number] = [spaceship.velocity[0], spaceship.velocity[1], spaceship.velocity[2]];

  // k2
  const midPos1: [number, number, number] = [
    spaceship.position[0] + k1r[0] * dt / 2,
    spaceship.position[1] + k1r[1] * dt / 2,
    spaceship.position[2] + k1r[2] * dt / 2,
  ];
  const midVel1: [number, number, number] = [
    spaceship.velocity[0] + k1v[0] * dt / 2,
    spaceship.velocity[1] + k1v[1] * dt / 2,
    spaceship.velocity[2] + k1v[2] * dt / 2,
  ];
  const midShip1: SpaceshipState = { ...spaceship, position: midPos1, velocity: midVel1 };
  const k2v = computeSpaceshipAcceleration(midShip1, bodies, softening);
  const k2r: [number, number, number] = [midVel1[0], midVel1[1], midVel1[2]];

  // k3
  const midPos2: [number, number, number] = [
    spaceship.position[0] + k2r[0] * dt / 2,
    spaceship.position[1] + k2r[1] * dt / 2,
    spaceship.position[2] + k2r[2] * dt / 2,
  ];
  const midVel2: [number, number, number] = [
    spaceship.velocity[0] + k2v[0] * dt / 2,
    spaceship.velocity[1] + k2v[1] * dt / 2,
    spaceship.velocity[2] + k2v[2] * dt / 2,
  ];
  const midShip2: SpaceshipState = { ...spaceship, position: midPos2, velocity: midVel2 };
  const k3v = computeSpaceshipAcceleration(midShip2, bodies, softening);
  const k3r: [number, number, number] = [midVel2[0], midVel2[1], midVel2[2]];

  // k4
  const endPos: [number, number, number] = [
    spaceship.position[0] + k3r[0] * dt,
    spaceship.position[1] + k3r[1] * dt,
    spaceship.position[2] + k3r[2] * dt,
  ];
  const endVel: [number, number, number] = [
    spaceship.velocity[0] + k3v[0] * dt,
    spaceship.velocity[1] + k3v[1] * dt,
    spaceship.velocity[2] + k3v[2] * dt,
  ];
  const endShip: SpaceshipState = { ...spaceship, position: endPos, velocity: endVel };
  const k4v = computeSpaceshipAcceleration(endShip, bodies, softening);
  const k4r: [number, number, number] = [endVel[0], endVel[1], endVel[2]];

  // Combine
  spaceship.position[0] += (k1r[0] + 2 * k2r[0] + 2 * k3r[0] + k4r[0]) * dt / 6;
  spaceship.position[1] += (k1r[1] + 2 * k2r[1] + 2 * k3r[1] + k4r[1]) * dt / 6;
  spaceship.position[2] += (k1r[2] + 2 * k2r[2] + 2 * k3r[2] + k4r[2]) * dt / 6;
  spaceship.velocity[0] += (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]) * dt / 6;
  spaceship.velocity[1] += (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]) * dt / 6;
  spaceship.velocity[2] += (k1v[2] + 2 * k2v[2] + 2 * k3v[2] + k4v[2]) * dt / 6;
}

export function checkSpaceshipCollision(
  spaceship: SpaceshipState,
  bodies: BodyInfo[],
): boolean {
  for (const body of bodies) {
    const dx = spaceship.position[0] - body.position[0];
    const dy = spaceship.position[1] - body.position[1];
    const dz = spaceship.position[2] - body.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= SPACESHIP.collisionRadius + body.radius) {
      return true;
    }
  }
  return false;
}
