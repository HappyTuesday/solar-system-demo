# 飞船姿态保持模式 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将飞船姿态从 `progradeLock: boolean` 扩展为三种保持模式（惯性/顺向/对地），并提供按钮组切换 UI。

**Architecture:** Store 层用 `AttitudeMode` 枚举替换 `progradeLock`，动画循环根据模式计算 `direction`，Dashboard 显示三按钮组仅在绕飞时可见。

**Tech Stack:** React 19 + TypeScript (strict) + Zustand 5

---

### Task 1: 新增 `AttitudeMode` 类型

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 `SpaceshipState` 接口上方新增 `AttitudeMode` 类型导出**

在 `src/types/index.ts` 第 111 行 `// --- Spaceship State ---` 注释与 `export interface SpaceshipState` 之间新增：

```typescript
export type AttitudeMode = 'inertial' | 'prograde' | 'nadir';
```

- [ ] **Step 2: 提交**

```bash
git add src/types/index.ts
git commit -m "feat: 新增 AttitudeMode 类型"
```

---

### Task 2: Store 层 — 替换 progradeLock 为 attitudeMode

**Files:**
- Modify: `src/stores/spaceshipStore.ts`

- [ ] **Step 1: 修改 imports，移除旧逻辑**

在 `src/stores/spaceshipStore.ts` 第 2 行 import 中新增 `AttitudeMode`：

找到：
```typescript
import type { SpaceshipState } from '../types';
```

改为：
```typescript
import type { SpaceshipState, AttitudeMode } from '../types';
```

- [ ] **Step 2: 在 SpaceshipStore 接口中替换 `progradeLock`，新增 `setAttitudeMode`**

修改第 5-26 行的接口定义。找到 `progradeLock: boolean;`（第 9 行），替换为 `attitudeMode: AttitudeMode;`。在 `setProgradeLock` 下面新增 `setAttitudeMode`。

最终接口中相关部分变为：

```typescript
export interface SpaceshipStore extends SpaceshipState {
  isRunning: boolean;
  dashboardExpanded: boolean;
  simulatedTime: number;
  attitudeMode: AttitudeMode;

  setForwardThrust: (v: number) => void;
  setLateralThrust: (v: number) => void;
  setVerticalThrust: (v: number) => void;
  setThrustMagnitude: (m: number) => void;
  setDirection: (d: [number, number, number]) => void;
  setExploded: () => void;
  toggleRunning: () => void;
  toggleDashboard: () => void;
  updatePhysics: (pos: [number, number, number], vel: [number, number, number]) => void;
  setSimulatedTime: (t: number) => void;
  reset: () => void;
  yaw: (angle: number) => void;
  pitch: (angle: number) => void;
  setToPrograde: () => void;
  setAttitudeMode: (mode: AttitudeMode) => void;
}
```

- [ ] **Step 3: 修改初始状态，将 `progradeLock: true` 改为 `attitudeMode: 'inertial'`**

修改 `initialState`（第 65-71 行）：

```typescript
const initialState = {
  ...initialSpaceship,
  isRunning: true,
  dashboardExpanded: true,
  simulatedTime: now,
  attitudeMode: 'inertial' as AttitudeMode,
};
```

注意：`reset()` 函数（第 86-92 行）中的初始状态也需要同步修改。文件开头 `const now = Date.now()` 之后的 `initialState` 改了，`reset` 中的初始化也改。

- [ ] **Step 4: 修改 `yaw()` / `pitch()`，手动旋转时自动切回惯性保持**

修改第 93-94 行，将 `progradeLock: false` 改为 `attitudeMode: 'inertial'`：

```typescript
yaw: (angle) => set(s => ({ direction: rotateYaw(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
pitch: (angle) => set(s => ({ direction: rotatePitch(s.direction, angle), attitudeMode: 'inertial' as AttitudeMode })),
```

- [ ] **Step 5: 修改 `setToPrograde()`，改为设置 mode 而非直接操作布尔值**

修改第 95-102 行：

```typescript
setToPrograde: () => set(s => {
  const vx = s.velocity[0];
  const vy = s.velocity[1];
  const vz = s.velocity[2];
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (speed < 1e-15) return {};
  return { direction: [vx / speed, vy / speed, vz / speed], attitudeMode: 'prograde' as AttitudeMode };
}),
```

- [ ] **Step 6: 删除 `setProgradeLock`，新增 `setAttitudeMode`**

删除第 103 行的 `setProgradeLock`：
```typescript
setProgradeLock: (locked) => set({ progradeLock: locked }),
```

替换为：
```typescript
setAttitudeMode: (mode) => set({ attitudeMode: mode }),
```

- [ ] **Step 7: 修改 `reset()` 中的初始状态**

修改第 86-92 行的 `reset`：

```typescript
reset: () => set(() => ({
  ...createSpaceshipState('earth', undefined, Date.now()),
  isRunning: true,
  dashboardExpanded: true,
  simulatedTime: Date.now(),
  attitudeMode: 'inertial' as AttitudeMode,
})),
```

- [ ] **Step 8: 提交**

```bash
git add src/stores/spaceshipStore.ts
git commit -m "feat: 替换 progradeLock 为 attitudeMode，支持三种姿态保持模式"
```

---

### Task 3: 动画循环 — 根据 attitudeMode 更新 direction

**Files:**
- Modify: `src/components/explore/ExploreCanvas.tsx`

- [ ] **Step 1: 修改 import，新增 AttitudeMode**

在第 8 行的 import 中新增 `AttitudeMode`：

找到：
```typescript
import type { SpaceshipState } from '../../types';
```

改为：
```typescript
import type { SpaceshipState, AttitudeMode } from '../../types';
```

- [ ] **Step 2: 替换 progradeLock 检查为 attitudeMode switch**

找到第 377-405 行的 `if (store.progradeLock) { ... }` 整个块，替换为：

```typescript
if (store.attitudeMode !== 'inertial') {
  const spPos = shipState.position;
  const spVel = shipState.velocity;
  let nearestDist = Infinity;
  let nearestPos: [number, number, number] = [0, 0, 0];
  let nearestVel: [number, number, number] = [0, 0, 0];

  for (const id of allIds) {
    if (!REAL_DATA[id]) continue;
    if (id === 'sun') {
      const dx = spPos[0], dy = spPos[1], dz = spPos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDist) { nearestDist = dist; nearestPos = [0, 0, 0]; nearestVel = [0, 0, 0]; }
    } else {
      const bs = computeBodyState(id, finalJd);
      if (!bs) continue;
      const dx = bs.position[0] - spPos[0], dy = bs.position[1] - spPos[1], dz = bs.position[2] - spPos[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDist) { nearestDist = dist; nearestPos = bs.position; nearestVel = bs.velocity; }
    }
  }

  if (store.attitudeMode === 'prograde') {
    const rvx = spVel[0] - nearestVel[0];
    const rvy = spVel[1] - nearestVel[1];
    const rvz = spVel[2] - nearestVel[2];
    const rv = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    if (rv > 1e-15) {
      store.setDirection([rvx / rv, rvy / rv, rvz / rv]);
    }
  } else if (store.attitudeMode === 'nadir') {
    const dx = nearestPos[0] - spPos[0];
    const dy = nearestPos[1] - spPos[1];
    const dz = nearestPos[2] - spPos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 1e-15) {
      store.setDirection([dx / dist, dy / dist, dz / dist]);
    }
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/ExploreCanvas.tsx
git commit -m "feat: 动画循环支持 attitudeMode 三种模式切换"
```

---

### Task 4: Dashboard UI — 添加模式按钮组

**Files:**
- Modify: `src/components/explore/Dashboard.tsx`

- [ ] **Step 1: 在 import 中新增 `AttitudeMode` 和 `setAttitudeMode` 用法**

在第 1 行 import 中新增 `AttitudeMode`：

```typescript
import type { AttitudeMode } from '../../types';
```

（注意：`Dashboard.tsx` 原本没有 import types，需要新增一行。）

在第 32-46 行 hooks 区域，新增 `attitudeMode` 和 `setAttitudeMode`：

在现有的 `const reset = useSpaceshipStore(s => s.reset);`（第 46 行）后面新增两行：

```typescript
const attitudeMode = useSpaceshipStore(s => s.attitudeMode);
const setAttitudeMode = useSpaceshipStore(s => s.setAttitudeMode);
```

- [ ] **Step 2: 替换「姿态 Q/E/R/F」和「⤓ 顺向」区域为按钮组**

找到第 271-296 行的整个 `<div className="dashboard-rotation-row">` 块，替换为：

```tsx
<div className="dashboard-rotation-row">
  <div className="dashboard-rotation-label">姿态 Q/E/R/F</div>
  <div className="dashboard-rotation-btns">
    <button className="dashboard-rot-btn"
      onMouseDown={() => startHold(() => yaw(RotationRate * 0.1))}
      onMouseUp={stopHold} onMouseLeave={stopHold}
    >↺左</button>
    <button className="dashboard-rot-btn"
      onMouseDown={() => startHold(() => pitch(RotationRate * 0.1))}
      onMouseUp={stopHold} onMouseLeave={stopHold}
    >↻上</button>
    <button className="dashboard-rot-btn"
      onMouseDown={() => startHold(() => pitch(-RotationRate * 0.1))}
      onMouseUp={stopHold} onMouseLeave={stopHold}
    >↻下</button>
    <button className="dashboard-rot-btn"
      onMouseDown={() => startHold(() => yaw(-RotationRate * 0.1))}
      onMouseUp={stopHold} onMouseLeave={stopHold}
    >↺右</button>
  </div>
  {isOrbiting && (
    <div className="dashboard-mode-row">
      <div className="dashboard-mode-label">保持模式</div>
      <div className="dashboard-mode-group">
        <button
          className={`dashboard-mode-btn${attitudeMode === 'inertial' ? ' active' : ''}`}
          onClick={() => setAttitudeMode('inertial' as AttitudeMode)}
        >惯性保持</button>
        <button
          className={`dashboard-mode-btn${attitudeMode === 'prograde' ? ' active' : ''}`}
          onClick={() => setAttitudeMode('prograde' as AttitudeMode)}
        >顺向保持</button>
        <button
          className={`dashboard-mode-btn${attitudeMode === 'nadir' ? ' active' : ''}`}
          onClick={() => setAttitudeMode('nadir' as AttitudeMode)}
        >对地指向</button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/Dashboard.tsx
git commit -m "feat: Dashboard 新增姿态保持模式三按钮组"
```

---

### Task 5: Dashboard CSS — 按钮组样式

**Files:**
- Modify: `src/components/explore/Dashboard.css`

- [ ] **Step 1: 在文件末尾新增模式按钮组样式**

在 `dashboard.css` 第 322 行之后，新增以下样式：

```css
/* ---- Attitude Mode Button Group ---- */

.dashboard-mode-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.dashboard-mode-label {
  font-size: 7px;
  color: #445566;
  text-align: center;
}

.dashboard-mode-group {
  display: flex;
  gap: 0;
  border-radius: 3px;
  overflow: hidden;
}

.dashboard-mode-btn {
  flex: 1;
  background: rgba(0, 180, 255, 0.06);
  border: 1px solid rgba(0, 180, 255, 0.12);
  border-right: none;
  font-size: 9px;
  color: #556677;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  padding: 4px 2px;
  transition: all 0.15s;
  text-align: center;
}

.dashboard-mode-btn:last-child {
  border-right: 1px solid rgba(0, 180, 255, 0.12);
}

.dashboard-mode-btn:hover {
  background: rgba(0, 180, 255, 0.15);
  color: #8899bb;
}

.dashboard-mode-btn.active {
  background: rgba(0, 255, 128, 0.18);
  border-color: rgba(0, 255, 128, 0.35);
  color: #00ff88;
  font-weight: bold;
}

.dashboard-mode-btn.active + .dashboard-mode-btn {
  border-left: none;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/explore/Dashboard.css
git commit -m "feat: 新增姿态保持模式按钮组样式"
```

---

### Task 6: 构建验证

**Files:** 无新建/修改（验证步骤）

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npm run build
```

预期：无类型错误，构建成功。

- [ ] **Step 2: 运行 lint 检查**

```bash
npm run lint
```

预期：无 lint 错误。
