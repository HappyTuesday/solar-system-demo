# 天体状态悬浮窗设计文档

## 概述

在画布右下方增加一个半透明毛玻璃悬浮窗，实时显示所有已放置天体的运行状态（公转距离、公转角度、速度），支持点击选中天体，同时移除现有的画布矩形框选功能。

## 需求来源

- 用户希望在画布中直观看到各天体当前状态，不需要通过框选再查看
- 将天体选择方式从「矩形框选」改为「在悬浮窗中点击」

## 架构设计

### 新增文件

#### `src/components/canvas/BodyStatusPanel.tsx`

核心 React 组件，职责：

1. 从 `buildStore.bodies` 读取已放置天体列表
2. 按 `PLANET_ORDER` 排序
3. 对每个天体实时计算：
   - **公转距离**：当前天体与父天体位置的欧氏距离
   - **公转角度**：以父天体为原点，当前天体位置向量与 X 轴正向的夹角（atan2），0~360°
   - **速度**：velocity 向量的模长
4. 渲染为列表，每项显示天体名称（带颜色标识）、距离、角度、速度
5. 点击某天体项时调用 `uiStore.setSelectedBodyIds([id])` 进行单选
6. 选中的天体项有高亮样式

#### `src/components/canvas/BodyStatusPanel.css`

半透明毛玻璃风格（与 CameraControls 一致）：
- `position: absolute; bottom: 12px; right: 12px; z-index: 10`
- `background: rgba(10, 10, 30, 0.55)`
- `backdrop-filter: blur(8px)`
- 内边距、圆角、滚动支持

### 修改文件

#### `src/App.tsx`

- 在 canvas 区域内引入 `<BodyStatusPanel />`

#### `src/components/canvas/Canvas3D.tsx`

- 移除 `selectionRef`、`selectionRect` 状态相关的代码
- 移除 `handleMouseDown`、`handleMouseMove`、`handleMouseUp` 中的选择分支逻辑
- 移除 CSS 中 `.selection-rect` 相关样式

#### `src/rendering/interaction.ts`

- 删除 `selectBodiesInRect` 函数（该函数仅在 Canvas3D 中被引用）
- 保留 `setBodyHighlight`（仍用于选中高亮）

#### `src/components/canvas/Canvas3D.css`

- 移除 `.selection-rect` 样式规则

### 无需修改

- `src/stores/uiStore.ts` — 复用 `selectedBodyIds`、`setSelectedBodyIds`
- `src/stores/buildStore.ts` — 无需修改
- `src/components/controls/ControlPanel.tsx` — 继续使用 `selectedBodyIds` 显示详情操作区
- `src/components/canvas/CameraControls.tsx` — 不受影响

## 数据计算逻辑

### 父天体查找

```
templateId → CELESTIAL_TEMPLATES[templateId].parentId → bodies.find(b => b.templateId === parentId)
```

特殊情况：
- 太阳的 `parentId` 为 `undefined`，不显示距离和角度，仅显示速度
- 父天体尚未放置时，距离和角度显示 `-`

### 公转距离

```
distance = |position_body - position_parent|
```

物理单位（米），根据数值大小自动选择显示单位（m / km / 百万 km / AU）。

### 公转角度

```
angle = atan2(position_body.y - position_parent.y, position_body.x - position_parent.x)
angle_deg = ((angle / π * 180) + 360) % 360
```

### 速度

```
speed = sqrt(vx² + vy² + vz²)
```

物理单位（m/s），根据数值大小自动选择显示单位（m/s / km/s）。

## 交互设计

### 选择逻辑

- 在悬浮窗中点击天体会选中该天体
- 再次点击已选中的天体取消选中
- 在任何时候单选一个天体，不支持多选
- 选中后 3D 视图中对应天体 emissive 高亮（复用现有 `setBodyHighlight`）
- Escape 键取消选中（现有快捷键不变）

### 移除的交互

- 画布上鼠标拖拽矩形框选功能完全移除
- 移除后在无工具选中时，画布上的鼠标操作变为空操作

## 视觉设计

### 面板整体

```
┌─ 天体状态 ─────────────────┐
│                             │
│ ● 太阳       距离: -       │
│   速度: 0 m/s               │
│                             │
│ ● 地球       距离: 1.5亿km │  ← 正常项
│   角度: 127°  速度: 29.8km/s│
│                             │
│ ● 木星       距离: 7.8亿km │  ← 选中项（高亮背景）
│   角度: 45°   速度: 13.1km/s│
│                             │
│ ● 月球       距离: 38万km  │
│   角度: 210°  速度: 1.0km/s│
│                             │
└────────────────────────────┘
```

### 样式规格

| 属性 | 值 |
|------|-----|
| 位置 | 画布右下角，距边缘 12px |
| 背景 | rgba(10, 10, 30, 0.55) |
| 模糊 | backdrop-filter: blur(8px) |
| 边框 | 1px solid rgba(255, 255, 255, 0.1) |
| 圆角 | 8px |
| 宽度 | 约 220px |
| 最大高度 | 60vh，超出滚动 |
| 字体 | 12px，monospace |
| 每项高度 | 约 36px |
| 选中项背景 | rgba(68, 136, 255, 0.25) |
| 天体名称前 | 小圆点（对应天体颜色） |

## 实时更新机制

物理模拟（`physics.advanceSimulation`）直接修改 `bodies` 数组中各天体的 `position`/`velocity` 字段（in-place 修改，不创建新引用），因此 store 中 `bodies` 数组的引用在仿真期间不变，仅依赖 `useBuildStore(s => s.bodies)` 不会触发重渲染。

**解决方案**：组件同时订阅 `simulatedTime`（每仿真帧递增）：

```ts
const simulatedTime = useBuildStore(s => s.simulatedTime);
const bodies = useBuildStore(s => s.bodies);
```

- 仿真运行中：`simulatedTime` 每帧变化 → 触发重渲染 → 读取最新 positions → 更新显示
- 仿真暂停时：`simulatedTime` 不变 → 不重渲染 → 保持最后帧快照
- 放置/删除天体时：`bodies` 引用变化 → 触发重渲染 → 更新列表

为控制更新频率，使用 ref 节流，限制显示数据更新间隔 ≤ 100ms（10fps），避免 60fps 的不必要渲染。

## 边界情况

1. **无已放置天体**：面板显示空状态提示「尚未放置天体」
2. **父天体未放置**：该天体的距离和角度显示 `-`
3. **仿真暂停**：状态数据为暂停时刻的快照
4. **天体过多超出面板**：面板支持内部垂直滚动
5. **天体被删除**：store 中 `bodies` 引用变化自动触发列表更新
6. **天体碰撞合并**：碰撞后旧天体被删除，新天体被添加，`bodies` 引用自然更新
