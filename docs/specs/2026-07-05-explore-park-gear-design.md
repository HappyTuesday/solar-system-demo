# 探索模式 P（泊车）档设计

## 概述

在探索模式 Dashboard 的飞行控制面板中，为档位切换器新增 **P（泊车）档**。挂上 P 档后飞船自动完成一次「刹停」：

1. 自动调整姿态，使船身朝向飞船的前进方向（当前速度方向）。
2. 施加反向动力（沿速度反方向的制动推力）开始减速。
3. 直到（日心系）速度降为 0 或越过 0 时，自动回归 N 档。

P 档的行为与现有 T（切向修正）档同源——都是「自动朝向 + 自动推力 + 达到目标后自动回 N」的自动档；区别在于 T 档只抵消相对汇合点的切向速度分量，而 P 档抵消整个日心系速度矢量。

## 需求

1. **新增 P 档按钮**，始终可见（与 T 档只在有导航计划时显示不同）。
2. **挂上 P 档**：
   - 姿态自动锁定为「朝向当前前进方向」（`direction = normalize(velocity)`）。
   - 施加反向推力（`thrust[0] = -1`），大小按当前速度自动缩放。
3. **参考系**：速度指飞船内部速度矢量 `store.velocity`，即**日心系（相对太阳/坐标原点）**速度。
4. **自动回 N**：当日心系速度降为 0 或越过 0（速度矢量在初始前进方向上的投影 ≤ 0）时，自动切回 N 档，清零推力。
5. **制动推力自动缩放**：速度越大推力越大，临近停止时自动减小，防止过冲（与 T 档同思路）。上限 **100 MN**，参考速度 **30 km/s**，下限 **1 MN**。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/stores/spaceshipStore.ts` | `Gear` 类型新增 `'P'`；新增 `parkInitialDirection` 状态；`setGear` 增加 P 分支；新增 `updateParkGear` action；`initialState`/`reset` 补充新字段 |
| `src/engine/spaceship.ts` | 新增纯函数 `parkBrakeSnapshot` 与 `parkBrakeThrustMagnitude`（可单测） |
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
```

常量（`spaceship.ts` 内部或复用 `constants.ts` 的 `AU_TO_KM`）：

- `PARK_BRAKE_REFERENCE_AU_PER_SEC = 30 / AU_TO_KM`
- `PARK_BRAKE_MAX_THRUST_MN = 100`
- `PARK_BRAKE_MIN_THRUST_MN = 1`
- `PARK_BRAKE_EPS_AU_PER_SEC = 0.01 / AU_TO_KM`（与 T 档一致）

停止判定：`p = dot(velocity, initialDirection)`；当 `speed ≤ EPS` 或 `p ≤ EPS` 时 `reachedStop = true`。

> 说明：制动过程中若始终让船头朝向当前速度方向、并施加恰好反向的推力，则速度矢量方向保持不变、模长递减，直到穿过 0；此时若继续「朝向速度 + 反推」会反而反向加速。因此使用**挂档瞬间记录的初始前进方向 `initialDirection`** 做过零检测（投影 `p ≤ EPS`），在反向加速前就切回 N。

## Store 改动（`spaceshipStore.ts`）

```typescript
export type Gear = 'D' | 'N' | 'R' | 'T' | 'P';

// 新增状态
parkInitialDirection: [number, number, number] | null; // 挂 P 档瞬间的单位速度方向

// 新增 action
updateParkGear: () => void; // 每帧调用，非 P 档时 no-op
```

### `setGear`

- 切换到非 P 档时，清空 `parkInitialDirection`（与清空 T 档 `tangentialCorrection*` 字段一致）。
- 切换到 `'P'`：
  - 计算 `speed = |velocity|`、`initialDir = normalize(velocity)`。
  - 若 `speed ≤ EPS`：直接置为 `N`（无可制动的速度）。
  - 否则：`gear='P'`，`parkInitialDirection=initialDir`，`attitudeMode='inertial'`，`direction=initialDir`，`thrust=[-1,0,0]`，`thrustMagnitude=parkBrakeThrustMagnitude(speed)`，并清空 T 档字段。

### `updateParkGear`

```
若 gear !== 'P' → 返回 {}（no-op）
若 parkInitialDirection 为空 → 回 N，清零 thrust/magnitude
snap = parkBrakeSnapshot(velocity, parkInitialDirection)
若 snap.reachedStop → gear='N'，thrust=[0,0,0]，thrustMagnitude=0，parkInitialDirection=null
否则 → direction=snap.facingDirection，attitudeMode='inertial'，thrust=[-1,0,0]，thrustMagnitude=snap.thrustMagnitude
```

`initialState` 与 `reset()` 均新增 `parkInitialDirection: null`。

## 渲染循环（`ExploreCanvas.tsx`）

在 `animate()` 顶部、`updateTangentialCorrectionGear()` 之后新增：

```typescript
useSpaceshipStore.getState().updateParkGear();
```

由于 `updateParkGear` 在物理步进前设置 `direction`/`thrust`，且姿态设为 `inertial`，物理步进后的姿态模式块（`if attitudeMode !== 'inertial'`）不会覆盖 P 档设置的朝向——与 T 档机制一致。发动机音效沿用现有 `hasEffectiveThrust` 判定，制动推力会触发引擎声。

## UI（`Dashboard.tsx` / `.css`）

- 档位按钮顺序：**D N R P**；T 档保持原有「仅在 `direct-rendezvous` 计划激活时显示」，排在 P 之后。
- P 档按钮：
  - `title="泊车：自动朝向前进方向并反向制动，速度归零后回到N档"`
  - 高亮色建议蓝紫色系（如 `rgba(120,140,255,0.15)` / `#8aa0ff`），与 D 绿 / N 黄 / R 红 / T 区分。
- 推力指示行新增：`{gear === 'P' && <span className="gear-indicator park"> [P泊车]</span>}`。
- 滑块拖动逻辑（`updateThrustFromClientX`）：P 档下推力由 `updateParkGear` 自动管理，滑块拖动**不影响** P 档制动（与 T 档一致；可在 P 档时让滑块只更新显示值而不改 `thrust`，或直接忽略）。

## 物理行为对照

| 档位 | 朝向 | thrust[0] | 推力大小 | 自动回 N |
|------|------|-----------|----------|----------|
| D | 船头（用户/姿态模式控制） | +1（滑块>0） | 滑块值 | 否 |
| N | 不变 | 0 | — | — |
| R | 船头不变 | -1（滑块>0） | 滑块值 | 否 |
| T | 切向修正方向（inertial） | +1 | 按切向速度缩放 | 切向速度过零 |
| **P** | **前进方向 normalize(v)（inertial）** | **-1** | **按日心系速度缩放（≤100 MN）** | **日心系速度过零** |

## 边界情况

- **挂 P 档时速度已≈0**：`setGear` 直接落到 `N`。
- **制动到 0 的那一帧**：`updateParkGear` 用初始方向投影过零检测，在反向加速前切回 N。
- **P 档运行中手动切其他档**：立即生效，`parkInitialDirection` 清空，接管控制权。
- **P 档与导航计划并存**：P 档不清除目标/导航计划；但制动会使飞船偏离预定轨道，偏离预警可能触发（预期行为，用户主动接管）。
- **爆炸后**：`exploded` 时 Dashboard 不渲染、物理不步进，`updateParkGear` 因 `isRunning`/`exploded` 关系不产生副作用；沿用现有处理。
- **回 N 后的姿态**：保持 `inertial`（与 T 档一致），不强制恢复 `prograde`。
```
