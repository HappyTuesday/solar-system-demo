import type * as THREE from 'three';

let _camera: THREE.OrthographicCamera | null = null;
let _zoom = 0.5;
let _observationTargetId: string | null = null;
let _canvas: HTMLCanvasElement | null = null;

export function setSharedCamera(camera: THREE.OrthographicCamera | null): void {
  _camera = camera;
}

export function getSharedCamera(): THREE.OrthographicCamera | null {
  return _camera;
}

export function setSharedCanvas(canvas: HTMLCanvasElement | null): void {
  _canvas = canvas;
}

export function getSharedCanvas(): HTMLCanvasElement | null {
  return _canvas;
}

export function getZoom(): number {
  return _zoom;
}

export function setZoom(zoom: number): void {
  _zoom = zoom;
}

export function getObservationTargetId(): string | null {
  return _observationTargetId;
}

export function setObservationTargetId(id: string | null): void {
  _observationTargetId = id;
}

let _currentLookAt: [number, number, number] = [0, 0, 0];

export function getCurrentLookAt(): [number, number, number] {
  return _currentLookAt;
}

export function setCurrentLookAt(pos: [number, number, number]): void {
  _currentLookAt = pos;
}
