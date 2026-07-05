# 飞行控制档位切换器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在探索模式 Dashboard 中缩小推力滑块，新增 D/N/R 三档位切换器按钮

**Architecture:** Zustand store 新增 `gear` 状态 + `setGear` action；Dashboard 组件将滑块和档位按钮放在同一行，档位变化时联动更新 `thrust[0]`

**Tech Stack:** React + TypeScript + Zustand

---

### Task 1: Store 层 — 新增 gear 状态和 setGear action

**Files:**
- Modify: `src/stores/spaceshipStore.ts`

- [ ] **Step 1: 在 SpaceshipStore interface 中新增 gear 类型和字段**

在 `explosionPhase` 类型定义之后（第9行后），新增 `Gear` 类型：

```typescript
export type ExplosionPhase = 'none' | 'exploding' | 'complete';
export type Gear = 'D' | 'N' | 'R';
```

在 interface 中（`explosionPhase` 字段后、`totalDistanceKm` 前），新增字段：

```typescript
  gear: Gear;
```

在 interface actions 区域（`setExplosionPhase` 之后），新增 action 声明：

```typescript
  setGear: (g: Gear) => void;
```

- [ ] **Step 2: 在 initialState 中添加 gear 默认值**

```typescript
  explosionPhase: 'none' as ExplosionPhase,
  gear: 'D' as Gear,
```

- [ ] **Step 3: 实现 setGear action**

在 `setExplosionPhase` 实现之后，新增：

```typescript
  setGear: (g) => set(s => ({
    gear: g,
    thrust: [
      g === 'N' ? 0 : g === 'R' ? (s.thrustMagnitude > 0 ? -1 : 0) : (s.thrustMagnitude > 0 ? 1 : 0),
      s.thrust[1],
      s.thrust[2],
    ] as [number, number, number],
  })),
```

- [ ] **Step 4: 在 reset 方法中添加 gear 重置**

在 `reset` 返回对象中，`explosionPhase: 'none'` 之后添加：

```typescript
            gear: 'D' as Gear,
```

- [ ] **Step 5: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add src/stores/spaceshipStore.ts
git commit -m "feat: add gear state and setGear action to spaceshipStore"
```

---

### Task 2: UI 层 — Dashboard 组件档位按钮和滑块缩小

**Files:**
- Modify: `src/components/explore/Dashboard.tsx`

- [ ] **Step 1: 读取 gear 状态并更新 updateThrustFromClientX**

将 Dashboard 组件中的现有滑块逻辑改为联动档位。在组件顶部解构中添加 `gear` 和 `setGear`：

```typescript
  const gear = useSpaceshipStore(s => s.gear);
  const setGear = useSpaceshipStore(s => s.setGear);
```

修改 `updateThrustFromClientX` 回调，根据档位设置 forwardThrust：

```typescript
  const updateThrustFromClientX = useCallback((clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
    setThrustMagnitude(pct);
    const currentGear = useSpaceshipStore.getState().gear;
    if (currentGear === 'N') {
      setForwardThrust(0);
    } else if (currentGear === 'R') {
      setForwardThrust(pct > 0 ? -1 : 0);
    } else {
      setForwardThrust(pct > 0 ? 1 : 0);
    }
  }, [setThrustMagnitude, setForwardThrust]);
```

- [ ] **Step 2: 替换推力滑块行，增加档位按钮**

将现有的推力滑块行（第119-129行）替换为滑块 + 档位按钮同一行的布局：

```tsx
              <div className="dashboard-thrust-gear-row">
                <div className="dashboard-thrust-row" ref={sliderTrackRef}
                  onMouseDown={handleTrackMouseDown}
                  onTouchStart={handleTrackTouchStart}>
                  <div className="dashboard-thrust-track" />
                  <div className="dashboard-thrust-fill" style={{ width: `${thrustMagnitude}%` }} />
                  <div className="dashboard-thrust-thumb" style={{ left: `${thrustMagnitude}%` }} />
                  <div className="dashboard-thrust-labels">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <div className="dashboard-gear-separator" />
                <div className="dashboard-gear-buttons">
                  <button className={`dashboard-gear-btn gear-d${gear === 'D' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('D'); }}
                  >D</button>
                  <button className={`dashboard-gear-btn gear-n${gear === 'N' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('N'); }}
                  >N</button>
                  <button className={`dashboard-gear-btn gear-r${gear === 'R' ? ' active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setGear('R'); }}
                  >R</button>
                </div>
              </div>
```

同时将推力值显示改为带档位信息的显示（第129行）：

```tsx
              <div className="dashboard-thrust-value">
                推力 {thrustMagnitude} MN
                {gear === 'N' && <span className="gear-indicator"> [N]</span>}
                {gear === 'R' && <span className="gear-indicator reverse"> [R]</span>}
              </div>
```

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/Dashboard.tsx
git commit -m "feat: add D/N/R gear shifter buttons to Dashboard"
```

---

### Task 3: 样式层 — 档位按钮和缩小滑块样式

**Files:**
- Modify: `src/components/explore/Dashboard.css`

- [ ] **Step 1: 缩小推力滑块样式**

修改 `.dashboard-thrust-row` 高度：

```css
.dashboard-thrust-row {
  position: relative;
  height: 14px;
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 2: 新增档位行、分隔线和按钮样式**

在 thrust slider 样式区域之后、control pads 样式之前，新增：

```css
/* ---- Thrust + Gear row ---- */
.dashboard-thrust-gear-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dashboard-gear-separator {
  width: 0;
  height: 18px;
  border-left: 1px solid rgba(0, 180, 255, 0.15);
  flex-shrink: 0;
}

.dashboard-gear-buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.dashboard-gear-btn {
  width: 22px;
  height: 18px;
  background: rgba(0, 180, 255, 0.06);
  border: 1px solid rgba(0, 180, 255, 0.1);
  border-radius: 2px;
  font-family: inherit;
  font-size: 8px;
  font-weight: bold;
  color: #556677;
  cursor: pointer;
  user-select: none;
  padding: 0;
  transition: all 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-gear-btn:hover {
  background: rgba(0, 180, 255, 0.15);
  color: #8899bb;
}

.dashboard-gear-btn.gear-d.active {
  background: rgba(0, 255, 128, 0.15);
  border-color: rgba(0, 255, 128, 0.25);
  color: #00ff88;
}

.dashboard-gear-btn.gear-n.active {
  background: rgba(255, 200, 0, 0.12);
  border-color: rgba(255, 200, 0, 0.2);
  color: #ffcc00;
}

.dashboard-gear-btn.gear-r.active {
  background: rgba(255, 80, 50, 0.15);
  border-color: rgba(255, 80, 50, 0.25);
  color: #ff5535;
}

.gear-indicator {
  color: #88ccff;
}

.gear-indicator.reverse {
  color: #ff5535;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/explore/Dashboard.css
git commit -m "style: reduce thrust slider height and add gear button styles"
```

---

### Task 4: 验证

- [ ] **Step 1: 运行 lint**

```bash
npm run lint
```

Expected: 无新增 lint 错误

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
npm run build
```

Expected: 构建成功，无类型错误

- [ ] **Step 3: 运行开发服务器人工验证**

```bash
npm run dev
```

打开探索模式页面，验证：
1. 推力滑块变窄，与档位按钮在同一行
2. 点击 D/N/R 可切换档位，当前档位高亮颜色正确
3. N 档：拖动滑块到任意位置，飞船无推力
4. D 档：滑块 > 0 时飞船向前加速
5. R 档：滑块 > 0 时飞船向后加速，但船头方向不变
6. 在 N 档拖动滑块到 50%，然后切到 R 档，飞船应立即反向加速

- [ ] **Step 4: 提交（如有小修复）**

```bash
git add -A
git commit -m "fix: final adjustments for gear shifter"
```
