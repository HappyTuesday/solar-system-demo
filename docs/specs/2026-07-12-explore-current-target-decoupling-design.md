# 探索模式当前目标解耦设计

日期：2026-07-12

状态：设计已确认，待实施

## 背景

探索模式原先将导航计划、巡航、T 档切向修正、汇合点姿态和 P 档制动交织在 `spaceshipStore` 中。汇合完成后清除 `navigationPlan.rendezvous` 的同时，后续时间跳跃会被误判为需要重新规划，重新回到第一阶段；后续阶段的姿态又继续依赖已清除的汇合点。

本设计引入独立的“当前目标”全局状态。导航只维护路线阶段，并在阶段变化时替换当前目标。巡航、T 档和姿态保持只读取当前目标的实时解析结果，不再读取导航阶段、汇合计划或目的地。

## 目标

1. 当前目标成为导航、巡航、T 档和目标指向姿态之间唯一的运行时衔接点。
2. 导航系统只设置、更新和清理当前目标，不直接操作巡航、T 档、P 档或船身姿态。
3. 巡航和 T 档只根据当前目标决定可用性、相对速度和控制行为。
4. 支持静态汇合点、天体相对球壳目标和后续绕飞插入目标。
5. 阶段 2、3 的时间跳跃不得重新规划汇合点或重置导航阶段。
6. 阶段 1、2 持续推进；阶段 3 交接至绕飞插入，而不是导航到天体中心。

## 非目标

- 不修改 N 体引力、RK4 积分或天体 Kepler 传播模型。
- 不把 P 档改造成导航阶段状态；P 档仍是独立的日心制动/保持控制。
- 不在本次设计中新增着陆、碰撞规避或自动发射/逃逸流程。

## 术语

- **当前目标**：飞船当前应接近或控制的对象定义，以及由它实时解析出的坐标和速度。
- **静态点目标**：以日心 AU 坐标固定给出的点，例如预测汇合点。
- **天体相对球壳目标**：以某天体为中心、给定中心半径的球壳；其当前目标坐标是飞船到天体中心的径向连线与球壳的近侧交点。
- **绕飞插入目标**：为后续 O 档或其他轨道控制器描述目标天体和期望圆轨道半径的目标。它比“球壳目标”多出轨道控制所需的语义。

“公转轨道”不用于球壳目标的命名。球壳目标只表示一个几何接近点，并不表达轨道面、旋向或圆轨道速度。

## 当前目标契约

### 目标定义

`src/engine/currentTarget.ts` 定义纯数据类型和纯解析函数：

```ts
export type CurrentTarget =
  | {
      kind: 'static-point';
      positionAU: [number, number, number];
      arrivalRadiusAU: number;
      arrivalPolicy: 'continue';
    }
  | {
      kind: 'body-relative-shell';
      bodyId: string;
      radiusAU: number;
      arrivalRadiusAU: number;
      arrivalPolicy: 'continue';
    }
  | {
      kind: 'orbit-insertion';
      bodyId: string;
      radiusAU: number;
      arrivalRadiusAU: number;
      arrivalPolicy: 'orbit-insertion';
    };

export interface ResolvedCurrentTarget {
  source: CurrentTarget;
  positionAU: [number, number, number];
  velocityAUPerSec: [number, number, number];
  directionFromShip: [number, number, number];
  distanceAU: number;
}
```

`radiusAU` 始终是相对天体中心的半径，避免“高度”同时表示距表面和距中心的歧义。所有引擎数据保持 AU、AU/s 和秒的单位约定。

### 解析规则

`getResolvedCurrentTarget(shipPosition, simulatedTime)` 必须实时计算目标：

1. `static-point` 返回固定 `positionAU` 和零日心速度。
2. `body-relative-shell` 传播目标天体到 `simulatedTime`，从天体中心沿“天体 -> 飞船”的单位方向移动 `radiusAU`，返回该近侧球壳交点和目标天体日心速度。
3. `orbit-insertion` 使用同一近侧球壳解析位置和目标天体日心速度；O 档另行使用其 `bodyId`、`radiusAU` 和既有圆轨道算法完成速度匹配。
4. 天体状态无法解析或几何退化时返回 `null`，调用方必须安全停用依赖该目标的自动控制。

### 全局状态 API

`src/stores/currentTargetStore.ts` 保存目标定义、修订号和操作方法：

```ts
setCurrentTarget(target: CurrentTarget): void;
clearCurrentTarget(): void;
getResolvedCurrentTarget(context: CurrentTargetContext): ResolvedCurrentTarget | null;
```

状态由独立 Zustand store 持有，而不是模块级可变变量。这样 Dashboard 可订阅状态变化，测试可重置状态，且导航、飞船状态和 UI 共享同一全局目标快照。`setCurrentTarget` 每次替换目标时递增 revision；巡航可通过 revision 在目标切换后丢弃旧的制动窗口和跳跃安排。

## 职责边界

| 子系统 | 读取 | 写入 | 不应依赖 |
|---|---|---|---|
| 导航 | 目的地、汇合计划、飞船位置、模拟时间 | 当前目标、导航阶段 | 巡航状态、T 档、P 档、姿态模式 |
| 巡航 | 解析后的当前目标、飞船物理状态 | 巡航自身状态、T/P 档请求 | 导航计划、阶段索引、汇合点字段 |
| T 档 | 解析后的当前目标、飞船物理状态 | T 档自身状态和推力 | 导航计划、阶段索引、汇合点字段 |
| 姿态保持 | 解析后的当前目标、飞船位置 | 船身方向 | 汇合计划 |
| P 档 | 飞船物理状态、实时天体状态 | P 档自身状态和推力 | 导航阶段、当前目标 |

`spaceshipStore` 中的巡航和 T 档只调用当前目标 store 的解析 API。现有 `computeCruiseGuidance` 和切向速度计算改为接收 `ResolvedCurrentTarget`，并将“rendezvous”命名改为通用“target”。

## 导航阶段

### 阶段 1：到达汇合点

设置目的地天体时，导航计算预测汇合点和 `rendezvousTime`，并设置：

```ts
setCurrentTarget({
  kind: 'static-point',
  positionAU: rendezvous.point,
  arrivalRadiusAU: NAVIGATION_CONFIG.arrivalDistanceAU,
  arrivalPolicy: 'continue',
});
```

每次物理步进后，导航在同一次状态采样中评估以下事件：

1. 飞船是否进入汇合点到达半径。
2. 目标天体是否已到达该汇合点，即 `simulatedTime >= rendezvousTime`。

只有目标天体先到达时，导航才重新规划新的汇合点并替换静态目标。飞船先到达时进入阶段 2。两个条件在同一次状态采样中都成立时，直接进入阶段 3。

导航不得在阶段切换时调用 `setGear('P')`。当前目标替换本身使巡航在下一帧重新计算，不会继续使用旧汇合点的制动窗口。

### 阶段 2：到达目标引力范围

导航设置天体相对球壳目标：

```ts
setCurrentTarget({
  kind: 'body-relative-shell',
  bodyId: destinationId,
  radiusAU: hillRadiusForBody(destinationId),
  arrivalRadiusAU: max(10_000 km, hillRadius * 0.05),
  arrivalPolicy: 'continue',
});
```

目标位置随飞船和目标天体运动实时更新。飞船抵达球壳近侧交点的到达半径后，导航进入阶段 3。巡航和 T 档只会感知当前目标从静态点替换为天体相对球壳，不需要知道阶段编号。

### 阶段 3：绕飞插入

导航设置绕飞插入目标：

```ts
setCurrentTarget({
  kind: 'orbit-insertion',
  bodyId: destinationId,
  radiusAU: safeOrbitRadiusForBody(destinationId),
  arrivalRadiusAU: orbitArrivalToleranceAU,
  arrivalPolicy: 'orbit-insertion',
});
```

本阶段的默认半径复用现有安全圆轨道半径：目标天体物理半径加 20,000 km。`orbit-insertion` 到达后，由 O 档完成相对目标天体的径向制动和切向圆轨道速度匹配。导航不把目标改为天体中心，也不直接修改飞船位置或速度。

阶段 3 成功由 O 档收敛判定和当前目标到达判定共同确认；确认后导航清理当前目标，并保留 `targetBodyId` 用于相对状态和已捕获状态展示。

## 巡航与档位协作

巡航仅在 `getResolvedCurrentTarget(...)` 返回非空且相对目标径向速度为正时启用。它不再检查 `navigationPlan.rendezvous`、导航阶段或目的地。

巡航读取目标 revision。目标变化后，巡航必须丢弃旧目标对应的制动预测、跳跃时间和“指向汇合点”姿态；随后以新目标重新计算径向/切向速度、T 档修正和时间跳跃。

阶段 1、2 的 `arrivalPolicy: 'continue'` 表示导航目标变化时巡航继续工作，不自动挂 P 档。阶段 3 的 `arrivalPolicy: 'orbit-insertion'` 表示巡航结束，将控制交接给 O 档；P 档只可由用户独立选择，不作为导航阶段副作用。

姿态模式将“指向汇合点”替换为通用“指向当前目标”。其每帧通过 `getResolvedCurrentTarget` 更新船身方向。T 档在完成后恢复进入前的姿态模式；如果当前目标已清理，则回退到惯性保持。

## 时间跳跃

时间跳跃只能传播飞船物理状态，不能隐式改写导航阶段。导航重规划条件必须收紧为：

```text
currentStage === rendezvous
AND currentTarget.kind === static-point
AND simulatedTime >= rendezvousTime
AND ship has not arrived
AND ship is not captured by destination
```

阶段 2、3 的时间跳跃必须保留当前目标和导航阶段。跳跃后导航在更新后的状态上重新评估到达条件；不得因为静态汇合点已经清理而重新创建它。

## UI

- Dashboard 的巡航与 T 档可用性只订阅当前目标解析结果。
- 导航路线仍显示目的地和阶段标签，但标签只用于说明，不驱动控制逻辑。
- 将“指向汇合点”替换为“指向当前目标”；没有当前目标时隐藏或禁用。
- 阶段 1 显示汇合参数；阶段 2、3 显示相对目标天体距离、相对速度、Hill 范围、捕获状态及绕飞插入状态。

## 测试策略

### `engine/currentTarget.test.ts`

- 静态点解析的坐标、零速度、方向和距离。
- 天体相对球壳的近侧交点、目标天体速度和退化几何。
- 绕飞插入目标的半径和天体状态解析。

### `stores/currentTargetStore.test.ts`

- 设置、替换、清理目标以及 revision 递增。
- 目标解析失败时不保留过期解析结果。

### 导航与飞船 store 测试

- 目标天体先到汇合点时重新规划且只替换静态目标。
- 飞船先到汇合点时切到阶段 2，不挂 P，当前目标为 Hill 球壳。
- 同时到达时直接切到阶段 3，当前目标为绕飞插入。
- 阶段 2 到达后切到阶段 3；阶段 3 成功绕飞后清理当前目标。
- 阶段 2、3 的 `timeJump` 保留阶段和当前目标，不重新规划汇合点。
- 巡航和 T 档仅通过当前目标工作；不再读取导航计划。
- 当前目标替换后巡航重新计算，姿态改为指向新目标。
- P 档与导航阶段独立：导航切换阶段不挂 P，用户手动挂 P 不清理当前目标。

## 风险与缓解

- **阶段切换与巡航同帧竞争**：使用当前目标 revision；巡航发现 revision 变化后取消旧制动预测并重新计算。
- **时间跳跃跨过多个事件**：跳跃后先由导航统一评估汇合时间和到达距离，再由巡航在下一帧读取新的目标。
- **绕飞目标语义不足**：`orbit-insertion` 保留 `bodyId` 和 `radiusAU`，由 O 档使用现有物理控制器；未来可扩展轨道面和旋向，避免污染静态点或球壳目标。
- **跨 store 读取不一致**：当前目标只保存定义，解析时显式传入飞船位置和模拟时间，不缓存依赖物理状态的坐标。
