# 坐标系统重构设计

## 概述

将当前单一的 display-scale 坐标空间分离为三个独立空间：物理空间、渲染空间、画布空间。物理引擎使用真实物理量（米、kg、真实 G），通过显式转换函数衔接三个空间。

## 一、坐标空间定义

### 1.1 物理空间 (Physical Space, P)

| 属性 | 值 |
|------|-----|
| 维度 | 3D 笛卡尔坐标系 |
| 单位 | 米(m)、千克(kg)、米/秒(m/s) |
| 引力常数 G | 6.674×10⁻¹¹ m³·kg⁻¹·s⁻² |
| 原点 | 太阳质心，始终为 (0, 0, 0) |
| 坐标系 | 太阳系平面为 XY 平面，Z 轴垂直于轨道面 |
| 存储位置 | `CelestialBody.position` / `CelestialBody.velocity` / `CelestialBody.mass` |

所有 N 体引力计算在此空间进行。

### 1.2 渲染空间 (Rendering Space, R)

| 属性 | 值 |
|------|-----|
| 维度 | 3D，Three.js 世界坐标系 |
| 单位 | uv（显示单位，默认正交相机 1 uv = 1 屏幕像素） |
| 原点 | 画布中心 |
| 坐标系 | XY 平面 = 太阳系平面，Z 轴垂直于画面（指向观察者） |
| 相机 | `OrthographicCamera(-w/2, w/2, h/2, -h/2, 1, 5000)`，位于 (0, 0, 100) 注视原点 |

所有 Three.js 对象（网格、天体网格、轨道环、速度箭头）在此空间中定位和渲染。

### 1.3 画布空间 (Canvas Space, C)

| 属性 | 值 |
|------|-----|
| 维度 | 2D |
| 单位 | 屏幕像素 (px) |
| 原点 | 画布元素左上角 |
| 坐标系 | X 轴向右，Y 轴向下 |

鼠标事件、选中框等 UI 操作在此空间进行。

## 二、坐标转换函数

### 2.1 位置转换 P ↔ R

使用幂律压缩，方向保持不变（角度从原点出发保留）：

```
f(r) = 100 × (r / r_sun)^0.3
```

其中 `r_sun = 6.9634×10⁸ m`（太阳真实半径）。

**P → R**：
```
p_R = f(|p_P|) × (p_P / |p_P|)    // 当 |p_P| → 0 时结果为 (0,0,0)
```

**R → P**（逆变换）：
```
g(d) = r_sun × (d / 100)^(1/0.3)
p_P = g(|p_R|) × (p_R / |p_R|)
```

### 2.2 天体尺寸转换 P ↔ R

对数缩放，与位置转换独立：

**P → R**：
```
g_size(r) = log₁₀(r / 10⁶ + 1) × 8,  min(3)
太阳：固定 50
```

**R → P**：
```
r_P = 10⁶ × (10^(r_R / 8) - 1)
```

### 2.3 速度转换 R → P（用户拖拽）

由于位置映射是非线性的，速度的径向和切向分量被分别缩放：

```
f'(r) = 30 / (r_sun × (r/r_sun)^0.7)          // f 的导数（径向缩放）
f_over_r = f(r) / r                           // 切向缩放

v_R_radial   = f'(r_P) × v_P_radial
v_R_tangential = f_over_r × v_P_tangential

逆变换：
v_P_radial   = v_R_radial / f'(r_P)
v_P_tangential = v_R_tangential / f_over_r
```

实现步骤：
1. 找到从太阳指向天体的单位方向向量 û
2. 将 `v_R` 分解为径向分量（平行 û）和切向分量（垂直 û）
3. 分别用不同缩放因子转换
4. 合成结果 `v_P`

### 2.4 速度转换 P → R（轨道环等显示）

```
v_R = 径向缩放 × v_P_radial × û + 切向缩放 × v_P_tangential
```

### 2.5 质量转换 P ↔ R（仅用于显示）

线性映射：
```
m_R = m_P × 10000 / m_sun
m_P = m_R × m_sun / 10000
```

其中 `m_sun = 1.989×10³⁰ kg`。

### 2.6 渲染 ↔ 画布转换

**R → C**：Three.js `Vector3.project(camera)`，正交投影 → NDC → 屏幕像素。
**C → R**：Three.js `Raycaster`，屏幕像素 → NDC → 射线投射至参考平面（XY 平面 z=0），补充 Z 维度为 0。

## 三、模块变更

### 3.1 新文件

| 文件 | 职责 |
|------|------|
| `src/engine/coordinateTransform.ts` | 所有 P ↔ R 转换的纯函数实现，无 React/Three.js 依赖 |
| `src/components/CoordinateDisplay.tsx` | 页面底部坐标行组件 |
| `src/components/CoordinateDisplay.css` | 坐标行样式 |

### 3.2 `src/engine/coordinateTransform.ts` 导出接口

```typescript
// 位置
physicalToRender(pos: [number, number, number]): [number, number, number]
renderToPhysical(pos: [number, number, number]): [number, number, number]

// 天体尺寸
physicalRadiusToRender(radius: number): number
renderRadiusToPhysical(radius: number): number

// 速度（需要知道当前物理位置以确定缩放）
renderVelocityToPhysical(vRender: [number, number, number], posPhysical: [number, number, number]): [number, number, number]
physicalVelocityToRender(vPhysical: [number, number, number], posPhysical: [number, number, number]): [number, number, number]

// 质量（线性，仅用于显示）
physicalMassToRender(mass: number): number
renderMassToPhysical(mass: number): number

// 距离标量（用于轨道环半径等场景）
physicalDistanceToRender(distance: number): number
renderDistanceToPhysical(distance: number): number
```

### 3.3 `src/engine/constants.ts`

新增：
```typescript
export const PHYSICAL_CONSTANTS = {
  G: 6.674e-11,
  sunMass: 1.989e30,
  sunRadius: 6.9634e8,
  timeScale: 1e5,       // 默认时间加速因子
  softeningFactor: 1e9, // 米
};

export const SPATIAL_TRANSFORM = {
  orbitCompressionPower: 0.3,
  orbitScaleFactor: 100,
  planetLogBase: 1e6,
  planetScaleFactor: 8,
  sunRenderRadius: 50,
  minRenderRadius: 3,
};
```

移除已废弃的 `MASS_SCALE`、`DISPLAY_CONFIG` 等旧常量，统一迁移到 `SPATIAL_TRANSFORM`。

### 3.4 `src/engine/physics.ts`

核心变更：
- `G` 使用 `PHYSICAL_CONSTANTS.G = 6.674e-11`
- 天体质量直接使用模板中的 `REAL_DATA[id].mass`（kg），不再经过 `displayMass` 缩放
- 天体位置/速度以物理单位（米, m/s）参与所有计算
- `softeningFactor` 改为 `1e9`（米）
- `timeScale` 使用 `PHYSICAL_CONSTANTS.timeScale = 1e5`
- RK4 积分器代码结构不变，仅输入输出值的量级变化
- 碰撞检测阈值 `threshold` 从 `1e7`（像素）改为物理量级（如 `1e9` 米）
- `vec3Add`、`vec3Sub`、`vec3Scale`、`vec3Length` 等工具函数不变

### 3.5 `src/rendering/bodies.ts`

- 移除现有的 `planetVisualRadius`、`displayOrbitRadius`、`visualRadius`、`displayMass` 四个转换函数
- 创建天体时，模板真实半径 → 渲染半径 → SphereGeometry 大小
- **修复 group/mesh 位置关系**：`mesh.position` 设为 `(0, 0, 0)`（相对 group），`group.position` 设为渲染空间位置（绝对）
- 每帧更新时，`body.position`（物理）→ 渲染位置 → `group.position`
- 轨道环半径计算：`physicalDistanceToRender(semiMajorAxis)` → 渲染环半径

### 3.6 `src/rendering/interaction.ts`

- `getPlacementPoint()` 不变，仍返回渲染空间坐标，调用方负责 C→R→P 转换
- `selectBodiesInRect()` 无需修改：从 `bodyMeshMap` 读取 `group.getWorldPosition()` 得到的是渲染空间坐标（已在 `updateBodyMeshes` 中完成 P→R 转换），直接投影到画布空间即可
- `setBodyHighlight()` 等接收 `CelestialBody.id` 操作 `bodyMeshMap` 的功能无需修改

### 3.7 `src/stores/buildStore.ts`

- `placeBody()` 方法接收的 `position` 和 `velocity` 改为**物理空间**坐标
- 调用方（Canvas3D）在调用 `placeBody()` 前完成 C → R → P 转换
- `CelestialBody.mass` 存储物理质量（kg），由模板中的真实质量赋值

### 3.8 `src/components/canvas/Canvas3D.tsx`

放置流程重构：

```
mousedown → getPlacementPoint() → p_R（渲染空间）
  → renderToPhysical(p_R) → p_P（物理空间）
  → 存储为预习中的物理位置

mousemove（拖拽中）→ getPlacementPoint() → p_R_current
  → v_RΔ = p_R_current - p_R_start（渲染空间速度矢量）
  → renderVelocityToPhysical(v_RΔ, p_P) → v_P（物理初速度）
  → 速度箭头在渲染空间显示（v_RΔ 原样用于 Three.js ArrowHelper）

mouseup → placeBody(p_P, v_P, mass_physical)
  → 物理引擎开始积分
```

选中框逻辑：现有 `Vector3.project(camera)` 方案不变，直接复用。

### 3.9 `src/components/canvas/Canvas3D.tsx` 坐标行数据传递

- 每次 `mousemove` 时，通过 `getPlacementPoint()` 获取渲染坐标
- 调用 `renderToPhysical(p_R)` 获取物理坐标
- 通过回调将三类坐标传给 `CoordinateDisplay` 组件

## 四、坐标行 UI

### 4.1 布局

页面底部，位于 Center 列的画布下方：

```
┌──────────┬──────────────────────────┬──────────┐
│ Toolbar  │  Canvas3D                │ Controls │
│ (220px)  │  (flex: 1)              │ (280px)  │
│          ├──────────────────────────┤          │
│          │  CoordinateDisplay (32px)│ History  │
└──────────┴──────────────────────────┴──────────┘
```

Center 列改为 flex-column 布局，Canvas 占据剩余空间，坐标行固定高度 32px。

### 4.2 显示内容

**第一行 — 鼠标坐标**（始终显示）：

```
[画布] (123, 456)  |  [渲染] (-45.2, 78.3, 0.0)  |  [物理] (-3.21e10, 5.67e10, 0.0) m
```

- 鼠标不在画布上时：`[画布] (—, —)  |  [渲染] (—, —, —)  |  [物理] (—, —, —) m`
- 数值精度：画布/渲染保留 1 位小数，物理保留 3 位有效数字（科学记数法）
- 物理坐标后缀单位 `m`

**第二行 — 天体尺寸**（仅在选中工具且鼠标在画布上时显示）：

```
天体: 地球  |  画布: 8.5 px  |  渲染: 8.5 uv  |  物理: 6.37×10⁶ m  |  质量: 5.97×10²⁴ kg
```

- 天体名称来自选中模板
- 画布半径 = 渲染半径（正交投影下等同）
- 物理半径和质量来自 `REAL_DATA`
- 太阳特殊处理：尺寸固定 50/50/6.96×10⁸ m

### 4.3 样式

- 背景色：`#0d0d2a`（与左右面板一致）
- 文字：等宽字体（`monospace`），12px，颜色 `#8899bb`
- 竖线分隔：`|` 颜色 `#334466`
- 整体高度：32px，单行/双行自适应

## 五、模拟时间与速度显示

- `simulatedTime` 追踪**物理模拟时间**（秒），每帧累加 `realDelta * timeScale`
- 控制面板中的定时器显示：已用时间（墙上钟）、模拟时间（物理秒 → 格式化 天/年）
- 监管模式下天体速度显示改为物理速度（m/s），通过 `|body.velocity|` 直接读取

## 六、评分系统适配

`scoring.ts` 中的比较逻辑简化为直接物理量比较：

- **轨道半径**：`|body.position|`（米） vs `REAL_DATA[id].semiMajorAxis`（米）
- **速度**：`|body.velocity|`（m/s） vs `REAL_DATA[id].orbitalSpeed`（m/s）
- **质量**：`body.mass`（kg） vs `REAL_DATA[id].mass`（kg）
- **顺序**：逻辑不变

允许误差保持 5%。由于物理量直接比较，移除了原先的 ad-hoc log-scale 比较，改用线性百分比误差。

## 七、放置时太阳特殊处理

太阳不设置初速度，点击即放置：
- 物理位置：`(0, 0, 0)`
- 物理速度：`(0, 0, 0)`
- 质量：`PHYSICAL_CONSTANTS.sunMass`
- 放置在原点，跳过 C→R→P 转换流水线

## 八、约束和边界

1. 所有转换函数为纯函数，无副作用，无 Three.js/React 依赖
2. `coordinateTransform.ts` 属于 `engine/` 层，不 import 任何上层模块
3. Z 轴在所有空间中初始为 0（太阳系平面），物理引擎可产生非零 Z（轨道倾角等，但暂不实现）
4. 数值精度：位置转换使用双精度浮点（JavaScript `number`），物理距离量级（~10¹¹）下精度足够
5. `r = 0` 时位置转换直接返回 `[0, 0, 0]`（原点映射到原点）
