# 导航功能强化设计文档

**日期**: 2025-06-27  
**状态**: 设计完成，待审核

---

## 1. 概述

对探索模式下的导航路线规划系统进行全面强化，使导航计划从粗粒度的"阶段"概念升级为精细化的"子步骤"体系，每个子步骤包含可执行的操作指令、明确的执行时机和条件判断。

### 核心目标
- 导航计划拆分到原子化的子步骤，每个子步骤仅要求一个简单可执行的操作
- 每个子步骤包含：执行时机（条件）、操作方式（推力/姿态）、是否当前可执行
- 未来子步骤根据飞船实时状态动态规划
- 导航地图使用蓝色虚线标示期望进入的轨道
- 通过闭环模拟验证路线的可达性

---

## 2. 架构方案：阶段 + 动态子步骤生成

保留现有 5 个导航阶段作为顶层里程碑，每个阶段激活时调用纯函数生成该阶段的具体子步骤列表。子步骤在完成、偏离航线、定时检查时重新生成。

所有新增逻辑放在 `engine/navigation.ts`（纯逻辑层），UI 渲染在 `components/explore/PhaseGuide.tsx` 中展示。

---

## 3. 子步骤类型体系

### 3.1 核心类型定义

```typescript
// src/engine/navigation.ts

export interface NavSubStepCondition {
  type: 'phase_angle_range' | 'altitude_range' | 'speed_range'
      | 'semi_major_axis_range' | 'distance_range'
      | 'window_ready' | 'immediate' | 'always';
  min?: number;
  max?: number;
  met: boolean;                 // 运行时求值，当前是否满足
  description: string;          // 人类可读条件描述
}

export interface NavSubStepAction {
  thrustDirection: 'forward' | 'backward' | 'off';
  thrustMagnitude: number;      // 0-100 (%)
  attitudeMode: 'prograde' | 'inertial' | 'target';
  targetSpeedKmS?: number;      // 目标日心速度 (km/s, 显示用)
  targetSpeedAUs?: number;      // 目标日心速度 (AU/s, 计算用)
  targetSemiMajorAxisAU?: number;
  description: string;          // 人类可读操作描述
  completionCriteria: string;   // 完成条件描述
}

export type NavSubStepType =
  | 'wait_window'              // 等待日心相位对齐（霍曼窗口）
  | 'wait_departure_tangent'   // 等待出发切线相位
  | 'burn_prograde'            // 顺向施加推力
  | 'burn_retrograde'          // 逆向施加推力
  | 'burn_circularize'         // 微调推力圆化轨道
  | 'coast_transfer'           // 转移轨道惯性滑行
  | 'coast_approach'           // 接近目标天体惯性滑行
  | 'orient_prograde'          // 调整为顺向姿态
  | 'orient_target'            // 调整为指向目标
  | 'arrival';                 // 到达目的地

export type NavSubStepStatus = 'pending' | 'ready' | 'active' | 'completed';

export interface NavSubStep {
  id: string;                   // 唯一标识，如 "phase0_wait"
  phaseId: number;              // 所属阶段索引
  order: number;                // 阶段内序号 (0-based)
  type: NavSubStepType;
  status: NavSubStepStatus;
  condition: NavSubStepCondition;
  action: NavSubStepAction;
}

export interface NavigationPhase {
  index: number;
  name: string;
  subSteps: NavSubStep[];       // 新增：阶段内的子步骤列表
  // 以下为保留的旧字段
  thrustDirection: 'forward' | 'backward' | 'none';
  thrustMagnitude: number;
  deltaV: number;
  expectedSpeedKms: number;
  expectedWaitDays?: number;
  waitEndTime?: number;
  targetOrbit: {
    semiMajorAxis: number;
    eccentricity: number;
  };
}
```

### 3.2 动作类型与操作模板

| 类型 | 推力方向 | 推力大小 | 姿态模式 | 说明 |
|------|---------|---------|---------|------|
| `wait_window` | off | 0 | inertial | 等待日心相位对齐 |
| `wait_departure_tangent` | off | 0 | inertial | 等待出发切线相位 |
| `burn_prograde` | forward | 100 | prograde | 顺向全推力加速 |
| `burn_retrograde` | backward | 100 | prograde | 逆向全推力减速 |
| `burn_circularize` | forward | 30-50 | prograde | 低推力圆化轨道 |
| `coast_transfer` | off | 0 | inertial | 转移轨道惯性滑行 |
| `coast_approach` | off | 0 | inertial | 接近目标天体滑行 |
| `orient_prograde` | off | 0 | (切换) | 切换为顺向姿态 |
| `orient_target` | off | 0 | (切换) | 切换为指向目标姿态 |
| `arrival` | off | 0 | - | 到达目的地 |

---

## 4. 各阶段子步骤生成规则

### 4.1 Phase 0: 等待发射窗口

```
子步骤：
  1. type: wait_window
     条件: 日心相位差 ≈ 霍曼要求角 (±3°)
     操作: 关闭推力，保持惯性
     完成: 窗口就绪 → 阶段自动结束
```

**调整**：不再检查出发切线（绕飞相位），仅以日心交差值为窗口判断标准。到达窗口期后该阶段自动完成，无需考虑绕飞相位。

### 4.2 Phase 1: 提升远日点 / 降低近日点

```
子步骤：
  1. type: orient_prograde
     条件: 姿态模式 ≠ prograde
     操作: 切换至「顺向保持」模式

  2. type: burn_prograde
     条件: 飞船位于绕飞天体轨道相位角 30°~150°（推力效率最优窗口）
           - 相位角定义为：飞船相对天体的位置向量与天体公转方向的角度
           - 30°-150° 范围表示飞船在绕飞天体"前方"的半圆区域
     操作:
       - 正推力: 100MN
       - 保持顺向模式（飞船方向跟随速度方向）
       - 目标日心速度: vCurrent + Δv1
       - 速度方向: 与飞船当前运动方向一致（顺向）
     完成条件: 日心半长轴达到 transferAU (a_transfer = (a_current + a_target) / 2)

  3. type: coast_transfer (条件转移)
     条件: 半长轴已达 transferAU，但尚未接近目标
     操作: 关闭推力
```

**关键指引信息**：
- 明确推力增加量：Δv1 (AU/s 和 km/s)
- 明确保持模式：顺向保持
- 明确目标速度值：显示在操作指引中
- 明确推力施加的相位窗口：30°~150°（实时显示当前相位角，指示是否在窗口内）

### 4.3 Phase 2: 转移轨道滑行

```
子步骤：
  1. type: coast_transfer
     条件: always
     操作: 关闭推力，沿转移椭圆轨道惯性滑行
     完成条件: 距目标天体距离 < 0.1 AU (或达到霍曼转移半周期)
```

### 4.4 Phase 3: 目标捕获制动 / 目标捕获加速

```
子步骤：
  1. type: orient_prograde
     条件: 姿态模式 ≠ prograde

  2. type: burn_retrograde (向外转移: 制动)
     或 burn_prograde (向内转移: 加速)
     操作:
       - 推力: 100MN
       - 保持顺向模式
       - 目标日心速度: vTargetOrbital (目标天体的轨道速度)
     完成条件: 日心半长轴达到目标天体轨道 a_target
```

### 4.5 Phase 4: 绕飞圆化

```
子步骤：
  1. type: orient_prograde
     条件: 姿态模式 ≠ prograde

  2. type: burn_circularize
      条件: 半长轴接近目标轨道
      操作:
        - 推力: 50MN（偏心率和半长轴均不达标时）; 30MN（仅偏心率超标时）
        - 保持顺向模式
      完成条件: 偏心率 < 0.01

  3. type: arrival
      条件: 偏心率 < 0.01 且 距目标天体 < 0.05 AU
      操作: 关闭推力
      标志: 到达目的地
```

---

## 5. 动态规划机制

### 5.1 触发时机

子步骤重新生成的三种触发条件：

1. **当前子步骤完成**: 完成一项子步骤后，立即调用 `generateSubSteps(shipState, phase)` 重新生成该阶段的剩余子步骤
2. **偏离航线**: 当 `checkDeviation()` 检测到半长轴偏差超过阈值时，触发 `replanNavigation()` 重新计算整个计划
3. **定时检查**: 每 `NAVIGATION_CONFIG.deviationCheckInterval` (5秒) 调用 `updateSubStepConditions()` 更新所有子步骤的条件状态（`condition.met`）和 `status`

### 5.2 核心函数

```typescript
// 为指定阶段生成子步骤列表
export function generateSubSteps(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  shipDirection: [number, number, number],
  attitudeMode: AttitudeMode,
  phase: NavigationPhase,
  destinationId: string,
  simulatedTime: number,
): NavSubStep[];

// 更新子步骤的条件满足状态
export function updateSubStepConditions(
  subtStep: NavSubStep,
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  attitudeMode: AttitudeMode,
  simulatedTime: number,
): NavSubStep;

// 获取子步骤对应的期望轨道参数（用于 MiniMap 蓝色虚线绘制）
export function getSubStepTargetOrbit(
  subStep: NavSubStep,
): { semiMajorAxis: number; eccentricity: number } | null;
```

---

## 6. 导航地图（MiniMap）改动

### 6.1 蓝色虚线：期望进入的轨道

在 MiniMap 中新增蓝色虚线，表示当前活跃子步骤的期望目标轨道：

- **颜色**: `rgba(68, 136, 255, 0.5)`（蓝色）
- **线型**: 虚线 `setLineDash([4, 3])`
- **轨道参数**: 由 `getSubStepTargetOrbit()` 返回的半长轴和偏心率
- **对应关系**:
  - `burn_prograde` → 转移轨道 (a_transfer, e=0.3)
  - `burn_retrograde` → 目标天体轨道 (a_target)
  - `burn_circularize` → 目标天体圆轨道 (a_target, e=0)
  - `coast_transfer` → 转移轨道 (a_transfer, e=0.3)

### 6.2 图例更新

MiniMap 底部图例增加蓝色虚线项：

```
蓝实心 当前轨道 | 红虚线 目标绕飞 | 绿虚线 导航轨道 | 蓝虚线 期望轨道
```

原绿色虚线（导航轨道）保留，用于标示当前阶段的整体导航轨道；蓝色虚线表示当前子步骤的精细化期望轨道。

---

## 7. UI 展示改动（PhaseGuide）

### 7.1 PhaseGuide 渲染逻辑

PhaseGuide 组件改为渲染 `NavigationPhase` 中的 `subSteps` 列表：

- 遍历 `phase.subSteps`
- 已完成子步骤：显示 ✓ 绿色标记，灰色文字
- 当前活跃子步骤：显示 → 蓝色标记，完整的操作指引
  - 操作方式描述（`action.description`）
  - 执行时机/条件描述（`condition.description`）
  - 当前是否满足条件（`condition.met` 时为 ✓，否则为 ✗）
  - 目标速度和方向信息
- 待执行子步骤：显示 ○ 灰色标记，简要描述

### 7.2 子步骤状态流转

```
pending → ready (条件满足) → active (当前执行中) → completed (完成)
```

- `pending`: 尚未轮到该子步骤
- `ready`: 该子步骤的前置步骤已完成，且执行条件已满足
- `active`: 当前正在执行的子步骤
- `completed`: 已完成

---

## 8. 单元测试设计

### 8.1 测试文件

`src/engine/__tests__/navigation.test.ts` - 扩充

### 8.2 测试场景

#### A. 子步骤生成测试

| 测试 | 输入 | 期望 |
|------|------|------|
| Phase 0 - 等待窗口 | 地球位置 + 火星位置 | 生成 `wait_window` 子步骤，条件正确 |
| Phase 1 - 提升远日点 | 地球绕日轨道 | 生成 `orient_prograde` + `burn_prograde`，推力窗口 30°-150° |
| Phase 2 - 转移滑行 | 转移轨道 | 生成 `coast_transfer`，完成条件为距离 < 0.1 AU |
| Phase 3 - 捕获制动 | 接近火星 | 生成 `orient_prograde` + `burn_retrograde` |
| Phase 4 - 绕飞圆化 | 火星轨道 | 生成 `orient_prograde` + `burn_circularize` + `arrival` |

#### B. 子步骤条件计算测试

| 测试 | 输入 | 期望 |
|------|------|------|
| 推力窗口在范围内 | 相位角 90° | `burn_prograde.condition.met === true` |
| 推力窗口在范围外 | 相位角 10° | `burn_prograde.condition.met === false` |
| 半长轴已达标 | 半长轴差 < 0.005 AU | 相应子步骤完成条件满足 |
| 距离条件达标 | 距目标 < 0.1 AU | `coast_transfer` 完成 |
| 窗口就绪条件 | 相位差 < 3° | `wait_window.condition.met === true` |

#### C. 闭环模拟执行测试（核心）

使用 RK4 步进对规划出的子步骤序列进行闭环模拟，验证可达性：

```
给定：起始日心位置/速度（如地球轨道，v = sqrt(MU_SUN_AU / a_earth)）
     目标天体（如火星）
     天体轨道运动（真实星历数据 computeBodyState）
过程：
  1. 调用 planHohmannTransfer() 获取完整导航计划
  2. 取 Phase 0 的子步骤序列
  3. 对于每个子步骤：
     a. 检查条件是否满足
     b. 若满足，按子步骤的 action 施加推力
     c. 用 RK4 步进模拟飞船运动（考虑太阳+行星引力）
     d. 推进模拟时间
     e. 更新天体位置
  4. 逐阶段执行，直到 arrivial 子步骤
验证：
  - 最终飞船日心半长轴 ≈ 目标天体半长轴 (±0.05 AU)
  - 最终飞船距离目标天体 < 0.2 AU
```

**测试场景**：
- 地球 → 火星（向外转移，Hohmann Δv ≈ 2.94 km/s）
- 火星 → 地球（向内转移）
- 地球 → 木星（远距离向外）
- 金星 → 水星（近距离向内）

#### D. 边界条件测试

- 无效目标天体返回空子步骤
- 窗口未就绪时的等待逻辑
- 偏离航线后 `replanNavigation()` 重规划验证
- 到达最后一个子步骤 `arrival` 后不再生成新子步骤

#### E. 动态规划测试

- 完成 `orient_prograde` 后重新生成，验证 `burn_prograde` 的状态更新
- 在半长轴偏离后调用 `replanNavigation()`，验证新路线仍可达目的地
- 定时检查子步骤条件更新后，`condition.met` 正确反映当前状态

---

## 9. 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/engine/navigation.ts` | 大幅修改 | 新增子步骤类型、生成函数、条件计算、期望轨道函数 |
| `src/engine/constants.ts` | 小幅修改 | 新增导航配置常量（推力窗口角度范围等） |
| `src/engine/__tests__/navigation.test.ts` | 大幅扩充 | 新增全部子步骤和闭环模拟测试 |
| `src/components/explore/PhaseGuide.tsx` | 大幅修改 | 改为渲染子步骤列表，展示条件/操作/状态 |
| `src/components/explore/PhaseGuide.css` | 小幅修改 | 新增子步骤样式 |
| `src/components/explore/MiniMap.tsx` | 小幅修改 | 新增蓝色虚线期望轨道绘制和图例 |
| `src/stores/spaceshipStore.ts` | 小幅修改 | 适配新的子步骤数据结构，新增子步骤状态更新逻辑 |
| `src/components/explore/Dashboard.tsx` | 小幅修改 | 适配新的子步骤数据结构 |

---

## 10. 实现注意事项

### 10.1 类型系统
- `wait_departure_tangent` 子步骤类型保留在类型体系中供后续使用，当前 Phase 0 不再生成该类型子步骤（仅以日心交差值为窗口判断标准）
- `NavigationPhase` 的旧字段（`thrustDirection`, `thrustMagnitude`, `deltaV` 等）在实现中保留作为阶段级汇总数据，子步骤的具体操作以前 `subSteps[i].action` 为准

### 10.2 限制
- 霍曼转移假设共面，未处理轨道倾角差异（当前模拟中各行星倾角很小，近似处理）
- 闭环模拟测试中天体运动使用简化线性近似 `pos + vel * dt`（与 `predictTrajectory` 一致）
- 子步骤的实时条件更新依赖于 `deviationCheckInterval` 间隔（默认 5 秒）
- 推力窗口相位范围 30°~150° 为经验值，基于轨道力学推进效率最优区域
