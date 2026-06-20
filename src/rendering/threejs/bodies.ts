import * as THREE from 'three';
import type { CelestialBody } from '../../types';
import { REAL_DATA } from '../../engine/constants';
import { physicalToRender, physicalRadiusToRender } from '../../engine/coordinateTransform';

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
  const texture = textureLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 16;
  }, undefined, () => {});
  textureCache.set(url, texture);
  return texture;
}

export interface BodyMesh {
  mesh: THREE.Mesh;
  outline: THREE.Sprite;
  tiltGroup: THREE.Group;
  group: THREE.Group;
}

export const bodyMeshMap = new Map<string, BodyMesh>();

let _glowTexture: THREE.Texture | null = null;

function getGlowTexture(): THREE.Texture {
  if (_glowTexture) return _glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const gradient = ctx.createRadialGradient(cx, cx, cx * 0.18, cx, cx, cx);
  gradient.addColorStop(0, 'rgba(68, 170, 255, 0)');
  gradient.addColorStop(0.4, 'rgba(68, 170, 255, 0.08)');
  gradient.addColorStop(0.65, 'rgba(68, 170, 255, 0.5)');
  gradient.addColorStop(0.9, 'rgba(68, 170, 255, 0.04)');
  gradient.addColorStop(1, 'rgba(68, 170, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  _glowTexture = new THREE.CanvasTexture(canvas);
  _glowTexture.needsUpdate = true;
  return _glowTexture;
}

export function setBodyOutline(bodyId: string, visible: boolean): void {
  const bm = bodyMeshMap.get(bodyId);
  if (bm) bm.outline.visible = visible;
}

export function createBodyMesh(
  body: CelestialBody,
  scene: THREE.Scene
): BodyMesh | null {
  const data = REAL_DATA[body.templateId];
  if (!data) return null;

  const isSun = body.templateId === 'sun';
  const renderRadius = physicalRadiusToRender(data.radius);

  const geometry = new THREE.SphereGeometry(renderRadius, isSun ? 64 : 32, isSun ? 64 : 32);

  let material: THREE.Material;

  if (isSun) {
    material = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const texture = loadTexture(`/textures/${body.templateId}.jpg`);
    if (texture) {
      (material as THREE.MeshBasicMaterial).map = texture;
      (material as THREE.MeshBasicMaterial).color.set(0xffffff);
    }
  } else {
    const color = DEFAULT_COLORS[body.templateId] ?? 0x888888;
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
    });

    const textureUrl = `/textures/${body.templateId}.jpg`;
    const texture = loadTexture(textureUrl);
    if (texture) {
      (material as THREE.MeshStandardMaterial).map = texture;
      (material as THREE.MeshStandardMaterial).color.set(0xffffff);
    }
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.rotation.y = body.rotationPhase ?? 0;

  const glowRadius = Math.max(renderRadius * 2, 3);
  const outlineMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: 0x44aaff,
    blending: THREE.NormalBlending,
    transparent: true,
    opacity: 0.5,
    depthTest: true,
    depthWrite: false,
  });
  const outline = new THREE.Sprite(outlineMat);
  outline.scale.set(glowRadius * 2.8, glowRadius * 2.8, 1);
  outline.position.z = 0.5;
  outline.renderOrder = 5;
  outline.visible = false;

  const tilt = REAL_DATA[body.templateId]?.orbital?.axialTilt ?? 0;
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.x = tilt;
  tiltGroup.add(mesh);
  tiltGroup.add(outline);

  const group = new THREE.Group();
  group.add(tiltGroup);
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
    tiltGroup.add(ring);
  }

  const result: BodyMesh = { mesh, outline, tiltGroup, group };
  bodyMeshMap.set(body.id, result);
  return result;
}

export function updateBodyMeshes(bodies: CelestialBody[], dt: number): void {
  for (const body of bodies) {
    const bm = bodyMeshMap.get(body.id);
    if (!bm) continue;
    const renderPos = physicalToRender(body.position);
    bm.group.position.set(renderPos[0], renderPos[1], renderPos[2]);
    if (body.rotationSpeed !== 0) {
      bm.mesh.rotation.y += body.rotationSpeed * dt;
    }
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
