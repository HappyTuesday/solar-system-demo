# AGENTS.md

## Project Overview

太阳系搭建演示 — 交互式教育 SPA，用户通过放置天体、设置初速度来搭建太阳系，系统使用 N 体引力模拟天体运动，搭建完成后与真实数据对比评分。

- **技术栈**: React 18 + TypeScript (strict) + Three.js + Vite + Zustand + sql.js
- **语言**: 仅支持中文
- **平台**: 纯前端，单用户

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

### 架构约束

- 分层架构，禁止跨层直接依赖：
  - `engine/` — 纯逻辑（无 React、无 Three.js）
  - `rendering/` — Three.js 封装
  - `persistence/` — sql.js 封装
  - `stores/` — Zustand 状态管理
  - `components/` — React UI
  - `hooks/` — React hooks
- Engine 层不能 import React 或 Three.js
- Rendering 层不能 import React（但可以 import engine）
- Components 层可以 import 所有下层模块

### 关键设计决策

- **太阳静止**：太阳不支持设置初速度，点击即释放，永远静止于释放位置。
- **释放时冻结**：进入释放模式时模拟暂停，释放完成后恢复。
- **对数尺寸**：天体体积以对数形式显示（`log10(r / R_min + 1) * K`），不直接显示绝对尺寸。
- **N 体物理**：使用 4 阶 Runge-Kutta 积分器，所有天体之间有引力相互作用。
- **评分**：基于轨道半径、质量、速度、行星顺序四个维度，允许 5% 误差。
- **相机控制**：悬浮在画布右上角的半透明面板，不支持滚轮缩放，不支持画布拖拽。

### 项目结构

```
src/
├── types/          # TS 类型定义
├── engine/         # 纯逻辑层
│   ├── constants.ts
│   ├── physics.ts
│   └── scoring.ts
├── rendering/      # Three.js 封装
│   ├── setup.ts
│   ├── bodies.ts
│   ├── grid.ts
│   ├── interaction.ts
│   └── cameraRef.ts
├── persistence/    # sql.js 封装
│   ├── db.ts
│   └── repository.ts
├── stores/         # Zustand
│   ├── buildStore.ts
│   ├── uiStore.ts
│   └── historyStore.ts
├── hooks/          # React hooks
│   ├── useKeyboardShortcuts.ts
│   └── useAudio.ts
└── components/     # React UI
    ├── toolbar/
    ├── canvas/
    ├── controls/
    └── history/
docs/
├── specs/          # 设计文档
└── plans/          # 实施计划
```

## Build & Development

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本
npm run typecheck  # TypeScript 类型检查
```
