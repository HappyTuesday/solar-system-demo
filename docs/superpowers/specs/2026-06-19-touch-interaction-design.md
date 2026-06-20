# 画布触摸屏交互设计

## 概述

为画布（Three.js canvas）添加触摸屏手势支持：双指捏合缩放、双指拖拽平移、单指滑动旋转。鼠标行为保持不变。

## 手势定义

| 手势 | 条件 | 行为 |
|------|------|------|
| 单指拖动 | 工具栏无选中工具 | 旋转相机视角（水平+垂直） |
| 单指点击 | 工具栏有选中工具 | 委托给现有鼠标放置逻辑（不截获） |
| 双指捏合 | 任意 | 缩放画布 |
| 双指拖拽 | 任意 | 平移画布 |
| ≥3指 | 任意 | 忽略 |

## 架构

### 新增文件

**`src/rendering/touchInteraction.ts`** — 纯逻辑层，无 React 依赖

- 通过原生 `addEventListener` 绑定 `touchstart/touchmove/touchend/touchcancel`
- 绑定前设置 `canvas.style.touchAction = 'none'`
- 提供 `initTouchInteraction(canvas)` 和 `destroyTouchInteraction()`

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/rendering/setup.ts` | 新增 `setZoom(n)` 和 `panCamera(dx, dy)` 导出函数 |
| `src/components/canvas/Canvas3D.tsx` | 在 `useEffect` 中挂载/卸载触摸监听 |

### 手势状态机

模块级状态（不通过 React state 或 Zustand）：

```ts
// 旋转状态
let rotationActive: boolean = false;
let lastRotationX: number = 0;
let lastRotationY: number = 0;

// 双指状态
let pinchActive: boolean = false;
let lastPinchDistance: number = 0;
let lastMidX: number = 0;
let lastMidY: number = 0;

// 所有活跃触点
const activeTouches: Map<number, { x: number; y: number }> = new Map();
```

### 手势识别规则

**touchstart:**
- 1 触点 + 无选中工具 → 记录 `lastRotationX/Y`，设 `rotationActive = true`
- 1 触点 + 有选中工具 → 不启动任何手势，事件 fallthrough 到 React 鼠标逻辑
- 2 触点 → 计算初始 `lastPinchDistance` 和 `lastMidX/Y`，设 `pinchActive = true`，同时取消 `rotationActive = false`

**touchmove:**
- `rotationActive` → `dx/dy` 映射到 `rotateCameraHorizontal(-dx * 0.004)` / `rotateCameraVertical(-dy * 0.004)`
- `pinchActive` → 间距变化调用 `setZoom()`，中心点偏移调用 `panCamera()`
  - 缩放公式：`newZoom = prevZoom * (1 + distanceDelta * 0.001)`
  - 平移公式：`worldDelta = screenDelta / currentZoom`

**touchend / touchcancel:**
- 移除触点 → 如剩余触点 <2 则 `pinchActive = false`
- 如剩余触点 = 0 → `rotationActive = false`

## `setup.ts` 新增函数

### `setZoom(newZoom: number): void`

- 将 zoom 值 clamped 到 `[0.1, 3.0]`
- 调用 `applyZoom()` 更新视锥体
- 更新 `cameraRef._zoom`

### `panCamera(dx: number, dy: number): void`

- `dx/dy` 为屏幕像素偏移
- 正交相机下：`camera.position.x -= dx / zoom`, `camera.position.y -= dy / zoom`
- 同步更新 `_currentLookAt`

## 灵敏度参数

| 参数 | 值 | 说明 |
|------|----|------|
| 旋转灵敏度 | `0.004 rad/px` | 100px 滑动 ≈ 23° 旋转 |
| 缩放灵敏度 | `0.001` | distanceDelta 的缩放系数 |
| zoom 范围 | `[0.1, 3.0]` | 复用现有 zoom 范围 |

## 与现有代码的关系

- **不修改现有的** `onMouseDown/Move/Up` 处理
- **不修改** CameraControls 面板（右上角按钮）
- **不添加** 鼠标滚轮缩放或拖拽
- 触摸监听通过原生 API 绑定，使用 `passive: false` 允许 `preventDefault()`
- `touchstart` 有选中工具时不截获事件，让浏览器默认将 touch 转为 mouse 事件从而触发 React 鼠标逻辑

## 约束与边界

- 平台：仅触摸屏（iPad/手机/Windows 触屏）
- 浏览器兼容：移动端 Safari、Chrome for Android、Edge 触摸
- Three.js 正交相机不变
- 不引入新依赖
