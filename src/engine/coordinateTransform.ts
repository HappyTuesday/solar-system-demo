// src/engine/coordinateTransform.ts
// 纯函数，无 React/Three.js 依赖，属于 engine/ 层

const R_SUN = 6.9634e8; // 太阳真实半径 (m)
const M_SUN = 1.989e30; // 太阳真实质量 (kg)
const K = 100;          // 轨道缩放因子
const ALPHA = 0.3;      // 轨道压缩指数
const LOG_BASE = 1e6;   // 对数缩放基准 (m)
const LOG_FACTOR = 8;   // 对数缩放因子
const MIN_RENDER_R = 3; // 最小渲染半径
const SUN_RENDER_R = 50;// 太阳渲染半径
const MASS_RENDER_SCALE = 10000 / M_SUN; // 质量显示缩放

// ===== 位置转换 =====

export function physicalToRender(pos: [number, number, number]): [number, number, number] {
  const r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
  if (r < 1e-6) return [0, 0, 0];
  const rRender = K * Math.pow(r / R_SUN, ALPHA);
  const scale = rRender / r;
  return [pos[0] * scale, pos[1] * scale, pos[2] * scale];
}

export function renderToPhysical(pos: [number, number, number]): [number, number, number] {
  const r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
  if (r < 1e-6) return [0, 0, 0];
  const rPhys = R_SUN * Math.pow(r / K, 1 / ALPHA);
  const scale = rPhys / r;
  return [pos[0] * scale, pos[1] * scale, pos[2] * scale];
}

// ===== 距离标量（轨道环半径等） =====

export function physicalDistanceToRender(distance: number): number {
  return K * Math.pow(distance / R_SUN, ALPHA);
}

export function renderDistanceToPhysical(distance: number): number {
  return R_SUN * Math.pow(distance / K, 1 / ALPHA);
}

// ===== 天体尺寸 =====

export function physicalRadiusToRender(radius: number, isSun?: boolean): number {
  if (isSun) return SUN_RENDER_R;
  const raw = Math.log10(radius / LOG_BASE + 1) * LOG_FACTOR;
  return Math.max(raw, MIN_RENDER_R);
}

export function renderRadiusToPhysical(rRadius: number): number {
  return LOG_BASE * (Math.pow(10, rRadius / LOG_FACTOR) - 1);
}

// ===== 速度转换（径向/切向精确分解） =====

export function renderVelocityToPhysical(
  vRender: [number, number, number],
  posPhysical: [number, number, number]
): [number, number, number] {
  const r = Math.sqrt(posPhysical[0] * posPhysical[0] + posPhysical[1] * posPhysical[1] + posPhysical[2] * posPhysical[2]);
  if (r < 1) return [0, 0, 0];

  const rOverSun = r / R_SUN;
  const f = K * Math.pow(rOverSun, ALPHA);
  const fPrime = K * ALPHA * Math.pow(rOverSun, ALPHA - 1) / R_SUN;
  const fOverR = f / r;

  const ux = posPhysical[0] / r;
  const uy = posPhysical[1] / r;
  const uz = posPhysical[2] / r;

  const vrDotU = vRender[0] * ux + vRender[1] * uy + vRender[2] * uz;
  const vR_radial = vrDotU;
  const vR_tang = [
    vRender[0] - vR_radial * ux,
    vRender[1] - vR_radial * uy,
    vRender[2] - vR_radial * uz,
  ];
  const vR_tangLen = Math.sqrt(vR_tang[0] * vR_tang[0] + vR_tang[1] * vR_tang[1] + vR_tang[2] * vR_tang[2]);

  const vP_radial = vR_radial / fPrime;

  if (vR_tangLen < 1e-15) {
    return [vP_radial * ux, vP_radial * uy, vP_radial * uz];
  }

  const vP_tangLen = vR_tangLen / fOverR;
  const tuX = vR_tang[0] / vR_tangLen;
  const tuY = vR_tang[1] / vR_tangLen;
  const tuZ = vR_tang[2] / vR_tangLen;

  return [
    vP_radial * ux + vP_tangLen * tuX,
    vP_radial * uy + vP_tangLen * tuY,
    vP_radial * uz + vP_tangLen * tuZ,
  ];
}

export function physicalVelocityToRender(
  vPhysical: [number, number, number],
  posPhysical: [number, number, number]
): [number, number, number] {
  const r = Math.sqrt(posPhysical[0] * posPhysical[0] + posPhysical[1] * posPhysical[1] + posPhysical[2] * posPhysical[2]);
  if (r < 1) return [0, 0, 0];

  const rOverSun = r / R_SUN;
  const f = K * Math.pow(rOverSun, ALPHA);
  const fPrime = K * ALPHA * Math.pow(rOverSun, ALPHA - 1) / R_SUN;
  const fOverR = f / r;

  const ux = posPhysical[0] / r;
  const uy = posPhysical[1] / r;
  const uz = posPhysical[2] / r;

  const vpDotU = vPhysical[0] * ux + vPhysical[1] * uy + vPhysical[2] * uz;
  const vP_radial = vpDotU;
  const vP_tang = [
    vPhysical[0] - vP_radial * ux,
    vPhysical[1] - vP_radial * uy,
    vPhysical[2] - vP_radial * uz,
  ];

  return [
    vP_radial * fPrime * ux + vP_tang[0] * fOverR,
    vP_radial * fPrime * uy + vP_tang[1] * fOverR,
    vP_radial * fPrime * uz + vP_tang[2] * fOverR,
  ];
}

// ===== 质量（仅线性映射，用于 display） =====

export function physicalMassToRender(mass: number): number {
  return mass * MASS_RENDER_SCALE;
}

export function renderMassToPhysical(mass: number): number {
  return mass / MASS_RENDER_SCALE;
}
