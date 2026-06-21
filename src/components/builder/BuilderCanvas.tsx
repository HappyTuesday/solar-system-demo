import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { detectCollisions } from '../../engine/physics';
import { renderToPhysical, physicalToRender, physicalRadiusToRender, getLinearScale } from '../../engine/coordinateTransform';
import { HINT_ORDER, PHYSICAL_CONSTANTS } from '../../engine/constants';
import { BUILD_DATA } from '../../engine/buildData';
import { initScene, handleResize } from '../../rendering/threejs/setup';
import { createBodyMesh, updateBodyMeshes, removeBodyMesh, clearAllMeshes, bodyMeshMap, DEFAULT_COLORS } from '../../rendering/threejs/bodies';
import { createReferencePlane, addOrbitRing, clearOrbitRings } from '../../rendering/threejs/grid';
import { TrailManager } from '../../rendering/threejs/trails';
import { initTouchInteraction, destroyTouchInteraction } from '../../rendering/threejs/touchInteraction';
import { setSharedCamera, setSharedCanvas, setSharedScene, setCurrentLookAt } from '../../rendering/threejs/cameraRef';
import { getPlacementPoint, removeFloatingPreview, createFloatingPreview } from '../../rendering/threejs/interaction';
import VelocityInputForm from './VelocityInputForm';

function BuilderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const trailManagerRef = useRef<TrailManager | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const bodies = useBuildStore(s => s.bodies);
  const isRunning = useBuildStore(s => s.isRunning);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const isPlacing = useUIStore(s => s.isPlacing);
  const showTrails = useUIStore(s => s.showTrails);
  const linearScale = useUIStore(s => s.linearScale);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);
  const setMousePositions = useUIStore(s => s.setMousePositions);
  const setPreviewPosition = useUIStore(s => s.setPreviewPosition);
  const setIsPlacing = useUIStore(s => s.setIsPlacing);
  const setClickPosPhysical = useUIStore(s => s.setClickPosPhysical);
  const setClickPosScreen = useUIStore(s => s.setClickPosScreen);
  const clickPosScreen = useUIStore(s => s.clickPosScreen);
  const panToBodyId = useUIStore(s => s.panToBodyId);
  const setPanToBodyId = useUIStore(s => s.setPanToBodyId);

  // --- Three.js scene init ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { scene, camera, renderer } = initScene(canvas);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    setSharedScene(scene);
    setSharedCamera(camera);
    setSharedCanvas(canvas);

    createReferencePlane(scene, canvas.clientWidth, canvas.clientHeight);

    const ls = getLinearScale();
    for (const [, data] of Object.entries(BUILD_DATA)) {
      if (data.semiMajorAxis && data.semiMajorAxis > 0) {
        addOrbitRing(scene, data.semiMajorAxis * ls, 0x334455);
      }
    }

    const tm = new TrailManager(scene);
    tm.setVisible(showTrails);
    trailManagerRef.current = tm;

    initTouchInteraction(canvas);

    const existingBodies = useBuildStore.getState().bodies;
    const lsInit = getLinearScale();
    for (const body of existingBodies) {
      const bd = BUILD_DATA[body.templateId];
      const r = bd ? Math.max(bd.radius * lsInit, 10) : undefined;
      createBodyMesh(body, scene, r);
    }

    const observer = new ResizeObserver(() => {
      const c = canvasRef.current;
      if (c && renderer && camera) {
        handleResize(c, renderer, camera);
      }
    });
    observer.observe(canvas.parentElement!);

    return () => {
      observer.disconnect();
      destroyTouchInteraction();
      tm.dispose();
      clearAllMeshes(scene);
      clearOrbitRings(scene);
      const groups = scene.children.filter(c => c instanceof THREE.Group);
      for (const g of groups) scene.remove(g);
      renderer.dispose();
      setSharedScene(null);
      setSharedCamera(null);
      setSharedCanvas(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sync showTrails ---
  useEffect(() => {
    trailManagerRef.current?.setVisible(showTrails);
  }, [showTrails]);

  // --- Clear trails when scale changes ---
  useEffect(() => {
    trailManagerRef.current?.clearAll();
  }, [linearScale]);

  // --- Rebuild meshes when scale changes ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const currentBodies = useBuildStore.getState().bodies;
    for (const [id] of bodyMeshMap) {
      removeBodyMesh(id, scene);
    }
    bodyMeshMap.clear();
    for (const body of currentBodies) {
      const bd = BUILD_DATA[body.templateId];
      const r = bd ? Math.max(bd.radius * getLinearScale(), 10) : undefined;
      createBodyMesh(body, scene, r);
    }
  }, [linearScale]);

  // --- Pan to body ---
  useEffect(() => {
    if (!panToBodyId) return;
    const body = useBuildStore.getState().bodies.find(b => b.id === panToBodyId);
    if (!body) { setPanToBodyId(null); return; }
    const [rx, ry] = physicalToRender([body.position[0], body.position[1], body.position[2]]);
    const camera = cameraRef.current;
    if (camera) {
      camera.position.set(rx, ry, 100);
      camera.lookAt(rx, ry, 0);
      setCurrentLookAt([rx, ry, 0]);
    }
    setPanToBodyId(null);
  }, [panToBodyId, setPanToBodyId]);

  // --- Sync body meshes with store ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentMeshIds = new Set(bodyMeshMap.keys());
    const currentBodyIds = new Set(bodies.map(b => b.id));

    for (const id of currentMeshIds) {
      if (!currentBodyIds.has(id)) {
        removeBodyMesh(id, scene);
        trailManagerRef.current?.removeTrail(id);
      }
    }

    for (const body of bodies) {
      if (!currentMeshIds.has(body.id)) {
        const bd = BUILD_DATA[body.templateId];
        const r = bd ? Math.max(bd.radius * getLinearScale(), 10) : undefined;
        createBodyMesh(body, scene, r);
      }
    }
  }, [bodies]);

  // --- Animation loop ---
  useEffect(() => {
    const loop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      const buildState = useBuildStore.getState();
      if (buildState.isRunning && dt > 0) {
        buildState.advanceSimulation(dt, 2);
        const collisions = detectCollisions(buildState.bodies, 2);
        if (collisions.length > 0) {
          for (const c of collisions) {
            const state = useBuildStore.getState();
            state.removeBody(c.bodyA.id);
            state.removeBody(c.bodyB.id);
            state.placeBody(c.mergedBody.templateId, c.mergedBody.position, c.mergedBody.velocity, c.mergedBody.mass);
          }
        }
      }

      const latestBodies = useBuildStore.getState().bodies;
      updateBodyMeshes(latestBodies, dt);

      const tm = trailManagerRef.current;
      if (tm) {
        tm.updateTrails(latestBodies);
      }

      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (scene && camera && renderer) {
        renderer.render(scene, camera);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // --- Interaction helpers ---
  const getRenderPos = useCallback((e: React.MouseEvent): THREE.Vector3 | null => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return null;
    return getPlacementPoint(e.nativeEvent, camera, canvas);
  }, []);

  const handlePlaceConfirm = useCallback((speed: number, angleDeg: number) => {
    const toolId = useUIStore.getState().selectedToolId;
    const clickPos = useUIStore.getState().clickPosPhysical;
    if (!toolId || !clickPos) return;

    const angleRad = (angleDeg * Math.PI) / 180;
    const px = clickPos[0];
    const py = clickPos[1];
    const pz = 0;
    const dist = Math.sqrt(px * px + py * py);

    let vel: [number, number, number] = [0, 0, 0];
    if (speed > 0 && dist > 1) {
      const tx = -py / dist;
      const ty = px / dist;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      vel = [
        speed * (cosA * tx + sinA * px / dist),
        speed * (cosA * ty + sinA * py / dist),
        0,
      ];
    }

    const data = BUILD_DATA[toolId];
    const buildState = useBuildStore.getState();
    buildState.placeBody(toolId, [px, py, pz], vel, data?.mass ?? 1e24);

    if (!buildState.isRunning) {
      buildState.startBuild();
    }

    const uiState = useUIStore.getState();
    if (uiState.showHint) {
      const hintedId = HINT_ORDER[uiState.hintIndex % HINT_ORDER.length];
      if (toolId === hintedId) useUIStore.getState().setHint(false);
    }

    useUIStore.getState().setSelectedTool(null);
    useUIStore.getState().setIsPlacing(false);
    useUIStore.getState().setClickPosPhysical(null);
    useUIStore.getState().setClickPosScreen(null);
  }, []);

  const handlePlaceCancel = useCallback(() => {
    useUIStore.getState().setIsPlacing(false);
    useUIStore.getState().setClickPosPhysical(null);
    useUIStore.getState().setClickPosScreen(null);
  }, []);

  // --- Mouse screen position for popups ---
  const [mouseScreenPos, setMouseScreenPos] = useState<[number, number] | null>(null);

  // --- Floating preview cleanup on tool deselect ---
  useEffect(() => {
    if (!selectedToolId || isPlacing) {
      const scene = sceneRef.current;
      if (scene) removeFloatingPreview(scene);
    }
  }, [selectedToolId, isPlacing]);

  const mousePhysicalPos = useUIStore(s => s.mousePhysicalPos);
  const MOUSE_OFFSET = 12;
  const showPreview = selectedToolId && !isPlacing && mouseScreenPos;
  const previewLeft = mouseScreenPos ? Math.min(mouseScreenPos[0] + MOUSE_OFFSET, (canvasRef.current?.clientWidth ?? 0) - 220) : 0;
  const previewTop = mouseScreenPos ? mouseScreenPos[1] + MOUSE_OFFSET : 0;

  const formatDist = (m: number): string => {
    if (m >= 1e12) return `${(m / 1.495978707e11).toFixed(2)} AU`;
    if (m >= 1e9) return `${(m / 1e9).toFixed(0)} 万 km`;
    return `${(m / 1e3).toFixed(0)} km`;
  };

  const MU = PHYSICAL_CONSTANTS.G * PHYSICAL_CONSTANTS.sunMass;

  const predOrbitSpeed = mousePhysicalPos
    ? Math.sqrt(MU / Math.max(
        Math.sqrt(mousePhysicalPos[0] ** 2 + mousePhysicalPos[1] ** 2), 1e3))
    : 0;

  const computeOrbitPrediction = () => {
    if (!mousePhysicalPos || !selectedToolId) return null;
    const r = Math.sqrt(mousePhysicalPos[0] ** 2 + mousePhysicalPos[1] ** 2);
    if (r < 1e3) return null;
    const data = BUILD_DATA[selectedToolId];
    const v0 = data?.orbitalSpeed ?? 0;
    if (v0 <= 0) return null;

    const eps = v0 * v0 / 2 - MU / r;
    if (eps >= 0) return { a: null, b: null, e: 0, r, atApoapsis: false };

    const a = -(MU / (2 * eps));
    const h2 = r * r * v0 * v0;
    const e2 = 1 - h2 / (MU * a);
    if (e2 < 0 || e2 >= 1) return { a: null, b: null, e: 0, r, atApoapsis: false };

    const e = Math.sqrt(e2);
    const b = a * Math.sqrt(1 - e2);
    return { a, b, e, r, atApoapsis: r > a };
  };

  const orbitPred = useMemo(computeOrbitPrediction, [mousePhysicalPos, selectedToolId]);

  const showPopup = isPlacing && clickPosScreen && useUIStore.getState().selectedToolId;
  const popupLeft = clickPosScreen ? Math.min(clickPosScreen[0] + MOUSE_OFFSET, (canvasRef.current?.clientWidth ?? 0) - 220) : 0;
  const popupTop = clickPosScreen ? clickPosScreen[1] + MOUSE_OFFSET : 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: selectedToolId ? 'crosshair' : 'default',
        }}
        onMouseMove={(e) => {
          if (!selectedToolId || isPlacing) {
            if (!selectedToolId) setMouseScreenPos(null);
            return;
          }
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            setMouseScreenPos([e.clientX - rect.left, e.clientY - rect.top]);
          }
          const point = getRenderPos(e);
          if (point) {
            const [physX, physY] = renderToPhysical([point.x, point.y, 0]);
            setMousePositions([physX, physY]);
            setPreviewPosition([point.x, point.y]);

            const scene = sceneRef.current;
            const data = selectedToolId ? BUILD_DATA[selectedToolId] : null;
            if (scene && data) {
              const renderRadius = Math.max(data.radius * getLinearScale(), 10);
              const color = DEFAULT_COLORS[selectedToolId] ?? 0x888888;
              createFloatingPreview(scene, point, renderRadius, color, selectedToolId);
            }
          }
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          if (isPlacing) return;
          if (selectedToolId) {
            e.stopPropagation();
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              setClickPosScreen([e.clientX - rect.left, e.clientY - rect.top]);
            }
            const point = getRenderPos(e);
            if (point) {
              const [physX, physY] = renderToPhysical([point.x, point.y, 0]);
              setClickPosPhysical([physX, physY]);
              setIsPlacing(true);
              setMouseScreenPos(null);
              const scene = sceneRef.current;
              if (scene) removeFloatingPreview(scene);
            }
            return;
          }
          // Body selection handled by touchInteraction.ts
        }}
        onMouseLeave={() => {
          setMouseScreenPos(null);
          const scene = sceneRef.current;
          if (scene) removeFloatingPreview(scene);
        }}
        onContextMenu={e => e.preventDefault()}
      />
      {showPreview && (
        <div
          className="placement-preview-popup"
          style={{ left: previewLeft, top: previewTop }}
        >
          <div className="preview-title">
            {BUILD_DATA[selectedToolId]?.name ?? selectedToolId}
          </div>
          <div className="preview-row">
            <span>距太阳</span>
            <span>{formatDist(Math.sqrt((mousePhysicalPos?.[0] ?? 0) ** 2 + (mousePhysicalPos?.[1] ?? 0) ** 2))}</span>
          </div>
          <div className="preview-row">
            <span>圆轨速度</span>
            <span>{(predOrbitSpeed / 1000).toFixed(1)} km/s</span>
          </div>
          <div className="preview-row">
            <span>默认速度</span>
            <span>{selectedToolId && BUILD_DATA[selectedToolId]?.orbitalSpeed ? (BUILD_DATA[selectedToolId]!.orbitalSpeed / 1000).toFixed(1) + ' km/s' : '-'}</span>
          </div>
          {orbitPred && (
            <div className="preview-row">
              <span>长半轴</span>
              <span>{orbitPred.a ? formatDist(orbitPred.a) : '-'}</span>
            </div>
          )}
          {orbitPred && (
            <div className="preview-row">
              <span>短半轴</span>
              <span>{orbitPred.b ? formatDist(orbitPred.b) : '-'}</span>
            </div>
          )}
          <div className="preview-hint">点击画布确定位置</div>
        </div>
      )}
      {showPopup && (
        <div
          className="placement-confirm-popup"
          style={{ left: popupLeft, top: popupTop }}
        >
          <VelocityInputForm
            templateId={useUIStore.getState().selectedToolId!}
            onConfirm={handlePlaceConfirm}
            onCancel={handlePlaceCancel}
          />
        </div>
      )}
    </div>
  );
}

export default BuilderCanvas;
