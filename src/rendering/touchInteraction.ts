import * as THREE from 'three';
import {
  getSharedCamera, getZoom, getCurrentLookAt,
} from './cameraRef';
import {
  setZoomDirect, panCamera, rotateCameraHorizontal, rotateCameraVertical,
} from './setup';
import { useUIStore } from '../stores/uiStore';

const TAG = '[Touch]';

const ROTATE_SENSITIVITY = 0.004;
const ZOOM_SENSITIVITY = 0.005;

let _canvas: HTMLCanvasElement | null = null;
let rotationActive = false;
let lastRotationX = 0;
let lastRotationY = 0;
let pinchActive = false;
let lastPinchDistance = 0;
let lastMidX = 0;
let lastMidY = 0;
const activeTouches: Map<number, { x: number; y: number }> = new Map();

function handleTouchStart(e: TouchEvent): void {
  console.log(TAG, 'touchstart', 'touches:', e.touches.length, 'changed:', e.changedTouches.length);

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (e.touches.length === 1) {
    const selectedTool = useUIStore.getState().selectedToolId;
    console.log(TAG, 'touchstart 1-finger, selectedTool:', selectedTool);
    if (!selectedTool) {
      e.preventDefault();
      lastRotationX = e.touches[0].clientX;
      lastRotationY = e.touches[0].clientY;
      rotationActive = true;
      console.log(TAG, '→ rotation started at', lastRotationX, lastRotationY);
    } else {
      console.log(TAG, '→ tool selected, no gesture (passing through to mouse)');
    }
  } else if (e.touches.length === 2) {
    e.preventDefault();
    rotationActive = false;
    pinchActive = true;
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    lastPinchDistance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    lastMidX = (t0.clientX + t1.clientX) / 2;
    lastMidY = (t0.clientY + t1.clientY) / 2;
    console.log(TAG, '→ pinch started, dist:', lastPinchDistance.toFixed(1), 'mid:', lastMidX.toFixed(1), lastMidY.toFixed(1));
  } else if (e.touches.length >= 3) {
    e.preventDefault();
    console.log(TAG, '→ 3+ fingers, ignored');
  }
}

function handleTouchMove(e: TouchEvent): void {
  console.log(TAG, 'touchmove', 'touches:', e.touches.length, 'rotationActive:', rotationActive, 'pinchActive:', pinchActive);

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (rotationActive && e.touches.length === 1) {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastRotationX;
    const dy = t.clientY - lastRotationY;
    lastRotationX = t.clientX;
    lastRotationY = t.clientY;

    console.log(TAG, '→ rotate dx:', dx.toFixed(1), 'dy:', dy.toFixed(1));

    const camera = getSharedCamera();
    if (camera) {
      const [lx, ly, lz] = getCurrentLookAt();
      const target = new THREE.Vector3(lx, ly, lz);
      rotateCameraHorizontal(camera, -dx * ROTATE_SENSITIVITY, target);
      rotateCameraVertical(camera, -dy * ROTATE_SENSITIVITY, target);
    } else {
      console.log(TAG, '→ camera is null, skip rotate');
    }
  } else if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    const distDelta = dist - lastPinchDistance;
    const dx = midX - lastMidX;
    const dy = midY - lastMidY;

    console.log(TAG, '→ pinch dist:', dist.toFixed(1), 'distDelta:', distDelta.toFixed(1), 'pan dx:', dx.toFixed(1), 'dy:', dy.toFixed(1));

    if (lastPinchDistance > 0) {
      const prevZ = getZoom();
      const newZ = prevZ * (1 + distDelta * ZOOM_SENSITIVITY);
      console.log(TAG, '→ zoom prevZ:', prevZ.toFixed(3), '→ newZ:', newZ.toFixed(3));
      setZoomDirect(newZ);
    }

    panCamera(dx, dy);

    lastPinchDistance = dist;
    lastMidX = midX;
    lastMidY = midY;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  console.log(TAG, 'touchend', 'remaining:', e.touches.length);

  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  if (e.touches.length < 2) {
    pinchActive = false;
    console.log(TAG, '→ pinch ended');
  }
  if (e.touches.length === 0) {
    rotationActive = false;
    console.log(TAG, '→ rotation ended');
  }
}

export function initTouchInteraction(canvas: HTMLCanvasElement): void {
  console.log(TAG, 'init on canvas', canvas.tagName, canvas.clientWidth + 'x' + canvas.clientHeight);
  _canvas = canvas;
  canvas.style.touchAction = 'none';
  console.log(TAG, 'touch-action set to:', canvas.style.touchAction);

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);

  canvas.addEventListener('pointerdown', (e) => console.log(TAG, '⭐ pointerdown', 'type:', e.pointerType, 'id:', e.pointerId));
  canvas.addEventListener('pointermove', (e) => console.log(TAG, '⭐ pointermove', 'type:', e.pointerType));
  canvas.addEventListener('pointerup', (e) => console.log(TAG, '⭐ pointerup', 'type:', e.pointerType));
  canvas.addEventListener('mousedown', () => console.log(TAG, '⭐ mousedown'));
  canvas.addEventListener('touchstart', () => console.log(TAG, '⭐ extra touchstart'), { passive: true });
  canvas.addEventListener('wheel', (e) => console.log(TAG, '⭐ wheel', 'delta:', e.deltaX, e.deltaY));

  console.log(TAG, 'all listeners registered (touch + pointer + mouse + wheel for diagnosis)');
}

export function destroyTouchInteraction(): void {
  console.log(TAG, 'destroy');
  if (!_canvas) return;
  _canvas.removeEventListener('touchstart', handleTouchStart);
  _canvas.removeEventListener('touchmove', handleTouchMove);
  _canvas.removeEventListener('touchend', handleTouchEnd);
  _canvas.removeEventListener('touchcancel', handleTouchEnd);
  _canvas = null;
  rotationActive = false;
  pinchActive = false;
  activeTouches.clear();
}
