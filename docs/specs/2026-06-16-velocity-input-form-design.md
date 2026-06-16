# 初速度输入弹窗设计文档

## 概述

将天体放置时的初速度设定从「鼠标拖动」改为「输入弹窗」。用户点击画布确定位置后，在控制面板区域弹出输入表单填写速度和角度，画布实时显示绿色箭头预览。

## 需求来源

- 用户希望精确控制初速度的方向（角度）和大小，而非通过鼠标拖动粗略设定
- 拖动方式不够精确，输入数值更适合教育场景

## 架构设计

### 新增文件

#### `src/components/controls/VelocityInputForm.tsx`

输入表单组件，在 `isPlacing` 时显示于控制面板内。职责：

1. 接收 props: `templateId`, `clickPosRender` ([x,y,z]), `onConfirm`, `onCancel`
2. 提供两个输入框：
   - **初速度大小**：数字输入，单位 m/s，默认值 0，上限 200,000 m/s
   - **切向角度**：数字输入，单位 °，默认值 0°，范围 [0, 360)
3. 使用**本地状态**管理速度和角度的输入值
4. 随输入变化**实时调用** `previewVelocityArrow()` 更新画布上的绿色箭头
5. 显示该天体的**真实轨道速度**作为参考提示
6. 两个按钮：「确认放置」（橙色主按钮）+「取消」
7. 「确认」时调用 `onConfirm(speed, angle)`，「取消」时调用 `onCancel()`

#### `src/components/controls/VelocityInputForm.css`

遵循 ControlPanel 风格（深色主题，与现有面板一致）：

- 紧凑内嵌布局，继承 ControlPanel 的 `.panel-section` 风格
- 输入框：深色背景 `#2a2a3a`，浅色文字 `#fff`，边框 `1px solid #444`
- 标签：灰色小字 `#888`，字号 11px
- 确认按钮：`background: #ffaa00; color: #000;`
- 取消按钮：`background: #333; color: #ccc;`
- 参考提示：灰色小字，字号 10px

### 修改文件

#### `src/components/controls/ControlPanel.tsx`

- 当 `uiStore.isPlacing && uiStore.clickPosRender` 时，渲染 `<VelocityInputForm />` 替代原有的 `placement-info` 卡片
- 传入 `templateId`、`clickPosRender`
- `onConfirm` 回调：调用 `placeBody()` 提交天体（与现有 `handleMouseUp` 逻辑相同）
- `onCancel` 回调：恢复 `isPlacing = false`，清理 gizmos，恢复选天体状态

#### `src/components/canvas/Canvas3D.tsx`

- **移除** `handleMouseMove` 中的速度拖动分支（`else if (isPlacing && dragStartRef.current ...)` 整块）
- **移除** `handleMouseUp` 中的放置提交逻辑（`if (isPlacing && dragStartRef.current ...)` 整块）
- **移除** 画布上的 `.speed-label` 速度覆盖层
- **新增** `handleMouseDown` 中点击后只设置位置和 `isPlacing`，不进入拖动逻辑：
  ```tsx
  // 点击后仅锁定位置，不创建 previewSphere（改用 ControlPanel 中的输入弹窗）
  dragStartRef.current = point.clone(); // 保留位置引用
  setIsPlacing(true);
  useBuildStore.getState().pauseBuild();
  ```
- 箭头预览由外部调用 `updateArrowPreview` 函数（导入自 interaction.ts）

#### `src/components/canvas/Canvas3D.css`

- 移除 `.speed-label` 样式规则

#### `src/stores/uiStore.ts`

- 新增 `clickPosRender: [number, number, number] | null` 状态
- 新增 `setClickPosRender(pos: [number, number, number] | null)` action
- `resetUI()` 中重置 `clickPosRender: null`

#### `src/rendering/interaction.ts`

- 新增 `previewVelocityArrowInPlacement()` 函数：
  ```ts
  export function previewVelocityArrowInPlacement(
    scene: THREE.Scene,
    clickPos: THREE.Vector3,      // 渲染空间点击位置
    speed: number,                 // 物理速度 (m/s)
    angleDeg: number,             // 切向角度 (°)
    posPhysical: [number, number, number],  // 物理位置
    referenceCenter: [number, number, number], // 参考中心（太阳或父天体）
  ): void
  ```
  计算逻辑：
  1. 从参考中心到天体位置的径向向量 `r = pos - center`
  2. 计算切线方向（XY 平面内逆时针旋转 90°）：`tangent = [-ry, rx, 0]`，归一化
  3. 计算径向向外方向：`radial = r / |r|`
  4. 物理速度向量：`vPhys = speed * (cos(θ) * tangent + sin(θ) * radial)`
  5. 渲染速度：`vRender = physicalVelocityToRender(vPhys, posPhysical)`
  6. 箭头可视化缩放：`vRenderScaled = vRender / DRAG_CONFIG.speedScale`
  7. 调用 `updateVelocityArrow(scene, clickPos, clickPos + vRenderScaled, color)`

#### `src/rendering/cameraRef.ts`

- 新增 `_scene: THREE.Scene | null` 及 `setSharedScene`/`getSharedScene` 函数
- 在 `Canvas3D.tsx` 初始化时通过 `setSharedScene(setup.scene)` 注册场景

### 无需修改

- `src/stores/buildStore.ts` — `placeBody` 接口不变
- `src/engine/physics.ts` — 不涉及
- `src/engine/constants.ts` — DRAG_CONFIG 仍定义 speedScale 用于箭头可视化缩放
- `src/components/toolbar/CelestialToolbar.tsx` — 不变

## 交互流程

```
选择天体 → 悬浮预览 → 点击画布位置
  → 位置锁定，模拟暂停
  → ControlPanel 显式 VelocityInputForm
  → 画布显示绿色箭头预览（随输入实时更新）
    ├── 编辑速度/角度 → 箭头实时更新
    ├── 点击「确认放置」→ placeBody() → resumeBuild() → 清理
    └── 点击「取消」→ cleanupGizmos() → 恢复选天体状态
```

## 角度定义

以参考中心天体（太阳或母体行星）为原点：

| 角度 | 方向 | 说明 |
|------|------|------|
| 0° | 切线逆时针 | 正常绕行方向（轨道速度） |
| 90° | 径向向外 | 远离中心天体 |
| 180° | 切线顺时针 | 逆行轨道 |
| 270° | 径向向内 | 朝向中心天体 |

公式：`vPhys = speed × (cos(θ) × tangent + sin(θ) × radial)`

其中 `tangent = normalize([-(ry - center_y), (rx - center_x), 0])`（XY 平面内逆时针 90°），`radial = normalize(r - center)`。

## 参考中心天体查找

- 行星（`type: 'planet'`）：参考中心 = 太阳（已放置的 `templateId === 'sun'` 天体）
- 卫星（`type: 'moon'`）：参考中心 = 其父体（已放置的 `templateId === parentId` 天体）
- 若参考中心尚未放置：退化为以原点 `(0,0,0)` 为参考中心；角度仍可设定但无实际参考意义
- 太阳：不存在此流程（太阳自动放置，速度始终为零）

## 可视化预览

箭头从点击位置出发，指向初速度方向，长度与速度大小成比例：

```
arrowLength_render = |physicalVelocityToRender(vPhys, posPhys)| / DRAG_CONFIG.speedScale
```

缩放因子 `DRAG_CONFIG.speedScale (2e-6)` 使得真实轨道速度对应的箭头在渲染空间中约 50~100 单位长，视觉上清晰可辨。

## 边界情况

1. **速度为 0**：箭头不显示，天体的初速度为零（静止放置）
2. **速度超过上限 (200,000 m/s)**：输入框限制最大值，超出时自动裁剪
3. **角度输入超出范围**：自动规整到 [0, 360)（`((angle % 360) + 360) % 360`）
4. **非数字输入**：「确认」按钮禁用，提示"请输入有效数值"
5. **参考中心未放置**：使用原点 (0,0,0) 作为参考，角度仍可设定
6. **卫星点击时父体缺失**：同上，以原点为参考
7. **随机点放置后立即取消**：清理 gizmos，`setIsPlacing(false)`，选天体状态保留
