export function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: { offsetX: number; offsetY: number; zoom: number },
  width: number,
  height: number,
) {
  const [topLeftX, topLeftY] = screenToWorld(0, 0, vp, width, height);
  const [bottomRightX, bottomRightY] = screenToWorld(width, height, vp, width, height);

  const step = calcNiceStep(topLeftX, bottomRightX, width / 150);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  const startX = Math.floor(topLeftX / step) * step;
  for (let x = startX; x <= bottomRightX; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, topLeftY);
    ctx.lineTo(x, bottomRightY);
    ctx.stroke();
  }

  const startY = Math.floor(bottomRightY / step) * step;
  for (let y = startY; y <= topLeftY; y += step) {
    ctx.beginPath();
    ctx.moveTo(topLeftX, y);
    ctx.lineTo(bottomRightX, y);
    ctx.stroke();
  }
}

function calcNiceStep(min: number, max: number, targetLines: number): number {
  const range = max - min;
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
  vp: { offsetX: number; offsetY: number; zoom: number },
  width: number,
  height: number,
): [number, number] {
  return [
    (sx - width / 2) / vp.zoom - vp.offsetX,
    -(sy - height / 2) / vp.zoom - vp.offsetY,
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
