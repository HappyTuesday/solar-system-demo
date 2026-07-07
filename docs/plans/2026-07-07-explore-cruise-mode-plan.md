# 探索模式巡航模式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为探索太阳系页面新增可启用/禁用的巡航模式，自动挂 T 档修正切向、并在预测会到达汇合点时挂 P 档制动并退出，实现自动到达并停止在目标汇合点。

**Architecture:** 纯决策逻辑放引擎层 `src/engine/cruise.ts`（可单测全覆盖）；状态机 `cruiseActive` / `toggleCruise` / `updateCruise` 与 T 档姿态"用后还原"放 `src/stores/spaceshipStore.ts`；`ExploreCanvas` 每帧调用 `updateCruise()`；`Dashboard` 在姿态按钮行新增巡航切换按钮。

**Tech Stack:** React 19 + TypeScript(strict) + Zustand 5 + Vitest。物理单位统一 AU / AU·s⁻¹ / 秒。

**设计文档：** `docs/specs/2026-07-07-explore-cruise-mode-design.md`

---

## 文件结构

- `src/engine/cruise.ts`（新增）：纯函数 `computeParkStopDistanceAU`、`computeCruiseGuidance`、`canEnableCruise`，常量 `CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC`。
- `src/engine/__tests__/cruise.test.ts`（新增）：上述纯函数单测。
- `src/stores/spaceshipStore.ts`（修改）：T 档姿态保存/还原；`cruiseActive` 字段、`toggleCruise`、`updateCruise` 动作。
- `src/stores/__tests__/spaceshipStore.test.ts`（修改）：巡航与 T 档还原测试。
- `src/components/explore/ExploreCanvas.tsx`（修改）：animate 循环调用 `updateCruise()`。
- `src/components/explore/Dashboard.tsx`（修改）：新增巡航切换按钮。

关键常量（供计算参考）：`AU_TO_KM = 149597870.7`；`SPACECRAFT_CONFIG.maxThrustAU = 6.3667e-8`；`parkBrakeThrustMagnitude(speed) = clamp((speed / (30/AU_TO_KM)) * 100, 1, 100)`（已存在于 `engine/spaceship.ts`）。

---

## Task 1: 引擎层 `cruise.ts` 纯函数

**Files:**
- Create: `src/engine/cruise.ts`
- Test: `src/engine/__tests__/cruise.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/engine/__tests__/cruise.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import {
  CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC,
  computeParkStopDistanceAU,
  computeCruiseGuidance,
  canEnableCruise,
} from '../cruise';
import type { NavigationPlan } from '../navigation';
import { AU_TO_KM, SPACECRAFT_CONFIG } from '../constants';

function planTo(point: [number, number, number]): NavigationPlan {
  return {
    destinationId: 'mars',
    plannedAt: 0,
    rendezvous: {
      point,
      plannedFrom: [0, 0, 0],
      targetTimeToRendezvousSec: 86400,
      shipIdealCruiseSpeedAUPerSec: 100 / AU_TO_KM,
      arrivalMaxRelativeSpeedAUPerSec: 0.65 / AU_TO_KM,
      rendezvousTime: 86400 * 1000,
      validUntil: 86400 * 1000,
    },
  };
}

describe('computeParkStopDistanceAU', () => {
  it('returns 0 for near-zero speed', () => {
    expect(computeParkStopDistanceAU(0)).toBe(0);
  });

  it('uses uniform-deceleration s = v^2/(2a) at capped high speed', () => {
    const speed = 4e-4; // AU/s, well above 30 km/s -> thrust capped at 100 MN
    const a = SPACECRAFT_CONFIG.maxThrustAU; // magnitude/100 = 1
    const expected = (speed * speed) / (2 * a);
    expect(computeParkStopDistanceAU(speed)).toBeCloseTo(expected, 6);
  });

  it('is smaller at low speed than at high speed', () => {
    expect(computeParkStopDistanceAU(1e-7)).toBeLessThan(computeParkStopDistanceAU(4e-4));
    expect(computeParkStopDistanceAU(1e-7)).toBeGreaterThan(0);
  });
});

describe('computeCruiseGuidance', () => {
  it('flags shouldBrake when projected stop reaches the rendezvous point', () => {
    const g = computeCruiseGuidance([0, 0, 0], [4e-4, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(true);
    expect(g.distanceToRendezvousAU).toBeCloseTo(1, 6);
    expect(g.shouldBrake).toBe(true);
  });

  it('does not brake when far and slow', () => {
    const g = computeCruiseGuidance([0, 0, 0], [1e-6, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(true);
    expect(g.shouldBrake).toBe(false);
    expect(g.shouldCorrectTangential).toBe(false);
  });

  it('flags shouldCorrectTangential above the trigger threshold', () => {
    const above = CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC * 2;
    const below = CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC * 0.5;
    const gAbove = computeCruiseGuidance([0, 0, 0], [1e-6, above, 0], planTo([1, 0, 0]));
    const gBelow = computeCruiseGuidance([0, 0, 0], [1e-6, below, 0], planTo([1, 0, 0]));
    expect(gAbove.shouldCorrectTangential).toBe(true);
    expect(gBelow.shouldCorrectTangential).toBe(false);
  });

  it('marks radial as non-positive when moving away', () => {
    const g = computeCruiseGuidance([0, 0, 0], [-1e-6, 0, 0], planTo([1, 0, 0]));
    expect(g.radialPositive).toBe(false);
  });
});

describe('canEnableCruise', () => {
  const plan = planTo([1, 0, 0]);

  it('true when rendezvous exists, no thrust, radial positive', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [0, 0, 0], 0, plan)).toBe(true);
  });

  it('false without a rendezvous plan', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [0, 0, 0], 0, null)).toBe(false);
  });

  it('false when there is effective thrust', () => {
    expect(canEnableCruise([0, 0, 0], [1e-6, 0, 0], [1, 0, 0], 50, plan)).toBe(false);
  });

  it('false when radial speed is not positive', () => {
    expect(canEnableCruise([0, 0, 0], [-1e-6, 0, 0], [0, 0, 0], 0, plan)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/engine/__tests__/cruise.test.ts`
Expected: FAIL（`Cannot find module '../cruise'`）

- [ ] **Step 3: 实现 `src/engine/cruise.ts`**

```typescript
import { AU_TO_KM, SPACECRAFT_CONFIG } from './constants';
import { parkBrakeThrustMagnitude, hasEffectiveThrust } from './spaceship';
import type { NavigationPlan } from './navigation';

export const CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC = 0.1 / AU_TO_KM;

function vectorLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

function vectorNormalize(v: [number, number, number]): [number, number, number] {
  const len = vectorLength(v);
  if (len < 1e-20) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vectorDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function computeParkStopDistanceAU(speedAUPerSec: number): number {
  if (speedAUPerSec <= 1e-20) return 0;
  const magnitude = parkBrakeThrustMagnitude(speedAUPerSec);
  const a = SPACECRAFT_CONFIG.maxThrustAU * (magnitude / 100);
  if (a <= 0) return 0;
  return (speedAUPerSec * speedAUPerSec) / (2 * a);
}

export interface CruiseGuidance {
  rendezvousDirection: [number, number, number];
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  distanceToRendezvousAU: number;
  stopDistanceAU: number;
  projectedAdvanceAU: number;
  shouldBrake: boolean;
  shouldCorrectTangential: boolean;
  radialPositive: boolean;
}

export function computeCruiseGuidance(
  position: [number, number, number],
  velocity: [number, number, number],
  plan: NavigationPlan,
): CruiseGuidance {
  const point = plan.rendezvous?.point ?? position;
  const toRendezvous: [number, number, number] = [
    point[0] - position[0],
    point[1] - position[1],
    point[2] - position[2],
  ];
  const distanceToRendezvousAU = vectorLength(toRendezvous);
  const rendezvousDirection = vectorNormalize(toRendezvous);
  const speed = vectorLength(velocity);
  const radialSpeedAUPerSec = vectorDot(velocity, rendezvousDirection);
  const tangentialReference = vectorNormalize([-rendezvousDirection[1], rendezvousDirection[0], 0]);
  const tangentialSpeedAUPerSec = vectorDot(velocity, tangentialReference);

  const stopDistanceAU = computeParkStopDistanceAU(speed);
  const projectedAdvanceAU = speed > 1e-20
    ? stopDistanceAU * (radialSpeedAUPerSec / speed)
    : 0;

  const radialPositive = radialSpeedAUPerSec > 0;
  const shouldBrake = radialPositive
    && distanceToRendezvousAU > 1e-20
    && projectedAdvanceAU >= distanceToRendezvousAU;
  const shouldCorrectTangential =
    Math.abs(tangentialSpeedAUPerSec) > CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC;

  return {
    rendezvousDirection,
    radialSpeedAUPerSec,
    tangentialSpeedAUPerSec,
    distanceToRendezvousAU,
    stopDistanceAU,
    projectedAdvanceAU,
    shouldBrake,
    shouldCorrectTangential,
    radialPositive,
  };
}

export function canEnableCruise(
  position: [number, number, number],
  velocity: [number, number, number],
  thrust: [number, number, number],
  thrustMagnitude: number,
  plan: NavigationPlan | null,
): boolean {
  if (!plan?.rendezvous) return false;
  if (hasEffectiveThrust(thrust, thrustMagnitude)) return false;
  return computeCruiseGuidance(position, velocity, plan).radialPositive;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/engine/__tests__/cruise.test.ts`
Expected: PASS（全部用例通过）

- [ ] **Step 5: 提交**

```bash
git add src/engine/cruise.ts src/engine/__tests__/cruise.test.ts
git commit -m "feat(explore): 巡航模式引擎层决策纯函数"
```

---

## Task 2: T 档姿态"用后还原"

**Files:**
- Modify: `src/stores/spaceshipStore.ts`
- Test: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/stores/__tests__/spaceshipStore.test.ts` 末尾（最后一个顶层 `});` 之前的文件尾部）追加：

```typescript
describe('T-gear attitude restore', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
  });

  it('restores previous attitude mode after tangential correction completes', () => {
    const plan = makeDirectPlan([2, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [0.001, 0.001, 0], // tangential non-zero -> T engages
      attitudeMode: 'rendezvous',
    });

    useSpaceshipStore.getState().setGear('T');
    expect(useSpaceshipStore.getState().gear).toBe('T');

    // Force tangential to zero so the correction completes and returns to N.
    useSpaceshipStore.setState({ velocity: [0.001, 0, 0] });
    useSpaceshipStore.getState().updateTangentialCorrectionGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.attitudeMode).toBe('rendezvous');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/stores/__tests__/spaceshipStore.test.ts -t "restores previous attitude"`
Expected: FAIL（`attitudeMode` 仍为 `'inertial'`）

- [ ] **Step 3: 实现姿态保存/还原**

在 `spaceshipStore.ts` 的 `SpaceshipStore` 接口新增字段（在 `parkInitialDirection` 附近）：

```typescript
  tangentialCorrectionPrevAttitude: AttitudeMode | null;
```

在 `initialState` 与 `reset()` 返回对象中都新增（与 `tangentialCorrectionLastAbs` 相邻）：

```typescript
  tangentialCorrectionPrevAttitude: null as AttitudeMode | null,
```

在 `setGear` 的 `else`（非 P 档）分支返回对象中，为 T 档记录进入前的姿态。将该返回对象改为：

```typescript
    return {
      gear: g,
      parkInitialDirection: null,
      tangentialCorrectionSign: g === 'T' ? null : s.tangentialCorrectionSign,
      tangentialCorrectionLastAbs: g === 'T' ? null : s.tangentialCorrectionLastAbs,
      tangentialCorrectionPrevAttitude: g === 'T' ? s.attitudeMode : s.tangentialCorrectionPrevAttitude,
      thrust: g === 'N' || g === 'T'
        ? [0, 0, 0] as [number, number, number]
        : [
          g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
          s.thrust[1],
          s.thrust[2],
        ] as [number, number, number],
    };
```

在 `updateTangentialCorrectionGear` 的两个"回到 N 档"返回分支（`if (!tangential)` 与 `sign !== ...`）里，加入姿态还原。将这两个返回对象都改为：

```typescript
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
        attitudeMode: (s.tangentialCorrectionPrevAttitude ?? s.attitudeMode) as AttitudeMode,
        tangentialCorrectionPrevAttitude: null,
      };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/stores/__tests__/spaceshipStore.test.ts -t "restores previous attitude"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts
git commit -m "feat(explore): T 档修正完成后还原姿态保持模式"
```

---

## Task 3: 巡航状态与 `updateCruise`

**Files:**
- Modify: `src/stores/spaceshipStore.ts`
- Test: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `spaceshipStore.test.ts` 末尾追加：

```typescript
describe('cruise mode', () => {
  beforeEach(() => {
    useSpaceshipStore.getState().reset();
  });

  function setupCruisable() {
    const plan = makeDirectPlan([2, 0, 0]);
    useSpaceshipStore.setState({
      navigationPlan: plan,
      targetBodyId: 'mars',
      position: [1, 0, 0],
      velocity: [1e-6, 0, 0], // radial positive, tiny
      thrust: [0, 0, 0],
      thrustMagnitude: 0,
      gear: 'N',
      attitudeMode: 'prograde',
      cruiseActive: false,
    });
  }

  it('toggleCruise enables only when preconditions hold and sets rendezvous attitude', () => {
    setupCruisable();
    useSpaceshipStore.getState().toggleCruise();
    const s = useSpaceshipStore.getState();
    expect(s.cruiseActive).toBe(true);
    expect(s.attitudeMode).toBe('rendezvous');
  });

  it('toggleCruise does nothing when radial velocity is non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().toggleCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when rendezvous disappears', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, navigationPlan: null });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when user takes over with D gear', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, gear: 'D' });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise exits when radial velocity turns non-positive', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [-1e-6, 0, 0] });
    useSpaceshipStore.getState().updateCruise();
    expect(useSpaceshipStore.getState().cruiseActive).toBe(false);
  });

  it('updateCruise engages T gear when tangential exceeds threshold', () => {
    setupCruisable();
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [1e-6, 1e-6, 0] });
    useSpaceshipStore.getState().updateCruise();
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('T');
    expect(s.cruiseActive).toBe(true);
  });

  it('updateCruise engages P gear and exits when brake is predicted to reach', () => {
    setupCruisable();
    // Fast radial velocity so predicted stop overshoots the 1 AU gap.
    useSpaceshipStore.setState({ cruiseActive: true, velocity: [4e-4, 0, 0] });
    useSpaceshipStore.getState().updateCruise();
    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.cruiseActive).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/stores/__tests__/spaceshipStore.test.ts -t "cruise mode"`
Expected: FAIL（`toggleCruise` / `updateCruise` / `cruiseActive` 未定义）

- [ ] **Step 3: 实现巡航状态与动作**

在 `spaceshipStore.ts` 顶部 import 处新增：

```typescript
import { canEnableCruise, computeCruiseGuidance } from '../engine/cruise';
```

在 `SpaceshipStore` 接口新增字段与动作声明：

```typescript
  cruiseActive: boolean;
```
```typescript
  toggleCruise: () => void;
  updateCruise: () => void;
```

在 `initialState` 与 `reset()` 返回对象中新增：

```typescript
  cruiseActive: false,
```

在 `create<SpaceshipStore>` 的实现对象中（例如放在 `updateParkGear` 之后）新增两个动作：

```typescript
  toggleCruise: () => set(s => {
    if (s.cruiseActive) {
      return { cruiseActive: false };
    }
    if (!canEnableCruise(s.position, s.velocity, s.thrust, s.thrustMagnitude, s.navigationPlan)) {
      return {};
    }
    return { cruiseActive: true, attitudeMode: 'rendezvous' as AttitudeMode };
  }),
  updateCruise: () => {
    const s = useSpaceshipStore.getState();
    if (!s.cruiseActive) return;
    if (!s.navigationPlan?.rendezvous) {
      useSpaceshipStore.setState({ cruiseActive: false });
      return;
    }
    if (s.gear === 'D' || s.gear === 'R') {
      useSpaceshipStore.setState({ cruiseActive: false });
      return;
    }
    const g = computeCruiseGuidance(s.position, s.velocity, s.navigationPlan);
    if (!g.radialPositive) {
      useSpaceshipStore.setState({ cruiseActive: false });
      return;
    }
    if (s.gear === 'T') return;
    if (g.shouldBrake) {
      useSpaceshipStore.getState().setGear('P');
      useSpaceshipStore.setState({ cruiseActive: false });
      return;
    }
    if (g.shouldCorrectTangential) {
      useSpaceshipStore.getState().setGear('T');
      return;
    }
  },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/stores/__tests__/spaceshipStore.test.ts -t "cruise mode"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts
git commit -m "feat(explore): 巡航状态机 toggleCruise/updateCruise"
```

---

## Task 4: ExploreCanvas 每帧调用 `updateCruise`

**Files:**
- Modify: `src/components/explore/ExploreCanvas.tsx:557-559`

- [ ] **Step 1: 修改 animate 循环**

在 `ExploreCanvas.tsx` 的 animate 函数开头，将：

```typescript
      useSpaceshipStore.getState().updateTangentialCorrectionGear();
      useSpaceshipStore.getState().updateParkGear();
      const store = useSpaceshipStore.getState();
```

改为：

```typescript
      useSpaceshipStore.getState().updateTangentialCorrectionGear();
      useSpaceshipStore.getState().updateParkGear();
      useSpaceshipStore.getState().updateCruise();
      const store = useSpaceshipStore.getState();
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建通过（tsc 无错误）

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/ExploreCanvas.tsx
git commit -m "feat(explore): 渲染循环每帧调用 updateCruise"
```

---

## Task 5: Dashboard 巡航切换按钮

**Files:**
- Modify: `src/components/explore/Dashboard.tsx`

- [ ] **Step 1: 订阅巡航状态与判定**

在 `Dashboard` 组件的 hooks 区（`const showTangentialGear = ...` 之后）新增：

```typescript
  const cruiseActive = useSpaceshipStore(s => s.cruiseActive);
  const toggleCruise = useSpaceshipStore(s => s.toggleCruise);
  const thrust = useSpaceshipStore(s => s.thrust);
  const cruiseEnabled = useMemo(
    () => cruiseActive || canEnableCruise(position, velocity, thrust, thrustMagnitude, navigationPlan),
    [cruiseActive, position, velocity, thrust, thrustMagnitude, navigationPlan],
  );
```

在文件顶部的 navigation import 中加入 `canEnableCruise`（来自 cruise 引擎）：

```typescript
import { canEnableCruise } from '../../engine/cruise';
```

- [ ] **Step 2: 在姿态按钮行新增巡航按钮**

在 `dashboard-mode-row` 内 "指向汇合点" 按钮块之后、该 `</div>` 之前，新增：

```tsx
                <button
                  className={`dashboard-mode-btn${cruiseActive ? ' active' : ''}`}
                  disabled={!cruiseEnabled}
                  title="巡航：自动挂T修正切向，预测将到达汇合点时挂P制动并停止"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleCruise()}
                >巡航</button>
```

- [ ] **Step 3: 类型检查与 lint**

Run: `npm run build && npm run lint`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add src/components/explore/Dashboard.tsx
git commit -m "feat(explore): 仪表盘新增巡航切换按钮"
```

---

## Task 6: 全量校验

- [ ] **Step 1: 跑全部测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 2: 构建与 lint**

Run: `npm run build && npm run lint`
Expected: 均通过

- [ ] **Step 3: 若前面有未提交改动则提交**

```bash
git status
```

---

## 自检对照（spec 覆盖）

- 巡航可启用/禁用、默认禁用 → Task 3（`cruiseActive: false`）、Task 5（按钮）。
- 启用三前置条件（存在汇合点 / 无推力 / 径向速度为正）→ `canEnableCruise`（Task 1），门控于 `toggleCruise`（Task 3）与按钮 `disabled`（Task 5）。
- 启用后设"指向汇合点"姿态 → `toggleCruise`（Task 3）。
- 切向超阈值挂 T → `shouldCorrectTangential` + `updateCruise`（Task 1、3）。
- 预测到达则挂 P 并退出 → `computeParkStopDistanceAU`/`shouldBrake` + `updateCruise`（Task 1、3）。
- 退出条件（施加推力/汇合点消失/径向非正）→ `updateCruise`（Task 3）。
- 只操控 N/T/P、不做姿态微调；T 档用后还原姿态 → Task 2 + Task 3（滑行分支不触碰姿态）。
- 每帧驱动 → Task 4。
- 单测全覆盖非渲染层 → Task 1、2、3。
