# 坐标系统重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单一 display-scale 坐标空间拆分为物理空间(P)、渲染空间(R)、画布空间(C) 三个独立空间，物理引擎使用真实物理常数。

**Architecture:** 新增 `coordinateTransform.ts` 承载所有 P↔R 纯函数转换；物理引擎改用真实 G=6.674e-11 + 真实质量；每帧渲染前将物理坐标转为渲染坐标；用户放置时反向转换。

**Tech Stack:** TypeScript strict, Three.js, Zustand, React 18

---

### Task 1: 创建坐标转换模块

**Files:**
- Create: `src/engine/coordinateTransform.ts`

- [ ] **Step 1: 编写所有转换函数**

```typescript
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
```

- [ ] **Step 2: 运行 typecheck 确认无编译错误**

```bash
npm run typecheck
```
Expected: PASS（无引用此文件的消费者，不应报错）

---

### Task 2: 重构常量定义

**Files:**
- Modify: `src/engine/constants.ts`

- [ ] **Step 1: 替换 G、SIM_CONFIG、DISPLAY_CONFIG、DRAG_CONFIG**

删除旧常量 `G`、`MASS_SCALE`、`displayMass`、`SIM_CONFIG`、`DISPLAY_CONFIG`、`DRAG_CONFIG`，替换为：

```typescript
// 替换原有 G (line 53) 和 MASS_SCALE + displayMass (lines 55-60)
export const PHYSICAL_CONSTANTS = {
  G: 6.674e-11,
  sunMass: 1.989e30,
  sunRadius: 6.9634e8,
  timeScale: 1e5,       // 时间加速因子（1 实际秒 = 1e5 模拟秒 ≈ 1.16 天）
  softeningFactor: 1e9, // 引力软化因子 (米)
  collisionThreshold: 1e9, // 碰撞检测阈值 (米)
};

// 替换原有 SIM_CONFIG
export const SIM_CONFIG = {
  timeStep: 0.016,
  maxSubsteps: 1,
};

// 替换原有 DISPLAY_CONFIG
export const SPATIAL_TRANSFORM = {
  orbitCompressionPower: 0.3,
  orbitScaleFactor: 100,
  sunRenderRadius: 50,
  planetLogBase: 1e6,
  planetScaleFactor: 8,
  minRenderRadius: 3,
  referencePlaneColor: 0x334466,
  referencePlaneOpacity: 0.3,
  maxOrbitRadius: 2000,
};

// 替换原有 DRAG_CONFIG — 速度值改为物理单位 (m/s)
export const DRAG_CONFIG = {
  speedScale: 2e-6,     // 渲染拖拽距离 → 物理速度缩放
  maxSpeed: 200000,     // 最大物理初速度 (m/s)，约 200 km/s
  arrowColor: 0x00ff00,
  guideArrowColor: 0xffaa00,
};
```

保留 `REAL_DATA`、`CELESTIAL_TEMPLATES`、`PLANET_ORDER`、`HINT_ORDER`、`SCORING_CONFIG`、`AUDIO_FILES` 不变。

- [ ] **Step 2: 修复所有引用了旧常量的 imports**

搜索 `from './constants'` 和 `from '../../engine/constants'` 的所有 import，更新引用：
- 删除 `G` 的单独 import，改为 `PHYSICAL_CONSTANTS`
- 删除 `displayMass` 的 import
- 删除 `DISPLAY_CONFIG` 的 import，改为 `SPATIAL_TRANSFORM` 或直接使用坐标转换函数

- [ ] **Step 3: 运行 typecheck 确认无编译错误**

```bash
npm run typecheck
```

---

### Task 3: 更新物理引擎

**Files:**
- Modify: `src/engine/physics.ts`

- [ ] **Step 1: 更新 imports 和常量引用**

```typescript
// 旧 (line 2):
import { G, SIM_CONFIG } from './constants';

// 新:
import { PHYSICAL_CONSTANTS, SIM_CONFIG } from './constants';
```

- [ ] **Step 2: 更新 computeAccelerations 使用新 G**

在 `computeAccelerations` 函数中（line 38），将 `G` 替换为 `PHYSICAL_CONSTANTS.G`：

```typescript
const factor = PHYSICAL_CONSTANTS.G / (distSoft * distSoft * distSoft);
```

- [ ] **Step 3: 更新 softeningFactor 引用**

在 `computeAccelerations` 的默认参数（line 28），将 `SIM_CONFIG.softeningFactor` 替换为 `PHYSICAL_CONSTANTS.softeningFactor`：

```typescript
export function computeAccelerations(
  bodies: CelestialBody[],
  softening: number = PHYSICAL_CONSTANTS.softeningFactor
): [number, number, number][] {
```

- [ ] **Step 4: 更新 advanceSimulation 返回 simDelta**

将 `advanceSimulation` 的返回值从 `steps`（步数）改为 `simDelta`（实际模拟时间秒数），让调用方知道实际模拟了多少物理时间：

```typescript
// 旧 (line 143-157):
export function advanceSimulation(bodies: CelestialBody[], realDelta: number): number {
  if (bodies.length < 2) return 0;
  const simDelta = realDelta * SIM_CONFIG.timeScale;
  const steps = ...
  return steps; // ← 改这里
}

// 新: 使用 PHYSICAL_CONSTANTS.timeScale 替代 SIM_CONFIG.timeScale，返回 simDelta
export function advanceSimulation(bodies: CelestialBody[], realDelta: number): number {
  if (bodies.length < 2) return 0;
  const simDelta = realDelta * PHYSICAL_CONSTANTS.timeScale;
  const steps = Math.min(
    Math.max(1, Math.floor(simDelta / SIM_CONFIG.timeStep)),
    SIM_CONFIG.maxSubsteps
  );
  const subDt = simDelta / steps;
  for (let s = 0; s < steps; s++) {
    rk4Step(bodies, subDt);
  }
  return simDelta;
}
```

- [ ] **Step 5: 更新碰撞检测阈值**

在 `detectCollisions` 函数中（line 106），将 `threshold` 从 `1e7` 改为 `PHYSICAL_CONSTANTS.collisionThreshold`：

```typescript
export function detectCollisions(bodies: CelestialBody[]): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const n = bodies.length;
  const threshold = PHYSICAL_CONSTANTS.collisionThreshold;
  // ... rest unchanged
```

- [ ] **Step 6: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 4: 更新评分系统

**Files:**
- Modify: `src/engine/scoring.ts`

- [ ] **Step 1: 将 orbit radius log-scale 比较改为线性**

`scoreBuild` 函数中的 orbitRadiusScore 计算（lines 42-47）：将 `log10` 比较改为直接线性百分比误差：

```typescript
// 旧:
const logError = Math.abs(Math.log10(actualR) - Math.log10(ref.semiMajorAxis))
  / Math.log10(ref.semiMajorAxis) * 100;

// 新:
const radiusError = Math.abs(actualR - ref.semiMajorAxis) / ref.semiMajorAxis * 100;
orbitRadiusScore = Math.max(0, config.orbitRadiusWeight
  * Math.max(0, 1 - radiusError / config.allowedErrorPercent));
```

同样的改动应用到 `calculateErrors` 函数中的 orbitRadiusError （lines 108-110）：

```typescript
// 旧:
const orbitRadiusError = data.semiMajorAxis
  ? Math.abs(Math.log10(actualR) - Math.log10(data.semiMajorAxis)) / Math.log10(data.semiMajorAxis) * 100
  : 0;

// 新:
const orbitRadiusError = data.semiMajorAxis
  ? Math.abs(actualR - data.semiMajorAxis) / data.semiMajorAxis * 100
  : 0;
```

- [ ] **Step 2: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 5: 更新 Zustand store 语义

**Files:**
- Modify: `src/stores/buildStore.ts`

- [ ] **Step 1: 更新 advanceSimulation 方法的 simDelta 处理**

`advanceSimulation` 方法（line 126-130）原先接收 `dt * 100`，现在接收 `simDelta`（物理秒数）。更新 `simulatedTime` 累加逻辑的文档注释：

```typescript
// 旧 (line 126-130):
advanceSimulation: (simDelta) => {
  set(state => ({
    simulatedTime: state.simulatedTime + simDelta,
  }));
},

// 新 — 代码不变，但语义更新：simDelta 现在是真正的物理秒数
advanceSimulation: (simDelta) => {
  set(state => ({
    simulatedTime: state.simulatedTime + simDelta,
  }));
},
```

`placeBody` 签名不变，调用方负责传正确的物理坐标和质量。无需修改 `placeBody`、`removeBody`、`modifyMass` 等其他方法代码，仅注释更新。

- [ ] **Step 2: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 6: 更新渲染 bodies 模块

**Files:**
- Modify: `src/rendering/bodies.ts`

- [ ] **Step 1: 更新 imports**

```typescript
// 删除:
import { DISPLAY_CONFIG, REAL_DATA } from '../engine/constants';

// 新增:
import { REAL_DATA, SPATIAL_TRANSFORM } from '../engine/constants';
import { physicalToRender, physicalRadiusToRender, physicalDistanceToRender } from '../engine/coordinateTransform';

// 移除 SUN_RADIUS 常量（line 26），改为直接从 SPATIAL_TRANSFORM 读取
// 删除 planetVisualRadius、displayOrbitRadius、visualRadius 函数（lines 29-48）
```

- [ ] **Step 2: 修复 createBodyMesh 的 group/mesh 位置关系**

```typescript
// 旧 (line 75, 100, 102-104):
const radius = visualRadius(body.templateId);
const geometry = new THREE.SphereGeometry(radius, isSun ? 64 : 32, isSun ? 64 : 32);
mesh.position.set(body.position[0], body.position[1], body.position[2]);
const group = new THREE.Group();
group.add(mesh);

// 新:
const data = REAL_DATA[body.templateId];
const renderRadius = physicalRadiusToRender(data?.radius ?? 1e6, body.templateId === 'sun');
const geometry = new THREE.SphereGeometry(renderRadius, isSun ? 64 : 32, isSun ? 64 : 32);
const mesh = new THREE.Mesh(geometry, material);
// mesh 固定在 group 原点，group 负责位置
mesh.position.set(0, 0, 0);
const group = new THREE.Group();
group.add(mesh);
// 将 group 放在渲染空间位置
const renderPos = physicalToRender(body.position);
group.position.set(renderPos[0], renderPos[1], renderPos[2]);
```

Saturn rings 也使用 `renderRadius`（已由 `physicalRadiusToRender` 计算）。

- [ ] **Step 3: 更新 updateBodyMeshes**

```typescript
// 旧 (lines 125-131):
export function updateBodyMeshes(bodies: CelestialBody[], _dt: number): void {
  for (const body of bodies) {
    const bm = bodyMeshMap.get(body.id);
    if (!bm) continue;
    bm.group.position.set(body.position[0], body.position[1], body.position[2]);
  }
}

// 新:
export function updateBodyMeshes(bodies: CelestialBody[], _dt: number): void {
  for (const body of bodies) {
    const bm = bodyMeshMap.get(body.id);
    if (!bm) continue;
    const renderPos = physicalToRender(body.position);
    bm.group.position.set(renderPos[0], renderPos[1], renderPos[2]);
  }
}
```

- [ ] **Step 4: 移除旧导出函数**

删除文件末尾的 `planetVisualRadius`、`displayOrbitRadius`、`visualRadius` 导出函数。

- [ ] **Step 5: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 7: 更新 interaction 模块

**Files:**
- Modify: `src/rendering/interaction.ts`

- [ ] **Step 1: 移除不再需要的导入**

`getPlacementPoint` 和 `selectBodiesInRect` 功能的 Three.js 空间计算不需要修改。但需要确保 `setBodyHighlight` 仍然通过 `bodyMeshMap` 操作 mesh 对象（mesh 仍在渲染空间），无需改动。

实际上 `interaction.ts` 不需要任何实质修改——所有函数操作的是 Three.js 渲染空间坐标，不受物理层变化影响。验证函数签名和导入即可。

- [ ] **Step 2: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 8: 更新 uiStore 添加鼠标坐标状态

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/uiStore.ts`

- [ ] **Step 1: 在 types/index.ts 中给 UIState 添加坐标字段**

```typescript
export interface UIState {
  selectedToolId: CelestialBodyId | null;
  selectedBodyIds: string[];
  supervisionMode: boolean;
  showHint: boolean;
  isPlacing: boolean;
  hintIndex: number;
  showScoreModal: boolean;
  previewPosition: [number, number, number] | null;
  previewSpeed: number;
  // 新增：
  mouseCanvasPos: [number, number] | null;
  mouseRenderPos: [number, number, number] | null;
  mousePhysicalPos: [number, number, number] | null;
}
```

- [ ] **Step 2: 更新 uiStore.ts 实现**

```typescript
// 添加初始状态:
mouseCanvasPos: null,
mouseRenderPos: null,
mousePhysicalPos: null,

// 添加 setter:
setMousePositions: (
  canvasPos: [number, number] | null,
  renderPos: [number, number, number] | null,
  physicalPos: [number, number, number] | null
) => set({ mouseCanvasPos: canvasPos, mouseRenderPos: renderPos, mousePhysicalPos: physicalPos }),

// 在 resetUI 中重置:
mouseCanvasPos: null,
mouseRenderPos: null,
mousePhysicalPos: null,
```

同时更新 `UIStore` interface 添加 `setMousePositions` 方法签名。

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 9: 重构 Canvas3D 放置流程

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx`

- [ ] **Step 1: 更新 imports**

```typescript
// 删除:
import { createBodyMesh, updateBodyMeshes, removeBodyMesh, bodyMeshMap, visualRadius, displayOrbitRadius } from '../../rendering/bodies';
import { REAL_DATA, DRAG_CONFIG, HINT_ORDER, displayMass } from '../../engine/constants';

// 新增:
import { createBodyMesh, updateBodyMeshes, removeBodyMesh, bodyMeshMap } from '../../rendering/bodies';
import { REAL_DATA, PHYSICAL_CONSTANTS, SPATIAL_TRANSFORM, DRAG_CONFIG, HINT_ORDER } from '../../engine/constants';
import { renderToPhysical, physicalToRender, renderVelocityToPhysical, physicalVelocityToRender, physicalDistanceToRender, physicalRadiusToRender } from '../../engine/coordinateTransform';
import { vec3Length } from '../../engine/physics';
```

- [ ] **Step 2: 更新动画循环中的仿真时间**

```typescript
// 旧 (lines 88-89):
advanceSimulation(bodies, dt);
advanceSim(dt * 100);

// 新 — advanceSimulation 现在返回 simDelta (物理秒数):
const simDelta = advanceSimulation(bodies, dt);
advanceSim(simDelta);
```

- [ ] **Step 3: 更新 handleMouseDown（mousedown 放置起点）**

将 `handleMouseDown` 中的放置逻辑从纯渲染空间改为「渲染 → 物理」转换：

```typescript
// 旧 (lines 196-215):
if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
  const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
  if (!point) return;
  removeFloatingPreview(setup.scene);
  dragStartRef.current = point.clone();
  setIsPlacing(true);
  useBuildStore.getState().pauseBuild();
  // ... preview sphere with visualRadius(selectedToolId)
  createPreviewSphere(setup.scene, point, visualRadius(selectedToolId), color);
}

// 新:
if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
  const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
  if (!point) return;
  removeFloatingPreview(setup.scene);
  dragStartRef.current = point.clone();
  setIsPlacing(true);
  useBuildStore.getState().pauseBuild();

  const data = REAL_DATA[selectedToolId];
  if (data) {
    const renderRadius = physicalRadiusToRender(data.radius, false);
    // ... DEFAULT_COLORS ...
    createPreviewSphere(setup.scene, point, renderRadius, color);
  }
}
```

- [ ] **Step 4: 更新 handleMouseMove（预放置预览）**

```typescript
// 旧 (lines 225-240):
if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
  const point = getPlacementPoint(...);
  if (point) {
    setPreviewPosition([point.x, point.y, point.z]);
    // ... createFloatingPreview with visualRadius(selectedToolId)
    createFloatingPreview(setup.scene, point, visualRadius(selectedToolId), ...);
  }
}

// 新 — 使用 physicalRadiusToRender:
if (selectedToolId && selectedToolId !== 'sun' && !isPlacing) {
  const point = getPlacementPoint(...);
  if (point) {
    setPreviewPosition([point.x, point.y, point.z]);
    const data = REAL_DATA[selectedToolId];
    if (data) {
      const renderRadius = physicalRadiusToRender(data.radius, false);
      createFloatingPreview(setup.scene, point, renderRadius, DEFAULT_COLORS[selectedToolId] ?? 0x4488ff, selectedToolId);
    }
  }
}
```

- [ ] **Step 5: 更新 handleMouseMove（拖拽设定初速度）**

```typescript
// 旧 (lines 241-249):
} else if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
  const currentPoint = getPlacementPoint(...);
  if (!currentPoint) return;
  const dir = new THREE.Vector3().subVectors(currentPoint, dragStartRef.current);
  const speed = Math.min(dir.length() * DRAG_CONFIG.speedScale, DRAG_CONFIG.maxSpeed);
  setPreviewSpeedStore(speed);
  if (dir.length() > 0.01) {
    updateVelocityArrow(setup.scene, dragStartRef.current, currentPoint, DRAG_CONFIG.arrowColor);
  }
}

// 新 — 计算物理速度用于显示:
} else if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
  const currentPoint = getPlacementPoint(...);
  if (!currentPoint) return;
  const dir = new THREE.Vector3().subVectors(currentPoint, dragStartRef.current);
  if (dir.length() > 0.01) {
    // 转换物理位置
    const physPos = renderToPhysical([dragStartRef.current.x, dragStartRef.current.y, dragStartRef.current.z]);
    // 渲染拖拽速度 → 物理速度
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
```

- [ ] **Step 6: 更新 handleMouseUp（释放天体）**

```typescript
// 旧 (lines 265-279):
if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
  const point = getPlacementPoint(...);
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
  placeBody(selectedToolId, pos, vel, displayMass(data?.mass ?? 1e24));
  ...

// 新 — 位置和速度先转为物理再存储:
if (isPlacing && dragStartRef.current && selectedToolId && selectedToolId !== 'sun') {
  const point = getPlacementPoint(...);
  // 物理位置
  const physPos = renderToPhysical([dragStartRef.current.x, dragStartRef.current.y, dragStartRef.current.z]);
  // 物理速度
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
```

- [ ] **Step 7: 更新太阳自动放置**

```typescript
// 旧 (line 136):
placeBody('sun', [0, 0, 0], [0, 0, 0], displayMass(sunData.mass));

// 新 — 使用真实质量:
placeBody('sun', [0, 0, 0], [0, 0, 0], REAL_DATA.sun.mass);
```

- [ ] **Step 8: 更新 hint 系统使用物理转换**

```typescript
// 旧 (lines 169-179):
const displayDist = displayOrbitRadius(data.semiMajorAxis);
// ...
const suggestPos = new THREE.Vector3(displayDist, 0, 0).add(sunPos);
if (data.orbitalSpeed) {
  const speedPx = (data.orbitalSpeed / 1000) * 0.2;
  const suggestTo = suggestPos.clone().add(tangentDir.clone().multiplyScalar(speedPx / DRAG_CONFIG.speedScale));
  updateGuideArrow(setup.scene, suggestPos, suggestTo, DRAG_CONFIG.guideArrowColor);
}

// 新 — 使用 physicalDistanceToRender 和 physicalVelocityToRender:
const displayDist = physicalDistanceToRender(data.semiMajorAxis);
// ...
const suggestPos = new THREE.Vector3(displayDist, 0, 0).add(sunPos);
if (data.orbitalSpeed) {
  // 计算物理位置对应的渲染空间速度，用于 guide arrow 长度
  const pP: [number, number, number] = renderToPhysical([suggestPos.x - sunPos.x, suggestPos.y - sunPos.y, 0]);
  const vP_tangent: [number, number, number] = [tangentDir.x * data.orbitalSpeed, tangentDir.y * data.orbitalSpeed, 0];
  const vR = physicalVelocityToRender(vP_tangent, pP);
  const dragLength = Math.sqrt(vR[0] * vR[0] + vR[1] * vR[1] + vR[2] * vR[2]) / DRAG_CONFIG.speedScale;
  const suggestTo = suggestPos.clone().add(tangentDir.clone().multiplyScalar(dragLength));
  updateGuideArrow(setup.scene, suggestPos, suggestTo, DRAG_CONFIG.guideArrowColor);
}
```

- [ ] **Step 9: 添加鼠标坐标更新到 uiStore**

在 `handleMouseMove` 的最前面添加坐标更新逻辑：

```typescript
const handleMouseMove = useCallback((e: React.MouseEvent) => {
  const setup = setupRef.current;
  if (!setup) return;

  // 更新所有空间的鼠标坐标到 store
  const canvasPos: [number, number] = [e.clientX, e.clientY];
  const point = getPlacementPoint(e.nativeEvent, setup.camera, canvasRef.current!);
  if (point) {
    const renderPos: [number, number, number] = [point.x, point.y, point.z];
    const physPos = renderToPhysical(renderPos);
    useUIStore.getState().setMousePositions(canvasPos, renderPos, physPos);
  } else {
    useUIStore.getState().setMousePositions(canvasPos, null, null);
  }

  // ... rest of handleMouseMove unchanged
}, [...]);
```

- [ ] **Step 10: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 10: 创建坐标行组件

**Files:**
- Create: `src/components/CoordinateDisplay.tsx`
- Create: `src/components/CoordinateDisplay.css`

- [ ] **Step 1: 编写 CoordinateDisplay.css**

```css
/* src/components/CoordinateDisplay.css */

.coordinate-display {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  background: #0d0d2a;
  border-top: 1px solid #1a1a3a;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #8899bb;
  flex-shrink: 0;
  overflow: hidden;
}

.coordinate-row {
  display: flex;
  align-items: center;
  white-space: nowrap;
  gap: 0;
}

.coordinate-row .sep {
  color: #334466;
  margin: 0 8px;
}

.coordinate-row .label {
  color: #667799;
}

.coordinate-row .value {
  color: #aabbcc;
  margin-left: 4px;
}

.coordinate-row .unit {
  color: #667799;
  margin-left: 2px;
  font-size: 10px;
}

.coordinate-display .placeholder {
  color: #334466;
}
```

- [ ] **Step 2: 编写 CoordinateDisplay.tsx**

```typescript
// src/components/CoordinateDisplay.tsx
import { useUIStore } from '../stores/uiStore';
import { REAL_DATA, PHYSICAL_CONSTANTS } from '../engine/constants';
import { physicalRadiusToRender } from '../engine/coordinateTransform';
import './CoordinateDisplay.css';

function formatPhysical(val: number): string {
  if (Math.abs(val) < 1 && val !== 0) return val.toExponential(2);
  if (Math.abs(val) >= 1e6) return val.toExponential(3);
  return val.toFixed(1);
}

function formatRender(val: number): string {
  return val.toFixed(1);
}

function fmtThree(pos: [number, number, number] | null): string {
  if (!pos) return '(—, —, —)';
  return `(${formatRender(pos[0])}, ${formatRender(pos[1])}, ${formatRender(pos[2])})`;
}

function fmtTwo(pos: [number, number] | null): string {
  if (!pos) return '(—, —)';
  return `(${pos[0].toFixed(0)}, ${pos[1].toFixed(0)})`;
}

export default function CoordinateDisplay() {
  const mouseCanvasPos = useUIStore(s => s.mouseCanvasPos);
  const mouseRenderPos = useUIStore(s => s.mouseRenderPos);
  const mousePhysicalPos = useUIStore(s => s.mousePhysicalPos);
  const selectedToolId = useUIStore(s => s.selectedToolId);
  const isPlacing = useUIStore(s => s.isPlacing);

  const showBodySize = selectedToolId && mouseCanvasPos;

  return (
    <div className="coordinate-display">
      <div className="coordinate-row">
        <span className="label">[画布]</span>
        <span className="value">{fmtTwo(mouseCanvasPos)}</span>
        <span className="sep">|</span>
        <span className="label">[渲染]</span>
        <span className="value">{fmtThree(mouseRenderPos)}</span>
        <span className="sep">|</span>
        <span className="label">[物理]</span>
        <span className="value">{fmtThree(mousePhysicalPos)}</span>
        <span className="unit">m</span>
      </div>
      {showBodySize && (
        <div className="coordinate-row">
          <span className="label">天体: {selectedToolId === 'sun' ? '太阳' : REAL_DATA[selectedToolId]?.name ?? selectedToolId}</span>
          <span className="sep">|</span>
          <span className="label">画布:</span>
          <span className="value">{selectedToolId === 'sun' ? '50.0' : formatRender(physicalRadiusToRender(REAL_DATA[selectedToolId]?.radius ?? 1e6, false)).toFixed(1)}</span>
          <span className="unit">px</span>
          <span className="sep">|</span>
          <span className="label">渲染:</span>
          <span className="value">{selectedToolId === 'sun' ? '50.0' : formatRender(physicalRadiusToRender(REAL_DATA[selectedToolId]?.radius ?? 1e6, false))}</span>
          <span className="unit">uv</span>
          <span className="sep">|</span>
          <span className="label">物理:</span>
          <span className="value">{selectedToolId === 'sun' ? `${(PHYSICAL_CONSTANTS.sunRadius / 1e9).toFixed(2)}×10⁹` : `${(REAL_DATA[selectedToolId]?.radius ?? 0 / 1e6).toFixed(2)}×10⁶`}</span>
          <span className="unit">m</span>
          {selectedToolId !== 'sun' && (
            <>
              <span className="sep">|</span>
              <span className="label">质量:</span>
              <span className="value">{formatPhysical(REAL_DATA[selectedToolId]?.mass ?? 0)}</span>
              <span className="unit">kg</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 11: 更新 App 布局集成坐标行

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: 修改 App.tsx 引入 CoordinateDisplay**

```typescript
// 新增 import:
import CoordinateDisplay from './components/CoordinateDisplay';

// 在 .app-panel-center 中，Canvas3D 下方插入 CoordinateDisplay:
<div className="app-panel-center">
  <div className="canvas-wrapper">
    <Canvas3D />
  </div>
  <CoordinateDisplay />
  <CameraControls />
</div>
```

- [ ] **Step 2: 修改 App.css**

```css
.app-panel-center {
  position: relative;
  overflow: hidden;
  background: #050510;
  display: flex;
  flex-direction: column;
}

.canvas-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}
```

同时将 `CameraControls` 的 z-index 确保在 canvas-wrapper 之上显示。

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 12: 更新 ControlPanel 速度显示适配

**Files:**
- Modify: `src/components/controls/ControlPanel.tsx`

- [ ] **Step 1: 更新预览速度显示语义**

`previewSpeed` 现在是物理速度 (m/s)，`formatSpeed` 函数已经格式化为 m/s 或 km/s，无需修改。确保放置信息中的 speed 显示正确即可。

控制面板中「释放位置」目前显示 `formatDistance(Math.abs(pos[0]))`，其中 `pos` 来自 `uiStore.previewPosition` 是渲染坐标。需要更新为显示物理距离：

```typescript
// 旧 (lines 146-148):
<span>释放位置</span>
<span style={{ fontSize: 10, fontFamily: 'monospace' }}>
  {pos ? `${formatDistance(Math.abs(pos[0]))}, ${formatDistance(Math.abs(pos[1]))}` : '-'}
</span>

// 新 — 转为物理距离:
{pos ? (() => {
  const physPos = renderToPhysical([pos[0], pos[1], pos[2]]);
  const dist = Math.sqrt(physPos[0] * physPos[0] + physPos[1] * physPos[1]);
  return <span style={{ fontSize: 10, fontFamily: 'monospace' }}>{formatDistance(dist)}</span>;
})() : '-'}
```

需要导入 `renderToPhysical`：
```typescript
import { renderToPhysical } from '../../engine/coordinateTransform';
```

- [ ] **Step 2: 更新监督模式速度显示**

监督模式下选中天体的速度（line 243）现在 `selectedBody.velocity` 存储的是物理速度 (m/s)。`formatSpeed` 已支持 m/s/km/s 格式化，无需改动。

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck
```

---

### Task 13: 最终验证

- [ ] **Step 1: 运行完整 typecheck**

```bash
npm run typecheck
```
Expected: PASS，无 TypeScript 错误。

- [ ] **Step 2: 运行 dev 构建验证**

```bash
npm run build
```
Expected: PASS，构建成功。

- [ ] **Step 3: 手动功能验证 check 清单**

1. 启动 dev server，点击太阳 → 太阳在画面中心出现
2. 选择地球 → 在画布上移动鼠标 → 底部坐标行显示画布/渲染/物理三个坐标
3. 底部坐标行第二行显示地球的三种尺寸和物理质量
4. 点击放置地球 → 预览球体在正确位置
5. 拖拽设置初速度 → 绿色箭头正确显示，右侧面板和底部 speed 显示物理速度 (m/s)
6. 释放地球 → 天体出现在正确位置
7. 点击 ▶ 开始 → 天体能正常轨道运动
8. 点击 👁 监督 → 轨道环在正确渲染位置出现，误差计算正常
9. 撤销/重做 → 正常
10. 框选天体 → 正常高亮
