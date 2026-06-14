import * as THREE from 'three';
import { SPATIAL_TRANSFORM } from '../engine/constants';

export function createReferencePlane(scene: THREE.Scene, _width: number, _height: number): THREE.Mesh {
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
  plane.position.z = -1;
  plane.renderOrder = 1;
  scene.add(plane);

  const gridSize = Math.ceil(SPATIAL_TRANSFORM.maxOrbitRadius * 1.25);
  const gridStep = 100;
  const gridColor = 0x446688;
  const gridMat = new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.15, depthWrite: false });

  for (let i = -gridSize; i <= gridSize; i += gridStep) {
    const pointsH: THREE.Vector3[] = [
      new THREE.Vector3(-gridSize, i, -0.5),
      new THREE.Vector3(gridSize, i, -0.5),
    ];
    const geoH = new THREE.BufferGeometry().setFromPoints(pointsH);
    scene.add(new THREE.Line(geoH, gridMat));

    const pointsV: THREE.Vector3[] = [
      new THREE.Vector3(i, -gridSize, -0.5),
      new THREE.Vector3(i, gridSize, -0.5),
    ];
    const geoV = new THREE.BufferGeometry().setFromPoints(pointsV);
    scene.add(new THREE.Line(geoV, gridMat));
  }

  return plane;
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
