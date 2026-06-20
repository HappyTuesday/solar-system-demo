# 自动搭建重构 — 真实轨道初始化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将自动搭建从硬编码 XY 平面均匀分布重构为基于开普勒轨道根数计算当前真实太阳系 3D 状态，放置后由 N 体物理自由演进。

**Architecture:** 新增 `orbital.ts` 纯逻辑模块负责开普勒方程求解和轨道→笛卡尔转换；扩展 `constants.ts` 中的 `REAL_DATA` 添加轨道根数；重写 `autoBuild.ts` 使用当前时间戳计算真近点角与位置；渲染层和状态层适配 `rotationPhase` 新字段。

**Tech Stack:** TypeScript (strict), pure math (no external libs), 与现有架构一致。

---

## Task 1: 更新类型定义

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 给 `CelestialBody` 添加 `rotationPhase` 字段**

```typescript
// 在 CelestialBody 接口中 placedAt 之后新增：
rotationPhase: number;
```

最终的 `CelestialBody` 接口：
```typescript
export interface CelestialBody {
  id: string;
  templateId: CelestialBodyId;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  placedAt: number;
  rotationSpeed: number;
  rotationPhase: number;
}
```

- [ ] **Step 2: 给 `AutoBuildStep` 添加 `rotationPhase` 字段**

修改 `src/engine/autoBuild.ts` 中的接口：
```typescript
export interface AutoBuildStep {
  templateId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  rotationSpeed: number;
  rotationPhase: number;
}
```

- [ ] **Step 3: 验证类型**

运行 `npm run typecheck`，预期会报出其他文件中 `rotationPhase` 缺失的 type error（这些将在后续 task 中修复）。

---

## Task 2: 扩展 REAL_DATA 添加轨道根数

**Files:**
- Modify: `src/engine/constants.ts`

- [ ] **Step 1: 定义 OrbitalDatum 类型**

在 `constants.ts` 顶部新增：
```typescript
interface OrbitalDatum {
  eccentricity: number;
  inclination: number;
  longitudeAscendingNode: number;
  argumentOfPeriapsis: number;
  meanAnomalyAtEpoch: number;
  epoch: number;           // JD 2451545.0 = J2000.0
  axialTilt: number;
  rotationPeriod: number;
  rotationPhaseAtEpoch: number;
}
```

- [ ] **Step 2: 扩展 REAL_DATA**

修改 `REAL_DATA` 类型声明，每个条目增加 `orbital?: OrbitalDatum` 字段。

```typescript
export const REAL_DATA: Record<string, {
  mass: number;
  radius: number;
  semiMajorAxis?: number;
  orbitalSpeed?: number;
  parentId?: string;
  type: 'star' | 'planet' | 'moon';
  name: string;
  orbital?: OrbitalDatum;
}> = {
```

- [ ] **Step 3: 填入太阳轨道数据（仅有自转和黄赤交角，无公转轨道）**

```typescript
  sun: {
    name: '太阳', type: 'star', mass: 1.989e30, radius: 6.9634e8,
    orbital: {
      eccentricity: 0, inclination: 0, longitudeAscendingNode: 0, argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0, epoch: 2451545.0,
      axialTilt: 0.1265,        // ~7.25°
      rotationPeriod: 2164320,   // 25.05 days (sidereal equatorial)
      rotationPhaseAtEpoch: 0,
    },
  },
```

- [ ] **Step 4: 填入 8 个行星轨道数据**

```typescript
  mercury: {
    name: '水星', type: 'planet', mass: 3.3011e23, radius: 2.4397e6,
    semiMajorAxis: 5.791e10, orbitalSpeed: 47870,
    orbital: {
      eccentricity: 0.20563,
      inclination: 0.12226,          // 7.005°
      longitudeAscendingNode: 0.84355, // 48.331°
      argumentOfPeriapsis: 0.50842,    // 29.127°
      meanAnomalyAtEpoch: 3.05066,     // 174.795°
      epoch: 2451545.0,
      axialTilt: 0.0005,              // ~0.03°
      rotationPeriod: 5067014,         // 58.646 days
      rotationPhaseAtEpoch: 0,
    },
  },
  venus: {
    name: '金星', type: 'planet', mass: 4.8675e24, radius: 6.0518e6,
    semiMajorAxis: 1.082e11, orbitalSpeed: 35020,
    orbital: {
      eccentricity: 0.00677,
      inclination: 0.05925,          // 3.395°
      longitudeAscendingNode: 1.33823, // 76.680°
      argumentOfPeriapsis: 0.95817,    // 54.923°
      meanAnomalyAtEpoch: 0.87982,     // 50.377°
      epoch: 2451545.0,
      axialTilt: 2.873,               // ~177.4° (接近倒转)
      rotationPeriod: -20995200,       // -243 days (retrograde, 负号表示反向)
      rotationPhaseAtEpoch: 0,
    },
  },
  earth: {
    name: '地球', type: 'planet', mass: 5.9724e24, radius: 6.371e6,
    semiMajorAxis: 1.496e11, orbitalSpeed: 29780,
    orbital: {
      eccentricity: 0.01671,
      inclination: 0.0,              // 0° (ecliptic = reference plane)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 1.79662,   // 102.938°
      meanAnomalyAtEpoch: 6.24006,    // 357.527°
      epoch: 2451545.0,
      axialTilt: 0.408,              // ~23.4°
      rotationPeriod: 86164,          // 23h56m4s
      rotationPhaseAtEpoch: 0,
    },
  },
  mars: {
    name: '火星', type: 'planet', mass: 6.4171e23, radius: 3.3895e6,
    semiMajorAxis: 2.279e11, orbitalSpeed: 24070,
    orbital: {
      eccentricity: 0.09340,
      inclination: 0.03229,          // 1.850°
      longitudeAscendingNode: 0.86474, // 49.578°
      argumentOfPeriapsis: 4.99897,    // 286.502°
      meanAnomalyAtEpoch: 0.33015,     // 18.916°
      epoch: 2451545.0,
      axialTilt: 0.440,              // ~25.2°
      rotationPeriod: 88643,          // 24h37m
      rotationPhaseAtEpoch: 0,
    },
  },
  jupiter: {
    name: '木星', type: 'planet', mass: 1.8982e27, radius: 6.9911e7,
    semiMajorAxis: 7.786e11, orbitalSpeed: 13070,
    orbital: {
      eccentricity: 0.04839,
      inclination: 0.02278,          // 1.305°
      longitudeAscendingNode: 1.75220, // 100.556°
      argumentOfPeriapsis: 4.77725,    // 273.867°
      meanAnomalyAtEpoch: 0.35355,     // 20.257°
      epoch: 2451545.0,
      axialTilt: 0.054,              // ~3.1°
      rotationPeriod: 35730,          // 9h55m30s
      rotationPhaseAtEpoch: 0,
    },
  },
  saturn: {
    name: '土星', type: 'planet', mass: 5.6834e26, radius: 5.8232e7,
    semiMajorAxis: 1.434e12, orbitalSpeed: 9690,
    orbital: {
      eccentricity: 0.05386,
      inclination: 0.04343,          // 2.488°
      longitudeAscendingNode: 1.97728, // 113.716°
      argumentOfPeriapsis: 5.90366,    // 339.394°
      meanAnomalyAtEpoch: 0.83302,     // 47.729°
      epoch: 2451545.0,
      axialTilt: 0.466,              // ~26.7°
      rotationPeriod: 38362,          // 10h39m22s
      rotationPhaseAtEpoch: 0,
    },
  },
  uranus: {
    name: '天王星', type: 'planet', mass: 8.6810e25, radius: 2.5362e7,
    semiMajorAxis: 2.871e12, orbitalSpeed: 6810,
    orbital: {
      eccentricity: 0.04726,
      inclination: 0.01346,          // 0.771°
      longitudeAscendingNode: 1.28995, // 74.006°
      argumentOfPeriapsis: 2.97336,    // 170.365°
      meanAnomalyAtEpoch: 2.54806,     // 146.003°
      epoch: 2451545.0,
      axialTilt: 1.707,              // ~97.8° (几乎躺倒)
      rotationPeriod: -62064,         // -17h14m (retrograde)
      rotationPhaseAtEpoch: 0,
    },
  },
  neptune: {
    name: '海王星', type: 'planet', mass: 1.0241e26, radius: 2.4622e7,
    semiMajorAxis: 4.495e12, orbitalSpeed: 5430,
    orbital: {
      eccentricity: 0.00859,
      inclination: 0.03091,          // 1.771°
      longitudeAscendingNode: 2.29758, // 131.722°
      argumentOfPeriapsis: 0.77102,    // 44.177°
      meanAnomalyAtEpoch: 4.39846,     // 252.022°
      epoch: 2451545.0,
      axialTilt: 0.494,              // ~28.3°
      rotationPeriod: 57996,          // 16h6m36s
      rotationPhaseAtEpoch: 0,
    },
  },
```

- [ ] **Step 5: 填入 8 个卫星轨道数据**

卫星轨道根数参考行星赤道面（实际使用近似值，相对母行星）：

```typescript
  moon: {
    name: '月球', type: 'moon', parentId: 'earth', mass: 7.342e22, radius: 1.7374e6,
    semiMajorAxis: 3.844e8, orbitalSpeed: 1022,
    orbital: {
      eccentricity: 0.0549,
      inclination: 0.08980,           // 5.145° (相对黄道)
      longitudeAscendingNode: 2.1831,  // 125.08°
      argumentOfPeriapsis: 5.5504,     // 318.15°
      meanAnomalyAtEpoch: 2.3610,      // 135.27°
      epoch: 2451545.0,
      axialTilt: 0.1,                 // ~6.7° 黄赤交角
      rotationPeriod: 2360585,         // 27.32 days (潮汐锁定 ≈ 轨道周期)
      rotationPhaseAtEpoch: 0,
    },
  },
  phobos: {
    name: '火卫一', type: 'moon', parentId: 'mars', mass: 1.0659e16, radius: 1.1266e4,
    semiMajorAxis: 9.376e6, orbitalSpeed: 2138,
    orbital: {
      eccentricity: 0.0151,
      inclination: 0.01745,           // ~1° (相对火星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 27540,           // 7h39m (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  deimos: {
    name: '火卫二', type: 'moon', parentId: 'mars', mass: 1.4762e15, radius: 6.2e3,
    semiMajorAxis: 2.3463e7, orbitalSpeed: 1351,
    orbital: {
      eccentricity: 0.00033,
      inclination: 0.0208,            // ~1.79° (相对火星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 109080,          // 30.3h (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  io: {
    name: '木卫一', type: 'moon', parentId: 'jupiter', mass: 8.9319e22, radius: 1.8216e6,
    semiMajorAxis: 4.217e8, orbitalSpeed: 17334,
    orbital: {
      eccentricity: 0.0041,
      inclination: 0.00041,           // ~0.023° (相对木星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 152856,          // 1.769 days (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  europa: {
    name: '木卫二', type: 'moon', parentId: 'jupiter', mass: 4.7998e22, radius: 1.5608e6,
    semiMajorAxis: 6.711e8, orbitalSpeed: 13740,
    orbital: {
      eccentricity: 0.0094,
      inclination: 0.00821,           // ~0.47° (相对木星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 306822,          // 3.551 days (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  ganymede: {
    name: '木卫三', type: 'moon', parentId: 'jupiter', mass: 1.4819e23, radius: 2.6341e6,
    semiMajorAxis: 1.070e9, orbitalSpeed: 10880,
    orbital: {
      eccentricity: 0.0013,
      inclination: 0.00349,           // ~0.20° (相对木星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 618169,          // 7.155 days (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  callisto: {
    name: '木卫四', type: 'moon', parentId: 'jupiter', mass: 1.0759e23, radius: 2.4103e6,
    semiMajorAxis: 1.883e9, orbitalSpeed: 8204,
    orbital: {
      eccentricity: 0.0074,
      inclination: 0.00489,           // ~0.28° (相对木星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 1442200,         // 16.69 days (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
  titan: {
    name: '土卫六', type: 'moon', parentId: 'saturn', mass: 1.3452e23, radius: 2.5747e6,
    semiMajorAxis: 1.222e9, orbitalSpeed: 5570,
    orbital: {
      eccentricity: 0.0288,
      inclination: 0.00541,           // ~0.31° (相对土星赤道面)
      longitudeAscendingNode: 0.0,
      argumentOfPeriapsis: 0.0,
      meanAnomalyAtEpoch: 0.0,
      epoch: 2451545.0,
      axialTilt: 0.02,
      rotationPeriod: 1377800,         // 15.945 days (潮汐锁定)
      rotationPhaseAtEpoch: 0,
    },
  },
```

- [ ] **Step 4: 新增工具常量 `MU_SUN` 和导出周期计算函数**

在 constants.ts 尾部新增：
```typescript
export const MU_SUN = PHYSICAL_CONSTANTS.G * PHYSICAL_CONSTANTS.sunMass;
```

- [ ] **Step 5: 运行 typecheck**

```bash
npm run typecheck
```
预期无新增错误（types 已更新，constants 自洽）。

---

## Task 3: 创建 orbital.ts 轨道计算模块

**Files:**
- Create: `src/engine/orbital.ts`

- [ ] **Step 1: 创建文件骨架和 julianDate 函数**

```typescript
// julianDate 和开普勒方程求解

/**
 * Unix 毫秒时间戳 → Julian Date
 * JD = unixMs / 86400000 + 2440587.5
 */
export function julianDate(unixMs: number): number {
  return unixMs / 86400000 + 2440587.5;
}

const J2000_JD = 2451545.0;  // J2000.0 epoch
```

- [ ] **Step 2: 实现 solveKepler**

```typescript
/**
 * 牛顿迭代法解开普勒方程 M = E - e*sin(E)
 * @param M 平近点角 (rad)
 * @param e 偏心率
 * @returns 偏近点角 E (rad)
 */
export function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 30; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}
```

- [ ] **Step 3: 实现 trueAnomaly**

```typescript
/**
 * 偏心近点角 → 真近点角
 * tan(ν/2) = sqrt((1+e)/(1-e)) * tan(E/2)
 */
export function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );
}
```

- [ ] **Step 4: 实现 stateVectors（轨道根数 → 笛卡尔位置/速度）**

```typescript
/**
 * 开普勒轨道根数 → 笛卡尔位置 / 速度（相对中心天体）
 *
 * @param a  半长轴 (m)
 * @param e  偏心率
 * @param i  轨道倾角 (rad)，相对参考平面
 * @param Ω  升交点经度 (rad)
 * @param ω  近心点角距 (rad)
 * @param ν  真近点角 (rad)
 * @param μ  中心天体引力常数 G*M (m³/s²)
 * @returns heliocentric 或 planetocentric 位置和速度 (单位: m, m/s)
 */
export function stateVectors(
  a: number,
  e: number,
  i: number,
  Ω: number,
  ω: number,
  ν: number,
  μ: number,
): { position: [number, number, number]; velocity: [number, number, number] } {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(ν));
  const sqrtMuP = Math.sqrt(μ / (a * (1 - e * e)));

  // 轨道面内的位置和速度
  const xOrb = r * Math.cos(ν);
  const yOrb = r * Math.sin(ν);
  const vxOrb = -sqrtMuP * Math.sin(ν);
  const vyOrb = sqrtMuP * (e + Math.cos(ν));

  // 旋转矩阵分量（绕 Z: Ω, 绕 X: i, 绕 Z: ω）
  const cosΩ = Math.cos(Ω);
  const sinΩ = Math.sin(Ω);
  const cosω = Math.cos(ω);
  const sinω = Math.sin(ω);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);

  const x = xOrb * (cosΩ * cosω - sinΩ * sinω * cosi) - yOrb * (cosΩ * sinω + sinΩ * cosω * cosi);
  const y = xOrb * (sinΩ * cosω + cosΩ * sinω * cosi) + yOrb * (-sinΩ * sinω + cosΩ * cosω * cosi);
  const z = xOrb * (sinω * sini) + yOrb * (cosω * sini);

  const vx = vxOrb * (cosΩ * cosω - sinΩ * sinω * cosi) - vyOrb * (cosΩ * sinω + sinΩ * cosω * cosi);
  const vy = vxOrb * (sinΩ * cosω + cosΩ * sinω * cosi) + vyOrb * (-sinΩ * sinω + cosΩ * cosω * cosi);
  const vz = vxOrb * (sinω * sini) + vyOrb * (cosω * sini);

  return {
    position: [x, y, z],
    velocity: [vx, vy, vz],
  };
}
```

- [ ] **Step 5: 实现 meanAnomalyAtTime**

```typescript
/**
 * 根据开普勒第三定律计算轨道周期
 */
export function orbitalPeriod(a: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
}

/**
 * 目标时刻的平近点角
 * M(t) = M₀ + 2π · (t - epoch) / T
 */
export function meanAnomalyAtTime(
  M0: number,
  period: number,
  epoch: number,
  targetJd: number,
): number {
  const dt = targetJd - epoch;
  const n = (2 * Math.PI) / period;
  return M0 + n * dt * 86400;
}
```

- [ ] **Step 6: 实现 computeRotationPhase**

```typescript
/**
 * 当前自转相位（rad）
 * phase = (phaseAtEpoch + 2π · (t - epoch) / rotationPeriod) mod 2π
 * rotationPeriod 为负表示反向自转
 */
export function computeRotationPhase(
  phaseAtEpoch: number,
  period: number,
  epoch: number,
  targetJd: number,
): number {
  const dtSec = (targetJd - epoch) * 86400;
  return (phaseAtEpoch + (2 * Math.PI * dtSec) / period) % (2 * Math.PI);
}
```

- [ ] **Step 7: 实现 computeRotationSpeed（从真实自转周期映射到视觉速度）**

```typescript
/**
 * 从真实自转周期计算视觉自转速度
 * rotationSpeed = (2π * timeScale) / (|period| * VISUAL_FACTOR)
 *
 * 缩放因子使得地球的 rotationSpeed ≈ 1.0（与现有 ROTATION_SPEEDS 一致）
 */
const ROTATION_SPEED_SCALE = 2 * Math.PI * 1e5 / 86164; // 地球: ~7.29 → 缩放到 1.0
const ROTATION_SPEED_FACTOR = (2 * Math.PI * 1e5) / (86164 * 1.0); // 反算因子

export function computeRotationSpeed(rotationPeriod: number, timeScale: number): number {
  if (rotationPeriod === 0) return 0;
  const absPeriod = Math.abs(rotationPeriod);
  return (2 * Math.PI * timeScale) / (absPeriod * ROTATION_SPEED_FACTOR);
}
```

实际稍作简化，直接在 autoBuild.ts 中设置 rotationSpeed（参见 Task 4）。

- [ ] **Step 8: 验证**

```bash
npm run typecheck
```
预期 `orbital.ts` 无类型错误。

---

## Task 4: 更新 mergeBodies（physics.ts）

**Files:**
- Modify: `src/engine/physics.ts:137-146`

- [ ] **Step 1: 在 mergeBodies 返回对象中添加 rotationPhase**

将以下代码：
```typescript
function mergeBodies(a: CelestialBody, b: CelestialBody): CelestialBody {
  const totalMass = a.mass + b.mass;
  const pos: [number, number, number] = vec3Scale(
    vec3Add(vec3Scale(a.position, a.mass), vec3Scale(b.position, b.mass)),
    1 / totalMass
  );
  const vel: [number, number, number] = vec3Scale(
    vec3Add(vec3Scale(a.velocity, a.mass), vec3Scale(b.velocity, b.mass)),
    1 / totalMass
  );

  return {
    id: `merged-${Date.now()}`,
    templateId: a.templateId,
    position: pos,
    velocity: vel,
    mass: totalMass,
    placedAt: Date.now(),
    rotationSpeed: 0,
  };
}
```

修改为（在 `rotationSpeed` 后添加 `rotationPhase`）：
```typescript
    rotationSpeed: 0,
    rotationPhase: 0,
```

- [ ] **Step 2: 验证**

```bash
npm run typecheck
```

---

## Task 5: 重写 autoBuild.ts

**Files:**
- Modify: `src/engine/autoBuild.ts`

- [ ] **Step 1: 替换整个内容**

```typescript
import { REAL_DATA, PHYSICAL_CONSTANTS, MU_SUN } from './constants';
import {
  julianDate,
  solveKepler,
  trueAnomaly,
  stateVectors,
  orbitalPeriod,
  meanAnomalyAtTime,
  computeRotationPhase,
} from './orbital';

export interface AutoBuildStep {
  templateId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  rotationSpeed: number;
  rotationPhase: number;
}

export function computeAutoBuildPlan(timestamp?: number): AutoBuildStep[] {
  const unixMs = timestamp ?? Date.now();
  const jd = julianDate(unixMs);
  const plan: AutoBuildStep[] = [];
  const planetStates: Record<string, { pos: [number, number, number]; vel: [number, number, number] }> = {};

  // 太阳
  const sunData = REAL_DATA.sun;
  plan.push({
    templateId: 'sun',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: sunData.mass,
    rotationSpeed: computeRotationSpeedFromOrbital(sunData),
    rotationPhase: computeRotationPhase(
      sunData.orbital?.rotationPhaseAtEpoch ?? 0,
      sunData.orbital?.rotationPeriod ?? 1,
      sunData.orbital?.epoch ?? 2451545.0,
      jd,
    ),
  });

  // 8 大行星
  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  for (const id of planetIds) {
    const data = REAL_DATA[id];
    if (!data.semiMajorAxis || !data.orbital) continue;

    const o = data.orbital;
    const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
    const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
    const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const E = solveKepler(Mmod, o.eccentricity);
    const nu = trueAnomaly(E, o.eccentricity);

    const sv = stateVectors(
      data.semiMajorAxis, o.eccentricity, o.inclination,
      o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN,
    );

    planetStates[id] = { pos: sv.position, vel: sv.velocity };

    plan.push({
      templateId: id,
      position: sv.position,
      velocity: sv.velocity,
      mass: data.mass,
      rotationSpeed: computeRotationSpeedFromOrbital(data),
      rotationPhase: computeRotationPhase(
        o.rotationPhaseAtEpoch, o.rotationPeriod, o.epoch, jd,
      ),
    });
  }

  // 8 大卫星
  const moonIds = ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan'];

  for (const id of moonIds) {
    const data = REAL_DATA[id];
    if (!data.semiMajorAxis || !data.orbital || !data.parentId) continue;

    const parentState = planetStates[data.parentId];
    if (!parentState) continue;

    const parentMass = REAL_DATA[data.parentId]?.mass ?? 0;
    const muParent = PHYSICAL_CONSTANTS.G * parentMass;
    const o = data.orbital;
    const period = orbitalPeriod(data.semiMajorAxis, muParent);
    const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
    const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const E = solveKepler(Mmod, o.eccentricity);
    const nu = trueAnomaly(E, o.eccentricity);

    const svRel = stateVectors(
      data.semiMajorAxis, o.eccentricity, o.inclination,
      o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, muParent,
    );

    plan.push({
      templateId: id,
      position: [
        parentState.pos[0] + svRel.position[0],
        parentState.pos[1] + svRel.position[1],
        parentState.pos[2] + svRel.position[2],
      ],
      velocity: [
        parentState.vel[0] + svRel.velocity[0],
        parentState.vel[1] + svRel.velocity[1],
        parentState.vel[2] + svRel.velocity[2],
      ],
      mass: data.mass,
      rotationSpeed: computeRotationSpeedFromOrbital(data),
      rotationPhase: computeRotationPhase(
        o.rotationPhaseAtEpoch, o.rotationPeriod, o.epoch, jd,
      ),
    });
  }

  return plan;
}

// 辅助函数：从轨道数据计算旋转速度（映射到合理视觉范围）
function computeRotationSpeedFromOrbital(data: { orbital?: { rotationPeriod: number } }): number {
  const period = data.orbital?.rotationPeriod;
  if (!period || period === 0) return 0;
  const absPeriod = Math.abs(period);
  // 地球 rotationPeriod=86164 → rotationSpeed≈1.0
  // rotationSpeed = (2π * timeScale / absPeriod) / (2π * timeScale / 86164) × 1.0
  //              = 86164 / absPeriod
  return 86164 / absPeriod;
}
```

- [ ] **Step 2: 类型检查**

```bash
npm run typecheck
```

---

## Task 6: 更新 buildStore.ts — placeBody 支持 rotationPhase

**Files:**
- Modify: `src/stores/buildStore.ts`

- [ ] **Step 1: 修改 placeBody 方法签名和实现**

将 `placeBody` 方法签名从：
```typescript
placeBody: (templateId: string, position: [number, number, number], velocity: [number, number, number], mass: number, rotationSpeed?: number) => void;
```

改为：
```typescript
placeBody: (templateId: string, position: [number, number, number], velocity: [number, number, number], mass: number, rotationSpeed?: number, rotationPhase?: number) => void;
```

- [ ] **Step 2: 修改 placeBody 实现**

在创建 `body` 对象处（第 89-99 行），修改为：
```typescript
  placeBody: (templateId, position, velocity, mass, rotationSpeed, rotationPhase) => {
    const body: CelestialBody = {
      id: generateBodyId(templateId),
      templateId,
      position: [...position] as [number, number, number],
      velocity: [...velocity] as [number, number, number],
      mass,
      placedAt: Date.now(),
      rotationSpeed: rotationSpeed ?? 0,
      rotationPhase: rotationPhase ?? 0,
    };
```

- [ ] **Step 3: 验证**

```bash
npm run typecheck
```

---

## Task 7: 更新 useAutoBuild.ts

**Files:**
- Modify: `src/hooks/useAutoBuild.ts`

- [ ] **Step 1: 修改 computeAutoBuildPlan 调用**

将：
```typescript
import { AUTO_BUILD_PLAN } from '../engine/autoBuild';
```

改为：
```typescript
import { computeAutoBuildPlan } from '../engine/autoBuild';
```

- [ ] **Step 2: 在 startAutoBuild 内计算动态 plan**

删除 `AUTO_BUILD_PLAN` 的常量引用，改为在 `startAutoBuild` 开始时计算：

```typescript
  const startAutoBuild = useCallback(() => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];

    const buildStore = useBuildStore.getState();
    const uiStore = useUIStore.getState();
    const historyStore = useHistoryStore.getState();

    buildStore.resetBuild();
    uiStore.resetUI();
    historyStore.setCurrentRecordId(null);

    buildStore.setAutoBuilding(true);
    buildStore.startBuild();

    const plan = computeAutoBuildPlan(Date.now());

    let index = 0;

    const placeNext = () => {
      if (index >= plan.length) {
        // ... 完成逻辑（不变）...
      }

      const step = plan[index];
      const store = useBuildStore.getState();
      store.placeBody(
        step.templateId,
        step.position,
        step.velocity,
        step.mass,
        step.rotationSpeed,
        step.rotationPhase,
      );
```

即把 `AUTO_BUILD_PLAN` 引用替换为局部 `plan`，把 `placeBody` 调用增加 `step.rotationPhase` 参数。

- [ ] **Step 3: 验证编译**

```bash
npm run typecheck
```

---

## Task 8: 更新 bodies.ts — 使用 constants 中的 tilt 和 rotationPhase

**Files:**
- Modify: `src/rendering/bodies.ts`

- [ ] **Step 1: 删除局部 AXIAL_TILTS 常量**

删除第 45-63 行的 `AXIAL_TILTS` 常量定义。

- [ ] **Step 2: 修改 createBodyMesh 中的 tilt 来源**

将：
```typescript
const tilt = AXIAL_TILTS[body.templateId] ?? 0;
```

改为：
```typescript
const tilt = REAL_DATA[body.templateId]?.orbital?.axialTilt ?? 0;
```

- [ ] **Step 3: 在 createBodyMesh 中设置初始自转相位**

在 `mesh.position.set(0, 0, 0)` 之后（`tiltGroup.add(mesh)` 之前），添加：
```typescript
mesh.rotation.y = body.rotationPhase ?? 0;
```

- [ ] **Step 4: 验证**

```bash
npm run typecheck
```

---

## Task 9: 更新设计文档

**Files:**
- Modify: `docs/specs/2026-06-14-solar-system-demo-design.md`

- [ ] **Step 1: 在项目结构中新增 orbital.ts 条目**

在第 84 行（`scoring.ts` 之后）新增：
```
    │   ├── orbital.ts          # 开普勒轨道计算（解开普勒方程、轨道根数→笛卡尔坐标）
```

- [ ] **Step 2: 更新自动搭建描述**

找到设计规格中与自动搭建相关的描述（如果有），或在该文档的自动搭建相关章节补充说明改为基于轨道根数计算。

- [ ] **Step 3: 在数据模型章节补充 OrbitalDatum 类型说明**

在 3.2 CelestialBodyTemplate 之后，补充 OrbitalDatum 的字段说明表。

---

## Task 10: 最终验证

- [ ] **Step 1: 完整类型检查**

```bash
npm run typecheck
```
预期：0 错误。

- [ ] **Step 2: 构建验证**

```bash
npm run build
```
预期：成功构建。

- [ ] **Step 3: 功能验证（开发服务器）**

```bash
npm run dev
```

在浏览器中：
1. 点击「自动搭建」按钮
2. 观察天体在 3D 空间中按真实位置放置（非均匀分布、有 Z 轴偏移）
3. 太阳点击后模拟启动，天体在椭圆形轨道上运动
4. 天体自转相位已设置

---

## 任务依赖

```
Task 1 (types) ──┐
                 ├──→ Task 3 (orbital.ts) ──→ Task 5 (autoBuild.ts) ──→ Task 7 (useAutoBuild.ts)
Task 2 (constants)┘
                 
Task 1 ──→ Task 4 (physics.ts, mergeBodies)
Task 1 ──→ Task 6 (buildStore.ts)
Task 2 ──→ Task 8 (bodies.ts)

Task 9 (docs), Task 10 (verification) — 最后执行
```

可并行执行的任务组：{Task 4, Task 6, Task 8} 和 {Task 3 + Task 5 + Task 7} 串联后可并行于前者。
