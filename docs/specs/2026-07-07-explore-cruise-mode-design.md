# 探索模式导航：巡航模式（自动到达并停止在汇合点）

日期：2026-07-07
状态：已实施；2026-07-11 巡航时间跳跃、独立汇合完成检测、P 档保持、D/R 自动接管与到达后目标参数优化已实施

## 背景

探索太阳系页面的导航已简化为"仅汇合点导航"（见 `2026-07-06-explore-rendezvous-only-navigation-design.md`）：设定目的地后生成汇合点，飞船可用 T 档做切向修正、P 档泊车制动，并可用"指向汇合点"姿态保持模式把船头对准汇合点。

当前这些操作仍需用户手动完成：盯着切向速度挂 T 档、估算何时挂 P 档制动。本次新增**巡航模式**，把"自动到达并停止在目标汇合点"这一过程自动化，降低操作负担，突出汇合点导航的教学重点。

2026-07-11 的运行反馈表明，高倍率连续物理步进会使巡航轨迹抖动；飞船进入汇合点附近后导航计划没有完成，汇合点持续显示。本次优化将巡航推进改为受控时间跳跃，并把汇合完成检测从巡航流程中分离出来。

## 目标

1. 新增可启用/禁用的巡航模式，默认禁用。
2. 巡航启用仅需同时满足：存在汇合点、径向速度为正；不限制当前是否为 N 档。若当前为 D/R 档，启用瞬间自动切回 N 档并清除手动推力。
3. 启用后自动把姿态保持模式切为"指向汇合点"，随后每帧循环：
   - 切向速度绝对值超过阈值时挂 T 档，使其回归汇合线；
   - 用纯运动学近似预测"现在挂 P 档、飞船完全停止时的位置"，若会到达甚至越过汇合点，则挂 P 档开始制动，并立即结束巡航。
4. 巡航模式的目的：自动到达目标汇合点。巡航只自动操控 T/P 档，不做手动姿态微调。
5. 巡航不提高时间倍率；启用时暂时固定为 `1×`，避免高倍率连续物理步进造成轨迹抖动。
6. 滑行阶段按循环推进：一次最多跳转 1 个模拟日；跳转后检查制动窗口和切向速度，需要时挂 P 或 T；T 档完成前不继续跳转。
7. 不限制巡航的现实完成时长。每次跳转都不越过当前制动窗口，并按固定分级逐步缩短。
8. 挂入 P 档时巡航立即结束并恢复原时间倍率。P 档独立完成制动和日心静止保持；两者不共享生命周期。
9. 飞船进入汇合点到达范围后，由独立的导航完成检测清除汇合计划并隐藏汇合点，不依赖巡航或 P 档是否处于活动状态。
10. 巡航仅在切向速度绝对值与正径向速度之比大于或等于 `0.01` 时挂入 T 档；低于该阈值时继续滑行或时间跳跃。
11. 接近制动窗口时，时间跳跃按固定分级逐步缩短，避免一次跳跃直接压到窗口边界；余量不足 1 分钟时不再跳跃，而是维持 `1x` 正常物理推进。
12. 汇合点完成并隐藏后，导航面板仍持续显示飞船相对所选目标天体的实时参数，不依赖已清除的汇合计划。

## 非目标

- 不改变物理仿真、天体传播、评分等既有逻辑。
- 不改变 D/N/R 档与 P 档的制动物理；巡航只是"在合适时机替用户挂 P/T 档"。
- 不新增 Hohmann 转移或多阶段规划。

## 术语

- **汇合点 / 汇合线**：`navigationPlan.rendezvous.point`，以及飞船→汇合点的方向/连线。
- **径向速度**：速度在"飞船→汇合点"单位方向上的投影（正 = 靠近汇合点）。
- **切向速度**：速度在"汇合方向逆时针 90°（黄道面内）"参考轴上的投影。
- 以上几何约定与 `computeDirectRendezvousMetrics` 一致。
- **当前导航目标**：由导航系统三阶段路线显式维护。阶段 0 为汇合点（静止点），阶段 1 为目标 Hill 引力边界（飞船-天体中心连线与 Hill 半径的近侧交点），阶段 2 为目的地天体中心的实时位置和日心速度。T 档和巡航始终相对于当前阶段目标工作。

## 单位约定

遵循 AGENTS.md：引擎层统一 AU / AU·s⁻¹ / 秒；阈值等常量以 AU 标定；`.tsx` 仅在显示时折算。

## 巡航启用前置条件

`canEnableCruise(position, velocity, plan)` 为真需同时满足：

1. **存在汇合点**：`plan?.rendezvous` 非空。
2. **径向速度为正**：速度在飞船→汇合点方向的投影 `> 0`。

任一不满足则不可启用（UI 置灰）。

启用动作不要求当前 N 档。当前为 D 或 R 档时，`toggleCruise()` 先调用现有 `setGear('N')` 清除手动推力，再记录倍率、设为 `rendezvous` 姿态并开始巡航；不会在带有手动推进力的状态下直接发起时间跳跃。

## 停止点预测（纯运动学近似）

采用忽略引力、沿速度方向匀减速的近似：

- P 档在当前速度下的制动加速度：`a = SPACECRAFT_CONFIG.maxThrustAU · parkBrakeThrustMagnitude(speed) / 100`（复用现有 `parkBrakeThrustMagnitude`，含 1–100 MN 上下限）。
- 停止距离：`stopDistanceAU = speed² / (2a)`（`a ≤ 0` 或 `speed ≈ 0` 时取 0）。
- 沿速度方向停止位移在汇合方向上的投影：`projectedAdvanceAU = stopDistanceAU · (radialSpeed / speed)`。
- 到达/越过判定：`shouldBrake = projectedAdvanceAU >= distanceToRendezvousAU`。

该近似忽略引力与 P 档速度自适应推力的变化，用于教学演示的时机判断已足够。

## 时间跳跃巡航循环

巡航只在自身活动期间将探索倍率固定为 `1×`，并保存用户原倍率以便在退出时恢复。实际的长距离推进只通过 `spaceshipStore.timeJump()` 完成，避免把大模拟时间压入实时物理积分器。

每轮循环按以下顺序执行：

1. 若用户切入 D/R、取消目标、失去可传播的 `orbitingBodyId`，结束巡航并恢复原倍率。
2. 若 T 档活动，等待既有 T 档控制循环将切向速度修正至零或过零；此期间不跳转。
3. 计算当前制动窗口。若 `shouldBrake` 为真，立即挂 P 并结束巡航。
4. 若 `abs(tangentialSpeedAUPerSec) / radialSpeedAUPerSec >= 0.01`，挂 T，等待下一轮修正完成。此前步骤已确保径向速度为正；比值恰好为 `0.01` 时挂 T。
5. 否则计算 `coastDistanceAU = max(0, distanceToRendezvousAU - projectedAdvanceAU)` 与 `coastSimSeconds = coastDistanceAU / radialSpeedAUPerSec`。从 `[604800, 86400, 43200, 21600, 10800, 3600, 1800, 600, 60]` 秒（7 天至 1 分钟）中选择不大于 `coastSimSeconds` 的最大档位，调用 `timeJump()` 前进该档位。
6. `coastSimSeconds < 60` 时不调用 `timeJump()`，也不结束巡航；维持 `1x` 正常物理推进，直到下一轮判定进入 P 档制动窗口。
7. 跳转后的下一帧重新执行第 2-6 步。跳跃之间至少间隔 200 ms 现实时间，保证渲染循环可刷新状态，不在单帧内连跳。

跳跃目标还会裁剪在当前 `rendezvousTime` 之前，确保直接汇合点在计划仍有效时保持稳定。若裁剪后的可跳时间不足 1 分钟，则不跳转并由正常物理帧推进；否则仍选择不越过可跳时间的最大分级。

## 架构与改动

### 引擎层 `src/engine/cruise.ts`（新增，纯函数）

```ts
export const CRUISE_TANGENTIAL_RATIO_TRIGGER = 0.01;

export function computeParkStopDistanceAU(speedAUPerSec: number): number;

export interface CruiseGuidance {
  rendezvousDirection: [number, number, number];
  radialSpeedAUPerSec: number;
  tangentialSpeedAUPerSec: number;
  distanceToRendezvousAU: number;
  stopDistanceAU: number;
  projectedAdvanceAU: number;
  shouldBrake: boolean;             // projectedAdvanceAU >= distanceToRendezvousAU
  shouldCorrectTangential: boolean; // |tangentialSpeed| / radialSpeed >= 0.01
  radialPositive: boolean;          // radialSpeed > 0
}

export const CRUISE_TIME_JUMP_STEPS_SECONDS = [604800, 86400, 43200, 21600, 10800, 3600, 1800, 600, 60] as const;

export function computeCruiseJumpSeconds(
  guidance: CruiseGuidance,
): number;

export function computeCruiseGuidance(
  position: [number, number, number],
  velocity: [number, number, number],
  plan: NavigationPlan,
): CruiseGuidance;

export function canEnableCruise(
  position: [number, number, number],
  velocity: [number, number, number],
  plan: NavigationPlan | null,
): boolean;
```

- 复用/内联现有向量工具与切向参考轴约定（汇合方向逆时针 90°）。
- `computeCruiseGuidance` 在 `distanceToRendezvousAU ≈ 0` 或 `speed ≈ 0` 时给出安全值（`shouldBrake=false` 或按几何退化处理）。
- `computeCruiseJumpSeconds` 仅返回上述分级数组中的值或 `0`；`0` 表示距制动窗口不足 60 秒，调用方继续常规物理推进。
- 依赖 `parkBrakeThrustMagnitude`（`engine/spaceship.ts`）与 `SPACECRAFT_CONFIG.maxThrustAU`（`engine/constants.ts`）。

### 引擎层 `src/engine/navigation.ts`

- 新增 `resolveCurrentNavigationTarget(currentNavigationTarget, shipPosition, simulatedTime)`，返回当前阶段目标的类型、位置和日心速度：汇合点引用其已记录位置；引力边界由飞船位置和目标天体实时状态求交；目的地天体按实时传播状态解析；太阳目标固定为日心原点和零速度。
- 它不产生或修改导航计划，仅解析导航系统已维护的目标，供 T 档和相关 UI 使用。

### 状态层 `src/stores/spaceshipStore.ts`

**T 档姿态"用后还原"（既有行为变更）**

- 新增字段 `tangentialCorrectionPrevAttitude: AttitudeMode | null`（默认 `null`，随 `reset()` 归零）。
- `setGear('T')` 时把当前 `attitudeMode` 存入该字段。
- `updateTangentialCorrectionGear()` 与 `updateCruise()` 解析当前阶段目标；T 档以飞船相对目标的速度在“飞船→当前目标”连线的切向投影作为待修正量；当切向到 0 或过零时回到 N 档、恢复 `tangentialCorrectionPrevAttitude` 并清空该字段。
- **T 档推力曲线**：T 档持续沿当前切向速度的反方向施加前向推力，不改变其切向方向计算。误差不超过 `1 km/s` 时使用 `1 MN` 精细修正；从 `1 km/s` 至 `20 km/s`，推力在 `1 MN` 至 `100 MN` 间线性增加；误差达到或超过 `20 km/s` 时使用完整 `100 MN`。该曲线替代旧的 `20 MN` 上限，以缩短巡航中等待 T 档收敛的模拟时间，同时保留低速过零前的细调区间。
- 效果：无论手动还是巡航触发 T 档，修正完成后都自动回到触发前的保持模式（而非停留在惯性）。

**巡航状态与动作**

- `cruiseActive: boolean` 继续表示巡航任务是否仍在执行。
- 新增 `cruisePhase: 'idle' | 'coasting'`，仅表示巡航自身的滑行状态，默认 `idle`。
- 新增 `cruiseNextJumpAtMs: number | null` 与 `cruisePreviousTimeScale: number | null`，分别记录下一次允许跳跃的单调现实时间和用户原时间倍率。
- `toggleCruise(nowMs)`：仅当 `canEnableCruise(...)` 为真时启用。若当前档位为 D/R，先切 N 以清除手动推力；再保存用户倍率并设为 `1×`，进入 `coasting`，将姿态调整为指向汇合点；再次调用时中止并恢复原倍率。
- `updateCruise(nowMs)` 接收由渲染循环传入的 `performance.now()`，按照时间跳跃循环决定挂 T、挂 P 或调用一次 `timeJump()`。
- 时间倍率仍由 `exploreStore` 持有；store 只在巡航启用/结束时设置 `1×` 与恢复，不做高倍率推进。
- 新增 `updateCruise()`（每帧调用，类比 `updateParkGear`）：

  ```
  if (!cruiseActive) return;
  if (!plan?.rendezvous) → abortCruise(); return;                  // 汇合点消失，退出并恢复倍率
  if (gear === 'D' || gear === 'R') → abortCruise(); return;       // 用户接管推力，退出并恢复倍率
  g = computeCruiseGuidance(position, velocity, plan)
  if (!g.radialPositive && cruisePhase === 'coasting')
    → abortCruise(); return;
  if (gear === 'T') return;                                      // T 档运行中，放手让它跑
  if (cruisePhase === 'coasting' && g.shouldBrake)
    → setGear('P'); finishCruise(); return;
  if (cruisePhase === 'coasting' && g.shouldCorrectTangential)
    → setGear('T'); return;
  if (now >= cruiseNextJumpAtMs && jumpSeconds > 0)
    → timeJump(jumpSeconds); cruiseNextJumpAtMs=now+200ms; return;
  if (jumpSeconds === 0) return;                                  // 1 分钟内：正常物理推进
  // 滑行：不触碰姿态；姿态由 T 档"用后还原"机制保证仍是"指向汇合点"
  ```

- 巡航只在启用瞬间设一次 `'rendezvous'` 姿态，之后不再调整姿态。巡航只操控 N/T/P 档；用户手动切到 D/R 视为接管并退出。
- `finishCruise()` 只清理巡航计时与状态、设置 `cruiseActive=false` 并恢复巡航前倍率；它不清除导航计划，不读取 P 档保持状态，也不修改飞船位置或速度。
- 新增 `maybeCompleteRendezvous()`，每次物理步进后独立检查 `navigationPlan.rendezvous.point` 的距离。飞船进入 `NAVIGATION_CONFIG.arrivalDistanceAU = 0.05` 时，先挂入 P 档，再清除 `navigationPlan`。主视图与小地图依照现有渲染条件自然隐藏汇合点；P 档继续制动并保持日心静止。该范围是教学演示尺度的"到达汇合点"，不代表物理对接或位置吸附。

**P 档日心静止保持（见 `2026-07-05-explore-park-gear-design.md`）**

- P 档的 `braking` 子阶段继续沿当前日心速度反向制动；速度降至停止阈值或投影过零后，转换到 `holding` 子阶段，不再自动回 N。
- `holding` 每帧根据当前位置、模拟时刻和全部受引力天体计算合引力加速度 `a_gravity`；船身朝向 `-a_gravity - v / tau`，前向推力大小为该目标加速度与最大推力加速度的比例，其中 `v / tau` 是日心速度阻尼项。
- 推力、姿态、位置和速度全部仍经既有物理积分器演化。该控制器抵消引力并衰减残余日心速度，不把飞船位置吸附到汇合点，也不直接将速度改为零。

### 渲染层 `src/components/explore/ExploreCanvas.tsx`

- 在 animate 循环中，于 `updateTangentialCorrectionGear()` / `updateParkGear()` 之后调用 `useSpaceshipStore.getState().updateCruise(performance.now())`。

### 渲染层 `src/components/explore/Dashboard.tsx`

- 在"姿态调整"九宫格左侧新增一个竖直"巡航"切换按钮（独立于姿态保持按钮行）；为腾出空间，"姿态调整"九宫格缩小为固定尺寸的小方格。
- `active` 态绑定 `cruiseActive`；当未激活且 `!canEnableCruise(...)` 时 `disabled`（置灰）。
- 点击调用 `toggleCruise()`。`.tsx` 仅做展示与事件转发，不含物理计算。
- T 档与巡航入口仅在 `currentNavigationTarget` 存在时可用；目标由导航系统在汇合点、引力边界和目的地天体中心阶段之间切换。
- 汇合计划存在时，继续渲染既有汇合参数。计划在到达范围内清除后，改为读取引擎层的目标相对状态，持续显示：目标距离、相对总速度、径向速度、切向速度、是否进入目标引力范围、是否已被目标捕获，以及按当前相对速度预计进入目标引力范围的时间。该状态仅依赖 `targetBodyId`、飞船状态、仿真时间与 `orbitingBodyId`。

## 数据流（巡航启用后）

```
ExploreCanvas（渲染循环）
  ├─ updateTangentialCorrectionGear()   T 档修正 + 用后还原姿态
  ├─ updateParkGear()                   P 档制动或日心静止保持
  ├─ updateCruise(performance.now())    巡航决策：分级跳跃 / 检查 T-P / 挂 P 后结束
  ├─ advanceExploreShipPhysics()        物理步进
  ├─ maybeCompleteRendezvous()          进入到达范围后挂 P 并清除汇合点（独立于巡航）
  └─ maybeReplanRendezvous()            未到达且到达 rendezvousTime → replan

Dashboard（姿态按钮行）
  └─ 巡航切换按钮（仅以汇合点和正径向速度门控；D/R 启用时自动切 N）
```

## 退出巡航的条件汇总

- 用户施加推力（手动切至 D/R 档）。
- 汇合点消失（如取消目的地）。
- 滑行阶段径向速度转为非正。
- `shouldBrake` 成立时挂 P（成功终止巡航）。P 档随后独立保持日心静止。
- 汇合点 replan 时**不退出**（继续追新汇合点）。

## 测试策略

- `src/engine/__tests__/cruise.test.ts` 全覆盖：
  - `computeParkStopDistanceAU`：低速段（推力随速度线性、停止距离线性）与高速段（推力封顶 100 MN、停止距离二次）。
  - `computeCruiseGuidance`：`shouldBrake` 边界、切向/径向速度比在 `0.01` 上下与恰好等于阈值时的 T 档判定、`radialPositive` 符号、退化几何安全值。
  - `computeCruiseJumpSeconds`：制动窗口外跳 24 小时；20 小时、8 小时等余量分别选择 12 小时、6 小时；不足 60 秒、制动或不可达时返回 0。
  - `canEnableCruise`：无汇合点、径向速度非正分别失败；无需 N 档或零推力即可满足。
- `src/stores/__tests__/*`：
  - `toggleCruise` 前置条件门控（不满足时不启用），以及从 D/R 启用时先回 N、清除推力并转为指向汇合点姿态。
  - `updateCruise` 各退出分支（无汇合点 / 切 D-R / 径向非正）、分级跳跃、跳后挂 T、T 档完成后再跳、1 分钟内保持巡航但不跳跃、制动窗口挂 P 并立即结束巡航、恢复原倍率。
  - `maybeCompleteRendezvous` 在进入 `arrivalDistanceAU` 后挂 P、清空计划、汇合点不再渲染，且飞船位置与速度不被直接改写；该行为不依赖巡航是否活跃。
  - P 档在日心速度过零后切入持续保持：姿态反向抵消实时合引力，并加入速度阻尼，不自动回 N。
  - 正常完成与主动中止都会恢复巡航前的时间倍率。
  - T 档姿态保存与还原（含手动 T 档场景），以及汇合点优先、目的地天体回退的当前导航目标解析和相对切向速度修正。
- 全量校验：`npm run build`（含 tsc 严格类型检查）与 `npm run lint` 通过。

## 变更记录

- 2026-07-07（UI 调整）：巡航切换按钮从姿态保持按钮行移至"姿态调整"九宫格左侧，改为竖直按钮；"姿态调整"九宫格缩小为固定小尺寸。主视图（Three.js 主画面）不再绘制飞船→汇合点的虚线（汇合线），仅保留汇合点脉冲标记；导航小地图仍显示汇合线。
- 2026-07-11（时间跳跃巡航）：取消 60 秒与高倍率连续物理步进。巡航以最多 1 天一次的受控时间跳跃推进，每次跳后检查 T 档与制动窗口；巡航只负责挂 P 后结束，P 档随后独立保持日心静止。飞船进入 0.05 AU 到达范围后由独立导航检测清除已完成的汇合点，不吸附位置、不强制清零速度。
- 2026-07-11（制动窗口分级逼近）：时间跳跃按 7 天、24 小时至 1 分钟的固定分级逐步缩短；仅在切向速度绝对值与径向速度之比大于或等于 0.01 时进入 T 档。制动窗口剩余不足 1 分钟后改由 1x 常规物理推进，不提前退出巡航。
- 2026-07-11（巡航接管手动推进）：取消“必须无有效推力”的启用限制。D/R 档启用巡航时自动切回 N、清除手动推力并调整为指向汇合点姿态。
- 2026-07-11（三阶段当前目标）：导航系统固定规划汇合点、目标 Hill 引力边界、目的地天体中心三个阶段。T 档与巡航都相对于当前阶段目标；阶段完成后导航系统切换至下一阶段。

## 风险与缓解

- **停止点近似误差**：忽略引力与 P 档速度自适应推力，可能提前/滞后制动。缓解：教学演示可接受；后续如需可换成 `predictTrajectory` 数值模拟。
- **T 档行为变更影响面**：姿态"用后还原"改变手动 T 档的既有表现。缓解：在本 spec 明确标注；用单测锁定还原行为。
- **决策优先级**：`shouldBrake` 先于 `shouldCorrectTangential`。因切向大时径向分量小、`projectedAdvance` 随之减小，不会误触发制动，安全。
- **跳跃跨越制动窗口**：每次跳跃长度被 `coastSimSeconds` 限制，并向下选择固定分级；剩余不足 1 分钟时不跳转。每轮重新判断 `shouldBrake`，不再依赖大倍率连续积分。
- **P 档保持精度**：推力受最大推力限制，靠近强引力天体时可能无法完全抵消合引力。控制器会限幅并保持物理积分结果，不伪造静止或位置固定。
