# 太阳系搭建演示 — 实施计划

## 总体架构概述

**技术选型**：Vite 8 + React 19 + TypeScript 6（strict 模式）+ Three.js 0.184 + Zustand 5 + sql.js 1.14

**分层架构**（自上而下）：
```
components/ → hooks/ → stores/ → { persistence/, rendering/ } → engine/ → types/
```

- `engine/` — 纯逻辑，无 React/Three.js 依赖
- `rendering/` — Three.js 封装，无 React 依赖
- `persistence/` — sql.js 封装，无 React 依赖
- `stores/` — Zustand 状态管理，连接上层 UI 和下层逻辑
- `components/` + `hooks/` — React 层，可 import 所有下层模块
- 严格禁止跨层反向依赖

**语言**：仅支持中文（UI、注释、提示文字）

---

## 第一阶段：项目脚手架搭建

### 任务 1.1 — 初始化 Vite + React + TypeScript 项目

**创建/修改文件**：
- `package.json` — 项目元信息、脚本定义
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — TypeScript 编译配置
- `vite.config.ts` — Vite 构建配置
- `index.html` — 入口 HTML（`lang="zh-CN"`）
- `eslint.config.js` — ESLint 配置

**关键决策与细节**：
- 使用 Vite 的 React 插件（`@vitejs/plugin-react`），TypeScript 编译目标为 ES2023，模块格式 ESNext
- `tsconfig.app.json` 启用 `strict: true`，`verbatimModuleSyntax: true`，`erasableSyntaxOnly: true`
- Vite 配置中添加 `assetsInclude: ['**/*.wasm']` 以支持 sql.js 的 WebAssembly 文件
- 脚本定义：`dev`、`build`（先 tsc -b 再 vite build）、`lint`、`preview`

### 任务 1.2 — 安装核心依赖

**依赖清单**：

| 类别 | 包名 | 版本 | 用途 |
|------|------|------|------|
| 运行时 | `react`, `react-dom` | ^19.2 | UI 框架 |
| 运行时 | `three` | ^0.184 | 3D 渲染引擎 |
| 运行时 | `zustand` | ^5.0 | 状态管理 |
| 运行时 | `sql.js` | ^1.14 | 浏览器端 SQLite |
| 开发 | `@types/react`, `@types/react-dom` | ^19.2 | React 类型 |
| 开发 | `@types/three` | ^0.184 | Three.js 类型 |
| 开发 | `@types/sql.js` | ^1.4 | sql.js 类型 |
| 开发 | `typescript` | ~6.0 | TypeScript 编译器 |
| 开发 | `typescript-eslint` | ^8.59 | TS ESLint 规则 |
| 开发 | `eslint-plugin-react-hooks` | ^7.1 | React Hooks lint |
| 开发 | `eslint-plugin-react-refresh` | ^0.5 | Vite HMR lint |

### 任务 1.3 — 建立目录结构

```
src/
├── types/          # TS 类型定义（纯数据接口）
├── engine/         # 纯逻辑层（无框架依赖）
├── rendering/      # Three.js 封装（无 React 依赖）
├── persistence/    # sql.js 封装
├── stores/         # Zustand 状态管理
├── hooks/          # React hooks
└── components/     # React UI
    ├── toolbar/    # 左侧天体工具栏
    ├── canvas/     # 中央 3D 画布 + 相机控制
    ├── controls/   # 右侧控制面板 + 评分弹窗
    └── history/    # 右侧历史记录
public/
├── textures/       # 天体纹理图片（17 个 jpg）
└── sounds/         # 音效文件（4 个 mp3）
```

---

## 第二阶段：类型定义与引擎常量

### 任务 2.1 — 定义核心类型系统

**创建文件**：`src/types/index.ts`

**定义的类型接口**：

| 类型 | 说明 | 关键字段 |
|------|------|---------|
| `CelestialBodyTemplate` | 工具栏中的天体模板定义 | id, name, type(star/planet/moon), mass, radius, textureUrl, parentId?, semiMajorAxis?, orbitalSpeed? |
| `CelestialBody` | 运行时已放置的天体实例 | id, templateId, position(xyz), velocity(xyz), mass, placedAt, rotationSpeed |
| `BuildState` | 当前搭建会话的完整状态 | bodies[], startedAt, completedAt, isRunning, simulatedTime, buildElapsedMs, hintIndex |
| `BuildRecord` | 持久化的历史记录 | id, createdAt, completedAt, status, score, buildTimeMs, snapshot(JSON字符串) |
| `UIState` | UI 交互状态 | selectedToolId, selectedBodyIds[], supervisionMode, showHint, isPlacing, hintIndex, showScoreModal |
| `ScoringResult` / `SingleScore` | 评分结果结构 | totalScore, planetScores(按行星拆分：轨道/质量/速度/顺序) |
| `ScoringConfig` | 评分配置权重 | allowedErrorPercent(5%), orbitRadiusWeight(0.3), massWeight(0.25), velocityWeight(0.25), orderWeight(0.2) |

**关键决策**：
- 位置和速度统一使用 `[number, number, number]` 元组而非 Three.js 的 Vector3，保持 engine 层纯粹
- `BuildRecord.snapshot` 使用 JSON 字符串存储完整 BuildState，实现状态快照的序列化/反序列化

### 任务 2.2 — 定义引擎常量

**创建文件**：`src/engine/constants.ts`

**常量分类**：

1. **真实太阳系数据**（`REAL_DATA`）：17 个天体（太阳 + 8 大行星 + 8 颗卫星），包含质量、半径、半长轴、轨道速度等科学计量值
2. **天体模板列表**（`CELESTIAL_TEMPLATES`）：从 REAL_DATA 派生，添加了 `textureUrl` 和 `parentId` 供工具栏使用
3. **物理常量**：万有引力常数 `G = 6.67430e-11`，模拟配置 `SIM_CONFIG`（时间步长 3600s、时间倍率 86400x、软化因子 1e-4、最大子步数 10）
4. **显示配置**（`DISPLAY_CONFIG`）：对数缩放因子 1.0、最小/最大显示半径、放置平面尺寸 2e13、参考平面颜色/透明度
5. **拖拽配置**（`DRAG_CONFIG`）：速度缩放因子 500、最大速度 100000 m/s、箭头颜色（绿色速度/橙色引导）
6. **行星顺序**（`PLANET_ORDER`）：太阳 + 8 行星，用于评分中的顺序判断
7. **提示顺序**（`HINT_ORDER`）：行星优先，后接卫星
8. **音效文件**（`AUDIO_FILES`）：放置、完成、碰撞、点击四个音效路径

---

## 第三阶段：引擎层实现

### 任务 3.1 — N 体物理引擎（4 阶 Runge-Kutta 积分器）

**创建文件**：`src/engine/physics.ts`

**核心函数**：

| 函数 | 职责 | 关键技术点 |
|------|------|-----------|
| `vec3Add/sub/Scale/Length/Normalize` | 纯数学向量运算（无 Three.js 依赖） | 自实现元组运算，避免跨层依赖 |
| `computeAccelerations(bodies)` | 计算所有天体之间的引力加速度 | 两两配对（O(n²)），使用软化因子防止数值奇点 |
| `rk4Step(bodies, dt)` | 单步 RK4 积分 | 经典 4 阶方法（k1→k2→k3→k4），原地修改 position/velocity |
| `advanceSimulation(bodies, realDelta)` | 时间推进主入口 | 将真实时间转换为模拟时间（× timeScale），自适应子步数（最多 10） |
| `detectCollisions(bodies)` | 碰撞检测 | 距离阈值 1e7 米，返回合并后新天体 |
| `mergeBodies(a, b)` | 碰撞合并 | 质心位置/速度加权平均，质量相加 |

**关键决策**：
- **为什么用 RK4**：N 体问题对精度敏感，简单的欧拉积分会导致轨道快速漂移。RK4 在计算成本和精度之间取得良好平衡，4 阶方法截断误差为 O(dt⁵)
- **为什么用软化因子**：当两天体距离趋近于零时，引力会趋向无穷大。软化因子 `softeningFactor = 1e-4` 等效于给距离加了一个极小下限，防止数值爆炸
- **为什么限制最大子步数**：在大量天体或高倍率下，单帧模拟时间可能很大。限制最多 10 步防止单帧计算过载导致卡顿

### 任务 3.2 — 评分系统

**创建文件**：`src/engine/scoring.ts`

**核心函数**：

| 函数 | 职责 |
|------|------|
| `scoreBuild(bodies)` | 综合评分：按轨道半径排序已放置行星，逐个与真实行星序列对比 |
| `calculateErrors(bodies)` | 实时误差计算（监督模式用），返回每个天体的轨道/质量/速度误差百分比 |

**评分维度（每个行星独立评分）**：

1. **轨道半径分（权重 0.3）**：使用对数误差 `|log10(实际) - log10(真实)| / log10(真实) × 100`，5% 容差内满分
2. **质量分（权重 0.25）**：线性误差 = `|实际质量 - 真实质量| / 真实质量 × 100`
3. **速度分（权重 0.25）**：速度大小误差 = `|实际速度 - 轨道速度| / 轨道速度 × 100`
4. **顺序分（权重 0.2）**：检查模板 ID 与 PLANET_ORDER 中的位置是否匹配，匹配则满分，否则 0 分

**总分计算**：各维度加权平均 × 100，再乘以完整性系数 `(已放置行星数 / 应放置行星数)`。缺少行星会拉低总分。

**关键决策**：
- **为什么轨道半径用对数误差而非线性误差**：太阳系行星轨道跨越数个数量级（从水星的 5.79e10m 到海王星的 4.5e12m），线性误差对小半径行星过于严苛，对数误差对各行星一视同仁
- **为什么包含顺序分**：教育目的——用户需要理解行星的正确排列顺序

---

## 第四阶段：持久化层实现

### 任务 4.1 — 数据库初始化

**创建文件**：`src/persistence/db.ts`

**核心实现**：
- 使用 sql.js 在浏览器内存中创建 SQLite 数据库
- sql.js 的 wasm 文件通过 Vite 的 `?url` 后缀导入，确保正确的资源路径
- 单例模式 `initDatabase()`：首次调用时异步加载 sql.js 并初始化
- 创建 `build_records` 表（id TEXT PK, created_at, completed_at, status, score, build_time_ms, snapshot），按 `created_at DESC` 建立索引
- `getDatabase()`：同步获取已初始化的数据库实例，未初始化时抛出错误

**关键决策**：
- **为什么用 sql.js（浏览器端 SQLite）而非 localStorage**：localStorage 有 5-10MB 限制，且只能存储键值对。sql.js 提供完整的 SQL 查询能力（排序、过滤、分页），更适合管理历史记录
- **为什么将完整状态序列化为 JSON 存入 snapshot 字段**：避免为每种状态创建数据表列，JSON 快照可以完整恢复搭建场景

### 任务 4.2 — 数据仓库

**创建文件**：`src/persistence/repository.ts`

**核心函数**：

| 函数 | 职责 | SQL 模式 |
|------|------|---------|
| `saveRecord(record)` | 保存/更新记录 | `INSERT OR REPLACE` |
| `loadRecord(id)` | 加载单条记录 | `SELECT WHERE id = ?` |
| `listRecords()` | 列出所有记录（按时间倒序） | `SELECT ORDER BY created_at DESC` |
| `deleteRecord(id)` | 删除记录 | `DELETE WHERE id = ?` |
| `getBestScores(limit)` | 获取最高分记录（仅已完成的，按分数降序、耗时升序） | `SELECT WHERE status = 'completed' ORDER BY score DESC, build_time_ms ASC LIMIT ?` |

---

## 第五阶段：Zustand 状态管理

### 任务 5.1 — 搭建状态 Store（含 Undo/Redo）

**创建文件**：`src/stores/buildStore.ts`

**核心功能**：

| 操作 | 说明 |
|------|------|
| `startBuild/resumeBuild/pauseBuild` | 控制模拟运行/暂停状态 |
| `placeBody(templateId, pos, vel, mass)` | 放置天体，自动生成唯一 ID |
| `removeBody(instanceId)` | 移除天体 |
| `modifyMass(instanceId, mass)` | 修改天体质量 |
| `modifyRotationSpeed(instanceId, speed)` | 修改天体自转速度 |
| `completeBuild()` | 完成搭建，调用评分引擎，返回分数 |
| `resetBuild()` | 清空当前搭建，重新生成 build ID |

**Undo/Redo 命令模式**：
- 定义 `Command` 接口（`{ type, execute, undo }`），支持三种操作：place、remove、modifyMass
- 每次写操作自动推入 `undoStack`（最近 50 条），清空 `redoStack`
- `undo()`：弹出 undoStack 末项，执行 undo，推入 redoStack
- `redo()`：弹出 redoStack 末项，执行 execute，推入 undoStack
- 撤销/重做绑定到 Ctrl+Z / Ctrl+Shift+Z 快捷键

**关键决策**：
- **为什么用命令模式而非状态快照**：快照方式（完整深拷贝）在大量天体时内存开销大。命令模式只存储增删改操作，内存效率高
- **为什么限制 undo 栈为 50 条**：防止无限累积内存，50 步撤销对用户体验已足够

### 任务 5.2 — UI 状态 Store

**创建文件**：`src/stores/uiStore.ts`

**状态字段**：selectedToolId（当前选中工具）、selectedBodyIds（框选天体）、supervisionMode（监督模式开关）、showHint（是否显示提示）、isPlacing（是否正在放置）、hintIndex（当前提示进度）、showScoreModal（评分弹窗显隐）

所有操作都是简单的 setter 函数，无复杂业务逻辑。

### 任务 5.3 — 历史记录 Store

**创建文件**：`src/stores/historyStore.ts`

**核心功能**：
- `loadRecords()`：从 sql.js 加载所有记录
- `saveCurrentRecord(record)`：持久化到数据库
- `switchToRecord(id)`：切换历史记录，反序列化 snapshot JSON 并通过 `buildStore.loadSnapshot()` 恢复搭建状态

**关键决策**：切换记录时先保存当前记录再加载新记录，防止数据丢失

---

## 第六阶段：Three.js 渲染层

### 任务 6.1 — 场景初始化

**创建文件**：`src/rendering/setup.ts`

**核心实现**：
- `initScene(canvas)`：创建 Scene（深色背景 0x050510）、PerspectiveCamera（FOV 45°，近裁面 1e3，远裁面 1e14，初始位置 y=5e12, z=8e12）、WebGLRenderer（antialias 开启，像素比限制 ≤2）
- 添加环境光（AmbientLight 0x333344）和点光源（PointLight，位于原点模拟太阳光）
- 生成 2000 个随机位置的点粒子作为星空背景（范围 ±5e13）
- `handleResize(canvas, renderer, camera)`：响应窗口大小变化时更新渲染尺寸和相机纵横比
- `rotateCameraHorizontal/Vertical(camera, angle)`：球坐标旋转相机，保持 lookAt 原点
- `resetCamera(camera)`：恢复相机到默认角度

**关键决策**：
- **为什么相机近裁面 1e3 远裁面 1e14**：天体轨道尺度达到 1e12～4.5e12 米，需要极大的视锥体才能看到所有天体。1e3 的近裁面避免近处物体被裁剪
- **为什么限制像素比为 2**：高 DPI 屏幕（如 Retina）像素比可达 3，限制为 2 可大幅减少 GPU 负担且视觉差异极小

### 任务 6.2 — 天体网格管理

**创建文件**：`src/rendering/bodies.ts`

**核心功能**：

| 函数 | 职责 |
|------|------|
| `visualRadius(realRadius)` | 将对数映射转换为显示半径，公式：`min(log10(r/R_min + 1), maxRadius)`，其中 `R_min = 1e6`，`maxRadius = 5.0` |
| `createBodyMesh(body, scene)` | 创建天体 Mesh：球体几何体（48段）、标准材质、加载纹理、添加到场景。土星特殊处理：额外添加光环（RingGeometry） |
| `updateBodyMeshes(bodies, dt)` | 同步天体位置到 3D 网格，根据 rotationSpeed 旋转天体 |
| `removeBodyMesh(instanceId, scene)` | 移除并释放天体网格资源 |
| `clearAllMeshes(scene)` | 清除所有天体网格 |

**纹理加载**：使用 TextureLoader + 内存缓存，加载失败时回退到纯色（DEFAULT_COLORS 映射）

**关键决策**：
- **为什么用对数尺寸而非线性尺寸**：太阳直径约 1.4e9 米，火卫二仅 12 公里，差距达 5 个数量级。如果线性显示，火卫二在屏幕上将不可见。对数尺度 `log10(r/1e6 + 1)` 将所有天体压缩到合理可视范围（0.05～5.0 单位半径）
- **为什么天体自转用 rotationSpeed 而非物理模拟**：自转对轨道运动无影响，视觉上简单的 y 轴旋转即可

### 任务 6.3 — 参考平面与轨道环

**创建文件**：`src/rendering/grid.ts`

- `createReferencePlane(scene)`：半透明蓝色参考平面（PlaneGeometry，horizontal），帮助用户在天体放置时感知 XZ 平面位置。设置 `depthWrite: false` 以正确显示半透明叠加
- `createOrbitRing(scene, radius, color)`：虚线圆环（128 段），用于提示模式显示建议轨道位置
- `addOrbitRing/clearOrbitRings(scene)`：轨道环生命周期管理

### 任务 6.4 — 交互与拾取

**创建文件**：`src/rendering/interaction.ts`

**核心功能**：

| 函数 | 职责 |
|------|------|
| `getPlacementPoint(event, camera, canvas)` | 通过 Raycaster 将鼠标屏幕坐标投影到 XZ 平面（y=0），返回 3D 世界坐标 |
| `selectBodiesInRect(start, end, camera, canvas)` | 框选：将天体 3D 位置投影到屏幕空间，检查是否在矩形区域内 |
| `setBodyHighlight(ids, highlighted)` | 高亮/取消高亮选中天体（emissive 发光效果） |
| `createPreviewSphere` / `removePreviewSphere` | 放置预览（半透明白色球体） |
| `updateVelocityArrow` / `updateGuideArrow` | 速度方向箭头（绿色）和引导箭头（橙色），从放置点指向速度方向 |
| `cleanupGizmos(scene)` | 清理所有临时视觉元素（箭头、预览球） |

**箭头实现**：`createArrow(from, to, color, opacity)` 使用 CylinderGeometry（箭杆）+ ConeGeometry（箭头）+ Quaternion 定向，渲染顺序设为 4（叠加在其他对象上方）

**关键决策**：
- **为什么 Raycaster 投影到 XZ 平面**：天体在 XZ 平面放置（参考太阳系行星轨道面），鼠标交互自动映射到此平面，简化用户操作
- **为什么用 Cylinder + Cone 而非 Arrow 辅助对象**：Three.js 内置 Arrow 不好控制尺寸和透明度，自定义建造更灵活

### 任务 6.5 — 相机引用共享

**创建文件**：`src/rendering/cameraRef.ts`

简单的全局单例 `setSharedCamera / getSharedCamera`，使 CameraControls 组件无需 props 穿透即可访问相机实例。

---

## 第七阶段：React 组件

### 任务 7.1 — 应用布局框架

**创建/修改文件**：
- `src/main.tsx` — 应用入口，挂载 `<App />` 到 `#root`
- `src/App.tsx` — 应用根组件，初始化数据库、注册键盘快捷键
- `src/App.css` — 全局样式 + 三栏网格布局

**布局方案**：CSS Grid 三栏布局
```
┌──────────┬──────────────────────┬──────────┐
│ 220px    │ 1fr                  │ 280px    │
│          │                      │          │
│ 天体工具栏 │     3D 画布         │ 控制面板  │
│ (左侧栏)  │   + 相机控制(悬浮)   │ 历史记录  │
│          │                      │ (右侧栏)  │
└──────────┴──────────────────────┴──────────┘
```

### 任务 7.2 — 天体工具栏

**创建文件**：`src/components/toolbar/CelestialToolbar.tsx` + `.css`

**功能要点**：
- 从 `CELESTIAL_TEMPLATES` 读取模板，按类别分组（恒星→行星→按母星分组的卫星）
- 每组标题下方列出天体条目（彩色圆点 + 名称）
- 点击选中/取消选中工具（太阳切换自身，其他天体需先放置太阳才可点击）
- 太阳未放置时，其他天体条目呈灰色禁用态（opacity 0.35）
- 卫星条目缩进显示（padding-left 24px），字号稍小
- 选中态：蓝色边框高亮（#4488ff）

### 任务 7.3 — 3D 画布（Canvas3D）

**创建文件**：`src/components/canvas/Canvas3D.tsx` + `.css`

这是项目最复杂的组件，整合了渲染、交互和物理模拟的动画循环。

**放置流程**：
1. 用户在工具栏选择天体 → `selectedToolId` 设置 → 画布显示十字光标
2. 鼠标按下 → `getPlacementPoint()` 获取 XZ 平面上的投影点 → 创建预览球体，暂停模拟（非太阳时）
3. 鼠标拖动 → 实时计算拖拽距离 × DRAG_CONFIG.speedScale 得到速度 → 显示绿色速度箭头
4. 鼠标释放 → `placeBody()` 将天体加入 Store，清理箭头和预览球，恢复模拟
5. 太阳特殊处理：无速度设置（太阳静止于放置位置），放置后调用 `startBuild()` 并创建历史记录

**框选流程**：
1. 未选中工具时，鼠标拖拽绘制矩形选区（半透明蓝色）
2. 矩形 > 5px 时执行 `selectBodiesInRect()`，匹配的天体高亮
3. 矩形 ≤ 5px 视为点击空白，取消所有选中

**动画循环**（requestAnimationFrame）：
- 计算帧间隔 dt（上限 0.1s 防止卡顿后的大跳跃）
- 如果模拟运行中且有 ≥2 个天体：调用 `advanceSimulation(bodies, dt)` 推进物理，更新 simulatedTime
- 检测碰撞事件，碰撞天体合并（移除旧天体，添加合并后天体）
- 更新搭建耗时计时器
- 同步天体网格位置 + 自转旋转
- 渲染一帧

**提示系统**：
- 开启提示时，根据 `hintIndex` 从 `HINT_ORDER` 获取目标天体
- 在场景中绘制目标轨道环（橙色虚线）和引导箭头（建议位置 + 推荐速度方向）
- 用户放置提示的天体后，自动关闭提示

**监督模式**：
- 放置天体后检查：质量是否 ≤ 0、是否与其他天体距离过近（< 1e8 米）
- 问题通过 console.warn 输出（后期可改为 toast 通知）

### 任务 7.4 — 相机控制悬浮面板

**创建文件**：`src/components/canvas/CameraControls.tsx` + `.css`

**UI 设计**：浮动在画布右上角的 4×3 按钮网格（方向键 ↑←↻→↓ + 缩放 −+），半透明深色背景 + 毛玻璃效果（backdrop-filter: blur）。

**交互方式**：
- 按住方向键通过 setInterval（50ms 间隔）持续旋转相机，步长为 CAMERA_ROTATE_STEP(π/18) × 0.5
- 按住 +/- 按钮通过 setInterval（50ms 间隔）持续缩放，步长 0.15x，范围 0.5x ~ 3.0x
- 松开鼠标/鼠标离开停止旋转/缩放
- 中间 ↻ 按钮重置相机视角和缩放
- 不支持画布拖拽旋转——教育工具面向非技术用户，按钮操作提供可预测的受控视角变化

**关键决策**：
- **为什么通过 cameraRef 共享相机和 canvas**：CameraControls 需要操作相机和缩放但不应持有 Canvas3D 的引用，全局引用是最简单的解耦方案
- **正交相机缩放**：通过调整视锥体大小实现（frustumSize = containerSize / zoomFactor），与旋转正交互不影响

### 任务 7.5 — 控制面板

**创建文件**：`src/components/controls/ControlPanel.tsx` + `.css`

**功能分区**：

1. **计时器**：搭建耗时（HH:MM:SS）+ 模拟时间（天/年）
2. **主操作按钮**：暂停/开始（⏸/▶）、完成（✓）
3. **辅助功能按钮**：监督模式开关（👁）、提示（💡）
4. **撤销/重做/新建**：小按钮行，绑定 buildStore 的 undo/redo/reset
5. **选中天体信息**（单选时显示）：
   - 显示天体名称、模板信息
   - 质量输入框（支持手动修改 + blur/Enter 确认）
   - 当前速度显示
   - 自转速度滑块（range 0-5）
   - 删除按钮
6. **监督模式误差面板**（监督模式开启时显示）：
   - 实时调用 `calculateErrors()` 显示每个行星的轨道/质量/速度误差百分比
   - 颜色编码：< 5% 绿色、< 20% 黄色、≥ 20% 红色

### 任务 7.6 — 评分弹窗

**创建文件**：`src/components/controls/ScoreModal.tsx` + `.css`

**触发时机**：点击"完成"按钮 → `completeBuild()` 计算分数 → `setShowScoreModal(true)`

**UI 布局**：
- 全屏半透明遮罩层，点击遮罩关闭
- 中央评分卡片（min-width 420px）
- 大字总分（56px）+ 颜色编码（≥80 绿色 / ≥50 黄色 / <50 红色）+ 表情
- 评分明细表格（每个行星的轨道/质量/速度/顺序分项百分比 + 综合得分）
- 底部按钮："再次搭建"（重置 + 关闭）和"关闭"

### 任务 7.7 — 历史记录面板

**创建文件**：`src/components/history/HistoryPanel.tsx` + `.css`

**功能**：
- 显示所有历史记录列表（按时间倒序）
- 每条记录显示：日期时间、状态标签（搭建中/已完成/已取消）、分数、耗时
- 点击记录可切换到该搭建的完整状态（先保存当前状态，再加载目标快照）
- 当前活跃记录高亮显示（蓝色边框）
- 空状态："暂无记录"

---

## 第八阶段：Hooks

### 任务 8.1 — 键盘快捷键

**创建文件**：`src/hooks/useKeyboardShortcuts.ts`

在 App.tsx 中注册全局键盘事件监听：

| 快捷键 | 操作 | 条件 |
|--------|------|------|
| `Escape` | 取消选中工具和天体 | 不区分焦点 |
| `Ctrl/Cmd + Z` | 撤销 | 不在输入框中 |
| `Ctrl/Cmd + Shift+Z` 或 `Ctrl/Cmd + Y` | 重做 | 不在输入框中 |
| `Space` | 暂停/恢复模拟 | 非放置中 |

**关键决策**：区分 `e.shiftKey` 和大小写（`e.key === 'Z'` 表示 Shift+Z），兼容 macOS 和 Windows 的 meta/ctrl 键

### 任务 8.2 — 音效工具

**创建文件**：`src/hooks/useAudio.ts`

**实现方式**：
- 使用 HTMLAudioElement 缓存四个音效（place/complete/collision/click）
- 播放时通过 `cloneNode()` 创建临时音频节点，支持叠加播放
- `preloadAudio()` 在应用启动时预加载所有音频
- 播放失败静默处理（catch 忽略 Autoplay 限制错误）

---

## 第九阶段：集成与收尾

### 任务 9.1 — App.tsx 全局集成

**修改文件**：`src/App.tsx`

- `useEffect` 中异步初始化 sql.js 数据库 → 加载历史记录
- 注册 `useKeyboardShortcuts()` 全局快捷键
- 组装三栏布局：左（CelestialToolbar）、中（Canvas3D + CameraControls）、右（ControlPanel + HistoryPanel）
- ScoreModal 作为全局弹出层覆盖在 app 容器内

### 任务 9.2 — 提示系统（完整实现）

提示系统横跨多个模块：
- **触发**：用户在 ControlPanel 点击"💡 提示"按钮
- **UIStore**：`setHint(true)` + `advanceHint()` 递增 hintIndex
- **Canvas3D**：useEffect 监听 showHint/hintIndex 变化 → 查找 HINT_ORDER[hintIndex] → 获取 REAL_DATA 中的轨道数据 → 调用 `addOrbitRing` 绘制虚线轨道 + `updateGuideArrow` 显示建议位置
- **自动关闭**：Canvas3D 的 handleMouseUp 中检测放置的天体 ID 是否匹配当前提示，匹配则 `setHint(false)`

### 任务 9.3 — 监督模式

- **开启**：ControlPanel 中点击"👁 监督"按钮
- **Canvas3D**：放置天体后检查质量异常和距离过近问题，在监督模式下输出 console.warn
- **ControlPanel**：显示实时误差面板，通过 `calculateErrors()` 计算已放置天体的轨道/质量/速度误差

### 任务 9.4 — 历史记录切换与状态恢复

完整的状态恢复流程：
1. 用户在 HistoryPanel 点击历史记录
2. 调用 `historyStore.switchToRecord(id)` 从数据库加载 snapshot
3. 解析 JSON 为 BuildState 对象
4. 调用 `buildStore.loadSnapshot(state)` 恢复所有天体的位置、速度、质量
5. Canvas3D 的 syncBodies 自动重新创建 3D 网格

---

## 第十阶段：静态资源

### 任务 10.1 — 天体纹理

**目录**：`public/textures/`

17 个 jpg 纹理文件（各天体：太阳、水星、金星、地球、火星、木星、土星、天王星、海王星、月球、火卫一、火卫二、木卫一、木卫二、木卫三、木卫四、土卫六）。材质加载失败时回退到 DEFAULT_COLORS 定义的纯色。

### 任务 10.2 — 音效文件

**目录**：`public/sounds/`

4 个 mp3 音效文件：place.mp3、complete.mp3、collision.mp3、click.mp3。目前音效 hook 已定义但尚未在交互中全部接入。

---

## 边界情况、测试与性能

### 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 天体网格半径 < 0.05 | `createBodyMesh` 返回 null，不渲染（避免不可见天体消耗 GPU） |
| 纹理加载失败 | 静默回退到 DEFAULT_COLORS 纯色，不影响功能 |
| 模拟暂停时用户切换历史 | 快照 `getSnapshot()` 中 `isRunning` 固定为 false，恢复后为暂停状态 |
| 模拟运行中删除天体 | 直接从 Store 移除 + 从场景移除网格，物理引擎自动适配新数量 |
| 帧时间过大（> 100ms） | 上限 0.1s 防止卡顿后物理跳跃 |
| 数据库未初始化时操作 | `getDatabase()` 抛出明确错误 |
| WASM 加载失败 | sql.js 初始化时抛出异常，应用无法启动 |
| MySQL Shift+Z vs Z 判断 | macOS Ctrl+Z 和 Shift+Z 区分处理（e.key === 'Z' 表示大写） |

### 性能策略

| 策略 | 说明 |
|------|------|
| 只传 body 引用的物理推进 | `rk4Step` 原地修改 position/velocity，减少内存分配 |
| 最大子步数限制 | `SIM_CONFIG.maxSubsteps = 10`，防止极端情况下单帧计算过载 |
| 像素比限制 | `Math.min(devicePixelRatio, 2)`，高DPI设备节省 GPU |
| 纹理缓存 | `textureCache` Map 避免重复加载同一纹理 |
| 天体旋转在 vertices shader | 自转使用 `mesh.rotation.y += rotationSpeed * dt`，无需额外计算 |
| 框选矩形 < 5px 不选中 | 避免微小抖动触发选中逻辑 |
| undo 栈限制 50 条 | 防止内存无限增长 |

### 测试策略

目前项目无自动化测试套件。建议的测试优先级：
1. **引擎层单元测试**：`computeAccelerations`（物理正确性）、`rk4Step`（能量守恒）、`scoreBuild`（各种边界场景）
2. **Store 测试**：undo/redo 命令正确性、状态快照的序列化/反序列化往返
3. **集成测试**：完整搭建流程（放置→运行→评分→保存→恢复）
