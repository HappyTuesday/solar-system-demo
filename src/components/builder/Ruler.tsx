import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { getSharedCamera, getSharedCanvas } from '../../rendering/cameraRef';
import { renderToPhysical } from '../../engine/coordinateTransform';
import './Ruler.css';

const RULER_SIZE = 28;
const TEXT_COLOR = '#7799bb';
const TICK_COLOR = '#334466';
const MAJOR_TICK_COLOR = '#557799';

function niceInterval(range: number): number {
  if (range <= 0) return 1;
  const rough = range / 6;
  const exp = Math.pow(10, Math.floor(Math.log10(rough)));
  const mantissa = rough / exp;
  if (mantissa <= 1.5) return exp;
  if (mantissa <= 3.5) return 2 * exp;
  if (mantissa <= 7.5) return 5 * exp;
  return 10 * exp;
}

function formatPhysLabel(meters: number): string {
  const abs = Math.abs(meters);
  if (abs >= 1e12) return `${parseFloat((meters / 1e12).toFixed(1))}万亿`;
  if (abs >= 1e8) return `${parseFloat((meters / 1e8).toFixed(1))}亿`;
  if (abs >= 1e4) return `${parseFloat((meters / 1e4).toFixed(1))}万`;
  return meters.toFixed(0);
}

export default function Ruler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  const getCornerRender = useCallback((ndcX: number, ndcY: number): THREE.Vector3 | null => {
    const camera = getSharedCamera();
    const tgt = new THREE.Vector3();
    if (!camera) return null;
    raycasterRef.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = raycasterRef.current.ray.intersectPlane(planeRef.current, tgt);
    return hit ?? null;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const threeCanvas = getSharedCanvas();
    if (!canvas || !threeCanvas) return;

    const w = threeCanvas.clientWidth;
    const h = threeCanvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const tl = getCornerRender(-1, 1);
    const tr = getCornerRender(1, 1);
    const bl = getCornerRender(-1, -1);
    if (!tl || !tr || !bl) return;

    const tlPhys = renderToPhysical([tl.x, tl.y, tl.z]);
    const trPhys = renderToPhysical([tr.x, tr.y, tr.z]);
    const blPhys = renderToPhysical([bl.x, bl.y, bl.z]);

    const xMin = Math.min(tlPhys[0], blPhys[0]);
    const xMax = Math.max(trPhys[0], trPhys[0]);
    const yMin = Math.min(blPhys[1], tlPhys[1]);
    const yMax = Math.max(tlPhys[1], trPhys[1]);

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    if (xRange <= 0 || yRange <= 0) return;

    const xInterval = niceInterval(xRange);
    const yInterval = niceInterval(yRange);

    const physToPixelX = (physX: number) => ((physX - xMin) / xRange) * w;
    const physToPixelY = (physY: number) => h - ((physY - yMin) / yRange) * h;

    // --- Top ruler background ---
    ctx.fillStyle = 'rgba(5, 5, 16, 0.50)';
    ctx.fillRect(0, 0, w, RULER_SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_SIZE);
    ctx.lineTo(w, RULER_SIZE);
    ctx.stroke();

    // Top ruler ticks (X axis)
    const xStart = Math.ceil(xMin / xInterval) * xInterval;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let physX = xStart; physX <= xMax; physX += xInterval) {
      const px = physToPixelX(physX);
      if (px < 0 || px > w) continue;
      const isMajor = Math.abs(physX % (xInterval * 5)) < xInterval * 0.01 || Math.abs(physX % (xInterval * 5) - xInterval * 5) < xInterval * 0.01;
      ctx.strokeStyle = isMajor ? MAJOR_TICK_COLOR : TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(px, RULER_SIZE);
      ctx.lineTo(px, isMajor ? RULER_SIZE - 14 : RULER_SIZE - 8);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(formatPhysLabel(physX) + 'm', px, 2);
      }
    }

    // --- Left ruler background ---
    ctx.fillStyle = 'rgba(5, 5, 16, 0.50)';
    ctx.fillRect(0, 0, RULER_SIZE, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, 0);
    ctx.lineTo(RULER_SIZE, h);
    ctx.stroke();

    // Left ruler ticks (Y axis)
    const yStart = Math.ceil(yMin / yInterval) * yInterval;
    for (let physY = yStart; physY <= yMax; physY += yInterval) {
      const py = physToPixelY(physY);
      if (py < 0 || py > h) continue;
      ctx.strokeStyle = TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(RULER_SIZE, py);
      ctx.lineTo(RULER_SIZE - 8, py);
      ctx.stroke();
      ctx.fillStyle = TEXT_COLOR;
      ctx.save();
      ctx.translate(12, py);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatPhysLabel(physY) + 'm', 0, 0);
      ctx.restore();
    }

    // Corner square
    ctx.fillStyle = 'rgba(5, 5, 16, 0.50)';
    ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  }, [getCornerRender]);

  useEffect(() => {
    let animId = 0;
    const loop = () => {
      draw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [draw]);

  return <canvas ref={canvasRef} className="ruler-overlay" />;
}
