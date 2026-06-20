import * as THREE from 'three';
import type { CelestialBody, TrailDebugInfo } from '../../types';
import { physicalToRender } from '../../engine/coordinateTransform';

const MAX_POINTS = 500;
const MIN_VISIBLE_POINTS = 8;
const MAX_TRAIL_PROPORTION = 0.9;
const SAMPLE_INTERVAL_FRAMES = 3;

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
  ringBuffer: Float32Array;
  colorRing: Float32Array;
  writeIndex: number;
  activeCount: number;
  framesSinceLastSample: number;
  baseColor: THREE.Color;
}

function isCollinear(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): boolean {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
  if (lenAB < 1e-6) return false;

  const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
  const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
  if (lenBC < 1e-6) return true;

  const cosA = Math.abs(abx * bcx + aby * bcy + abz * bcz) / (lenAB * lenBC);
  return cosA > 0.9999875; // cos(0.005)
}

export class TrailManager {
  private scene: THREE.Scene;
  private trails = new Map<string, TrailEntry>();
  private visible = true;
  private lengthProportion = 0.5;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  addTrail(bodyId: string, color: number): void {
    if (this.trails.has(bodyId)) return;

    const ringBuffer = new Float32Array(MAX_POINTS * 3);
    const geomBuffer = new Float32Array(MAX_POINTS * 3);
    const colorRing = new Float32Array(MAX_POINTS * 3);
    const geomColors = new Float32Array(MAX_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(geomBuffer, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(geomColors, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.visible = this.visible;
    line.renderOrder = 2;
    this.scene.add(line);

    this.trails.set(bodyId, {
      line,
      ringBuffer,
      colorRing,
      writeIndex: 0,
      activeCount: 0,
      framesSinceLastSample: 0,
      baseColor: new THREE.Color(color),
    });
  }

  removeTrail(bodyId: string): void {
    const entry = this.trails.get(bodyId);
    if (!entry) return;
    this.scene.remove(entry.line);
    entry.line.geometry.dispose();
    (entry.line.material as THREE.Material).dispose();
    this.trails.delete(bodyId);
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

      entry.framesSinceLastSample++;
      if (entry.framesSinceLastSample >= SAMPLE_INTERVAL_FRAMES) {
        const renderPos = physicalToRender(body.position);
        if (entry.activeCount >= 2) {
          const ring = entry.ringBuffer;
          const lastIdx = ((entry.writeIndex - 1 + MAX_POINTS) % MAX_POINTS) * 3;
          const secondLastIdx = ((entry.writeIndex - 2 + MAX_POINTS) % MAX_POINTS) * 3;

          if (isCollinear(
            ring[secondLastIdx], ring[secondLastIdx + 1], ring[secondLastIdx + 2],
            ring[lastIdx], ring[lastIdx + 1], ring[lastIdx + 2],
            renderPos[0], renderPos[1], renderPos[2],
          )) {
            ring[lastIdx] = renderPos[0];
            ring[lastIdx + 1] = renderPos[1];
            ring[lastIdx + 2] = renderPos[2];
            entry.colorRing[lastIdx] = entry.baseColor.r;
            entry.colorRing[lastIdx + 1] = entry.baseColor.g;
            entry.colorRing[lastIdx + 2] = entry.baseColor.b;
          } else {
            this.appendSample(entry, renderPos);
          }
        } else {
          this.appendSample(entry, renderPos);
        }
        entry.framesSinceLastSample = 0;
      }

      this.copyRingToGeometry(entry);
    }
  }

  getDebugInfos(bodies: CelestialBody[]): TrailDebugInfo[] {
    const infos: TrailDebugInfo[] = [];
    for (const body of bodies) {
      if (!PLANET_IDS.includes(body.templateId)) continue;
      const entry = this.trails.get(body.id);
      if (!entry) continue;

      const start = entry.writeIndex >= entry.activeCount
        ? entry.writeIndex - entry.activeCount
        : MAX_POINTS - (entry.activeCount - entry.writeIndex);

      let sourceRange: string;
      if (start + entry.activeCount <= MAX_POINTS) {
        sourceRange = `[${start}, ${start + entry.activeCount})`;
      } else {
        const firstEnd = MAX_POINTS;
        const secondLen = entry.activeCount - (MAX_POINTS - start);
        sourceRange = `[${start},${firstEnd}) + [0,${secondLen})`;
      }

      infos.push({
        bodyId: body.id,
        templateId: body.templateId,
        writeIndex: entry.writeIndex,
        activeCount: entry.activeCount,
        sourceRange,
        destRange: `[0, ${entry.activeCount})`,
      });
    }
    return infos;
  }

  dispose(): void {
    this.clearAll();
  }

  private appendSample(entry: TrailEntry, pos: [number, number, number]): void {
    const i = entry.writeIndex * 3;
    entry.ringBuffer[i] = pos[0];
    entry.ringBuffer[i + 1] = pos[1];
    entry.ringBuffer[i + 2] = pos[2];
    entry.colorRing[i] = entry.baseColor.r;
    entry.colorRing[i + 1] = entry.baseColor.g;
    entry.colorRing[i + 2] = entry.baseColor.b;
    entry.writeIndex = (entry.writeIndex + 1) % MAX_POINTS;
    if (entry.activeCount < MAX_POINTS) {
      entry.activeCount++;
    }
  }

  private copyRingToGeometry(entry: TrailEntry): void {
    if (entry.activeCount === 0) return;

    const geomArray = entry.line.geometry.attributes.position.array as Float32Array;
    const colorArray = entry.line.geometry.attributes.color.array as Float32Array;
    const ring = entry.ringBuffer;
    const colors = entry.colorRing;
    const start = entry.writeIndex >= entry.activeCount
      ? entry.writeIndex - entry.activeCount
      : MAX_POINTS - (entry.activeCount - entry.writeIndex);

    const tailBrightness = 0.05;
    for (let i = 0; i < entry.activeCount; i++) {
      const src = ((start + i) % MAX_POINTS) * 3;
      const dst = i * 3;
      geomArray[dst] = ring[src];
      geomArray[dst + 1] = ring[src + 1];
      geomArray[dst + 2] = ring[src + 2];

      const t = i / (entry.activeCount - 1);
      const fade = tailBrightness + (1 - tailBrightness) * t;
      colorArray[dst] = colors[src] * fade;
      colorArray[dst + 1] = colors[src + 1] * fade;
      colorArray[dst + 2] = colors[src + 2] * fade;
    }

    entry.line.geometry.attributes.position.needsUpdate = true;
    entry.line.geometry.attributes.color.needsUpdate = true;
    if (entry.activeCount >= MIN_VISIBLE_POINTS) {
      entry.line.geometry.setDrawRange(0, entry.activeCount);
    } else {
      entry.line.geometry.setDrawRange(0, 0);
    }
  }
}
