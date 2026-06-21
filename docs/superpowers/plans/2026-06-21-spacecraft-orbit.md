# 飞船稳定绕飞 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Kepler 轨道注入算法，让 Dragon 2 飞船在 Explore 页面以稳定圆轨道绕地球飞行。

**Architecture:** 新增 `orbitalInjection.ts` 模块，用 Kepler 轨道要素（a, e, i, Ω, ω, ν）计算飞船相对目标天体的初始笛卡尔状态，再叠加天体的日心运动。spaceship.ts 中旧的硬编码初始化代码删除，spaceshipStore 改为从新模块导入。

**Tech Stack:** React 18 + TypeScript + Zustand，纯 engine 层（无 React/Three.js 依赖）

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/engine/constants.ts` | 新增 `SPACECRAFT_DRAGON2`, `SPACECRAFT_CONFIG` 常量，废弃旧的 `SPACESHIP` | 修改 |
| `src/engine/orbitalInjection.ts` | 轨道注入算法：Kepler 要素 → 日心状态 | **新建** |
| `src/engine/spaceship.ts` | 删除 `computeEarthState` 和旧的 `createSpaceshipState`，更新 `SPACESHIP` → `SPACECRAFT_CONFIG` | 修改 |
| `src/stores/spaceshipStore.ts` | 更新 `createSpaceshipState` 导入路径 | 修改 |

**不修改：** ExploreCanvas, Dashboard, MiniMap, types/index.ts

---

### Task 1: 新增飞船常量（constants.ts）

**Files:**
- Modify: `src/engine/constants.ts`

- [ ] **Step 1: 用常量替换旧 SPACESHIP 对象**

删除旧的 `SPACESHIP` 常量（第 452-456 行），替换为：

```typescript
export const SPACECRAFT_DRAGON2 = {
  name: 'Crew Dragon 2',
  mass: 10500,
  length: 8.1,
  diameter: 4.0,
  collisionRadiusAU: 5.4e-8,
  maxThrustAU: 1.5e-7,
  defaultOrbit: {
    semiMajorAxis: 6.771e6,
    eccentricity: 0,
    inclination: 0.9006,
    raan: 0,
    argPeriapsis: 0,
    trueAnomaly: 0,
  },
};

export const SPACECRAFT_CONFIG = SPACECRAFT_DRAGON2;
```

- [ ] **Step 2: 运行 typecheck 确认常量类型无误**

```bash
npm run typecheck
```

Expected: PASS（如果后续引用了新常量才需要修改引用处，此时仅常量定义，应该通过）

- [ ] **Step 3: Commit**

```bash
git add src/engine/constants.ts
git commit -m "feat: 新增 Dragon 2 飞船常量，替换旧 SPACESHIP"
```

---

### Task 2: 创建轨道注入模块（orbitalInjection.ts）

**Files:**
- Create: `src/engine/orbitalInjection.ts`

- [ ] **Step 1: 创建 orbitalInjection.ts**

```typescript
import { REAL_DATA, G, AU_TO_M, SPACECRAFT_CONFIG } from './constants';
import { stateVectors, julianDate, solveKepler, trueAnomaly, orbitalPeriod, meanAnomalyAtTime } from './orbital';
import { MU_SUN } from './constants';
import type { SpaceshipState } from '../types';

export interface OrbitElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPeriapsis: number;
  trueAnomaly: number;
}

function keplerToRelativeState(
  elements: OrbitElements,
  mu: number,
): { position: [number, number, number]; velocity: [number, number, number] } {
  return stateVectors(
    elements.semiMajorAxis,
    elements.eccentricity,
    elements.inclination,
    elements.raan,
    elements.argPeriapsis,
    elements.trueAnomaly,
    mu,
  );
}

function computeBodyState(
  templateId: string,
  jd: number,
): { position: [number, number, number]; velocity: [number, number, number] } | null {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  return stateVectors(
    data.semiMajorAxis, o.eccentricity, o.inclination,
    o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN,
  );
}

export function createSpaceshipState(
  targetBodyId: string = 'earth',
  orbitOverrides?: Partial<OrbitElements>,
  now: number = Date.now(),
): SpaceshipState {
  const jd = julianDate(now);
  const bodyState = computeBodyState(targetBodyId, jd);

  if (!bodyState) {
    throw new Error(`Cannot compute state for target body: ${targetBodyId}`);
  }

  const targetData = REAL_DATA[targetBodyId];
  const muTarget = G * targetData.mass;
  const def = SPACECRAFT_CONFIG.defaultOrbit;

  const elements: OrbitElements = {
    semiMajorAxis: orbitOverrides?.semiMajorAxis ?? def.semiMajorAxis,
    eccentricity: orbitOverrides?.eccentricity ?? def.eccentricity,
    inclination: orbitOverrides?.inclination ?? def.inclination,
    raan: orbitOverrides?.raan ?? def.raan,
    argPeriapsis: orbitOverrides?.argPeriapsis ?? def.argPeriapsis,
    trueAnomaly: orbitOverrides?.trueAnomaly ?? def.trueAnomaly,
  };

  const rel = keplerToRelativeState(elements, muTarget);

  const SCALE = 1 / AU_TO_M;

  const position: [number, number, number] = [
    (bodyState.position[0] + rel.position[0]) * SCALE,
    (bodyState.position[1] + rel.position[1]) * SCALE,
    (bodyState.position[2] + rel.position[2]) * SCALE,
  ];

  const velocity: [number, number, number] = [
    (bodyState.velocity[0] + rel.velocity[0]) * SCALE,
    (bodyState.velocity[1] + rel.velocity[1]) * SCALE,
    (bodyState.velocity[2] + rel.velocity[2]) * SCALE,
  ];

  const speed = Math.sqrt(
    rel.velocity[0] ** 2 + rel.velocity[1] ** 2 + rel.velocity[2] ** 2,
  );
  const direction: [number, number, number] = speed > 0
    ? [rel.velocity[0] / speed, rel.velocity[1] / speed, rel.velocity[2] / speed]
    : [0, 1, 0];

  return {
    position,
    velocity,
    direction,
    thrust: [0, 0, 0],
    thrustMagnitude: 0,
    exploded: false,
  };
}
```

- [ ] **Step 2: 运行 typecheck 确认新模块无类型错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/engine/orbitalInjection.ts
git commit -m "feat: 新增轨道注入模块，支持 Kepler 要素计算飞船初始状态"
```

---

### Task 3: 更新 spaceship.ts（删除旧代码 + 更新引用）

**Files:**
- Modify: `src/engine/spaceship.ts`

- [ ] **Step 1: 清理 imports**

删除顶部不再需要的 import，替换为新的 import：

```typescript
// 删除以下行：
import type { SpaceshipState } from '../types';
import { SPACESHIP, REAL_DATA, G_AU, AU_TO_M } from './constants';
import { vec3Length } from './physics';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';
import { MU_SUN } from './constants';

// 替换为：
import type { SpaceshipState } from '../types';
import { SPACECRAFT_CONFIG, G_AU } from './constants';
import { vec3Length } from './physics';
```

- [ ] **Step 2: 删除 computeEarthState 和旧的 createSpaceshipState 函数**

删除第 7-60 行（从 `const ORBIT_RADIUS_AU = 0.0003;` 到 createSpaceshipState 的结尾 `};`），包括：
- `ORBIT_RADIUS_AU` 常量
- `SCALE` 常量
- `computeEarthState()` 函数
- 旧的 `createSpaceshipState()` 函数

- [ ] **Step 3: 更新 SPACESHIP 引用为 SPACECRAFT_CONFIG**

在 `applyThrustInBodyFrame()` 函数中：
```typescript
// 第 93 行：SPACESHIP.maxThrustAU → SPACECRAFT_CONFIG.maxThrustAU
const thrustAccel = SPACECRAFT_CONFIG.maxThrustAU * (magnitude / 100);
```

在 `computeSpaceshipAcceleration()` 函数中：
```typescript
// 第 134-136 行：SPACESHIP.mass → SPACECRAFT_CONFIG.mass
ax += thrustWorld[0] / SPACECRAFT_CONFIG.mass;
ay += thrustWorld[1] / SPACECRAFT_CONFIG.mass;
az += thrustWorld[2] / SPACECRAFT_CONFIG.mass;
```

在 `checkSpaceshipCollision()` 函数中：
```typescript
// 第 210 行：SPACESHIP.collisionRadius → SPACECRAFT_CONFIG.collisionRadiusAU
if (dist <= SPACECRAFT_CONFIG.collisionRadiusAU + body.radius) {
```

- [ ] **Step 4: 运行 typecheck 确认 spaceship.ts 无错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/spaceship.ts
git commit -m "refactor: 删除旧飞船初始化代码，改用 SPACECRAFT_CONFIG"
```

---

### Task 4: 更新 spaceshipStore.ts（导入路径）

**Files:**
- Modify: `src/stores/spaceshipStore.ts`

- [ ] **Step 1: 修改 createSpaceshipState 导入路径**

```typescript
// 第 3 行：
// 旧：import { createSpaceshipState } from '../engine/spaceship';
// 新：
import { createSpaceshipState } from '../engine/orbitalInjection';
```

- [ ] **Step 2: 运行 typecheck 确认整个项目通过**

```bash
npm run typecheck
```

Expected: PASS（零类型错误）

- [ ] **Step 3: Commit**

```bash
git add src/stores/spaceshipStore.ts
git commit -m "refactor: spaceshipStore 改用 orbitalInjection 初始化飞船"
```

---

### Task 5: 验证

**Files:** 无修改

- [ ] **Step 1: 运行完整 typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: 运行 dev server 并手动验证**

```bash
npm run dev
```

打开浏览器访问 Explore 页面，确认：
1. 飞船在地球附近出现（非远处/非撞地）
2. 飞船自动绕地球飞行
3. Dashboard 显示轨道高度约 400 km、速度约 7.6-7.7 km/s
4. MiniMap 中飞船轨迹为闭合圆环
5. 推力控制（加速/减速/转向）正常工作
6. 碰撞地球后显示「飞行终止」

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 4: Commit（如有问题修复则提交）**

```bash
git add -u
git commit -m "fix: 飞船绕飞验证后修复"
```
