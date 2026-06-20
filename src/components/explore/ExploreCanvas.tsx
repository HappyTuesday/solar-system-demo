import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useExploreStore } from '../../stores/exploreStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';

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

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);

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

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

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
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />;
}

export default ExploreCanvas;
