# 探索模式导航规划简化：仅保留汇合点导航

日期：2026-07-06
状态：设计已确认，待实施

## 背景

当前探索太阳系页面的导航规划曾过于复杂：`planDirectRendezvousTransfer` 生成 7 个阶段（`阶段`）及阶段目标，`computeLiveNavigationGuidance` / `marsMissionNavigator` 产出实时"操作指引"（`操作指引`），并有一个左侧"详细轨道参数"（`详细轨道参数`）面板。这些内容对教育演示的核心目标（理解汇合点导航）帮助有限，反而增加认知负担。

本次改造大幅简化导航规划：只保留一条固定的三阶段路线，去掉旧的多阶段操作指引与详细轨道参数，并在原阶段信息位置改为实时显示一组与目标相关的瞬时参数。

## 目标

1. 导航规划生成固定的三阶段路线：先到达汇合点，再到达目标天体 Hill 引力边界，最后到达目标天体中心；不恢复旧的多阶段操作指引或任意复杂阶段树。
2. 不再显示任何操作指引。
3. 在"导航路线"面板（原显示阶段信息处）下方，实时显示一组与目标相关的瞬时参数。
4. 导航路线面板将当前阶段信息与目的地放在同一行：目的地靠左可点击修改，阶段序号、总阶段数和当前目标描述靠右显示。
5. 主画面（Three.js）与导航小地图中都显示汇合点，以及飞船到汇合点的虚线（`汇合线`）。
6. 当目标天体越过汇合点（仿真时间到达 `rendezvousTime`）时，若飞船仍未被捕获，则规划出新的汇合点。
7. 彻底清理"操作指引"与"详细轨道参数"相关的组件与引擎代码。
8. 导航系统显式维护当前导航目标与阶段索引：设置目的地并成功规划后，当前阶段为汇合点阶段；飞船进入汇合到达范围后，切换到引力边界阶段；到达该边界后切换到目标天体中心阶段。当前阶段完成后由导航系统给出下一阶段目标，而非由 UI 通过导航计划是否为空推断。

## 非目标

- 不改变 P 档（泊车）、T 档（切向修正）、姿态保持模式（惯性/顺向/指向目标）的既有行为，仅移除阶段与指引逻辑。
- 设置目标并生成汇合点后，姿态保持增加“指向汇合点”模式，自动将船头指向当前 `navigationPlan.rendezvous.point`。当没有汇合点时不显示该模式。
- 不改变物理仿真（`advanceExploreShipPhysics`、天体 Kepler 传播）。
- 不新增 Hohmann 转移能力（本次为移除方向）。

## 要显示的实时参数

在"导航路线"面板目的地选择器下方显示。汇合计划存在时显示汇合参数；汇合完成后汇合计划会被清除，此时切换为目标相对参数，避免目的地信息突然消失。全部为**当前瞬时值，无需显示目标值**：

1. **目标天体到达汇合点的剩余时间**：`rendezvousTime − simulatedTime`。
2. **飞船到达汇合点的剩余时间**：按当前有效速度（速度在汇合方向上的径向分量，只取正值）假设后续完全匀速直线行驶得到；有效速度 ≤ 0 时显示"不可达"。
3. **径向速度 / 切向速度**：均带正负号。径向 = 速度在飞船→汇合点方向上的投影；切向 = 速度在该方向逆时针 90° 参考轴上的投影。
4. **船身与汇合线的夹角**：飞船朝向与飞船→汇合点方向的有符号夹角，**顺时针为负**。
5. **速度与汇合线的夹角**：速度矢量与飞船→汇合点方向的有符号夹角，**顺时针为负**。
6. **在汇合点能够被捕获的日心速度范围**：以目标天体在汇合点处的日心速率为中心，`[v_target − vCap, v_target + vCap]`，其中 `vCap = arrivalMaxRelativeSpeedAUPerSec`（≈0.65 km/s 的最大相对速度）。显示为折合后的日心速率范围（km/s）。
7. **逃逸速度**：仅当飞船处于某天体引力范围内（`orbitingBodyId` 非空）时显示，`v_esc = sqrt(2·mu_body / r)`（r 为飞船到该天体距离）。
8. **飞船距离**：同一行显示飞船到目标天体当前位置的直线距离，以及飞船到当前 `navigationPlan.rendezvous.point` 的直线距离。

汇合完成后显示以下目标相对参数（只要 `targetBodyId` 仍存在即持续更新）：

1. **飞船到目标距离**：飞船到目标天体当前位置的直线距离。
2. **相对总速度**：飞船日心速度减去目标天体日心速度后的模长。
3. **相对径向 / 切向速度**：相对速度在目标→飞船径向及其黄道面内逆时针 90° 参考轴上的带符号投影。
4. **目标引力范围**：飞船是否位于目标 Hill 半径内。
5. **目标捕获状态**：`orbitingBodyId === targetBodyId` 时显示"已捕获"，否则显示"未捕获"。
6. **预计进入目标引力范围**：假设当前目标相对位置和相对速度保持不变，求解飞船首次穿过目标 Hill 半径的时间；已经在范围内显示"已进入"，不会相交或相对速度为零时显示"不可达"。

单位约定遵循 AGENTS.md：引擎层统一 AU / AU·s⁻¹ / 秒；`.tsx` 仅在显示时折算为 km、km/s、度、天/小时/分。

## 架构与改动

### 引擎层 `src/engine/navigation.ts`

- **三阶段 `NavigationPlan`**：保留 `{ destinationId, plannedAt, rendezvous? }`，新增固定 `stages`：`{ id: 'rendezvous', target: { kind: 'rendezvous', point } }`、`{ id: 'gravity-boundary', target: { kind: 'gravity-boundary', bodyId: destinationId } }` 与 `{ id: 'destination', target: { kind: 'body', bodyId: destinationId } }`。这不是旧的 `NavigationPhase` 或操作指引模型，不携带阶段提示、偏差判定或复杂阶段树。
- **保留** `planDirectRendezvousTransfer`：计算汇合点后生成上述三个阶段；不得恢复 `createDirectRendezvousPhases` / `DIRECT_STAGE_NAMES` 或旧 guidance 函数。
- **保留** `computeDirectRendezvousMetrics`（供新函数与 T 档复用）。
- **新增纯函数** `computeRendezvousDisplayParams(shipPosition, shipVelocity, shipDirection, plan, simulatedTime, orbitingBodyId)`，返回：

  ```ts
  interface RendezvousDisplayParams {
    targetTimeToRendezvousSec: number;      // 目标到达汇合点剩余时间
    shipTimeToRendezvousSec: number;        // 匀速直线到达剩余时间，可能为 Infinity
    radialSpeedAUPerSec: number;            // 带正负
    tangentialSpeedAUPerSec: number;        // 带正负
    noseAngleDeg: number;                   // 船身 vs 汇合线，顺时针为负
    velocityAngleDeg: number;               // 速度 vs 汇合线，顺时针为负
    captureHelioSpeedMinAUPerSec: number;   // 日心捕获速度范围下界
    captureHelioSpeedMaxAUPerSec: number;   // 日心捕获速度范围上界
    escapeSpeedAUPerSec: number | null;     // 仅在天体引力范围内非空
    distanceToTargetAU: number;             // 飞船到目标天体直线距离
    distanceToRendezvousAU: number;         // 飞船到汇合点直线距离
  }
  ```

  - 角度符号约定"顺时针为负"由单元测试锁定；实现基于现有 `signedAngleDeg`，必要时取负以满足约定。
  - 捕获速度范围：取目标天体在汇合点处（或当前处，取近似一致）日心速率 `v_target`，范围 `[v_target − vCap, v_target + vCap]`，下界不小于 0。

- 新增纯函数 `computeTargetStatusParams(shipPosition, shipVelocity, destinationId, simulatedTime, orbitingBodyId)`，返回汇合完成后使用的目标相对距离、总速度、带符号径向/切向速度、Hill 半径内状态、捕获状态及恒速近似下预计首次进入 Hill 半径的时间。它不依赖 `NavigationPlan`，并复用 `computeBodyState`、`hillRadiusForBody` 与既有向量约定。

- **删除**（操作指引 / 阶段 / Hohmann 相关）：`PhaseGuidance` 及相关类型、`computeLiveNavigationGuidance`、`computeDirectRendezvousGuidance`、`computePhaseGuidance`、`computeMarsLiveGuidance`、`checkPhaseCompleted`、`checkDeviation`、`planHohmannTransfer`、`createDirectRendezvousPhases`、`getPhaseAngleDegForDeparture` 等仅服务于阶段/指引的逻辑。保留 `computeBodyState`、`computeTargetRelativeOrbit`、`getOrbitingBodyId` 等仍被使用的工具函数。

### 引擎层删除文件

- `src/engine/flightParameters.ts` 及 `src/components/explore/__tests__/FlightParametersPanel.test.ts`
- `src/engine/marsMissionNavigator.ts` 及 `src/stores/__tests__/exploreMarsGuidedFlight.test.ts`
- `src/stores/guidanceControls.ts`

### 状态层 `src/stores/spaceshipStore.ts`

- 删除字段/动作：`activePhaseIndex`、`deviationWarning`、`lastDeviationCheckTime`、`checkNavigationalDeviation`、`setActivePhaseIndex`。
- 新增 `maybeReplanRendezvous()`：当 `navigationPlan?.rendezvous` 存在、飞船未被捕获（`orbitingBodyId !== targetBodyId`）且 `simulatedTime >= rendezvous.rendezvousTime` 时，调用 `replanNavigation()` 生成新汇合点。
- 新增 `currentNavigationStageIndex` 与 `currentNavigationTarget` 状态。`setTargetBody()` / `replanNavigation()` 成功生成路线时写入阶段 0 的汇合点；到达阶段 0 后切到阶段 1 的引力边界，并只移除用于渲染的 `rendezvous` 标记；到达阶段 1 后切到阶段 2 的目的地天体中心；取消目的地或重置时清空。该状态是 T 档、巡航和导航 UI 判断当前阶段目标的唯一来源。
- **按阶段到达阈值**：汇合点阶段沿用 `NAVIGATION_CONFIG.arrivalDistanceAU`；引力边界阶段使用目标 Hill 半径的 5%（不小于 10,000 km）；目标天体中心阶段使用“天体半径 + 100 km”的到达半径。不得用汇合点的 0.05 AU 阈值判定后两阶段，否则 Hill 边界和天体中心会在阶段切换后立即被误判为到达，导致当前目标、T 档和目标相对状态消失。
- 新增纯函数 `formatNavigationStage(stages, currentNavigationStageIndex, destinationName)`，返回中文阶段说明；Dashboard 不自行解释阶段类型。
- 引力边界目标不保存固定坐标，只保存目标天体 ID。每次解析时，以目标天体实时中心为圆心、Hill 半径为半径，取飞船到天体中心连线在飞船一侧的交点；因此边界目标会随飞船位置和天体传播实时更新。
- `setTargetBody`、`replanNavigation`、`timeJump` 保留；其中对 `phases` / `activePhaseIndex` 的引用删除（`timeJump` 超过 `rendezvousTime` 时仍触发 replan）。
- P 档、T 档、姿态模式逻辑保持不变（`updateParkGear`、`updateTangentialCorrectionGear`、`directTangentialSpeedSnapshot` 保留）。

### 渲染层

- **`src/pages/ExplorePage.tsx`**：移除 `<PhaseGuide/>`、`<FlightParametersPanel/>` 及其 import；清理 `window.__debug` 中对已删除引擎函数（如 `autoNavigate`/guidance 相关）的引用。
- **`src/components/explore/ExploreCanvas.tsx`**：
  - 将渲染循环中的 `checkNavigationalDeviation()` 调用替换为 `maybeReplanRendezvous()`。
  - 在 Three.js 主场景新增飞船→汇合点的虚线（`汇合线`），与小地图保持一致；保留现有汇合点脉冲标记。
- **`src/components/explore/Dashboard.tsx`**：
  - 删除阶段列表渲染、`directPhaseDetail`、`formatWaitDays`、`deviationWarning`、`activePhaseIndex`、`navPhasesRef` 及滚动 effect。
  - 在"导航路线"面板目的地选择器下方，新增实时参数列表：汇合计划存在时数据来自 `computeRendezvousDisplayParams`；计划清除但目的地仍存在时数据来自 `computeTargetStatusParams`。`.tsx` 仅做格式化（AU→km、AU/s→km/s、度、时间）。
- 在目的地右侧显示 `formatNavigationStage(...)` 返回的当前阶段信息；该标签是低于目的地名称的辅助状态，但与目的地保持同一行。
  - T 档显隐条件由 `navigationPlan?.method === 'direct-rendezvous'` 改为 `currentNavigationTarget` 非空。T 档和巡航的目标位置、速度与切向修正均由当前阶段目标解析统一提供。
  - 在目的地已设置且 `navigationPlan.rendezvous` 存在时，姿态保持按钮组增加“指向汇合点”。
- **`src/components/explore/ExploreCanvas.tsx`**：
  - 新增 `rendezvous` 姿态保持分支，使用引擎纯函数计算飞船指向汇合点的单位方向。
- **`src/components/explore/MiniMap.tsx`**：保留汇合点脉冲、汇合线、预测轨迹、当前绕飞圆；删除 Hohmann 目标/期望轨道椭圆与相应旧图例。
- **删除文件**：`PhaseGuide.tsx`、`PhaseGuide.css`、`PhaseGuide.test.ts`、`FlightParametersPanel.tsx`、`FlightParametersPanel.css`、`FlightParametersPanel.test.ts`。

## 数据流（改造后）

```
ExploreCanvas（渲染循环）
  ├─ advanceExploreShipPhysics()     物理步进
  ├─ 更新 nearest / orbitingBodyId
  ├─ maybeCompleteNavigationStage()   阶段 0 汇合点 → 阶段 1 引力边界 → 阶段 2 目的地天体中心
  ├─ maybeReplanRendezvous()          阶段 0 未完成且到达 rendezvousTime → replanNavigation，当前阶段保持 0
  └─ 写回 position / velocity / simulatedTime

Dashboard（导航路线面板）
  └─ computeRendezvousDisplayParams() → 实时参数列表（格式化显示）

ExploreCanvas / MiniMap
  └─ 汇合点脉冲 + 飞船→汇合点虚线（汇合线）
```

## 测试策略

- 引擎新函数 `computeRendezvousDisplayParams` 单元测试全覆盖：
  - 目标/飞船到达汇合点剩余时间（含有效速度 ≤ 0 → Infinity）。
  - 径向/切向速度的正负号。
  - 角度"顺时针为负"约定（构造已知几何验证符号）。
  - 捕获日心速度范围（下界不小于 0，中心为目标日心速率）。
  - 逃逸速度出现条件（`orbitingBodyId` 为空时为 null）。
  - 飞船到目标直线距离。
- 飞船到汇合点直线距离。
- `computeTargetStatusParams` 单元测试：目标距离和相对总速度、径向/切向速度符号、Hill 半径边界、`orbitingBodyId` 捕获状态，以及向 Hill 半径靠近、已经在范围内、不会相交三类预计进入时间。
- `spaceshipStore`：三阶段路线在设置目的地时的生成、`maybeReplanRendezvous` 触发/不触发条件、阶段 0→1→2 的当前目标切换，以及 T 档/巡航针对当前阶段目标的测试；删除旧阶段指引相关测试。
- `resolveCurrentNavigationTarget`：汇合点优先、目的地天体回退、太阳固定状态及无目标返回空的单元测试；store T 档测试覆盖相对目的地天体速度而非日心速度。
- 更新/删除受影响的组件测试（Dashboard、MiniMap）；删除 PhaseGuide/FlightParametersPanel/marsGuided/guidanceControls 相关测试。
- 全量校验：`npm run build`（含 tsc 严格类型检查）与 `npm run lint` 通过。

## 风险与缓解

- **删除面积大**：guidance/阶段代码被多处引用。缓解：先删组件与页面引用，再删 store 引用，最后删引擎函数与类型，每步用 tsc 反馈定位残留引用。
- **`NavigationPlan` 结构变更**：影响 store、组件、测试。缓解：集中修改类型，依赖编译错误逐一修正。
- **符号约定歧义**："顺时针为负"依赖坐标系；用单测以确定几何锁定，避免主观判断。

## 变更记录

- 2026-07-07：主画面（Three.js 主视图）不再绘制飞船→汇合点的虚线（汇合线），仅保留汇合点脉冲标记；导航小地图仍同时显示汇合点与汇合线。（原目标 4 中"主画面显示汇合线"部分已撤销。）
- 2026-07-11：汇合点到达后清除 `navigationPlan` 并隐藏标记，但保留目的地选择；导航路线面板切换为不依赖计划的目标相对参数，持续反馈飞船与目标天体的关系，并以当前相对状态恒速近似预计首次进入目标 Hill 半径的时间。
- 2026-07-11：导航系统增加显式三阶段路线与当前导航目标状态。设置目的地后当前阶段为汇合点；随后依次切换为目标 Hill 引力边界和目标天体中心，供 T 档、巡航和后续导航统一使用。
