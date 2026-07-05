# 探索模式 P（泊车）档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在探索模式为档位切换器新增 P（泊车）档：挂上后飞船自动朝向前进方向、反向自动制动，日心系速度过零后自动回 N 档。

**Architecture:** 复用现有 T（切向修正）档「每帧自动档」模式。纯计算（制动推力缩放、过零判定、朝向）放入 `engine/spaceship.ts`（可单测）；状态与档位逻辑放入 `spaceshipStore.ts`（新增 `parkInitialDirection` 状态与 `updateParkGear` action）；`ExploreCanvas.animate()` 每帧调用 `updateParkGear()`；`Dashboard` 增加 P 按钮与指示。

**Tech Stack:** React 19 + TypeScript (strict) + Zustand 5 + Three.js + Vitest。

参考设计文档：`docs/specs/2026-07-05-explore-park-gear-design.md`

---

## File Structure

| 文件 | 职责 | 改动 |
|------|------|------|
| `src/engine/spaceship.ts` | 纯物理/几何逻辑 | 新增 `PARK_BRAKE_*` 常量、`parkBrakeThrustMagnitude`、`parkBrakeSnapshot`、`ParkBrakeSnapshot` 接口 |
| `src/engine/__tests__/spaceship.test.ts` | 引擎单测 | 新增上述纯函数测试 |
| `src/stores/spaceshipStore.ts` | 飞船状态与档位逻辑 | `Gear` 加 `'P'`；新增 `parkInitialDirection` 状态与 `updateParkGear`；`setGear` 加 P 分支；三个 thrust setter 加 P 守卫；`initialState`/`reset` 补字段 |
| `src/stores/__tests__/spaceshipStore.test.ts` | Store 单测 | 新增 `setGear('P')` 与 `updateParkGear` 测试 |
| `src/components/explore/ExploreCanvas.tsx` | 渲染/主循环 | `animate()` 顶部调用 `updateParkGear()` |
| `src/components/explore/Dashboard.tsx` | 飞行控制 UI | 新增 P 按钮、`[P泊车]` 指示、P 档下滑块守卫 |
| `src/components/explore/Dashboard.css` | 样式 | `.gear-p.active` 与 `.gear-indicator.park` |

---

## Task 1: Engine 纯函数 — 制动推力缩放与泊车快照

**Files:**
- Modify: `src/engine/spaceship.ts`
- Test: `src/engine/__tests__/spaceship.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/engine/__tests__/spaceship.test.ts` 顶部 import 增补（把这两个符号加入现有的 `from '../spaceship'` 导入块）：

```typescript
  parkBrakeThrustMagnitude,
  parkBrakeSnapshot,
```

并在 `SPACECRAFT_CONFIG, G_AU, MU_SUN_AU` 那行的 import 中补上 `AU_TO_KM`：

```typescript
import { SPACECRAFT_CONFIG, G_AU, MU_SUN_AU, AU_TO_KM } from '../constants';
```

在文件末尾 `});`（最外层 `describe('spaceship', ...)` 的收尾）之前追加：

```typescript
  describe('parkBrakeThrustMagnitude', () => {
    it('should clamp to max thrust at or above reference speed', () => {
      const refSpeed = 30 / AU_TO_KM;
      expect(parkBrakeThrustMagnitude(refSpeed)).toBeCloseTo(100, 6);
      expect(parkBrakeThrustMagnitude(refSpeed * 5)).toBe(100);
    });

    it('should clamp to min thrust near zero speed', () => {
      expect(parkBrakeThrustMagnitude(0)).toBe(1);
    });

    it('should scale linearly between min and max', () => {
      const halfRef = 15 / AU_TO_KM;
      expect(parkBrakeThrustMagnitude(halfRef)).toBeCloseTo(50, 6);
    });
  });

  describe('parkBrakeSnapshot', () => {
    it('should face along current velocity and report not stopped while moving forward', () => {
      const v: [number, number, number] = [0, 2e-7, 0];
      const snap = parkBrakeSnapshot(v, [0, 1, 0]);
      expect(snap.reachedStop).toBe(false);
      expect(snap.facingDirection[0]).toBeCloseTo(0, 12);
      expect(snap.facingDirection[1]).toBeCloseTo(1, 12);
      expect(snap.facingDirection[2]).toBeCloseTo(0, 12);
      expect(snap.thrustMagnitude).toBeGreaterThan(0);
    });

    it('should report stopped once velocity crosses the initial forward direction', () => {
      const snap = parkBrakeSnapshot([0, -2e-7, 0], [0, 1, 0]);
      expect(snap.reachedStop).toBe(true);
    });

    it('should report stopped when speed is essentially zero', () => {
      const snap = parkBrakeSnapshot([0, 0, 0], [0, 1, 0]);
      expect(snap.reachedStop).toBe(true);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/engine/__tests__/spaceship.test.ts`
Expected: FAIL — `parkBrakeThrustMagnitude is not a function` / `parkBrakeSnapshot is not a function`。

- [ ] **Step 3: 实现纯函数**

编辑 `src/engine/spaceship.ts`。把顶部 import 改为包含 `AU_TO_KM`：

```typescript
import { SPACECRAFT_CONFIG, G_AU, AU_TO_KM } from './constants';
```

在文件末尾（`checkSpaceshipCollision` 之后）追加：

```typescript
export const PARK_BRAKE_REFERENCE_AU_PER_SEC = 30 / AU_TO_KM;
export const PARK_BRAKE_MAX_THRUST_MN = 100;
export const PARK_BRAKE_MIN_THRUST_MN = 1;
export const PARK_BRAKE_EPS_AU_PER_SEC = 0.01 / AU_TO_KM;

export function parkBrakeThrustMagnitude(speedAUPerSec: number): number {
  const scaled = (speedAUPerSec / PARK_BRAKE_REFERENCE_AU_PER_SEC) * PARK_BRAKE_MAX_THRUST_MN;
  return Math.max(
    PARK_BRAKE_MIN_THRUST_MN,
    Math.min(PARK_BRAKE_MAX_THRUST_MN, scaled),
  );
}

export interface ParkBrakeSnapshot {
  facingDirection: [number, number, number];
  thrustMagnitude: number;
  reachedStop: boolean;
}

export function parkBrakeSnapshot(
  velocity: [number, number, number],
  initialDirection: [number, number, number],
): ParkBrakeSnapshot {
  const speed = vec3Length(velocity);
  const forwardProjection =
    velocity[0] * initialDirection[0] +
    velocity[1] * initialDirection[1] +
    velocity[2] * initialDirection[2];
  const reachedStop =
    speed <= PARK_BRAKE_EPS_AU_PER_SEC ||
    forwardProjection <= PARK_BRAKE_EPS_AU_PER_SEC;
  return {
    facingDirection: vec3Normalize(velocity),
    thrustMagnitude: parkBrakeThrustMagnitude(speed),
    reachedStop,
  };
}
```

> `vec3Length`（import 自 `./physics`）与 `vec3Normalize`（本文件已定义于顶部）均已存在，直接复用。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/engine/__tests__/spaceship.test.ts`
Expected: PASS（含新增 6 条断言块）。

- [ ] **Step 5: 提交**

```bash
git add src/engine/spaceship.ts src/engine/__tests__/spaceship.test.ts
git commit -m "feat(engine): 新增泊车制动纯函数 parkBrakeSnapshot/parkBrakeThrustMagnitude"
```

---

## Task 2: Store — Gear 加 P、状态字段与 thrust setter 守卫

**Files:**
- Modify: `src/stores/spaceshipStore.ts`
- Test: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/stores/__tests__/spaceshipStore.test.ts` 的最外层 `describe(...)` 收尾 `});` 之前追加：

```typescript
  it('setGear(P) faces prograde, applies reverse brake thrust, and records initial direction', () => {
    useSpaceshipStore.setState({
      position: [1, 0, 0],
      velocity: [0, 2e-7, 0],
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('P');

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.thrust).toEqual([-1, 0, 0]);
    expect(s.direction[0]).toBeCloseTo(0, 12);
    expect(s.direction[1]).toBeCloseTo(1, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);
    expect(s.parkInitialDirection).not.toBeNull();
  });

  it('setGear(P) falls back to N when speed is essentially zero', () => {
    useSpaceshipStore.setState({
      velocity: [0, 0, 0],
      gear: 'N',
    });

    useSpaceshipStore.getState().setGear('P');

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.parkInitialDirection).toBeNull();
  });

  it('leaving P clears parkInitialDirection', () => {
    useSpaceshipStore.setState({
      velocity: [0, 2e-7, 0],
      gear: 'N',
      thrustMagnitude: 0,
    });
    useSpaceshipStore.getState().setGear('P');
    expect(useSpaceshipStore.getState().parkInitialDirection).not.toBeNull();

    useSpaceshipStore.getState().setGear('N');
    expect(useSpaceshipStore.getState().parkInitialDirection).toBeNull();
  });

  it('thrust setters are inert while in P gear', () => {
    useSpaceshipStore.setState({
      velocity: [0, 2e-7, 0],
      gear: 'N',
      thrustMagnitude: 0,
    });
    useSpaceshipStore.getState().setGear('P');

    useSpaceshipStore.getState().setLateralThrust(1);
    useSpaceshipStore.getState().setVerticalThrust(1);

    const s = useSpaceshipStore.getState();
    expect(s.thrust[1]).toBe(0);
    expect(s.thrust[2]).toBe(0);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/__tests__/spaceshipStore.test.ts`
Expected: FAIL — `parkInitialDirection` 未定义 / `setGear('P')` 行为不符（TS 类型错误亦可视为失败）。

- [ ] **Step 3: 实现 Store 改动**

编辑 `src/stores/spaceshipStore.ts`。

(a) 修改档位类型（第 11 行）：

```typescript
export type Gear = 'D' | 'N' | 'R' | 'T' | 'P';
```

(b) 修改 engine 导入（第 8 行）：

```typescript
import { hasEffectiveThrust, parkBrakeSnapshot, parkBrakeThrustMagnitude, PARK_BRAKE_EPS_AU_PER_SEC } from '../engine/spaceship';
```

(c) 在 `SpaceshipStore` 接口内，`tangentialCorrectionLastAbs: number | null;`（第 37 行）之后新增字段：

```typescript
  parkInitialDirection: [number, number, number] | null;
```

并在 `updateTangentialCorrectionGear: () => void;`（第 53 行）之后新增 action 签名：

```typescript
  updateParkGear: () => void;
```

(d) 在 `initialState` 对象内，`tangentialCorrectionLastAbs: null as number | null,`（第 186 行）之后新增：

```typescript
  parkInitialDirection: null as [number, number, number] | null,
```

(e) 修改三个 thrust setter（第 198-200 行），把 `'N' || 'T'` 守卫扩展为包含 `'P'`：

```typescript
  setForwardThrust: (v) => set(s => ({ thrust: [s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v, s.thrust[1], s.thrust[2]] })),
  setLateralThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v, s.thrust[2]] })),
  setVerticalThrust: (v) => set(s => ({ thrust: [s.thrust[0], s.thrust[1], s.gear === 'N' || s.gear === 'T' || s.gear === 'P' ? 0 : v] })),
```

(f) 替换整个 `setGear` action（第 212-223 行）为：

```typescript
  setGear: (g) => set(s => {
    if (g === 'P') {
      const speed = vectorLength(s.velocity);
      if (speed <= PARK_BRAKE_EPS_AU_PER_SEC) {
        return {
          gear: 'N' as Gear,
          thrust: [0, 0, 0] as [number, number, number],
          parkInitialDirection: null,
          tangentialCorrectionSign: null,
          tangentialCorrectionLastAbs: null,
        };
      }
      const initialDir = vectorNormalize(s.velocity);
      return {
        gear: 'P' as Gear,
        parkInitialDirection: initialDir,
        attitudeMode: 'inertial' as AttitudeMode,
        direction: initialDir,
        thrust: [-1, 0, 0] as [number, number, number],
        thrustMagnitude: parkBrakeThrustMagnitude(speed),
        tangentialCorrectionSign: null,
        tangentialCorrectionLastAbs: null,
      };
    }
    return {
      gear: g,
      parkInitialDirection: null,
      tangentialCorrectionSign: g === 'T' ? null : s.tangentialCorrectionSign,
      tangentialCorrectionLastAbs: g === 'T' ? null : s.tangentialCorrectionLastAbs,
      thrust: g === 'N' || g === 'T'
        ? [0, 0, 0] as [number, number, number]
        : [
          g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
          s.thrust[1],
          s.thrust[2],
        ] as [number, number, number],
    };
  }),
```

(g) 在 `reset()` 的返回对象内，`tangentialCorrectionLastAbs: null as number | null,`（第 279 行）之后新增：

```typescript
    parkInitialDirection: null as [number, number, number] | null,
```

> `vectorLength` 与 `vectorNormalize` 已在本文件第 109-117 行定义，直接复用。`AttitudeMode` 已 import。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/stores/__tests__/spaceshipStore.test.ts`
Expected: PASS。本任务新增的 4 条（setGear P / fallback / leaving / setters inert）与原有全部用例通过（本任务尚未引用 `updateParkGear`）。

- [ ] **Step 5: 提交**

```bash
git add src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts
git commit -m "feat(store): Gear 新增 P 档、parkInitialDirection 状态与 setGear/thrust 守卫"
```

---

## Task 3: Store — `updateParkGear` 每帧自动制动逻辑

**Files:**
- Modify: `src/stores/spaceshipStore.ts`
- Test: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/stores/__tests__/spaceshipStore.test.ts` 最外层 `describe(...)` 收尾 `});` 之前追加：

```typescript
  it('park gear brakes while moving forward and returns to neutral after crossing zero', () => {
    useSpaceshipStore.setState({
      position: [1, 0, 0],
      velocity: [0, 2e-7, 0],
      direction: [1, 0, 0],
      attitudeMode: 'prograde',
      gear: 'N',
      thrustMagnitude: 0,
    });

    useSpaceshipStore.getState().setGear('P');
    useSpaceshipStore.getState().updateParkGear();

    let s = useSpaceshipStore.getState();
    expect(s.gear).toBe('P');
    expect(s.thrust).toEqual([-1, 0, 0]);
    expect(s.direction[1]).toBeCloseTo(1, 12);
    expect(s.attitudeMode).toBe('inertial');
    expect(s.thrustMagnitude).toBeGreaterThan(0);

    // Velocity has crossed through zero to the opposite direction
    useSpaceshipStore.setState({ velocity: [0, -2e-7, 0] });
    useSpaceshipStore.getState().updateParkGear();

    s = useSpaceshipStore.getState();
    expect(s.gear).toBe('N');
    expect(s.thrust).toEqual([0, 0, 0]);
    expect(s.thrustMagnitude).toBe(0);
    expect(s.parkInitialDirection).toBeNull();
  });

  it('updateParkGear is a no-op when not in P gear', () => {
    useSpaceshipStore.setState({
      gear: 'D',
      thrust: [1, 0, 0],
      thrustMagnitude: 50,
    });
    useSpaceshipStore.getState().updateParkGear();

    const s = useSpaceshipStore.getState();
    expect(s.gear).toBe('D');
    expect(s.thrust).toEqual([1, 0, 0]);
    expect(s.thrustMagnitude).toBe(50);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/__tests__/spaceshipStore.test.ts`
Expected: FAIL — `updateParkGear is not a function`（新增两条用例失败）。

- [ ] **Step 3: 实现 `updateParkGear`**

在 `src/stores/spaceshipStore.ts` 中，紧接 `updateTangentialCorrectionGear` action 之后（其 `}),` 收尾之后，`updateFlightStats` 之前）新增：

```typescript
  updateParkGear: () => set(s => {
    if (s.gear !== 'P') return {};
    if (!s.parkInitialDirection) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
      };
    }
    const snap = parkBrakeSnapshot(s.velocity, s.parkInitialDirection);
    if (snap.reachedStop) {
      return {
        gear: 'N' as Gear,
        thrust: [0, 0, 0] as [number, number, number],
        thrustMagnitude: 0,
        parkInitialDirection: null,
      };
    }
    return {
      direction: snap.facingDirection,
      attitudeMode: 'inertial' as AttitudeMode,
      thrust: [-1, 0, 0] as [number, number, number],
      thrustMagnitude: snap.thrustMagnitude,
    };
  }),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/stores/__tests__/spaceshipStore.test.ts`
Expected: PASS（含本任务 2 条及 Task 2 的 4 条，及原有全部用例）。

- [ ] **Step 5: 提交**

```bash
git add src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts
git commit -m "feat(store): 新增 updateParkGear 每帧自动制动与过零回 N"
```

---

## Task 4: 主循环每帧调用 `updateParkGear`

**Files:**
- Modify: `src/components/explore/ExploreCanvas.tsx:537`

- [ ] **Step 1: 修改 animate 顶部**

将第 537 行：

```typescript
      useSpaceshipStore.getState().updateTangentialCorrectionGear();
```

改为：

```typescript
      useSpaceshipStore.getState().updateTangentialCorrectionGear();
      useSpaceshipStore.getState().updateParkGear();
```

- [ ] **Step 2: 类型检查（无独立测试，走 tsc）**

Run: `npx tsc -b`
Expected: 无错误（无输出）。

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/ExploreCanvas.tsx
git commit -m "feat(explore): 主循环每帧调用 updateParkGear"
```

---

## Task 5: Dashboard UI — P 档按钮、指示与滑块守卫

**Files:**
- Modify: `src/components/explore/Dashboard.tsx`

- [ ] **Step 1: P 档下让滑块拖动无效（`updateThrustFromClientX`）**

在 `updateThrustFromClientX`（第 75-90 行）内部，`const track = sliderTrackRef.current; if (!track) return;` 之后新增早退：

```typescript
    const track = sliderTrackRef.current;
    if (!track) return;
    if (useSpaceshipStore.getState().gear === 'P') return;
```

- [ ] **Step 2: 新增 P 档按钮**

在档位按钮块中，R 档按钮（第 191-193 行）之后、`{showTangentialGear && (` 之前插入：

```tsx
                  <button className={`dashboard-gear-btn gear-p${gear === 'P' ? ' active' : ''}`}
                    title="泊车：自动朝向前进方向并反向制动，速度归零后回到N档"
                    onMouseDown={(e) => { e.preventDefault(); setGear('P'); }}
                  >P</button>
```

- [ ] **Step 3: 新增 P 档推力指示**

在推力值行中，紧接 tangential 指示（第 206 行）之后插入：

```tsx
                {gear === 'P' && <span className="gear-indicator park"> [P泊车]</span>}
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc -b`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/explore/Dashboard.tsx
git commit -m "feat(explore): Dashboard 新增 P 档按钮、指示与滑块守卫"
```

---

## Task 6: Dashboard 样式 — P 档高亮与指示色

**Files:**
- Modify: `src/components/explore/Dashboard.css`

- [ ] **Step 1: 新增 P 档按钮高亮样式**

在 `.dashboard-gear-btn.gear-t.active { ... }` 规则（第 173-177 行）之后新增：

```css
.dashboard-gear-btn.gear-p.active {
  background: rgba(120, 140, 255, 0.15);
  border-color: rgba(120, 140, 255, 0.25);
  color: #8aa0ff;
}
```

- [ ] **Step 2: 新增 P 档指示色**

在 `.gear-indicator.tangential { ... }` 规则（第 187-189 行）之后新增：

```css
.gear-indicator.park {
  color: #8aa0ff;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/Dashboard.css
git commit -m "style(explore): P 档按钮高亮与指示色"
```

---

## Task 7: 全量校验（lint + 类型 + 测试 + 构建）

**Files:** 无（仅验证）

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 无错误。

- [ ] **Step 2: 单元测试全量**

Run: `npm test`
Expected: 全部 PASS（含新增 spaceship 与 spaceshipStore 用例）。

- [ ] **Step 3: 构建（含 tsc 类型检查）**

Run: `npm run build`
Expected: 构建成功，无类型错误。

- [ ] **Step 4: 手动冒烟（可选）**

Run: `npm run dev`，进入探索页 → 挂 P 档：确认船头转向前进方向、发动机音效响起、速度归零后自动回 N、按钮高亮与 `[P泊车]` 指示正确。

- [ ] **Step 5: 无需额外提交**（前序任务已分别提交；如冒烟发现问题，修复后按 TDD 补测再提交）

---

## 自检对照（Spec Coverage）

- 新增 P 档按钮、始终可见 → Task 5（P 按钮无 `showTangentialGear` 条件）。
- 挂 P 档：朝向前进方向 + 反向推力 → Task 2 `setGear('P')` + Task 3 `updateParkGear`。
- 日心系速度参考系 → 直接使用 `store.velocity`（Task 1/3）。
- 速度过零自动回 N（用初始方向投影判定）→ Task 1 `parkBrakeSnapshot.reachedStop` + Task 3。
- 制动推力自动缩放（≤100 MN / 参考 30 km/s / ≥1 MN）→ Task 1 `parkBrakeThrustMagnitude`。
- 每帧驱动 → Task 4。
- UI 顺序 D N R P、指示、tooltip、样式 → Task 5/6。
- 边界：速度≈0 挂档直接 N（Task 2）、P 档滑块/推力键守卫（Task 2/5）、离开 P 清状态（Task 2）。
