# 相机追踪功能设计

## 概述

用户可将任意天体设为"观测目标"，正交相机会自动将该天体保持在画布中央。仅影响渲染空间（相机 `position` 和 `lookAt`），不涉及物理模拟。

## 默认行为

- 默认观测目标为太阳（位于渲染空间原点 `(0, 0, 0)`），与当前行为一致
- 状态用 `null` 表示"未设置"，等价于追踪原点

## 触发方式

- **设置观测目标**：在控制面板中选中某天体后，点击「设为观测目标」按钮
- **取消观测目标**：再次点击同一按钮，恢复追踪原点（太阳）
- **旋转/复位**：相机控制面板的方向键和复位按钮围绕当前观测目标旋转，而非固定原点

## 跟踪机制

每帧在渲染循环中执行：
```
offset = camera.position - currentLookAt    // 偏移量（目标切换时计算一次）
camera.position = targetRenderPos + offset  // 每帧更新
camera.lookAt(targetRenderPos)              // 每帧更新
```

偏移量在切换观测目标时从当前相机状态快照计算，后续帧保持不变。旋转操作中的角度变化通过修改 `camera.position`（围绕目标点旋转相对向量）自然反映到偏移中。

### 正交相机旋转适配

当前旋转函数硬编码围绕原点 `(0, 0, 0)` 执行，需改为围绕当前观测目标的渲染位置：

```
// 相机位置相对目标的偏移
dx = camera.position.x - target.x
dy = camera.position.y - target.y
r = sqrt(dx² + dy²)
angle = atan2(dy, dx)

// 旋转后
newAngle = angle + step
camera.position.x = target.x + r * cos(newAngle)
camera.position.y = target.y + r * sin(newAngle)
camera.lookAt(target)
```

`rotateCameraVertical` 和 `resetCamera` 同理。

## 状态存储

| 存储位置 | 用途 |
|----------|------|
| `uiStore.observationTargetId: string \| null` | React 组件读取/写入 |
| `cameraRef._observationTargetId: string \| null` | 非 React 层（CameraControls 的 setInterval 回调）读取 |

两个值保持同步。

## 文件改动

| 文件 | 改动内容 |
|------|----------|
| `src/types/index.ts` | `UIState` 新增 `observationTargetId: string \| null` |
| `src/stores/uiStore.ts` | 新增 `observationTargetId` 初始值（`null`）和 `setObservationTargetId` 方法 |
| `src/rendering/cameraRef.ts` | 新增 `getObservationTargetId()` / `setObservationTargetId()` 和 `getCurrentLookAt()` / `setCurrentLookAt()`，后者由 `Canvas3D` 每帧更新，供 `CameraControls` 旋转时读取 |
| `src/rendering/setup.ts` | `rotateCameraHorizontal` / `rotateCameraVertical` / `resetCamera` 增加可选 `target?: THREE.Vector3` 参数，默认 `(0,0,0)` 保持向后兼容 |
| `src/components/canvas/Canvas3D.tsx` | 动画循环中：订阅 `observationTargetId`，找到目标天体的渲染位置，计算偏移并更新相机 |
| `src/components/canvas/CameraControls.tsx` | 从 `getObservationTargetId()` 推断目标天体渲染位置，传给旋转/复位函数 |
| `src/components/controls/ControlPanel.tsx` | 选中天体编辑区域新增「设为观测目标」按钮 |
