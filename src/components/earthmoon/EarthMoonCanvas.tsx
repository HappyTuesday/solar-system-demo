import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useEarthMoonStore } from '../../stores/earthMoonStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA } from '../../engine/constants';
import { getMoonPhase, getEclipseType, predictEclipses } from '../../engine/eclipse';
import { computeOffScreenBodies, type OffScreenEntry } from '../explore/OffScreenIndicator';
import OffScreenIndicator from '../explore/OffScreenIndicator';

const MU_SUN = 1.32712440018e20;
const MU_EARTH = 3.986004418e14;
const MOON_SEMI_MAJOR = 384400000;
const MOON_ECC = 0.0549;
const MOON_INC = 0.0898;
const MOON_LAN = 2.183;
const MOON_AOP = 5.552;
const MOON_EPOCH_JD = 2451545.0;
const SCALE_EM = 1 / 40000000;
const INITIAL_FRUSTUM = 14;
const CAM_RADIUS = 5;

function makeOrthoCamera(w: number, h: number, halfSize: number) {
  const aspect = Math.max(w, 1) / Math.max(h, 1);
  const halfH = halfSize;
  const halfW = halfH * aspect;
  return new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.001, 500);
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

function updateCamera(camera: THREE.OrthographicCamera, center: THREE.Vector3, theta: number, phi: number) {
  const r = CAM_RADIUS;
  camera.position.set(
    center.x + r * Math.sin(phi) * Math.cos(theta),
    center.y + r * Math.cos(phi),
    center.z + r * Math.sin(phi) * Math.sin(theta),
  );
  camera.up.set(0, 0, 1);
  camera.lookAt(center);
}

function projectSunToScreen(camera: THREE.OrthographicCamera, sunWorldDir: THREE.Vector3) {
  const pos = sunWorldDir.clone().normalize().multiplyScalar(80);
  const sp = pos.clone().project(camera);
  const sx = (sp.x * 0.5 + 0.5);
  const sy = (-sp.y * 0.5 + 0.5);
  const dx = sx - 0.5, dy = sy - 0.5;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx > ady) return { x: dx > 0 ? 0.98 : 0.02, y: 0.5 + dy * (0.48 / adx), isBehind: false };
  return { x: 0.5 + dx * (0.48 / ady), y: dy > 0 ? 0.98 : 0.02, isBehind: false };
}

function EarthMoonCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const thetaRef = useRef(0);
  const phiRef = useRef(0.001);
  const zoomRef = useRef(INITIAL_FRUSTUM);
  const bodyRefsRef = useRef<{ id: string; name: string; mesh: THREE.Mesh }[]>([]);
  const sunDirRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0, 0));
  const sceneRef = useRef<{ scene: THREE.Scene; earth: THREE.Mesh; moon: THREE.Mesh; dirLight: THREE.DirectionalLight } | null>(null);
  const [offScreenEntries, setOffScreenEntries] = useState<OffScreenEntry[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [sunScreen, setSunScreen] = useState({ x: 0.5, y: 0.02 });

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
    scene.background = new THREE.Color(0x000008);

    const camera = makeOrthoCamera(w, h, INITIAL_FRUSTUM);
    updateCamera(camera, centerRef.current, thetaRef.current, phiRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x334466, 0.9));

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 2.5);
    dirLight.position.set(100, 0, 0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    const loader = new THREE.TextureLoader();

    const earthGeom = new THREE.SphereGeometry(2, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1, color: 0x4488ff });
    loader.load('/textures/earth.jpg', (tex) => { earthMat.map = tex; earthMat.color = new THREE.Color(0xffffff); earthMat.needsUpdate = true; });
    const earth = new THREE.Mesh(earthGeom, earthMat);
    earth.receiveShadow = true;
    earth.rotation.z = 0.408;
    scene.add(earth);
    bodyRefsRef.current.push({ id: 'earth', name: '地球', mesh: earth });

    const moonGeom = new THREE.SphereGeometry(0.55, 48, 48);
    const moonMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, color: 0xcccccc });
    loader.load('/textures/moon.jpg', (tex) => { moonMat.map = tex; moonMat.color = new THREE.Color(0xffffff); moonMat.needsUpdate = true; });
    const moon = new THREE.Mesh(moonGeom, moonMat);
    moon.castShadow = true;
    moon.receiveShadow = true;
    scene.add(moon);
    bodyRefsRef.current.push({ id: 'moon', name: '月球', mesh: moon });

    const moonOrbitGeom = new THREE.TorusGeometry(MOON_SEMI_MAJOR * SCALE_EM, 0.03, 8, 512);
    const moonOrbitMat = new THREE.MeshBasicMaterial({ color: 0x556688, transparent: true, opacity: 0.6 });
    const moonOrbit = new THREE.Mesh(moonOrbitGeom, moonOrbitMat);
    const qToXZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const qInc = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), MOON_INC);
    const qLAN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), MOON_LAN);
    const orbitQ = new THREE.Quaternion();
    orbitQ.multiplyQuaternions(qLAN, qInc);
    orbitQ.multiply(qToXZ);
    moonOrbit.setRotationFromQuaternion(orbitQ);
    scene.add(moonOrbit);

    const starsGeom = new THREE.BufferGeometry();
    const starCount = 1500;
    const starsPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 60 + Math.random() * 40;
      starsPos[i * 3] = r * Math.sin(b) * Math.cos(a);
      starsPos[i * 3 + 1] = r * Math.sin(b) * Math.sin(a);
      starsPos[i * 3 + 2] = r * Math.cos(b);
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    scene.add(new THREE.Points(starsGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })));

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
        const hits = raycaster.intersectObjects([earth, moon]);
        if (hits.length > 0) {
          useEarthMoonStore.getState().setSelectedBodyId(hits[0].object === earth ? 'earth' : 'moon');
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        zoomRef.current = Math.max(1, Math.min(60, zoomRef.current * factor));
      } else {
        const cw = container.clientWidth || 1;
        const ch = container.clientHeight || 1;
        const halfH = zoomRef.current;
        const halfW = halfH * (cw / ch);
        const scaleX = (halfW * 2) / cw;
        const scaleY = (halfH * 2) / ch;
        const dir = camera.position.clone().sub(centerRef.current).normalize();
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();
        const worldDx = e.deltaX * scaleX;
        const worldDy = -e.deltaY * scaleY;
        centerRef.current.addScaledVector(right, worldDx);
        centerRef.current.addScaledVector(up, worldDy);
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

        if (touchDist0 > 0) {
          const factor = curDist / touchDist0;
          zoomRef.current = Math.max(1, Math.min(60, zoomRef.current / factor));
          const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
          updateOrthoZoom(camera, aspect, zoomRef.current);
        }

        const dMidX = curMid.x - touchMid0.x;
        const dMidY = curMid.y - touchMid0.y;
        const cw = container.clientWidth || 1;
        const ch = container.clientHeight || 1;
        const halfH = zoomRef.current;
        const halfW = halfH * (cw / ch);
        const scaleX = (halfW * 2) / cw;
        const scaleY = (halfH * 2) / ch;

        const dir = camera.position.clone().sub(centerRef.current).normalize();
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();

        centerRef.current.addScaledVector(right, -dMidX * scaleX);
        centerRef.current.addScaledVector(up, -dMidY * scaleY);
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
      zoomRef.current = Math.max(1, Math.min(60, zoomRef.current / (s / gestureScale0)));
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

      const store = useEarthMoonStore.getState();
      if (store.isRunning && dt > 0) {
        store.setSimulatedTime(store.simulatedTime + dt * store.timeScale * 1000);
      }
      const simTime = useEarthMoonStore.getState().simulatedTime;
      const jd = julianDate(simTime);

      const earthData = REAL_DATA.earth;
      let sunFromEarth: [number, number, number] = [1, 0, 0];
      if (earthData.orbital && earthData.semiMajorAxis) {
        const period = orbitalPeriod(earthData.semiMajorAxis, MU_SUN);
        const M = meanAnomalyAtTime(earthData.orbital.meanAnomalyAtEpoch, period, earthData.orbital.epoch, jd);
        const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const E = solveKepler(Mmod, earthData.orbital.eccentricity);
        const nu = trueAnomaly(E, earthData.orbital.eccentricity);
        const sv = stateVectors(earthData.semiMajorAxis, earthData.orbital.eccentricity, earthData.orbital.inclination, earthData.orbital.longitudeAscendingNode, earthData.orbital.argumentOfPeriapsis, nu, MU_SUN);
        sunFromEarth = [-sv.position[0], -sv.position[1], -sv.position[2]];
        const sunDir = new THREE.Vector3(-sv.position[0], sv.position[2], -sv.position[1]).normalize();
        sunDirRef.current = sunDir.clone();
        dirLight.position.copy(sunDir.clone().multiplyScalar(120));
        dirLight.lookAt(0, 0, 0);
      }

      const moonPeriod = orbitalPeriod(MOON_SEMI_MAJOR, MU_EARTH);
      const moonM = meanAnomalyAtTime(0.529, moonPeriod, MOON_EPOCH_JD, jd);
      const moonMmod = ((moonM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const moonEVal = solveKepler(moonMmod, MOON_ECC);
      const moonNu = trueAnomaly(moonEVal, MOON_ECC);
      const moonSV = stateVectors(MOON_SEMI_MAJOR, MOON_ECC, MOON_INC, MOON_LAN, MOON_AOP, moonNu, MU_EARTH);
      moon.position.set(moonSV.position[0] * SCALE_EM, moonSV.position[2] * SCALE_EM, -moonSV.position[1] * SCALE_EM);

      const earthToMoon: [number, number, number] = [moonSV.position[0], moonSV.position[1], moonSV.position[2]];
      const phase = getMoonPhase(sunFromEarth, earthToMoon);
      const moonDist = Math.sqrt(earthToMoon[0] ** 2 + earthToMoon[1] ** 2 + earthToMoon[2] ** 2);
      const eclipse = getEclipseType(sunFromEarth, earthToMoon, moonDist);

      useEarthMoonStore.getState().setMoonPhase(phase);
      useEarthMoonStore.getState().setEclipseType(eclipse);

      if (eclipse === 'total') {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x330000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
      } else if (eclipse === 'partial') {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x1a0000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
      } else {
        (moon.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x000000);
        (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }

      if (frameCount % 10 === 0) {
        setSunScreen(projectSunToScreen(camera, sunDirRef.current));
        updateOffScreen();
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    sceneRef.current = { scene, earth, moon, dirLight };

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [updateOffScreen]);

  useEffect(() => {
    useEarthMoonStore.getState().setEclipseDates(predictEclipses(julianDate(Date.now()), 10));
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <OffScreenIndicator entries={offScreenEntries} containerWidth={containerSize.w} containerHeight={containerSize.h} />
      <div style={{
        position: 'absolute', left: sunScreen.x * containerSize.w - containerSize.w * 0.12,
        top: sunScreen.y * containerSize.h - containerSize.h * 0.12,
        width: containerSize.w * 0.24, height: containerSize.h * 0.24,
        background: 'radial-gradient(circle, rgba(255,248,220,0.6) 0%, rgba(255,220,100,0.25) 30%, rgba(255,180,50,0.05) 60%, transparent 100%)',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 5, filter: 'blur(2px)',
      }} />
    </div>
  );
}

export default EarthMoonCanvas;
