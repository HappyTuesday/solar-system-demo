# 探索导航增强与仪表盘重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构探索页仪表盘布局（HUD + 等宽三栏），新增霍曼转移导航路线规划引擎，导航地图显示轨道线，文案"目标→目的地"同步修改。

**Architecture:** 纯逻辑引擎 `navigation.ts` 规划霍曼转移 → `spaceshipStore` 存储导航状态 → `HUD` 悬浮显示参数 → `Dashboard` 分三栏（飞行控制/导航路线/导航地图）→ `MiniMap` 渲染轨道线。不实现自动驾驶。

**Tech Stack:** React 19 + TypeScript + Zustand + Canvas 2D (MiniMap)

---

## 文件结构

```
新建:
  src/engine/navigation.ts           — 霍曼转移路线规划引擎
  src/components/explore/HUD.tsx     — HUD 参数悬浮显示
  src/components/explore/HUD.css     — HUD 样式

修改:
  src/engine/constants.ts            — 新增 NAVIGATION_CONFIG
  src/stores/spaceshipStore.ts       — 新增导航计划/阶段/偏离状态
  src/components/explore/Dashboard.tsx — 三栏重构，移除基本参数/绕飞参数
  src/components/explore/Dashboard.css — 新三栏布局样式
  src/components/explore/MiniMap.tsx   — 导航轨道线渲染
  src/components/explore/TargetSelectionModal.tsx — 文案"目标→目的地"
  src/components/explore/TargetSelectionModal.css — 标题文案调整
  src/pages/ExplorePage.tsx          — 新增 HUD 组件
  src/pages/ExplorePage.css          — 布局适配
```

---

### Task 1: 新增导航配置常量

**Files:**
- Modify: `src/engine/constants.ts`

- [ ] **Step 1: 在 constants.ts 末尾添加 NAVIGATION_CONFIG**

```ts
export const NAVIGATION_CONFIG = {
  deviationCheckInterval: 5,
  deviationThresholdAU: 0.01,
  phaseCompletionThresholdAU: 0.005,
  rePlanCooldownSec: 30,
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/engine/constants.ts
git commit -m "feat: add NAVIGATION_CONFIG constants"
```

---

### Task 2: 新增导航路线规划引擎

**Files:**
- Create: `src/engine/navigation.ts`

- [ ] **Step 1: 创建 navigation.ts 并定义类型和计划函数**

```ts
import { REAL_DATA, MU_SUN, AU_TO_M, NAVIGATION_CONFIG } from './constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from './orbital';

const SCALE = 1 / AU_TO_M;
const AU_TO_KM = 1.496e8;

export interface NavigationPhase {
  index: number;
  name: string;
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  deltaV: number;
  expectedSpeedKms: number;
  targetOrbit: {
    semiMajorAxis: number;
    eccentricity: number;
  };
}

export interface NavigationPlan {
  phases: NavigationPhase[];
  method: 'hohmann';
  destinationId: string;
  plannedAt: number;
}

function computeBodyState(templateId: string, jd: number): { position: [number, number, number]; velocity: [number, number, number] } | null {
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

function computeOrbitalSemiMajorAxis(
  pos: [number, number, number],
  vel: [number, number, number],
  mu: number,
): number {
  const r = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
  const v2 = vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2;
  const a = 1 / (2 / r - v2 / mu);
  return Math.abs(a);
}

export function planHohmannTransfer(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  simulatedTime: number,
): NavigationPlan {
  const jd = julianDate(simulatedTime);

  // 飞船当前轨道
  const aCurrentAU = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);

  let aTargetMeters: number;
  if (destinationId === 'sun') {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }

  const destData = REAL_DATA[destinationId];
  if (!destData || !destData.semiMajorAxis) {
    return { phases: [], method: 'hohmann', destinationId, plannedAt: simulatedTime };
  }
  aTargetMeters = destData.semiMajorAxis;

  const aTargetAU = aTargetMeters / AU_TO_M;
  const aTransferAU = (aCurrentAU + aTargetAU) / 2;

  // 内行星 → 向外（正向推力）；外行星 → 向内（反向推力）
  const goingOutward = aTargetAU > aCurrentAU;

  // 阶段1：改变远日点（从当前轨道到转移轨道）
  const deltaV1 = Math.sqrt(MU_SUN / aCurrentAU) *
    (Math.sqrt(2 * aTargetAU / (aCurrentAU + aTargetAU)) - 1);

  // 阶段3：目标捕获（从转移轨道到目标轨道）
  const deltaV3 = Math.sqrt(MU_SUN / aTargetAU) *
    (1 - Math.sqrt(2 * aCurrentAU / (aCurrentAU + aTargetAU)));

  const phases: NavigationPhase[] = [
    {
      index: 0,
      name: goingOutward ? '提升远日点' : '降低近日点',
      thrustDirection: goingOutward ? 'forward' : 'backward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV1) * SCALE,
      expectedSpeedKms: Math.abs(deltaV1) / 1000,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: 1,
      name: '转移轨道滑行',
      thrustDirection: 'none',
      thrustMagnitude: 0,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTransferAU, eccentricity: 0.3 },
    },
    {
      index: 2,
      name: goingOutward ? '目标捕获制动' : '目标捕获加速',
      thrustDirection: goingOutward ? 'backward' : 'forward',
      thrustMagnitude: 100,
      deltaV: Math.abs(deltaV3) * SCALE,
      expectedSpeedKms: Math.abs(deltaV3) / 1000,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: destData.orbital?.eccentricity ?? 0 },
    },
    {
      index: 3,
      name: '绕飞圆化',
      thrustDirection: 'forward',
      thrustMagnitude: 50,
      deltaV: 0,
      expectedSpeedKms: 0,
      targetOrbit: { semiMajorAxis: aTargetAU, eccentricity: 0 },
    },
  ];

  return { phases, method: 'hohmann', destinationId, plannedAt: simulatedTime };
}

export function checkPhaseCompletion(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  simulatedTime: number,
): boolean {
  if (currentPhaseIdx < 0 || currentPhaseIdx >= plan.phases.length) return false;

  const phase = plan.phases[currentPhaseIdx];
  if (phase.thrustDirection === 'none') {
    // 滑行阶段：检查目标天体距离是否在接近
    const jd = julianDate(simulatedTime);
    const destState = computeBodyState(plan.destinationId, jd);
    if (!destState) return false;
    const dx = destState.position[0] * SCALE - shipPosition[0];
    const dy = destState.position[1] * SCALE - shipPosition[1];
    const dz = destState.position[2] * SCALE - shipPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < 0.1; // 距离目标 < 0.1 AU 视为进入下一阶段
  }

  // 推力阶段：检查轨道是否接近目标轨道
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);
  const aTarget = phase.targetOrbit.semiMajorAxis;
  const diff = Math.abs(aCurrent - aTarget);
  return diff < NAVIGATION_CONFIG.phaseCompletionThresholdAU;
}

export function checkDeviation(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  simulatedTime: number,
): { deviated: boolean; deviationAU: number; deviationKms: number } {
  if (currentPhaseIdx < 0 || currentPhaseIdx >= plan.phases.length) {
    return { deviated: false, deviationAU: 0, deviationKms: 0 };
  }

  const phase = plan.phases[currentPhaseIdx];
  const aCurrent = computeOrbitalSemiMajorAxis(shipPosition, shipVelocity, MU_SUN);
  const aTarget = phase.targetOrbit.semiMajorAxis;
  const devAU = Math.abs(aCurrent - aTarget);
  const devKms = devAU * AU_TO_KM;

  return {
    deviated: devAU > NAVIGATION_CONFIG.deviationThresholdAU * 2,
    deviationAU: devAU,
    deviationKms: devKms,
  };
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/engine/navigation.ts
git commit -m "feat: add Hohmann transfer navigation engine"
```

---

### Task 3: 扩展 spaceshipStore 导航状态

**Files:**
- Modify: `src/stores/spaceshipStore.ts`

- [ ] **Step 1: 添加导入和导航字段到 SpaceshipStore 接口**

在 `src/stores/spaceshipStore.ts` 顶部添加导入：

```ts
import type { NavigationPlan } from '../engine/navigation';
import { planHohmannTransfer, checkPhaseCompletion, checkDeviation } from '../engine/navigation';
import { NAVIGATION_CONFIG } from '../engine/constants';
```

在 `SpaceshipStore` 接口中添加字段（在 `targetBodyId` 之后）：

```ts
  // 导航
  navigationPlan: NavigationPlan | null;
  activePhaseIndex: number;
  deviationWarning: string | null;
  lastDeviationCheckTime: number;
  lastReplanTime: number;
```

添加动作：

```ts
  setNavigationPlan: (plan: NavigationPlan | null) => void;
  setActivePhaseIndex: (idx: number) => void;
  setDeviationWarning: (msg: string | null) => void;
  checkNavigationalDeviation: () => void;
  replanNavigation: () => void;
```

- [ ] **Step 2: 添加初始状态值**

在 `initialState` 对象中添加：

```ts
  navigationPlan: null as NavigationPlan | null,
  activePhaseIndex: -1 as number,
  deviationWarning: null as string | null,
  lastDeviationCheckTime: now as number,
  lastReplanTime: 0 as number,
```

- [ ] **Step 3: 添加 setTargetBody 增强逻辑和导航动作实现**

替换现有的 `setTargetBody` 实现，增加自动规划：

```ts
  setTargetBody: (id) => set(s => {
    const newMode = id !== null ? 'target' as AttitudeMode : 'inertial' as AttitudeMode;
    if (id !== null) {
      const plan = planHohmannTransfer(s.position, s.velocity, id, s.simulatedTime);
      return {
        targetBodyId: id,
        attitudeMode: newMode,
        navigationPlan: plan.phases.length > 0 ? plan : null,
        activePhaseIndex: plan.phases.length > 0 ? 0 : -1,
        deviationWarning: null,
        lastReplanTime: s.simulatedTime,
      };
    }
    return {
      targetBodyId: null,
      attitudeMode: newMode,
      navigationPlan: null,
      activePhaseIndex: -1,
      deviationWarning: null,
    };
  }),
```

添加导航相关动作：

```ts
  setNavigationPlan: (plan) => set({ navigationPlan: plan }),
  setActivePhaseIndex: (idx) => set({ activePhaseIndex: idx }),
  setDeviationWarning: (msg) => set({ deviationWarning: msg }),
  checkNavigationalDeviation: () => {
    const s = useSpaceshipStore.getState();
    if (!s.navigationPlan || s.activePhaseIndex < 0) return;

    // 检查阶段完成
    if (checkPhaseCompletion(s.position, s.velocity, s.navigationPlan, s.activePhaseIndex, s.simulatedTime)) {
      const nextIdx = s.activePhaseIndex + 1;
      if (nextIdx < s.navigationPlan.phases.length) {
        useSpaceshipStore.setState({ activePhaseIndex: nextIdx, deviationWarning: null });
      }
      return;
    }

    // 检查偏离
    const result = checkDeviation(s.position, s.velocity, s.navigationPlan, s.activePhaseIndex, s.simulatedTime);
    if (result.deviated) {
      const cooldown = s.simulatedTime - s.lastReplanTime;
      if (cooldown > NAVIGATION_CONFIG.rePlanCooldownSec * 1000) {
        useSpaceshipStore.setState({ deviationWarning: `偏离预定轨道 ${result.deviationKms.toFixed(0)} km，正在重规划...` });
        // 触发重规划
        useSpaceshipStore.getState().replanNavigation();
      }
    }
  },
  replanNavigation: () => {
    const s = useSpaceshipStore.getState();
    if (!s.navigationPlan || s.activePhaseIndex < 0) return;
    const plan = planHohmannTransfer(s.position, s.velocity, s.navigationPlan.destinationId, s.simulatedTime);
    // 保持已完成的阶段
    const completedPhases = s.navigationPlan.phases.slice(0, s.activePhaseIndex);
    const newPhases = plan.phases;
    // 如果新计划比已完成阶段少，以新计划为准
    if (newPhases.length <= s.activePhaseIndex) {
      useSpaceshipStore.setState({
        navigationPlan: { ...plan, phases: newPhases },
        activePhaseIndex: 0,
        deviationWarning: '路线已重规划',
        lastReplanTime: s.simulatedTime,
      });
    } else {
      useSpaceshipStore.setState({
        navigationPlan: { ...plan, phases: newPhases },
        deviationWarning: '路线已重规划',
        lastReplanTime: s.simulatedTime,
      });
    }
  },
```

在 `reset` 中也复位导航状态：

```ts
    navigationPlan: null as NavigationPlan | null,
    activePhaseIndex: -1 as number,
    deviationWarning: null as string | null,
    lastDeviationCheckTime: Date.now() as number,
    lastReplanTime: 0 as number,
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add src/stores/spaceshipStore.ts
git commit -m "feat: add navigation state fields to spaceshipStore"
```

---

### Task 4: 创建 HUD 组件

**Files:**
- Create: `src/components/explore/HUD.tsx`
- Create: `src/components/explore/HUD.css`

- [ ] **Step 1: 创建 HUD.css**

```css
.hud-container {
  position: fixed;
  bottom: 130px;
  left: 50%;
  transform: translateX(-50%);
  width: 1100px;
  z-index: 50;
  pointer-events: none;
  font-family: 'Courier New', monospace;
  padding: 0 18px;
}

.hud-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.hud-row-orbital {
  font-size: 10px;
  color: #778899;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}

.hud-row-basic {
  font-size: 10px;
  color: #778899;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}

.hud-label {
  color: #556677;
}

.hud-value-green {
  color: #00ff88;
}

.hud-value-blue {
  color: #88ccff;
}

.hud-value-yellow {
  color: #ffcc00;
}

.hud-value-orange {
  color: #ffaa33;
}

.hud-value-cyan {
  color: #00b8ff;
}

.hud-value-brown {
  color: #ccaa88;
}

.hud-value-purple {
  color: #cc88ff;
}

.hud-unit {
  color: #445566;
  font-size: 7px;
}
```

- [ ] **Step 2: 创建 HUD.tsx**

```tsx
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA } from '../../engine/constants';
import { julianDate, solveKepler, trueAnomaly, stateVectors, orbitalPeriod, meanAnomalyAtTime } from '../../engine/orbital';
import './HUD.css';

const SCALE = 1 / 1.496e11;
const AU_TO_KM = 1.496e8;
const MU_SUN_VALUE = 1.32712440018e20;
const ORBIT_THRESHOLD_AU = 0.005;

const ALL_IDS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

function computeBodyStateFull(templateId: string, jd: number) {
  const data = REAL_DATA[templateId];
  if (!data || !data.semiMajorAxis || !data.orbital) return null;
  const o = data.orbital;
  const period = orbitalPeriod(data.semiMajorAxis, MU_SUN_VALUE);
  const M = meanAnomalyAtTime(o.meanAnomalyAtEpoch, period, o.epoch, jd);
  const Mmod = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = solveKepler(Mmod, o.eccentricity);
  const nu = trueAnomaly(E, o.eccentricity);
  const sv = stateVectors(data.semiMajorAxis, o.eccentricity, o.inclination, o.longitudeAscendingNode, o.argumentOfPeriapsis, nu, MU_SUN_VALUE);
  return {
    position: [sv.position[0] * SCALE, sv.position[1] * SCALE, sv.position[2] * SCALE] as [number, number, number],
    velocity: [sv.velocity[0] * SCALE, sv.velocity[1] * SCALE, sv.velocity[2] * SCALE] as [number, number, number],
  };
}

export default function HUD() {
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);

  if (exploded) return null;

  const speedMs = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2) * AU_TO_KM;
  const effectiveSpeedKms = (velocity[0] * direction[0] + velocity[1] * direction[1] + velocity[2] * direction[2]) * AU_TO_KM;
  const jd = julianDate(simulatedTime);

  // 最近天体
  let nearestBodyName = '';
  let nearestBodyId = '';
  let nearestDistAU = Infinity;
  let nearestBodyVel: [number, number, number] = [0, 0, 0];
  let nearestBodyRadiusKm = 0;
  let nearestBodyPos: [number, number, number] = [0, 0, 0];

  for (const id of ALL_IDS) {
    if (id === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      const dist = Math.sqrt(dx2);
      if (dist < nearestDistAU) { nearestDistAU = dist; nearestBodyId = 'sun'; nearestBodyName = '太阳'; nearestBodyVel = [0, 0, 0]; nearestBodyRadiusKm = REAL_DATA.sun.radius / 1000; nearestBodyPos = [0, 0, 0]; }
    } else {
      const state = computeBodyStateFull(id, jd);
      if (!state) continue;
      const dx = state.position[0] - position[0];
      const dy = state.position[1] - position[1];
      const dz = state.position[2] - position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDistAU) { nearestDistAU = dist; nearestBodyId = id; nearestBodyName = REAL_DATA[id].name; nearestBodyVel = state.velocity; nearestBodyRadiusKm = REAL_DATA[id].radius / 1000; nearestBodyPos = state.position; }
    }
  }

  const nearestDistKm = nearestDistAU * AU_TO_KM;
  const altitudeKm = nearestDistKm - nearestBodyRadiusKm;
  const isOrbiting = nearestDistAU < ORBIT_THRESHOLD_AU && nearestDistAU > 1e-12;

  // 绕飞参数
  let relSpeedKms = 0;
  let angularVelDegS = 0;
  let orbitalPeriodMin = 0;
  let headingAngleDeg = 0;

  if (isOrbiting) {
    const relVelX = velocity[0] - nearestBodyVel[0];
    const relVelY = velocity[1] - nearestBodyVel[1];
    const relVelZ = velocity[2] - nearestBodyVel[2];
    const relSpeedAU = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
    relSpeedKms = relSpeedAU * AU_TO_KM;
    angularVelDegS = nearestDistAU > 1e-12 ? (relSpeedAU / nearestDistAU) * 180 / Math.PI : 0;
    orbitalPeriodMin = relSpeedKms > 1e-6 ? (2 * Math.PI * nearestDistKm / relSpeedKms) / 60 : 0;

    const velLen = Math.sqrt(relVelX ** 2 + relVelY ** 2 + relVelZ ** 2);
    const dirLen = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (velLen > 1e-15 && dirLen > 1e-15) {
      const dot = (direction[0] * relVelX + direction[1] * relVelY + direction[2] * relVelZ) / (dirLen * velLen);
      headingAngleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
  }

  // 目的地距离
  let targetDistAU = 0;
  let targetDistKm = 0;
  if (targetBodyId) {
    if (targetBodyId === 'sun') {
      const dx2 = position[0] ** 2 + position[1] ** 2 + position[2] ** 2;
      targetDistAU = Math.sqrt(dx2);
    } else {
      const ts = computeBodyStateFull(targetBodyId, jd);
      if (ts) {
        const dx = ts.position[0] - position[0];
        const dy = ts.position[1] - position[1];
        const dz = ts.position[2] - position[2];
        targetDistAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    targetDistKm = targetDistAU * AU_TO_KM;
  }

  const eclipticHeightKm = Math.abs(position[2]) * AU_TO_KM;

  return (
    <div className="hud-container">
      <div className="hud-row">
        {isOrbiting && (
          <div className="hud-row-orbital">
            绕飞 · <span className="hud-value-blue">{nearestBodyName}</span>
            <span className="hud-label">&nbsp;&nbsp;速度</span> <span className="hud-value-green">{relSpeedKms.toFixed(2)} km/s</span>
            <span className="hud-label">&nbsp;&nbsp;高度</span> <span className="hud-value-blue">{altitudeKm.toFixed(0)} km</span>
            <span className="hud-label">&nbsp;&nbsp;角速度</span> <span className="hud-value-yellow">{angularVelDegS.toFixed(4)} °/s</span>
            <span className="hud-label">&nbsp;&nbsp;周期</span> <span className="hud-value-orange">{orbitalPeriodMin.toFixed(1)} min</span>
            <span className="hud-label">&nbsp;&nbsp;船身夹角</span> <span className="hud-value-yellow">{headingAngleDeg.toFixed(1)}°</span>
          </div>
        )}
        <div className="hud-row-basic">
          <span className="hud-label">X</span> <span className="hud-value-green">{position[0].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;Y</span> <span className="hud-value-green">{position[1].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;Z</span> <span className="hud-value-green">{position[2].toFixed(4)}</span>
          <span className="hud-label">&nbsp;&nbsp;速度</span> <span className="hud-value-yellow">{speedMs.toFixed(0)} km/s</span>
          <span className="hud-label">&nbsp;&nbsp;有效速度</span> <span className="hud-value-green">{effectiveSpeedKms.toFixed(0)} km/s</span>
          <span className="hud-label">&nbsp;&nbsp;推力</span> <span className="hud-value-cyan">{thrustMagnitude} MN</span>
          <span className="hud-label">&nbsp;&nbsp;距{nearestBodyName}</span> <span className="hud-value-brown">{nearestDistAU < 0.1 ? `${nearestDistKm.toFixed(0)} km` : `${nearestDistAU.toFixed(3)} AU`}</span>
          {targetBodyId && (
            <>
              <span className="hud-label">&nbsp;&nbsp;距{REAL_DATA[targetBodyId]?.name || ''}</span> <span className="hud-value-green">{targetDistAU < 0.1 ? `${targetDistKm.toFixed(0)} km` : `${targetDistAU.toFixed(3)} AU`}</span>
            </>
          )}
          <span className="hud-label">&nbsp;&nbsp;黄道面</span> <span className="hud-value-purple">{eclipticHeightKm.toFixed(0)} km</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add src/components/explore/HUD.tsx src/components/explore/HUD.css
git commit -m "feat: add HUD component for flight parameters"
```

---

### Task 5: 修改 TargetSelectionModal 文案

**Files:**
- Modify: `src/components/explore/TargetSelectionModal.tsx`

- [ ] **Step 1: 修改文案**

在 `TargetSelectionModal.tsx` 中，将：

```tsx
<span className="target-modal-title">选择目标天体</span>
```

改为：

```tsx
<span className="target-modal-title">选择目的地天体</span>
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/TargetSelectionModal.tsx
git commit -m "feat: rename target to destination in TargetSelectionModal"
```

---

### Task 6: 改写 Dashboard.css 三栏布局

**Files:**
- Modify: `src/components/explore/Dashboard.css`

- [ ] **Step 1: 重写 Dashboard.css（完整替换）**

```css
.dashboard-container {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: 'Courier New', monospace;
}

.dashboard-panel {
  width: 1100px;
  background: rgba(5, 10, 30, 0.92);
  border: 1px solid rgba(0, 180, 255, 0.25);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 10px 18px 14px;
  color: #ccc;
}

.dashboard-panel-body {
  display: flex;
  gap: 24px;
}

.dashboard-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dashboard-column-separator {
  width: 0;
  border-left: 1px solid rgba(0, 180, 255, 0.12);
  align-self: stretch;
  flex-shrink: 0;
}

.dashboard-column-title {
  font-size: 8px;
  color: #445566;
}

/* ---- Thrust slider ---- */
.dashboard-thrust-row {
  position: relative;
  height: 22px;
}

.dashboard-thrust-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 5px;
  transform: translateY(-50%);
  background: rgba(0, 180, 255, 0.06);
  border: 1px solid rgba(0, 180, 255, 0.1);
  border-radius: 3px;
}

.dashboard-thrust-fill {
  position: absolute;
  top: 50%;
  left: 0;
  height: 5px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, #006699, #00b8ff 30%, #00ff88 65%, #ffaa33);
  border-radius: 3px 0 0 3px;
  pointer-events: none;
}

.dashboard-thrust-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 12px;
  background: #ffcc44;
  border: 1px solid rgba(0, 10, 20, 0.6);
  border-radius: 3px;
  pointer-events: none;
}

.dashboard-thrust-labels {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  font-size: 7px;
  color: #445566;
}

.dashboard-thrust-value {
  font-size: 7px;
  color: #445566;
  text-align: center;
  margin-top: -4px;
}

/* ---- Control pads (3x3 grids) ---- */
.dashboard-pads-row {
  display: flex;
  gap: 6px;
  flex: 1;
}

.dashboard-pad-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.dashboard-pad-label {
  font-size: 6px;
  color: #445566;
  text-align: center;
  margin-bottom: 1px;
}

.dashboard-pad-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  gap: 1px;
  flex: 1;
}

.dashboard-pad-btn {
  background: rgba(0, 180, 255, 0.08);
  border: 1px solid rgba(0, 180, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  border-radius: 2px;
  font-size: 10px;
  color: #88ccff;
  transition: all 0.12s;
  padding: 0;
}

.dashboard-pad-btn:hover {
  background: rgba(0, 180, 255, 0.2);
  color: #aaddff;
}

.dashboard-pad-btn:active {
  background: rgba(0, 180, 255, 0.35);
  color: #ffffff;
}

.dashboard-pad-btn.translate {
  color: #8899bb;
}

.dashboard-pad-btn.flip {
  font-size: 12px;
  font-weight: bold;
  color: #778899;
}

.dashboard-pad-btn.flip:hover {
  color: #ffaa33;
}

/* ---- Attitude mode buttons ---- */
.dashboard-mode-row {
  display: flex;
  border-radius: 3px;
  overflow: hidden;
}

.dashboard-mode-btn {
  flex: 1;
  background: rgba(0, 180, 255, 0.04);
  border: 1px solid rgba(0, 180, 255, 0.08);
  border-right: none;
  font-size: 7px;
  color: #556677;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  padding: 3px;
  transition: all 0.15s;
  text-align: center;
}

.dashboard-mode-btn:last-child {
  border-right: 1px solid rgba(0, 180, 255, 0.08);
}

.dashboard-mode-btn:hover {
  background: rgba(0, 180, 255, 0.15);
  color: #8899bb;
}

.dashboard-mode-btn.active {
  background: rgba(0, 255, 128, 0.12);
  border-color: rgba(0, 255, 128, 0.2);
  color: #00ff88;
}

/* ---- Navigation route ---- */
.dashboard-nav-set-btn {
  padding: 3px 8px;
  border: 1px solid rgba(0, 255, 128, 0.2);
  border-radius: 3px;
  color: #00ff88;
  font-size: 9px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.12s;
}

.dashboard-nav-set-btn:hover {
  background: rgba(0, 255, 128, 0.08);
}

.dashboard-nav-phases {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 8px;
  flex: 1;
}

.dashboard-nav-phase {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 4px;
}

.dashboard-nav-phase.completed {
  /* default */
}

.dashboard-nav-phase.active {
  border-left: 2px solid rgba(255, 200, 0, 0.35);
}

.dashboard-nav-phase.pending {
  opacity: 0.45;
}

.dashboard-nav-phase-icon {
  font-size: 8px;
}

.dashboard-nav-phase-icon.completed {
  color: #00ff88;
}

.dashboard-nav-phase-icon.active {
  color: #ffcc00;
}

.dashboard-nav-phase-icon.pending {
  color: #6688bb;
}

.dashboard-nav-phase-name.completed {
  color: #00ff88;
}

.dashboard-nav-phase-name.active {
  color: #ffcc00;
}

.dashboard-nav-phase-name.pending {
  color: #6688bb;
}

.dashboard-nav-phase-detail {
  font-size: 7px;
  color: #556677;
}

/* ---- Navigation warning ---- */
.dashboard-nav-warning {
  font-size: 7px;
  color: #ff8855;
  text-align: center;
  padding: 2px;
}

/* ---- MiniMap ---- */
.dashboard-minimap-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
}

/* ---- Exploded ---- */
.dashboard-exploded {
  text-align: center;
  color: #ff5555;
  padding: 6px 0;
  font-size: 13px;
  letter-spacing: 2px;
}
```

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误（CSS 不影响 TS）

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/Dashboard.css
git commit -m "feat: redesign Dashboard CSS for 3-column layout"
```

---

### Task 7: 改写 Dashboard.tsx 三栏布局

**Files:**
- Modify: `src/components/explore/Dashboard.tsx`

- [ ] **Step 1: 重写 Dashboard.tsx（完整替换）**

```tsx
import { useCallback, useRef, useState } from 'react';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import { REAL_DATA } from '../../engine/constants';
import type { AttitudeMode } from '../../types';
import MiniMap from './MiniMap';
import TargetSelectionModal from './TargetSelectionModal';
import './Dashboard.css';

const RotationRate = Math.PI / 3;

function Dashboard() {
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const direction = useSpaceshipStore(s => s.direction);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const setForwardThrust = useSpaceshipStore(s => s.setForwardThrust);
  const setLateralThrust = useSpaceshipStore(s => s.setLateralThrust);
  const setVerticalThrust = useSpaceshipStore(s => s.setVerticalThrust);
  const setThrustMagnitude = useSpaceshipStore(s => s.setThrustMagnitude);
  const yaw = useSpaceshipStore(s => s.yaw);
  const pitch = useSpaceshipStore(s => s.pitch);
  const setDirection = useSpaceshipStore(s => s.setDirection);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attitudeMode = useSpaceshipStore(s => s.attitudeMode);
  const setAttitudeMode = useSpaceshipStore(s => s.setAttitudeMode);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const setTargetBody = useSpaceshipStore(s => s.setTargetBody);
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);
  const activePhaseIndex = useSpaceshipStore(s => s.activePhaseIndex);
  const deviationWarning = useSpaceshipStore(s => s.deviationWarning);
  const [showTargetModal, setShowTargetModal] = useState(false);

  const sliderTrackRef = useRef<HTMLDivElement>(null);

  const updateThrustFromClientX = useCallback((clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
    setThrustMagnitude(pct);
    setForwardThrust(pct > 0 ? 1 : 0);
  }, [setThrustMagnitude, setForwardThrust]);

  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    updateThrustFromClientX(e.clientX);
    const onMove = (ev: MouseEvent) => { updateThrustFromClientX(ev.clientX); };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateThrustFromClientX]);

  const handleTrackTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) updateThrustFromClientX(touch.clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const t = ev.touches[0];
      if (t) updateThrustFromClientX(t.clientX);
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, [updateThrustFromClientX]);

  const startHold = useCallback((action: () => void) => {
    action();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(action, 100);
  }, []);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const getPhaseStatus = (phaseIdx: number): 'completed' | 'active' | 'pending' => {
    if (phaseIdx < activePhaseIndex) return 'completed';
    if (phaseIdx === activePhaseIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-panel">
        {exploded ? null : (
          <div className="dashboard-panel-body">
            {/* 栏1: 飞行控制 */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">飞行控制</div>

              <div className="dashboard-thrust-row">
                <div className="dashboard-thrust-track" />
                <div className="dashboard-thrust-fill" style={{ width: `${thrustMagnitude}%` }} />
                <div className="dashboard-thrust-thumb" style={{ left: `${thrustMagnitude}%` }} />
                <div className="dashboard-thrust-labels">
                  <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                </div>
              </div>
              <div className="dashboard-thrust-value">推力 {thrustMagnitude} MN</div>

              <div className="dashboard-pads-row">
                <div className="dashboard-pad-group">
                  <div className="dashboard-pad-label">姿态调整</div>
                  <div className="dashboard-pad-grid">
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={() => startHold(() => pitch(RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▲</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={() => startHold(() => yaw(RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >◀</button>
                    <button className="dashboard-pad-btn flip"
                      onClick={() => { setDirection([-direction[0], -direction[1], -direction[2]]); setAttitudeMode('inertial' as AttitudeMode); }}
                    >⇄</button>
                    <button className="dashboard-pad-btn"
                      onMouseDown={() => startHold(() => yaw(-RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▶</button>
                    <div />
                    <button className="dashboard-pad-btn"
                      onMouseDown={() => startHold(() => pitch(-RotationRate * 0.1))}
                      onMouseUp={stopHold} onMouseLeave={stopHold}
                    >▼</button>
                    <div />
                  </div>
                </div>
                <div className="dashboard-pad-group">
                  <div className="dashboard-pad-label">平移推力</div>
                  <div className="dashboard-pad-grid">
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={() => startHold(() => setVerticalThrust(1))}
                      onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                      onMouseLeave={stopHold}
                    >▲</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={() => startHold(() => setLateralThrust(1))}
                      onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                      onMouseLeave={stopHold}
                    >◀</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={() => startHold(() => setLateralThrust(-1))}
                      onMouseUp={() => { stopHold(); setLateralThrust(0); }}
                      onMouseLeave={stopHold}
                    >▶</button>
                    <div />
                    <button className="dashboard-pad-btn translate"
                      onMouseDown={() => startHold(() => setVerticalThrust(-1))}
                      onMouseUp={() => { stopHold(); setVerticalThrust(0); }}
                      onMouseLeave={stopHold}
                    >▼</button>
                    <div />
                  </div>
                </div>
              </div>

              <div className="dashboard-mode-row">
                <button
                  className={`dashboard-mode-btn${attitudeMode === 'inertial' ? ' active' : ''}`}
                  onClick={() => setAttitudeMode('inertial' as AttitudeMode)}
                >惯性保持</button>
                <button
                  className={`dashboard-mode-btn${attitudeMode === 'prograde' ? ' active' : ''}`}
                  onClick={() => setAttitudeMode('prograde' as AttitudeMode)}
                >顺向保持</button>
                {targetBodyId && (
                  <button
                    className={`dashboard-mode-btn${attitudeMode === 'target' ? ' active' : ''}`}
                    onClick={() => setAttitudeMode('target' as AttitudeMode)}
                  >指向{REAL_DATA[targetBodyId]?.name || ''}</button>
                )}
              </div>
            </div>

            {/* 分隔线 */}
            <div className="dashboard-column-separator" />

            {/* 栏2: 导航路线 */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">导航路线</div>
              <div className="dashboard-nav-set-btn" onClick={() => setShowTargetModal(true)}>
                设置目的地
              </div>

              {navigationPlan && navigationPlan.phases.length > 0 ? (
                <div className="dashboard-nav-phases">
                  {navigationPlan.phases.map((phase) => {
                    const status = getPhaseStatus(phase.index);
                    const icon = status === 'completed' ? '✓' : status === 'active' ? '→' : '○';
                    return (
                      <div key={phase.index} className={`dashboard-nav-phase ${status}`}>
                        <span className={`dashboard-nav-phase-icon ${status}`}>{icon}</span>
                        <div>
                          <div className={`dashboard-nav-phase-name ${status}`}>
                            阶段{phase.index + 1}：{phase.name}
                          </div>
                          <div className="dashboard-nav-phase-detail">
                            {phase.thrustDirection === 'none'
                              ? '无推力 · 等待转移'
                              : `推力 ${phase.thrustDirection === 'forward' ? '↑' : '↓'}${phase.thrustMagnitude}MN · Δv ${phase.deltaV.toFixed(3)} AU/s`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {deviationWarning && (
                <div className="dashboard-nav-warning">{deviationWarning}</div>
              )}
            </div>

            {/* 分隔线 */}
            <div className="dashboard-column-separator" />

            {/* 栏3: 导航地图 */}
            <div className="dashboard-column">
              <div className="dashboard-column-title">导航地图</div>
              <div className="dashboard-minimap-wrap">
                <MiniMap />
              </div>
            </div>
          </div>
        )}
      </div>
      {showTargetModal && (
        <TargetSelectionModal
          bodies={['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']}
          currentTarget={targetBodyId}
          onSelect={(id) => { setTargetBody(id); setShowTargetModal(false); }}
          onClose={() => setShowTargetModal(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/Dashboard.tsx
git commit -m "feat: redesign Dashboard with 3-column layout and navigation route"
```

---

### Task 8: 改造 MiniMap 导航轨道线

**Files:**
- Modify: `src/components/explore/MiniMap.tsx`

- [ ] **Step 1: 在 MiniMap 导航地图中添加导航轨道绘制**

在 `MiniMap.tsx` 中，找到现有的绘制循环（`draw` 函数末尾，Spaceship 绘制之前），添加以下轨道绘制逻辑：

在 `draw` 函数内，在绘制完 prediction trajectory 之后、绘制 bodies 之前，插入：

```tsx
      // --- Navigation orbit lines (after prediction trajectory, before body drawing) ---
      const navPlan = useSpaceshipStore.getState().navigationPlan;
      const navActivePhase = useSpaceshipStore.getState().activePhaseIndex;

      if (navPlan && navActivePhase >= 0 && navActivePhase < navPlan.phases.length) {
        const activePhase = navPlan.phases[navActivePhase];

        // Only draw when there's a target orbit to show (thrust phases)
        if (activePhase.targetOrbit.semiMajorAxis > 0) {
          const targetAU = activePhase.targetOrbit.semiMajorAxis;
          const ecc = activePhase.targetOrbit.eccentricity;

          // Draw green dashed ellipse for target orbit of current phase
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();

          const a = targetAU * scale;
          const b = a * Math.sqrt(1 - ecc * ecc);
          const orbitCx = cx;
          const orbitCy = cy;

          // Draw ellipse approximated by many short line segments
          const orbitSteps = 256;
          for (let i = 0; i <= orbitSteps; i++) {
            const angle = (i / orbitSteps) * Math.PI * 2;
            const ox = orbitCx + Math.cos(angle) * a;
            const oy = orbitCy - Math.sin(angle) * b;
            if (i === 0) ctx.moveTo(ox, oy);
            else ctx.lineTo(ox, oy);
          }

          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Draw target body's actual orbital path in red (if different from current orbit)
        if (navPlan.destinationId !== 'sun' && navPlan.destinationId !== nearestId) {
          const destData = REAL_DATA[navPlan.destinationId];
          if (destData && destData.semiMajorAxis && destData.orbital) {
            const destEcc = destData.orbital.eccentricity;
            const destA = (destData.semiMajorAxis / 1.496e11) * scale;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 2]);

            const destEllipseSteps = 256;
            if (destEcc < 0.99 && destA > 0) {
              const bDest = destA * Math.sqrt(1 - destEcc * destEcc);
              ctx.beginPath();
              for (let i = 0; i <= destEllipseSteps; i++) {
                const angle = (i / destEllipseSteps) * Math.PI * 2;
                const ox = cx + Math.cos(angle) * destA;
                const oy = cy - Math.sin(angle) * bDest;
                if (i === 0) ctx.moveTo(ox, oy);
                else ctx.lineTo(ox, oy);
              }
              ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      }

      // Draw current orbit (blue ellipse) if orbiting
      if (isZoomed && nearestDistAU > 1e-12) {
        // Current orbit radius ≈ altitude + body radius
        const orbitRadiusPx = (altitudeKm / AU_TO_KM2 + nearestBodyRadiusKm / AU_TO_KM2) * scale;
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
```

注意：上面的代码需要访问 `altitudeKm`、`nearestBodyRadiusKm`、`AU_TO_KM2` 等变量，这些可能在 `draw` 函数作用域内。需要确保在 MiniMap 中相应位置计算好这些值。

**更准确的改造方式**：在 MiniMap 的 `draw` 函数中，在绘制完 Spaceship 之后、`ctx.restore()` 之前，添加导航轨道线和图例：

由于 MiniMap 代码很长，具体插入位置：在 `draw` 函数的末尾附近，在绘制 `drawSpaceship(...)` 之后、`ctx.restore()` 之前：

```tsx
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
        if (destData && destData.semiMajorAxis && destData.orbital) {
          const destAU = (destData.semiMajorAxis / 1.496e11);
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

      // Blue: current orbit around nearest body
      if (isZoomed && nearestDistAU > 1e-12) {
        const relVelX = sp.velocity[0] - (nearestId === 'sun' ? 0 : (computeBodyState2D(nearestId, jd)?.vx ?? 0));
        const relVelY = sp.velocity[1] - (nearestId === 'sun' ? 0 : (computeBodyState2D(nearestId, jd)?.vy ?? 0));
        const relSpeed = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
        if (relSpeed > 1e-12) {
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
      }
```

- [ ] **Step 2: 添加图例到 MiniMap 底部**

在 `draw` 函数末尾，`ctx.restore()` 之前，添加图例绘制：

```tsx
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

        ctx.restore();
      }
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add src/components/explore/MiniMap.tsx
git commit -m "feat: add navigation orbit lines and legend to MiniMap"
```

---

### Task 9: 更新 ExplorePage 集成 HUD

**Files:**
- Modify: `src/pages/ExplorePage.tsx`
- Modify: `src/pages/ExplorePage.css` (如有必要)

- [ ] **Step 1: 在 ExplorePage.tsx 中添加 HUD 组件**

```tsx
import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import HUD from '../components/explore/HUD';
import CrashOverlay from '../components/explore/CrashOverlay';
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
      </div>
      <HUD />
      <Dashboard />
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/pages/ExplorePage.tsx
git commit -m "feat: integrate HUD into ExplorePage"
```

---

### Task 10: 导航偏离检测集成到 ExploreCanvas

**Files:**
- Modify: `src/components/explore/ExploreCanvas.tsx`

- [ ] **Step 1: 在动画循环中添加定时偏离检测**

在 `ExploreCanvas.tsx` 的 `animate` 函数中，找到更新 `simulatedTime` 的位置之后，添加：

```tsx
        // Navigation deviation check (periodic)
        const navStore = useSpaceshipStore.getState();
        if (navStore.navigationPlan && navStore.activePhaseIndex >= 0) {
          const intervalMs = NAV_SCALE * 1000; // 等间距，约每 5 模拟秒
          // 这里简化为每帧检查一次（通过 store 内部逻辑控制频次）
          navStore.checkNavigationalDeviation();
        }
```

注意：需要导入 `useSpaceshipStore` 已经在文件中存在。更精确的做法是在文件顶部添加：

```tsx
// 在已有的导入附近
import { NAVIGATION_CONFIG } from '../../engine/constants';
```

然后在 `animate` 函数中，在 `simulatedTime` 更新后添加检测逻辑。实际上由于 `checkNavigationalDeviation` 自身内部有一套检测逻辑，可以简化调用。在 ExploreCanvas 的 animate 函数中，找到适当位置（如更新完 shipState 后）：

```tsx
        // Periodic navigation check
        {
          const navStore = useSpaceshipStore.getState();
          const elapsed = (simulatedTime - navStore.lastDeviationCheckTime) / 1000;
          if (elapsed > NAVIGATION_CONFIG.deviationCheckInterval) {
            useSpaceshipStore.setState({ lastDeviationCheckTime: simulatedTime });
            navStore.checkNavigationalDeviation();
          }
        }
```

在文件顶部添加导入（如果还没有）：

```tsx
import { NAVIGATION_CONFIG } from '../../engine/constants';
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/components/explore/ExploreCanvas.tsx
git commit -m "feat: integrate periodic navigation deviation check in ExploreCanvas"
```

---

### Task 11: 验证和最终调整

**Files:**
- All modified files

- [ ] **Step 1: 运行完整 TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 运行 ESLint 检查**

Run: `npm run lint`
Expected: 无新增错误（或修复任何新引入的 lint 问题）

- [ ] **Step 3: 运行开发服务器验证功能**

Run: `npm run dev`

在浏览器中检查：
1. 探索页面加载正常
2. HUD 悬浮在仪表盘上方，无背景无边框，左对齐
3. 仪表盘三栏等宽，栏间有分隔和间距
4. "飞船仪表"标签已移除
5. 飞行控制区域：推力滑块 + 3×3 姿态网格 + 3×3 平移网格
6. 点击"设置目的地"弹出天体选择，选择后天体列表显示路由阶段
7. MiniMap 显示导航轨道线（绿/红/蓝）和图例
8. 模拟飞行过程中阶段自动检测切换
9. 偏离时显示警告和重规划

- [ ] **Step 4: 修复发现的问题并提交**

```bash
git add -A
git commit -m "fix: final adjustments for explore navigation redesign"
```
