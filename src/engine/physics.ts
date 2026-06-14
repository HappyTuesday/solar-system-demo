import type { CelestialBody } from '../types';
import { G, SIM_CONFIG } from './constants';

function vec3Add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function vec3Length(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: [number, number, number]): [number, number, number] {
  const len = vec3Length(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function computeAccelerations(
  bodies: CelestialBody[],
  softening: number = SIM_CONFIG.softeningFactor
): [number, number, number][] {
  const n = bodies.length;
  const acc: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = vec3Sub(bodies[i].position, bodies[j].position);
      const dist = vec3Length(r);
      const distSoft = Math.sqrt(dist * dist + softening * softening);
      const factor = G / (distSoft * distSoft * distSoft);

      const fi = vec3Scale(r, -factor * bodies[j].mass);
      const fj = vec3Scale(r, factor * bodies[i].mass);

      acc[i] = vec3Add(acc[i], fi);
      acc[j] = vec3Add(acc[j], fj);
    }
  }

  return acc;
}

export function rk4Step(bodies: CelestialBody[], dt: number): void {
  const n = bodies.length;

  const r0 = bodies.map(b => b.position);
  const v0 = bodies.map(b => b.velocity);

  const k1v = computeAccelerations(bodies);
  const k1r = v0;

  for (let i = 0; i < n; i++) {
    bodies[i].position = vec3Add(r0[i], vec3Scale(k1r[i], dt / 2));
    bodies[i].velocity = vec3Add(v0[i], vec3Scale(k1v[i], dt / 2));
  }
  const k2v = computeAccelerations(bodies);
  const k2r = bodies.map(b => b.velocity);

  for (let i = 0; i < n; i++) {
    bodies[i].position = vec3Add(r0[i], vec3Scale(k2r[i], dt / 2));
    bodies[i].velocity = vec3Add(v0[i], vec3Scale(k2v[i], dt / 2));
  }
  const k3v = computeAccelerations(bodies);
  const k3r = bodies.map(b => b.velocity);

  for (let i = 0; i < n; i++) {
    bodies[i].position = vec3Add(r0[i], vec3Scale(k3r[i], dt));
    bodies[i].velocity = vec3Add(v0[i], vec3Scale(k3v[i], dt));
  }
  const k4v = computeAccelerations(bodies);
  const k4r = bodies.map(b => b.velocity);

  for (let i = 0; i < n; i++) {
    const dv = vec3Scale(
      vec3Add(k1v[i], vec3Add(vec3Scale(k2v[i], 2), vec3Add(vec3Scale(k3v[i], 2), k4v[i]))),
      dt / 6
    );
    const dr = vec3Scale(
      vec3Add(k1r[i], vec3Add(vec3Scale(k2r[i], 2), vec3Add(vec3Scale(k3r[i], 2), k4r[i]))),
      dt / 6
    );
    bodies[i].position = vec3Add(r0[i], dr);
    bodies[i].velocity = vec3Add(v0[i], dv);
  }
}

// ===== Collision =====

export interface CollisionEvent {
  bodyA: CelestialBody;
  bodyB: CelestialBody;
  mergedBody: CelestialBody;
}

export function detectCollisions(bodies: CelestialBody[]): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const n = bodies.length;
  const threshold = 1e7;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = vec3Length(vec3Sub(bodies[i].position, bodies[j].position));
      if (dist < threshold) {
        const merged = mergeBodies(bodies[i], bodies[j]);
        events.push({ bodyA: bodies[i], bodyB: bodies[j], mergedBody: merged });
      }
    }
  }

  return events;
}

function mergeBodies(a: CelestialBody, b: CelestialBody): CelestialBody {
  const totalMass = a.mass + b.mass;
  const pos: [number, number, number] = vec3Scale(
    vec3Add(vec3Scale(a.position, a.mass), vec3Scale(b.position, b.mass)),
    1 / totalMass
  );
  const vel: [number, number, number] = vec3Scale(
    vec3Add(vec3Scale(a.velocity, a.mass), vec3Scale(b.velocity, b.mass)),
    1 / totalMass
  );

  return {
    id: `merged-${Date.now()}`,
    templateId: a.templateId,
    position: pos,
    velocity: vel,
    mass: totalMass,
    placedAt: Date.now(),
    rotationSpeed: 0,
  };
}

export function advanceSimulation(bodies: CelestialBody[], realDelta: number): number {
  if (bodies.length < 2) return 0;

  const simDelta = realDelta * SIM_CONFIG.timeScale;
  const steps = Math.min(
    Math.max(1, Math.floor(simDelta / SIM_CONFIG.timeStep)),
    SIM_CONFIG.maxSubsteps
  );
  const subDt = simDelta / steps;

  for (let s = 0; s < steps; s++) {
    rk4Step(bodies, subDt);
  }

  return steps;
}
