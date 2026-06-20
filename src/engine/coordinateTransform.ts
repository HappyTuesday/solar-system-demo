import { SIMPLIFIED_RADII } from './constants';

// src/engine/coordinateTransform.ts
// 纯函数，无 React/Three.js 依赖，属于 engine/ 层
//
// 坐标转换模型 —— 线性映射
// ========================
// 太阳系物理坐标（m）与渲染坐标系之间的双向转换，全部使用线性缩放。
//
// 1. 位置缩放
//    r_render = r_physical * linearScale
// 2. 尺寸缩放
//    r_render = radius * linearScale
// 3. 速度缩放
//    v_render = v_physical * linearScale

const M_SUN = 1.989e30;
const MASS_RENDER_SCALE = 10000 / M_SUN;

let _linearScale = 1e-8;
export function getLinearScale(): number { return _linearScale; }
export function setLinearScale(v: number): void { _linearScale = v; }

let _sizeMultiplier = 10;
export function getSizeMultiplier(): number { return _sizeMultiplier; }
export function setSizeMultiplier(v: number): void { _sizeMultiplier = v; }
export function scaleSizeUp(): number {
  _sizeMultiplier *= 2;
  return _sizeMultiplier;
}
export function scaleSizeDown(): number {
  _sizeMultiplier = Math.max(1, _sizeMultiplier / 2);
  return _sizeMultiplier;
}

const MANTISSA_STEPS = [1, 2, 4, 5, 6, 8];

function decompose(v: number): { m: number; n: number } {
  const n = Math.floor(Math.log10(v));
  const m = v / Math.pow(10, n);
  if (m >= 9.5) return { m: 1, n: n + 1 };
  if (m < 0.95 && n > -15) return { m: m * 10, n: n - 1 };
  return { m, n };
}

function compose(m: number, n: number): number {
  return Number((m * Math.pow(10, n)).toExponential());
}

export function scaleUp(): number {
  const { m, n } = decompose(_linearScale);
  const idx = MANTISSA_STEPS.findIndex(s => s >= m);
  if (idx === -1 || idx === MANTISSA_STEPS.length - 1) {
    _linearScale = compose(MANTISSA_STEPS[0], n + 1);
  } else {
    _linearScale = compose(MANTISSA_STEPS[idx + 1], n);
  }
  return _linearScale;
}

export function scaleDown(): number {
  const { m, n } = decompose(_linearScale);
  const idx = MANTISSA_STEPS.findLastIndex(s => s <= m);
  if (idx <= 0) {
    _linearScale = compose(MANTISSA_STEPS[MANTISSA_STEPS.length - 1], n - 1);
  } else {
    _linearScale = compose(MANTISSA_STEPS[idx - 1], n);
  }
  return _linearScale;
}

// ===== 位置转换 =====

export function physicalToRender(pos: [number, number, number]): [number, number, number] {
  return [pos[0] * _linearScale, pos[1] * _linearScale, pos[2] * _linearScale];
}

export function renderToPhysical(pos: [number, number, number]): [number, number, number] {
  const inv = 1.0 / _linearScale;
  return [pos[0] * inv, pos[1] * inv, pos[2] * inv];
}

// ===== 距离标量 =====

export function physicalDistanceToRender(distance: number): number {
  return distance * _linearScale;
}

export function renderDistanceToPhysical(distance: number): number {
  return distance / _linearScale;
}

// ===== 天体尺寸 =====

const MIN_RENDER_RADIUS = 10;

export function physicalRadiusToRender(radius: number): number {
  return Math.max(radius * _linearScale * _sizeMultiplier, MIN_RENDER_RADIUS);
}

export function renderRadiusToPhysical(rRadius: number): number {
  return rRadius / (_linearScale * _sizeMultiplier);
}

// ===== 速度 =====

export function physicalVelocityToRender(
  vPhysical: [number, number, number],
  _posPhysical: [number, number, number]
): [number, number, number] {
  return [vPhysical[0] * _linearScale, vPhysical[1] * _linearScale, vPhysical[2] * _linearScale];
}

export function renderVelocityToPhysical(
  vRender: [number, number, number],
  _posPhysical: [number, number, number]
): [number, number, number] {
  const inv = 1.0 / _linearScale;
  return [vRender[0] * inv, vRender[1] * inv, vRender[2] * inv];
}

// ===== 质量（仅用于 display） =====

export function physicalMassToRender(mass: number): number {
  return mass * MASS_RENDER_SCALE;
}

export function renderMassToPhysical(mass: number): number {
  return mass / MASS_RENDER_SCALE;
}

export function getSimplifiedRadius(templateId: string): number {
  return SIMPLIFIED_RADII[templateId] ?? 5;
}
