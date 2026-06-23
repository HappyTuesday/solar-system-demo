# 目标锁定与指向 — 设计文档

## 背景

当前保持模式仅「对地指向」可指向最近天体。用户希望能主动指定一个目标天体，飞船船头始终指向该天体中心，且能在导航图中直观看到目标位置。

## 需求

### 目标锁定能力

- 用户可主动选择任意太阳系天体（太阳 + 8 大行星）作为目标
- 锁定后，飞船方向始终指向该天体中心（新保持模式 `'target'`）
- 切换为其他保持模式（惯性/顺向）时，目标天体不重置，可随时切回
- 「清除目标」后指向模式失效，保持模式回退到「惯性」

### Dashboard 调整

- 面板加宽加高：宽度 960px → 1100px，高度增加约 30%
- 飞行控制区新增「目标天体」行：显示当前目标名称 + 「设置目标」按钮 + 「清除」按钮
- 点击「设置目标」弹出选择对话框，列出 9 个天体，含名称、距离、方位
- 保持模式改为动态显示：
  - 始终显示：惯性保持（默认选中）
  - 绕飞时：顺向保持
  - 设置目标后：指向{目标天体名称}
- 移除原有的「对地指向」按钮

### MiniMap 脉冲光晕

- 锁定目标后，导航图中目标天体向外间歇辐射脉冲光晕
- 绕飞状态（MiniMap 已缩放至该天体）时不显示脉冲
- 效果：2-3 圈半透明渐隐圆环，颜色使用天体本色，alpha 在 0.1-0.5 间正弦波呼吸（周期约 1.5s）

---

## 设计

### 1. 类型定义

```typescript
// src/types/index.ts
export type AttitudeMode = 'inertial' | 'prograde' | 'nadir' | 'target';
```

新增 `'target'` 模式，`SpaceshipState` 本身不变。

### 2. Store 层 (`spaceshipStore.ts`)

**新增状态：**
- `targetBodyId: string | null` — 目标天体 ID

**新增操作：**
- `setTargetBody(id: string | null)` — 设置目标天体。若 `id !== null`，同时将 `attitudeMode` 设为 `'target'`；若 `id === null`（清除），将 `attitudeMode` 切回 `'inertial'`

**修改：**
- `reset()` — 清除 `targetBodyId`
- `yaw()` / `pitch()` — 将 `attitudeMode` 设为 `'inertial'`（已有行为，不变）

**接口：**

```typescript
export interface SpaceshipStore extends SpaceshipState {
  // ... 现有字段
  targetBodyId: string | null;
  setTargetBody: (id: string | null) => void;
}
```

### 3. 动画循环 (`ExploreCanvas.tsx`)

在 `if (store.attitudeMode !== 'inertial')` 分支中新增 `'target'` case：

```typescript
} else if (store.attitudeMode === 'target' && store.targetBodyId) {
  const targetPos = computeTargetBodyPosition(store.targetBodyId, finalJd);
  if (targetPos) {
    const dx = targetPos[0] - spPos[0];
    const dy = targetPos[1] - spPos[1];
    const dz = targetPos[2] - spPos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 1e-15) {
      store.setDirection([dx / dist, dy / dist, dz / dist]);
    }
  }
}
```

- `computeTargetBodyPosition(id, jd)` 复用现有 `computeBodyState()` 逻辑
- 若目标天体 ID 无效（不存在于 REAL_DATA），不调整方向

### 4. Dashboard 改动 (`Dashboard.tsx` + `Dashboard.css`)

#### 尺寸调整

- `dashboard-panel` 宽度：960px → 1100px
- `dashboard-panel` 高度：padding 由 `14px 18px 16px` → `18px 22px 20px`
- 各内部元素按比例放大

#### 保持模式按钮组重做

不再硬编码三个按钮，改为动态渲染：

```tsx
<div className="dashboard-mode-group">
  <button className={`mode-btn${attitudeMode === 'inertial' ? ' active' : ''}`}
    onClick={() => setAttitudeMode('inertial')}>惯性保持</button>
  {isOrbiting && (
    <button className={`mode-btn${attitudeMode === 'prograde' ? ' active' : ''}`}
      onClick={() => setAttitudeMode('prograde')}>顺向保持</button>
  )}
  {targetBodyId && targetBodyName && (
    <button className={`mode-btn${attitudeMode === 'target' ? ' active' : ''}`}
      onClick={() => setAttitudeMode('target')}>指向{targetBodyName}</button>
  )}
</div>
```

- 保持模式标签和按钮组**始终渲染**（不再受 `isOrbiting` 限制），因为惯性保持需要始终可见
- `targetBodyName` 通过 `REAL_DATA[targetBodyId]?.name` 获取

#### 新增「目标天体」行（在旋转按钮下方、保持模式上方）

```tsx
<div className="dashboard-target-row">
  <div className="dashboard-mode-label">目标天体</div>
  <div className="dashboard-target-info">
    {targetBodyId ? (
      <>
        <span className="target-name">{targetBodyName}</span>
        <button className="dashboard-target-ctl-btn"
          onClick={() => store.clearTarget()}>清除</button>
      </>
    ) : (
      <span className="target-name" style={{ color: '#445566' }}>未设置</span>
    )}
    <button className="dashboard-target-ctl-btn"
      onClick={() => setShowTargetModal(true)}>设置目标</button>
  </div>
</div>
```

### 5. 目标选择对话框

新增 `TargetSelectionModal` 组件（放在 `components/explore/` 下）：

- 背景遮罩 + 居中面板
- 面板内列出 9 个天体，每行显示：
  - 颜色圆点（`BODY_COLORS[id]`）
  - 天体名称
  - 距飞船距离（AU / km）
  - 方位角
- 当前已选目标高亮
- 点击某行即调用 `setTargetBody(id)`，自动关闭
- 点击遮罩或关闭按钮关闭

距离和方位通过 Dashboard 中已有的 `computeBodyStateFull()` 逻辑计算。

### 6. MiniMap 脉冲光晕 (`MiniMap.tsx`)

在 MiniMap 的 `draw()` 函数中，绘制完天体后、绘制飞船前，新增目标天体脉冲光晕：

```typescript
// Pulse glow on target body (skip when zoomed into orbiting body)
const sp = useSpaceshipStore.getState();
if (sp.targetBodyId && !(isZoomed && nearestId === sp.targetBodyId)) {
  const targetBody = bodies.find(b => b.id === sp.targetBodyId);
  if (targetBody && targetBody.inView) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004); // ~1.5s period
    const alpha = 0.1 + 0.4 * pulse;
    for (let ring = 0; ring < 3; ring++) {
      const radius = SUN_RADIUS_PX + (ring + 1) * 4;
      ctx.beginPath();
      ctx.arc(targetBody.sx, targetBody.sy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = targetBody.color.replace(')', `, ${alpha * (1 - ring * 0.3)})`).replace('rgb', 'rgba');
      if (targetBody.color.startsWith('#')) {
        // fallback: use rgba from hex conversion
        ctx.strokeStyle = rgbaFromHex(targetBody.color, alpha * (1 - ring * 0.3));
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
```

- 脉冲周期约 1.57 秒（`Math.sin(performance.now() * 0.004)`）
- 3 层圆环，半径依次增加 4px
- alpha 范围 0.1-0.5，外层渐隐
- 绕飞时（`isZoomed && nearestId === targetBodyId`）不显示

### 7. 受影响的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/types/index.ts` | 改动 | `AttitudeMode` 新增 `'target'` |
| `src/stores/spaceshipStore.ts` | 改动 | 新增 `targetBodyId`、`setTargetBody`；`reset` 清除 |
| `src/components/explore/ExploreCanvas.tsx` | 改动 | 动画循环新增 `'target'` case |
| `src/components/explore/Dashboard.tsx` | 改动 | 动态保持模式、目标天体行、对话框触发 |
| `src/components/explore/Dashboard.css` | 改动 | 尺寸调整、新增样式 |
| `src/components/explore/TargetSelectionModal.tsx` | 新增 | 目标选择对话框 |
| `src/components/explore/TargetSelectionModal.css` | 新增 | 对话框样式 |
| `src/components/explore/MiniMap.tsx` | 改动 | 新增脉冲光晕渲染 |

### 8. 行为边界

- **目标不存在于 REAL_DATA**：不调整方向，不崩溃
- **目标天体 ID 为 null**：保持模式可设置为 `'target'` 但实际无指向效果
- **reset 时**：清除 `targetBodyId`，`attitudeMode` 重置为 `'inertial'`
- **切换保持模式**：目标天体 ID 不变化，只改变 `attitudeMode`
- **清除目标**：`attitudeMode` 切回 `'inertial'`
- **手动旋转**：`attitudeMode` 切回 `'inertial'`（已有行为），目标 ID 不变
