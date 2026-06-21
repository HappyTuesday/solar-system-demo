import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { rk4StepSpaceship, applyThrustInBodyFrame, checkSpaceshipCollision, type BodyInfo } from '../../engine/spaceship';
import type { SpaceshipState } from '../../types';

const SCALE = 1 / 1.496e11;
const ORBIT_LINE_POINTS = 256;

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
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
}

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodyMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const allIdsRef = useRef<string[]>(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const frustumRef = useRef(new THREE.Frustum());
  const projMatrixRef = useRef(new THREE.Matrix4());
  const disposablesRef = useRef<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[]; lines: THREE.Line[] }>({
    geometries: [], materials: [], textures: [], lines: [],
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    const camera = new THREE.PerspectiveCamera(75, w / Math.max(h, 1), 0.001, 500);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x444466, 1.0));
    scene.add(new THREE.PointLight(0xffeedd, 2, 0, 0));

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
        scene.add(line);
        disposablesRef.current.lines.push(line);
        disposablesRef.current.geometries.push(line.geometry);
        disposablesRef.current.materials.push(line.material as THREE.Material);
      }
    }
    bodyMeshesRef.current = bodyMeshes;

    let lastTime = performance.now();
    let simulatedTime = Date.now();

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const store = useSpaceshipStore.getState();

      if (store.isRunning && dt > 0 && !store.exploded) {
        const clampedDt = Math.min(dt, 0.1);
        simulatedTime += clampedDt * 86400 * 1000;
        store.setSimulatedTime(simulatedTime);
        const jd = julianDate(simulatedTime);

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

        const bodyInfos: BodyInfo[] = [];
        for (const id of allIds) {
          const mesh = bodyMeshes.get(id);
          const data = REAL_DATA[id];
          if (!mesh || !data) continue;
          bodyInfos.push({
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            mass: data.mass,
            radius: data.radius * SCALE,
          });
        }

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

        const simDelta = clampedDt * 86400;
        const steps = Math.min(Math.max(1, Math.floor(simDelta / 0.016)), 200);
        const subDt = simDelta / steps;
        for (let s = 0; s < steps; s++) {
          rk4StepSpaceship(shipState, bodyInfos, subDt);
        }

        if (checkSpaceshipCollision(shipState, bodyInfos)) {
          store.setExploded();
        } else {
          const speed = Math.sqrt(
            shipState.velocity[0] ** 2 + shipState.velocity[1] ** 2 + shipState.velocity[2] ** 2
          );
          const newDir: [number, number, number] = speed > 1e-12
            ? [shipState.velocity[0] / speed, shipState.velocity[1] / speed, shipState.velocity[2] / speed]
            : shipState.direction;

          store.updatePhysics(
            [shipState.position[0], shipState.position[1], shipState.position[2]],
            [shipState.velocity[0], shipState.velocity[1], shipState.velocity[2]],
          );
          store.setDirection(newDir);
        }
      }

      const cam = cameraRef.current!;
      const sp = useSpaceshipStore.getState();
      cam.position.set(sp.position[0], sp.position[1], sp.position[2]);

      const lookTarget = new THREE.Vector3(
        sp.position[0] + sp.direction[0] * 10,
        sp.position[1] + sp.direction[1] * 10,
        sp.position[2] + sp.direction[2] * 10,
      );
      cam.lookAt(lookTarget);

      projMatrixRef.current.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustumRef.current.setFromProjectionMatrix(projMatrixRef.current);

      for (const [, mesh] of bodyMeshes) {
        mesh.visible = frustumRef.current.containsPoint(mesh.position);
      }

      renderer.render(scene, cam);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      if (rw <= 0 || rh <= 0) return;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);

      const d = disposablesRef.current;
      for (const line of d.lines) scene.remove(line);
      for (const [, mesh] of bodyMeshes) scene.remove(mesh);
      d.geometries.forEach(g => g.dispose());
      d.materials.forEach(m => m.dispose());
      d.textures.forEach(t => t.dispose());

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }} />
  );
}

export default ExploreCanvas;
