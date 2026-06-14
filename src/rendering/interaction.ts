import * as THREE from 'three';
import { bodyMeshMap } from './bodies';

const raycaster = new THREE.Raycaster();
const referencePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // XY plane

export function getPlacementPoint(
  event: MouseEvent,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const target = new THREE.Vector3();
  const intersection = raycaster.ray.intersectPlane(referencePlane, target);
  return intersection;
}

export function selectBodiesInRect(
  start: [number, number],
  end: [number, number],
  camera: THREE.Camera,
  canvas: HTMLCanvasElement
): string[] {
  const rect = canvas.getBoundingClientRect();
  const minX = Math.min(start[0], end[0]);
  const maxX = Math.max(start[0], end[0]);
  const minY = Math.min(start[1], end[1]);
  const maxY = Math.max(start[1], end[1]);

  const selected: string[] = [];
  const tempVec = new THREE.Vector3();

  for (const [id, bm] of bodyMeshMap) {
    bm.group.getWorldPosition(tempVec);
    const projected = tempVec.clone().project(camera);

    const screenX = (projected.x + 1) / 2 * rect.width + rect.left;
    const screenY = (-projected.y + 1) / 2 * rect.height + rect.top;

    if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
      selected.push(id);
    }
  }

  return selected;
}

export function setBodyHighlight(ids: string[], highlighted: boolean): void {
  for (const [id, bm] of bodyMeshMap) {
    const material = bm.mesh.material as THREE.MeshStandardMaterial;
    if (ids.includes(id) && highlighted) {
      material.emissive?.set(0x444444);
      material.emissiveIntensity = 1;
    } else {
      material.emissive?.set(0x000000);
      material.emissiveIntensity = 0;
    }
  }
}

// ===== Preview & Gizmos =====

let velocityArrow: THREE.Group | null = null;
let guideArrow: THREE.Group | null = null;
let previewSphere: THREE.Mesh | null = null;
let floatingPreview: THREE.Mesh | null = null;
let floatingPreviewTemplateId: string | null = null;

export function createPreviewSphere(scene: THREE.Scene, position: THREE.Vector3, radius: number, color: number): void {
  removePreviewSphere(scene);
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  previewSphere = new THREE.Mesh(geometry, material);
  previewSphere.position.copy(position);
  previewSphere.renderOrder = 3;
  scene.add(previewSphere);
}

export function removePreviewSphere(scene: THREE.Scene): void {
  if (previewSphere) {
    scene.remove(previewSphere);
    previewSphere.geometry.dispose();
    (previewSphere.material as THREE.Material).dispose();
    previewSphere = null;
  }
}

export function createFloatingPreview(
  scene: THREE.Scene,
  position: THREE.Vector3,
  radius: number,
  color: number,
  templateId: string
): void {
  if (floatingPreview && floatingPreviewTemplateId === templateId) {
    floatingPreview.position.copy(position);
    return;
  }
  removeFloatingPreview(scene);
  const geometry = new THREE.SphereGeometry(radius, 48, 48);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  floatingPreview = new THREE.Mesh(geometry, material);
  floatingPreview.position.copy(position);
  floatingPreview.renderOrder = 3;
  scene.add(floatingPreview);
  floatingPreviewTemplateId = templateId;
}

export function removeFloatingPreview(scene: THREE.Scene): void {
  if (floatingPreview) {
    scene.remove(floatingPreview);
    floatingPreview.geometry.dispose();
    (floatingPreview.material as THREE.Material).dispose();
    floatingPreview = null;
    floatingPreviewTemplateId = null;
  }
}

export function updateFloatingPreview(position: THREE.Vector3): void {
  if (floatingPreview) {
    floatingPreview.position.copy(position);
  }
}

// ===== Arrows (pixel-unit scale) =====

function createArrow(from: THREE.Vector3, to: THREE.Vector3, color: number, opacity: number): THREE.Group {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  if (length < 1) return new THREE.Group();
  dir.normalize();

  const group = new THREE.Group();
  const shaftLen = length * 0.8;
  const shaftGeo = new THREE.CylinderGeometry(2, 2, shaftLen, 8);
  const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.y = shaftLen / 2;
  group.add(shaft);

  const headGeo = new THREE.ConeGeometry(5, length * 0.2, 8);
  const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = shaftLen;
  group.add(head);

  group.position.copy(from);
  group.renderOrder = 4;
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.setRotationFromQuaternion(quaternion);
  return group;
}

export function updateVelocityArrow(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, color: number): void {
  removeVelocityArrow(scene);
  velocityArrow = createArrow(from, to, color, 0.8);
  scene.add(velocityArrow);
}

export function updateGuideArrow(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, color: number): void {
  removeGuideArrow(scene);
  guideArrow = createArrow(from, to, color, 0.4);
  scene.add(guideArrow);
}

export function removeVelocityArrow(scene: THREE.Scene): void {
  if (velocityArrow) {
    scene.remove(velocityArrow);
    velocityArrow.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    velocityArrow = null;
  }
}

export function removeGuideArrow(scene: THREE.Scene): void {
  if (guideArrow) {
    scene.remove(guideArrow);
    guideArrow.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    guideArrow = null;
  }
}

export function cleanupGizmos(scene: THREE.Scene): void {
  removeVelocityArrow(scene);
  removeGuideArrow(scene);
  removePreviewSphere(scene);
  removeFloatingPreview(scene);
}
