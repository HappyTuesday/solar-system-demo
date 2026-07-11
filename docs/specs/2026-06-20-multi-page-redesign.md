# 多页重构设计文档

> **日期**: 2026-06-20
> **状态**: 已确认
> **概述**: 将单页面「太阳系搭建演示」重构为多页面「太阳系探索」站点，提升项目定位为太阳系科普教育平台。

---

## 1. 目标与定位

| 项 | 旧 | 新 |
|----|----|----|
| 定位 | 太阳系搭建挑战游戏 | 太阳系综合科普教育平台 |
| 页面数 | 1（SPA） | 5（首页 + 搭建 + 探索太阳系 + 探索地月 + 关于） |
| 导航 | 无 | 顶部菜单栏 + 导航栏 |
| 渲染 | Three.js only | Canvas 2D（搭建）+ Three.js（探索） |
| 扩展性 | 不支持 | 支持后续增加页面 |

---

## 2. 路由设计

### 2.1 技术选型

使用 `react-router-dom` v7（兼容 React 19），在 `main.tsx` 中包裹 `BrowserRouter`。应用部署到 GitHub Pages 项目站点时使用 `/solar-system-demo/` 子路径，因此 `BrowserRouter` 的 `basename` 必须来自 Vite 的 `import.meta.env.BASE_URL`；本地根路径开发时该值为 `/`，不设置子路径前缀。

```typescript
// 路由表
const routes = [
  { path: '/',            element: <HomePage /> },
  { path: '/builder',    element: <BuilderPage /> },
  { path: '/explore',    element: <ExplorePage /> },
  { path: '/earth-moon', element: <EarthMoonPage /> },
  { path: '/about',      element: <AboutPage /> },
];
```

### 2.2 App.tsx 结构

`App.tsx` 变为路由容器 + 全局布局组件：

```
<BrowserRouter>
  <TopNav />                  <!-- 顶部导航栏，所有页面共享 -->
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/builder" element={<BuilderPage />} />
    <Route path="/explore" element={<ExplorePage />} />
    <Route path="/earth-moon" element={<EarthMoonPage />} />
    <Route path="/about" element={<AboutPage />} />
  </Routes>
</BrowserRouter>
```

### 2.3 导航栏

```
┌──────────────────────────────────────────────────────────┐
│  ☀ 太阳系探索   首页 | 搭建太阳系 | 探索太阳系 | 探索地月系统 | 关于  │
└──────────────────────────────────────────────────────────┘
```

- 左侧：Logo 图标 + 站点名称「太阳系探索」
- 右侧：菜单项列表，当前页高亮（`NavLink` active 样式）
- 移动端：响应式汉堡菜单
- 固定顶部，`z-index` 高于页面内容
- 导航栏高度约 48-56px

---

## 3. 目录结构变更

```
src/
├── main.tsx                    # 入口：BrowserRouter 包裹
├── App.tsx                     # 路由容器 + TopNav
├── App.css                     # 全局样式
│
├── pages/                      # 【新】页面级组件
│   ├── HomePage.tsx
│   ├── HomePage.css
│   ├── BuilderPage.tsx
│   ├── BuilderPage.css
│   ├── ExplorePage.tsx
│   ├── ExplorePage.css
│   ├── EarthMoonPage.tsx
│   ├── EarthMoonPage.css
│   ├── AboutPage.tsx
│   └── AboutPage.css
│
├── components/
│   ├── layout/                 # 【新】全局布局
│   │   ├── TopNav.tsx
│   │   └── TopNav.css
│   ├── builder/                # 【重组】搭建页组件（原 toolbar/canvas/controls/history）
│   │   ├── BuilderCanvas.tsx   # Canvas 2D 画布（新，替代 Canvas3D）
│   │   ├── CelestialToolbar.tsx
│   │   ├── CelestialToolbar.css
│   │   ├── ControlPanel.tsx
│   │   ├── ControlPanel.css
│   │   ├── HistoryPanel.tsx
│   │   ├── HistoryPanel.css
│   │   ├── ScoreModal.tsx
│   │   ├── ScoreModal.css
│   │   ├── VelocityInputForm.tsx
│   │   ├── VelocityInputForm.css
│   │   ├── CoordinateDisplay.tsx
│   │   ├── CoordinateDisplay.css
│   │   ├── Ruler.tsx
│   │   ├── Ruler.css
│   │   ├── BodyStatusPanel.tsx
│   │   ├── BodyStatusPanel.css
│   │   ├── CloseApproachOverlay.tsx
│   │   └── CloseApproachOverlay.css
│   ├── explore/                # 【新】探索太阳系
│   │   ├── ExploreCanvas.tsx
│   │   ├── CameraControls.tsx
│   │   ├── CameraControls.css
│   │   ├── BodyInfoPanel.tsx
│   │   ├── BodyInfoPanel.css
│   │   └── TimeSlider.tsx
│   ├── earthmoon/              # 【新】探索地月系统
│   │   ├── EarthMoonCanvas.tsx
│   │   ├── MoonPhase.tsx
│   │   ├── MoonPhase.css
│   │   ├── EclipsePanel.tsx
│   │   ├── TimeSlider.tsx
│   │   └── SunDirectionIndicator.tsx
│   └── shared/                 # 【新】跨页面共享
│       └── ErrorBoundary.tsx
│
├── rendering/
│   ├── canvas2d/               # 【新】搭建页 Canvas 2D 渲染
│   │   ├── setup.ts
│   │   ├── bodies.ts
│   │   ├── grid.ts
│   │   └── interaction.ts
│   └── threejs/                # 【重组】探索页 Three.js（保留现有代码）
│       ├── setup.ts
│       ├── bodies.ts
│       ├── grid.ts
│       ├── interaction.ts
│       ├── cameraRef.ts
│       ├── touchInteraction.ts
│       └── trails.ts
│
├── engine/                     # 修改：增加 dimension 参数，新增 eclipse.ts
│   ├── constants.ts            # 修改：精简模板，新增简化半径表
│   ├── physics.ts              # 修改：增加 dimension: 2 | 3 参数
│   ├── scoring.ts              # 不变
│   ├── orbital.ts              # 不变（探索页复用）
│   ├── autoBuild.ts            # 修改：适配 2D 模式
│   ├── coordinateTransform.ts  # 修改：2D 模式下为 1:1 恒等映射
│   └── eclipse.ts              # 【新】月食计算
│
├── stores/
│   ├── buildStore.ts           # 不变
│   ├── uiStore.ts              # 修改：移除 3D 相关状态
│   ├── historyStore.ts         # 不变
│   ├── exploreStore.ts         # 【新】探索太阳系状态
│   └── earthMoonStore.ts       # 【新】地月系统状态
│
├── hooks/
│   ├── useKeyboardShortcuts.ts  # 修改：仅在搭建页生效
│   ├── useAudio.ts              # 不变
│   └── useRestore.ts            # 不变
│
└── persistence/
    └── repository.ts            # 不变
```

---

## 4. 页面详细设计

### 4.1 首页（HomePage）

**路由**: `/`

**布局**: 居中单栏

**内容**:
- 大标题：「☀ 太阳系探索」
- 副标题：「了解、搭建、探索我们的太阳系」
- 三个功能入口卡片（各 280-320px 宽），水平排列：
  1. **搭建太阳系** — 图标 + 简短描述 +「开始搭建」按钮 → `/builder`
  2. **探索太阳系** — 图标 + 简短描述 +「开始探索」按钮 → `/explore`
  3. **探索地月系统** — 图标 + 简短描述 +「开始探索」按钮 → `/earth-moon`
- 太阳系简介文字段落
- 背景：深色渐变 + 可选星空粒子效果

**无额外依赖**，纯 React + CSS。

---

### 4.2 搭建页面（BuilderPage）

**路由**: `/builder`

**布局**: 三栏（左 220px | 中 1fr | 右 280px），与现有基本一致。

```
┌──────────┬─────────────────────────────┬──────────┐
│ 天体工具栏 │        Canvas 2D 画布       │  控制面板 │
│ (左侧)   │   - 标尺叠加                 │  + 历史  │
│          │   - 坐标显示                 │          │
│          │   - 天体状态面板(右下浮动)     │          │
│          │   - 碰撞警告(左上浮动)        │          │
└──────────┴─────────────────────────────┴──────────┘
```

#### 4.2.1 Canvas 2D 渲染层 (`rendering/canvas2d/`)

| 文件 | 职责 | 接口 |
|------|------|------|
| `setup.ts` | 初始化 Canvas 元素，获取 2D context，注册 resize 监听（`devicePixelRatio` 高清适配） | `initCanvas(container: HTMLElement): CanvasRenderingContext2D` |
| `bodies.ts` | 圆形绘制（`arc` + `fill`），简化半径映射。选中态外发光圆环。无纹理，纯色+渐变 | `drawBody(ctx, body, config)`, `drawSelectionRing(ctx, body)` |
| `grid.ts` | 参考平面网格线 + 轨道虚线环（提示系统用） | `drawGrid(ctx, viewport)`, `drawOrbitRing(ctx, center, radius)` |
| `interaction.ts` | Canvas ↔ 物理坐标转换（1:1 映射）、悬停预览圆、速度箭头、点击检测 | `canvasToPhysics(mx, my, viewport): Vec2`, `drawVelocityArrow(ctx, pos, vel)`, `hitTest(mx, my, bodies): id` |

#### 4.2.2 尺寸系统

天体使用简化半径表（单位：物理单位，与 Canvas 像素 1:1 对应）：

| 天体 | 半径（物理单位 = px） |
|------|----------------------|
| 太阳 | 40 |
| 木星 | 25 |
| 土星 | 22 |
| 天王星 | 18 |
| 海王星 | 18 |
| 地球 | 14 |
| 金星 | 13 |
| 火星 | 11 |
| 水星 | 9 |

定义在 `engine/constants.ts` 的 `SIMPLIFIED_RADII` 常量中。

#### 4.2.3 物理层改动

`engine/physics.ts`：
```typescript
function computeAccelerations(bodies: CelestialBody[], dimension: 2 | 3): Vec3[]
function rk4Step(bodies: CelestialBody[], dt: number, dimension: 2 | 3): CelestialBody[]
function advanceSimulation(bodies, dt, timeScale, dimension): SimulationResult
function detectCollisions(bodies: CelestialBody[], dimension: 2 | 3): CollisionEvent[]
```

- `dimension = 2` 时，所有位置的 Z 分量固定为 0，引力和速度计算忽略 Z
- 碰撞检测仅计算 XY 平面距离
- 软化因子和行为不变

`engine/coordinateTransform.ts`：
- 2D 模式：`physicalToRender(p) = p`（恒等映射），1:1 空间映射
- 但需要支持视口平移和缩放（pan/zoom），由视口变换矩阵处理

#### 4.2.4 视口控制

- 滚轮缩放（以鼠标位置为中心点）
- 鼠标中键/右键拖拽平移
- 缩放范围：x0.1 ~ x10.0
- 双击空白区域重置视口
- 视口状态存储在 builder 页面组件 state 中（或 uiStore 中）

#### 4.2.5 工具栏

仅显示 1 恒星 + 8 行星（共 9 个模板），不显示任何卫星。模板定义不变，仅过滤掉 `type === 'moon'` 的项。

#### 4.2.6 移除的功能

| 功能 | 说明 |
|------|------|
| 卫星模板 | 工具栏不再显示卫星 |
| 自转 | `rotationSpeed`/`rotationPhase` 字段保留但不再有 UI 控制 |
| 3D 相机面板 | `CameraControls` 组件不再使用 |
| 3D 轨迹拖尾 | `trails.ts` 不再被搭建页引用 |
| 坐标空间转换 | 物理=渲染，不再需要三层坐标显示 |

#### 4.2.7 保留的功能（完整迁移）

| 功能 | 依赖模块 | 说明 |
|------|----------|------|
| 天体放置 | buildStore, uiStore | 点击预览 → 速度表单 → 确认放置 |
| 模拟运行 | buildStore, physics.ts(2D) | 播放/暂停/完成/速度调节 |
| 评分系统 | scoring.ts, ScoreModal | 4 维度评分 + 5% 容差 |
| 历史记录 | historyStore, persistence/ | 快照保存/恢复，localStorage |
| 撤销/重做 | buildStore (Command) | Ctrl+Z / Ctrl+Shift+Z |
| 监督模式 | uiStore, ControlPanel | 实时误差显示 |
| 提示系统 | uiStore, Canvas3D(→BuilderCanvas) | 轨道环 + 引导箭头 |
| 自动搭建 | autoBuild.ts, useRestore | 一键真实还原（仅 1太阳+8行星） |
| 碰撞检测 | physics.ts(2D) | 碰撞合并 + 动量守恒 |
| 音效 | useAudio | 放置/完成/碰撞/点击 |
| 速度输入 | VelocityInputForm | 速率 + 角度（2D 平面内） |

---

### 4.3 探索太阳系页面（ExplorePage）

**路由**: `/explore`

**布局**: 全屏 3D 画布 + 右侧浮动面板

```
┌──────────────────────────────────────────────────┐
│                                                  │
│             Three.js 3D 画布（全屏）               │
│                                                  │
│   17 个天体，真实纹理，开普勒轨道运动               │
│   透视相机，完整手势交互                           │
│                                                  │
│         ┌────────────┐   ┌─────────────┐        │
│         │ 相机控制面板│   │  天体信息面板 │        │
│         │ (浮动右上) │   │  (浮动右下)  │        │
│         └────────────┘   └─────────────┘        │
│                                                  │
├──────────────────────────────────────────────────┤
│        时间轴控制条  [◀◀] [▶] [▶▶]                │
└──────────────────────────────────────────────────┘
```

#### 4.3.1 场景初始化

- **相机**: `PerspectiveCamera`，fov: 45, near: 0.1, far: 1e6
- **初始位置**: 从黄道面上方约 45° 俯视，距离原点约 80 AU
- **背景**: 深黑色星空（粒子系统或 skydome 纹理）
- **光照**: `AmbientLight`（弱环境光）+ `PointLight`（太阳位置，提供基础照明）

#### 4.3.2 天体数据与运动

- 数据来源：`engine/constants.ts` 的 `REAL_DATA`
- 运动计算：`engine/orbital.ts`
  - `stateVectors(keplerElements, time)` → 日心位置/速度
  - 初始时间 = 当前 UTC 时间（`julianDate()`）
- 天体更新频率：每帧（~60fps）
- 卫星位置 = 行星日心位置 + 行星中心轨道位置

关键常量（来自 `REAL_DATA`）：
- 太阳静止于原点 [0, 0, 0]
- 8 大行星按真实轨道参数绕日运动
- 卫星绕各自行星运动（使用行星中心轨道元素）

#### 4.3.3 Three.js 渲染

- 复用 `rendering/threejs/` 所有模块
- 17 个天体带真实纹理
- 土星环
- 轴向倾斜（`REAL_DATA` 中的 `axialTilt`）
- 轨道虚线环（半透明，每个行星一个环）
- 参考平面网格（XZ 平面，黄道面）
- 行星拖尾（可选，由 `exploreStore.showTrails` 控制）

#### 4.3.4 相机控制

| 操作 | 行为 |
|------|------|
| 鼠标左键拖拽 | 旋转（围绕当前观察目标） |
| 滚轮 | 缩放（以鼠标位置为中心） |
| 鼠标右键/中键拖拽 | 平移 |
| 双指拖拽 | 旋转 |
| 双指捏合 | 缩放 + 平移 |
| 点击天体 | 相机平滑过渡到该天体，设为观察目标 |
| 相机控制面板 | 与现有 `CameraControls` 一致：方向按钮 + 缩放按钮 + 复位 |
| 重置按钮 | 回到初始视角 |

使用 `rendering/threejs/touchInteraction.ts`（现有代码，需适配 PerspectiveCamera）。

#### 4.3.5 天体信息面板

选中天体后，在右下角浮动面板显示：

| 字段 | 来源 |
|------|------|
| 名称（中文） | REAL_DATA.name |
| 类型 | REAL_DATA.type |
| 质量（kg） | REAL_DATA.mass |
| 直径（km） | REAL_DATA.radius * 2 / 1000 |
| 与太阳距离 | 从当前位置计算（AU + km） |
| 轨道速度 | 从当前位置计算（km/s） |
| 自转周期 | REAL_DATA.rotationSpeed |
| 卫星数量 | 从 REAL_DATA 中统计该行星的卫星数 |

#### 4.3.6 时间控制

底部时间条：

```
[◀◀ 后退10天] [▶ 播放/暂停] [▶▶ 前进10天]  速度: [1x] [10x] [100x] [1000x] [100000x]
```

- 播放时，`simulatedTime` 按 `timeScale` 递增
- 暂停时冻结时间
- 快速前进/后退：跳转 ±10 天（或更大步长）
- 时间显示：「2026年6月20日 14:30 UTC」

#### 4.3.7 状态管理

`stores/exploreStore.ts`（独立于 buildStore）：

```typescript
interface ExploreState {
  simulatedTime: number;       // 当前模拟时间（JD）
  timeScale: number;            // 时间倍速，1x ~ 1,000,000x
  isRunning: boolean;           // 是否运行中
  selectedBodyId: string | null; // 选中的天体
  cameraTarget: [number, number, number]; // 相机观察目标
  showTrails: boolean;          // 是否显示轨迹
  trailLength: number;          // 轨迹长度
  zoom: number;                 // 缩放级别
}
```

---

### 4.4 探索地月系统页面（EarthMoonPage）

**路由**: `/earth-moon`

**布局**: 全屏 3D 画布 + 右侧浮动面板

```
┌──────────────────────────────────────────────────┐
│                                                  │
│             Three.js 3D 画布（全屏）               │
│                                                  │
│   地球（中心，带纹理 + 自转 + 轴倾斜 23.4°）       │
│   月球（绕地球公转，纹理，同步自转）                │
│   远处太阳（定向光源 + 方向指示箭头）              │
│   星空背景                                       │
│                                                  │
│    ┌──────────────┐   ┌──────────────┐          │
│    │  月相显示     │   │  数据面板     │          │
│    │  🌑 → 🌕     │   │  地月距离     │          │
│    │  当前月相名称 │   │  月球倾角     │          │
│    └──────────────┘   │  太阳高度角   │          │
│                       │  日食/月食日期 │          │
│    ┌──────────────┐   └──────────────┘          │
│    │ 相机控制面板  │                              │
│    └──────────────┘                              │
│                                                  │
├──────────────────────────────────────────────────┤
│        时间轴控制条                                │
└──────────────────────────────────────────────────┘
```

#### 4.4.1 场景初始化

- **相机**: `PerspectiveCamera`，fov: 50
- **初始位置**: 从地球上方（略微偏向一侧），距离约 50 万 km（可看到地月系统全貌）
- **光照**:
  - `DirectionalLight`（主光源，方向 = 地球 → 太阳方向向量）
  - `AmbientLight`（极弱环境光，模拟星星光照，强度 0.05）
  - **不使用** PointLight（太阳太远，应使用平行光）
- **背景**: 星空粒子系统

#### 4.4.2 天体

| 天体 | 位置 | 渲染 | 自转 |
|------|------|------|------|
| 地球 | 场景原点 (0, 0, 0) | 高精度纹理球体 | 自转周期 24h，轴倾斜 23.4°（对应黄赤交角） |
| 月球 | 绕地球轨道 | 灰白色纹理球体 | 同步自转（永远同一面朝向地球） |
| 太阳（渲染） | 极远处（方向参考点）| 不可见，仅光源 | N/A |

#### 4.4.3 轨道计算

- **月地轨道**: 使用 `engine/orbital.ts`，以地球为中心的开普勒轨道
  - `semiMajorAxis = 384400 km`
  - `eccentricity = 0.0549`
  - `inclination = 5.145°`（相对黄道面）
  - 轨道周期 = 27.32 天（恒星月）

- **太阳相对于地球的位置**: 使用 `engine/orbital.ts` 计算地球日心位置，取反向量
  - 等价于地球绕日轨道的反向

- **场景空间缩放**: 物理→渲染使用对数或分段压缩
  - 月球轨道（38万 km）在场景中约 20-30 单位
  - 太阳距离（1 AU ≈ 1.5亿 km）在场景中约 100-200 单位
  - DirectionalLight 的方向基于真实几何关系，不受缩放影响

#### 4.4.4 黄赤交角

- 地球自转轴倾斜 23.44°，相对于黄道面法线（世界 Y 轴）
- 倾斜方向指向春分点方向
- 体现：地球的亮面/暗面随时间变化，极地区域交替照明

#### 4.4.5 太阳方向指示

使用**多个平行箭头**来模拟太阳方位：
- 从太阳方向指向地球/月球
- 箭头在场景中以半透明金黄色线段+箭头显示
- 显示在场景边缘（太阳方向约 100 单位远）
- 箭头数量：3-5 条，均匀分布在太阳方向截面上
- 箭头随太阳位置实时更新

#### 4.4.6 月相

计算：基于太阳-地球-月球夹角（相位角）

```typescript
function getMoonPhase(sunPos: Vec3, earthPos: Vec3, moonPos: Vec3): MoonPhase {
  const earthToMoon = normalize(sub(moonPos, earthPos));
  const earthToSun = normalize(sub(sunPos, earthPos));
  const cosAngle = dot(earthToMoon, earthToSun);
  const phaseAngle = Math.acos(cosAngle);  // 0 = 满月, π = 新月
  // 0°-45°: 满月, 45°-90°: 亏凸月, 90°-135°: 下弦月, 135°-180°: 残月
  // 180°-225°: 新月, 225°-270°: 蛾眉月, 270°-315°: 上弦月, 315°-360°: 盈凸月
}
```

月相面板显示：
- 当前月相图标（8 个阶段）
- 月相名称（中文）
- 月相角

#### 4.4.7 月食效果

**计算**: 判断地球阴影是否落在月球上

```typescript
// 月食条件：月球-地球-太阳近似共线（满月时），且月球进入地球本影
function getEclipseType(sunPos, earthPos, moonPos): 'none' | 'penumbral' | 'partial' | 'total' {
  // 计算月球是否在地球本影锥体内
  // 本影锥角 ≈ (R_sun - R_earth) / d_SE * R_earth / d_EM 相关
}
```

**渲染**: 月球进入地球本影时，表面变暗变红（散射红光效果）。通过调整月球材质的 `emissive` 颜色来实现。

**日食/月食日期面板**:
- 显示未来 N 次月食的日期和类型
- 显示未来 N 次日食的日期和类型（日食信息，虽然场景不直接展示日食）
- 计算基于近期月食预测（至少未来 1 年）
- 点击日期可快速跳转到该时间

#### 4.4.8 数据面板

| 显示项 | 更新频率 | 计算方式 |
|--------|----------|----------|
| 地月距离 | 每帧 | `|moonPos - earthPos|` |
| 月球轨道倾角 | 每帧 | 实时轨道面法线与黄道面法线夹角 |
| 太阳高度角（对地球）| 每帧 | 太阳方向向量与地球表面切平面的夹角 |
| 太阳高度角（对月球）| 每帧 | 同上 |
| 月相角 | 每帧 | 日-地-月夹角 |
| 下一次月食 | 每帧 | 根据时间推算 |

#### 4.4.9 相机控制

与探索太阳系页面相同的交互模式：
- 鼠标左键拖拽旋转
- 滚轮缩放
- 右键/中键平移
- 双指手势
- 点击地球 → 拉近到地球
- 点击月球 → 拉近到月球
- 复位按钮 → 回到地月系统全貌视角

#### 4.4.10 时间控制

与探索太阳系页面相同的时间轴条，但扩展步长选项：
- 1x（实时）、1h/s、1d/s、1m/s（月/秒）
- 快速跳转：±1天、±1月
- 支持跳转到特定月食日期

#### 4.4.11 状态管理

`stores/earthMoonStore.ts`：

```typescript
interface EarthMoonState {
  simulatedTime: number;
  timeScale: number;
  isRunning: boolean;
  selectedBodyId: string | null;   // 'earth' | 'moon' | null
  cameraTarget: 'earth' | 'moon' | 'system';
  moonPhase: MoonPhase;
  eclipseType: EclipseType;
  eclipseDates: EclipseDate[];      // 未来月食日期
}
```

---

### 4.5 关于页（AboutPage）

**路由**: `/about`

**布局**: 居中单栏

**内容**:
- 项目介绍：目的（太阳系科普教育）
- 技术栈：React + TypeScript + Three.js + Canvas 2D + Vite + Zustand
- 各页面功能简介
- 数据来源：NASA 喷气推进实验室（JPL）行星历表数据近似
- 页脚：版权信息

---

## 5. 引擎层变更汇总

| 文件 | 变更类型 | 描述 |
|------|----------|------|
| `constants.ts` | 修改 | 新增 `SIMPLIFIED_RADII` 简化半径表；新增日食/月食相关常量；`CELESTIAL_TEMPLATES` 精简为仅 9 个（去掉卫星） |
| `physics.ts` | 修改 | 所有函数增加 `dimension: 2 \| 3` 参数；2D 模式下 Z 分量恒为 0 |
| `scoring.ts` | 不变 | — |
| `orbital.ts` | 不变 | 探索页和 autoBuild 复用 |
| `autoBuild.ts` | 修改 | 仅构建 1 太阳 + 8 行星（移除卫星构建步骤）；适配 2D 模式 |
| `coordinateTransform.ts` | 修改 | 2D 模式：恒等映射 `physicalToRender(p) = p` |
| `eclipse.ts` | 新增 | 月食类型判断；月食日期预测；`getMoonPhase()` 月相计算 |

---

## 6. 状态层变更汇总

| 文件 | 变更类型 | 描述 |
|------|----------|------|
| `buildStore.ts` | 不变 | 搭建逻辑不变 |
| `uiStore.ts` | 修改 | 移除 3D 相关字段（`mouseRenderPos`, `mousePhysicalPos` 简化为仅物理坐标）；移除 `observationTargetId` 3D 相机跟踪相关 |
| `historyStore.ts` | 不变 | — |
| `exploreStore.ts` | 新增 | 探索太阳系页面状态 |
| `earthMoonStore.ts` | 新增 | 地月系统页面状态 |

---

## 7. 组件迁移映射

| 现有路径 | 新路径 | 说明 |
|----------|--------|------|
| `components/toolbar/CelestialToolbar.tsx` | `components/builder/CelestialToolbar.tsx` | 移动 |
| `components/canvas/Canvas3D.tsx` | `components/builder/BuilderCanvas.tsx` | 重写为 Canvas 2D |
| `components/canvas/CameraControls.tsx` | `components/explore/CameraControls.tsx` | 移至探索页 |
| `components/canvas/BodyStatusPanel.tsx` | `components/builder/BodyStatusPanel.tsx` | 搭建页保留 |
| `components/canvas/Ruler.tsx` | `components/builder/Ruler.tsx` | 搭建页保留 |
| `components/canvas/CloseApproachOverlay.tsx` | `components/builder/CloseApproachOverlay.tsx` | 搭建页保留 |
| `components/canvas/TrailDebugOverlay.tsx` | 删除 | 不再需要 |
| `components/controls/ControlPanel.tsx` | `components/builder/ControlPanel.tsx` | 移动，适配 2D |
| `components/controls/ScoreModal.tsx` | `components/builder/ScoreModal.tsx` | 移动 |
| `components/controls/VelocityInputForm.tsx` | `components/builder/VelocityInputForm.tsx` | 移动，适配 2D 方向 |
| `components/history/HistoryPanel.tsx` | `components/builder/HistoryPanel.tsx` | 移动 |
| `components/CoordinateDisplay.tsx` | `components/builder/CoordinateDisplay.tsx` | 移动，适配 2D |
| `components/ErrorBoundary.tsx` | `components/shared/ErrorBoundary.tsx` | 移动 |

---

## 8. 新增依赖

```json
{
  "dependencies": {
    "react-router-dom": "^7.0.0"
  }
}
```

现有依赖无变化。不需要额外库。

---

## 9. 样式系统

- 全局 CSS 变量定义主题色：
  - `--bg-primary: #0a0a1a`（深空背景）
  - `--bg-secondary: #1a1a2e`（面板背景）
  - `--text-primary: #e0e0e0`
  - `--text-secondary: #a0a0a0`
  - `--accent: #4fc3f7`（亮蓝色强调）
  - `--accent-gold: #ffd54f`（金黄色强调，用于太阳相关）
- 导航栏高度: `--nav-height: 52px`
- 页面内容高度: `calc(100vh - var(--nav-height))`
- 文件组织：每个页面一个 CSS 文件，`App.css` 保留全局样式

---

## 10. 实施优先级建议

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **Phase 1** | react-router + 导航栏 + 首页 + 关于页 | 无 |
| **Phase 2** | 搭建页 Canvas 2D 渲染层 + 组件迁移 | Phase 1 |
| **Phase 3** | 探索太阳系页面 | Phase 1 |
| **Phase 4** | 探索地月系统页面 | Phase 3（共享 Three.js）|

---

## 11. 开放问题

1. ~~搭建页是否使用 Three.js？~~ → Canvas 2D
2. ~~探索页使用什么相机？~~ → PerspectiveCamera
3. ~~探索页是否允许修改天体？~~ → 只读，不可修改
4. ~~太阳在地月系统页面如何表示？~~ → 平行光 + 多个方向指示箭头
5. ~~是否需要月食效果？~~ → 需要，面板显示月食日期
