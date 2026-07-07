import type { CelestialBody } from '../types';
import { PHYSICAL_CONSTANTS, SIM_CONFIG, REAL_DATA } from './constants';

export function vec3Length(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function getBodyRadius(templateId: string): number {
  const data = REAL_DATA[templateId];
  return data?.radius ?? 0;
}

export function computeAccelerations(
  bodies: CelestialBody[],
  softening: number = PHYSICAL_CONSTANTS.softeningFactor,
  dimension: 2 | 3 = 3,
): [number, number, number][] {
  const n = bodies.length;
  const acc: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[i].position[0] - bodies[j].position[0];
      const dy = bodies[i].position[1] - bodies[j].position[1];
      const dz = dimension === 2 ? 0 : bodies[i].position[2] - bodies[j].position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const distSoft = Math.sqrt(dist * dist + softening * softening);
      const factor = PHYSICAL_CONSTANTS.G / (distSoft * distSoft * distSoft);

      const fx = -factor * dx;
      const fy = -factor * dy;
      const fz = dimension === 2 ? 0 : -factor * dz;

      acc[i] = [acc[i][0] + fx * bodies[j].mass, acc[i][1] + fy * bodies[j].mass, acc[i][2] + fz * bodies[j].mass];
      acc[j] = [acc[j][0] - fx * bodies[i].mass, acc[j][1] - fy * bodies[i].mass, acc[j][2] - fz * bodies[i].mass];
    }
  }

  return acc;
}

export function rk4Step(bodies: CelestialBody[], dt: number, dimension: 2 | 3 = 3): void {
  const n = bodies.length;

  const r0 = bodies.map(b => [b.position[0], b.position[1], b.position[2]] as [number, number, number]);
  const v0 = bodies.map(b => [b.velocity[0], b.velocity[1], b.velocity[2]] as [number, number, number]);

  const k1v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k1r = v0;

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k1r[i][0] * dt / 2, r0[i][1] + k1r[i][1] * dt / 2, dimension === 2 ? 0 : r0[i][2] + k1r[i][2] * dt / 2];
    bodies[i].velocity = [v0[i][0] + k1v[i][0] * dt / 2, v0[i][1] + k1v[i][1] * dt / 2, dimension === 2 ? 0 : v0[i][2] + k1v[i][2] * dt / 2];
  }
  const k2v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k2r = bodies.map(b => [b.velocity[0], b.velocity[1], b.velocity[2]] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k2r[i][0] * dt / 2, r0[i][1] + k2r[i][1] * dt / 2, dimension === 2 ? 0 : r0[i][2] + k2r[i][2] * dt / 2];
    bodies[i].velocity = [v0[i][0] + k2v[i][0] * dt / 2, v0[i][1] + k2v[i][1] * dt / 2, dimension === 2 ? 0 : v0[i][2] + k2v[i][2] * dt / 2];
  }
  const k3v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k3r = bodies.map(b => [b.velocity[0], b.velocity[1], b.velocity[2]] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    bodies[i].position = [r0[i][0] + k3r[i][0] * dt, r0[i][1] + k3r[i][1] * dt, dimension === 2 ? 0 : r0[i][2] + k3r[i][2] * dt];
    bodies[i].velocity = [v0[i][0] + k3v[i][0] * dt, v0[i][1] + k3v[i][1] * dt, dimension === 2 ? 0 : v0[i][2] + k3v[i][2] * dt];
  }
  const k4v = computeAccelerations(bodies, PHYSICAL_CONSTANTS.softeningFactor, dimension);
  const k4r = bodies.map(b => [b.velocity[0], b.velocity[1], b.velocity[2]] as [number, number, number]);

  for (let i = 0; i < n; i++) {
    const dvx = (k1v[i][0] + 2 * k2v[i][0] + 2 * k3v[i][0] + k4v[i][0]) * dt / 6;
    const dvy = (k1v[i][1] + 2 * k2v[i][1] + 2 * k3v[i][1] + k4v[i][1]) * dt / 6;
    const dvz = dimension === 2 ? 0 : (k1v[i][2] + 2 * k2v[i][2] + 2 * k3v[i][2] + k4v[i][2]) * dt / 6;
    const drx = (k1r[i][0] + 2 * k2r[i][0] + 2 * k3r[i][0] + k4r[i][0]) * dt / 6;
    const dry = (k1r[i][1] + 2 * k2r[i][1] + 2 * k3r[i][1] + k4r[i][1]) * dt / 6;
    const drz = dimension === 2 ? 0 : (k1r[i][2] + 2 * k2r[i][2] + 2 * k3r[i][2] + k4r[i][2]) * dt / 6;
    bodies[i].position = [r0[i][0] + drx, r0[i][1] + dry, dimension === 2 ? 0 : r0[i][2] + drz];
    bodies[i].velocity = [v0[i][0] + dvx, v0[i][1] + dvy, dimension === 2 ? 0 : v0[i][2] + dvz];
  }
}

// ===== Collision =====

export interface CollisionEvent {
  bodyA: CelestialBody;
  bodyB: CelestialBody;
  mergedBody: CelestialBody;
}

export function detectCollisions(bodies: CelestialBody[], dimension: 2 | 3 = 3): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const n = bodies.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[i].position[0] - bodies[j].position[0];
      const dy = bodies[i].position[1] - bodies[j].position[1];
      const dz = dimension === 2 ? 0 : bodies[i].position[2] - bodies[j].position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const rA = getBodyRadius(bodies[i].templateId);
      const rB = getBodyRadius(bodies[j].templateId);
      if (dist <= rA + rB) {
        const merged = mergeBodies(bodies[i], bodies[j], dimension);
        events.push({ bodyA: bodies[i], bodyB: bodies[j], mergedBody: merged });
      }
    }
  }

  return events;
}

function mergeBodies(a: CelestialBody, b: CelestialBody, dimension: 2 | 3 = 3): CelestialBody {
  const totalMass = a.mass + b.mass;
  const px = (a.position[0] * a.mass + b.position[0] * b.mass) / totalMass;
  const py = (a.position[1] * a.mass + b.position[1] * b.mass) / totalMass;
  const pz = dimension === 2 ? 0 : (a.position[2] * a.mass + b.position[2] * b.mass) / totalMass;
  const vx = (a.velocity[0] * a.mass + b.velocity[0] * b.mass) / totalMass;
  const vy = (a.velocity[1] * a.mass + b.velocity[1] * b.mass) / totalMass;
  const vz = dimension === 2 ? 0 : (a.velocity[2] * a.mass + b.velocity[2] * b.mass) / totalMass;

  return {
    id: `merged-${Date.now()}`,
    templateId: a.mass >= b.mass ? a.templateId : b.templateId,
    position: [px, py, pz],
    velocity: [vx, vy, vz],
    mass: totalMass,
    placedAt: Date.now(),
    rotationSpeed: 0,
    rotationPhase: 0,
  };
}

export function advanceSimulation(bodies: CelestialBody[], realDelta: number, timeScale: number, dimension: 2 | 3 = 3): number {
  if (bodies.length < 2) return 0;

  const simDelta = realDelta * timeScale;
  const steps = Math.min(
    Math.max(1, Math.floor(simDelta / SIM_CONFIG.timeStep)),
    SIM_CONFIG.maxSubsteps
  );
  const subDt = simDelta / steps;

  for (let s = 0; s < steps; s++) {
    rk4Step(bodies, subDt, dimension);
  }

  return simDelta;
}
