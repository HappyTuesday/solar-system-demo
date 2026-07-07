# 探索模式导航：巡航模式（自动到达并停止在汇合点）

日期：2026-07-07
状态：设计已确认，待实施

## 背景

探索太阳系页面的导航已简化为"仅汇合点导航"（见 `2026-07-06-explore-rendezvous-only-navigation-design.md`）：设定目的地后生成汇合点，飞船可用 T 档做切向修正、P 档泊车制动，并可用"指向汇合点"姿态保持模式把船头对准汇合点。

当前这些操作仍需用户手动完成：盯着切向速度挂 T 档、估算何时挂 P 档制动。本次新增**巡航模式**，把"自动到达并停止在目标汇合点"这一过程自动化，降低操作负担，突出汇合点导航的教学重点。

## 目标

1. 新增可启用/禁用的巡航模式，默认禁用。
2. 巡航仅在"无推力"状态下允许启用，且需同时满足：存在汇合点、无推力、径向速度为正。
3. 启用后自动把姿态保持模式切为"指向汇合点"，随后每帧循环：
   - 切向速度绝对值超过阈值时挂 T 档，使其回归汇合线；
   - 用纯运动学近似预测"现在挂 P 档、飞船完全停止时的位置"，若会到达甚至越过汇合点，则挂 P 档并退出巡航。
4. 巡航模式的目的：自动到达并停止在目标汇合点。巡航不操控档位（除 T 档外），不做手动姿态微调。

## 非目标

- 不改变物理仿真、天体传播、评分等既有逻辑。
- 不改变 D/N/R 档与 P 档的制动物理；巡航只是"在合适时机替用户挂 P/T 档"。
- 不新增 Hohmann 转移或多阶段规划。

## 术语

- **汇合点 / 汇合线**：`navigationPlan.rendezvous.point`，以及飞船→汇合点的方向/连线。
- **径向速度**：速度在"飞船→汇合点"单位方向上的投影（正 = 靠近汇合点）。
- **切向速度**：速度在"汇合方向逆时针 90°（黄道面内）"参考轴上的投影。
- 以上几何约定与 `computeDirectRendezvousMetrics` 一致。

## 单位约定

遵循 AGENTS.md：引擎层统一 AU / AU·s⁻¹ / 秒；阈值等常量以 AU 标定；`.tsx` 仅在显示时折算。

## 巡航启用前置条件

`canEnableCruise(velocity, thrust, thrustMagnitude, plan)` 为真需同时满足：

1. **存在汇合点**：`plan?.rendezvous` 非空。
2. **无有效推力**：`!hasEffectiveThrust(thrust, thrustMagnitude)`。
3. **径向速度为正**：速度在飞船→汇合点方向的投影 `> 0`。

任一不满足则不可启用（UI 置灰）。

## 停止点预测（纯运动学近似）

采用忽略引力、沿速度方向匀减速的近似：

- P 档在当前速度下的制动加速度：`a = SPACECRAFT_CONFIG.maxThrustAU · parkBrakeThrustMagnitude(speed) / 100`（复用现有 `parkBrakeThrustMagnitude`，含 1–100 MN 上下限）。
- 停止距离：`stopDistanceAU = speed² / (2a)`（`a ≤ 0` 或 `speed ≈ 0` 时取 0）。
- 沿速度方向停止位移在汇合方向上的投影：`projectedAdvanceAU = stopDistanceAU · (radialSpeed / speed)`。
- 到达/越过判定：`shouldBrake = projectedAdvanceAU >= distanceToRendezvousAU`。

该近似忽略引力与 P 档速度自适应推力的变化，用于教学演示的时机判断已足够。

## 架构与改动

### 引擎层 `src/engine/cruise.ts`（新增，纯函数）

```ts
export const CRUISE_TANGENTIAL_TRIGGER_AU_PER_SEC = 0.1 / AU_TO_KM;

export function computeParkStopDistanceAU(speedAUPerSec: number): number;

export interface CruiseGuidance {
  rendezvousDirection: [number, number, number];
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  distanceToRendezvousAU: number;
  stopDistanceAU: number;
  projectedAdvanceAU: number;
  shouldBrake: boolean;             // projectedAdvanceAU >= distanceToRendezvousAU
  shouldCorrectTangential: boolean; // |tangentialSpeed| > 阈值
  radialPositive: boolean;          // radialSpeed > 0
}

export function computeCruiseGuidance(
  position: [number, number, number],
  velocity: [number, number, number],
  plan: NavigationPlan,
): CruiseGuidance;

export function canEnableCruise(
  velocity: [number, number, number],
  thrust: [number, number, number],
  thrustMagnitude: number,
  plan: NavigationPlan | null,
): boolean;
```

- 复用/内联现有向量工具与切向参考轴约定（汇合方向逆时针 90°）。
- `computeCruiseGuidance` 在 `distanceToRendezvousAU ≈ 0` 或 `speed ≈ 0` 时给出安全值（`shouldBrake=false` 或按几何退化处理）。
- 依赖 `parkBrakeThrustMagnitude`（`engine/spaceship.ts`）与 `SPACECRAFT_CONFIG.maxThrustAU`（`engine/constants.ts`）。

### 状态层 `src/stores/spaceshipStore.ts`

**T 档姿态"用后还原"（既有行为变更）**

- 新增字段 `tangentialCorrectionPrevAttitude: AttitudeMode | null`（默认 `null`，随 `reset()` 归零）。
- `setGear('T')` 时把当前 `attitudeMode` 存入该字段。
- `updateTangentialCorrectionGear()` 在修正结束回到 N 档（切向到 0 或过零）时，把 `attitudeMode` 恢复为 `tangentialCorrectionPrevAttitude` 并清空该字段。
- 效果：无论手动还是巡航触发 T 档，修正完成后都自动回到触发前的保持模式（而非停留在惯性）。

**巡航状态与动作**

- 新增字段 `cruiseActive: boolean`（默认 `false`，随 `reset()` 归零）。
- 新增 `toggleCruise()`：仅当 `canEnableCruise(...)` 为真时可置 `true`，并把 `attitudeMode` 设为 `'rendezvous'`；再次调用置 `false`。
- 新增 `updateCruise()`（每帧调用，类比 `updateParkGear`）：

  ```
  if (!cruiseActive) return;
  if (!plan?.rendezvous) → cruiseActive=false; return;            // 汇合点消失，退出
  if (gear === 'D' || gear === 'R') → cruiseActive=false; return; // 用户接管推力，退出
  g = computeCruiseGuidance(position, velocity, plan)
  if (!g.radialPositive) → cruiseActive=false; return;           // 径向速度非正，退出
  if (gear === 'T') return;                                       // T 档运行中，放手让它跑
  if (g.shouldBrake) → setGear('P'); cruiseActive=false; return; // 会到达/越过 → 挂P并退出
  if (g.shouldCorrectTangential) → setGear('T'); return;         // 切向超阈值 → 挂T
  // 滑行：不触碰姿态；姿态由 T 档"用后还原"机制保证仍是"指向汇合点"
  ```

- 巡航只在启用瞬间设一次 `'rendezvous'` 姿态，之后不再调整姿态。巡航只操控 N/T/P 档；用户手动切到 D/R 视为接管并退出。

### 渲染层 `src/components/explore/ExploreCanvas.tsx`

- 在 animate 循环中，于 `updateTangentialCorrectionGear()` / `updateParkGear()` 之后调用 `useSpaceshipStore.getState().updateCruise()`。

### 渲染层 `src/components/explore/Dashboard.tsx`

- 在"姿态调整"九宫格左侧新增一个竖直"巡航"切换按钮（独立于姿态保持按钮行）；为腾出空间，"姿态调整"九宫格缩小为固定尺寸的小方格。
- `active` 态绑定 `cruiseActive`；当未激活且 `!canEnableCruise(...)` 时 `disabled`（置灰）。
- 点击调用 `toggleCruise()`。`.tsx` 仅做展示与事件转发，不含物理计算。

## 数据流（巡航启用后）

```
ExploreCanvas（渲染循环）
  ├─ updateTangentialCorrectionGear()   T 档修正 + 用后还原姿态
  ├─ updateParkGear()                   P 档制动
  ├─ updateCruise()                     巡航决策：挂T / 挂P退出 / 退出
  ├─ advanceExploreShipPhysics()        物理步进
  └─ maybeReplanRendezvous()            未捕获且到达 rendezvousTime → replan（巡航继续追新汇合点）

Dashboard（姿态按钮行）
  └─ 巡航切换按钮（canEnableCruise 门控）
```

## 退出巡航的条件汇总

- 用户施加推力（手动切至 D/R 档）。
- 汇合点消失（如取消目的地）。
- 径向速度转为非正。
- `shouldBrake` 触发（挂 P 后正常退出，属成功终止）。
- 汇合点 replan 时**不退出**（继续追新汇合点）。

## 测试策略

- `src/engine/__tests__/cruise.test.ts` 全覆盖：
  - `computeParkStopDistanceAU`：低速段（推力随速度线性、停止距离线性）与高速段（推力封顶 100 MN、停止距离二次）。
  - `computeCruiseGuidance`：`shouldBrake` 边界、`shouldCorrectTangential` 阈值上下、`radialPositive` 符号、退化几何安全值。
  - `canEnableCruise`：三前置条件各自失败与全满足。
- `src/stores/__tests__/*`：
  - `toggleCruise` 前置条件门控（不满足时不启用）。
  - `updateCruise` 各退出分支（无汇合点 / 切 D-R / 径向非正）、挂 T、挂 P 退出。
  - T 档姿态保存与还原（含手动 T 档场景）。
- 全量校验：`npm run build`（含 tsc 严格类型检查）与 `npm run lint` 通过。

## 变更记录

- 2026-07-07（UI 调整）：巡航切换按钮从姿态保持按钮行移至"姿态调整"九宫格左侧，改为竖直按钮；"姿态调整"九宫格缩小为固定小尺寸。主视图（Three.js 主画面）不再绘制飞船→汇合点的虚线（汇合线），仅保留汇合点脉冲标记；导航小地图仍显示汇合线。

## 风险与缓解

- **停止点近似误差**：忽略引力与 P 档速度自适应推力，可能提前/滞后制动。缓解：教学演示可接受；后续如需可换成 `predictTrajectory` 数值模拟。
- **T 档行为变更影响面**：姿态"用后还原"改变手动 T 档的既有表现。缓解：在本 spec 明确标注；用单测锁定还原行为。
- **决策优先级**：`shouldBrake` 先于 `shouldCorrectTangential`。因切向大时径向分量小、`projectedAdvance` 随之减小，不会误触发制动，安全。
