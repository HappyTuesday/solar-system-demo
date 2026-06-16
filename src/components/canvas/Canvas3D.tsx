import { useEffect, useRef, useCallback } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { initScene, handleResize } from '../../rendering/setup';
import { createBodyMesh, updateBodyMeshes, removeBodyMesh, bodyMeshMap } from '../../rendering/bodies';
import { createReferencePlane, addOrbitRing, clearOrbitRings } from '../../rendering/grid';
import { getPlacementPoint, setBodyHighlight, createPreviewSphere, removePreviewSphere, updateVelocityArrow, updateGuideArrow, removeGuideArrow, cleanupGizmos, createFloatingPreview, removeFloatingPreview } from '../../rendering/interaction';
import { TrailManager } from '../../rendering/trails';
import { advanceSimulation, detectCollisions, vec3Length } from '../../engine/physics';
import { REAL_DATA, DRAG_CONFIG, HINT_ORDER } from '../../engine/constants';
import { physicalRadiusToRender, physicalDistanceToRender, renderToPhysical, renderVelocityToPhysical, physicalVelocityToRender, physicalToRender } from '../../engine/coordinateTransform';
import { setSharedCamera, setSharedCanvas, setObservationTargetId, setCurrentLookAt, getCurrentLookAt } from '../../rendering/cameraRef';
import type { SceneSetup } from '../../rendering/setup';
import * as THREE from 'three';
import './Canvas3D.css';

export default function Canvas3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setupRef = useRef<SceneSetup | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastTimerUpdateRef = useRef<number>(0);
  const dragStartRef = useRef<THREE.Vector3 | null>(null);
  const trackingOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 100));
  const prevTargetIdRef = useRef<string | null>(null);
  const trailManagerRef = useRef<TrailManager | null>(null);

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
  const isPlacing = useUIStore(s => s.isPlacing);
  const setIsPlacing = useUIStore(s => s.setIsPlacing);
  const showHint = useUIStore(s => s.showHint);
  const hintIndex = useUIStore(s => s.hintIndex);
  const setHint = useUIStore(s => s.setHint);
  const supervisionMode = useUIStore(s => s.supervisionMode);
  const setPreviewPosition = useUIStore(s => s.setPreviewPosition);
  const setPreviewSpeedStore = useUIStore(s => s.setPreviewSpeed);
  const previewSpeed = useUIStore(s => s.previewSpeed);
  const showTrails = useUIStore(s => s.showTrails);
  const trailLength = useUIStore(s => s.trailLength);

  // Cleanup floating preview when tool selection changes
  useEffect(() => {
    if (!selectedToolId && setupRef.current) {
      removeFloatingPreview(setupRef.current.scene);
    }
  }, [selectedToolId]);

  // Sync 3D body highlight with selection
  useEffect(() => {
    setBodyHighlight(selectedBodyIds, true);
  }, [selectedBodyIds]);

  // Sync 3D bodies with store — runs whenever bodies change
  const syncBodies = useCallback(() => {
    if (!setupRef.current) return;
    const scene = setupRef.current.scene;
    const tm = trailManagerRef.current;
    const storeIds = new Set(bodies.map(b => b.id));
    for (const [id] of bodyMeshMap) {
      if (!storeIds.has(id)) {
        removeBodyMesh(id, scene);
        if (tm) tm.removeTrail(id);
      }
    }
    for (const body of bodies) {
      if (!bodyMeshMap.has(body.id)) createBodyMesh(body, scene);
    }
  }, [bodies]);

  // Dedicated effect to sync mesh state immediately
  useEffect(() => {
    syncBodies();
  }, [syncBodies]);

  useEffect(() => {
    if (trailManagerRef.current) {
      trailManagerRef.current.setVisible(showTrails);
    }
  }, [showTrails]);

  useEffect(() => {
    if (trailManagerRef.current) {
      trailManagerRef.current.setLengthProportion(trailLength);
    }
  }, [trailLength]);

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
        const timeScale = useBuildStore.getState().timeScale;
        const simDelta = advanceSimulation(bodies, dt, timeScale);
        advanceSim(simDelta);
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

      const currentShowTrails = useUIStore.getState().showTrails;
      if (currentShowTrails && trailManagerRef.current) {
        trailManagerRef.current.updateTrails(bodies);
      }

      // Camera tracking: center on observation target
      const targetId = useUIStore.getState().observationTargetId;
      if (targetId !== prevTargetIdRef.current) {
        prevTargetIdRef.current = targetId;
        const prevLookAt = getCurrentLookAt();
        trackingOffsetRef.current.set(
          camera.position.x - prevLookAt[0],
          camera.position.y - prevLookAt[1],
          camera.position.z - prevLookAt[2]
        );
      }

      if (targetId) {
        const targetBody = bodies.find(b => b.id === targetId);
        if (targetBody) {
          const rp = physicalToRender(targetBody.position);
          camera.position.set(
            rp[0] + trackingOffsetRef.current.x,
            rp[1] + trackingOffsetRef.current.y,
            rp[2] + trackingOffsetRef.current.z
          );
          camera.lookAt(new THREE.Vector3(rp[0], rp[1], rp[2]));
          setCurrentLookAt(rp);
          setObservationTargetId(targetId);
        } else {
          useUIStore.getState().setObservationTargetId(null);
          setObservationTargetId(null);
          setCurrentLookAt([0, 0, 0]);
        }
      } else {
        setCurrentLookAt([0, 0, 0]);
      }

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
    setSharedCanvas(canvasRef.current);
    // Ensure camera matches actual canvas dimensions (layout may not be complete at mount)
    setTimeout(() => handleResize(canvasRef.current!, setup.renderer, setup.camera), 100);
    createReferencePlane(setup.scene, canvas.clientWidth, canvas.clientHeight);
    const trailManager = new TrailManager(setup.scene);
    trailManagerRef.current = trailManager;
    return () => {
      trailManager.dispose();
      trailManagerRef.current = null;
      cancelAnimationFrame(animFrameRef.current);
      setSharedCamera(null);
      setSharedCanvas(null);
      setupRef.current = null;
    };
  }, []);

  // Auto-place sun when toolbar sun is clicked
  useEffect(() => {
    if (selectedToolId === 'sun' && !bodies.some(b => b.templateId === 'sun')) {
      const sunData = REAL_DATA.sun;
      placeBody('sun', [0, 0, 0], [0, 0, 0], sunData.mass);
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

    // 卫星的提示环应以其母体行星为圆心
    let centerPos = sunPos;
    if (data.type === 'moon' && data.parentId) {
      const parent = bodies.find(b => b.templateId === data.parentId);
      if (parent) {
        centerPos = new THREE.Vector3(parent.position[0], parent.position[1], parent.position[2]);
      }
    }

    const displayDist = physicalDistanceToRender(data.semiMajorAxis);
    clearOrbitRings(setup.scene);
    addOrbitRing(setup.scene, displayDist, 0xffaa00, centerPos);

    const suggestPos = new THREE.Vector3(displayDist, 0, 0).add(centerPos);
    if (data.orbitalSpeed) {
      const radialDir = new THREE.Vector3(suggestPos.x - centerPos.x, suggestPos.y - centerPos.y, 0).normalize();
      const tangentDir = new THREE.Vector3(-radialDir.y, radialDir.x, 0);
      // Convert physical orbital velocity to render speed for guide arrow length
      const pP_suggest: [number, number, number] = renderToPhysical([suggestPos.x - centerPos.x, suggestPos.y - centerPos.y, (suggestPos.z - centerPos.z)]);
      const vP_tangent: [number, number, number] = [tangentDir.x * data.orbitalSpeed, tangentDir.y * data.orbitalSpeed, 0];
      const vR_guide = physicalVelocityToRender(vP_tangent, pP_suggest);
      const dragLength = vec3Length(vR_guide) / DRAG_CONFIG.speedScale;
      const suggestTo = suggestPos.clone().add(tangentDir.clone().multiplyScalar(dragLength));
      updateGuideArrow(setup.scene, suggestPos, suggestTo, DRAG_CONFIG.guideArrowColor);
    }
    return () => {
      clearOrbitRings(setup.scene);
      removeGuideArrow(setup.scene);
    };
  }, [showHint, hintIndex, bodies]);

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
        createPreviewSphere(setup.scene, point, physicalRadiusToRender(data.radius, selectedToolId === 'sun'), color);
      }
    }
  }, [selectedToolId, isPlacing, setIsPlacing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const setup = setupRef.current;
    if (!setup) return;

    // Update mouse coordinates for CoordinateDisplay
    const canvasPos: [number, number] = [e.clientX, e.clientY];
    const mousePoint = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
    if (mousePoint) {
      const renderPos: [number, number, number] = [mousePoint.x, mousePoint.y, mousePoint.z];
      const physMousePos = renderToPhysical(renderPos);
      useUIStore.getState().setMousePositions(canvasPos, renderPos, physMousePos);
    } else {
      useUIStore.getState().setMousePositions(canvasPos, null, null);
    }

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
          createFloatingPreview(setup.scene, point, physicalRadiusToRender(data.radius, selectedToolId === 'sun'), DEFAULT_COLORS[selectedToolId] ?? 0x4488ff, selectedToolId);
        }
      }
    } else if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
      const currentPoint = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      if (!currentPoint) return;
      const dir = new THREE.Vector3().subVectors(currentPoint, dragStartRef.current);
      if (dir.length() > 0.01) {
        // Convert render drag to physical velocity for display
        const physPos = renderToPhysical([dragStartRef.current.x, dragStartRef.current.y, dragStartRef.current.z]);
        const vR: [number, number, number] = [dir.x * DRAG_CONFIG.speedScale, dir.y * DRAG_CONFIG.speedScale, dir.z * DRAG_CONFIG.speedScale];
        const vP = renderVelocityToPhysical(vR, physPos);
        const physSpeed = vec3Length(vP);
        const cappedSpeed = Math.min(physSpeed, DRAG_CONFIG.maxSpeed);
        setPreviewSpeedStore(cappedSpeed);
        updateVelocityArrow(setup.scene, dragStartRef.current, currentPoint, DRAG_CONFIG.arrowColor);
      } else {
        setPreviewSpeedStore(0);
      }
    }
  }, [isPlacing, selectedToolId, setPreviewSpeedStore, setPreviewPosition]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const setup = setupRef.current;
    if (!setup) return;

    if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
      const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
      // Convert render position to physical position
      const physPos: [number, number, number] = renderToPhysical([
        dragStartRef.current.x,
        dragStartRef.current.y,
        dragStartRef.current.z
      ]);
      // Convert render velocity to physical velocity
      let vel: [number, number, number] = [0, 0, 0];
      if (point) {
        const dir = new THREE.Vector3().subVectors(point, dragStartRef.current);
        if (dir.length() > 0.01) {
          const vR: [number, number, number] = [dir.x * DRAG_CONFIG.speedScale, dir.y * DRAG_CONFIG.speedScale, dir.z * DRAG_CONFIG.speedScale];
          let vP = renderVelocityToPhysical(vR, physPos);
          const physSpeed = vec3Length(vP);
          if (physSpeed > DRAG_CONFIG.maxSpeed) {
            const cappedMag = DRAG_CONFIG.maxSpeed / physSpeed;
            vP = [vP[0] * cappedMag, vP[1] * cappedMag, vP[2] * cappedMag];
          }
          vel = vP;
        }
      }
      const data = REAL_DATA[selectedToolId];
      placeBody(selectedToolId, physPos, vel, data?.mass ?? 1e24);
      useBuildStore.getState().resumeBuild();

      if (showHint) {
        const hintedId = HINT_ORDER[hintIndex % HINT_ORDER.length];
        if (selectedToolId === hintedId) setHint(false);
      }

      cleanupGizmos(setup.scene);
      setSelectedTool(null);
      setIsPlacing(false);
      dragStartRef.current = null;
      setPreviewSpeedStore(0);
    }
  }, [isPlacing, selectedToolId, placeBody, setIsPlacing, setSelectedTool, showHint, hintIndex, setHint, setPreviewSpeedStore]);

  return (
    <div className={`canvas-container ${selectedToolId && selectedToolId !== 'sun' ? 'crosshair' : ''}`}>
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
      {isPlacing && previewSpeed > 0 && (
        <div className="speed-label">
          {previewSpeed >= 1000 ? `${(previewSpeed / 1000).toFixed(1)} km/s` : `${previewSpeed.toFixed(0)} m/s`}
        </div>
      )}
    </div>
  );
}
