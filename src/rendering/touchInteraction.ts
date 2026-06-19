import * as THREE from 'three';
import {
  getSharedCamera, getZoom, getCurrentLookAt,
} from './cameraRef';
import {
  setZoomDirect, panCamera, rotateCameraHorizontal, rotateCameraVertical,
} from './setup';
import { useUIStore } from '../stores/uiStore';

interface GestureEvent extends UIEvent {
  scale: number;
  rotation: number;
}

const TAG = '[Touch]';

const ROTATE_SENSITIVITY = 0.004;
const ZOOM_SENSITIVITY = 0.005;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const WHEEL_PAN_SENSITIVITY = 0.5;

let _canvas: HTMLCanvasElement | null = null;

// --- Touch state ---
let rotationActive = false;
let lastRotationX = 0;
let lastRotationY = 0;
let pinchActive = false;
let lastPinchDistance = 0;
let lastMidX = 0;
let lastMidY = 0;
const activeTouches: Map<number, { x: number; y: number }> = new Map();

// --- Gesture (Safari pinch) state ---
let gestureStartZoom = 0;

// ===== Touch event handlers (real touchscreen) =====

function handleTouchStart(e: TouchEvent): void {
  console.log(TAG, 'touchstart', 'touches:', e.touches.length);

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (e.touches.length === 1) {
    const selectedTool = useUIStore.getState().selectedToolId;
    console.log(TAG, '1-finger, selectedTool:', selectedTool);
    if (!selectedTool) {
      e.preventDefault();
      lastRotationX = e.touches[0].clientX;
      lastRotationY = e.touches[0].clientY;
      rotationActive = true;
      console.log(TAG, '→ rotation started');
    } else {
      console.log(TAG, '→ tool selected, passing to mouse');
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
    console.log(TAG, '→ pinch started, dist:', lastPinchDistance.toFixed(1));
  } else if (e.touches.length >= 3) {
    e.preventDefault();
  }
}

function handleTouchMove(e: TouchEvent): void {
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

    console.log(TAG, 'rotate dx:', dx.toFixed(1), 'dy:', dy.toFixed(1));
    const camera = getSharedCamera();
    if (camera) {
      const [lx, ly, lz] = getCurrentLookAt();
      const target = new THREE.Vector3(lx, ly, lz);
      rotateCameraHorizontal(camera, -dx * ROTATE_SENSITIVITY, target);
      rotateCameraVertical(camera, -dy * ROTATE_SENSITIVITY, target);
    }
  } else if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    const distDelta = dist - lastPinchDistance;
    const panDx = midX - lastMidX;
    const panDy = midY - lastMidY;

    console.log(TAG, 'pinch distDelta:', distDelta.toFixed(1), 'pan:', panDx.toFixed(1), panDy.toFixed(1));

    if (lastPinchDistance > 0) {
      const newZ = getZoom() * (1 + distDelta * ZOOM_SENSITIVITY);
      console.log(TAG, 'zoom:', getZoom().toFixed(3), '→', newZ.toFixed(3));
      setZoomDirect(newZ);
    }

    panCamera(panDx, panDy);

    lastPinchDistance = dist;
    lastMidX = midX;
    lastMidY = midY;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  console.log(TAG, 'touchend, remaining:', e.touches.length);
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  if (e.touches.length < 2) {
    pinchActive = false;
  }
  if (e.touches.length === 0) {
    rotationActive = false;
  }
}

// ===== Wheel event handler (trackpad pan + pinch zoom) =====

function handleWheel(e: WheelEvent): void {
  e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    const newZ = getZoom() * (1 - e.deltaY * WHEEL_ZOOM_SENSITIVITY);
    console.log(TAG, 'wheel zoom', 'deltaY:', e.deltaY.toFixed(1), 'zoom:', getZoom().toFixed(3), '→', newZ.toFixed(3));
    setZoomDirect(newZ);
  } else {
    const dx = e.deltaX * WHEEL_PAN_SENSITIVITY;
    const dy = e.deltaY * WHEEL_PAN_SENSITIVITY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      console.log(TAG, 'wheel pan dx:', dx.toFixed(1), 'dy:', dy.toFixed(1));
      panCamera(dx, dy);
    }
  }
}

// ===== Gesture event handler (Safari pinch) =====

function handleGestureStart(e: Event): void {
  e.preventDefault();
  gestureStartZoom = getZoom();
  console.log(TAG, 'gesturestart, base zoom:', gestureStartZoom.toFixed(3));
}

function handleGestureChange(e: Event): void {
  e.preventDefault();
  const scale = (e as GestureEvent).scale;
  const newZ = gestureStartZoom * scale;
  console.log(TAG, 'gesturechange scale:', scale.toFixed(3), 'zoom:', gestureStartZoom.toFixed(3), '→', newZ.toFixed(3));
  setZoomDirect(newZ);
}

function handleGestureEnd(e: Event): void {
  e.preventDefault();
  console.log(TAG, 'gestureend');
}

// ===== Mouse drag rotation (trackpad single-finger or mouse drag) =====

let mouseRotating = false;
let mouseRotateStartX = 0;
let mouseRotateStartY = 0;

function handleMouseDownForRotation(e: MouseEvent): void {
  if (useUIStore.getState().selectedToolId) return;
  mouseRotating = true;
  mouseRotateStartX = e.clientX;
  mouseRotateStartY = e.clientY;
  console.log(TAG, 'mouse rotation started at', e.clientX, e.clientY);
}

function handleMouseMoveForRotation(e: MouseEvent): void {
  if (!mouseRotating) return;
  const dx = e.clientX - mouseRotateStartX;
  const dy = e.clientY - mouseRotateStartY;
  mouseRotateStartX = e.clientX;
  mouseRotateStartY = e.clientY;

  const camera = getSharedCamera();
  if (camera) {
    const [lx, ly, lz] = getCurrentLookAt();
    const target = new THREE.Vector3(lx, ly, lz);
    rotateCameraHorizontal(camera, -dx * ROTATE_SENSITIVITY, target);
    rotateCameraVertical(camera, -dy * ROTATE_SENSITIVITY, target);
  }
}

function handleMouseUpForRotation(): void {
  mouseRotating = false;
  console.log(TAG, 'mouse rotation ended');
}

// ===== Init / Destroy =====

export function initTouchInteraction(canvas: HTMLCanvasElement): void {
  console.log(TAG, 'init on canvas', canvas.clientWidth + 'x' + canvas.clientHeight);
  _canvas = canvas;
  canvas.style.touchAction = 'none';
  console.log(TAG, 'touch-action:', canvas.style.touchAction);

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);

  canvas.addEventListener('wheel', handleWheel, { passive: false });

  canvas.addEventListener('gesturestart', handleGestureStart, { passive: false });
  canvas.addEventListener('gesturechange', handleGestureChange, { passive: false });
  canvas.addEventListener('gestureend', handleGestureEnd, { passive: false });

  canvas.addEventListener('mousedown', handleMouseDownForRotation);
  window.addEventListener('mousemove', handleMouseMoveForRotation);
  window.addEventListener('mouseup', handleMouseUpForRotation);

  console.log(TAG, 'all listeners registered (touch + wheel + gesture + mouse)');
}

export function destroyTouchInteraction(): void {
  console.log(TAG, 'destroy');
  if (!_canvas) return;
  _canvas.removeEventListener('touchstart', handleTouchStart);
  _canvas.removeEventListener('touchmove', handleTouchMove);
  _canvas.removeEventListener('touchend', handleTouchEnd);
  _canvas.removeEventListener('touchcancel', handleTouchEnd);
  _canvas.removeEventListener('wheel', handleWheel);
  _canvas.removeEventListener('gesturestart', handleGestureStart);
  _canvas.removeEventListener('gesturechange', handleGestureChange);
  _canvas.removeEventListener('gestureend', handleGestureEnd);
  _canvas.removeEventListener('mousedown', handleMouseDownForRotation);
  window.removeEventListener('mousemove', handleMouseMoveForRotation);
  window.removeEventListener('mouseup', handleMouseUpForRotation);
  _canvas = null;
  rotationActive = false;
  pinchActive = false;
  mouseRotating = false;
  activeTouches.clear();
}
