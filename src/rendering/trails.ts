import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { physicalToRender } from '../engine/coordinateTransform';
import { bodyMeshMap } from './bodies';

const MAX_POINTS = 500;

const PLANET_IDS = [
  'mercury', 'venus', 'earth', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune',
];

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
    for (const [id, entry] of this.trails.entries()) {
      const pos = this.lastPhysPositions.get(id);
      if (pos) {
        const r = vec3Len(pos);
        const circumference = 2 * Math.PI * r;
        const margin = Math.max(1, (circumference * this.lengthProportion) / MAX_POINTS);
        const trailPhysLen = circumference * this.lengthProportion;
        const maxActive = Math.min(MAX_POINTS, Math.floor(trailPhysLen / margin));
        if (maxActive < entry.activeCount) {
          entry.activeCount = maxActive;
        }
      }
    }
  }

  updateTrails(bodies: CelestialBody[]): void {
    for (const body of bodies) {
      if (!PLANET_IDS.includes(body.templateId)) continue;

      let entry = this.trails.get(body.id);
      if (!entry) {
        const bm = bodyMeshMap.get(body.id);
        const mat = bm?.mesh.material;
        let color = 0x888888;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
          color = mat.color.getHex();
        }
        this.addTrail(body.id, color);
        entry = this.trails.get(body.id);
        if (!entry) continue;
      }

      const prevPos = this.lastPhysPositions.get(body.id) || body.position;
      const dist = vec3Dist(prevPos, body.position);
      let acc = (this.accumulatedDistances.get(body.id) || 0) + dist;

      const r = vec3Len(body.position);
      const circumference = 2 * Math.PI * r;
      const margin = Math.max(1, (circumference * this.lengthProportion) / MAX_POINTS);

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
    entry.line.geometry.setDrawRange(0, entry.activeCount);
  }
}
