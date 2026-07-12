# 探索模式 P（泊车）档设计

## 概述

在探索模式 Dashboard 的飞行控制面板中，为档位切换器新增 **P（泊车）档**。挂上 P 档后飞船先完成一次日心系「刹停」，随后持续保持日心静止：

1. 自动调整姿态，使船身朝向飞船的前进方向（当前速度方向）。
2. 施加反向动力（沿速度反方向的制动推力）开始减速。
3. 日心系速度降至停止阈值或越过 0 时，切换到定点保持，不自动回归 N 档。
4. 定点保持阶段实时抵消太阳及行星产生的合引力，并抑制残余日心速度；所有状态仍由物理积分器推进。

P 档与现有 T（切向修正）档同源，都会自动调整姿态与推力；区别在于 T 档只抵消相对汇合点的切向速度分量后回 N，而 P 档先抵消整个日心系速度矢量，再持续抵消日心系合引力。

## 需求

1. **新增 P 档按钮**，始终可见（与 T 档只在有导航计划时显示不同）。
2. **挂上 P 档**：
   - 姿态自动锁定为「朝向当前前进方向」（`direction = normalize(velocity)`）。
   - 施加反向推力（`thrust[0] = -1`），大小按当前速度自动缩放。
3. **参考系**：速度指飞船内部速度矢量 `store.velocity`，即**日心系（相对太阳/坐标原点）**速度。
4. **制动后保持**：当日心系速度降为 0 或越过 0（速度矢量在初始前进方向上的投影 ≤ 0）时，切换到 P 档的保持阶段。保持阶段按实时合引力和残余速度更新姿态与推力，不切回 N。
5. **制动推力自动缩放**：速度越大推力越大，临近停止时自动减小，防止过冲（与 T 档同思路）。上限 **100 MN**，参考速度 **30 km/s**，下限 **1 MN**。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/stores/spaceshipStore.ts` | `Gear` 类型新增 `'P'`；新增 `parkInitialDirection`、`parkPhase` 状态；`setGear` 增加 P 分支；新增 `updateParkGear` action；`initialState`/`reset` 补充新字段 |
| `src/engine/spaceship.ts` | 新增纯函数 `parkBrakeSnapshot`、`parkBrakeThrustMagnitude`、合引力与 P 档保持快照（可单测） |
| `src/components/explore/ExploreCanvas.tsx` | 在 `animate()` 顶部调用 `updateParkGear()`（紧邻 `updateTangentialCorrectionGear()`） |
| `src/components/explore/Dashboard.tsx` | 新增 P 档按钮（D N R P 顺序，T 按需在后）、`[P泊车]` 指示、tooltip |
| `src/components/explore/Dashboard.css` | P 档按钮样式（新高亮色） |
| `src/engine/__tests__/spaceship.test.ts` | 覆盖新纯函数 |
| `src/stores/__tests__/spaceshipStore.test.ts` | 覆盖 `setGear('P')` 与 `updateParkGear` 各分支 |

## Engine 层（纯逻辑，须单测）

在 `src/engine/spaceship.ts` 新增两个纯函数，供 store 调用：

```typescript
// 制动推力自动缩放（AU/s → MN），与 tangentialCorrectionThrustMagnitude 同思路
// 参考速度 30 km/s → 100 MN，clamp 到 [1, 100]
export function parkBrakeThrustMagnitude(speedAUPerSec: number): number;

// 泊车制动快照：给定当前速度矢量与初始前进方向，返回本帧的朝向、制动推力大小、是否已停止
export interface ParkBrakeSnapshot {
  facingDirection: [number, number, number]; // = normalize(velocity)
  thrustMagnitude: number;                    // = parkBrakeThrustMagnitude(speed)
  reachedStop: boolean;                       // speed ≤ eps 或 v·initialDir ≤ eps
}
export function parkBrakeSnapshot(
  velocity: [number, number, number],
  initialDirection: [number, number, number],
): ParkBrakeSnapshot;

export type ParkPhase = 'braking' | 'holding';

// 不包含飞船自身推力的合引力加速度。
export function computeGravityAcceleration(
  position: [number, number, number],
  bodies: BodyInfo[],
): [number, number, number];

// 维持日心静止所需的姿态与前向推力；推力会被最大推力限制。
export function parkHoldSnapshot(
  position: [number, number, number],
  velocity: [number, number, number],
  bodies: BodyInfo[],
): ParkHoldSnapshot;
```

常量（`spaceship.ts` 内部或复用 `constants.ts` 的 `AU_TO_KM`）：

- `PARK_BRAKE_REFERENCE_AU_PER_SEC = 30 / AU_TO_KM`
- `PARK_BRAKE_MAX_THRUST_MN = 100`
- `PARK_BRAKE_MIN_THRUST_MN = 1`
- `PARK_BRAKE_EPS_AU_PER_SEC = 0.01 / AU_TO_KM`（与 T 档一致）

停止判定：`p = dot(velocity, initialDirection)`；当 `speed ≤ EPS` 或 `p ≤ EPS` 时 `reachedStop = true`。此判定仅结束 P 档的制动子阶段，随后进入保持子阶段。

> 说明：制动过程中若始终让船头朝向当前速度方向、并施加恰好反向的推力，则速度矢量方向保持不变、模长递减，直到穿过 0；此时若继续「朝向速度 + 反推」会反而反向加速。因此使用**挂档瞬间记录的初始前进方向 `initialDirection`** 做过零检测（投影 `p ≤ EPS`），在反向加速前切入保持控制。

## Store 改动（`spaceshipStore.ts`）

```typescript
export type Gear = 'D' | 'N' | 'R' | 'T' | 'P';

// 新增状态
parkInitialDirection: [number, number, number] | null; // 挂 P 档瞬间的单位速度方向
parkPhase: ParkPhase | null; // P 档内的 braking / holding 子阶段

// 新增 action
updateParkGear: () => void; // 每帧调用，非 P 档时 no-op
```

### `setGear`

- 切换到非 P 档时，清空 `parkInitialDirection` 和 `parkPhase`（与清空 T 档 `tangentialCorrection*` 字段一致）。
- 切换到 `'P'`：
  - 计算 `speed = |velocity|`、`initialDir = normalize(velocity)`。
  - 若 `speed ≤ EPS`：进入 `gear='P'`、`parkPhase='holding'`，由下一帧的实时合引力保持控制器设置姿态和推力。
  - 否则：`gear='P'`、`parkPhase='braking'`、`parkInitialDirection=initialDir`、`attitudeMode='inertial'`、`direction=initialDir`、`thrust=[-1,0,0]`、`thrustMagnitude=parkBrakeThrustMagnitude(speed)`，并清空 T 档字段。

### `updateParkGear`

```
若 gear !== 'P' → 返回 {}（no-op）
若 parkPhase === 'braking'：
  snap = parkBrakeSnapshot(velocity, parkInitialDirection)
  若 snap.reachedStop → parkPhase='holding'，随后计算保持快照
  否则 → direction=snap.facingDirection，attitudeMode='inertial'，thrust=[-1,0,0]，thrustMagnitude=snap.thrustMagnitude
若 parkPhase === 'holding'：
  bodies = computeExploreBodyStates(simulatedTime)
  hold = parkHoldSnapshot(position, velocity, bodies)
  direction=hold.facingDirection，attitudeMode='inertial'，thrust=[1,0,0]，thrustMagnitude=hold.thrustMagnitude
```

`initialState` 与 `reset()` 均新增 `parkInitialDirection: null` 与 `parkPhase: null`。

## 渲染循环（`ExploreCanvas.tsx`）

在 `animate()` 顶部、`updateTangentialCorrectionGear()` 之后新增：

```typescript
useSpaceshipStore.getState().updateParkGear(computeExploreBodyStates(store.simulatedTime));
```

由于 `updateParkGear` 在物理步进前设置 `direction`/`thrust`，且姿态设为 `inertial`，物理步进后的姿态模式块（`if attitudeMode !== 'inertial'`）不会覆盖 P 档设置的朝向——与 T 档机制一致。发动机音效沿用现有 `hasEffectiveThrust` 判定，制动与保持推力都会触发引擎声。

## UI（`Dashboard.tsx` / `.css`）

- 档位按钮顺序：**D N R P**；T 档保持原有「仅在 `direct-rendezvous` 计划激活时显示」，排在 P 之后。
- P 档按钮：
  - `title="泊车：自动制动至日心静止，并持续抵消引力保持位置"`
  - 高亮色建议蓝紫色系（如 `rgba(120,140,255,0.15)` / `#8aa0ff`），与 D 绿 / N 黄 / R 红 / T 区分。
- 推力指示行新增：`{gear === 'P' && <span className="gear-indicator park"> [P泊车]</span>}`。
- 滑块拖动逻辑（`updateThrustFromClientX`）：P 档下推力由 `updateParkGear` 自动管理，滑块拖动**不影响** P 档制动（与 T 档一致；可在 P 档时让滑块只更新显示值而不改 `thrust`，或直接忽略）。

## O 档（目标天体圆轨道插入）

`O` 档是独立的手动档位，只在飞船位于任一天体的引力范围内时可用。它以当前 `orbitingBodyId` 对应天体为局部参考，与目的地、当前导航目标和导航阶段完全无关；导航阶段切换只更新导航目标，绝不自动挂入 O 或替换 P。

- 相对位置 `r = shipPosition - bodyPosition`，相对速度 `v = shipVelocity - bodyVelocity`。
- 圆轨道速度 `vCircular = sqrt((G_AU * body.mass) / |r|)`；目标切向方向取当前位置径向的黄道面内正交方向，并保持当前相对切向速度的旋向。
- **径向制动优先**：当相对目标天体的径向速度仍高于精细制动阈值时，O 档允许并优先使用全部 **100 MN** 推力反向制动；只有径向速度接近零后，才以约 5 模拟秒的响应时间细调。剩余推力才用于按约 60 模拟秒的响应时间匹配切向圆轨道速度。这样飞船带着较大上升/下降速度切入 O 档时，会先尽快抑制半径漂移，而非因混合控制导致轨道半径大幅偏离当前位置。两部分合成推力仍受 `SPACECRAFT_CONFIG.maxThrustAU` 限幅，物理演化仍由 RK4 负责。
- 当 `abs(radialSpeed)` 与 `abs(abs(tangentialSpeed) - vCircular)` 都低于圆轨道收敛阈值时，O 档自动回到 N 档。
- O 档运行时当前引力归属丢失、离开该天体引力范围或用户切换其他档位，则立即退出并清除其自动控制状态。P 档独立保持当前位置日心悬停，只有用户主动切换到 O 才会离开 P。

## 物理行为对照

| 档位 | 朝向 | thrust[0] | 推力大小 | 自动回 N |
|------|------|-----------|----------|----------|
| D | 船头（用户/姿态模式控制） | +1（滑块>0） | 滑块值 | 否 |
| N | 不变 | 0 | — | — |
| R | 船头不变 | -1（滑块>0） | 滑块值 | 否 |
| T | 切向修正方向（inertial） | +1 | 按切向速度缩放 | 切向速度过零 |
| **P（制动）** | **前进方向 normalize(v)（inertial）** | **-1** | **按日心系速度缩放（≤100 MN）** | **转 P 保持** |
| **P（保持）** | **抵消合引力并阻尼速度的目标加速度方向** | **+1** | **按目标加速度缩放（≤100 MN）** | **否，直到用户切档** |

## 边界情况

- **挂 P 档时速度已≈0**：直接进入 P 保持，抵消当前位置的合引力。
- **制动到 0 的那一帧**：`updateParkGear` 用初始方向投影过零检测，在反向加速前切入保持控制。
- **P 档运行中手动切其他档**：立即生效，`parkInitialDirection` 和 `parkPhase` 清空，接管控制权。
- **P 档与导航计划并存**：P 档不清除目标/导航计划；但制动会使飞船偏离预定轨道，偏离预警可能触发（预期行为，用户主动接管）。
- **爆炸后**：`exploded` 时 Dashboard 不渲染、物理不步进，`updateParkGear` 因 `isRunning`/`exploded` 关系不产生副作用；沿用现有处理。
- **保持阶段的姿态**：持续为 `inertial`，每帧随实时合引力与残余速度的目标加速度更新。
```
