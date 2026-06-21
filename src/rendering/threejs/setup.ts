import * as THREE from 'three';
import { getZoom, setZoom, getSharedCamera, getSharedCanvas, setCurrentLookAt } from './cameraRef';
import { getLinearScale } from '../../engine/coordinateTransform';
import { useUIStore } from '../../stores/uiStore';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
}

export function initScene(canvas: HTMLCanvasElement): SceneSetup {
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const zoom = 0.5;
  const fw = w / zoom;
  const fh = h / zoom;
  const camera = new THREE.OrthographicCamera(
    -fw / 2, fw / 2,
    fh / 2, -fh / 2,
    0.1, 5000
  );
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambientLight = new THREE.AmbientLight(0xffffff, 3);
  scene.add(ambientLight);

  return { scene, camera, renderer };
}

export function handleResize(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera
): void {
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;
  if (Math.abs(renderer.domElement.width - w) > 2 || Math.abs(renderer.domElement.height - h) > 2) {
    renderer.setSize(w, h, false);
    applyZoom(camera, w, h, getZoom());
  }
}

export const CAMERA_ROTATE_STEP = Math.PI / 36;

export const ZOOM_STEP_FACTOR = 1.10;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3.0;

export function applyZoom(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number, zoom: number): void {
  const fw = containerWidth / zoom;
  const fh = containerHeight / zoom;
  camera.left = -fw / 2;
  camera.right = fw / 2;
  camera.top = fh / 2;
  camera.bottom = -fh / 2;
  camera.updateProjectionMatrix();
}

export function rotateCameraHorizontal(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const currentAngle = Math.atan2(dy, dx);
  const newAngle = currentAngle + angle;
  camera.position.x = target.x + radius * Math.cos(newAngle);
  camera.position.y = target.y + radius * Math.sin(newAngle);
  camera.lookAt(target);
}

export function rotateCameraVertical(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const dz = camera.position.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const currentZenith = Math.acos(dz / dist);
  let newZenith = currentZenith + angle;
  newZenith = Math.max(0.05, Math.min(Math.PI - 0.05, newZenith));

  const azimuth = Math.atan2(dy, dx);
  const horizontalDist = dist * Math.sin(newZenith);
  camera.position.z = target.z + dist * Math.cos(newZenith);
  camera.position.x = target.x + horizontalDist * Math.cos(azimuth);
  camera.position.y = target.y + horizontalDist * Math.sin(azimuth);
  camera.lookAt(target);
}

export function resetCamera(camera: THREE.OrthographicCamera, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  camera.position.set(target.x, target.y, target.z + 100);
  camera.lookAt(target);
}

export function zoomIn(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  const z = Math.min(getZoom() * ZOOM_STEP_FACTOR, ZOOM_MAX);
  setZoom(z);
  applyZoom(camera, containerWidth, containerHeight, z);
}

export function zoomOut(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  const z = Math.max(getZoom() / ZOOM_STEP_FACTOR, ZOOM_MIN);
  setZoom(z);
  applyZoom(camera, containerWidth, containerHeight, z);
}

export function resetZoom(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  setZoom(0.5);
  applyZoom(camera, containerWidth, containerHeight, 0.5);
}

export function setZoomDirect(newZoom: number, skipScaleSync = false): void {
  const currentZoom = getZoom();
  const ZOOM_TRIGGER_UP = 2.5;
  const ZOOM_TRIGGER_DOWN = 0.2;
  const ZOOM_RESET = 1.0;

  let effectiveZoom = newZoom;

  if (!skipScaleSync) {
    if (effectiveZoom > ZOOM_TRIGGER_UP && currentZoom <= ZOOM_TRIGGER_UP) {
      const factor = effectiveZoom / ZOOM_RESET;
      useUIStore.getState().setLinearScaleValue(getLinearScale() * factor);
      effectiveZoom = ZOOM_RESET;
    } else if (effectiveZoom < ZOOM_TRIGGER_DOWN && currentZoom >= ZOOM_TRIGGER_DOWN) {
      const factor = ZOOM_RESET / Math.max(effectiveZoom, 0.01);
      useUIStore.getState().setLinearScaleValue(getLinearScale() / factor);
      effectiveZoom = ZOOM_RESET;
    }
  }

  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, effectiveZoom));
  setZoom(zoom);
  const camera = getSharedCamera();
  const canvas = getSharedCanvas();
  if (!camera || !canvas) return;
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;
  applyZoom(camera, w, h, zoom);
}

export function panCamera(dx: number, dy: number): void {
  const camera = getSharedCamera();
  if (!camera) return;
  const z = getZoom();

  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  const rx = m[0], ry = m[1], rz = m[2];
  const ux = m[4], uy = m[5], uz = m[6];

  const scale = 1 / z;
  const moveX = (rx * dx + ux * dy) * scale;
  const moveY = (ry * dx + uy * dy) * scale;
  const moveZ = (rz * dx + uz * dy) * scale;

  camera.position.x += moveX;
  camera.position.y -= moveY;
  camera.position.z += moveZ;

  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const t = Math.abs(dir.z) < 1e-10 ? 0 : -camera.position.z / dir.z;
  const newLx = camera.position.x + dir.x * t;
  const newLy = camera.position.y + dir.y * t;
  setCurrentLookAt([newLx, newLy, 0]);
  camera.lookAt(newLx, newLy, 0);
}
