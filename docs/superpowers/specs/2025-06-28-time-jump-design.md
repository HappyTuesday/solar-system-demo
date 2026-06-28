# 探索模式 — 快捷时间跳转

**日期:** 2025-06-28
**状态:** 设计中

## 概述

在探索模式的「稳定绕飞」阶段，右上角时间倍率框中的日期和时间变为可点击，点击后展开快捷时间跳转面板，允许用户按预设步长或自定义步长向前/向后跳转模拟时间。跳转使用 Kepler 轨道方程直接解算目标时刻的所有天体状态和飞船状态，无需通过物理积分逐步演化。

## 触发条件

日期/时间区域可点击的条件：

- `orbitingBodyId !== null`（飞船绕飞某天体，包括太阳）
- `thrustMagnitude === 0`（无推力）

条件不满足时，日期/时间显示为纯文本（与当前行为一致）。

## 面板设计

点击日期/时间区域后，在 TimePanel 下方靠右展开一张浮层面板。

### 布局

```
┌──────────────────────────────┐
│  时间跳转                     │
│                              │
│  ← 1年 →      ← 1月 →       │
│  ← 1周 →      ← 1天 →       │
│  ← 1时 →      ← 10分 →      │
│                              │
│  自定义                       │
│  [N] 天后 →                  │
│  [N] 小时后 →                │
│                              │
│  [       今日       ]         │
│  面板外点击即关闭             │
└──────────────────────────────┘
```

### 元素说明

| 元素 | 说明 |
|---|---|
| 快捷按钮行 | 每行含 ←（向历史）和 →（向未来）两个按钮，中间显示步长标签 |
| 自定义 N 天 | `<input type="number" min="1" max="365" defaultValue="1">` + 「跳转」按钮 |
| 自定义 N 小时 | `<input type="number" min="1" max="8760" defaultValue="1">` + 「跳转」按钮 |
| 今日 | 一键跳回当前真实时间 `Date.now()` |
| 关闭 | 面板外点击或 Esc 键关闭面板 |

### 点击态

条件满足时，日期/时间区域应有轻微高亮效果（蓝色半透明背景 + 边框），提示可点击。

## 跳转流程

1. 用户点击快捷按钮 → 计算目标时间 `newTime = currentSimulatedTime + offsetMs`
   - ← 按钮：`newTime = simulatedTime - offsetMs`
   - → 按钮：`newTime = simulatedTime + offsetMs`
   - 「今日」：`newTime = Date.now()`
2. 调用 `jumpSpaceshipState(shipState, orbitingBodyId, simulatedTime, newTime)`
3. 更新 `spaceshipStore`：
   - `simulatedTime` → `newTime`
   - `position`、`velocity`、`direction` → 跳转计算结果
   - `thrust`、`thrustMagnitude`、`exploded` 保持不变
4. 下一帧渲染时 ExploreCanvas 自动用 Kepler 方程重新计算所有天体位置
5. 关闭面板，模拟继续运行（保持原 `timeScale` 和 `isRunning` 状态）

## 文件变更

### 新建

| 文件 | 职责 |
|---|---|
| `src/components/explore/TimeJumpPanel.tsx` | 跳转面板 React 组件 |
| `src/components/explore/TimeJumpPanel.css` | 面板样式 |

### 修改

| 文件 | 变更 |
|---|---|
| `src/components/explore/TimePanel.tsx` | 添加条件检查、点击事件、面板开关状态 |
| `src/components/explore/TimePanel.css` | 添加可点击态样式（蓝色高亮） |
| `src/stores/spaceshipStore.ts` | 添加 `timeJump(newTime: number)` action |

## 数据流

```
TimePanel 点击
  → 检查 orbitingBodyId && thrustMagnitude === 0
  → 设置 showJumpPanel = true
  → TimeJumpPanel 渲染
    → 用户选择跳转步长
    → 计算 newTime
    → 调用 spaceshipStore.timeJump(newTime)
      → 调用 engine/jumpSpaceshipState(...)
      → 更新 store: simulatedTime, position, velocity, direction
    → 关闭面板
    → ExploreCanvas 下一帧自动渲染新状态
```

## 依赖

- `src/engine/timeJump.ts`（已实现）：
  - `jumpSpaceshipState(shipState, orbitingBodyId, currentTime, targetTime)`
  - `computeAllBodyStates(jd)`
- `src/engine/orbitalInjection.ts`（已实现）：
  - `createSpaceshipState()` — 不直接使用，但 jump 内部依赖其逻辑模式

## 注意事项

- 时间偏移量使用毫秒：`1年 = 365.25*24*3600*1000`, `1月 = 30.44*24*3600*1000`, `1周 = 7*24*3600*1000`, `1天 = 24*3600*1000`, `1时 = 3600*1000`, `10分 = 600*1000`
- 跳转后不改变 `timeScale` 和 `isRunning`，模拟继续在原倍率下运行
- 面板 z-index 需高于 HUD 和 TimePanel 本身
- 跳转前后保持 `attitudeMode`、`navigationPlan` 等飞行状态不变
