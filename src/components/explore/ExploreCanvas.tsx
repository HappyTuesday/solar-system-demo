import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { REAL_DATA, MU_SUN } from '../../engine/constants';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { rk4StepSpaceship, applyThrustInBodyFrame, checkSpaceshipCollision, type BodyInfo } from '../../engine/spaceship';
import type { SpaceshipState } from '../../types';

const SCALE = 1 / 1.496e11;
const ORBIT_LINE_POINTS = 256;

const MIRROR_FOV = 85;

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
  return [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE];
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

function ExploreCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rearCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const leftCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rightCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodyMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const allIdsRef = useRef<string[]>(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const disposablesRef = useRef<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[]; lines: THREE.Line[] }>({
    geometries: [], materials: [], textures: [], lines: [],
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dpr = Math.min(window.devicePixelRatio, 2);
    sizeRef.current = { w, h, dpr };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    const camera = new THREE.PerspectiveCamera(75, w / Math.max(h, 1), 0.001, 500);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const rearCam = new THREE.PerspectiveCamera(MIRROR_FOV, 1, 0.001, 500);
    rearCam.up.set(0, 0, 1);
    rearCamRef.current = rearCam;

    const leftCam = new THREE.PerspectiveCamera(MIRROR_FOV, 1, 0.001, 500);
    leftCam.up.set(0, 0, 1);
    leftCamRef.current = leftCam;

    const rightCam = new THREE.PerspectiveCamera(MIRROR_FOV, 1, 0.001, 500);
    rightCam.up.set(0, 0, 1);
    rightCamRef.current = rightCam;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(dpr);
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

    const animLookTarget = new THREE.Vector3();

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

      const sp = useSpaceshipStore.getState();
      const pos = new THREE.Vector3(sp.position[0], sp.position[1], sp.position[2]);
      const dir = new THREE.Vector3(sp.direction[0], sp.direction[1], sp.direction[2]);
      const leftArr = rotateDirLeft(sp.direction);
      const rightArr = rotateDirRight(sp.direction);
      const leftDir = new THREE.Vector3(leftArr[0], leftArr[1], leftArr[2]);
      const rightDir = new THREE.Vector3(rightArr[0], rightArr[1], rightArr[2]);

      const { w: rw, h: rh, dpr: rdpr } = sizeRef.current;
      if (rw <= 0 || rh <= 0) { animRef.current = requestAnimationFrame(animate); return; }

      // ---- Main view ----
      camera.position.copy(pos);
      animLookTarget.set(
        sp.position[0] + sp.direction[0] * 10,
        sp.position[1] + sp.direction[1] * 10,
        sp.position[2] + sp.direction[2] * 10,
      );
      camera.lookAt(animLookTarget);

      renderer.setViewport(0, 0, Math.round(rw * rdpr), Math.round(rh * rdpr));
      renderer.setScissor(0, 0, Math.round(rw * rdpr), Math.round(rh * rdpr));
      renderer.setScissorTest(false);
      renderer.render(scene, camera);

      // ---- Mirror sizes (CSS pixels) ----
      const rearWCss = Math.round(rw * 0.22);
      const rearHCss = Math.round(rh * 0.18);
      const sideWCss = Math.round(rw * 0.16);
      const sideHCss = Math.round(rh * 0.25);

      // Mirror sizes (drawing buffer pixels)
      const rearW = Math.round(rearWCss * rdpr);
      const rearH = Math.round(rearHCss * rdpr);
      const sideW = Math.round(sideWCss * rdpr);
      const sideH = Math.round(sideHCss * rdpr);

      const bufW = Math.round(rw * rdpr);
      const bufH = Math.round(rh * rdpr);

      // ---- Rear mirror (top center, flush with top edge) ----
      const rearX = Math.round((bufW - rearW) / 2);
      const rearY = bufH - rearH;
      rearCam.aspect = rearWCss / Math.max(rearHCss, 1);
      rearCam.updateProjectionMatrix();
      rearCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] - sp.direction[0] * 10,
        sp.position[1] - sp.direction[1] * 10,
        sp.position[2] - sp.direction[2] * 10,
      );
      rearCam.lookAt(animLookTarget);
      renderer.setViewport(rearX, rearY, rearW, rearH);
      renderer.setScissor(rearX, rearY, rearW, rearH);
      renderer.setScissorTest(true);
      renderer.render(scene, rearCam);

      // ---- Left mirror (flush with left edge) ----
      const leftX = 0;
      const leftY = Math.round((bufH - sideH) / 2);
      leftCam.aspect = sideWCss / Math.max(sideHCss, 1);
      leftCam.updateProjectionMatrix();
      leftCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] + leftDir.x * 10,
        sp.position[1] + leftDir.y * 10,
        sp.position[2] + leftDir.z * 10,
      );
      leftCam.lookAt(animLookTarget);
      renderer.setViewport(leftX, leftY, sideW, sideH);
      renderer.setScissor(leftX, leftY, sideW, sideH);
      renderer.setScissorTest(true);
      renderer.render(scene, leftCam);

      // ---- Right mirror (flush with right edge) ----
      const rightX = bufW - sideW;
      const rightY = Math.round((bufH - sideH) / 2);
      rightCam.aspect = sideWCss / Math.max(sideHCss, 1);
      rightCam.updateProjectionMatrix();
      rightCam.position.copy(pos);
      animLookTarget.set(
        sp.position[0] + rightDir.x * 10,
        sp.position[1] + rightDir.y * 10,
        sp.position[2] + rightDir.z * 10,
      );
      rightCam.lookAt(animLookTarget);
      renderer.setViewport(rightX, rightY, sideW, sideH);
      renderer.setScissor(rightX, rightY, sideW, sideH);
      renderer.setScissorTest(true);
      renderer.render(scene, rightCam);

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
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Rear mirror frame */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '22%', height: '18%', maxWidth: 280, minWidth: 120,
        border: '2px solid rgba(180,210,255,0.3)',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.2)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
        }}>
          后视镜
        </div>
      </div>
      {/* Left mirror frame */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)',
        width: '16%', height: '25%', maxWidth: 200, minWidth: 80, minHeight: 100,
        border: '2px solid rgba(180,210,255,0.3)',
        borderLeft: 'none',
        borderRadius: '0 6px 6px 0',
        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.5), 2px 0 8px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.2)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
        }}>
          左
        </div>
      </div>
      {/* Right mirror frame */}
      <div style={{
        position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)',
        width: '16%', height: '25%', maxWidth: 200, minWidth: 80, minHeight: 100,
        border: '2px solid rgba(180,210,255,0.3)',
        borderRight: 'none',
        borderRadius: '6px 0 0 6px',
        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.5), -2px 0 8px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.2)', fontSize: 8, fontFamily: 'monospace', userSelect: 'none',
        }}>
          右
        </div>
      </div>
    </div>
  );
}

export default ExploreCanvas;
