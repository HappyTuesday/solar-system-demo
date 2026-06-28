# AGENTS.md

## Project Overview

太阳系搭建演示 — 交互式教育 SPA，包含四个模块：
- **搭建模式**：用户通过放置天体、设置初速度来搭建太阳系，系统使用 N 体引力模拟天体运动，搭建完成后与真实数据对比评分。
- **地月系统**：展示地球-月球系统的月相、日食/月食模拟。
- **探索模式**：飞船自由飞行探索太阳系。
- **首页/关于**：产品介绍页面。

- **技术栈**: React 19 + TypeScript 6.0 (strict) + Three.js + Vite 8 + Zustand 5 + react-router-dom 7
- **渲染后端**: Three.js（主）+ Canvas 2D（备用）
- **持久化**: localStorage（sql.js 待集成）
- **语言**: 仅支持中文
- **平台**: 纯前端，单用户，多页面 SPA

## Rules

### 文档与代码同步

1. **任何功能变更必须先更新设计文档** (`docs/specs/` 或 `docs/plans/`)，然后再修改代码。不允许只改代码不更新文档。
2. **代码 review 时需同步检查文档一致性**：实现是否与设计文档一致，设计文档是否反映了最新的代码行为。
3. **新增模块/文件**必须在设计文档中补充说明其职责和接口。
4. **修改已有模块的接口或行为**必须在设计文档中标注变更。
5. **每个 PR/commit** 如果涉及功能变更，应包含对应文档的更新。

### 代码规范

- TypeScript `strict: true`，所有类型必须有明确定义，禁止使用 `any`（除必要的第三方库声明）。
- 组件文件使用 PascalCase，工具/库文件使用 camelCase。
- 每个文件职责单一，接口清晰。
- 遵循现有代码的命名和结构模式。

### 物理单位约定

- **所有物理运动相关的距离（位置、半径、半长轴等）在核心代码中统一使用 AU（天文单位）**。
- **米和千米单位仅允许在最终 UI 显示时使用**，用于将 AU 转换为人类可读的格式。
- **速度使用 AU/s**（与距离 AU、时间秒保持一致），显示时转换为 km/s。
- **AU ↔ km ↔ m 的转换必须收拢到 `constants.ts` 中的 `AU_TO_M` 和 `AU_TO_KM`**，禁止在组件或其他文件中硬编码 `1.496e11`、`1.496e8`、`149597870.7` 等数值。
- 所有物理常量（`G`、`MU_SUN`、`softeningFactor` 等）必须使用 AU 标定的版本（`G_AU`、`MU_SUN_AU` 等）。

### 单元测试约束

- **非渲染层代码（非 `.tsx` 文件）必须通过单元测试完全覆盖**。包含但不限于：
  - `engine/` — 所有导出的函数、常量
  - `stores/` — Zustand store 的核心逻辑（不含 set/get 样板）
  - `hooks/` — 自定义 hook 的逻辑
- **`.tsx` 文件仅用于页面渲染**，不得包含：
  - 物理运动模拟逻辑
  - 复杂的业务逻辑运算
  - 纯计算函数（应放在 `engine/` 中）
- `.tsx` 组件内部允许的代码仅限于：UI 状态管理、事件处理、渲染相关的数据转换（如 AU→km 的显示格式化）。

### 架构约束

- 分层架构，禁止跨层直接依赖：
  - `engine/` — 纯逻辑（无 React、无 Three.js）
  - `rendering/` — Three.js / Canvas 2D 封装
  - `persistence/` — localStorage 封装（sql.js 待集成）
  - `stores/` — Zustand 状态管理
  - `hooks/` — React hooks
  - `components/` — React UI 组件
  - `pages/` — 页面级组件（路由入口）
- Engine 层不能 import React 或 Three.js
- Rendering 层不能 import React（但可以 import engine）
- Components 层可以 import 所有下层模块

### 项目结构

```
src/
├── types/          # TS 类型定义
├── engine/         # 纯逻辑层
│   ├── constants.ts
│   ├── physics.ts
│   ├── scoring.ts
│   ├── orbital.ts
│   ├── orbitalInjection.ts
│   ├── autoBuild.ts
│   ├── buildData.ts
│   ├── coordinateTransform.ts
│   ├── eclipse.ts
│   └── spaceship.ts
├── rendering/      # Three.js 封装
│   ├── threejs/    # Three.js 渲染后端（主）
│   │   ├── setup.ts
│   │   ├── bodies.ts
│   │   ├── grid.ts
│   │   ├── interaction.ts
│   │   ├── touchInteraction.ts
│   │   ├── cameraRef.ts
│   │   └── trails.ts
│   └── canvas2d/   # Canvas 2D 渲染后端（备用）
│       ├── setup.ts
│       ├── bodies.ts
│       ├── grid.ts
│       └── interaction.ts
├── persistence/    # 持久化（localStorage）
│   └── repository.ts
├── stores/         # Zustand
│   ├── buildStore.ts
│   ├── uiStore.ts
│   ├── historyStore.ts
│   ├── earthMoonStore.ts
│   ├── exploreStore.ts
│   └── spaceshipStore.ts
├── hooks/          # React hooks
│   ├── useKeyboardShortcuts.ts
│   ├── useAudio.ts
│   └── useRestore.ts
├── components/     # React UI
│   ├── layout/
│   │   ├── TopNav.tsx
│   │   └── TopNav.css
│   ├── shared/
│   │   └── ErrorBoundary.tsx
│   ├── builder/
│   │   ├── BuilderCanvas.tsx
│   │   ├── BodyCatalogModal.tsx / .css
│   │   ├── BodyStatusPanel.tsx / .css
│   │   ├── CelestialToolbar.tsx / .css
│   │   ├── CloseApproachOverlay.tsx / .css
│   │   ├── ControlPanel.tsx / .css
│   │   ├── CoordinateDisplay.tsx / .css
│   │   ├── HistoryPanel.tsx / .css
│   │   ├── Ruler.tsx / .css
│   │   ├── ScoreModal.tsx / .css
│   │   └── VelocityInputForm.tsx / .css
│   ├── earthmoon/
│   │   ├── EarthMoonCanvas.tsx
│   │   ├── EclipsePanel.tsx
│   │   ├── MoonPhase.tsx / .css
│   │   ├── OffScreenIndicator.tsx
│   │   └── TimeSlider.tsx
│   └── explore/
│       ├── ExploreCanvas.tsx
│       ├── Dashboard.tsx / .css
│       └── MiniMap.tsx
└── pages/         # 页面级组件（路由入口）
    ├── HomePage.tsx / .css
    ├── BuilderPage.tsx / .css
    ├── EarthMoonPage.tsx / .css
    ├── ExplorePage.tsx / .css
    └── AboutPage.tsx / .css
docs/
├── specs/          # 设计文档
└── plans/          # 实施计划
```

## Build & Development

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本（含 tsc 类型检查）
npm run lint       # ESLint 代码检查
npm run preview    # 预览生产构建
```
