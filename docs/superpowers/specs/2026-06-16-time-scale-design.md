# 时间轴缩放功能设计

## 概述

允许用户在模拟运行过程中调整时间缩放倍率（timeScale），控制模拟速度的快慢。

## 需求

- **倍率范围**：1 万倍 ~ 100 万倍（1e4 ~ 1e6）
- **默认值**：10 万倍（1e5）
- **步长**：线性 ±10 万倍/次
- **控件**：+/- 按钮，放在右侧控制面板
- **约束**：在范围边界处按钮禁用，仅模拟运行时允许调节

## 架构设计

### 数据流

```
ControlPanel (+/- 按钮)
    → buildStore.adjustTimeScale(delta)
        → 更新 timeScale 状态（clamp 1e4~1e6）
            → Canvas3D 动画循环读取 timeScale
                → advanceSimulation(bodies, dt, timeScale)
```

### 各层改动

#### 1. `engine/physics.ts`

`advanceSimulation` 增加 `timeScale` 参数，替代对 `PHYSICAL_CONSTANTS.timeScale` 的硬编码依赖：

```ts
export function advanceSimulation(
  bodies: CelestialBody[],
  realDelta: number,
  timeScale: number
): number {
  const simDelta = realDelta * timeScale;
  // ... 其余逻辑不变
}
```

#### 2. `stores/buildStore.ts`

新增字段和 action：

```ts
interface BuildStore extends BuildState {
  timeScale: number;
  setTimeScale: (scale: number) => void;
  adjustTimeScale: (delta: number) => void;
  // ... 已有字段
}
```

- `timeScale`：初始值 `PHYSICAL_CONSTANTS.timeScale`（1e5）
- `setTimeScale(scale)`：直接设置值，clamp 到 [1e4, 1e6]
- `adjustTimeScale(delta)`：增量调节 `timeScale += delta`，clamp 到 [1e4, 1e6]
- `resetBuild`：将 timeScale 重置为默认值 1e5

#### 3. `components/canvas/Canvas3D.tsx`

动画循环中：

```ts
const timeScale = useBuildStore(s => s.timeScale);
const simDelta = advanceSimulation(bodies, dt, timeScale);
```

#### 4. `components/controls/ControlPanel.tsx`

在播放/暂停按钮上方新增一栏：

```
−  速度倍率  10万×  +
```

- `−` 按钮：`adjustTimeScale(-1e5)`，到达下限 1e4 时禁用
- `+` 按钮：`adjustTimeScale(+1e5)`，到达上限 1e6 时禁用
- 显示文本：格式化为 "X万×"（如 1万×、10万×、100万×）
- 仅在有天体且非自动搭建时可用

## 边界情况

- 倍率始终 clamp 在 1e4 ~ 1e6 范围内
- `resetBuild` 时 timeScale 重置为默认值 1e5
- 快照保存/加载时不包含 timeScale（始终使用当前 store 值）
