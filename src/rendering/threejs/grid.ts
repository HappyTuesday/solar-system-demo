import * as THREE from 'three';
import { SPATIAL_TRANSFORM } from '../../engine/constants';

let _refGroup: THREE.Group | null = null;

export function getRefGroup(): THREE.Group | null {
  return _refGroup;
}

export function createReferencePlane(scene: THREE.Scene, _width: number, _height: number): THREE.Group {
  const group = new THREE.Group();

  const size = SPATIAL_TRANSFORM.maxOrbitRadius * 3;
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshBasicMaterial({
    color: SPATIAL_TRANSFORM.referencePlaneColor,
    transparent: true,
    opacity: SPATIAL_TRANSFORM.referencePlaneOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.renderOrder = 1;
  group.add(plane);

  const gridSize = Math.ceil(SPATIAL_TRANSFORM.maxOrbitRadius * 1.25);
  const gridStep = 100;
  const gridColor = 0x446688;
  const gridMat = new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.15, depthWrite: false });

  for (let i = -gridSize; i <= gridSize; i += gridStep) {
    const pointsH: THREE.Vector3[] = [
      new THREE.Vector3(-gridSize, i, 0),
      new THREE.Vector3(gridSize, i, 0),
    ];
    const geoH = new THREE.BufferGeometry().setFromPoints(pointsH);
    group.add(new THREE.Line(geoH, gridMat));

    const pointsV: THREE.Vector3[] = [
      new THREE.Vector3(i, -gridSize, 0),
      new THREE.Vector3(i, gridSize, 0),
    ];
    const geoV = new THREE.BufferGeometry().setFromPoints(pointsV);
    group.add(new THREE.Line(geoV, gridMat));
  }

  group.position.set(0, 0, -1);
  _refGroup = group;
  scene.add(group);
  return group;
}

export function updateRefPlaneOrientation(camera: THREE.Camera, lookAt: THREE.Vector3): void {
  if (!_refGroup) return;
  _refGroup.position.set(lookAt.x, lookAt.y, -1);
  _refGroup.quaternion.copy(camera.quaternion);
}

export function resizeRefPlane(linearScale: number): void {
  if (!_refGroup) return;
  const basePlaneRadius = SPATIAL_TRANSFORM.maxOrbitRadius * 1.5;
  const furthestRender = 4.5e12 * linearScale;
  const s = Math.max(1, furthestRender * 1.2 / basePlaneRadius);
  _refGroup.scale.setScalar(s);
}

export function createOrbitRing(scene: THREE.Scene, radius: number, color: number = 0xffaa00): THREE.Line {
  const segments = 128;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: 20,
    gapSize: 20,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 2;
  scene.add(line);
  return line;
}

const orbitRings: THREE.Line[] = [];

export function clearOrbitRings(scene: THREE.Scene): void {
  for (const ring of orbitRings) {
    scene.remove(ring);
    ring.geometry.dispose();
    if (Array.isArray(ring.material)) {
      ring.material.forEach(m => m.dispose());
    } else {
      ring.material.dispose();
    }
  }
  orbitRings.length = 0;
}

export function addOrbitRing(scene: THREE.Scene, radius: number, color?: number, center?: THREE.Vector3): THREE.Line {
  const ring = createOrbitRing(scene, radius, color);
  if (center) {
    ring.position.copy(center);
  }
  orbitRings.push(ring);
  return ring;
}
