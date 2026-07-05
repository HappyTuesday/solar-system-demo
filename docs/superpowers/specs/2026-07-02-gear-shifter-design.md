# 飞行控制档位切换器设计

## 概述

在探索模式 Dashboard 的飞行控制面板中，缩小现有推力滑块，并在其右侧新增 D/N/R 三档位切换器。

## 需求

1. **缩小推力滑块** — 降低滑块的视觉高度
2. **增加档位切换器** — 三个按钮（D 前进 / N 空档 / R 倒档），与滑块在同一行，中间用竖线分隔
3. **N 空档行为** — 无论推力滑块处在任何位置，飞船均无推力
4. **R 倒档行为** — 飞船船头方向不变，但推力方向反转（向船尾方向施加推力）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/stores/spaceshipStore.ts` | 新增 `gear` 状态和 `setGear` action |
| `src/components/explore/Dashboard.tsx` | UI：缩小滑块、增加 D/N/R 按钮、档位联动推力逻辑 |
| `src/components/explore/Dashboard.css` | 档位按钮和滑块行新样式 |
| `src/engine/spaceship.ts` | **无需改动** — `applyThrustInBodyFrame` 已支持 `forwardBack = -1` |

## Store 改动

```typescript
// 新增类型
type Gear = 'D' | 'N' | 'R';

// 新增状态字段
gear: 'D' as Gear,

// 新增 action
setGear: (g: Gear) => void; // 切换档位同时更新 forwardThrust
```

`setGear` 的实现逻辑：
- `'D'` → `thrust[0] = thrustMagnitude > 0 ? 1 : 0`
- `'N'` → `thrust[0] = 0`
- `'R'` → `thrust[0] = thrustMagnitude > 0 ? -1 : 0`

## UI 布局

```
┌──────────────────────────────────────────────┐
│ ████████████████░░░░░░░░░░░░░░░ │  D  N  R  │
│ 推力 XX MN                       │ 前进空档倒档│
└──────────────────────────────────────────────┘
```

- 滑块高度：从 22px 缩小到 12px
- 档位按钮：三个等宽 inline 按钮，当前档位高亮
- 分隔线：1px 竖线，颜色 `rgba(0, 180, 255, 0.12)`
- D 高亮：绿色 `rgba(0, 255, 128, 0.15)` / `#00ff88`
- N 高亮：黄色 `rgba(255, 200, 0, 0.12)` / `#ffcc00`
- R 高亮：红色 `rgba(255, 80, 50, 0.15)` / `#ff5535`
- 滑块在 N/R 档位时，填充色可略微变暗或不变，不影响用户体验

## 物理行为

| 档位 | 滑块 > 0 | thrust[0] | 推力方向 |
|------|---------|-----------|----------|
| D    | 是      | 1         | 沿船头方向 |
| D    | 否      | 0         | 无       |
| N    | 任意    | 0         | 无       |
| R    | 是      | -1        | 沿船头反方向 |
| R    | 否      | 0         | 无       |

倒档时 `applyThrustInBodyFrame(-1, thrust[1], thrust[2], magnitude, direction)` 将 forward 分量反向，飞船向船尾方向移动，`direction` 向量不受影响。

## 边界情况

- **滑块拖动中切换档位**：立即生效，滑块位置保留但推力方向及时更新
- **导航模式激活时切到 N/R**：导航系统的自动推力控制会被覆盖，可能导致偏离预警触发（这是预期行为 — 用户主动接管控制）
- **触屏兼容**：档位按钮使用 `onMouseDown` + `preventDefault` 防止页面缩放/滚动，与现有按钮风格保持一致
- **爆炸后隐藏**：exploded 状态下整体 Dashboard 不渲染，无需特殊处理
