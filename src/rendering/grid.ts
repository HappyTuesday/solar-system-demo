import * as THREE from 'three';
import { DISPLAY_CONFIG } from '../engine/constants';

export function createReferencePlane(scene: THREE.Scene, width: number, height: number): THREE.Mesh {
  const w = width * 3;
  const h = height * 3;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({
    color: DISPLAY_CONFIG.referencePlaneColor,
    transparent: true,
    opacity: DISPLAY_CONFIG.referencePlaneOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.position.z = -1;
  plane.renderOrder = 1;
  scene.add(plane);

  // Grid lines
  const gridSize = 200;
  const gridStep = 50;
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

export function addOrbitRing(scene: THREE.Scene, radius: number, color?: number): THREE.Line {
  const ring = createOrbitRing(scene, radius, color);
  orbitRings.push(ring);
  return ring;
}
