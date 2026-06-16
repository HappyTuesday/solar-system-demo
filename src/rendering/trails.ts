import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { physicalToRender } from '../engine/coordinateTransform';
const MAX_POINTS = 500;
const MIN_VISIBLE_POINTS = 8;
const MAX_TRAIL_PROPORTION = 0.9;

const PLANET_IDS = [
  'mercury', 'venus', 'earth', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune',
];

const TRAIL_COLORS: Record<string, number> = {
  mercury: 0xcccccc,
  venus: 0xffcc88,
  earth: 0x4488ff,
  mars: 0xff6644,
  jupiter: 0xffcc88,
  saturn: 0xffeecc,
  uranus: 0x88ccff,
  neptune: 0x4488ff,
};

interface TrailEntry {
  line: THREE.Line;
  positions: Float32Array;
  writeIndex: number;
  activeCount: number;
}

function vec3Dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vec3Len(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export class TrailManager {
  private scene: THREE.Scene;
  private trails = new Map<string, TrailEntry>();
  private visible = true;
  private lengthProportion = 0.5;
  private lastPhysPositions = new Map<string, [number, number, number]>();
  private accumulatedDistances = new Map<string, number>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  addTrail(bodyId: string, color: number): void {
    if (this.trails.has(bodyId)) return;

    const positions = new Float32Array(MAX_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.visible = this.visible;
    line.renderOrder = 2;
    this.scene.add(line);

    this.trails.set(bodyId, {
      line,
      positions,
      writeIndex: 0,
      activeCount: 0,
    });
    this.lastPhysPositions.set(bodyId, [0, 0, 0]);
    this.accumulatedDistances.set(bodyId, 0);
  }

  removeTrail(bodyId: string): void {
    const entry = this.trails.get(bodyId);
    if (!entry) return;
    this.scene.remove(entry.line);
    entry.line.geometry.dispose();
    (entry.line.material as THREE.Material).dispose();
    this.trails.delete(bodyId);
    this.lastPhysPositions.delete(bodyId);
    this.accumulatedDistances.delete(bodyId);
  }

  clearAll(): void {
    for (const id of this.trails.keys()) {
      this.removeTrail(id);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const entry of this.trails.values()) {
      entry.line.visible = visible;
    }
  }

  setLengthProportion(proportion: number): void {
    this.lengthProportion = proportion;
    const effectiveProportion = Math.min(proportion, MAX_TRAIL_PROPORTION);
    for (const [, entry] of this.trails.entries()) {
      const targetActive = Math.floor(MAX_POINTS * effectiveProportion);
      if (targetActive < entry.activeCount) {
        entry.activeCount = Math.max(1, targetActive);
        this.copyRingToGeometry(entry);
      }
    }
  }

  updateTrails(bodies: CelestialBody[]): void {
    for (const body of bodies) {
      if (!PLANET_IDS.includes(body.templateId)) continue;

      let entry = this.trails.get(body.id);
      if (!entry) {
        const color = TRAIL_COLORS[body.templateId] ?? 0x888888;
        this.addTrail(body.id, color);
        entry = this.trails.get(body.id);
        if (!entry) continue;
      }

      const prevPos = this.lastPhysPositions.get(body.id) || body.position;
      const dist = vec3Dist(prevPos, body.position);
      const acc = (this.accumulatedDistances.get(body.id) || 0) + dist;

      const r = vec3Len(body.position);
      const circumference = 2 * Math.PI * r;
      const effectiveProportion = Math.min(this.lengthProportion, MAX_TRAIL_PROPORTION);
      const margin = Math.max(1, (circumference * effectiveProportion) / MAX_POINTS);

      if (acc >= margin) {
        const renderPos = physicalToRender(body.position);
        this.appendSample(entry, renderPos);
        this.lastPhysPositions.set(body.id, [...body.position] as [number, number, number]);
        this.accumulatedDistances.set(body.id, 0);
      } else {
        this.accumulatedDistances.set(body.id, acc);
      }

      this.copyRingToGeometry(entry);
    }
  }

  dispose(): void {
    this.clearAll();
  }

  private appendSample(entry: TrailEntry, pos: [number, number, number]): void {
    const i = entry.writeIndex * 3;
    entry.positions[i] = pos[0];
    entry.positions[i + 1] = pos[1];
    entry.positions[i + 2] = pos[2];
    entry.writeIndex = (entry.writeIndex + 1) % MAX_POINTS;
    if (entry.activeCount < MAX_POINTS) {
      entry.activeCount++;
    }
  }

  private copyRingToGeometry(entry: TrailEntry): void {
    if (entry.activeCount === 0) return;

    const geomArray = entry.line.geometry.attributes.position.array as Float32Array;
    const start = entry.writeIndex >= entry.activeCount
      ? entry.writeIndex - entry.activeCount
      : MAX_POINTS - (entry.activeCount - entry.writeIndex);

    for (let i = 0; i < entry.activeCount; i++) {
      const src = ((start + i) % MAX_POINTS) * 3;
      const dst = i * 3;
      geomArray[dst] = entry.positions[src];
      geomArray[dst + 1] = entry.positions[src + 1];
      geomArray[dst + 2] = entry.positions[src + 2];
    }

    entry.line.geometry.attributes.position.needsUpdate = true;
    if (entry.activeCount >= MIN_VISIBLE_POINTS) {
      entry.line.geometry.setDrawRange(0, entry.activeCount);
    } else {
      entry.line.geometry.setDrawRange(0, 0);
    }
  }
}
