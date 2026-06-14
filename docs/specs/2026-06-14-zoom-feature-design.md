# 画布缩放功能设计

## 概述

在相机控制面板中增加缩放 +/- 按钮，支持 0.5x ~ 3.0x 范围的正交相机缩放。

## 触发方式

- **UI 按钮**：相机控制面板底部新增 `−` 和 `+` 两个按钮
- **单击**：缩放一步（步长 0.15x）
- **长按**：连续缩放（每 50ms 一步），与现有方向键行为一致
- **重置**：点击 ↻ 按钮同时重置缩放回 1.0x

## 缩放范围

- 最小值：0.1x（视角最广）
- 最大值：3.0x（视角最近）
- 默认值：1.0x（1 世界单位 = 1 像素）

## 技术方案

### 正交相机缩放原理

调整视锥体大小：
```
frustumWidth  = canvasWidth  / zoomFactor
frustumHeight = canvasHeight / zoomFactor
camera.left   = -frustumWidth  / 2
camera.right  =  frustumWidth  / 2
camera.bottom = -frustumHeight / 2
camera.top    =  frustumHeight / 2
```

缩放倍率增加 → 视锥体减小 → 世界看起来更大（放大了）

### 文件改动

| 文件 | 改动内容 |
|------|----------|
| `src/rendering/cameraRef.ts` | 新增 `_zoom: number` 状态，暴露 `getZoom/setZoom` 接口 |
| `src/rendering/setup.ts` | 新增 `applyZoom()` `zoomIn()` `zoomOut()` `resetZoom()` 函数 |
| `src/components/canvas/CameraControls.tsx` | 面板布局从 3x3 改为 4x3，底部增加 `−` 和 `+` 按钮及对应事件处理 |
| `src/components/canvas/CameraControls.css` | 调整 grid 布局，新增 zoom 按钮样式 |

### 与 resize 的交互

`handleResize()` 中调用 `applyZoom()` 以适配新容器尺寸，保持 zoom 倍率不变。

### 与旋转的交互

旋转函数（`rotateCameraHorizontal` / `rotateCameraVertical`）不感知 zoom，只改变 camera.position。zoom 仅影响视锥体投影矩阵，两者正交。

## UI 布局

```
[   ] [ ↑ ] [   ]
[ ← ] [ ↻ ] [ → ]
[ − ] [ ↓ ] [ + ]
```

新面板为 3 行 3 列 grid，zoom 按钮位于第 3 行第 1 列和第 3 列。
