# 太阳系搭建演示 — 设计规格说明书

> 版本: 1.0  
> 日期: 2026-06-14  
> 状态: 已实现

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目结构](#2-项目结构)
3. [数据模型](#3-数据模型)
4. [页面布局](#4-页面布局)
5. [核心交互流程](#5-核心交互流程)
6. [技术设计](#6-技术设计)
7. [配置常量](#7-配置常量)
8. [非功能性需求](#8-非功能性需求)
9. [资源约束](#9-资源约束)

---

## 1. 项目概述

### 1.1 项目定位

太阳系搭建演示是一款面向中文用户的交互式教育 SPA（单页应用）。用户通过在三维空间画布上放置天体（恒星、行星、卫星）并设置初速度来搭建自己的太阳系模型，系统使用 N 体引力物理引擎模拟天体运动轨迹。搭建完成后，通过轨道半径、质量、速度、行星顺序四个维度与真实太阳系数据进行对比评分。

### 1.2 技术栈

| 类别 | 技术选型 | 版本 | 用途 |
|------|---------|------|------|
| 前端框架 | React | 19.2 | 组件化 UI 构建 |
| 类型系统 | TypeScript | 6.0 (strict) | 全量类型约束 |
| 3D 渲染引擎 | Three.js | 0.184 | 三维天体渲染与场景管理 |
| 构建工具 | Vite | 8.0 | 开发服务器与生产构建 |
| 状态管理 | Zustand | 5.0 | 轻量级全局状态 |
| 数据持久化 | sql.js | 1.14 | 浏览器端 SQLite，搭建历史存储 |
| 代码检查 | ESLint | 10.3 | 代码规范检查 |

### 1.3 目标用户

- 对天文学感兴趣的学生和爱好者
- 教育场景中的物理/天文教师
- 想直观理解引力系统 N 体问题的学习者

---

## 2. 项目结构

```
solar-system-demo/
├── index.html                    # 应用入口 HTML
├── package.json                  # 依赖与脚本配置
├── vite.config.ts                # Vite 构建配置（含 WASM 资源处理）
├── tsconfig.json                 # TypeScript 配置引用
├── tsconfig.app.json             # 应用 TS 配置（strict: true）
├── tsconfig.node.json            # Node 端 TS 配置
├── eslint.config.js              # ESLint 配置
├── AGENTS.md                     # AI 辅助开发规范
├── README.md                     # 项目说明
│
├── public/                       # 静态资源
│   ├── textures/                 # 天体纹理贴图（sun.jpg, earth.jpg 等）
│   └── sounds/                   # 音效文件（place.mp3, complete.mp3 等）
│
├── docs/
│   ├── specs/                    # 设计规格文档（本文件所在目录）
│   └── plans/                    # 实施计划文档
│
└── src/
    ├── main.tsx                  # React 挂载入口
    ├── App.tsx                   # 根组件，组合三栏布局
    ├── App.css                   # 全局样式 & 三栏布局 CSS Grid
    ├── vite-env.d.ts             # Vite 类型声明
    │
    ├── types/
    │   ├── index.ts              # 全局 TypeScript 类型定义
    │   └── sql.js.d.ts           # sql.js 模块声明
    │
    ├── engine/                   # 【纯逻辑层】无 React、无 Three.js 依赖
    │   ├── constants.ts          # 真实天体数据、模拟/显示/拖拽/评分配置
    │   ├── physics.ts            # N 体引力物理引擎（RK4 积分器 + 碰撞检测）
    │   └── scoring.ts            # 评分算法 & 实时误差计算
    │
    ├── rendering/                # 【Three.js 封装层】可引用 engine，不可引用 React
    │   ├── setup.ts              # 场景初始化、相机/渲染器/灯光/星空
    │   ├── bodies.ts             # 天体 Mesh 创建/更新/销毁、对数尺寸转换
    │   ├── grid.ts               # 参考平面 & 轨道环
    │   ├── interaction.ts        # 射线检测、框选、速度箭头、预览球体
    │   └── cameraRef.ts          # 相机引用共享（跨组件访问）
    │
    ├── persistence/              # 【数据持久层】sql.js 封装
    │   ├── db.ts                 # 数据库初始化、建表、WASM 加载
    │   └── repository.ts         # CRUD 操作（保存/加载/列出/删除/最佳成绩）
    │
    ├── stores/                   # 【Zustand 状态管理】
    │   ├── buildStore.ts         # 搭建状态 + Command 模式撤销/重做
    │   ├── uiStore.ts            # UI 状态（选中、模式、提示等）
    │   └── historyStore.ts       # 搭建历史存储状态
    │
    ├── hooks/                    # 【React Hooks】
    │   ├── useKeyboardShortcuts.ts   # 键盘快捷键绑定
    │   └── useAudio.ts               # 音效播放（可选功能）
    │
    └── components/               # 【React UI 组件】
        ├── toolbar/
        │   ├── CelestialToolbar.tsx   # 左侧天体工具栏
        │   └── CelestialToolbar.css
        ├── canvas/
        │   ├── Canvas3D.tsx           # 中心 3D 画布（Three.js 渲染 & 交互）
        │   ├── Canvas3D.css
        │   ├── CameraControls.tsx     # 浮动相机控制面板
        │   └── CameraControls.css
        ├── controls/
        │   ├── ControlPanel.tsx       # 右侧控制面板
        │   ├── ControlPanel.css
        │   ├── ScoreModal.tsx         # 评分弹窗
        │   └── ScoreModal.css
        └── history/
            ├── HistoryPanel.tsx       # 搭建历史面板
            └── HistoryPanel.css
```

### 2.1 分层架构约束

```
components/ ──→ hooks/ ──→ stores/ ──→ persistence/ | rendering/ ──→ engine/
                         ↓                        ↓
                     Zustand State             Three.js
```

- **engine/**：纯逻辑，不可 import React 或 Three.js
- **rendering/**：Three.js 封装，不可 import React（可 import engine）
- **persistence/**：sql.js 封装（可 import types）
- **stores/**：Zustand 状态管理（可 import engine / persistence / types）
- **hooks/**：React hooks（可 import stores / types）
- **components/**：React UI（可 import 所有下层模块）

---

## 3. 数据模型

### 3.1 类型别名

```typescript
type CelestialBodyId = string;
type CelestialBodyType = 'star' | 'planet' | 'moon';
```

### 3.2 CelestialBodyTemplate（工具栏天体模板）

工具栏中可选天体的静态定义，包含真实物理数据和显示属性：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `CelestialBodyId` | 唯一模板 ID，如 `'sun'`, `'earth'`, `'moon'` |
| `name` | `string` | 中文名称 |
| `type` | `CelestialBodyType` | 天体类型 |
| `parentId` | `CelestialBodyId?` | 父天体 ID（仅卫星有值） |
| `mass` | `number` | 质量（kg，真实物理值） |
| `radius` | `number` | 真实半径（m） |
| `textureUrl` | `string` | 纹理贴图路径 |
| `semiMajorAxis` | `number?` | 真实轨道半长轴（m），仅行星和卫星 |
| `orbitalSpeed` | `number?` | 真实轨道速度（m/s），仅行星和卫星 |

支持 17 个天体模板：太阳（1 恒星）、水星/金星/地球/火星/木星/土星/天王星/海王星（8 行星）、月球/火卫一/火卫二/木卫一/木卫二/木卫三/木卫四/土卫六（8 卫星）。

### 3.3 CelestialBody（运行时天体实例）

用户放置到场景中的具体天体：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 实例唯一 ID，格式 `{templateId}-{timestamp}-{counter}` |
| `templateId` | `CelestialBodyId` | 关联的模板 ID |
| `position` | `[number, number, number]` | 位置（显示坐标） |
| `velocity` | `[number, number, number]` | 速度向量 |
| `mass` | `number` | 显示质量 |
| `placedAt` | `number` | 放置时间戳（ms） |
| `rotationSpeed` | `number` | 自转速度（滑块控制，0~5） |

### 3.4 BuildState（搭建状态）

当前搭建会话的完整状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 搭建会话 ID |
| `bodies` | `CelestialBody[]` | 已放置天体数组 |
| `startedAt` | `number \| null` | 搭建开始时间戳（放置太阳时设置） |
| `completedAt` | `number \| null` | 完成时间戳 |
| `isRunning` | `boolean` | 模拟是否运行中 |
| `simulatedTime` | `number` | 已模拟时间（秒） |
| `buildElapsedMs` | `number` | 搭建耗时（ms） |
| `hintIndex` | `number` | 当前提示索引 |

### 3.5 BuildRecord（搭建历史记录）

持久化到 sql.js 的记录：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 记录 ID（关联 BuildState.id） |
| `createdAt` | `number` | 创建时间戳（ms） |
| `completedAt` | `number \| null` | 完成时间戳 |
| `status` | `'building' \| 'completed' \| 'cancelled'` | 搭建状态 |
| `score` | `number \| null` | 评分（0-100） |
| `buildTimeMs` | `number \| null` | 搭建耗时（ms） |
| `snapshot` | `string` | BuildState 的 JSON 序列化快照 |

### 3.6 ScoringResult（评分结果）

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalScore` | `number` | 总分（0-100） |
| `planetScores` | `Record<string, SingleScore>` | 各行星的单项得分 |

### 3.7 SingleScore（单项评分）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 天体中文名 |
| `orbitRadiusScore` | `number` | 轨道半径得分（0 ~ Weight） |
| `massScore` | `number` | 质量得分（0 ~ Weight） |
| `velocityScore` | `number` | 速度得分（0 ~ Weight） |
| `orderScore` | `number` | 顺序得分（0 ~ Weight） |
| `total` | `number` | 单项归一化总分（0~1） |

### 3.8 ScoringConfig（评分配置）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `allowedErrorPercent` | `number` | `5` | 允许误差百分比 |
| `orbitRadiusWeight` | `number` | `0.30` | 轨道半径权重 |
| `massWeight` | `number` | `0.25` | 质量权重 |
| `velocityWeight` | `number` | `0.25` | 速度权重 |
| `orderWeight` | `number` | `0.20` | 顺序权重 |

### 3.9 UIState（UI 状态）

| 字段 | 类型 | 说明 |
|------|------|------|
| `selectedToolId` | `CelestialBodyId \| null` | 当前选中工具栏天体 |
| `selectedBodyIds` | `string[]` | 画布上选中的天体实例 ID 列表 |
| `supervisionMode` | `boolean` | 监督模式开关 |
| `showHint` | `boolean` | 提示显示开关 |
| `isPlacing` | `boolean` | 是否正在放置天体 |
| `hintIndex` | `number` | 当前提示步骤索引 |
| `showScoreModal` | `boolean` | 是否显示评分弹窗 |

---

## 4. 页面布局

### 4.1 三栏 CSS Grid 布局

```
┌──────────────┬──────────────────────────────┬──────────────┐
│              │                              │              │
│  左侧 220px  │      中间 自适应 (1fr)       │  右侧 280px  │
│              │                              │              │
│  ┌────────┐  │  ┌────────────────────┐      │  ┌────────┐  │
│  │ 工具栏  │  │  │                    │      │  │ 控制面 │  │
│  │        │  │  │                    │      │  │ 板     │  │
│  │ 恒星   │  │  │   3D Canvas        │      │  │        │  │
│  │ 行星   │  │  │                    │      │  │ 计时器 │  │
│  │ 卫星   │  │  │         ┌────┐     │      │  │ 按钮组 │  │
│  │  ...   │  │  │         │相机│     │      │  │ 天体信 │  │
│  │        │  │  │         │控制│     │      │  │ 息     │  │
│  │        │  │  │         └────┘     │      │  └────────┘  │
│  └────────┘  │  └────────────────────┘      │              │
│              │                              │  ┌────────┐  │
│              │                              │  │ 历史面 │  │
│              │                              │  │ 板     │  │
│              │                              │  │ 历史列 │  │
│              │                              │  │ 表     │  │
│              │                              │  └────────┘  │
└──────────────┴──────────────────────────────┴──────────────┘
```

### 4.2 各面板职责

| 面板 | 定位 | 背景色 | 边框 | 内容 |
|------|------|--------|------|------|
| 左侧 | `220px` 固定宽度 | `#0d0d2a` | 右侧 `1px solid #1a1a3a` | CelestialToolbar |
| 中间 | `1fr` 弹性 | `#050510` | 无 | Canvas3D + CameraControls（浮动叠放） |
| 右侧 | `280px` 固定宽度 | `#0d0d2a` | 左侧 `1px solid #1a1a3a` | ControlPanel + HistoryPanel（纵向排列） |

### 4.3 相机控制面板

- 位置：画布区域右上角悬浮
- 样式：半透明深色背景
- 布局：十字方向键 + 中心重置按钮 + 底部缩放按钮
- 支持 +/- 按钮缩放（0.1x ~ 3.0x），不支持画布拖拽

---

## 5. 核心交互流程

### 5.1 天体放置流程

```
用户点击工具栏天体
  └──> 选中工具（selectedToolId 设置）
    └──> 画布鼠标变为十字光标
      └──> mousedown: 记录起始位置，进入 isPlacing 状态
        │
        ├── 太阳（star）：
        │     ├── 模拟保持运行（不冻结）
        │     └── 速度固定为 [0, 0, 0]，不显示速度箭头
        │
        ├── 行星/卫星：
        │     ├── 模拟暂停（pauseBuild）
        │     ├── 显示预览球体（半透明白色，对数尺寸）
        │     └── 拖拽过程中显示速度箭头
        │
        └── mouseup:
               ├── 计算拖拽方向和速度（speed = dir.length * speedScale，上限 maxSpeed）
              ├── 调用 placeBody 创建天体实例
              ├── 若放置太阳：自动调用 startBuild，创建历史记录
               ├── 若放置其他天体：保持模拟暂停（需用户手动启动）
              ├── 若提示开启且放置了提示目标天体：自动关闭提示
              └── 清除所有 Gizmo（预览球、速度箭头）
```

**关键规则**：
- 太阳不支持设置初速度，点击即释放于参考平面交点，永远静止
- 必须先放置太阳，才能在工具栏选择行星和卫星（否则显示灰色禁用状态）
- 释放时模拟冻结：进入放置模式时暂停，释放完成后恢复

### 5.2 相机控制

```
用户鼠标按下相机面板的方向按钮
  └──> 启动 50ms 定时器，持续旋转相机

旋转方式：
  ├── 水平旋转：绕 Y 轴旋转视角（rotateCameraHorizontal）
  └── 垂直旋转：限制仰角范围 [0.1, π - 0.1]（rotateCameraVertical）

旋转步长：CAMERA_ROTATE_STEP * 0.5 = π/18 * 0.5 ≈ 4.8°/帧

缩放方式：
  ├── 放大（+）：减小视锥体，步长 0.15x，上限 3.0x
  ├── 缩小（−）：增大视锥体，步长 0.15x，下限 0.1x
  └── 长按按钮通过 50ms 定时器连续缩放

重置按钮：将相机恢复至初始位置 (0, 0, 100)，缩放恢复至 1.0x
```

### 5.3 天体选择

```
未选中工具时，在画布上操作鼠标：

mousedown → 记录起点
  └──> mousemove:
        ├── 绘制框选矩形（selection-rect overlay）
        └── 更新矩形坐标

  └──> mouseup:
        ├── 若拖拽距离 > 5px（框选）：
        │     ├── 调用 selectBodiesInRect：
        │     │     将天体世界坐标投影到屏幕，判断是否在矩形内
        │     └── 设置 selectedBodyIds
        │
        └── 若点击距离 < 5px（单击空白处）：
              └── 清除选区，取消高亮

选中后：
  ├── 高亮显示：设置被选天体 Mesh 的 emissive 属性
  └── 右侧面板显示选中天体详情（名称、质量、速度、自转速度）
```

### 5.4 撤销/重做（Command 模式）

```
操作（placeBody / removeBody / modifyMass）触发后：
  └──> 创建 Command 对象 { type, execute, undo }
    └──> 压入 undoStack（最多保留 50 条）
      └──> 清空 redoStack

undo() [Ctrl+Z / Cmd+Z]：
  └──> 从 undoStack 弹出最后一个 Command
    └──> 调用 cmd.undo()
      └──> 将 cmd 压入 redoStack

redo() [Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y]：
  └──> 从 redoStack 弹出最后一个 Command
    └──> 调用 cmd.execute()
      └──> 将 cmd 压入 undoStack
```

**支持的操作类型**：
| 类型 | execute | undo |
|------|---------|------|
| `'place'` | 添加天体到 bodies | 从 bodies 移除该天体 |
| `'remove'` | 从 bodies 移除天体 | 将天体恢复到 bodies |
| `'modifyMass'` | 将天体质量设为新值 | 将天体质量恢复为旧值 |

### 5.5 提示系统

```
用户点击「💡 提示」按钮：
  ├── 设置 showHint = true
  ├── hintIndex 递增（循环）
  └── 根据 HINT_ORDER[hintIndex] 获取提示目标

渲染层响应 showHint 状态变化：
  ├── 查找太阳位置（作为轨道中心）
  ├── 绘制相应天体的轨道虚线环（橙色 #ffaa00）
  │     半径 = displayOrbitRadius(semiMajorAxis)（幂律压缩后的显示距离）
  ├── 绘制引导箭头（半透明橙色）：从建议位置指向建议速度方向
  │     方向 = 与径矢垂直的切线方向（近似圆形轨道）
  └── 天体放置成功后将提示的目标天体匹配当前操作：
        ├── 若匹配：自动关闭提示
        └── 否则：保持提示显示
```

**HINT_ORDER**（提示顺序）：
```
太阳 → 水星 → 金星 → 地球 → 火星 → 木星 → 土星 → 天王星 → 海王星
→ 月球 → 火卫一 → 火卫二 → 木卫一 → 木卫二 → 木卫三 → 木卫四 → 土卫六
```

### 5.6 监督模式

```
点击「👁 监督」按钮切换切换 supervisionMode

开启后：
  └──> 实时计算每个天体的误差：
        ├── 轨道半径误差：|log10(实际) - log10(真实)| / log10(真实) × 100%
        ├── 质量误差：|实际质量 - 真实质量| / 真实质量 × 100%
        └── 速度误差：|实际速度 - 真实速度| / 真实速度 × 100%

  └──> 右侧面板"监督模式 - 实时误差"区域显示：
        ├── 绿色 < 5% 误差（达标）
        ├── 黄色 5%~20% 误差（偏差）
        └── 红色 > 20% 误差（严重偏差）

  └──> 放置时检查：
        ├── 质量异常警告（mass <= 0）
        └── 距离过近警告（与已有天体距离 < 1e8 m）
```

### 5.7 碰撞检测

```
每帧动画循环中（isRunning 时）：
  └──> 调用 detectCollisions(bodies)
    └──> 遍历所有天体对，若距离 < 1e7 m：
          ├──> mergeBodies(a, b)：
          │     ├── 新质量 = 质量之和
          │     ├── 新位置 = 加权平均（质心）
          │     └── 新速度 = 加权平均（动量守恒）
          ├──> 移除碰撞的两个天体
          └──> 添加合并后的天体（templateId 取 A 的 ID）
```

### 5.8 评分

```
点击「✓ 完成」：
  ├──> 调用 completeBuild()
  ├──> 调用 scoreBuild(bodies)：
  │     ├── 找到太阳位置
  │     ├── 过滤出行星（type === 'planet'）
  │     ├── 按轨道半径从近到远排序
  │     ├── 与真实行星顺序（PLANET_ORDER）逐项比较：
  │     │     ├── i=0: 水星, i=1: 金星, i=2: 地球, ...
  │     │     └── 若放置的行星类型与期望一致则顺序满分
  │     │
  │     └── 各分项评分（0 ~ Weight）：
  │           ├── 轨道半径分 = weight × max(0, 1 - logError / 5%)
  │           │     （使用对数误差以处理数量级差异）
  │           ├── 质量分 = weight × max(0, 1 - massError / 5%)
  │           ├── 速度分 = weight × max(0, 1 - speedError / 5%)
  │           └── 顺序分 = 匹配则 weight，否则 0
  │
  ├── 各行星归一化总分 = sum(各项得分) / sum(各项权重)
  ├── 缺失行星惩罚：penaltyFactor = 放置数 / 应有行星数
  ├── 最终总分 = avg(各行星归一化总分) × 100 × penaltyFactor
  │     （限制在 0~100 范围内）
  │
  └──> 保存历史记录，显示评分弹窗
```

### 5.9 历史记录切换

```
用户点击历史列表项：
  ├──> 若当前有活跃搭建：自动保存当前状态快照到 DB
  ├──> 从 DB 加载目标记录的 JSON 快照（BuildState）
  ├──> 调用 buildStore.loadSnapshot(state) 恢复状态
  └──> 3D 场景根据新 bodies 数组重新渲染天体
```

---

## 6. 技术设计

### 6.1 Three.js 场景初始化（rendering/setup.ts）

```
initScene(canvas):
  ├── Scene: 背景色 #050510（深空蓝黑）
  ├── Camera: OrthographicCamera(-w/2, w/2, h/2, -h/2, 1, 5000)
  │     1 世界单位 = 1 像素
  │     初始位置 (0, 0, 100)，看向原点
  ├── Renderer: WebGLRenderer，抗锯齿，最大设备像素比 2
  ├── 灯光:
  │     ├── AmbientLight(#444466, intensity=2) — 环境光
  │     └── PointLight(#ffffff, intensity=2, 原点) — 模拟太阳光
```

### 6.2 天体育染（rendering/bodies.ts）

**对数尺寸系统**：

```typescript
planetVisualRadius(realRadius: number): number {
  const raw = log10(realRadius / 1e6 + 1) × 8;
  return max(raw, 3);
}
```

- 太阳：固定半径 50 px（`SUN_RADIUS`）
- 木星（6.99e7m）→ 视觉半径 ≈ 22.6 px
- 地球（6.37e6m）→ 视觉半径 ≈ 6.9 px
- 月球（1.74e6m）→ 视觉半径 ≈ 3.5 px
- 火卫二（6.2e3m）→ 视觉半径 ≈ 3.0 px（MIN 截断）

**轨道距离压缩**：

```typescript
displayOrbitRadius(realSemiMajorAxis: number): number {
  const ratio = realSemiMajorAxis / REAL_DATA.sun.radius;
  const compressed = pow(ratio, 0.3);
  return compressed × SUN_RADIUS × 2;
}
```

- 幂指数 0.3 将数十亿倍的距离比压缩到可显示范围
- 水星轨道 → ~420 px，海王星轨道 → ~1140 px

**纹理加载**：
- 使用 `THREE.TextureLoader` 从 `/textures/{templateId}.jpg` 加载
- 纹理加载失败时回退到默认纯色（DEFAULT_COLORS 预定义的 17 色）
- 加载过的纹理缓存在 `Map<string, Texture>` 中避免重复加载

**特殊渲染**：
- 土星环：RingGeometry (radius×1.3 ~ radius×2.0)，半透明金色 (#ccaa66)，绕 X 轴旋转 0.3

**更新循环**：
- 每帧更新所有 BodyMesh 的 Group.position

### 6.3 参考平面与轨道环（rendering/grid.ts）

**参考平面**：
- `PlaneGeometry(w*3, h*3)`，z = -1
- 半透明深蓝 (#334466, opacity=0.3)
- `depthWrite: false` 避免遮挡天体
- 叠加网格线（步长 50，颜色 #446688，透明度 0.15）

**轨道环**：
- 虚线圆环，`LineDashedMaterial`，128 段
- 提示模式下显示橙色 (#ffaa00) 轨道环，半径取真实半长轴

### 6.4 交互检测（rendering/interaction.ts）

**射线平面交点**（放置位置计算）：
```typescript
raycaster.ray.intersectPlane(new Plane(Vector3(0, 0, 1), 0), target)
// 计算鼠标射线与 z=0 平面的交点
```

**框选检测**：
- 遍历 `bodyMeshMap` 中所有天体
- 将天体的世界坐标投影到屏幕空间
- 判断是否落在框选矩形内

**Gizmo 渲染**：
- 预览球体：半透明球（opacity=0.6, depthWrite=false）
- 浮动预览：跟随鼠标的球体（opacity=0.7, depthWrite=false），ID 不变时只更新位置
- 速度箭头：CylinderGeometry 箭头体（半径 2）+ ConeGeometry 箭头头（半径 5）
- 引导箭头：与速度箭头相同结构，半透明橙色（opacity=0.4）

### 6.5 物理引擎（engine/physics.ts）

**N 体引力计算**：

```
computeAccelerations(bodies, softening):
  ├── 对所有 i < j 计算:
  │     r = pos[i] - pos[j]
  │     distSoft = sqrt(dist² + softening²)  // 软化因子 10
  │     factor = G / distSoft³                // G = 500
  │     acc[i] -= factor × mass[j] × r
  │     acc[j] += factor × mass[i] × r
  └── 返回加速度数组
```

**RK4 积分器**（经典 4 阶 Runge-Kutta）：

```
rk4Step(bodies, dt):
  k1v = acc(r0, v0)        // 斜率 1
  k1r = v0

  temp: pos = r0 + k1r×dt/2, vel = v0 + k1v×dt/2  // 中点 1
  k2v = acc(temp)
  k2r = temp_vel

  temp: pos = r0 + k2r×dt/2, vel = v0 + k2v×dt/2  // 中点 2
  k3v = acc(temp)
  k3r = temp_vel

  temp: pos = r0 + k3r×dt,   vel = v0 + k3v×dt    // 终点
  k4v = acc(temp)
  k4r = temp_vel

  pos = r0 + (k1r + 2×k2r + 2×k3r + k4r) × dt/6   // 加权平均
  vel = v0 + (k1v + 2×k2v + 2×k3v + k4v) × dt/6
```

**时间推进**：

```
advanceSimulation(bodies, realDelta):
  ├── simDelta = realDelta × 1                // 时间缩放 1:1
  ├── steps = clamp(floor(simDelta / 0.016), 1, 1)  // 每帧 1 步
  ├── subDt = simDelta / steps
  └── 循环 steps 次调用 rk4Step
```

**碰撞检测**：
- 距离阈值：`1e7`
- 合并公式：质量守恒、质心位置（加权平均）、动量守恒（加权平均速度）

### 6.6 数据持久化（persistence/）

**数据库初始化**（db.ts）：
```
initDatabase():
  ├── 动态 import('sql.js')
  ├── 指定 WASM 路径（通过 Vite ?url 导入）
  ├── 创建内存数据库
  └── 建表: build_records (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL DEFAULT 'building',
        score REAL,
        build_time_ms INTEGER,
        snapshot TEXT
      )
  └── 创建索引: idx_created_at (created_at DESC)
```

**CRUD 操作**（repository.ts）：
| 操作 | 方法 | 说明 |
|------|------|------|
| 保存 | `saveRecord(record)` | INSERT OR REPLACE |
| 加载 | `loadRecord(id)` | SELECT by id |
| 列表 | `listRecords()` | SELECT ... ORDER BY created_at DESC |
| 删除 | `deleteRecord(id)` | DELETE by id |
| 排行 | `getBestScores(limit)` | SELECT completed ... ORDER BY score DESC, build_time_ms ASC |

### 6.7 状态管理（stores/）

**buildStore**：
- 实现 `BuildState` 接口，扩展 `Command` 模式
- 中央状态包括：bodies 数组、isRunning、计时器等
- `undoStack` / `redoStack`（Command 栈，上限 50）
- `getSnapshot()` 返回序列化快照，`loadSnapshot()` 恢复快照
- 每个修改操作自动创建 Command 并推入 undoStack
- `rotateRotationSpeed` 操作不进入 undoStack（非关键修改）

**uiStore**：
- 管理 `selectedToolId`、`selectedBodyIds`、`supervisionMode`、`showHint`、`isPlacing`、`showScoreModal`
- `resetUI()` 恢复所有 UI 状态到默认值

**historyStore**：
- 调用 `repository` 的持久化方法
- `loadRecords()` 从 DB 刷新记录列表
- `switchToRecord(id)` 加载特定记录的快照

### 6.8 键盘快捷键（hooks/useKeyboardShortcuts.ts）

| 快捷键 | 作用 | 条件 |
|--------|------|------|
| `Esc` | 取消选中工具 / 清除选区 | 不在输入框内 |
| `Ctrl+Z` / `Cmd+Z` | 撤销 | 不在输入框内 |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` | 重做 | 不在输入框内 |
| `Space` | 暂停/继续模拟 | 不在放置状态 (isPlacing) |

**注意**：当 focus 在 `<input>` 或 `<textarea>` 中时不触发快捷键。

### 6.9 音效系统（hooks/useAudio.ts）

```
preloadAudio():
  ├── 创建 4 个 Audio 元素（place / complete / collision / click）
  ├── 设置音量 0.5
  └── 预加载到缓存

playSound(name):
  ├── 从缓存取出音频
  ├── cloneNode() 创建副本（支持重叠播放）
  └── play().catch(() => {})  // 静默忽略 autoplay 限制
```

- 音效文件位于 `/sounds/` 目录
- 依赖浏览器 Audio API，autoplay 失败时静默处理
- 非核心功能，加载失败不影响应用运行

---

## 7. 配置常量

### 7.1 真实太阳系数据（REAL_DATA）

| ID | 名称 | 类型 | 质量 (kg) | 半径 (m) | 半长轴 (m) | 轨道速度 (m/s) |
|----|------|------|-----------|----------|------------|----------------|
| sun | 太阳 | star | 1.989e30 | 6.9634e8 | - | - |
| mercury | 水星 | planet | 3.3011e23 | 2.4397e6 | 5.791e10 | 47870 |
| venus | 金星 | planet | 4.8675e24 | 6.0518e6 | 1.082e11 | 35020 |
| earth | 地球 | planet | 5.9724e24 | 6.371e6 | 1.496e11 | 29780 |
| mars | 火星 | planet | 6.4171e23 | 3.3895e6 | 2.279e11 | 24070 |
| jupiter | 木星 | planet | 1.8982e27 | 6.9911e7 | 7.786e11 | 13070 |
| saturn | 土星 | planet | 5.6834e26 | 5.8232e7 | 1.434e12 | 9690 |
| uranus | 天王星 | planet | 8.6810e25 | 2.5362e7 | 2.871e12 | 6810 |
| neptune | 海王星 | planet | 1.0241e26 | 2.4622e7 | 4.495e12 | 5430 |
| moon | 月球 | moon | 7.342e22 | 1.7374e6 | 3.844e8 | 1022 |
| io | 木卫一 | moon | 8.9319e22 | 1.8216e6 | 4.217e8 | 17334 |
| europa | 木卫二 | moon | 4.7998e22 | 1.5608e6 | 6.711e8 | 13740 |
| ganymede | 木卫三 | moon | 1.4819e23 | 2.6341e6 | 1.070e9 | 10880 |
| callisto | 木卫四 | moon | 1.0759e23 | 2.4103e6 | 1.883e9 | 8204 |
| titan | 土卫六 | moon | 1.3452e23 | 2.5747e6 | 1.222e9 | 5570 |
| phobos | 火卫一 | moon | 1.0659e16 | 1.1266e4 | 9.376e6 | 2138 |
| deimos | 火卫二 | moon | 1.4762e15 | 6.2e3 | 2.3463e7 | 1351 |

### 7.2 物理模拟参数（SIM_CONFIG）

| 参数 | 值 | 说明 |
|------|-----|------|
| `G` | `500` | 引力常数（显示尺度） |
| `timeStep` | `0.016` | 单步积分时间（s） |
| `timeScale` | `1` | 时间缩放（1:1） |
| `softeningFactor` | `10` | 软化因子，防止近距离数值发散 |
| `maxSubsteps` | `1` | 每帧最大子步数 |

### 7.3 显示参数（DISPLAY_CONFIG）

| 参数 | 值 | 说明 |
|------|-----|------|
| `sunRadius` | `50` | 太阳视觉半径（px） |
| `orbitPower` | `0.3` | 轨道距离压缩幂指数 |
| `planetScaleFactor` | `8` | 行星对数缩放系数 |
| `minDisplayRadius` | `1e6` | 对数缩放参考最小半径（m） |
| `referencePlaneOpacity` | `0.3` | 参考平面透明度 |
| `referencePlaneColor` | `0x334466` | 参考平面颜色 |
| `maxOrbitRadius` | `2000` | 最大显示轨道半径（px） |

### 7.4 拖拽参数（DRAG_CONFIG）

| 参数 | 值 | 说明 |
|------|-----|------|
| `speedScale` | `0.5` | 拖拽距离→速度的缩放系数 |
| `maxSpeed` | `200` | 最大初速度 |
| `arrowColor` | `0x00ff00` | 速度箭头颜色（绿） |
| `guideArrowColor` | `0xffaa00` | 引导箭头颜色（橙） |

### 7.5 行星顺序（PLANET_ORDER）

```
['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']
```

用于评分中顺序维度的比较。HINT_ORDER 在此基础上扩展了卫星。

---

## 8. 非功能性需求

### 8.1 性能要求

- **渲染帧率**：目标 60fps，通过 `requestAnimationFrame` 驱动
- **时间步限制**：`dt = min(真实时间差, 0.1)`，防止长时间挂起后计算爆炸
- **子步上限**：最多 10 个子步/帧，复杂场景下仍保持帧率稳定
- **设备像素比**：`min(devicePixelRatio, 2)`，高 DPI 屏幕上不超采样
- **纹理缓存**：Textures 缓存于 Map，避免重复网络请求
- **Command 栈限制**：undoStack 最多保留 50 条，防止无限增长

### 8.2 键盘快捷键

| 快捷键 | 作用 |
|--------|------|
| `Esc` | 取消当前工具选择 / 清除天体选区 |
| `Ctrl+Z` / `Cmd+Z` | 撤销上一步操作 |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` | 重做已撤销的操作 |
| `Space` | 暂停/继续模拟（非放置状态） |

### 8.3 响应式设计

- 三栏布局使用 CSS Grid，中间列 `1fr` 自适应
- 左侧和右侧面板均有 `overflow-y: auto` 处理内容溢出
- Canvas 通过 `handleResize()` 响应窗口大小变化，更新渲染器和相机宽高比

### 8.4 错误处理

- **纹理加载失败**：回退到默认纯色（DEFAULT_COLORS），不中断渲染
- **WASM 加载失败**：`initDatabase()` throws Error，应用无历史功能但仍可正常搭建
- **DB 操作**：所有 repository 方法使用 prepared statement，防止 SQL 注入
- **JSON 解析**：历史快照解析失败时静默忽略，不崩溃
- **音频播放**：`play().catch(() => {})` 静默处理 autoplay 限制

### 8.5 边界条件

- 仅一个天体时模拟不运行（`bodies.length < 2`）
- 视觉半径 < 0.05 的天体不渲染（`deimos` 等小卫星）
- 太阳无初速度（代码层面确保 velocity = [0, 0, 0]）
- 未放置太阳时，行星和卫星工具栏项禁用
- 评分时缺失行星按 0 分计并加权惩罚

---

## 9. 资源约束

### 9.1 纹理资源

- 天体纹理贴图从 `/textures/` 目录加载，格式为 JPG
- 命名规则：`{templateId}.jpg`（如 `earth.jpg`, `jupiter.jpg`）
- 纹理分辨率无硬性要求，建议不低于 512×512
- 依赖网络加载，首屏可能短暂显示纯色球体

### 9.2 音频资源

- 音效文件从 `/sounds/` 目录加载，格式为 MP3
- 4 个音效文件：`place.mp3`, `complete.mp3`, `collision.mp3`, `click.mp3`
- 音频为可选增强功能，加载失败不影响核心功能

### 9.3 语言

- 仅支持**中文**（`<html lang="zh-CN">`）
- 所有 UI 文本、天体名称、错误提示均为中文
- 无国际化计划

### 9.4 运行环境

- 纯前端 SPA，单用户
- 需要支持 WebGL 的现代浏览器
- sql.js 通过 WASM 运行，需要浏览器支持 WebAssembly
- 数据库为内存存储，页面刷新后数据仍持久化于 IndexedDB 快照中（需手动保存）

### 9.5 无后端依赖

- 无需服务器端 API
- 所有数据本地存储
- Vite 开发服务器仅提供静态文件服务

---

## 附录 A：命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `CelestialToolbar`, `Canvas3D` |
| 工具/库文件 | camelCase | `physics.ts`, `constants.ts` |
| 类型/接口 | PascalCase | `CelestialBody`, `BuildState` |
| 变量/函数 | camelCase | `placeBody`, `advanceSimulation` |
| 常量 | UPPER_SNAKE_CASE | `G`, `REAL_DATA`, `SIM_CONFIG` |
| CSS 文件 | 与组件同名 | `CelestialToolbar.css` |

## 附录 B：构建与运行

```bash
npm run dev          # 启动 Vite 开发服务器（含 HMR）
npm run build        # TypeScript 编译 + Vite 生产构建
npm run typecheck    # TypeScript 类型检查（tsc -b 的一部分）
npm run lint         # ESLint 代码检查
npm run preview      # 预览生产构建
```
