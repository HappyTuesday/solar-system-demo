import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA, MU_SUN_AU as MU_SUN, AU_TO_KM } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import { predictTrajectory, applyThrustInBodyFrame, type BodyInfo } from '../../engine/spaceship';
import type { SpaceshipState } from '../../types';

const NORMAL_W = 212;
const NORMAL_H = 130;
const ENLARGED_W = 600;
const ENLARGED_H = 380;
const ENLARGE_ENABLED = false;
const PADDING = 12;
const VIEW_RANGE_AU = 0.1;
const SUN_RADIUS_PX = 4;
const ZOOM_THRESHOLD_AU = 0.005;
const ZOOM_BODY_RADIUS_PX = 8;
const ZOOM_LERP = 0.08;

const ALL_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

const BODY_COLORS: Record<string, string> = {
  sun: '#ffaa00',
  mercury: '#aaaaaa', venus: '#e8c87a', earth: '#4488ff', mars: '#e86440',
  jupiter: '#d4b896', saturn: '#e8d5a3', uranus: '#88ccdd', neptune: '#4466ff',
};

function computeBodyPos2D(templateId: string, jd: number): { x: number; y: number } | null {
  const state = computeBodyState2D(templateId, jd);
  return state ? { x: state.x, y: state.y } : null;
}

function computeBodyState2D(templateId: string, jd: number): { x: number; y: number; vx: number; vy: number } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    x: sv.position[0],
    y: sv.position[1],
    vx: sv.velocity[0],
    vy: sv.velocity[1],
  };
}

function computeBodyState3D(templateId: string, jd: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN);
  return {
    x: sv.position[0],
    y: sv.position[1],
    z: sv.position[2],
    vx: sv.velocity[0],
    vy: sv.velocity[1],
    vz: sv.velocity[2],
  };
}

interface BodyDrawInfo {
  id: string;
  color: string;
  sx: number;
  sy: number;
  distance: number;
  inView: boolean;
}

function drawDirectionArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.5, -size * 0.5);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.5, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function drawSpaceship(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, thrustPercent: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const s = size;
  const flicker = thrustPercent > 0 ? 0.7 + 0.3 * Math.sin(performance.now() * 0.02) : 0;
  const flameLen = thrustPercent / 100 * s * 1.8 * flicker;

  // Engine exhaust glow (always visible, subtle)
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.15);
  ctx.lineTo(-s * 1.2, 0);
  ctx.lineTo(-s * 0.5, s * 0.15);
  ctx.closePath();
  const exhGrad = ctx.createLinearGradient(-s * 0.5, 0, -s * 1.2, 0);
  exhGrad.addColorStop(0, thrustPercent > 0 ? 'rgba(0, 240, 160, 0.6)' : 'rgba(0, 180, 140, 0.3)');
  exhGrad.addColorStop(1, 'rgba(0, 220, 180, 0)');
  ctx.fillStyle = exhGrad;
  ctx.fill();

  // Two engine flames when thrusting
  if (thrustPercent > 0 && flameLen > 0.1) {
    for (const offsetY of [-s * 0.12, s * 0.12]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, offsetY - s * 0.08);
      ctx.lineTo(-s * 0.45 - flameLen, offsetY);
      ctx.lineTo(-s * 0.45, offsetY + s * 0.08);
      ctx.closePath();
      const flameGrad = ctx.createLinearGradient(-s * 0.45, 0, -s * 0.45 - flameLen, 0);
      flameGrad.addColorStop(0, '#ffaa33');
      flameGrad.addColorStop(0.5, '#ff6600');
      flameGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = flameGrad;
      ctx.fill();
    }
  }

  // Main body: sharp delta shape
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.15, -s * 0.55);
  ctx.lineTo(-s * 0.5, -s * 0.25);
  ctx.lineTo(-s * 0.5, s * 0.25);
  ctx.lineTo(-s * 0.15, s * 0.55);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(-s * 0.5, 0, s, 0);
  bodyGrad.addColorStop(0, '#003355');
  bodyGrad.addColorStop(0.5, '#0077bb');
  bodyGrad.addColorStop(1, '#88ddff');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(100, 220, 255, 0.6)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Cockpit highlight
  ctx.beginPath();
  ctx.arc(s * 0.35, 0, s * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(180, 240, 255, 0.8)';
  ctx.fill();

  ctx.restore();
}

function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const trailRef = useRef<[number, number][]>([]);
  const wasZoomedRef = useRef(false);
  const [enlarged, setEnlarged] = useState(false);
  const [size, setSize] = useState({ w: NORMAL_W, h: NORMAL_H });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || enlarged) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rw = Math.floor(entry.contentRect.width);
        const rh = Math.floor(entry.contentRect.height);
        if (rw > 0 && rh > 0) {
          setSize({ w: rw, h: rh });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [enlarged]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    if (!ENLARGE_ENABLED) return;
    e.stopPropagation();
    setEnlarged(prev => !prev);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let smoothViewRange = VIEW_RANGE_AU;
    let running = true;

    const draw = () => {
      ctx.save();
      ctx.scale(2, 2);
      const sp = useSpaceshipStore.getState();
      const jd = julianDate(sp.simulatedTime);
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      const cx = cw / 2;
      const cy = ch / 2;
      const usableW = cw - PADDING * 2;
      const usableH = ch - PADDING * 2;
      const usable = Math.min(usableW, usableH);

      let nearestDistAU = Infinity;
      let nearestId = '';
      let nearestX = 0;
      let nearestY = 0;
      for (const id of ALL_IDS) {
        if (id === 'sun') {
          const dx2 = sp.position[0] ** 2 + sp.position[1] ** 2;
          const dist = Math.sqrt(dx2);
          if (dist < nearestDistAU) { nearestDistAU = dist; nearestId = id; nearestX = 0; nearestY = 0; }
        } else {
          const state2d = computeBodyState2D(id, jd);
          if (!state2d) continue;
          const dx = state2d.x - sp.position[0];
          const dy = state2d.y - sp.position[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDistAU) { nearestDistAU = dist; nearestId = id; nearestX = state2d.x; nearestY = state2d.y; }
        }
      }

      let targetViewRange = VIEW_RANGE_AU;
      let isZoomed = false;
      if (nearestDistAU < ZOOM_THRESHOLD_AU && nearestDistAU > 1e-12) {
        targetViewRange = nearestDistAU * 2.5;
        isZoomed = true;
      }

      if (isZoomed !== wasZoomedRef.current) {
        trailRef.current = [];
        wasZoomedRef.current = isZoomed;
      }

      smoothViewRange += (targetViewRange - smoothViewRange) * ZOOM_LERP;
      const viewRange = smoothViewRange;

      const scale = usable / (2 * viewRange);
      const anchorX = isZoomed ? nearestX : sp.position[0];
      const anchorY = isZoomed ? nearestY : sp.position[1];

      // Adaptive grid & scale bar unit
      const AU_TO_KM = 1.496e8;
      const useKm = viewRange < 0.001;
      const viewRangeDisplay = viewRange * (useKm ? AU_TO_KM : 1);

      const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      const targetStepDisplay = viewRangeDisplay / 6;
      let gridStepDisplay = niceSteps[niceSteps.length - 1];
      for (const s of niceSteps) {
        if (s >= targetStepDisplay) { gridStepDisplay = s; break; }
      }
      const gridStepAU = gridStepDisplay / (useKm ? AU_TO_KM : 1);
      const gridStepPx = gridStepAU * scale;

      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, cw, ch);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 0.5;
      const gridStep = gridStepPx;
      for (let gx = cx % gridStep; gx < cw; gx += gridStep) {
        ctx.beginPath();
        ctx.moveTo(gx, PADDING);
        ctx.lineTo(gx, ch - PADDING);
        ctx.stroke();
      }
      for (let gy = cy % gridStep; gy < ch; gy += gridStep) {
        ctx.beginPath();
        ctx.moveTo(PADDING, gy);
        ctx.lineTo(cw - PADDING, gy);
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = 'rgba(0, 180, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING, PADDING, usableW, usableH);

      // Compute all body screen positions (relative to anchor)
      const bodies: BodyDrawInfo[] = [];
      let shipSx = cx;
      let shipSy = cy;
      for (const id of ALL_IDS) {
        if (id === 'sun') {
          const dx = 0 - anchorX;
          const dy = 0 - anchorY;
          const sx = cx + dx * scale;
          const sy = cy - dy * scale;
          const distPx = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
          bodies.push({
            id, color: BODY_COLORS[id],
            sx, sy, distance: distPx / (scale || 1),
            inView: sx > PADDING && sx < cw - PADDING && sy > PADDING && sy < ch - PADDING,
          });
        } else {
          const pos2d = computeBodyPos2D(id, jd);
          if (!pos2d) continue;
          const dx = pos2d.x - anchorX;
          const dy = pos2d.y - anchorY;
          const sx = cx + dx * scale;
          const sy = cy - dy * scale;
          const distPx = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
          bodies.push({
            id, color: BODY_COLORS[id] || '#888888',
            sx, sy, distance: distPx / (scale || 1),
            inView: sx > PADDING && sx < cw - PADDING && sy > PADDING && sy < ch - PADDING,
          });
        }
      }

      // Ship screen position (relative to anchor)
      {
        const dx = sp.position[0] - anchorX;
        const dy = sp.position[1] - anchorY;
        shipSx = cx + dx * scale;
        shipSy = cy - dy * scale;
      }

      // --- Motion trail ---
      {
        const trail = trailRef.current;
        if (isZoomed) {
          trail.push([sp.position[0] - nearestX, sp.position[1] - nearestY]);
        } else {
          trail.push([sp.position[0], sp.position[1]]);
        }
        const maxTrail = 500;
        while (trail.length > maxTrail) trail.shift();

        if (trail.length > 1) {
          ctx.save();
          const segmentCount = 8;
          const pointsPerSegment = Math.ceil((trail.length - 1) / segmentCount);
          for (let seg = 0; seg < segmentCount; seg++) {
            const start = seg * pointsPerSegment;
            const end = Math.min(start + pointsPerSegment + 1, trail.length);
            if (start >= trail.length - 1) break;

            const alpha = 0.35 * (seg + 1) / segmentCount;
            if (alpha <= 0) continue;

            ctx.beginPath();
            let first = true;
            for (let i = start; i < end; i++) {
              let sx: number;
              let sy: number;
              if (isZoomed) {
                sx = cx + trail[i][0] * scale;
                sy = cy - trail[i][1] * scale;
              } else {
                const dx = trail[i][0] - anchorX;
                const dy = trail[i][1] - anchorY;
                sx = cx + dx * scale;
                sy = cy - dy * scale;
              }
              if (first) { ctx.moveTo(sx, sy); first = false; }
              else { ctx.lineTo(sx, sy); }
            }
            ctx.strokeStyle = `rgba(0, 180, 255, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // --- Velocity direction arrow ---
      if (!sp.exploded) {
        let vx = sp.velocity[0];
        let vy = sp.velocity[1];
        if (isZoomed && nearestId) {
          const nbState = nearestId === 'sun'
            ? { vx: 0, vy: 0 }
            : computeBodyState2D(nearestId, jd);
          if (nbState) {
            vx -= nbState.vx;
            vy -= nbState.vy;
          }
        }
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 1e-9) {
          const nx = vx / speed;
          const ny = vy / speed;
          const gap = 8;
          const lineLen = 25;
          const startX = shipSx + nx * gap;
          const startY = shipSy - ny * gap;
          const endX = shipSx + nx * lineLen;
          const endY = shipSy - ny * lineLen;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = 'rgba(0, 255, 128, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          const arrowAngle = Math.atan2(-vy, vx);
          ctx.fillStyle = 'rgba(0, 255, 128, 0.6)';
          drawDirectionArrow(ctx, endX, endY, arrowAngle, 5);
        }
      }

      // --- Prediction trajectory ---
      if (!sp.exploded) {
        const worldThrust = applyThrustInBodyFrame(
          sp.thrust[0], sp.thrust[1], sp.thrust[2],
          sp.thrustMagnitude, sp.direction,
        );

        const predShip: SpaceshipState = {
          position: sp.position,
          velocity: sp.velocity,
          direction: sp.direction,
          thrust: worldThrust,
          thrustMagnitude: sp.thrustMagnitude,
          exploded: false,
        };

        const bodyStates3D: { pos: [number, number, number]; vel: [number, number, number]; mass: number }[] = [];
        for (const id of ALL_IDS) {
          const data = REAL_DATA[id];
          if (!data) continue;
          if (id === 'sun') {
            bodyStates3D.push({ pos: [0, 0, 0], vel: [0, 0, 0], mass: data.mass });
          } else {
            const s3d = computeBodyState3D(id, jd);
            if (s3d) {
              bodyStates3D.push({ pos: [s3d.x, s3d.y, s3d.z], vel: [s3d.vx, s3d.vy, s3d.vz], mass: data.mass });
            }
          }
        }

        const getBodiesPred = (tOffset: number): BodyInfo[] => {
          return bodyStates3D.map(b => ({
            id: '',
            position: [
              b.pos[0] + b.vel[0] * tOffset,
              b.pos[1] + b.vel[1] * tOffset,
              b.pos[2] + b.vel[2] * tOffset,
            ],
            mass: b.mass,
            radius: 0,
          }));
        };

        const doPrograde = sp.attitudeMode === 'prograde' && sp.thrustMagnitude > 0;
        const bfThrust = sp.thrust;
        const bfMag = sp.thrustMagnitude;

        const onStep = doPrograde ? (ship: SpaceshipState) => {
          const speed = Math.sqrt(
            ship.velocity[0] ** 2 + ship.velocity[1] ** 2 + ship.velocity[2] ** 2,
          );
          if (speed > 1e-15) {
            ship.direction = [ship.velocity[0] / speed, ship.velocity[1] / speed, ship.velocity[2] / speed];
            ship.thrust = applyThrustInBodyFrame(
              bfThrust[0], bfThrust[1], bfThrust[2],
              bfMag, ship.direction,
            );
          }
        } : undefined;

        const predDt = 1.0;
        const predSteps = 200;
        const trajectory = predictTrajectory(predShip, getBodiesPred, predDt, predSteps, onStep);

        const predBodyIdx = ALL_IDS.indexOf(nearestId);
        const predBodyState = isZoomed && predBodyIdx >= 0 && predBodyIdx < bodyStates3D.length
          ? bodyStates3D[predBodyIdx]
          : null;

        ctx.save();
        const segmentCount = 10;
        const pointsPerSegment = Math.ceil(trajectory.length / segmentCount);
        for (let seg = 0; seg < segmentCount; seg++) {
          const startIdx = seg * pointsPerSegment;
          const endIdx = Math.min(startIdx + pointsPerSegment, trajectory.length);
          if (startIdx >= trajectory.length) break;

          const alpha = 0.3 * (1 - seg / segmentCount);
          if (alpha <= 0) continue;

          ctx.beginPath();
          let first = true;
          for (let i = startIdx; i < endIdx; i++) {
            const pt = trajectory[i];
            let sx: number;
            let sy: number;
            if (predBodyState) {
              const t = i * predDt;
              const bodyX = predBodyState.pos[0] + predBodyState.vel[0] * t;
              const bodyY = predBodyState.pos[1] + predBodyState.vel[1] * t;
              sx = cx + (pt[0] - bodyX) * scale;
              sy = cy - (pt[1] - bodyY) * scale;
            } else {
              const dx = pt[0] - anchorX;
              const dy = pt[1] - anchorY;
              sx = cx + dx * scale;
              sy = cy - dy * scale;
            }
            if (first) { ctx.moveTo(sx, sy); first = false; }
            else { ctx.lineTo(sx, sy); }
          }
          ctx.strokeStyle = `rgba(0, 255, 128, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // --- Navigation orbit lines ---
      const navPlan = useSpaceshipStore.getState().navigationPlan;
      if (navPlan && navPlan.phases.length > 0) {
        const navActivePhase = useSpaceshipStore.getState().activePhaseIndex;
        if (navActivePhase >= 0 && navActivePhase < navPlan.phases.length) {
          const phase = navPlan.phases[navActivePhase];

          // Green dashed: active phase target navigation orbit
          const navOrbitAU = phase.targetOrbit.semiMajorAxis;
          const navEcc = phase.targetOrbit.eccentricity;
          const navAPx = navOrbitAU * scale;

          if (navAPx > 0.5 && navAPx < usable * 5) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();

            const b = navAPx * Math.sqrt(1 - navEcc * navEcc);
            for (let i = 0; i <= 128; i++) {
              const angle = (i / 128) * Math.PI * 2;
              const ox = cx + Math.cos(angle) * navAPx;
              const oy = cy - Math.sin(angle) * b;
              if (i === 0) ctx.moveTo(ox, oy);
              else ctx.lineTo(ox, oy);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }

        // Red dashed: destination body's orbital path
        const destData = REAL_DATA[navPlan.destinationId];
        if (destData && destData.semiMajorAxis && destData.orbital && navPlan.destinationId !== 'sun') {
          const destAU = destData.semiMajorAxis;
          const destPx = destAU * scale;
          const destEcc = destData.orbital.eccentricity;

          if (destPx > 0.5 && destPx < usable * 5) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();

            const bDest = destPx * Math.sqrt(1 - destEcc * destEcc);
            for (let i = 0; i <= 128; i++) {
              const angle = (i / 128) * Math.PI * 2;
              const ox = cx + Math.cos(angle) * destPx;
              const oy = cy - Math.sin(angle) * bDest;
              if (i === 0) ctx.moveTo(ox, oy);
              else ctx.lineTo(ox, oy);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      }

      // --- Blue dashed: expected orbit for current sub-step ---
      const navPlanExpected = useSpaceshipStore.getState().navigationPlan;
      if (navPlanExpected && navPlanExpected.phases.length > 0) {
        const expectedActivePhaseIdx = useSpaceshipStore.getState().activePhaseIndex;
        if (expectedActivePhaseIdx >= 0 && expectedActivePhaseIdx < navPlanExpected.phases.length) {
          const expectedPhase = navPlanExpected.phases[expectedActivePhaseIdx];
          const aTarget = REAL_DATA[navPlanExpected.destinationId]?.semiMajorAxis ?? 0;
          if (aTarget > 0) {
            const expAPx = expectedPhase.targetOrbit.semiMajorAxis * scale;
            if (expAPx > 0.5 && expAPx < usable * 5) {
                  ctx.save();
                  ctx.strokeStyle = 'rgba(68, 136, 255, 0.5)';
                  ctx.lineWidth = 1;
                  ctx.setLineDash([4, 3]);
                  ctx.beginPath();
                  const bExp = expAPx * Math.sqrt(1 - expectedPhase.targetOrbit.eccentricity * expectedPhase.targetOrbit.eccentricity);
                  for (let i = 0; i <= 128; i++) {
                    const angle = (i / 128) * Math.PI * 2;
                    const ox = cx + Math.cos(angle) * expAPx;
                    const oy = cy - Math.sin(angle) * bExp;
                    if (i === 0) ctx.moveTo(ox, oy);
                    else ctx.lineTo(ox, oy);
                  }
                  ctx.stroke();
                  ctx.setLineDash([]);
                  ctx.restore();
              }
            }
        }
      }

      // Blue: current orbit around nearest body (use nearestDistAU as radius)
      if (isZoomed && nearestDistAU > 1e-12) {
        const orbitRadiusPx = nearestDistAU * scale;
        if (orbitRadiusPx > 2 && orbitRadiusPx < usable * 3) {
          ctx.save();
          ctx.strokeStyle = 'rgba(68, 136, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(cx, cy, orbitRadiusPx, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw bodies in view
      for (const b of bodies) {
        if (!b.inView) continue;
        if (b.id === 'sun') {
          const sunGrad = ctx.createRadialGradient(b.sx, b.sy, 1, b.sx, b.sy, SUN_RADIUS_PX);
          sunGrad.addColorStop(0, '#ffdd00');
          sunGrad.addColorStop(1, '#ff6600');
          ctx.fillStyle = sunGrad;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, SUN_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
        } else if (isZoomed && b.id === nearestId) {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, ZOOM_BODY_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.sx, b.sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const edgeAnchorX = cx;
      const edgeAnchorY = cy;

      // Draw edge indicators for bodies outside view
      for (const b of bodies) {
        if (b.inView) continue;
        const dx = b.sx - edgeAnchorX;
        const dy = b.sy - edgeAnchorY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) continue;
        const ndx = dx / dist;
        const ndy = dy / dist;

        let edgeX = cx;
        let edgeY = cy;
        const hw = usableW / 2;
        const hh = usableH / 2;

        if (Math.abs(ndx) * hh > Math.abs(ndy) * hw) {
          edgeX = ndx > 0 ? cx + hw : cx - hw;
          edgeY = cy + ndy * (hw / Math.abs(ndx));
        } else {
          edgeY = ndy > 0 ? cy + hh : cy - hh;
          edgeX = cx + ndx * (hh / Math.abs(ndy));
        }

        edgeX = Math.max(PADDING, Math.min(cw - PADDING, edgeX));
        edgeY = Math.max(PADDING, Math.min(ch - PADDING, edgeY));

        const angle = Math.atan2(ndy, ndx);

        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(edgeX, edgeY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.6;
        drawDirectionArrow(ctx, edgeX, edgeY, angle, 4);
        ctx.globalAlpha = 1;
      }

      // Pulse glow on target body (skip when zoomed into orbiting body)
      if (sp.targetBodyId && !(isZoomed && nearestId === sp.targetBodyId)) {
        const targetBody = bodies.find(b => b.id === sp.targetBodyId);
        if (targetBody && targetBody.inView) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
          const alpha = 0.1 + 0.4 * pulse;
          for (let ring = 0; ring < 3; ring++) {
            const radius = (targetBody.id === 'sun' ? SUN_RADIUS_PX : 2.5) + (ring + 1) * 4;
            ctx.beginPath();
            ctx.arc(targetBody.sx, targetBody.sy, radius, 0, Math.PI * 2);
            const ringAlpha = alpha * (1 - ring * 0.3);
            ctx.strokeStyle = hexToRgba(targetBody.color, ringAlpha);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else if (targetBody) {
          const dx = targetBody.sx - edgeAnchorX;
          const dy = targetBody.sy - edgeAnchorY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.001) {
            const ndx = dx / dist;
            const ndy = dy / dist;
            const hw = usableW / 2;
            const hh = usableH / 2;
            let edgeX: number;
            let edgeY: number;
            if (Math.abs(ndx) * hh > Math.abs(ndy) * hw) {
              edgeX = ndx > 0 ? cx + hw : cx - hw;
              edgeY = cy + ndy * (hw / Math.abs(ndx));
            } else {
              edgeY = ndy > 0 ? cy + hh : cy - hh;
              edgeX = cx + ndx * (hh / Math.abs(ndy));
            }
            edgeX = Math.max(PADDING, Math.min(cw - PADDING, edgeX));
            edgeY = Math.max(PADDING, Math.min(ch - PADDING, edgeY));

            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
            const alpha = 0.1 + 0.4 * pulse;
            for (let ring = 0; ring < 3; ring++) {
              const radius = 2.5 + (ring + 1) * 4;
              ctx.beginPath();
              ctx.arc(edgeX, edgeY, radius, 0, Math.PI * 2);
              const ringAlpha = alpha * (1 - ring * 0.3);
              ctx.strokeStyle = hexToRgba(targetBody.color, ringAlpha);
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }

      // Spaceship — use ship heading direction
      const shipAngle = Math.atan2(sp.direction[1], sp.direction[0]);

      // Direction line
      const dirLen = isZoomed ? 10 : 14;
      ctx.beginPath();
      ctx.moveTo(shipSx, shipSy);
      ctx.lineTo(shipSx + Math.cos(shipAngle) * dirLen, shipSy - Math.sin(shipAngle) * dirLen);
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spaceship
      ctx.fillStyle = '#00b8ff';
      drawSpaceship(ctx, shipSx, shipSy, -shipAngle, isZoomed ? 10 : 12, sp.thrustMagnitude);

      // Scale indicator
      const displayUnit = useKm ? 'km' : 'AU';
      const scaleBarPx = gridStepPx;
      const scaleBarDisplay = gridStepDisplay;
      const barX = cw - PADDING - scaleBarPx;
      const barY = ch - PADDING - 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX, barY);
      ctx.lineTo(barX + scaleBarPx, barY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(barX, barY - 3);
      ctx.lineTo(barX, barY + 3);
      ctx.moveTo(barX + scaleBarPx, barY - 3);
      ctx.lineTo(barX + scaleBarPx, barY + 3);
      ctx.stroke();
      ctx.fillStyle = '#556677';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const scaleText = useKm ? `${scaleBarDisplay} km` : `${scaleBarDisplay} AU`;
      ctx.fillText(scaleText, barX + scaleBarPx / 2, barY - 5);

      // Legend
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334455';
      const legendText = isZoomed
        ? `▲ ${REAL_DATA[nearestId]?.name || '天体'} · 绕飞视图`
        : '▲ 飞船 · 俯视图';
      ctx.fillText(legendText, 4, ch - 4);

      // --- Legend at bottom (only when navigation plan exists) ---
      const navPlanLegend = useSpaceshipStore.getState().navigationPlan;
      if (navPlanLegend) {
        ctx.save();
        ctx.fillStyle = '#445566';
        ctx.font = '7px monospace';
        ctx.textAlign = 'left';
        const legendY = ch - 6;

        // Blue dot = current orbit
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(cw - 180, legendY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#445566';
        ctx.fillText('当前轨道', cw - 174, legendY + 2.5);

        // Red dash = target orbit
        ctx.strokeStyle = 'rgba(255,68,68,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(cw - 120, legendY);
        ctx.lineTo(cw - 100, legendY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#445566';
        ctx.fillText('目标绕飞', cw - 94, legendY + 2.5);

        // Green dash = nav orbit
        ctx.strokeStyle = 'rgba(0,255,136,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 1.5]);
        ctx.beginPath();
        ctx.moveTo(cw - 55, legendY);
        ctx.lineTo(cw - 35, legendY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#445566';
        ctx.fillText('导航轨道', cw - 29, legendY + 2.5);

        // Blue dash = expected orbit
        ctx.strokeStyle = 'rgba(68,136,255,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(cw + 5, legendY);
        ctx.lineTo(cw + 25, legendY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#445566';
        ctx.fillText('期望轨道', cw + 31, legendY + 2.5);

        ctx.restore();
      }

      ctx.restore();
      if (running) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enlarged]);

  const enlargedCanvas = enlarged ? (() => {
    const ew = ENLARGED_W, eh = ENLARGED_H;
    return createPortal(
    <>
      <div
        onClick={handleToggle}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 200, cursor: 'pointer',
        }}
      />
      <canvas
        ref={canvasRef}
        width={ew * 2}
        height={eh * 2}
        onClick={handleToggle}
        style={{
          width: ew,
          height: eh,
          display: 'block',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.5)',
          border: '2px solid rgba(0,180,255,0.5)',
          cursor: 'pointer',
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          boxShadow: '0 0 40px rgba(0,180,255,0.15)',
        }}
      />
    </>,
    document.body,
  );
})() : null;

  return (
    <>
      {enlargedCanvas}
      {!enlarged && (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
          <canvas
            ref={canvasRef}
            width={size.w * 2}
            height={size.h * 2}
            onClick={handleToggle}
            style={{
              width: size.w,
              height: size.h,
              display: 'block',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(0,180,255,0.2)',
              cursor: ENLARGE_ENABLED ? 'pointer' : 'default',
            }}
          />
        </div>
      )}
    </>
  );
}

export default MiniMap;
