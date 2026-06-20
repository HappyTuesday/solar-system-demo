import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEarthMoonStore } from '../../stores/earthMoonStore';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA } from '../../engine/constants';
import { getMoonPhase, getEclipseType, predictEclipses } from '../../engine/eclipse';
import SunDirectionIndicator from './SunDirectionIndicator';

const MU_SUN = 1.32712440018e20;
const MU_EARTH = 3.986004418e14;
const MOON_SEMI_MAJOR = 384400000;
const MOON_ECC = 0.0549;
const MOON_INC = 0.0898;
const MOON_LAN = 2.183;
const MOON_AOP = 5.552;
const MOON_EPOCH_JD = 2451545.0;
const SCALE = 1 / 40000000;

function EarthMoonCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    earth: THREE.Mesh;
    moon: THREE.Mesh;
    dirLight: THREE.DirectionalLight;
  } | null>(null);
  const sunDirRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0, 0));

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.001, 500);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x111133, 0.3);
    scene.add(ambientLight);

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
    const earthMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
    loader.load('/textures/earth.jpg', (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; });
    const earth = new THREE.Mesh(earthGeom, earthMat);
    earth.receiveShadow = true;
    earth.rotation.z = 0.408;
    scene.add(earth);

    const moonGeom = new THREE.SphereGeometry(0.55, 48, 48);
    const moonMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    loader.load('/textures/moon.jpg', (tex) => { moonMat.map = tex; moonMat.needsUpdate = true; });
    const moon = new THREE.Mesh(moonGeom, moonMat);
    moon.castShadow = true;
    moon.receiveShadow = true;
    scene.add(moon);

    const moonOrbitGeom = new THREE.TorusGeometry(MOON_SEMI_MAJOR * SCALE, 0.08, 16, 256);
    const moonOrbitMat = new THREE.MeshBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.3 });
    const moonOrbit = new THREE.Mesh(moonOrbitGeom, moonOrbitMat);
    scene.add(moonOrbit);

    const starsGeom = new THREE.BufferGeometry();
    const starCount = 1500;
    const starsPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 60 + Math.random() * 40;
      starsPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starsPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starsPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    scene.add(new THREE.Points(starsGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })));

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
        const intersects = raycaster.intersectObjects([earth, moon]);
        if (intersects.length > 0) {
          const obj = intersects[0].object;
          useEarthMoonStore.getState().setSelectedBodyId(obj === earth ? 'earth' : 'moon');
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      const dir = camera.position.clone().normalize();
      const dist = camera.position.length();
      camera.position.copy(dir.multiplyScalar(Math.max(1, Math.min(60, dist * factor))));
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
      moon.position.set(moonSV.position[0] * SCALE, moonSV.position[2] * SCALE, -moonSV.position[1] * SCALE);

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

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    sceneRef.current = { scene, camera, renderer, earth, moon, dirLight };

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

  useEffect(() => {
    const jd = julianDate(Date.now());
    const eclipses = predictEclipses(jd, 10);
    useEarthMoonStore.getState().setEclipseDates(eclipses);
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {sceneRef.current && (
        <SunDirectionIndicator scene={sceneRef.current.scene} sunDirection={sunDirRef.current} />
      )}
    </div>
  );
}

export default EarthMoonCanvas;
