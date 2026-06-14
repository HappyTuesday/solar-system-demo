import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { REAL_DATA } from '../engine/constants';
import { physicalToRender, physicalRadiusToRender } from '../engine/coordinateTransform';

const DEFAULT_COLORS: Record<string, number> = {
  sun: 0xffdd00,
  mercury: 0xcccccc,
  venus: 0xffcc88,
  earth: 0x4488ff,
  mars: 0xff6644,
  jupiter: 0xffcc88,
  saturn: 0xffeecc,
  uranus: 0x88ccff,
  neptune: 0x4488ff,
  moon: 0xcccccc,
  io: 0xffcc44,
  europa: 0xddccbb,
  ganymede: 0xbbbbbb,
  callisto: 0x888888,
  titan: 0xffcc88,
  phobos: 0x998877,
  deimos: 0x887766,
};

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function loadTexture(url: string): THREE.Texture | null {
  if (textureCache.has(url)) return textureCache.get(url)!;
  const texture = textureLoader.load(url, undefined, undefined, () => {});
  textureCache.set(url, texture);
  return texture;
}

export interface BodyMesh {
  mesh: THREE.Mesh;
  group: THREE.Group;
}

export const bodyMeshMap = new Map<string, BodyMesh>();

export function createBodyMesh(
  body: CelestialBody,
  scene: THREE.Scene
): BodyMesh | null {
  const data = REAL_DATA[body.templateId];
  if (!data) return null;

  const isSun = body.templateId === 'sun';
  const renderRadius = physicalRadiusToRender(data.radius, isSun);

  const geometry = new THREE.SphereGeometry(renderRadius, isSun ? 64 : 32, isSun ? 64 : 32);

  const color = DEFAULT_COLORS[body.templateId] ?? 0x888888;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
  });

  if (!isSun) {
    const textureUrl = `/textures/${body.templateId}.jpg`;
    const texture = loadTexture(textureUrl);
    if (texture) {
      material.map = texture;
      material.color.set(0xffffff);
    }
  } else {
    material.emissive = new THREE.Color(0xff6600);
    material.emissiveIntensity = 0.6;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  const renderPos = physicalToRender(body.position);
  group.position.set(renderPos[0], renderPos[1], renderPos[2]);

  // Saturn rings
  if (body.templateId === 'saturn') {
    const ringGeometry = new THREE.RingGeometry(renderRadius * 1.3, renderRadius * 2.0, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xccaa66,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = 0.3;
    group.add(ring);
  }

  const result: BodyMesh = { mesh, group };
  bodyMeshMap.set(body.id, result);
  return result;
}

export function updateBodyMeshes(bodies: CelestialBody[], _dt: number): void {
  for (const body of bodies) {
    const bm = bodyMeshMap.get(body.id);
    if (!bm) continue;
    const renderPos = physicalToRender(body.position);
    bm.group.position.set(renderPos[0], renderPos[1], renderPos[2]);
  }
}

export function removeBodyMesh(instanceId: string, scene: THREE.Scene): void {
  const bm = bodyMeshMap.get(instanceId);
  if (!bm) return;
  scene.remove(bm.group);
  bm.mesh.geometry.dispose();
  if (Array.isArray(bm.mesh.material)) {
    bm.mesh.material.forEach(m => m.dispose());
  } else {
    bm.mesh.material.dispose();
  }
  bodyMeshMap.delete(instanceId);
}

export function clearAllMeshes(scene: THREE.Scene): void {
  for (const [id] of bodyMeshMap) {
    removeBodyMesh(id, scene);
  }
  bodyMeshMap.clear();
}
