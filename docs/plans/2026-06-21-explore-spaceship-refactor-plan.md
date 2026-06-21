# Explore Page Spaceship Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `/explore` page from a third-person orthographic view to a first-person spaceship perspective with HUD dashboard, where the spaceship is affected by N-body gravity and user-controlled thrust.

**Architecture:** New `engine/spaceship.ts` manages spaceship physics (gravity+thrust+collision). New `stores/spaceshipStore.ts` holds all spaceship/dashboard state. `ExploreCanvas.tsx` is rewritten to use `PerspectiveCamera` following the spaceship. `Dashboard.tsx` provides a collapsible HUD with controls and a `MiniMap.tsx` navigation preview. Planets continue using Kepler orbits; only the spaceship participates in N-body integration.

**Tech Stack:** React 18 + TypeScript (strict) + Three.js + Vite + Zustand

---

### Task 1: Add spaceship types and constants

**Files:**
- Modify: `src/types/index.ts:109` (after last line)
- Modify: `src/engine/constants.ts:447` (after last line)

- [ ] **Step 1: Add SpaceshipState type to types/index.ts**

Append after line 109:
```ts
export interface SpaceshipState {
  position: [number, number, number];
  velocity: [number, number, number];
  direction: [number, number, number];
  thrust: [number, number, number];
  thrustMagnitude: number;
  exploded: boolean;
}
```

- [ ] **Step 2: Add spaceship constants to engine/constants.ts**

Append after line 447:
```ts
export const SPACESHIP = {
  mass: 1,
  collisionRadius: 0.001,
  maxThrustAU: 1.5e-7,
};
```

`maxThrustAU` is ~22.4 m/s^2 in AU/s^2 units — about 2.3g, reasonable for a sci-fi spaceship.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/engine/constants.ts
git commit -m "feat: add SpaceshipState type and SPACESHIP constants"
```

---

### Task 2: Create spaceship engine module

**Files:**
- Create: `src/engine/spaceship.ts`

- [ ] **Step 1: Write spaceship.ts**

```ts
import type { SpaceshipState } from '../types';
import { SPACESHIP, PHYSICAL_CONSTANTS, REAL_DATA } from './constants';

const EARTH_SO = 0.003; // Earth sphere of influence in AU

export function createSpaceshipState(): SpaceshipState {
  // Start near Earth's orbit, close to Earth
  const earthOrbitAU = 1.0;
  const pos: [number, number, number] = [
    earthOrbitAU + EARTH_SO,
    0,
    0,
  ];

  // Earth's orbital speed ~29.8 km/s = 2.02e-7 AU/s
  const earthOrbitalSpeed = 2.02e-7;
  const orbitSpeed = Math.sqrt(
    (PHYSICAL_CONSTANTS.G * REAL_DATA.earth.mass) /
    (EARTH_SO * 1.496e11)
  );
  const orbitSpeedAU = orbitSpeed / 1.496e11;

  const vel: [number, number, number] = [
    0,
    earthOrbitalSpeed + orbitSpeedAU,
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

function vec3Length(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
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
  const worldUp: [number, number, number] = [0, 0, 1];
  const right = vec3Normalize([
    dir[1] * worldUp[2] - dir[2] * worldUp[1],
    dir[2] * worldUp[0] - dir[0] * worldUp[2],
    dir[0] * worldUp[1] - dir[1] * worldUp[0],
  ]);
  const up = vec3Normalize([
    right[1] * dir[2] - right[2] * dir[1],
    right[2] * dir[0] - right[0] * dir[2],
    right[0] * dir[1] - right[1] * dir[0],
  ]);

  const maxThrust = SPACESHIP.maxThrustAU * (magnitude / 100);
  const tx = dir[0] * forwardBack * maxThrust +
            right[0] * leftRight * maxThrust +
            up[0] * upDown * maxThrust;
  const ty = dir[1] * forwardBack * maxThrust +
            right[1] * leftRight * maxThrust +
            up[1] * upDown * maxThrust;
  const tz = dir[2] * forwardBack * maxThrust +
            right[2] * leftRight * maxThrust +
            up[2] * upDown * maxThrust;

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
    const factor = PHYSICAL_CONSTANTS.G / (distSoft * distSoft * distSoft);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/spaceship.ts
git commit -m "feat: add spaceship engine with RK4 physics, thrust, and collision"
```

---

### Task 3: Create spaceship Zustand store

**Files:**
- Create: `src/stores/spaceshipStore.ts`

- [ ] **Step 1: Write spaceshipStore.ts**

```ts
import { create } from 'zustand';
import type { SpaceshipState } from '../types';
import { createSpaceshipState } from '../engine/spaceship';

export interface SpaceshipStore extends SpaceshipState {
  isRunning: boolean;
  dashboardExpanded: boolean;
  simulatedTime: number;

  setForwardThrust: (v: number) => void;
  setLateralThrust: (v: number) => void;
  setVerticalThrust: (v: number) => void;
  setThrustMagnitude: (m: number) => void;
  setDirection: (d: [number, number, number]) => void;
  setExploded: () => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  updatePhysics: (pos: [number, number, number], vel: [number, number, number]) => void;
  setSimulatedTime: (t: number) => void;
  reset: () => void;
}

const initialSpaceship = createSpaceshipState();

const initialState = {
  ...initialSpaceship,
  isRunning: true,
  dashboardExpanded: false,
  simulatedTime: Date.now(),
};

export const useSpaceshipStore = create<SpaceshipStore>((set, get) => ({
  ...initialState,

  setForwardThrust: (v) => set(s => ({ thrust: [v, s.thrust[1], s.thrust[2]] })),
  setLateralThrust: (v) => set(s => ({ thrust: [s.thrust[0], v, s.thrust[2]] })),
  setVerticalThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.thrust[1], v] })),
  setThrustMagnitude: (m) => set({ thrustMagnitude: m }),
  setDirection: (d) => set({ direction: d }),
  setExploded: () => set({ exploded: true, isRunning: false }),
  toggleRunning: () => set(s => ({ isRunning: !s.isRunning })),
  toggleDashboard: () => set(s => ({ dashboardExpanded: !s.dashboardExpanded })),
  updatePhysics: (pos, vel) => set({ position: pos, velocity: vel }),
  setSimulatedTime: (t) => set({ simulatedTime: t }),
  reset: () => set({
    ...createSpaceshipState(),
    isRunning: true,
    dashboardExpanded: false,
  }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/spaceshipStore.ts
git commit -m "feat: add spaceship Zustand store"
```

---

### Task 4: Rewrite ExploreCanvas — first-person camera + spaceship physics

**Files:**
- Modify: `src/components/explore/ExploreCanvas.tsx` (full rewrite)

- [ ] **Step 1: Replace ExploreCanvas.tsx from line 1**

```tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { rk4StepSpaceship, computeSpaceshipAcceleration, checkSpaceshipCollision, applyThrustInBodyFrame, type BodyInfo } from '../../engine/spaceship';

const SCALE = 1 / 1.496e11;
const ORBIT_LINE_POINTS = 256;

function computeBodyPosition(templateId: string, jd: number): [number, number, number] | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital || templateId === 'sun') return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return [sv.position[0] * SCALE, sv.position[2] * SCALE, -sv.position[1] * SCALE];
}

function createOrbitLine(templateId: string, color: number): THREE.Line {
  const data = REAL_DATA[templateId];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ORBIT_LINE_POINTS; i++) {
    const nu = (i / ORBIT_LINE_POINTS) * Math.PI * 2;
    const sv = stateVectors(
      data.semiMajorAxis!, data.orbital!.eccentricity, data.orbital!.inclination,
      data.orbital!.longitudeAscendingNode, data.orbital!.argumentOfPeriapsis,
      nu, MU_SUN,
    );
    points.push(new THREE.Vector3(sv.position[0] * SCALE, sv.position[2] * SCALE, -sv.position[1] * SCALE));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const bodyMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const allIdsRef = useRef<string[]>(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const frustumRef = useRef(new THREE.Frustum());
  const projMatrixRef = useRef(new THREE.Matrix4());
  const explosionParticlesRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, w / Math.max(h, 1), 0.001, 500);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x444466, 1.0));
    scene.add(new THREE.PointLight(0xffeedd, 2, 0, 0));

    const bodyMeshes = new Map<string, THREE.Mesh>();
    const allIds = allIdsRef.current;
    const loader = new THREE.TextureLoader();

    const orbitColors: Record<string, number> = {
      mercury: 0x888888, venus: 0xccaa88, earth: 0x4488ff, mars: 0xcc6644,
      jupiter: 0xd4b896, saturn: 0xe8d5a3, uranus: 0x88ccdd, neptune: 0x4466ff,
    };

    for (const id of allIds) {
      const data = REAL_DATA[id];
      if (!data) continue;
      const r = data.radius * SCALE;
      const geom = new THREE.SphereGeometry(r, 48, 48);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
      if (id === 'sun') {
        mat.color = new THREE.Color(0xffcc00);
        mat.emissive = new THREE.Color(0xff6600);
        mat.emissiveIntensity = 0.3;
      } else {
        mat.color = new THREE.Color(0xcccccc);
      }
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      bodyMeshes.set(id, mesh);

      loader.load(`/textures/${id}.jpg`,
        (tex) => {
          mat.map = tex;
          mat.color = new THREE.Color(0xffffff);
          mat.needsUpdate = true;
        },
        undefined, () => {});

      if (data.semiMajorAxis && data.orbital && id !== 'sun') {
        scene.add(createOrbitLine(id, orbitColors[id] || 0x556688));
      }
    }
    bodyMeshesRef.current = bodyMeshes;

    let lastTime = performance.now();
    let simulatedTime = Date.now();
    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const store = useSpaceshipStore.getState();

      if (store.isRunning && dt > 0 && !store.exploded) {
        // Update simulated time for planet positions
        simulatedTime += dt * 86400 * 1000; // 1 day per second
        store.setSimulatedTime(simulatedTime);
        const jd = julianDate(simulatedTime);

        // Update planet positions (Kepler)
        for (const id of allIds) {
          const mesh = bodyMeshes.get(id);
          if (!mesh) continue;
          if (id === 'sun') {
            mesh.position.set(0, 0, 0);
          } else {
            const pos = computeBodyPosition(id, jd);
            if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
          }
        }

        // Build body info list for spaceship physics
        const bodyInfos: BodyInfo[] = [];
        for (const id of allIds) {
          const mesh = bodyMeshes.get(id);
          const data = REAL_DATA[id];
          if (!mesh || !data) continue;
          bodyInfos.push({
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            mass: data.mass,
            radius: data.radius * SCALE,
          });
        }

        // Build a clean SpaceshipState for physics (world-frame thrust)
        const worldThrust = applyThrustInBodyFrame(
          store.thrust[0],
          store.thrust[1],
          store.thrust[2],
          store.thrustMagnitude,
          store.direction,
        );
        const shipState = {
          position: [...store.position] as [number, number, number],
          velocity: [...store.velocity] as [number, number, number],
          direction: [...store.direction] as [number, number, number],
          thrust: worldThrust,
          thrustMagnitude: store.thrustMagnitude,
          exploded: store.exploded,
        };

        // RK4 step for spaceship (substep with config)
        const simDelta = dt * 86400; // 1 day per second in simulation time
        const steps = Math.min(Math.max(1, Math.floor(simDelta / 0.016)), 200);
        const subDt = simDelta / steps;
        for (let s = 0; s < steps; s++) {
          rk4StepSpaceship(shipState, bodyInfos, subDt);
        }

        // Check collision
        if (checkSpaceshipCollision(shipState, bodyInfos)) {
          store.setExploded();
        } else {
          // Update direction = velocity direction (normalized)
          const speed = Math.sqrt(
            shipState.velocity[0] ** 2 + shipState.velocity[1] ** 2 + shipState.velocity[2] ** 2
          );
          const newDir: [number, number, number] = speed > 1e-12
            ? [shipState.velocity[0] / speed, shipState.velocity[1] / speed, shipState.velocity[2] / speed]
            : shipState.direction;

          store.updatePhysics(
            [...shipState.position] as [number, number, number],
            [...shipState.velocity] as [number, number, number],
          );
          store.setDirection(newDir);
        }
      }

      // Update camera
      const cam = cameraRef.current!;
      const sp = useSpaceshipStore.getState();
      cam.position.set(sp.position[0], sp.position[1], sp.position[2]);

      // Look-at target = position + direction
      const lookTarget = new THREE.Vector3(
        sp.position[0] + sp.direction[0] * 10,
        sp.position[1] + sp.direction[1] * 10,
        sp.position[2] + sp.direction[2] * 10,
      );
      cam.lookAt(lookTarget);

      // Frustum culling
      projMatrixRef.current.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustumRef.current.setFromProjectionMatrix(projMatrixRef.current);

      for (const [id, mesh] of bodyMeshes) {
        const inFrustum = frustumRef.current.containsPoint(mesh.position);
        mesh.visible = inFrustum;
      }

      // Starfield (simple: always visible reference)
      renderer.render(scene, cam);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      if (rw <= 0 || rh <= 0) return;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }} />
  );
}

export default ExploreCanvas;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/ExploreCanvas.tsx
git commit -m "feat: rewrite ExploreCanvas with first-person PerspectiveCamera and spaceship physics"
```

---

### Task 5: Create MiniMap navigation component

**Files:**
- Create: `src/components/explore/MiniMap.tsx`

- [ ] **Step 1: Write MiniMap.tsx**

```tsx
import { useEffect, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';

const CANVAS_W = 212;
const CANVAS_H = 130;
const PADDING = 15;
const SUN_RADIUS_PX = 5;
const SCALE = 1 / 1.496e11;
const MAX_ORBIT_AU = 30.11;

const PLANET_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

const PLANET_COLORS: Record<string, string> = {
  mercury: '#aaaaaa', venus: '#e8c87a', earth: '#4488ff', mars: '#e86440',
  jupiter: '#d4b896', saturn: '#e8d5a3', uranus: '#88ccdd', neptune: '#4466ff',
};

function computeBodyPos2D(templateId: string, jd: number): { x: number; y: number } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    x: sv.position[0] * SCALE,
    y: sv.position[1] * SCALE,
  };
}

function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const sp = useSpaceshipStore.getState();
      const jd = julianDate(sp.simulatedTime);
      const scale = (Math.min(CANVAS_W, CANVAS_H) - PADDING * 2) / MAX_ORBIT_AU;
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Orbits
      for (const id of PLANET_ORDER) {
        const data = REAL_DATA[id];
        if (!data?.semiMajorAxis) continue;
        const rPx = (data.semiMajorAxis / 1.496e11) * scale;
        if (rPx <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rPx, rPx * 0.7, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Sun
      ctx.beginPath();
      ctx.arc(cx, cy, SUN_RADIUS_PX, 0, Math.PI * 2);
      const sunGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, SUN_RADIUS_PX);
      sunGrad.addColorStop(0, '#ffdd00');
      sunGrad.addColorStop(1, '#ff8800');
      ctx.fillStyle = sunGrad;
      ctx.fill();

      // Planet dots (computed from current jd)
      for (const id of PLANET_ORDER) {
        const pos2d = computeBodyPos2D(id, jd);
        if (!pos2d) continue;
        const px = cx + pos2d.x * scale;
        const py = cy - pos2d.y * scale;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = PLANET_COLORS[id] || '#888888';
        ctx.fill();
      }

      // Spaceship
      const spx = sp.position[0] * scale;
      const spy = sp.position[1] * scale;
      const sx = cx + spx;
      const sy = cy - spy;

      const dx = sp.direction[0];
      const dy = sp.direction[1];
      const dirLen = 10;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx * dirLen, sy - dy * dirLen);
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const angle = Math.atan2(-dy, dx);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fillStyle = '#00b8ff';
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#334455';
      ctx.font = '8px monospace';
      ctx.fillText('▲ 飞船 · 顶视图', 4, CANVAS_H - 4);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        display: 'block',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(0,180,255,0.2)',
      }}
    />
  );
}

export default MiniMap;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/explore/MiniMap.tsx
git commit -m "feat: add MiniMap navigation preview component"
```

---

### Task 6: Create Dashboard HUD component

**Files:**
- Create: `src/components/explore/Dashboard.tsx`
- Create: `src/components/explore/Dashboard.css`

- [ ] **Step 1: Write Dashboard.css**

```css
.dashboard-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: 'Courier New', monospace;
}

.dashboard-speed-badge {
  background: rgba(5, 10, 30, 0.8);
  border: 1px solid rgba(0, 180, 255, 0.3);
  border-radius: 4px;
  padding: 2px 8px;
  color: #00ff88;
  font-size: 11px;
  user-select: none;
}

.dashboard-collapse-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(0, 180, 255, 0.15);
  border: 2px solid rgba(0, 180, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00b8ff;
  font-size: 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.dashboard-collapse-btn:hover {
  background: rgba(0, 180, 255, 0.25);
}

.dashboard-panel {
  width: 240px;
  background: rgba(5, 10, 30, 0.92);
  border: 1px solid rgba(0, 180, 255, 0.3);
  border-radius: 8px;
  padding: 14px;
  color: #ccc;
  position: relative;
}

.dashboard-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.dashboard-panel-title {
  color: #00b8ff;
  font-size: 12px;
  letter-spacing: 1px;
}

.dashboard-close-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 180, 255, 0.2);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00b8ff;
  font-size: 11px;
  cursor: pointer;
}

.dashboard-section-label {
  font-size: 10px;
  color: #667788;
  margin-bottom: 4px;
}

.dashboard-position-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  margin-bottom: 6px;
}

.dashboard-readout {
  background: rgba(0, 180, 255, 0.05);
  border: 1px solid rgba(0, 180, 255, 0.12);
  border-radius: 3px;
  padding: 3px 6px;
}

.dashboard-readout-label {
  font-size: 8px;
  color: #445566;
}

.dashboard-readout-value {
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.dashboard-row {
  display: flex;
  gap: 8px;
}

.dashboard-readout-half {
  flex: 1;
  background: rgba(0, 180, 255, 0.08);
  border: 1px solid rgba(0, 180, 255, 0.15);
  border-radius: 3px;
  padding: 3px 8px;
}

.dashboard-controls-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 4px;
}

.dashboard-ctrl-btn {
  background: rgba(0, 180, 255, 0.1);
  border: none;
  border-radius: 3px;
  padding: 4px 0;
  text-align: center;
  font-size: 11px;
  color: #ccc;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
}

.dashboard-ctrl-btn:hover {
  background: rgba(0, 180, 255, 0.2);
}

.dashboard-ctrl-btn:active {
  background: rgba(0, 180, 255, 0.3);
}

.dashboard-thrust-row {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  margin-bottom: 10px;
}

.dashboard-accel-btn {
  flex: 1;
  border: none;
  border-radius: 3px;
  padding: 4px 0;
  text-align: center;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  background: rgba(0, 255, 128, 0.12);
  color: #00ff88;
}

.dashboard-accel-btn:hover {
  background: rgba(0, 255, 128, 0.2);
}

.dashboard-decel-btn {
  flex: 1;
  border: none;
  border-radius: 3px;
  padding: 4px 0;
  text-align: center;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  background: rgba(255, 80, 80, 0.12);
  color: #ff5555;
}

.dashboard-decel-btn:hover {
  background: rgba(255, 80, 80, 0.2);
}

.dashboard-section {
  margin-bottom: 10px;
}

.dashboard-exploded {
  text-align: center;
  color: #ff5555;
  padding: 10px 0;
  font-size: 14px;
  letter-spacing: 2px;
}
```

- [ ] **Step 2: Write Dashboard.tsx**

```tsx
import { useCallback, useRef } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import MiniMap from './MiniMap';
import './Dashboard.css';

function Dashboard() {
  const expanded = useSpaceshipStore(s => s.dashboardExpanded);
  const toggleDashboard = useSpaceshipStore(s => s.toggleDashboard);
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const setForwardThrust = useSpaceshipStore(s => s.setForwardThrust);
  const setLateralThrust = useSpaceshipStore(s => s.setLateralThrust);
  const setVerticalThrust = useSpaceshipStore(s => s.setVerticalThrust);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const isRunning = useSpaceshipStore(s => s.isRunning);
  const toggleRunning = useSpaceshipStore(s => s.toggleRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speedMs = Math.sqrt(
    velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2
  ) * 1.496e11 / 1000;

  const startHold = useCallback((action: () => void) => {
    action();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(action, 100);
  }, []);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  if (!expanded) {
    return (
      <div className="dashboard-container">
        {!exploded && (
          <div className="dashboard-speed-badge">
            {speedMs.toFixed(1)} km/s
          </div>
        )}
        <div className="dashboard-collapse-btn" onClick={toggleDashboard}>
          ✧
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        <div className="dashboard-panel-header">
          <span className="dashboard-panel-title">飞船仪表</span>
          <button className="dashboard-close-btn" onClick={toggleDashboard}>−</button>
        </div>

        {exploded ? (
          <div className="dashboard-exploded">
            💥 飞行终止<br />
            <button
              className="dashboard-ctrl-btn"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => window.location.reload()}
            >
              重新出发
            </button>
          </div>
        ) : (
          <>
            <div className="dashboard-section">
              <div className="dashboard-section-label">位置 (AU)</div>
              <div className="dashboard-position-grid">
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">X</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[0].toFixed(4)}
                  </div>
                </div>
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">Y</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[1].toFixed(4)}
                  </div>
                </div>
                <div className="dashboard-readout">
                  <div className="dashboard-readout-label">Z</div>
                  <div className="dashboard-readout-value" style={{ color: '#00ff88' }}>
                    {position[2].toFixed(4)}
                  </div>
                </div>
              </div>
              <div className="dashboard-row">
                <div className="dashboard-readout-half">
                  <div className="dashboard-readout-label">飞行速度</div>
                  <div className="dashboard-readout-value" style={{ color: '#ffff00', fontSize: 12 }}>
                    {speedMs.toFixed(1)} <span style={{ fontSize: 9, color: '#667788' }}>km/s</span>
                  </div>
                </div>
                <div className="dashboard-readout-half">
                  <div className="dashboard-readout-label">推力</div>
                  <div className="dashboard-readout-value" style={{ color: '#00b8ff', fontSize: 12 }}>
                    {thrustMagnitude} <span style={{ fontSize: 9, color: '#667788' }}>%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-section">
              <div className="dashboard-section-label">飞行控制</div>
              <div className="dashboard-controls-grid">
                <button
                  className="dashboard-ctrl-btn"
                  onMouseDown={() => startHold(() => setVerticalThrust(1))}
                  onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                  onMouseLeave={stopHold}
                >
                  ↑ 抬头
                </button>
                <button
                  className="dashboard-ctrl-btn"
                  onMouseDown={() => startHold(() => setVerticalThrust(-1))}
                  onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                  onMouseLeave={stopHold}
                >
                  ↓ 俯冲
                </button>
                <button
                  className="dashboard-ctrl-btn"
                  onMouseDown={() => startHold(() => setLateralThrust(1))}
                  onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                  onMouseLeave={stopHold}
                >
                  ← 左转
                </button>
                <button
                  className="dashboard-ctrl-btn"
                  onMouseDown={() => startHold(() => setLateralThrust(-1))}
                  onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                  onMouseLeave={stopHold}
                >
                  → 右转
                </button>
              </div>
              <div className="dashboard-thrust-row">
                <button
                  className="dashboard-accel-btn"
                  onClick={() => setThrustMagnitude(Math.min(100, thrustMagnitude + 10))}
                >
                  + 加速
                </button>
                <button
                  className="dashboard-decel-btn"
                  onClick={() => setThrustMagnitude(Math.max(0, thrustMagnitude - 10))}
                >
                  − 减速
                </button>
              </div>
              <button
                className="dashboard-ctrl-btn"
                style={{ width: '100%' }}
                onClick={toggleRunning}
              >
                {isRunning ? '⏸ 暂停' : '▶ 继续'}
              </button>
            </div>

            <div className="dashboard-section">
              <div className="dashboard-section-label">导航图</div>
              <MiniMap />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/Dashboard.tsx src/components/explore/Dashboard.css
git commit -m "feat: add Dashboard HUD component with flight controls and MiniMap"
```

---

### Task 7: Update ExplorePage and cleanup old files

**Files:**
- Modify: `src/pages/ExplorePage.tsx` (replace content)
- Remove: `src/components/explore/BodyInfoPanel.tsx`
- Remove: `src/components/explore/BodyInfoPanel.css`
- Remove: `src/components/explore/TimeSlider.tsx`
- Remove: `src/components/explore/CameraControls.tsx`
- Remove: `src/components/explore/CameraControls.css`
- Modify: `src/stores/exploreStore.ts` (remove or keep for reference)

- [ ] **Step 1: Rewrite ExplorePage.tsx**

```tsx
import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
      </div>
      <Dashboard />
    </div>
  );
}

export default ExplorePage;
```

- [ ] **Step 2: Delete old explore components**

```bash
rm src/components/explore/BodyInfoPanel.tsx
rm src/components/explore/BodyInfoPanel.css
rm src/components/explore/TimeSlider.tsx
rm src/components/explore/CameraControls.tsx
rm src/components/explore/CameraControls.css
```

- [ ] **Step 3: Check for stale imports to those deleted files**

```bash
grep -r "BodyInfoPanel\|TimeSlider\|CameraControls" src/ --include="*.ts" --include="*.tsx"
```

If any import remains, remove it.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/ExplorePage.tsx
git rm src/components/explore/BodyInfoPanel.tsx src/components/explore/BodyInfoPanel.css src/components/explore/TimeSlider.tsx src/components/explore/CameraControls.tsx src/components/explore/CameraControls.css
git commit -m "refactor: update ExplorePage, remove old explore components"
```

---

### Task 8: Final verification and fix issues

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 2: Run dev server and test visually**

```bash
npm run dev
```

Open browser at `/explore`. Verify:
- First-person view renders (camera starts near Earth)
- Dashboard shows in bottom-right corner
- Speed badge shows with circle button
- Click circle to expand dashboard
- Readouts show position, speed, thrust
- Controls work (accelerate/decelerate, pitch/yaw)
- MiniMap shows solar system overview
- Click − to collapse dashboard
- Orbit lines are visible
- Planets move along orbits
- Spaceship responds to gravity

- [ ] **Step 3: Fix any runtime errors or visual issues found**

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: polish explore page spaceship refactor"
```
