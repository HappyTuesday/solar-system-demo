# 探索模式：飞船速度上限

日期：2026-07-07
状态：设计已确认，待实施

## 背景

探索模式使用牛顿力学 N 体仿真推进飞船。持续加大推力会使仿真速度无限增大，既不符合真实物理（速度存在光速上限），也让太阳系尺度的探索失去意义。

## 目标

为飞船设置一个速度硬上限：达到上限后，即使继续施加推力，速度也不再提高。

## 数值与依据

- **上限：1000 km/s（≈0.003c）**。
- 依据：明显高于真实探测器（帕克太阳探测器约 200 km/s、旅行者号约 17 km/s），保留"飞船很强"的探索感；与引擎现有巡航速度钳制（`estimateDirectCruiseSpeed` 8–300 km/s）自洽且留有余量；`γ−1 ≈ 4×10⁻⁶` 相对论修正可忽略，牛顿仿真保持准确。

## 单位约定

遵循 AGENTS.md：引擎层统一 AU / AU·s⁻¹；上限常量以 AU 标定，km↔AU 换算收拢到 `AU_TO_KM`。

## 架构与改动

### 引擎层 `src/engine/spaceship.ts`

- 新增常量 `MAX_SHIP_SPEED_AU_PER_SEC = 1000 / AU_TO_KM`。
- 新增纯函数 `clampSpeedToMax(velocity, maxSpeedAUPerSec)`：当速率超过上限时，按比例缩放速度矢量使其速率等于上限，方向不变；否则原样返回。

### 引擎层 `src/engine/exploreSimulation.ts`

- 在 `advanceExploreShipPhysics` 的每个 RK4 子步之后，用 `clampSpeedToMax` 钳制 `ship.velocity`，确保单帧内多子步累积也不会越过上限。

## 说明

- 该上限是对**速率（速度矢量的模）**的全局钳制，不区分速度来源（推力或引力）；即无论何种加速，飞船速率都不会超过 1000 km/s。
- 上限只影响速度，不改变方向，因此引力仍可改变飞行方向。

## 测试策略

- `clampSpeedToMax` 单测：低于上限原样返回；超过上限缩放到上限且方向不变；零向量安全。
- `advanceExploreShipPhysics` 集成测：给满推力、长时间推进后，`speedKms` 不超过 1000（含浮点容差）。
- `npm run build` 与 `npm run lint` 通过。
