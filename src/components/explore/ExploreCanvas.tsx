import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useExploreStore } from '../../stores/exploreStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { computeOffScreenBodies, type OffScreenEntry } from './OffScreenIndicator';
import OffScreenIndicator from './OffScreenIndicator';

const SCALE = 1 / 1.496e10;

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

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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
    scene.background = new THREE.Color(0x000005);

    const camera = new THREE.PerspectiveCamera(45, Math.max(w, 1) / Math.max(h, 1), 0.01, 100);
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x333355, 0.5);
    scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffeedd, 2, 0, 0);
    scene.add(sunLight);

    const bodyMeshes = new Map<string, THREE.Mesh>();
    const allIds = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const loader = new THREE.TextureLoader();

    for (const id of allIds) {
      const data = REAL_DATA[id];
      if (!data) continue;
      const size = Math.log10(data.radius / 2.4397e6 + 1) * 0.8;
      const geom = new THREE.SphereGeometry(size, 48, 48);
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

      if (data.semiMajorAxis && data.orbital) {
        const orbitR = data.semiMajorAxis * SCALE;
        const orbitGeom = new THREE.TorusGeometry(orbitR, 0.005, 8, 256);
        const orbitMat = new THREE.MeshBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.25 });
        const orbit = new THREE.Mesh(orbitGeom, orbitMat);
        orbit.rotation.x = Math.PI / 2;
        scene.add(orbit);
      }
    }

    const gridHelper = new THREE.PolarGridHelper(6, 64, 48, 256, 0x222244, 0x222244);
    scene.add(gridHelper);

    const starsGeom = new THREE.BufferGeometry();
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.03 });
    scene.add(new THREE.Points(starsGeom, starsMat));

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
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(0.5, Math.min(20, dist * factor))));
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
          const dir = camera.position.clone().normalize();
          const dist = camera.position.length();
          camera.position.copy(dir.multiplyScalar(Math.max(0.5, Math.min(20, dist / factor))));
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
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(0.5, Math.min(20, dist / factor))));
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
      camera.aspect = rw / Math.max(rh, 1);
      camera.updateProjectionMatrix();
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

      // Update off-screen indicators every 10 frames
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
