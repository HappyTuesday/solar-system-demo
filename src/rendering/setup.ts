import * as THREE from 'three';

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
  scene.background = new THREE.Color(0x050510);

  // Orthographic camera: 1 world unit = 1 pixel on screen
  const camera = new THREE.OrthographicCamera(
    -w / 2, w / 2,
    h / 2, -h / 2,
    1, 5000
  );
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Ambient light
  const ambientLight = new THREE.AmbientLight(0x444466, 2);
  scene.add(ambientLight);

  // Point light at sun position (origin)
  const pointLight = new THREE.PointLight(0xffffff, 2, 0, 0);
  pointLight.position.set(0, 0, 0);
  scene.add(pointLight);

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
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }
}

export const CAMERA_ROTATE_STEP = Math.PI / 36;

// Rotate around Z-axis (in XY plane)
export function rotateCameraHorizontal(camera: THREE.OrthographicCamera, angle: number): void {
  const radius = Math.sqrt(camera.position.x ** 2 + camera.position.y ** 2);
  const currentAngle = Math.atan2(camera.position.y, camera.position.x);
  const newAngle = currentAngle + angle;
  camera.position.x = radius * Math.cos(newAngle);
  camera.position.y = radius * Math.sin(newAngle);
  camera.lookAt(0, 0, 0);
}

// Tilt camera Z height
export function rotateCameraVertical(camera: THREE.OrthographicCamera, angle: number): void {
  const dist = Math.sqrt(
    camera.position.x ** 2 + camera.position.y ** 2 + camera.position.z ** 2
  );
  const currentZenith = Math.acos(camera.position.z / dist);
  let newZenith = currentZenith + angle;
  newZenith = Math.max(0.05, Math.min(Math.PI - 0.05, newZenith));

  const azimuth = Math.atan2(camera.position.y, camera.position.x);
  const horizontalDist = dist * Math.sin(newZenith);
  camera.position.z = dist * Math.cos(newZenith);
  camera.position.x = horizontalDist * Math.cos(azimuth);
  camera.position.y = horizontalDist * Math.sin(azimuth);
  camera.lookAt(0, 0, 0);
}

export function resetCamera(camera: THREE.OrthographicCamera): void {
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
}
