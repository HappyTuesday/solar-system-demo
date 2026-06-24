import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import { rk4StepSpaceship, applyThrustInBodyFrame, checkSpaceshipCollision, type BodyInfo } from '../../engine/spaceship';
import type { SpaceshipState } from '../../types';
import TimePanel from './TimePanel';

const SCALE = 1 / 1.496e11;
const ORBIT_LINE_POINTS = 256;
const AU_TO_KM = 1.496e8;

const REAR_MIRROR_FOV = 65;
const SIDE_MIRROR_FOV = 55;
const CAMERA_NEAR = 1e-7;
const CAMERA_FAR = 500;
const ROTATION_RATE = Math.PI / 3;

const EXPLOSION_DURATION = 3.0;
const EXPLOSION_PARTICLE_COUNT = 300;
const EXPLOSION_SPREAD_SPEED = 0.002;
const EXPLOSION_FLASH_INTENSITY = 25;
const EXPLOSION_FLASH_DURATION = 0.8;
const SHAKE_MAX_DURATION = 2.0;
const SHAKE_INITIAL_AMPLITUDE = 0.003;

function computeBodyPosition(templateId: string, jd: number): [number, number, number] | null {
  const state = computeBodyState(templateId, jd);
  return state ? state.position : null;
}

function computeBodyState(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital || templateId === 'sun') return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    position: [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE],
    velocity: [sv.velocity[0] * SCALE, sv.velocity[1] * SCALE, sv.velocity[2] * SCALE],
  };
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
    points.push(new THREE.Vector3(sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
}

function rotateDirLeft(dir: [number, number, number]): [number, number, number] {
  return [-dir[1], dir[0], dir[2]];
}

function rotateDirRight(dir: [number, number, number]): [number, number, number] {
  return [dir[1], -dir[0], dir[2]];
}

function clampMirrorSize(size: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, size));
}

function createStarfield(scene: THREE.Scene, disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] }): THREE.Points {
  const starCount = 3000;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  const innerR = 180;
  const outerR = 320;

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = innerR + Math.random() * (outerR - innerR);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const brightness = 0.4 + Math.random() * 0.6;
    colors[i * 3] = brightness;
    colors[i * 3 + 1] = brightness * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 2] = brightness * (0.7 + Math.random() * 0.3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  disposables.geometries.push(geom);

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.3, 'rgba(200,220,255,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,50,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const starTex = new THREE.CanvasTexture(canvas);
  disposables.textures.push(starTex);

  const mat = new THREE.PointsMaterial({
    size: 0.6,
    map: starTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
  });
  disposables.materials.push(mat);

  const stars = new THREE.Points(geom, mat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);
  return stars;
}

function createExplosionParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,200,1)');
  gradient.addColorStop(0.1, 'rgba(255,200,80,0.95)');
  gradient.addColorStop(0.3, 'rgba(255,120,30,0.8)');
  gradient.addColorStop(0.5, 'rgba(220,60,10,0.5)');
  gradient.addColorStop(0.7, 'rgba(150,20,0,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rearFrameRef = useRef<HTMLDivElement>(null);
  const leftFrameRef = useRef<HTMLDivElement>(null);
  const rightFrameRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rearCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const leftCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rightCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rearRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const leftRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rightRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const bodyMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const allIdsRef = useRef<string[]>(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const smoothDirRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const wasExplodedRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const [hoveredMirror, setHoveredMirror] = useState<'rear' | 'left' | 'right' | null>(null);
  const [pinnedMirrors, setPinnedMirrors] = useState<Set<string>>(new Set());
  const disposablesRef = useRef<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[]; lines: THREE.Line[] }>({
    geometries: [], materials: [], textures: [], lines: [],
  });

  const explosionRef = useRef<{
    particles: THREE.Points | null;
    flashLight: THREE.PointLight | null;
    startTime: number;
    basePosition: THREE.Vector3;
  }>({ particles: null, flashLight: null, startTime: 0, basePosition: new THREE.Vector3() });

  const audioCtxRef = useRef<AudioContext | null>(null);

  function playExplosionSound() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        const env = Math.exp(-t * 5);
        data[i] = (Math.random() * 2 - 1) * env * 0.6;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.setValueAtTime(800, now);
      lowPass.frequency.exponentialRampToValueAtTime(80, now + 1.5);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 1.5);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      noise.connect(lowPass);
      lowPass.connect(gain);
      gain.connect(ctx.destination);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 2);
      osc.start(now);
      osc.stop(now + 1.5);
    } catch {
      // audio not available
    }
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rearFrame = rearFrameRef.current;
    const leftFrame = leftFrameRef.current;
    const rightFrame = rightFrameRef.current;
    if (!rearFrame || !leftFrame || !rightFrame) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dpr = Math.min(window.devicePixelRatio, 2);
    sizeRef.current = { w, h, dpr };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    const camera = new THREE.PerspectiveCamera(90, w / Math.max(h, 1), CAMERA_NEAR, CAMERA_FAR);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const rearCam = new THREE.PerspectiveCamera(REAR_MIRROR_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    rearCam.up.set(0, 0, 1);
    rearCamRef.current = rearCam;

    const leftCam = new THREE.PerspectiveCamera(SIDE_MIRROR_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    leftCam.up.set(0, 0, 1);
    leftCamRef.current = leftCam;

    const rightCam = new THREE.PerspectiveCamera(SIDE_MIRROR_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    rightCam.up.set(0, 0, 1);
    rightCamRef.current = rightCam;

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    container.appendChild(renderer.domElement);

    function createMirrorRenderer(parent: HTMLDivElement): THREE.WebGLRenderer {
      const mr = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
      mr.setPixelRatio(dpr);
      mr.domElement.style.display = 'block';
      mr.domElement.style.width = '100%';
      mr.domElement.style.height = '100%';
      parent.appendChild(mr.domElement);
      return mr;
    }

    const rearRenderer = createMirrorRenderer(rearFrame);
    rearRendererRef.current = rearRenderer;
    const leftRenderer = createMirrorRenderer(leftFrame);
    leftRendererRef.current = leftRenderer;
    const rightRenderer = createMirrorRenderer(rightFrame);
    rightRendererRef.current = rightRenderer;

    function updateMirrorRendererSize(mr: THREE.WebGLRenderer, cssW: number, cssH: number) {
      mr.setSize(cssW, cssH, false);
    }

    const rearWCss_init = clampMirrorSize(Math.round(w * 0.28), 150, 380);
    const rearHCss_init = Math.round(h * 0.20);
    const sideWCss_init = clampMirrorSize(Math.round(w * 0.12), 70, 160);
    const sideHCss_init = Math.max(140, Math.round(h * 0.32));

    updateMirrorRendererSize(rearRenderer, rearWCss_init, rearHCss_init);
    updateMirrorRendererSize(leftRenderer, sideWCss_init, sideHCss_init);
    updateMirrorRendererSize(rightRenderer, sideWCss_init, sideHCss_init);

    scene.add(new THREE.AmbientLight(0x444466, 1.0));
    scene.add(new THREE.PointLight(0xffeedd, 2, 0, 0));

    const stars = createStarfield(scene, disposablesRef.current);

    const bodyMeshes = new Map<string, THREE.Mesh>();
    const allIds = allIdsRef.current;
    const loader = new THREE.TextureLoader();

    const orbitColors: Record<string, number> = {
      mercury: 0x888888, venus: 0xccaa88, earth: 0x4488ff, mars: 0xcc6644,
      jupiter: 0xd4b896, saturn: 0xe8d5a3, uranus: 0x88ccdd, neptune: 0x4466ff,
    };

    for (const id of allIds) {
      const data = REAL_DATA[id];
      if (!data) continue;
      const r = data.radius * SCALE;
      const geom = new THREE.SphereGeometry(r, 48, 48);
      disposablesRef.current.geometries.push(geom);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
      disposablesRef.current.materials.push(mat);
      if (id === 'sun') {
        mat.color = new THREE.Color(0xffcc00);
        mat.emissive = new THREE.Color(0xff6600);
        mat.emissiveIntensity = 0.3;
      } else {
        mat.color = new THREE.Color(0xcccccc);
      }
      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      bodyMeshes.set(id, mesh);

      loader.load(`/textures/${id}.jpg`,
        (tex) => {
          mat.map = tex;
          mat.color = new THREE.Color(0xffffff);
          mat.needsUpdate = true;
          disposablesRef.current.textures.push(tex);
        },
        undefined, () => {});

      if (data.semiMajorAxis && data.orbital && id !== 'sun') {
        const line = createOrbitLine(id, orbitColors[id] || 0x556688);
        line.frustumCulled = false;
        scene.add(line);
        disposablesRef.current.lines.push(line);
        disposablesRef.current.geometries.push(line.geometry);
        disposablesRef.current.materials.push(line.material as THREE.Material);
      }
    }
    bodyMeshesRef.current = bodyMeshes;

    let lastTime = performance.now();
    let simulatedTime = useSpaceshipStore.getState().simulatedTime;

    const animLookTarget = new THREE.Vector3();

    const animate = (time: number) => {
      const store = useSpaceshipStore.getState();

      if (!store.exploded && wasExplodedRef.current) {
        simulatedTime = store.simulatedTime;
        smoothDirRef.current.set(store.direction[0], store.direction[1], store.direction[2]);
        lastTime = time;
        wasExplodedRef.current = false;
      }

      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (store.isRunning && dt > 0 && !store.exploded) {
        const clampedDt = Math.min(dt, 0.1);

        const worldThrust = applyThrustInBodyFrame(
          store.thrust[0],
          store.thrust[1],
          store.thrust[2],
          store.thrustMagnitude,
          store.direction,
        );

        const shipState: SpaceshipState = {
          position: store.position,
          velocity: store.velocity,
          direction: store.direction,
          thrust: worldThrust,
          thrustMagnitude: store.thrustMagnitude,
          exploded: store.exploded,
        };

        const timeScale = useExploreStore.getState().timeScale;
        const simDelta = clampedDt * timeScale;
        const steps = Math.min(Math.max(1, Math.floor(simDelta / 0.016)), 200);
        const subDt = simDelta / steps;

        for (let s = 0; s < steps; s++) {
          const subSimTime = simulatedTime + s * subDt * 1000;
          const subJd = julianDate(subSimTime);

          const bodyStates: { pos: [number, number, number]; vel: [number, number, number]; mass: number; radius: number }[] = [];
          for (const id of allIds) {
            const data = REAL_DATA[id];
            if (id === 'sun') {
              bodyStates.push({ pos: [0, 0, 0], vel: [0, 0, 0], mass: data.mass, radius: data.radius * SCALE });
            } else {
              const state = computeBodyState(id, subJd);
              if (state) {
                bodyStates.push({ pos: state.position, vel: state.velocity, mass: data.mass, radius: data.radius * SCALE });
              }
            }
          }

          const getBodies = (tOffset: number): BodyInfo[] => {
            return bodyStates.map((b, bi) => ({
              id: allIds[bi] ?? '',
              position: [
                b.pos[0] + b.vel[0] * tOffset,
                b.pos[1] + b.vel[1] * tOffset,
                b.pos[2] + b.vel[2] * tOffset,
              ],
              mass: b.mass,
              radius: b.radius,
            }));
          };

          rk4StepSpaceship(shipState, getBodies, subDt);
        }

        const speedKms = Math.sqrt(
          shipState.velocity[0] ** 2 + shipState.velocity[1] ** 2 + shipState.velocity[2] ** 2,
        ) * AU_TO_KM;
        const travelKm = speedKms * simDelta;
        store.updateFlightStats(travelKm, speedKms);

        simulatedTime += simDelta * 1000;
        store.setSimulatedTime(simulatedTime);

        const finalJd = julianDate(simulatedTime);
        for (const id of allIds) {
          if (id === 'sun') continue;
          const mesh = bodyMeshes.get(id);
          if (!mesh) continue;
          const pos = computeBodyPosition(id, finalJd);
          if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
        }

        const bodyInfos: BodyInfo[] = [];
        for (const id of allIds) {
          const mesh = bodyMeshes.get(id);
          const data = REAL_DATA[id];
          if (!mesh || !data) continue;
          bodyInfos.push({
            id,
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            mass: data.mass,
            radius: data.radius * SCALE,
          });
        }

        const hitBodyId = checkSpaceshipCollision(shipState, bodyInfos);
        if (hitBodyId) {
          wasExplodedRef.current = true;
          playExplosionSound();
          const hitBody = bodyInfos.find(b => b.id === hitBodyId);
          store.setExploded(
            hitBodyId,
            [shipState.position[0], shipState.position[1], shipState.position[2]],
            hitBody ? hitBody.position : [0, 0, 0],
          );

          const expPos = new THREE.Vector3(
            shipState.position[0], shipState.position[1], shipState.position[2],
          );

          const particleTex = createExplosionParticleTexture();
          disposablesRef.current.textures.push(particleTex);

          const particleCount = EXPLOSION_PARTICLE_COUNT;
          const posArr = new Float32Array(particleCount * 3);
          const colorArr = new Float32Array(particleCount * 3);
          const velData = new Float32Array(particleCount * 3);
          const lifeData = new Float32Array(particleCount);

          for (let i = 0; i < particleCount; i++) {
            posArr[i * 3] = 0;
            posArr[i * 3 + 1] = 0;
            posArr[i * 3 + 2] = 0;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = EXPLOSION_SPREAD_SPEED * (0.3 + Math.random() * 1.0);
            velData[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
            velData[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            velData[i * 3 + 2] = Math.cos(phi) * speed;

            lifeData[i] = 1.5 + Math.random() * 1.5;

            const t = Math.random();
            if (t < 0.3) {
              colorArr[i * 3] = 1.0; colorArr[i * 3 + 1] = 0.9; colorArr[i * 3 + 2] = 0.3;
            } else if (t < 0.6) {
              colorArr[i * 3] = 1.0; colorArr[i * 3 + 1] = 0.4; colorArr[i * 3 + 2] = 0.1;
            } else {
              colorArr[i * 3] = 0.9; colorArr[i * 3 + 1] = 0.7; colorArr[i * 3 + 2] = 0.2;
            }
          }

          const pGeom = new THREE.BufferGeometry();
          pGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
          pGeom.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
          disposablesRef.current.geometries.push(pGeom);

          const pMat = new THREE.PointsMaterial({
            size: 0.003,
            map: particleTex,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 1.0,
          });
          disposablesRef.current.materials.push(pMat);

          const particles = new THREE.Points(pGeom, pMat);
          particles.frustumCulled = false;
          particles.renderOrder = 999;
          particles.position.copy(expPos);

          const flashLight = new THREE.PointLight(0xff6622, EXPLOSION_FLASH_INTENSITY, 0, 0);
          flashLight.position.copy(expPos);
          scene.add(flashLight);

          scene.add(particles);

          explosionRef.current = {
            particles,
            flashLight,
            startTime: time,
            basePosition: expPos.clone(),
          };

          (particles as unknown as Record<string, unknown>).__velData = velData;
          (particles as unknown as Record<string, unknown>).__lifeData = lifeData;

          store.setSimulatedTime(simulatedTime);
        } else {
          store.updatePhysics(
            [shipState.position[0], shipState.position[1], shipState.position[2]],
            [shipState.velocity[0], shipState.velocity[1], shipState.velocity[2]],
          );

          if (store.attitudeMode !== 'inertial') {
            const spPos = shipState.position;
            const spVel = shipState.velocity;
            let nearestDist = Infinity;
            let nearestPos: [number, number, number] = [0, 0, 0];
            let nearestVel: [number, number, number] = [0, 0, 0];

            for (const id of allIds) {
              if (!REAL_DATA[id]) continue;
              if (id === 'sun') {
                const dx = spPos[0], dy = spPos[1], dz = spPos[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < nearestDist) { nearestDist = dist; nearestPos = [0, 0, 0]; nearestVel = [0, 0, 0]; }
              } else {
                const bs = computeBodyState(id, finalJd);
                if (!bs) continue;
                const dx = bs.position[0] - spPos[0], dy = bs.position[1] - spPos[1], dz = bs.position[2] - spPos[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < nearestDist) { nearestDist = dist; nearestPos = bs.position; nearestVel = bs.velocity; }
              }
            }

            if (store.attitudeMode === 'prograde') {
              const rvx = spVel[0] - nearestVel[0];
              const rvy = spVel[1] - nearestVel[1];
              const rvz = spVel[2] - nearestVel[2];
              const rv = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
              if (rv > 1e-15) {
                store.setDirection([rvx / rv, rvy / rv, rvz / rv]);
              }
            } else if (store.attitudeMode === 'nadir') {
              const dx = nearestPos[0] - spPos[0];
              const dy = nearestPos[1] - spPos[1];
              const dz = nearestPos[2] - spPos[2];
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist > 1e-15) {
                store.setDirection([dx / dist, dy / dist, dz / dist]);
              }
            } else if (store.attitudeMode === 'target' && store.targetBodyId) {
              let targetPos: [number, number, number] | null = null;
              if (store.targetBodyId === 'sun') {
                targetPos = [0, 0, 0];
              } else {
                const bs = computeBodyState(store.targetBodyId, finalJd);
                if (bs) targetPos = bs.position;
              }
              if (targetPos) {
                const dx = targetPos[0] - spPos[0];
                const dy = targetPos[1] - spPos[1];
                const dz = targetPos[2] - spPos[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > 1e-15) {
                  store.setDirection([dx / dist, dy / dist, dz / dist]);
                }
              }
            }
          }
        }
      }

      const expRef = explosionRef.current;
      if (expRef.particles && expRef.flashLight) {
        if (useSpaceshipStore.getState().explosionPhase !== 'exploding') {
          scene.remove(expRef.particles);
          expRef.particles.geometry.dispose();
          (expRef.particles.material as THREE.Material).dispose();
          scene.remove(expRef.flashLight);
          expRef.particles = null;
          expRef.flashLight = null;
        } else {
          const elapsed = (time - expRef.startTime) / 1000;
          const progress = Math.min(elapsed / EXPLOSION_DURATION, 1.0);

          const velData = ((expRef.particles as unknown as Record<string, unknown>).__velData) as Float32Array;
          const lifeData = ((expRef.particles as unknown as Record<string, unknown>).__lifeData) as Float32Array;
          const posAttr = expRef.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
          const posArr = posAttr.array as Float32Array;

          if (velData && lifeData && posArr) {
            for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
              const age = elapsed;
              if (age >= lifeData[i]) {
                posArr[i * 3] = 0;
                posArr[i * 3 + 1] = 0;
                posArr[i * 3 + 2] = 0;
              } else {
                posArr[i * 3] = velData[i * 3] * age;
                posArr[i * 3 + 1] = velData[i * 3 + 1] * age;
                posArr[i * 3 + 2] = velData[i * 3 + 2] * age;
              }
            }
            posAttr.needsUpdate = true;
          }

          const lifeFactor = 1.0 - progress;
          (expRef.particles.material as THREE.PointsMaterial).opacity = Math.max(0, lifeFactor);

          const flashElapsed = (time - expRef.startTime) / 1000;
          const flashProgress = Math.min(flashElapsed / EXPLOSION_FLASH_DURATION, 1.0);
          expRef.flashLight.intensity = EXPLOSION_FLASH_INTENSITY * (1.0 - flashProgress);

          if (progress >= 1.0) {
            scene.remove(expRef.particles);
            expRef.particles.geometry.dispose();
            (expRef.particles.material as THREE.Material).dispose();
            scene.remove(expRef.flashLight);
            expRef.particles = null;
            expRef.flashLight = null;
            useSpaceshipStore.getState().setExplosionPhase('complete');
          }
        }
      }

      const keys = keysRef.current;
      if (keys.size > 0) {
        const rotAngle = ROTATION_RATE * Math.min(dt, 0.1);
        const spStore = useSpaceshipStore.getState();
        if (keys.has('q')) spStore.yaw(rotAngle);
        if (keys.has('e')) spStore.yaw(-rotAngle);
        if (keys.has('r')) spStore.pitch(rotAngle);
        if (keys.has('f')) spStore.pitch(-rotAngle);
      }

      const sp = useSpaceshipStore.getState();
      const pos = new THREE.Vector3(sp.position[0], sp.position[1], sp.position[2]);
      const leftArr = rotateDirLeft(sp.direction);
      const rightArr = rotateDirRight(sp.direction);
      const leftDir = new THREE.Vector3(leftArr[0], leftArr[1], leftArr[2]);
      const rightDir = new THREE.Vector3(rightArr[0], rightArr[1], rightArr[2]);

      let shakeOffsetX = 0, shakeOffsetY = 0, shakeOffsetZ = 0;

      if (expRef.particles) {
        const shakeElapsed = (time - expRef.startTime) / 1000;
        if (shakeElapsed < SHAKE_MAX_DURATION) {
          const decay = 1.0 - shakeElapsed / SHAKE_MAX_DURATION;
          const amplitude = SHAKE_INITIAL_AMPLITUDE * decay * decay;
          shakeOffsetX = (Math.random() * 2 - 1) * amplitude;
          shakeOffsetY = (Math.random() * 2 - 1) * amplitude;
          shakeOffsetZ = (Math.random() * 2 - 1) * amplitude;
        }
      }

      const { w: rw, h: rh, dpr: rdpr } = sizeRef.current;
      if (rw <= 0 || rh <= 0) { animRef.current = requestAnimationFrame(animate); return; }

      const rearWCss = clampMirrorSize(Math.round(rw * 0.28), 150, 380);
      const rearHCss = Math.round(rh * 0.20);
      const sideWCss = clampMirrorSize(Math.round(rw * 0.12), 70, 160);
      const sideHCss = Math.max(140, Math.round(rh * 0.32));

      rearCam.aspect = rearWCss / Math.max(rearHCss, 1);
      rearCam.updateProjectionMatrix();
      leftCam.aspect = sideWCss / Math.max(sideHCss, 1);
      leftCam.updateProjectionMatrix();
      rightCam.aspect = sideWCss / Math.max(sideHCss, 1);
      rightCam.updateProjectionMatrix();

      camera.position.set(
        pos.x + shakeOffsetX,
        pos.y + shakeOffsetY,
        pos.z + shakeOffsetZ,
      );
      const targetDir = new THREE.Vector3(sp.direction[0], sp.direction[1], sp.direction[2]);
      smoothDirRef.current.lerp(targetDir, 0.08).normalize();
      const camUp = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(smoothDirRef.current, camUp).normalize();
      const viewUp = new THREE.Vector3().crossVectors(right, smoothDirRef.current).normalize();
      const centerOffset = viewUp.multiplyScalar(1.5);
      animLookTarget.set(
        sp.position[0] + smoothDirRef.current.x * 10 + centerOffset.x,
        sp.position[1] + smoothDirRef.current.y * 10 + centerOffset.y,
        sp.position[2] + smoothDirRef.current.z * 10 + centerOffset.z,
      );
      camera.lookAt(animLookTarget);
      renderer.render(scene, camera);

      rearCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] - sp.direction[0] * 10,
        sp.position[1] - sp.direction[1] * 10,
        sp.position[2] - sp.direction[2] * 10,
      );
      rearCam.lookAt(animLookTarget);
      rearRenderer.render(scene, rearCam);

      leftCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] + leftDir.x * 10,
        sp.position[1] + leftDir.y * 10,
        sp.position[2] + leftDir.z * 10,
      );
      leftCam.lookAt(animLookTarget);
      leftRenderer.render(scene, leftCam);

      rightCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] + rightDir.x * 10,
        sp.position[1] + rightDir.y * 10,
        sp.position[2] + rightDir.z * 10,
      );
      rightCam.lookAt(animLookTarget);
      rightRenderer.render(scene, rightCam);

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      if (rw <= 0 || rh <= 0) return;
      const rdpr = Math.min(window.devicePixelRatio, 2);
      sizeRef.current = { w: rw, h: rh, dpr: rdpr };

      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(rdpr);
      renderer.setSize(rw, rh);

      const newRearWCss = clampMirrorSize(Math.round(rw * 0.28), 150, 380);
      const newRearHCss = Math.round(rh * 0.12);
      const newSideWCss = clampMirrorSize(Math.round(rw * 0.12), 70, 160);
      const newSideHCss = Math.max(140, Math.round(rh * 0.32));

      [rearRenderer, leftRenderer, rightRenderer].forEach(mr => mr.setPixelRatio(rdpr));
      updateMirrorRendererSize(rearRenderer, newRearWCss, newRearHCss);
      updateMirrorRendererSize(leftRenderer, newSideWCss, newSideHCss);
      updateMirrorRendererSize(rightRenderer, newSideWCss, newSideHCss);
    };
    window.addEventListener('resize', onResize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      const expRef = explosionRef.current;
      if (expRef.particles) {
        scene.remove(expRef.particles);
        expRef.particles.geometry.dispose();
        (expRef.particles.material as THREE.Material).dispose();
      }
      if (expRef.flashLight) {
        scene.remove(expRef.flashLight);
      }

      const d = disposablesRef.current;
      for (const line of d.lines) scene.remove(line);
      for (const [, mesh] of bodyMeshes) scene.remove(mesh);
      scene.remove(stars);
      d.geometries.forEach(g => g.dispose());
      d.materials.forEach(m => m.dispose());
      d.textures.forEach(t => t.dispose());

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      [rearRenderer, leftRenderer, rightRenderer].forEach(mr => {
        mr.dispose();
        if (mr.domElement.parentNode) {
          mr.domElement.parentNode.removeChild(mr.domElement);
        }
      });
    };
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <div ref={rearFrameRef}
        onMouseEnter={() => setHoveredMirror('rear')}
        onMouseLeave={() => setHoveredMirror(null)}
        style={{
        position: 'absolute', top: 0, left: '50%',
        transform: `translateX(-50%) translateY(${(hoveredMirror === 'rear' || pinnedMirrors.has('rear')) ? '0' : 'calc(-100% + 18px)'})`,
        width: '28%', height: '20%', maxWidth: 380, minWidth: 150, minHeight: 120,
        overflow: 'hidden',
        border: '1px solid rgba(140,170,210,0.25)',
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        boxShadow: `
          inset 0 0 20px rgba(0,0,0,0.55),
          inset 0 0 3px rgba(180,210,255,0.12),
          0 0 0 2px rgba(30,40,55,0.9),
          0 0 0 4px rgba(25,32,44,0.8),
          0 0 0 5px rgba(90,120,160,0.3),
          0 4px 18px rgba(0,0,0,0.55)
        `,
        pointerEvents: 'auto',
        zIndex: 10,
        transition: 'transform 0.25s ease',
      }}>
        <div style={{
          position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(180,210,255,0.3)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
          zIndex: 1, whiteSpace: 'nowrap',
        }}>
          后视镜
        </div>
        {(hoveredMirror === 'rear' || pinnedMirrors.has('rear')) && (
          <div onClick={(e) => {
            e.stopPropagation();
            setPinnedMirrors(prev => { const next = new Set(prev); if (next.has('rear')) next.delete('rear'); else next.add('rear'); return next; });
          }} style={{
            position: 'absolute', top: 4, right: 6, zIndex: 2,
            color: pinnedMirrors.has('rear') ? '#ffaa33' : 'rgba(180,210,255,0.3)',
            fontSize: 10, cursor: 'pointer', userSelect: 'none', fontFamily: 'monospace', transition: 'color 0.15s',
          }}>📌</div>
        )}
      </div>
      <div ref={leftFrameRef}
        onMouseEnter={() => setHoveredMirror('left')}
        onMouseLeave={() => setHoveredMirror(null)}
        style={{
        position: 'absolute', top: '50%', left: 0,
        transform: `translateY(-50%) translateX(${(hoveredMirror === 'left' || pinnedMirrors.has('left')) ? '0' : 'calc(-100% + 22px)'})`,
        width: '12%', height: '32%', maxWidth: 160, minWidth: 70, minHeight: 140,
        overflow: 'hidden',
        border: '1px solid rgba(140,170,210,0.25)',
        borderLeft: 'none',
        borderRadius: '0 8px 8px 0',
        boxShadow: `
          inset 0 0 20px rgba(0,0,0,0.55),
          inset 0 0 3px rgba(180,210,255,0.12),
          0 0 0 2px rgba(30,40,55,0.9),
          0 0 0 4px rgba(25,32,44,0.8),
          0 0 0 5px rgba(90,120,160,0.3),
          3px 0 14px rgba(0,0,0,0.5)
        `,
        pointerEvents: 'auto',
        zIndex: 10,
        transition: 'transform 0.25s ease',
      }}>
        <div style={{
          position: 'absolute', bottom: 3, right: 4,
          color: 'rgba(180,210,255,0.3)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
          zIndex: 1,
        }}>
          左
        </div>
        {(hoveredMirror === 'left' || pinnedMirrors.has('left')) && (
          <div onClick={(e) => {
            e.stopPropagation();
            setPinnedMirrors(prev => { const next = new Set(prev); if (next.has('left')) next.delete('left'); else next.add('left'); return next; });
          }} style={{
            position: 'absolute', top: 4, right: 6, zIndex: 2,
            color: pinnedMirrors.has('left') ? '#ffaa33' : 'rgba(180,210,255,0.3)',
            fontSize: 10, cursor: 'pointer', userSelect: 'none', fontFamily: 'monospace', transition: 'color 0.15s',
          }}>📌</div>
        )}
      </div>
      <div ref={rightFrameRef}
        onMouseEnter={() => setHoveredMirror('right')}
        onMouseLeave={() => setHoveredMirror(null)}
        style={{
        position: 'absolute', top: '50%', right: 0,
        transform: `translateY(-50%) translateX(${(hoveredMirror === 'right' || pinnedMirrors.has('right')) ? '0' : 'calc(100% - 22px)'})`,
        width: '12%', height: '32%', maxWidth: 160, minWidth: 70, minHeight: 140,
        overflow: 'hidden',
        border: '1px solid rgba(140,170,210,0.25)',
        borderRight: 'none',
        borderRadius: '8px 0 0 8px',
        boxShadow: `
          inset 0 0 20px rgba(0,0,0,0.55),
          inset 0 0 3px rgba(180,210,255,0.12),
          0 0 0 2px rgba(30,40,55,0.9),
          0 0 0 4px rgba(25,32,44,0.8),
          0 0 0 5px rgba(90,120,160,0.3),
          -3px 0 14px rgba(0,0,0,0.5)
        `,
        pointerEvents: 'auto',
        zIndex: 10,
        transition: 'transform 0.25s ease',
      }}>
        <div style={{
          position: 'absolute', bottom: 3, left: 4,
          color: 'rgba(180,210,255,0.3)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
          zIndex: 1,
        }}>
          右
        </div>
        {(hoveredMirror === 'right' || pinnedMirrors.has('right')) && (
          <div onClick={(e) => {
            e.stopPropagation();
            setPinnedMirrors(prev => { const next = new Set(prev); if (next.has('right')) next.delete('right'); else next.add('right'); return next; });
          }} style={{
            position: 'absolute', top: 4, left: 6, zIndex: 2,
            color: pinnedMirrors.has('right') ? '#ffaa33' : 'rgba(180,210,255,0.3)',
            fontSize: 10, cursor: 'pointer', userSelect: 'none', fontFamily: 'monospace', transition: 'color 0.15s',
          }}>📌</div>
        )}
      </div>
      <TimePanel />
    </div>
  );
}

export default ExploreCanvas;
