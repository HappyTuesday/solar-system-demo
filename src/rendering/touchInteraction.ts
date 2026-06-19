import * as THREE from 'three';
import {
  getSharedCamera, getZoom, getCurrentLookAt, setCurrentLookAt,
} from './cameraRef';
import {
  setZoomDirect, panCamera, rotateCameraHorizontal, rotateCameraVertical,
} from './setup';
import { useUIStore } from '../stores/uiStore';

const ROTATE_SENSITIVITY = 0.004;
const ZOOM_SENSITIVITY = 0.001;

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
      const newLookAt = getCurrentLookAt();
      setCurrentLookAt([newLookAt[0], newLookAt[1], newLookAt[2]]);
    }
  } else if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    if (lastPinchDistance > 0) {
      const distDelta = dist - lastPinchDistance;
      const prevZ = getZoom();
      const newZ = prevZ * (1 + distDelta * ZOOM_SENSITIVITY);
      setZoomDirect(newZ);
    }

    const dx = midX - lastMidX;
    const dy = midY - lastMidY;
    panCamera(dx, dy);

    lastPinchDistance = dist;
    lastMidX = midX;
    lastMidY = midY;
  }
}

function handleTouchEnd(e: TouchEvent): void {
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

export function initTouchInteraction(canvas: HTMLCanvasElement): void {
  _canvas = canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);
}

export function destroyTouchInteraction(): void {
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
