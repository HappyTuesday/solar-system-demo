import { useEffect, useRef, useCallback, useState } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { initScene, handleResize } from '../../rendering/setup';
import { createBodyMesh, updateBodyMeshes, removeBodyMesh, bodyMeshMap, visualRadius, displayOrbitRadius } from '../../rendering/bodies';
import { createReferencePlane, addOrbitRing, clearOrbitRings } from '../../rendering/grid';
import { getPlacementPoint, selectBodiesInRect, setBodyHighlight, createPreviewSphere, removePreviewSphere, updateVelocityArrow, updateGuideArrow, removeGuideArrow, cleanupGizmos, createFloatingPreview, removeFloatingPreview } from '../../rendering/interaction';
import { advanceSimulation, detectCollisions } from '../../engine/physics';
import { REAL_DATA, PHYSICAL_CONSTANTS, DRAG_CONFIG, HINT_ORDER } from '../../engine/constants';
import { setSharedCamera } from '../../rendering/cameraRef';
import type { SceneSetup } from '../../rendering/setup';
import * as THREE from 'three';
import './Canvas3D.css';

export default function Canvas3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setupRef = useRef<SceneSetup | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastTimerUpdateRef = useRef<number>(0);
  const selectionRef = useRef<{ start: [number, number]; end: [number, number] } | null>(null);
  const dragStartRef = useRef<THREE.Vector3 | null>(null);

  const bodies = useBuildStore(s => s.bodies);
  const isRunning = useBuildStore(s => s.isRunning);
  const startedAt = useBuildStore(s => s.startedAt);
  const removeBody = useBuildStore(s => s.removeBody);
  const placeBody = useBuildStore(s => s.placeBody);
  const advanceSim = useBuildStore(s => s.advanceSimulation);
  const updateBuildElapsed = useBuildStore(s => s.updateBuildElapsed);
  const startBuild = useBuildStore(s => s.startBuild);

  const selectedToolId = useUIStore(s => s.selectedToolId);
  const setSelectedTool = useUIStore(s => s.setSelectedTool);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);
  const isPlacing = useUIStore(s => s.isPlacing);
  const setIsPlacing = useUIStore(s => s.setIsPlacing);
  const showHint = useUIStore(s => s.showHint);
  const hintIndex = useUIStore(s => s.hintIndex);
  const setHint = useUIStore(s => s.setHint);
  const supervisionMode = useUIStore(s => s.supervisionMode);
  const setPreviewPosition = useUIStore(s => s.setPreviewPosition);
  const setPreviewSpeedStore = useUIStore(s => s.setPreviewSpeed);
  const previewSpeed = useUIStore(s => s.previewSpeed);

  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Cleanup floating preview when tool selection changes
  useEffect(() => {
    if (!selectedToolId && setupRef.current) {
      removeFloatingPreview(setupRef.current.scene);
    }
  }, [selectedToolId]);

  // Sync 3D bodies with store — runs whenever bodies change
  const syncBodies = useCallback(() => {
    if (!setupRef.current) return;
    const scene = setupRef.current.scene;
    const storeIds = new Set(bodies.map(b => b.id));
    for (const [id] of bodyMeshMap) {
      if (!storeIds.has(id)) removeBodyMesh(id, scene);
    }
    for (const body of bodies) {
      if (!bodyMeshMap.has(body.id)) createBodyMesh(body, scene);
    }
  }, [bodies]);

  // Dedicated effect to sync mesh state immediately
  useEffect(() => {
    syncBodies();
  }, [syncBodies]);

  // Animation loop
  useEffect(() => {
    if (!setupRef.current) return;
    const { scene, camera, renderer } = setupRef.current;

    const animate = (time: number) => {
      animFrameRef.current = requestAnimationFrame(animate);
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      handleResize(canvasRef.current!, renderer, camera);

      if (isRunning && bodies.length >= 2) {
        advanceSimulation(bodies, dt);
        advanceSim(dt * 100);
        const events = detectCollisions(bodies);
        for (const event of events) {
          removeBody(event.bodyA.id);
          removeBody(event.bodyB.id);
          placeBody(event.mergedBody.templateId, event.mergedBody.position, event.mergedBody.velocity, event.mergedBody.mass);
        }
      }

      if (startedAt && time - lastTimerUpdateRef.current > 1000) {
        updateBuildElapsed(Date.now() - startedAt);
        lastTimerUpdateRef.current = time;
      }

      updateBodyMeshes(bodies, dt);
      renderer.render(scene, camera);
    };

    lastTimeRef.current = performance.now();
    lastTimerUpdateRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isRunning, bodies, startedAt, syncBodies, advanceSim, removeBody, placeBody, updateBuildElapsed]);

  // Init Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = initScene(canvas);
    setupRef.current = setup;
    setSharedCamera(setup.camera);
    // Ensure camera matches actual canvas dimensions (layout may not be complete at mount)
    setTimeout(() => handleResize(canvasRef.current!, setup.renderer, setup.camera), 100);
    createReferencePlane(setup.scene, canvas.clientWidth, canvas.clientHeight);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      setSharedCamera(null);
      setup.renderer.dispose();
      setupRef.current = null;
    };
  }, []);

  // Auto-place sun when toolbar sun is clicked
  useEffect(() => {
    if (selectedToolId === 'sun' && !bodies.some(b => b.templateId === 'sun')) {
      const sunData = REAL_DATA.sun;
      placeBody('sun', [0, 0, 0], [0, 0, 0], REAL_DATA.sun.mass);
      startBuild();
      // 立即暂停，方便观察天体放置
      useBuildStore.getState().pauseBuild();
      const store = useBuildStore.getState();
      useHistoryStore.getState().saveCurrentRecord({
        id: store.id, createdAt: Date.now(), completedAt: null,
        status: 'building', score: null, buildTimeMs: null,
        snapshot: JSON.stringify(store.getSnapshot()),
      });
      useHistoryStore.getState().loadRecords();
      useHistoryStore.getState().setCurrentRecordId(store.id);
      setSelectedTool(null);
      setIsPlacing(false);
    }
  }, [selectedToolId, bodies, placeBody, startBuild, setSelectedTool, setIsPlacing]);

  // Hint system
  useEffect(() => {
    const setup = setupRef.current;
    if (!setup || !showHint) {
      clearOrbitRings(setup?.scene ?? new THREE.Scene());
      removeGuideArrow(setup?.scene ?? new THREE.Scene());
      return;
    }
    const targetId = HINT_ORDER[hintIndex % HINT_ORDER.length];
    if (!targetId || targetId === 'sun') return;
    const data = REAL_DATA[targetId];
    if (!data?.semiMajorAxis) return;

    const sun = bodies.find(b => b.templateId === 'sun');
    const sunPos = sun ? new THREE.Vector3(sun.position[0], sun.position[1], sun.position[2]) : new THREE.Vector3(0, 0, 0);

    const displayDist = displayOrbitRadius(data.semiMajorAxis);
    clearOrbitRings(setup.scene);
    addOrbitRing(setup.scene, displayDist, 0xffaa00);

    const suggestPos = new THREE.Vector3(displayDist, 0, 0).add(sunPos);
    if (data.orbitalSpeed) {
      const radialDir = new THREE.Vector3(suggestPos.x - sunPos.x, suggestPos.y - sunPos.y, 0).normalize();
      const tangentDir = new THREE.Vector3(-radialDir.y, radialDir.x, 0);
      const speedPx = (data.orbitalSpeed / 1000) * 0.2; // scale real speed to pixel drag
      const suggestTo = suggestPos.clone().add(tangentDir.clone().multiplyScalar(speedPx / DRAG_CONFIG.speedScale));
      updateGuideArrow(setup.scene, suggestPos, suggestTo, DRAG_CONFIG.guideArrowColor);
    }
    return () => {
      clearOrbitRings(setup.scene);
      removeGuideArrow(setup.scene);
    };
  }, [showHint, hintIndex, bodies]);

  // Mouse handlers
  const getCanvasPos = (e: React.MouseEvent): [number, number] => {
    return [e.clientX, e.clientY];
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const setup = setupRef.current;
    if (!setup) return;

    if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
      const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      if (!point) return;
      removeFloatingPreview(setup.scene);
      dragStartRef.current = point.clone();
      setIsPlacing(true);
      useBuildStore.getState().pauseBuild();

      const data = REAL_DATA[selectedToolId];
      if (data) {
        const DEFAULT_COLORS: Record<string, number> = {
          sun: 0xffdd00, mercury: 0xcccccc, venus: 0xffcc88, earth: 0x4488ff,
          mars: 0xff6644, jupiter: 0xffcc88, saturn: 0xffeecc,
          uranus: 0x88ccff, neptune: 0x4488ff, moon: 0xcccccc,
          io: 0xffcc44, europa: 0xddccbb, ganymede: 0xbbbbbb,
          callisto: 0x888888, titan: 0xffcc88, phobos: 0x998877, deimos: 0x887766,
        };
        const color = DEFAULT_COLORS[selectedToolId] ?? 0x4488ff;
        createPreviewSphere(setup.scene, point, visualRadius(selectedToolId), color);
      }
    } else if (!selectedToolId) {
      selectionRef.current = { start: getCanvasPos(e), end: getCanvasPos(e) };
    }
  }, [selectedToolId, isPlacing, setIsPlacing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const setup = setupRef.current;
    if (!setup) return;

    if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
      const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      if (point) {
        setPreviewPosition([point.x, point.y, point.z]);
        const data = REAL_DATA[selectedToolId];
        if (data) {
          const DEFAULT_COLORS: Record<string, number> = {
            sun: 0xffdd00, mercury: 0xcccccc, venus: 0xffcc88, earth: 0x4488ff,
            mars: 0xff6644, jupiter: 0xffcc88, saturn: 0xffeecc,
            uranus: 0x88ccff, neptune: 0x4488ff, moon: 0xcccccc,
            io: 0xffcc44, europa: 0xddccbb, ganymede: 0xbbbbbb,
            callisto: 0x888888, titan: 0xffcc88, phobos: 0x998877, deimos: 0x887766,
          };
          createFloatingPreview(setup.scene, point, visualRadius(selectedToolId), DEFAULT_COLORS[selectedToolId] ?? 0x4488ff, selectedToolId);
        }
      }
    } else if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
      const currentPoint = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      if (!currentPoint) return;
      const dir = new THREE.Vector3().subVectors(currentPoint, dragStartRef.current);
      const speed = Math.min(dir.length() * DRAG_CONFIG.speedScale, DRAG_CONFIG.maxSpeed);
      setPreviewSpeedStore(speed);
      if (dir.length() > 0.01) {
        updateVelocityArrow(setup.scene, dragStartRef.current, currentPoint, DRAG_CONFIG.arrowColor);
      }
    } else if (selectionRef.current?.start) {
      const currentPos = getCanvasPos(e);
      selectionRef.current.end = currentPos;
      const x = Math.min(selectionRef.current.start[0], currentPos[0]);
      const y = Math.min(selectionRef.current.start[1], currentPos[1]);
      const w = Math.abs(currentPos[0] - selectionRef.current.start[0]);
      const h = Math.abs(currentPos[1] - selectionRef.current.start[1]);
      setSelectionRect({ x, y, w, h });
    }
  }, [isPlacing, selectedToolId, setPreviewSpeedStore, setPreviewPosition]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const setup = setupRef.current;
    if (!setup) return;

    if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
      const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      let vel: [number, number, number] = [0, 0, 0];
      if (point) {
        const dir = new THREE.Vector3().subVectors(point, dragStartRef.current);
        const speed = Math.min(dir.length() * DRAG_CONFIG.speedScale, DRAG_CONFIG.maxSpeed);
        if (dir.length() > 0.01) {
          dir.normalize().multiplyScalar(speed);
          vel = [dir.x, dir.y, dir.z];
        }
      }
      const data = REAL_DATA[selectedToolId];
      const pos: [number, number, number] = [dragStartRef.current.x, dragStartRef.current.y, dragStartRef.current.z];
      placeBody(selectedToolId, pos, vel, data?.mass ?? 1e24);
      // useBuildStore.getState().resumeBuild(); // 暂时禁用运动

      if (showHint) {
        const hintedId = HINT_ORDER[hintIndex % HINT_ORDER.length];
        if (selectedToolId === hintedId) setHint(false);
      }

      cleanupGizmos(setup.scene);
      setSelectedTool(null);
      setIsPlacing(false);
      dragStartRef.current = null;
      setPreviewSpeedStore(0);
    } else if (selectionRef.current) {
      const start = selectionRef.current.start;
      const end = selectionRef.current.end;
      if (Math.abs(end[0] - start[0]) > 5 || Math.abs(end[1] - start[1]) > 5) {
        const ids = selectBodiesInRect(start, end, setup.camera, canvasRef.current!);
        setSelectedBodyIds(ids);
        setBodyHighlight(ids, true);
      } else {
        setSelectedBodyIds([]);
        setBodyHighlight(selectedBodyIds, false);
      }
      selectionRef.current = null;
      setSelectionRect(null);
    }
  }, [isPlacing, selectedToolId, placeBody, setIsPlacing, setSelectedTool, selectedBodyIds, setSelectedBodyIds, showHint, hintIndex, setHint, setPreviewSpeedStore]);

  return (
    <div className={`canvas-container ${selectedToolId && selectedToolId !== 'sun' ? 'crosshair' : ''}`}>
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
      {selectionRect && (
        <div className="selection-rect" style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h }} />
      )}
      {isPlacing && previewSpeed > 0 && (
        <div className="speed-label">
          {previewSpeed >= 1000 ? `${(previewSpeed / 1000).toFixed(1)} km/s` : `${previewSpeed.toFixed(0)} m/s`}
        </div>
      )}
    </div>
  );
}
