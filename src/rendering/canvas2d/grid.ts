import type { Viewport } from './setup';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  width: number,
  height: number,
) {
  const [topLeftX, topLeftY] = screenToWorld(0, 0, vp, width, height);
  const [bottomRightX, bottomRightY] = screenToWorld(width, height, vp, width, height);

  const step = calcNiceStep(topLeftX, bottomRightX, width / 150);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  const startX = Math.floor(Math.min(topLeftX, bottomRightX) / step) * step;
  const endX = Math.max(topLeftX, bottomRightX);
  for (let x = startX; x <= endX; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, Math.min(topLeftY, bottomRightY));
    ctx.lineTo(x, Math.max(topLeftY, bottomRightY));
    ctx.stroke();
  }

  const startY = Math.floor(Math.min(topLeftY, bottomRightY) / step) * step;
  const endY = Math.max(topLeftY, bottomRightY);
  for (let y = startY; y <= endY; y += step) {
    ctx.beginPath();
    ctx.moveTo(Math.min(topLeftX, bottomRightX), y);
    ctx.lineTo(Math.max(topLeftX, bottomRightX), y);
    ctx.stroke();
  }
}

function calcNiceStep(min: number, max: number, targetLines: number): number {
  const range = Math.abs(max - min);
  if (range < 1e-12) return 1;
  const rough = range / targetLines;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(rough))));
  const mant = rough / exp;
  if (mant < 1.5) return exp;
  if (mant < 3.5) return 2 * exp;
  if (mant < 7.5) return 5 * exp;
  return 10 * exp;
}

function screenToWorld(
  sx: number,
  sy: number,
  vp: Viewport,
  width: number,
  height: number,
): [number, number] {
  const cx = width / 2;
  const cy = height / 2;
  return [
    (sx - cx) / vp.zoom - vp.offsetX,
    -(sy - cy) / vp.zoom - vp.offsetY,
  ];
}

export function drawOrbitRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawGuideArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = 'rgba(255, 152, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}
