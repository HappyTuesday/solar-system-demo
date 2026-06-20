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
const CAM_RADIUS = 5;

const DISPLAY_RADII: Record<string, number> = {
  sun: 0.30, jupiter: 0.65, saturn: 0.55, uranus: 0.45,
  neptune: 0.4, earth: 0.18, venus: 0.18, mars: 0.15, mercury: 0.12,
};

function makeOrthoCamera(w: number, h: number, halfSize: number) {
  const aspect = Math.max(w, 1) / Math.max(h, 1);
  const halfH = halfSize;
  const halfW = halfH * aspect;
  return new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 500);
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

function updateCamera(
  camera: THREE.OrthographicCamera,
  center: THREE.Vector3,
  theta: number,
  phi: number,
) {
  const r = CAM_RADIUS;
  camera.position.set(
    center.x + r * Math.sin(phi) * Math.cos(theta),
    center.y + r * Math.cos(phi),
    center.z + r * Math.sin(phi) * Math.sin(theta),
  );
  camera.up.set(0, 0, 1);
  camera.lookAt(center);
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

function createOrbitLine(templateId: string, color: number): THREE.Line {
  const data = REAL_DATA[templateId];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ORBIT_LINE_POINTS; i++) {
    const nu = (i / ORBIT_LINE_POINTS) * Math.PI * 2;
    const sv = stateVectors(
      data.semiMajorAxis!, data.orbital!.eccentricity, data.orbital!.inclination,
      data.orbital!.longitudeAscendingNode, data.orbital!.argumentOfPeriapsis,
      nu, MU_SUN,
    );
    points.push(new THREE.Vector3(sv.position[0] * SCALE, sv.position[2] * SCALE, -sv.position[1] * SCALE));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, linewidth: 1 }));
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const thetaRef = useRef(0);
  const phiRef = useRef(0.001);
  const zoomRef = useRef(INITIAL_FRUSTUM);
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
    updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x444466, 1.0));
    scene.add(new THREE.PointLight(0xffeedd, 2, 0, 0));

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
        mat.emissive = new THREE.Color(0xff6600);
        mat.emissiveIntensity = 0.3;
      } else {
        mat.color = new THREE.Color(0xcccccc);
      }
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      bodyMeshes.set(id, mesh);
      bodyRefsRef.current.push({ id, name: data.name, mesh });

      loader.load(`/textures/${id}.jpg`,
        (tex) => {
          mat.map = tex;
          mat.color = new THREE.Color(0xffffff);
          mat.needsUpdate = true;
        },
        undefined, () => {});

      if (data.semiMajorAxis && data.orbital && id !== 'sun') {
        scene.add(createOrbitLine(id, orbitColors[id] || 0x556688));
      }
    }

    // --- Input ---
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();

    const onMD = (e: MouseEvent) => {
      if (e.button === 0) { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; }
    };
    const onMM = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      thetaRef.current -= dx * 0.005;
      phiRef.current = Math.max(0.001, Math.min(Math.PI - 0.001, phiRef.current + dy * 0.005));
      updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMU = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (Math.abs(e.clientX - prevMouse.x) < 3 && Math.abs(e.clientY - prevMouse.y) < 3) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const hits = raycaster.intersectObjects(Array.from(bodyMeshes.values()));
        if (hits.length > 0) {
          for (const [id, m] of bodyMeshes) {
            if (m === hits[0].object) { useExploreStore.getState().setSelectedBodyId(id); break; }
          }
        } else {
          useExploreStore.getState().setSelectedBodyId(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Pinch zoom on trackpad
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        zoomRef.current = Math.max(0.5, Math.min(120, zoomRef.current * factor));
      } else {
        // Two-finger pan on trackpad
        const cw = container.clientWidth || 1;
        const ch = container.clientHeight || 1;
        const halfH = zoomRef.current;
        const halfW = halfH * (cw / ch);
        const scaleX = (halfW * 2) / cw;
        const scaleY = (halfH * 2) / ch;
        const dir = camera.position.clone().sub(centerRef.current).normalize();
        const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
        const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
        // deltaX>0 = swipe right → pan right. deltaY>0 = swipe down → pan down.
        const worldDx = e.deltaX * scaleX;
        const worldDy = -e.deltaY * scaleY;
        centerRef.current.addScaledVector(right, worldDx);
        centerRef.current.addScaledVector(screenUp, worldDy);
        updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);
      }
      const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
      updateOrthoZoom(camera, aspect, zoomRef.current);
    };

    // Touch
    let touchMid0: { x: number; y: number } | null = null;
    let touchDist0 = 0;

    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchMid0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchDist0 = 0;
      } else if (e.touches.length >= 2) {
        const x0 = e.touches[0].clientX, y0 = e.touches[0].clientY;
        const x1 = e.touches[1].clientX, y1 = e.touches[1].clientY;
        touchMid0 = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
        touchDist0 = Math.hypot(x1 - x0, y1 - y0);
      }
    };
    const onTM = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchMid0 && touchDist0 === 0) {
        const dx = e.touches[0].clientX - touchMid0.x;
        const dy = e.touches[0].clientY - touchMid0.y;
        thetaRef.current -= dx * 0.005;
        phiRef.current = Math.max(0.001, Math.min(Math.PI - 0.001, phiRef.current + dy * 0.005));
        updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);
        touchMid0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length >= 2 && touchMid0) {
        const t0x = e.touches[0].clientX, t0y = e.touches[0].clientY;
        const t1x = e.touches[1].clientX, t1y = e.touches[1].clientY;
        const curMid = { x: (t0x + t1x) / 2, y: (t0y + t1y) / 2 };
        const curDist = Math.hypot(t1x - t0x, t1y - t0y);

        // Zoom
        if (touchDist0 > 0) {
          const factor = curDist / touchDist0;
          zoomRef.current = Math.max(0.5, Math.min(120, zoomRef.current / factor));
          const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
          updateOrthoZoom(camera, aspect, zoomRef.current);
        }

        // Pan (midpoint delta in screen space → world space)
        const dMidX = curMid.x - touchMid0.x;
        const dMidY = curMid.y - touchMid0.y;
        const cw = container.clientWidth || 1;
        const ch = container.clientHeight || 1;
        const halfH = zoomRef.current;
        const halfW = halfH * (cw / ch);
        const scaleX = (halfW * 2) / cw;
        const scaleY = (halfH * 2) / ch;

        const dir = camera.position.clone().sub(centerRef.current).normalize();
        const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
        const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();

        const worldDx = -dMidX * scaleX;
        const worldDy = -dMidY * scaleY;
        centerRef.current.addScaledVector(right, worldDx);
        centerRef.current.addScaledVector(screenUp, worldDy);
        updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);

        touchMid0 = curMid;
        touchDist0 = curDist;
      }
    };
    const onTE = () => { touchMid0 = null; touchDist0 = 0; };

    let gestureScale0 = 0;
    const onGS = (e: Event) => { gestureScale0 = (e as any).scale || 1; };
    const onGC = (e: Event) => {
      const s = (e as any).scale || 1;
      zoomRef.current = Math.max(0.5, Math.min(120, zoomRef.current / (s / gestureScale0)));
      const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
      updateOrthoZoom(camera, aspect, zoomRef.current);
      gestureScale0 = s;
    };

    renderer.domElement.addEventListener('mousedown', onMD);
    renderer.domElement.addEventListener('mousemove', onMM);
    renderer.domElement.addEventListener('mouseup', onMU);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', onTS, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTM, { passive: false });
    renderer.domElement.addEventListener('touchend', onTE);
    renderer.domElement.addEventListener('gesturestart', onGS);
    renderer.domElement.addEventListener('gesturechange', onGC);

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

      if (frameCount % 10 === 0) updateOffScreen();
      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      for (const ev of ['mousedown','mousemove','mouseup','wheel','touchstart','touchmove','touchend','gesturestart','gesturechange']) {
        const listeners = (renderer.domElement as any).__listeners;
        // just dispose and remove canvas
      }
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
