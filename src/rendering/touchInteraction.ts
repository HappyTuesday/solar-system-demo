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

const ROTATE_SENSITIVITY = 0.004;
const ZOOM_SENSITIVITY = 0.008;
const WHEEL_ZOOM_SENSITIVITY = 0.005;
const WHEEL_PAN_SENSITIVITY = 0.5;
const INERTIA_FRICTION = 0.92;
const INERTIA_STOP_THRESHOLD = 0.0003;

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
let gestureLastScale = 1;

// --- Zoom inertia ---
let zoomVelocity = 0;
let inertiaAnimId = 0;
let wheelInertiaTimer: ReturnType<typeof setTimeout> | null = null;

function trackZoomVelocity(instantFactor: number): void {
  zoomVelocity = zoomVelocity * 0.6 + instantFactor * 0.4;
}

function startZoomInertia(): void {
  if (inertiaAnimId) cancelAnimationFrame(inertiaAnimId);
  if (Math.abs(zoomVelocity) < INERTIA_STOP_THRESHOLD) return;

  function step(): void {
    zoomVelocity *= INERTIA_FRICTION;
    if (Math.abs(zoomVelocity) < INERTIA_STOP_THRESHOLD) {
      zoomVelocity = 0;
      inertiaAnimId = 0;
      return;
    }
    const newZ = getZoom() * (1 + zoomVelocity);
    setZoomDirect(newZ);
    inertiaAnimId = requestAnimationFrame(step);
  }
  inertiaAnimId = requestAnimationFrame(step);
}

function stopInertia(): void {
  if (inertiaAnimId) {
    cancelAnimationFrame(inertiaAnimId);
    inertiaAnimId = 0;
  }
  zoomVelocity = 0;
}

// ===== Touch event handlers =====

function handleTouchStart(e: TouchEvent): void {
  stopInertia();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (e.touches.length === 1) {
    const selectedTool = useUIStore.getState().selectedToolId;
    if (!selectedTool) {
      e.preventDefault();
      lastRotationX = e.touches[0].clientX;
      lastRotationY = e.touches[0].clientY;
      rotationActive = true;
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

    if (lastPinchDistance > 0) {
      const instantFactor = distDelta * ZOOM_SENSITIVITY;
      const newZ = getZoom() * (1 + instantFactor);
      trackZoomVelocity(instantFactor);
      setZoomDirect(newZ);
    }

    panCamera(panDx, panDy);

    lastPinchDistance = dist;
    lastMidX = midX;
    lastMidY = midY;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  if (e.touches.length < 2 && pinchActive) {
    pinchActive = false;
    startZoomInertia();
  }
  if (e.touches.length === 0) {
    rotationActive = false;
  }
}

// ===== Wheel event handler =====

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  stopInertia();

  if (e.ctrlKey || e.metaKey) {
    const instantFactor = -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
    const newZ = getZoom() * (1 + instantFactor);
    trackZoomVelocity(instantFactor);
    setZoomDirect(newZ);

    if (wheelInertiaTimer) clearTimeout(wheelInertiaTimer);
    wheelInertiaTimer = setTimeout(() => {
      startZoomInertia();
    }, 80);
  } else {
    const dx = e.deltaX * WHEEL_PAN_SENSITIVITY;
    const dy = e.deltaY * WHEEL_PAN_SENSITIVITY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      panCamera(dx, dy);
    }
  }
}

// ===== Gesture event handler (Safari pinch) =====

function handleGestureStart(e: Event): void {
  e.preventDefault();
  stopInertia();
  gestureStartZoom = getZoom();
  gestureLastScale = 1;
}

function handleGestureChange(e: Event): void {
  e.preventDefault();
  const scale = (e as GestureEvent).scale;
  const instantFactor = scale / gestureLastScale - 1;
  const newZ = getZoom() * (1 + instantFactor);
  trackZoomVelocity(instantFactor);
  setZoomDirect(newZ);
  gestureLastScale = scale;
}

function handleGestureEnd(e: Event): void {
  e.preventDefault();
  startZoomInertia();
}

// ===== Mouse drag rotation =====

let mouseRotating = false;
let mouseRotateStartX = 0;
let mouseRotateStartY = 0;

function handleMouseDownForRotation(e: MouseEvent): void {
  if (useUIStore.getState().selectedToolId) return;
  mouseRotating = true;
  mouseRotateStartX = e.clientX;
  mouseRotateStartY = e.clientY;
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
}

// ===== Init / Destroy =====

export function initTouchInteraction(canvas: HTMLCanvasElement): void {
  _canvas = canvas;
  canvas.style.touchAction = 'none';

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
}

export function destroyTouchInteraction(): void {
  if (!_canvas) return;
  stopInertia();
  if (wheelInertiaTimer) clearTimeout(wheelInertiaTimer);
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
