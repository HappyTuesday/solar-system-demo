# 探索太阳系 — 宇宙飞船视角重构

## 概述

将「探索太阳系」页面（`/explore`）从第三人称正交相机视图重构为第一人称宇宙飞船视角。飞船受 N 体引力影响，用户通过仪表盘控制推力，以驾驶舱视角穿越太阳系。

## 架构变更

```
engine/
  spaceship.ts  [新]  — 飞船状态、推力施加、碰撞检测
  physics.ts          — 新增 spaceship 参数，推力矢量叠加
  constants.ts        — 新增 SPACESHIP_* 配置常量
  orbital.ts          — 不变

rendering/threejs/
  setup.ts            — 新增 createPerspectiveCamera()
  bodies.ts           — 新增 frustumCullCheck()
  grid.ts             — 不变
  trails.ts           — 不变（天体运动轨迹）

stores/
  spaceshipStore.ts [新] — 飞船位置/速度/方向/推力/爆炸/仪表盘状态

components/explore/
  ExploreCanvas.tsx   — 重写：第一人称 PerspectiveCamera + 飞船渲染
  Dashboard.tsx  [新] — 仪表盘 UI（收缩/展开、读数、控制、导航图）
  MiniMap.tsx    [新] — 导航预览图（Canvas 2D 顶视图）

pages/
  ExplorePage.tsx     — 修改：导入新组件，移除旧组件
```

## 引擎层

### spaceship.ts

飞船作为极小质量质点（mass = 1kg）参与 N 体积分。每个模拟步：

1. 计算所有天体对飞船的引力（`computeAccelerationForSpaceship`）
2. 叠加推力加速度（推力矢量 / 质量）
3. 使用 RK4 积分更新飞船位置和速度

**状态接口：**
```ts
interface SpaceshipState {
  position: [number, number, number];   // AU
  velocity: [number, number, number];   // AU/s
  direction: [number, number, number];  // 飞船朝向（单位向量）
  thrust: [number, number, number];     // 推力矢量（车身坐标系，范围 0~1）
  thrustMagnitude: number;              // 推力大小百分比 0~100
  exploded: boolean;
}
```

**函数：**
- `createSpaceshipState()` — 初始化：位置在地球轨道附近、地球引力范围内（距地球约 0.003 AU），速度 = 地球公转速度 + 绕地轨道速度，使飞船以近似圆形轨道绕地球飞行
- `applyThrust(state, thrustVector, magnitude)` — 设置推力
- `computeSpaceshipAcceleration(bodyPositions, bodyMasses)` — 引力+推力
- `checkSpaceshipCollision(state, bodyStates)` — 碰撞检测

### physics.ts 变更

- `advanceSimulation()` 新增 `spaceship: SpaceshipState` 参数
- 在 `computeAccelerations()` 的力场中叠加飞船推力
- `detectCollisions()` 增加飞船碰撞检测分支

### 天体运动

天体仍然使用 `orbital.ts` 的解析开普勒轨道计算位置。它们的运动不受飞船引力影响，不与飞船一同参与 N 体迭代。

### 碰撞

飞船碰撞半径设为 0.001 AU（约 15 万公里）。碰撞后：
- `exploded = true`
- 物理模拟停止
- 渲染层播放爆炸粒子效果
- 仪表盘显示"飞行终止"提示

### 常量 (`constants.ts`)

```ts
SPACESHIP_MASS = 1;              // kg
SPACESHIP_COLLISION_RADIUS = 0.001; // AU
SPACESHIP_MAX_THRUST = 1e-7;     // m/s^2（按 AU/s^2 换算）
SPACESHIP_START_ORBIT_RADIUS = 1.02; // AU（略大于地球轨道）
```

## 渲染层

### 相机

- **类型**：`THREE.PerspectiveCamera`，FOV = 75°，near = 0.001，far = 1000
- **位置**：每帧更新为 `spaceship.position`
- **朝向**：每帧更新为 `spaceship.direction`
- **Z-up 约定**：保持现有 Z-up（`camera.up.set(0, 0, 1)`）
- 载具速度感通过轨道线和天体的相对运动自然体现

### 视锥剔除

`bodies.ts` 新增 `isInFrustum(mesh, frustum)` 函数：
- 每帧使用 `THREE.Frustum` 检查天体中心点是否在视锥内
- 在视锥外的天体设置 `mesh.visible = false`，在视锥内的设为 `true`
- 视锥从 PerspectiveCamera 每帧提取（`frustum.setFromProjectionMatrix(...)`）

### 轨道线

轨道线仍然全部渲染（不剔除），因为：
- 线数量很少（8 条行星轨道）
- 作为深度参考和空间感来源，轨道线在天体不可见时仍有价值

### 爆炸效果

`checkSpaceshipCollision()` 触发后：
1. 在飞船位置创建粒子群（50-100 个橙色/红色球体或点精灵）
2. 粒子向外扩散（速度衰减），持续约 2 秒
3. 粒子生命结束后移除
4. 期间相机固定在爆炸位置，不再跟随移动

### 星空背景

保持现有深色背景（`0x050510`），暂不添加星点粒子（后续可优化）。

## 状态管理

### spaceshipStore.ts

```ts
interface SpaceshipStore {
  // 飞船物理状态
  position: [number, number, number];
  velocity: [number, number, number];
  direction: [number, number, number];
  
  // 推力控制
  thrustVector: [number, number, number];
  thrustMagnitude: number;
  
  // 状态标记
  exploded: boolean;
  isRunning: boolean;
  
  // 仪表盘
  dashboardExpanded: boolean;
  
  // 动作
  setThrustVector: (v: [number, number, number]) => void;
  setThrustMagnitude: (m: number) => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  setExploded: () => void;
  updatePhysics: (pos, vel) => void;
  reset: () => void;
}
```

### exploreStore.ts

移除或精简。所有飞船/探索相关状态迁移到 `spaceshipStore`。

## 组件层

### ExploreCanvas.tsx（重写）

职责：
- 初始化 Three.js 场景 + PerspectiveCamera
- 创建天体网格（复用 `bodies.ts`）
- 创建轨道线（复用 `grid.ts`）
- 每帧：天体位置更新（开普勒）、飞船物理更新（RK4）、相机跟随、视锥剔除
- 爆炸效果触发和渲染
- 不包含任何 UI 控件

### Dashboard.tsx（新）

右下角悬浮仪表盘，包含：

**收缩态：**
- 42px 圆形按钮，半透明蓝光
- 上方显示当前速度简明读数（如 "35.0 km/s"）

**展开态（240×约 400px 面板）：**
1. **位置读数**：X / Y / Z 坐标（AU），3 列网格
2. **速度 + 推力**：当前飞行速度（km/s），当前推力大小（%）
3. **飞行控制**：姿态按钮 + 平移推力按钮
   - 姿态按钮（抬头/俯冲/左转/右转）点按时按 0.1° 改变船身方向，用于精确对准导航方位
   - 姿态按钮长按时持续旋转，重复步进随按住时间从 0.1° 提升到 1°、5°，用于快速完成大角度转向
   - 姿态调整只改变 `direction` 并将姿态模式切换为 `inertial`，不直接改变飞船位置或速度
   - 平移推力按钮按住时设置对应轴向推力，松手归零
4. **导航预览图**：Canvas 2D 绘制的顶视图（MiniMap 组件）
5. **收缩按钮**：右上角 "−"，点击回到收缩态

所有读数每帧从 `spaceshipStore` 读取。

### MiniMap.tsx（新）

Canvas 2D 绘制的导航预览图（212×130px）：

- **顶视图**：XY 平面俯视
- **太阳**：中心橙色光点
- **天体**：彩色圆点（使用与 3D 视图一致的配色）
- **轨道**：理想开普勒椭圆
- **飞船**：蓝色三角形，表示飞船位置和朝向
- **方向线**：三角形前方带绿色方向指示线
- **比例**：自动缩放，确保轨道半径最大的天体可见

MiniMap 自动居中于太阳，作为一个固定比例的缩略图，独立于相机朝向。

### ExplorePage.tsx（修改）

简化为：
```tsx
<ExploreCanvas />
<Dashboard />
```

移除 `BodyInfoPanel`、`TimeSlider`、`CameraControls`。

## 交互设计

### 仪表盘按钮交互

- 抬头/俯冲/左转/右转：点按 = 0.1° 姿态微调；长按 = 连续旋转并逐级加速，松手停止
- 加速/减速：点击一次增减 10%，长按持续增减
- 所有姿态控制通过 `spaceshipStore.yawDegrees()` / `pitchDegrees()` 更新
- 所有推力控制通过 `spaceshipStore.setForwardThrust()` / `setLateralThrust()` / `setVerticalThrust()` / `setThrustMagnitude()` 更新

### 键盘快捷键（可选的增强，后期实现）

- W/S：加速/减速
- A/D：左转/右转
- Q/E：抬头/俯冲

### 仪表盘展开/收缩

- 点击收缩态的圆形按钮 → 展开
- 点击展开态右上角 "−" → 收缩
- 收缩时仍在运行（不中断飞行）

## 数据流

```
用户按下按钮
  → spaceshipStore.setThrustVector() / setThrustMagnitude()
  → animation loop (ExploreCanvas):
      → spaceshipStore 读取推力
      → engine/spaceship.ts 计算加速度（引力 + 推力）
      → engine/physics.ts RK4 积分
      → spaceshipStore.updatePhysics()
      → camera.position = spaceship.position
      → camera.lookAt(spaceship.position + direction)
      → frustum culling 更新 body.visible
      → Dashboard 读数自动更新（Zustand selector）
      → MiniMap 自动重绘
```

## 评分与对比

重构后「探索太阳系」不再包含评分和对比功能。该功能仅在「搭建」页面存在。

## 测试要点

- 飞船受引力影响，绕地球轨道应能稳定圆形（无推力时）
- 施加推力后飞船应改变轨道
- 碰撞后爆炸效果播放，飞行停止
- 仪表盘展开/收缩状态切换正常
- 导航图正确显示飞船位置和方向
- 视锥剔除：背对太阳时太阳不渲染
- 天体运动保持开普勒轨道精度
- 无 React 内存泄漏（useEffect cleanup）
