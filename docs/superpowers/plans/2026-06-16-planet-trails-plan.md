# 行星运动轨迹渲染 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为运行中的行星画单色实线运动尾迹，支持开关和长度调节。

**Architecture:** 新增 `src/rendering/trails.ts`（TrailManager），预分配 BufferGeometry 环形缓冲区，每帧原地更新顶点无 GC。UI 状态在 uiStore，控件在 ControlPanel，生命周期在 Canvas3D 中衔接。

**Tech Stack:** React 18 + TypeScript + Three.js + Zustand

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | `UIState` 新增 `showTrails`、`trailLength` |
| `src/stores/uiStore.ts` | 修改 | 新增状态 + setter + reset 保留默认值 |
| `src/rendering/trails.ts` | **新增** | TrailManager 类：创建/更新/销毁/可见性/长度调节 |
| `src/components/canvas/Canvas3D.tsx` | 修改 | 初始化 TrailManager，动画循环/同步生命周期集成 |
| `src/components/controls/ControlPanel.tsx` | 修改 | 开关 checkbox + 长度滑块 |
| `src/components/controls/ControlPanel.css` | 修改 | 轨迹控件样式 |

---

### Task 1: 类型定义和 UIStore 状态

**Files:**
- Modify: `src/types/index.ts` — 在 `UIState` 末尾追加两个字段
- Modify: `src/stores/uiStore.ts` — 新增状态和 setter 方法

- [ ] **Step 1: 在 `UIState` 接口中添加轨迹字段**

在 `src/types/index.ts:99` 的 `mousePhysicalPos` 之后插入：

```typescript
  showTrails: boolean;
  trailLength: number;
```

- [ ] **Step 2: 在 `UIStore` 接口中添加 setter 方法**

在 `src/stores/uiStore.ts:16` 的 `resetUI` 之前插入：

```typescript
  setShowTrails: (show: boolean) => void;
  setTrailLength: (len: number) => void;
```

- [ ] **Step 3: 在 `create` 配置中添加初始状态和 setter**

在 `src/stores/uiStore.ts:30` 插入 `previewSpeed: 0,` 之后：

```typescript
  showTrails: true,
  trailLength: 0.5,
```

在 `src/stores/uiStore.ts:43` 插入 `setPreviewSpeed` 之后：

```typescript
  setShowTrails: (show) => set({ showTrails: show }),
  setTrailLength: (len) => set({ trailLength: len }),
```

- [ ] **Step 4: 确保 `resetUI` 保留轨迹配置（不重置用户偏好）**

`resetUI` 中不添加 `showTrails` 和 `trailLength` —— 这两个是用户偏好，重置时保留默认值。

- [ ] **Step 5: 运行类型检查**

```bash
npm run typecheck
```
预期：零错误。

- [ ] **Step 6: 提交**

```bash
git add src/types/index.ts src/stores/uiStore.ts
git commit -m "feat: add showTrails and trailLength state to uiStore"
```

---

### Task 2: 创建 TrailManager 渲染模块

**Files:**
- Create: `src/rendering/trails.ts`

- [ ] **Step 1: 创建 `src/rendering/trails.ts`**

写入以下完整代码：

```typescript
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { physicalToRender } from '../engine/coordinateTransform';
import { bodyMeshMap } from './bodies';

const MAX_POINTS = 500;

const PLANET_IDS = [
  'mercury', 'venus', 'earth', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune',
];

interface TrailEntry {
  line: THREE.Line;
  positions: Float32Array;
  writeIndex: number;
  activeCount: number;
}

function vec3Dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vec3Len(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export class TrailManager {
  private scene: THREE.Scene;
  private trails = new Map<string, TrailEntry>();
  private visible = true;
  private lengthProportion = 0.5;
  private lastPhysPositions = new Map<string, [number, number, number]>();
  private accumulatedDistances = new Map<string, number>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  addTrail(bodyId: string, color: number): void {
    if (this.trails.has(bodyId)) return;

    const positions = new Float32Array(MAX_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.visible = this.visible;
    line.renderOrder = 2;
    this.scene.add(line);

    this.trails.set(bodyId, {
      line,
      positions,
      writeIndex: 0,
      activeCount: 0,
    });
    this.lastPhysPositions.set(bodyId, [0, 0, 0]);
    this.accumulatedDistances.set(bodyId, 0);
  }

  removeTrail(bodyId: string): void {
    const entry = this.trails.get(bodyId);
    if (!entry) return;
    this.scene.remove(entry.line);
    entry.line.geometry.dispose();
    (entry.line.material as THREE.Material).dispose();
    this.trails.delete(bodyId);
    this.lastPhysPositions.delete(bodyId);
    this.accumulatedDistances.delete(bodyId);
  }

  clearAll(): void {
    for (const id of this.trails.keys()) {
      this.removeTrail(id);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const entry of this.trails.values()) {
      entry.line.visible = visible;
    }
  }

  setLengthProportion(proportion: number): void {
    this.lengthProportion = proportion;
    for (const [id, entry] of this.trails.entries()) {
      const pos = this.lastPhysPositions.get(id);
      if (pos) {
        const r = vec3Len(pos);
        const circumference = 2 * Math.PI * r;
        const margin = Math.max(1, (circumference * this.lengthProportion) / MAX_POINTS);
        const trailPhysLen = circumference * this.lengthProportion;
        const maxActive = Math.min(MAX_POINTS, Math.floor(trailPhysLen / margin));
        if (maxActive < entry.activeCount) {
          entry.activeCount = maxActive;
        }
      }
    }
  }

  updateTrails(bodies: CelestialBody[]): void {
    for (const body of bodies) {
      if (!PLANET_IDS.includes(body.templateId)) continue;

      let entry = this.trails.get(body.id);
      if (!entry) {
        const bm = bodyMeshMap.get(body.id);
        const mat = bm?.mesh.material;
        let color = 0x888888;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
          color = mat.color.getHex();
        }
        this.addTrail(body.id, color);
        entry = this.trails.get(body.id);
        if (!entry) continue;
      }

      const prevPos = this.lastPhysPositions.get(body.id) || body.position;
      const dist = vec3Dist(prevPos, body.position);
      let acc = (this.accumulatedDistances.get(body.id) || 0) + dist;

      const r = vec3Len(body.position);
      const circumference = 2 * Math.PI * r;
      const margin = Math.max(1, (circumference * this.lengthProportion) / MAX_POINTS);

      if (acc >= margin) {
        const renderPos = physicalToRender(body.position);
        this.appendSample(entry, renderPos);
        this.lastPhysPositions.set(body.id, [...body.position] as [number, number, number]);
        this.accumulatedDistances.set(body.id, 0);
      } else {
        this.accumulatedDistances.set(body.id, acc);
      }

      this.copyRingToGeometry(entry);
    }
  }

  dispose(): void {
    this.clearAll();
  }

  private appendSample(entry: TrailEntry, pos: [number, number, number]): void {
    const i = entry.writeIndex * 3;
    entry.positions[i] = pos[0];
    entry.positions[i + 1] = pos[1];
    entry.positions[i + 2] = pos[2];
    entry.writeIndex = (entry.writeIndex + 1) % MAX_POINTS;
    if (entry.activeCount < MAX_POINTS) {
      entry.activeCount++;
    }
  }

  private copyRingToGeometry(entry: TrailEntry): void {
    if (entry.activeCount === 0) return;

    const geomArray = entry.line.geometry.attributes.position.array as Float32Array;
    const start = entry.writeIndex >= entry.activeCount
      ? entry.writeIndex - entry.activeCount
      : MAX_POINTS - (entry.activeCount - entry.writeIndex);

    for (let i = 0; i < entry.activeCount; i++) {
      const src = ((start + i) % MAX_POINTS) * 3;
      const dst = i * 3;
      geomArray[dst] = entry.positions[src];
      geomArray[dst + 1] = entry.positions[src + 1];
      geomArray[dst + 2] = entry.positions[src + 2];
    }

    entry.line.geometry.attributes.position.needsUpdate = true;
    entry.line.geometry.setDrawRange(0, entry.activeCount);
  }
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```
预期：零错误。

- [ ] **Step 3: 提交**

```bash
git add src/rendering/trails.ts
git commit -m "feat: add TrailManager rendering module"
```

---

### Task 3: 在 Canvas3D 中集成 TrailManager

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx`

- [ ] **Step 1: 导入 TrailManager**

在 `src/components/canvas/Canvas3D.tsx:8` 的 `interaction` import 之后，插入：

```typescript
import { TrailManager } from '../../rendering/trails';
```

- [ ] **Step 2: 从 uiStore 读取轨迹状态**

在 `src/components/canvas/Canvas3D.tsx:47` 的 `previewSpeed` 解构之后，插入：

```typescript
  const showTrails = useUIStore(s => s.showTrails);
  const trailLength = useUIStore(s => s.trailLength);
```

- [ ] **Step 3: 添加 TrailManager ref**

在 `src/components/canvas/Canvas3D.tsx:25` 的 `prevTargetIdRef` 之后，插入：

```typescript
  const trailManagerRef = useRef<TrailManager | null>(null);
```

- [ ] **Step 4: 在场景初始化后创建 TrailManager**

在 `src/components/canvas/Canvas3D.tsx:163` 的 `createReferencePlane` 调用之后，插入：

```typescript
    const trailManager = new TrailManager(setup.scene);
    trailManagerRef.current = trailManager;
```

- [ ] **Step 5: 在清理函数中销毁 TrailManager**

在 `src/components/canvas/Canvas3D.tsx:164` 的 return 中的 `cancelAnimationFrame` 之后、`setSharedCamera(null)` 之前，插入：

```typescript
      trailManager.dispose();
      trailManagerRef.current = null;
```

- [ ] **Step 6: 在 syncBodies 中管理轨迹生命周期**

替换 `src/components/canvas/Canvas3D.tsx:62-71` 的 `syncBodies` 函数为：

```typescript
  const syncBodies = useCallback(() => {
    if (!setupRef.current) return;
    const scene = setupRef.current.scene;
    const tm = trailManagerRef.current;
    const storeIds = new Set(bodies.map(b => b.id));
    for (const [id] of bodyMeshMap) {
      if (!storeIds.has(id)) {
        removeBodyMesh(id, scene);
        if (tm) tm.removeTrail(id);
      }
    }
    for (const body of bodies) {
      if (!bodyMeshMap.has(body.id)) createBodyMesh(body, scene);
    }
  }, [bodies]);
```

- [ ] **Step 7: 在动画循环中更新轨迹**

在 `src/components/canvas/Canvas3D.tsx:108` 的 `updateBodyMeshes(bodies, dt);` 之后，插入：

```typescript
      if (showTrails && isRunning && trailManagerRef.current) {
        trailManagerRef.current.updateTrails(bodies);
      }
```

- [ ] **Step 8: 同步 TrailManager 的 visible 和 length 状态**

在 `src/components/canvas/Canvas3D.tsx:108` 之上（但在 useEffect 回调体内），追加如下 effect：

这个已经在 Store 层面和 effect 中处理了。我们需要一个独立 useEffect 来同步 showTrails/trailLength 到 TrailManager：

在 `src/components/canvas/Canvas3D.tsx:77` 的 `[syncBodies]` effect 之后，插入：

```typescript
  useEffect(() => {
    if (trailManagerRef.current) {
      trailManagerRef.current.setVisible(showTrails);
    }
  }, [showTrails]);

  useEffect(() => {
    if (trailManagerRef.current) {
      trailManagerRef.current.setLengthProportion(trailLength);
    }
  }, [trailLength]);
```

- [ ] **Step 9: 运行类型检查**

```bash
npm run typecheck
```
预期：零错误。

- [ ] **Step 10: 提交**

```bash
git add src/components/canvas/Canvas3D.tsx
git commit -m "feat: integrate TrailManager into Canvas3D"
```

---

### Task 4: 在 ControlPanel 中添加轨迹控件

**Files:**
- Modify: `src/components/controls/ControlPanel.tsx`
- Modify: `src/components/controls/ControlPanel.css`

- [ ] **Step 1: 从 uiStore 解构轨迹状态**

在 `src/components/controls/ControlPanel.tsx:15` 的 `uiStore` 变量之后，插入：

```typescript
  const showTrails = useUIStore(s => s.showTrails);
  const trailLength = useUIStore(s => s.trailLength);
```

- [ ] **Step 2: 在监督/提示按钮区域之后添加轨迹控件**

在 `src/components/controls/ControlPanel.tsx:250` 的监督/提示按钮 section 结束 `</div>` 之后，在撤销/重做 section 之前，插入：

```tsx
      <div className="panel-section trail-controls">
        <label className="trail-toggle">
          <input
            type="checkbox"
            checked={showTrails}
            onChange={e => uiStore.setShowTrails(e.target.checked)}
            disabled={isAutoBuilding}
          />
          <span>显示轨迹</span>
        </label>
        {showTrails && (
          <div className="trail-length-row">
            <span className="trail-length-label">轨迹长度 {trailLength.toFixed(1)}</span>
            <input
              type="range"
              className="trail-length-slider"
              min="0.1"
              max="1.0"
              step="0.1"
              value={trailLength}
              onChange={e => uiStore.setTrailLength(parseFloat(e.target.value))}
              disabled={isAutoBuilding}
            />
          </div>
        )}
      </div>
```

插入位置：在 Line 250 的 `</div>`（监督/提示 section 的 closing `</div>`）之后，Line 252 的 `<div className="panel-section button-row">`（撤销/重做 section）之前。

- [ ] **Step 3: 在 ControlPanel.css 末尾追加轨迹控件样式**

```css
.trail-controls {
  padding: 8px 0;
}

.trail-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.trail-toggle input[type="checkbox"] {
  accent-color: #4488ff;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.trail-toggle span {
  font-size: 12px;
  color: #ccc;
}

.trail-length-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.trail-length-label {
  font-size: 11px;
  color: #888;
}

.trail-length-slider {
  width: 100%;
  height: 4px;
  accent-color: #4488ff;
  cursor: pointer;
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```
预期：零错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/controls/ControlPanel.tsx src/components/controls/ControlPanel.css
git commit -m "feat: add trail toggle and length slider to ControlPanel"
```

---

### Task 5: 最终验证

- [ ] **Step 1: 运行完整类型检查**

```bash
npm run typecheck
```
预期：零错误。

- [ ] **Step 2: 构建验证**

```bash
npm run build
```
预期：构建成功，无错误。

- [ ] **Step 3: 手动验证清单**

启动 `npm run dev`，验证以下场景：

1. 放置太阳 + 几个行星 → 启动模拟 → 行星后出现轨迹线（与行星同色半透明）
2. 暂停模拟 → 轨迹保留在当前位置不动
3. 恢复模拟 → 轨迹继续延伸
4. 关闭「显示轨迹」开关 → 轨迹线消失
5. 重新打开开关 → 轨迹线恢复
6. 拖动长度滑块 → 轨迹长度实时变化（减小立即可见，增大需等待新采样）
7. 删除行星 → 对应轨迹消失
8. 新建 → 所有轨迹清除
9. 太阳不显示轨迹
10. 卫星（月球等）不显示轨迹

- [ ] **Step 4: 提交验证结果**

无代码变更时无需提交。
