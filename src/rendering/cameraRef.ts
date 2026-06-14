import type * as THREE from 'three';

let _camera: THREE.OrthographicCamera | null = null;

export function setSharedCamera(camera: THREE.OrthographicCamera | null): void {
  _camera = camera;
}

export function getSharedCamera(): THREE.OrthographicCamera | null {
  return _camera;
}
