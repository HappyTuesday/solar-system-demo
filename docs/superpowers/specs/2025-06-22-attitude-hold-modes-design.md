# 飞船姿态保持模式 — 设计文档

## 背景

探索模式中，飞船当前仅有 `progradeLock: boolean` 控制是否自动朝向相对速度切线方向（顺向）。需要扩展为三种姿态保持模式，与真实航天器姿态控制模式对齐。

## 需求

### 三种姿态保持模式

| 模式 | 标识 | 行为 | 默认 |
|------|------|------|------|
| 惯性保持 | `inertial` | 不自动调整方向，保持当前姿态 | 是 |
| 顺向保持 | `prograde` | 方向自动跟随相对速度切线（现有 progradeLock 行为） | 否 |
| 对地指向 | `nadir` | 方向指向最近天体中心（船头朝向行星） | 否 |

### UI 交互

- 在 Dashboard「飞行控制」栏中，用三按钮组显示当前模式，点击可切换
- 按钮组仅在飞船进入绕飞状态（`isOrbiting === true`）时显示
- 手动旋转姿态（Q/E/R/F 键或仪表盘旋转按钮）时自动切回「惯性保持」

## 设计

### 1. 类型定义

```typescript
// src/types/index.ts — 新增
export type AttitudeMode = 'inertial' | 'prograde' | 'nadir';
```

`SpaceshipState` 本身不变（不含 attitudeMode），attitudeMode 仅存在于 Store 层。

### 2. Store 层 (`spaceshipStore.ts`)

**变更：**

- **移除** `progradeLock: boolean`
- **新增** `attitudeMode: AttitudeMode`，默认值 `'inertial'`
- **新增** `setAttitudeMode(mode: AttitudeMode): void` — 统一设置保持模式
- **保留** `setToPrograde(): void` — 改为调用 `setAttitudeMode('prograde')`（向后兼容）
- **修改** `yaw()` / `pitch()` — 内部调用 `setAttitudeMode('inertial')`
- **修改** `reset()` — `attitudeMode` 重置为 `'inertial'`

**接口：**

```typescript
export interface SpaceshipStore extends SpaceshipState {
  // ... 其他字段
  attitudeMode: AttitudeMode;
  setAttitudeMode: (mode: AttitudeMode) => void;
  // setToPrograde 保留，内部转发到 setAttitudeMode('prograde')
}
```

### 3. 动画循环 (`ExploreCanvas.tsx`)

将原来 `if (store.progradeLock) { ... }` 替换为 `switch(store.attitudeMode)`：

```typescript
switch (store.attitudeMode) {
  case 'prograde': {
    // 现有 progradeLock 逻辑：找最近天体，direction = normalize(relativeVelocity)
    break;
  }
  case 'nadir': {
    // 找最近天体位置 nearestPos
    // direction = normalize(nearestPos - shipPos)
    break;
  }
  case 'inertial':
  default:
    // 不自动调整
    break;
}
```

**对地指向细节：** 方向向量 = `(nearestBody.position - ship.position)`，归一化后船头朝向行星中心。

### 4. Dashboard 改动 (`Dashboard.tsx` + `Dashboard.css`)

**新增按钮组，仅在 `isOrbiting === true` 时渲染：**

```tsx
{isOrbiting && (
  <div className="dashboard-mode-row">
    <div className="dashboard-mode-label">保持模式</div>
    <div className="dashboard-mode-group">
      <button className={`mode-btn ${attitudeMode === 'inertial' ? 'active' : ''}`}
        onClick={() => setAttitudeMode('inertial')}>惯性保持</button>
      <button className={`mode-btn ${attitudeMode === 'prograde' ? 'active' : ''}`}
        onClick={() => setAttitudeMode('prograde')}>顺向保持</button>
      <button className={`mode-btn ${attitudeMode === 'nadir' ? 'active' : ''}`}
        onClick={() => setAttitudeMode('nadir')}>对地指向</button>
    </div>
  </div>
)}
```

- 按钮组放置在「飞行控制」栏，替换原有 `⤓ 顺向` 按钮的位置
- 激活按钮使用绿色高亮（与现有 `prograde-btn` 风格一致），未激活按钮使用默认暗色
- 保留 Q/E/R/F 旋转按钮，按任意旋转按钮时自动切回惯性保持

### 5. 受影响的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/types/index.ts` | 新增类型 | 导出 `AttitudeMode` |
| `src/stores/spaceshipStore.ts` | 改动 | 替换 progradeLock 为 attitudeMode |
| `src/components/explore/ExploreCanvas.tsx` | 改动 | 动画循环中 switch attitudeMode |
| `src/components/explore/Dashboard.tsx` | 改动 | 新增按钮组，移除单按钮 |
| `src/components/explore/Dashboard.css` | 新增样式 | 按钮组样式 |

### 6. 行为边界

- **飞船远离天体时（`!isOrbiting`）：** 按钮组隐藏，姿态默认惯性保持，manual yaw/pitch 仍可用
- **reset 时：** `attitudeMode` 重置为 `'inertial'`
- **爆炸后重新出发：** 同上，默认惯性保持
- **prograde/nadir 模式下最近天体变化：** 自动跟随新的最近天体（如从地球轨道进入月球引力范围）
