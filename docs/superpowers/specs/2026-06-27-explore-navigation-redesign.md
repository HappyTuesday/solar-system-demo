# 探索太阳系 — 导航增强与仪表盘重构

## 概述

重构「探索太阳系」页面的仪表盘布局，增强导航能力，支持设置目的地天体并自动规划霍曼转移路线。

## 布局变更

### ExplorePage

```
┌─────────────────────────────────────┐
│  3D 主视图（飞船第一人称）           │
│                                     │
│  HUD 绕飞参数（无背景，左对齐）       │
│  HUD 基本参数                       │
│                                     │
│  ┌────────┬────────┬────────┐       │
│  │飞行控制 │导航路线 │ 导航地图│       │
│  └────────┴────────┴────────┘       │
└─────────────────────────────────────┘
```

### HUD（悬浮在仪表盘上方外侧）

- **位置**：仪表盘上方外侧，左对齐于面板边界
- **样式**：纯文字叠加，无边框、无背景色，直接渲染在 3D 视图之上
- **第一行（绕飞参数）**：最近天体名、轨道速度、轨道高度、角速度、轨道周期、船身夹角、自转夹角、地表相对速度、公转夹角
- **第二行（基本参数）**：X/Y/Z 坐标、飞行速度、有效速度、推力大小、距最近天体距离、距目的地天体距离、黄道面高度、黄道面夹角
- **旧基本参数和绕飞参数栏目从仪表盘内移除**

### 仪表盘

- **宽度**：1100px（同原 `Dashboard.css` 中的 `width: 1100px`）
- **栏数**：三栏等宽（各 flex: 1），栏间 gap 24px + 竖线分隔符
- **去掉"飞船仪表"标签**

#### 栏 1：飞行控制

- **推力滑块**：保持不变
- **姿态调整触控板**：3×3 网格，按方向排列（上/下/左/右 + 中心翻转 ⇄）
- **平移推力触控板**：3×3 网格，按方向排列（上/下/左/右）
- 姿态调整和平移推力左右并列
- **姿态模式按钮**：惯性保持 / 顺向保持 / 指向目的地（与原来一致）
- **移除目标设置相关 UI**（目标选择/修改/清除按钮）

#### 栏 2：导航路线

- **设置目的地按钮**：打开天体选择弹窗
- **路线阶段列表**：设置目的地后自动规划，逐行显示每个轨道切换阶段
- 每阶段显示：阶段名称、预期推力大小和方向、预期 Δv
- **阶段状态**：
  - `✓` 已完成（绿色）—— 自动检测到飞船位置/速度进入下一阶段参数范围
  - `→` 当前进行中（黄色）—— 带左高亮竖线
  - `○` 待执行（灰色半透明）
- **偏离警告**：每 N 秒检测一次，若偏离超过阈值，在当前阶段标记警告并自动重规划

#### 栏 3：导航地图

- 原 MiniMap 改造，Canvas 2D 太阳系俯视图
- **无目的地时**：当前视图模式（飞船 + 天体 + 航迹预测）
- **有目的地时额外显示**：
  - 当前需要进入的导航转移轨道 → 绿色虚线（实时更新）
  - 目标天体的理想绕飞轨道 → 红色曲线
  - 飞船当前绕飞轨道 → 蓝色曲线
- **图例**：显示在地图底部居中
- 名称从"导航图"改为"导航地图"

## 文案变更

| 原文案 | 新文案 |
|---|---|
| 设置目标 | 设置目的地 |
| 目标：{name} | 目的地：{name} |
| 选择目标天体 | 选择目的地天体 |
| 导航图 | 导航地图 |
| 飞船仪表 | **移除** |

涉及文件：`Dashboard.tsx`、`TargetSelectionModal.tsx`、`spaceshipStore.ts`（`targetBodyId` 保留不变）

## 引擎层新增

### engine/navigation.ts

霍曼转移路线规划模块（纯逻辑，无 React/Three.js 依赖）。

**接口：**

```ts
export interface NavigationPhase {
  index: number;
  name: string;                      // 阶段名称
  thrustDirection: 'forward' | 'backward' | 'none';  // 推力方向
  thrustMagnitude: number;           // 预期推力百分比 0-100
  deltaV: number;                    // 预期速度增量 AU/s
  expectedSpeedKms: number;          // 预期达到的速度 km/s
  targetOrbit: {                    // 目标轨道参数
    semiMajorAxis: number;           // AU
    eccentricity: number;
  };
}

export interface NavigationPlan {
  phases: NavigationPhase[];
  method: 'hohmann';                 // 转移方式
  destinationId: string;
  plannedAt: number;                 // 规划时间戳 simulatedTime
}
```

**函数：**

```ts
// 规划从当前位置到目标天体的霍曼转移路线
function planHohmannTransfer(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  destinationId: string,
  jd: number,
): NavigationPlan;

// 检测当前阶段是否完成（位置/速度进入下一阶段轨道参数范围）
function checkPhaseCompletion(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  jd: number,
): boolean;

// 检测是否偏离预定轨道
function checkDeviation(
  shipPosition: [number, number, number],
  shipVelocity: [number, number, number],
  plan: NavigationPlan,
  currentPhaseIdx: number,
  jd: number,
): { deviated: boolean; deviationAu: number; deviationKms: number };
```

**霍曼转移算法概述：**

1. 获取飞船当前位置/速度（AU 坐标系）
2. 获取目标天体当前位置/速度/轨道参数
3. 计算飞船当前轨道半长轴 `a_current`
4. 计算目标天体轨道半长轴 `a_target`
5. 计算转移椭圆半长轴 `a_transfer = (a_current + a_target) / 2`
6. 阶段1（提升/降低远日点）：在近地点施加切向推力，使轨道从 `a_current` 变为 `a_transfer`，推力方向 = forward（或 backward，取决于外行星还是内行星）
7. 阶段2（转移轨道滑行）：无推力，等待半个转移轨道周期到达目标轨道
8. 阶段3（目标捕获制动）：在远日点施加反向推力，使轨道从 `a_transfer` 变为 `a_target`
9. 阶段4（绕飞圆化）：微调轨道偏心率为 0，建立圆形绕飞轨道

## 状态管理变更

### spaceshipStore.ts

新增字段和动作：

```ts
interface SpaceshipStore {
  // ... 现有字段 ...

  // 新增
  navigationPlan: NavigationPlan | null;  // 初始值 null
  activePhaseIndex: number;           // 当前所在阶段索引，初始值 0；-1 表示无计划
  deviationWarning: string | null;    // 偏离警告信息，初始值 null；重规划或完成阶段后清除

  // 新增动作
  setNavigationPlan: (plan: NavigationPlan | null) => void;
  setActivePhaseIndex: (idx: number) => void;
  setDeviationWarning: (msg: string | null) => void;
}
```

### targetBodyId 保留

- `targetBodyId` 字段不变，语义从"目标"改为"目的地"
- `setTargetBody` 动作不变，内部逻辑扩展为：设置目的地后自动调用 `planHohmannTransfer` 生成导航计划

## 组件变更

### 新增 HUD 组件

**components/explore/HUD.tsx**

- 位于 `ExplorePage.tsx` 中，与 `Dashboard` 同级
- 无背景、无边框，纯文字渲染
- 两行 flex column 布局，左对齐
- 从 `spaceshipStore` 读取所有飞行参数

### 改造 Dashboard.tsx

- 移除"飞船仪表"标签
- 移除基本参数列（迁移到 HUD）
- 移除绕飞参数列（迁移到 HUD，仅在绕飞时显示相关行）
- 飞行控制列：
  - 移除目标设置行（迁移到导航路线）
  - 姿态按钮改为 3×3 方向网格
  - 平移按钮改为 3×3 方向网格
- 新增导航路线列：
  - 设置目的地按钮 + 路线阶段列表
- 导航图列改为导航地图（名称和 CSS 调整）

### 改造 MiniMap.tsx（或不改造，仅改名称引用）

- 原有 MiniMap 功能保留
- 新增：有导航计划时绘制三种轨道线（绿虚线/红曲线/蓝曲线）
- 图例移至底部

### 改造 TargetSelectionModal.tsx

- 标题从"选择目标天体"改为"选择目的地天体"
- 相关文案同步调整

## 数据流

```
用户点击"设置目的地"
  → TargetSelectionModal 选择天体
  → spaceshipStore.setTargetBody(id)
  → engine/navigation.planHohmannTransfer() 自动规划路线
  → spaceshipStore.setNavigationPlan(plan)
  → Dashboard 导航路线栏渲染阶段列表
  → MiniMap 导航地图渲染轨道线

每模拟帧：
  → ExploreCanvas 更新飞船位置/速度
  → spaceshipStore.updatePhysics()

每 N 秒（定时检测）：
  → engine/navigation.checkPhaseCompletion()
    → 若完成 → spaceshipStore.setActivePhaseIndex(nextIdx)
    → Dashboard 更新阶段状态（✓/→/○）
  → engine/navigation.checkDeviation()
    → 若偏离 → spaceshipStore.setDeviationWarning(msg)
    → Dashboard 导航路线栏显示警告
    → 自动重规划路线（不影响已完成阶段）
```

## 边界情况

- **无最近天体（不在任何天体引力范围内）**：HUD 绕飞参数行不显示
- **未设置目的地**：导航路线栏仅显示"设置目的地"按钮，导航地图不显示额外轨道线
- **飞船爆炸**：仪表盘隐藏（保持不变），HUD 也隐藏
- **目标天体与当前位置极端接近**：不规划路线（已到达）
- **多次变更目的地**：清除旧计划，重新规划

## 配置常量

```ts
// engine/constants.ts 新增
export const NAVIGATION_CONFIG = {
  deviationCheckInterval: 5,    // 偏离检测间隔（模拟秒）
  deviationThresholdAU: 0.01,   // 位置偏差阈值（AU）
  phaseCompletionThresholdAU: 0.005,  // 阶段完成判定轨道半径容差（AU）
  rePlanCooldownSec: 30,        // 重规划冷却时间（模拟秒），避免频繁重规划
};
```

## 架构约束

- `engine/navigation.ts`：纯逻辑，无 React/Three.js 依赖
- HUD 组件通过 `ExplorePage.tsx` 的 `fixed` 定位悬浮，不嵌入 Dashboard 内部
- Dashboard 三栏无独立背景色
- 不实现自动驾驶，仅规划路线
