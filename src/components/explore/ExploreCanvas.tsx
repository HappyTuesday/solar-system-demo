import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { stateVectors } from '../../engine/orbital';
import { REAL_DATA, MU_SUN_AU as MU_SUN } from '../../engine/constants';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { useExploreStore } from '../../stores/exploreStore';
import { checkSpaceshipCollision, hasEffectiveThrust } from '../../engine/spaceship';
import { NAVIGATION_CONFIG } from '../../engine/constants';
import { advanceExploreShipPhysics } from '../../engine/exploreSimulation';
import { computeRendezvousPulse } from '../../engine/navigationVisual';
import TimePanel from './TimePanel';

const ORBIT_LINE_POINTS = 256;

const REAR_MIRROR_FOV = 65;
const SIDE_MIRROR_FOV = 75;
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
    points.push(new THREE.Vector3(sv.position[0], sv.position[1], sv.position[2]));
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

function createRendezvousMarkerTexture(kind: 'core' | 'ring'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;

  if (kind === 'core') {
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(220,255,235,1)');
    gradient.addColorStop(0.25, 'rgba(70,255,160,0.92)');
    gradient.addColorStop(0.58, 'rgba(0,220,140,0.35)');
    gradient.addColorStop(1, 'rgba(0,220,140,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.strokeStyle = 'rgba(80,255,170,0.95)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    const glow = ctx.createRadialGradient(half, half, half * 0.34, half, half, half * 0.5);
    glow.addColorStop(0, 'rgba(0,255,150,0.2)');
    glow.addColorStop(1, 'rgba(0,255,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }

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

  const engineSoundRef = useRef<{
    noiseSource: AudioBufferSourceNode;
    osc: OscillatorNode;
    gainNode: GainNode;
    oscGain: GainNode;
    active: boolean;
    osc2: OscillatorNode;
    oscGain2: GainNode;
    bandLow: BiquadFilterNode;
    bandMid: BiquadFilterNode;
  } | null>(null);

  function startEngineSound() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const bufferSize = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < bufferSize; i++) {
        brown += (Math.random() * 2 - 1) * 0.02;
        brown = Math.max(-1, Math.min(1, brown));
        data[i] = brown;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      const bandLow = ctx.createBiquadFilter();
      bandLow.type = 'bandpass';
      bandLow.frequency.value = 60;
      bandLow.Q.value = 1.0;

      const bandMid = ctx.createBiquadFilter();
      bandMid.type = 'bandpass';
      bandMid.frequency.value = 160;
      bandMid.Q.value = 2.0;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 25;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 55;
      const oscGain2 = ctx.createGain();
      oscGain2.gain.value = 0;

      noiseSource.connect(bandLow);
      noiseSource.connect(bandMid);
      bandLow.connect(gainNode);
      bandMid.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc2.connect(oscGain2);
      oscGain2.connect(ctx.destination);

      noiseSource.start();
      osc.start();
      osc2.start();

      engineSoundRef.current = { noiseSource, osc, gainNode, oscGain, osc2, oscGain2, bandLow, bandMid, active: false };
    } catch {
      // audio not available
    }
  }

  function setEngineVolume(magnitude: number) {
    const es = engineSoundRef.current;
    if (!es || !audioCtxRef.current) return;
    const pct = magnitude / 100;
    const now = audioCtxRef.current.currentTime;
    if (pct <= 0.001) {
      es.gainNode.gain.setTargetAtTime(0, now, 0.2);
      es.oscGain.gain.setTargetAtTime(0, now, 0.2);
      es.oscGain2.gain.setTargetAtTime(0, now, 0.2);
      es.active = false;
    } else {
      es.active = true;
      const vol = 0.15;
      es.gainNode.gain.setTargetAtTime(vol, now, 0.05);
      es.oscGain.gain.setTargetAtTime(vol, now, 0.05);
      es.oscGain2.gain.setTargetAtTime(vol, now, 0.05);

      const freqMul = 1.0 + pct * 2.5;
      es.bandLow.frequency.setTargetAtTime(60 * freqMul, now, 0.05);
      es.bandMid.frequency.setTargetAtTime(160 * freqMul, now, 0.05);
      es.osc.frequency.setTargetAtTime(25 * freqMul, now, 0.05);
      es.osc2.frequency.setTargetAtTime(55 * freqMul, now, 0.05);
      es.noiseSource.playbackRate.setTargetAtTime(freqMul * 0.85, now, 0.05);
    }
  }

  function destroyEngineSound() {
    const es = engineSoundRef.current;
    if (!es) return;
    try {
      es.noiseSource.stop();
      es.osc.stop();
      es.osc2.stop();
    } catch {
      // already stopped
    }
    engineSoundRef.current = null;
  }

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
    const disposables = disposablesRef.current;

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

    const rendezvousGroup = new THREE.Group();
    rendezvousGroup.visible = false;
    rendezvousGroup.renderOrder = 950;
    const rendezvousCoreTexture = createRendezvousMarkerTexture('core');
    const rendezvousRingTexture = createRendezvousMarkerTexture('ring');
    disposablesRef.current.textures.push(rendezvousCoreTexture, rendezvousRingTexture);

    const rendezvousCoreMaterial = new THREE.SpriteMaterial({
      map: rendezvousCoreTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    });
    disposablesRef.current.materials.push(rendezvousCoreMaterial);
    const rendezvousCore = new THREE.Sprite(rendezvousCoreMaterial);
    rendezvousGroup.add(rendezvousCore);

    const rendezvousRingMaterials: THREE.SpriteMaterial[] = [];
    const rendezvousRings: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const material = new THREE.SpriteMaterial({
        map: rendezvousRingTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.5,
      });
      disposablesRef.current.materials.push(material);
      rendezvousRingMaterials.push(material);
      const sprite = new THREE.Sprite(material);
      rendezvousRings.push(sprite);
      rendezvousGroup.add(sprite);
    }
    scene.add(rendezvousGroup);

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
      const r = data.radius;
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
      useSpaceshipStore.getState().updateTangentialCorrectionGear();
      useSpaceshipStore.getState().updateParkGear();
      const store = useSpaceshipStore.getState();

      const effectiveThrust = hasEffectiveThrust(store.thrust, store.thrustMagnitude);
      if (store.isRunning && !store.exploded && effectiveThrust) {
        if (!engineSoundRef.current) startEngineSound();
        setEngineVolume(store.thrustMagnitude);
      } else if (engineSoundRef.current?.active) {
        setEngineVolume(0);
      }

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

        simulatedTime = store.simulatedTime;

        const timeScale = useExploreStore.getState().timeScale;
        const physics = advanceExploreShipPhysics({
          ship: {
            position: store.position,
            velocity: store.velocity,
            direction: store.direction,
            thrust: store.thrust,
            thrustMagnitude: store.thrustMagnitude,
            exploded: store.exploded,
          },
          simulatedTime,
          frameDt: clampedDt,
          timeScale,
          bodyIds: allIds,
        });
        const shipState = physics.ship;
        store.updateFlightStats(physics.travelKm, physics.speedKms);

        simulatedTime = physics.simulatedTime;
        store.setSimulatedTime(simulatedTime);

        {
          const navStore = useSpaceshipStore.getState();
          const elapsed = (simulatedTime - navStore.lastDeviationCheckTime) / 1000;
          // Check every frame when thrust is active so burn sub-steps can
          // auto-complete at the right moment without overshooting.
          if (elapsed > NAVIGATION_CONFIG.deviationCheckInterval || hasEffectiveThrust(navStore.thrust, navStore.thrustMagnitude)) {
            useSpaceshipStore.setState({ lastDeviationCheckTime: simulatedTime });
            navStore.checkNavigationalDeviation();
          }
        }

        const finalBodies = physics.finalBodies;
        const finalBodyMap = new Map(finalBodies.map(body => [body.id, body]));
        const screenH = sizeRef.current.h || 800;
        const MIN_BODY_PX = 10;

        for (const id of allIds) {
          if (id === 'sun') continue;
          const mesh = bodyMeshes.get(id);
          const data = REAL_DATA[id];
          const body = finalBodyMap.get(id);
          if (!mesh || !data || !body) continue;
          mesh.position.set(body.position[0], body.position[1], body.position[2]);
          const dist = camera.position.distanceTo(mesh.position);
          const bodyR = data.radius;
          const pixelSize = screenH * bodyR / Math.max(dist, 1e-10);
          mesh.scale.setScalar(pixelSize < MIN_BODY_PX ? MIN_BODY_PX / pixelSize : 1);
        }

        const sunMesh = bodyMeshes.get('sun');
        if (sunMesh) {
          const sunDist = camera.position.length();
          const sunR = REAL_DATA.sun.radius;
          const sunPx = screenH * sunR / Math.max(sunDist, 1e-10);
          sunMesh.scale.setScalar(sunPx < MIN_BODY_PX ? MIN_BODY_PX / sunPx : 1);
        }

        const hitBodyId = checkSpaceshipCollision(shipState, finalBodies);
        if (hitBodyId) {
          wasExplodedRef.current = true;
          setEngineVolume(0);
          playExplosionSound();
          const hitBody = finalBodies.find(b => b.id === hitBodyId);
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

          // Update nearest body ID and orbiting body ID (used by HUD, navigation, attitude modes)
          {
            let nearestDist = Infinity;
            let nearestId = 'sun';
            let orbitingId = 'sun';
            for (const id of allIds) {
              const data = REAL_DATA[id];
              const body = finalBodyMap.get(id);
              if (!data || !body) continue;
              const dx = body.position[0] - shipState.position[0];
              const dy = body.position[1] - shipState.position[1];
              const dz = body.position[2] - shipState.position[2];
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist < nearestDist) { nearestDist = dist; nearestId = id; }

              // Hill sphere check for orbiting body
              if (id !== 'sun' && data.semiMajorAxis) {
                const aBodyAU = data.semiMajorAxis;
                const hillR = aBodyAU * Math.pow(data.mass / (3 * REAL_DATA.sun.mass), 1 / 3);
                if (dist < hillR) orbitingId = id;
              }
            }
            store.setNearestBodyId(nearestId);
            store.setOrbitingBodyId(orbitingId);
          }

          if (store.attitudeMode !== 'inertial') {
            const spPos = shipState.position;
            const spVel = shipState.velocity;
            let nearestDist = Infinity;
            let nearestPos: [number, number, number] = [0, 0, 0];
            let nearestVel: [number, number, number] = [0, 0, 0];

            for (const id of allIds) {
              const body = finalBodyMap.get(id);
              if (!body) continue;
              const dx = body.position[0] - spPos[0], dy = body.position[1] - spPos[1], dz = body.position[2] - spPos[2];
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestPos = body.position;
                nearestVel = body.velocity;
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
            } else if (store.attitudeMode === 'heliocentric-tangential-prograde') {
              const tangential = new THREE.Vector3(-spPos[1], spPos[0], 0);
              const len = tangential.length();
              if (len > 1e-15) {
                store.setDirection([tangential.x / len, tangential.y / len, 0]);
              }
            } else if (store.attitudeMode === 'heliocentric-prograde' || store.attitudeMode === 'heliocentric-retrograde') {
              const speed = Math.sqrt(spVel[0] * spVel[0] + spVel[1] * spVel[1] + spVel[2] * spVel[2]);
              if (speed > 1e-15) {
                const sign = store.attitudeMode === 'heliocentric-retrograde' ? -1 : 1;
                store.setDirection([
                  sign * spVel[0] / speed,
                  sign * spVel[1] / speed,
                  sign * spVel[2] / speed,
                ]);
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
                const targetBody = finalBodyMap.get(store.targetBodyId);
                if (targetBody) targetPos = targetBody.position;
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

      const { w: rw, h: rh } = sizeRef.current;
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

      {
        const navPlan = useSpaceshipStore.getState().navigationPlan;
        if (navPlan?.method === 'direct-rendezvous' && navPlan.rendezvous) {
          const point = navPlan.rendezvous.point;
          rendezvousGroup.visible = true;
          rendezvousGroup.position.set(point[0], point[1], point[2]);
          const distance = Math.max(camera.position.distanceTo(rendezvousGroup.position), 1e-6);
          const baseWorldSize = Math.max(0.003, Math.min(0.08, distance * 0.018));
          const pulse = computeRendezvousPulse(time, {
            baseRadius: 4,
            spreadRadius: 16,
            rings: rendezvousRings.length,
          });

          const coreScale = baseWorldSize * (pulse.coreRadius / 4);
          rendezvousCore.scale.set(coreScale, coreScale, 1);
          rendezvousCoreMaterial.opacity = pulse.coreAlpha;

          for (let i = 0; i < rendezvousRings.length; i++) {
            const ring = pulse.rings[i];
            const ringScale = baseWorldSize * (ring.radius / 4);
            rendezvousRings[i].scale.set(ringScale, ringScale, 1);
            rendezvousRingMaterials[i].opacity = ring.alpha;
          }
        } else {
          rendezvousGroup.visible = false;
        }
      }

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
      destroyEngineSound();

      const expRef = explosionRef.current;
      if (expRef.particles) {
        scene.remove(expRef.particles);
        expRef.particles.geometry.dispose();
        (expRef.particles.material as THREE.Material).dispose();
      }
      if (expRef.flashLight) {
        scene.remove(expRef.flashLight);
      }

      const d = disposables;
      scene.remove(rendezvousGroup);
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
