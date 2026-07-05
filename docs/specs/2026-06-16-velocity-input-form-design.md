# 初速度输入弹窗设计文档

## 概述

将天体放置时的初速度设定从「鼠标拖动」改为「输入弹窗」。用户点击画布确定位置后，在画布点击位置附近弹出输入表单填写速度和角度，确认后将速度转换为核心单位 AU/s 并创建天体。

## 需求来源

- 用户希望精确控制初速度的方向（角度）和大小，而非通过鼠标拖动粗略设定
- 拖动方式不够精确，输入数值更适合教育场景

## 架构设计

### 新增文件

#### `src/components/builder/VelocityInputForm.tsx`

输入表单组件，在 `isPlacing` 时显示于画布点击位置附近的放置确认弹窗内。职责：

1. 接收 props: `templateId`, `onConfirm`, `onCancel`
2. 提供两个输入框：
   - **初速度大小**：数字输入，单位 km/s，默认值为该天体在搭建数据中的参考轨道速度，上限 200 km/s
   - **切向角度**：数字输入，单位 °，默认值 0°，范围 [0, 360)
3. 使用**本地状态**管理速度和角度的输入值
4. 两个按钮：「确认放置」（橙色主按钮）+「取消」
5. 「确认」时将 km/s 通过 `AU_TO_KM` 转换为核心单位 AU/s 后调用 `onConfirm(speed, angle)`，「取消」时调用 `onCancel()`

#### `src/components/builder/VelocityInputForm.css`

遵循 ControlPanel 风格（深色主题，与现有面板一致）：

- 紧凑内嵌布局，继承 ControlPanel 的 `.panel-section` 风格
- 输入框：深色背景 `#2a2a3a`，浅色文字 `#fff`，边框 `1px solid #444`
- 标签：灰色小字 `#888`，字号 11px
- 确认按钮：`background: #ffaa00; color: #000;`
- 取消按钮：`background: #333; color: #ccc;`
- 参考提示：灰色小字，字号 10px

#### `src/engine/placementVelocity.ts`

初速度方向计算工具，属于 engine 纯逻辑层。职责：

1. 导出 `computePlacementVelocity(input)`，输入为放置位置、速度大小（AU/s）、切向角度（°）和可选参考中心。
2. 按角度定义计算速度向量：0° 为逆时针切向，90° 为径向向外，180° 为顺时针切向，270° 为径向向内。
3. 只在放置位置与参考中心重合或速度为 0 时返回 `[0, 0, 0]`；不得因为距离小于或等于 1 AU 丢弃用户输入的非零速度。
4. 不依赖 React、Three.js 或 store，可用单元测试覆盖 1 AU 内行星的切向速度保留行为。

### 修改文件

#### `src/components/builder/BuilderCanvas.tsx`

- 点击画布后将渲染坐标转换为物理 AU 坐标，写入 `uiStore.clickPosPhysical`，并显示 `<VelocityInputForm />`
- `onConfirm` 回调：调用 `computePlacementVelocity()` 生成 AU/s 速度向量，再调用 `placeBody()` 提交天体
- 速度方向计算不在 `.tsx` 内实现，组件只负责 UI 事件、坐标读取和 store 调用

#### `src/stores/uiStore.ts`

- `clickPosPhysical: [number, number] | null` 保存点击位置的物理 AU 坐标
- `clickPosScreen: [number, number] | null` 保存弹窗定位所需的画布屏幕坐标
- `setClickPosPhysical()` / `setClickPosScreen()` 分别更新上述状态
- `resetUI()` 中重置 `clickPosPhysical` 和 `clickPosScreen`

### 无需修改

- `src/stores/buildStore.ts` — `placeBody` 接口不变
- `src/engine/physics.ts` — 不涉及
- `src/engine/constants.ts` — 单位换算常量继续由 `AU_TO_KM` 提供
- `src/components/toolbar/CelestialToolbar.tsx` — 不变

## 交互流程

```
选择天体 → 悬浮预览 → 点击画布位置
  → 位置锁定，模拟暂停
  → 画布点击位置附近显示 VelocityInputForm
    ├── 编辑速度/角度 → 表单本地校验速度与角度
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

## 边界情况

1. **速度为 0**：天体的初速度为零（静止放置）
2. **速度超过上限 (200 km/s)**：输入框限制最大值，超出时自动裁剪
3. **角度输入超出范围**：自动规整到 [0, 360)（`((angle % 360) + 360) % 360`）
4. **非数字输入**：「确认」按钮禁用，提示"请输入有效数值"
5. **参考中心未放置**：使用原点 (0,0,0) 作为参考，角度仍可设定
6. **卫星点击时父体缺失**：同上，以原点为参考
7. **随机点放置后立即取消**：清理 gizmos，`setIsPlacing(false)`，选天体状态保留
8. **1 AU 内放置**：只要位置不与参考中心重合，非零速度必须按角度转换为速度向量，不能被清零
