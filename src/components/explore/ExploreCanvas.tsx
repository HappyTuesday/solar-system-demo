import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useExploreStore } from '../../stores/exploreStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { computeOffScreenBodies, type OffScreenEntry } from './OffScreenIndicator';
import OffScreenIndicator from './OffScreenIndicator';

const SCALE = 1 / 1.496e11;
const ORBIT_LINE_POINTS = 256;
const INITIAL_FRUSTUM = 35;

const DISPLAY_RADII: Record<string, number> = {
  sun: 0.25, jupiter: 0.65, saturn: 0.55, uranus: 0.45,
  neptune: 0.4, earth: 0.18, venus: 0.18, mars: 0.15, mercury: 0.12,
};

function makeOrthoCamera(w: number, h: number, halfSize: number) {
  const aspect = Math.max(w, 1) / Math.max(h, 1);
  const halfH = halfSize;
  const halfW = halfH * aspect;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 500);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  return camera;
}

function updateOrthoZoom(camera: THREE.OrthographicCamera, aspect: number, halfSize: number) {
  const halfH = halfSize;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

function computeBodyPosition(templateId: string, jd: number): [number, number, number] | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital || templateId === 'sun') return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return [sv.position[0] * SCALE, sv.position[2] * SCALE, -sv.position[1] * SCALE];
}

function createOrbitLine(
  templateId: string,
  color: number,
): THREE.Line {
  const data = REAL_DATA[templateId];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ORBIT_LINE_POINTS; i++) {
    const nu = (i / ORBIT_LINE_POINTS) * Math.PI * 2;
    const sv = stateVectors(
      data.semiMajorAxis!, data.orbital!.eccentricity, data.orbital!.inclination,
      data.orbital!.longitudeAscendingNode, data.orbital!.argumentOfPeriapsis,
      nu, MU_SUN,
    );
    points.push(new THREE.Vector3(
      sv.position[0] * SCALE,
      sv.position[2] * SCALE,
      -sv.position[1] * SCALE,
    ));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, linewidth: 1 });
  return new THREE.Line(geom, mat);
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const zoomRef = useRef<number>(INITIAL_FRUSTUM);
  const bodyRefsRef = useRef<{ id: string; name: string; mesh: THREE.Mesh }[]>([]);
  const [offScreenEntries, setOffScreenEntries] = useState<OffScreenEntry[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const updateOffScreen = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const entries = computeOffScreenBodies(camera, bodyRefsRef.current, 0.05);
    setOffScreenEntries(prev => {
      if (prev.length !== entries.length) return entries;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].id !== prev[i]?.id) return entries;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    setContainerSize({ w, h });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    const camera = makeOrthoCamera(w, h, INITIAL_FRUSTUM);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x444466, 1.0);
    scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffeedd, 2, 0, 0);
    scene.add(sunLight);

    const bodyMeshes = new Map<string, THREE.Mesh>();
    const allIds = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const loader = new THREE.TextureLoader();

    const orbitColors: Record<string, number> = {
      mercury: 0x888888, venus: 0xccaa88, earth: 0x4488ff, mars: 0xcc6644,
      jupiter: 0xd4b896, saturn: 0xe8d5a3, uranus: 0x88ccdd, neptune: 0x4466ff,
    };

    for (const id of allIds) {
      const data = REAL_DATA[id];
      if (!data) continue;

      const r = DISPLAY_RADII[id] || 0.25;
      const geom = new THREE.SphereGeometry(r, 48, 48);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
      if (id === 'sun') {
        mat.color = new THREE.Color(0xffcc00);
        mat.emissive = new THREE.Color(0xff8800);
        mat.emissiveIntensity = 0.5;
      } else {
        mat.color = new THREE.Color(0xcccccc);
      }
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      bodyMeshes.set(id, mesh);
      bodyRefsRef.current.push({ id, name: data.name, mesh });

      const texPath = `/textures/${id}.jpg`;
      loader.load(texPath, (tex) => { mat.map = tex; mat.color = new THREE.Color(0xffffff); mat.needsUpdate = true; }, undefined, () => {});

      if (data.semiMajorAxis && data.orbital && id !== 'sun') {
        const orbitLine = createOrbitLine(id, orbitColors[id] || 0x556688);
        scene.add(orbitLine);
      }
    }

    // --- Mouse interaction ---
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.005);
      camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -dy * 0.005);
      camera.lookAt(0, 0, 0);
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const dx = Math.abs(e.clientX - prevMouse.x);
      const dy = Math.abs(e.clientY - prevMouse.y);
      if (dx < 3 && dy < 3) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const meshes = Array.from(bodyMeshes.values());
        const intersects = raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
          const obj = intersects[0].object;
          for (const [id, m] of bodyMeshes) {
            if (m === obj) { useExploreStore.getState().setSelectedBodyId(id); break; }
          }
        } else {
          useExploreStore.getState().setSelectedBodyId(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const newHalf = Math.max(0.5, Math.min(120, zoomRef.current * factor));
      zoomRef.current = newHalf;
      const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
      updateOrthoZoom(camera, aspect, newHalf);
    };

    // --- Touch & Trackpad support ---
    let touches0: { x: number; y: number } | null = null;
    let touches1: { x: number; y: number } | null = null;
    let touchDist0 = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touches0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touches1 = null;
      } else if (e.touches.length >= 2) {
        touches0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touches1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        touchDist0 = Math.hypot(touches1.x - touches0.x, touches1.y - touches0.y);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && touches0 && !touches1) {
        const dx = e.touches[0].clientX - touches0.x;
        const dy = e.touches[0].clientY - touches0.y;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.005);
        camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), -dy * 0.005);
        camera.lookAt(0, 0, 0);
        touches0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length >= 2) {
        const t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const t1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const newDist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
        if (touchDist0 > 0) {
          const factor = newDist / touchDist0;
          const newHalf = Math.max(0.5, Math.min(120, zoomRef.current / factor));
          zoomRef.current = newHalf;
          const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
          updateOrthoZoom(camera, aspect, newHalf);
        }
        touches0 = t0;
        touches1 = t1;
        touchDist0 = newDist;
      }
    };

    const onTouchEnd = () => {
      touches0 = null;
      touches1 = null;
      touchDist0 = 0;
    };

    let gestureZoomStart = 0;
    const onGestureStart = (e: Event) => {
      gestureZoomStart = (e as any).scale || 1;
    };
    const onGestureChange = (e: Event) => {
      const scale = (e as any).scale || 1;
      const factor = scale / gestureZoomStart;
      const newHalf = Math.max(0.5, Math.min(120, zoomRef.current / factor));
      zoomRef.current = newHalf;
      const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
      updateOrthoZoom(camera, aspect, newHalf);
      gestureZoomStart = scale;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    renderer.domElement.addEventListener('gesturestart', onGestureStart);
    renderer.domElement.addEventListener('gesturechange', onGestureChange);

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      setContainerSize({ w: rw, h: rh });
      const aspect = rw / Math.max(rh, 1);
      updateOrthoZoom(camera, aspect, zoomRef.current);
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    let frameCount = 0;
    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      frameCount++;

      const store = useExploreStore.getState();
      if (store.isRunning && dt > 0) {
        store.setSimulatedTime(store.simulatedTime + dt * store.timeScale * 1000);
      }
      const jd = julianDate(useExploreStore.getState().simulatedTime);

      for (const id of allIds) {
        const mesh = bodyMeshes.get(id);
        if (!mesh) continue;
        if (id === 'sun') {
          mesh.position.set(0, 0, 0);
        } else {
          const pos = computeBodyPosition(id, jd);
          if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
        }
      }

      if (frameCount % 10 === 0) {
        updateOffScreen();
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      renderer.domElement.removeEventListener('gesturestart', onGestureStart);
      renderer.domElement.removeEventListener('gesturechange', onGestureChange);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [updateOffScreen]);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <OffScreenIndicator entries={offScreenEntries} containerWidth={containerSize.w} containerHeight={containerSize.h} />
    </div>
  );
}

export default ExploreCanvas;
