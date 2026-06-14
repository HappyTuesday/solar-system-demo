# 天体状态悬浮窗 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在画布右下角增加一个半透明毛玻璃悬浮窗，实时显示已放置天体的距离/角度/速度，支持点击选中，移除现有矩形框选功能。

**Architecture:** 新增 `BodyStatusPanel` 组件，订阅 `buildStore.simulatedTime`（触发实时更新）和 `buildStore.bodies`，通过 `CELESTIAL_TEMPLATES` 查找父天体，计算距离/角度/速度。画布中移除 `selectionRef`、`selectionRect` 状态及 `selectBodiesInRect` 函数。

**Tech Stack:** React 18 + TypeScript + Zustand + CSS

**Files to create:**
- `src/components/canvas/BodyStatusPanel.tsx`
- `src/components/canvas/BodyStatusPanel.css`

**Files to modify:**
- `src/App.tsx`
- `src/components/canvas/Canvas3D.tsx`
- `src/components/canvas/Canvas3D.css`
- `src/rendering/interaction.ts`

---

### Task 1: Create BodyStatusPanel component

**Files:**
- Create: `src/components/canvas/BodyStatusPanel.tsx`
- Create: `src/components/canvas/BodyStatusPanel.css`

- [ ] **Step 1: Write BodyStatusPanel.css**

```css
.body-status-panel {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 220px;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(10, 10, 30, 0.55);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 0;
  z-index: 10;
  user-select: none;
}

.body-status-panel::-webkit-scrollbar {
  width: 4px;
}

.body-status-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.body-status-title {
  color: #aaa;
  font-size: 11px;
  padding: 0 12px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 4px;
}

.body-status-empty {
  color: #666;
  font-size: 12px;
  padding: 12px;
  text-align: center;
}

.body-status-item {
  display: flex;
  flex-direction: column;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 2px solid transparent;
}

.body-status-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.body-status-item.selected {
  background: rgba(68, 136, 255, 0.2);
  border-left-color: rgba(68, 136, 255, 0.6);
}

.body-status-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ddd;
}

.body-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.body-status-name {
  font-weight: 500;
}

.body-status-data {
  font-size: 11px;
  color: #999;
  font-family: monospace;
  padding-left: 14px;
  line-height: 1.5;
}
```

- [ ] **Step 2: Write BodyStatusPanel.tsx**

```typescript
import { useState, useEffect, useRef } from 'react';
import { useBuildStore } from '../../stores/buildStore';
import { useUIStore } from '../../stores/uiStore';
import { CELESTIAL_TEMPLATES } from '../../engine/constants';
import type { CelestialBody } from '../../types';
import './BodyStatusPanel.css';

const BODY_COLORS: Record<string, string> = {
  sun: '#ffdd00',
  mercury: '#cccccc',
  venus: '#ffcc88',
  earth: '#4488ff',
  mars: '#ff6644',
  jupiter: '#ffcc88',
  saturn: '#ffeecc',
  uranus: '#88ccff',
  neptune: '#4488ff',
  moon: '#cccccc',
  io: '#ffcc44',
  europa: '#ddccbb',
  ganymede: '#bbbbbb',
  callisto: '#888888',
  titan: '#ffcc88',
  phobos: '#998877',
  deimos: '#887766',
};

const TEMPLATE_ORDER: Record<string, number> = {};
CELESTIAL_TEMPLATES.forEach((t, i) => {
  TEMPLATE_ORDER[t.id] = i;
});

interface BodyDisplayData {
  id: string;
  templateId: string;
  name: string;
  color: string;
  distance: string;
  angle: string;
  speed: string;
}

function formatDistance(meters: number): string {
  if (meters >= 1e12) return `${(meters / 1.495978707e11).toFixed(1)} AU`;
  if (meters >= 1e9) return `${(meters / 1e9).toFixed(1)} 百万 km`;
  if (meters >= 1e6) return `${(meters / 1e3).toFixed(0)} km`;
  return `${meters.toFixed(0)} m`;
}

function formatSpeed(mps: number): string {
  if (mps >= 1000) return `${(mps / 1000).toFixed(1)} km/s`;
  return `${mps.toFixed(0)} m/s`;
}

function computeDisplayData(bodies: CelestialBody[]): BodyDisplayData[] {
  const bodyMap = new Map<string, CelestialBody>();
  for (const b of bodies) {
    bodyMap.set(b.templateId, b);
  }

  return bodies
    .map((body): BodyDisplayData => {
      const template = CELESTIAL_TEMPLATES.find(t => t.id === body.templateId);
      const parentId = template?.parentId;
      const parent = parentId ? bodyMap.get(parentId) : undefined;
      const speed = Math.sqrt(
        body.velocity[0] ** 2 + body.velocity[1] ** 2 + body.velocity[2] ** 2
      );

      let distance = '-';
      let angle = '-';

      if (parentId && parent) {
        const dx = body.position[0] - parent.position[0];
        const dy = body.position[1] - parent.position[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        distance = formatDistance(dist);

        const angleRad = Math.atan2(dy, dx);
        const angleDeg = ((angleRad / Math.PI) * 180 + 360) % 360;
        angle = `${angleDeg.toFixed(0)}°`;
      } else if (!parentId) {
        distance = '-';
        angle = '-';
      }

      return {
        id: body.id,
        templateId: body.templateId,
        name: template?.name ?? body.templateId,
        color: BODY_COLORS[body.templateId] ?? '#888888',
        distance,
        angle,
        speed: formatSpeed(speed),
      };
    })
    .sort((a, b) => {
      const orderA = TEMPLATE_ORDER[a.templateId] ?? 999;
      const orderB = TEMPLATE_ORDER[b.templateId] ?? 999;
      return orderA - orderB;
    });
}

export default function BodyStatusPanel() {
  const bodies = useBuildStore(s => s.bodies);
  const simulatedTime = useBuildStore(s => s.simulatedTime);
  const selectedBodyIds = useUIStore(s => s.selectedBodyIds);
  const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);

  const [displayData, setDisplayData] = useState<BodyDisplayData[]>([]);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (bodies.length > 0 && now - lastUpdateRef.current < 100) return;
    lastUpdateRef.current = now;
    setDisplayData(computeDisplayData(bodies));
  }, [bodies, simulatedTime]);

  const handleClick = (id: string) => {
    if (selectedBodyIds.includes(id)) {
      setSelectedBodyIds([]);
    } else {
      setSelectedBodyIds([id]);
    }
  };

  if (bodies.length === 0) {
    return (
      <div className="body-status-panel">
        <div className="body-status-title">天体状态</div>
        <div className="body-status-empty">尚未放置天体</div>
      </div>
    );
  }

  return (
    <div className="body-status-panel">
      <div className="body-status-title">天体状态</div>
      {displayData.map(item => {
        const isSelected = selectedBodyIds.includes(item.id);
        const hasParentData = item.distance !== '-';

        return (
          <div
            key={item.id}
            className={`body-status-item${isSelected ? ' selected' : ''}`}
            onClick={() => handleClick(item.id)}
          >
            <div className="body-status-item-header">
              <span className="body-status-dot" style={{ backgroundColor: item.color }} />
              <span className="body-status-name">{item.name}</span>
            </div>
            <div className="body-status-data">
              {hasParentData ? (
                <>距离: {item.distance} &nbsp; 角度: {item.angle}<br /></>
              ) : null}
              速度: {item.speed}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck to verify no issues**

```bash
npm run typecheck
```

Expected: PASS (or TS errors from files not yet modified — that's fine, this task only creates new files)

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/BodyStatusPanel.tsx src/components/canvas/BodyStatusPanel.css
git commit -m "feat: add BodyStatusPanel component for body status display and selection"
```

---

### Task 2: Integrate BodyStatusPanel into App layout

**Files:**
- Modify: `src/App.tsx:1-38`

- [ ] **Step 1: Add import and render BodyStatusPanel**

In `src/App.tsx`, add import:
```typescript
import BodyStatusPanel from './components/canvas/BodyStatusPanel';
```

And add `<BodyStatusPanel />` inside `.app-panel-center`, after `<CameraControls />`:

```typescript
<div className="app-panel-center">
  <div className="canvas-wrapper">
    <Canvas3D />
  </div>
  <CoordinateDisplay />
  <CameraControls />
  <BodyStatusPanel />
</div>
```

The final file should be:

```typescript
import CelestialToolbar from './components/toolbar/CelestialToolbar';
import Canvas3D from './components/canvas/Canvas3D';
import CoordinateDisplay from './components/CoordinateDisplay';
import CameraControls from './components/canvas/CameraControls';
import BodyStatusPanel from './components/canvas/BodyStatusPanel';
import ControlPanel from './components/controls/ControlPanel';
import HistoryPanel from './components/history/HistoryPanel';
import ScoreModal from './components/controls/ScoreModal';
import ErrorBoundary from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

function App() {
  useKeyboardShortcuts();

  return (
    <ErrorBoundary>
      <div className="app">
        <div className="app-panel-left">
          <CelestialToolbar />
        </div>
        <div className="app-panel-center">
          <div className="canvas-wrapper">
            <Canvas3D />
          </div>
          <CoordinateDisplay />
          <CameraControls />
          <BodyStatusPanel />
        </div>
        <div className="app-panel-right">
          <ControlPanel />
          <HistoryPanel />
        </div>
        <ScoreModal />
      </div>
    </ErrorBoundary>
  );
}

export default App;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate BodyStatusPanel into app layout"
```

---

### Task 3: Remove box-select from Canvas3D

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx:1-357`

- [ ] **Step 1: Remove selection-related imports and state**

Remove these lines from imports (line 8):
- Remove `selectBodiesInRect,` from the import from `'../../rendering/interaction'`

**Change line 8 from:**
```typescript
import { getPlacementPoint, selectBodiesInRect, setBodyHighlight, createPreviewSphere, removePreviewSphere, updateVelocityArrow, updateGuideArrow, removeGuideArrow, cleanupGizmos, createFloatingPreview, removeFloatingPreview } from '../../rendering/interaction';
```
**To:**
```typescript
import { getPlacementPoint, createPreviewSphere, removePreviewSphere, updateVelocityArrow, updateGuideArrow, removeGuideArrow, cleanupGizmos, createFloatingPreview, removeFloatingPreview } from '../../rendering/interaction';
```

Remove these state/ref declarations:
- Remove line 23: `const selectionRef = useRef<{ start: [number, number]; end: [number, number] } | null>(null);`
- Remove line 49: `const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);`

Also remove unused imports:
- Remove `useState` from line 1 (since `selectionRect` was the only useState). **Change line 1 from:**
  ```typescript
  import { useEffect, useRef, useCallback, useState } from 'react';
  ```
  **To:**
  ```typescript
  import { useEffect, useRef, useCallback } from 'react';
  ```

Remove unused store subscriptions:
- Remove line 37-38: `const selectedBodyIds = useUIStore(s => s.selectedBodyIds);` and `const setSelectedBodyIds = useUIStore(s => s.setSelectedBodyIds);`

- [ ] **Step 2: Remove getCanvasPos function (no longer used after selection removal)**

**Remove lines 194-198:**
```typescript
  const getCanvasPos = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return [e.clientX, e.clientY];
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
```

- [ ] **Step 3: Remove selection logic from handleMouseDown**

**Change lines 224-226 from:**
```typescript
    } else if (!selectedToolId) {
      selectionRef.current = { start: getCanvasPos(e), end: getCanvasPos(e) };
    }
```
**To:**
```typescript
    }
```
Also remove the `getCanvasPos` usage from this branch — since the branch is entirely removed, no code remains that references `getCanvasPos`.

- [ ] **Step 4: Remove selection logic from handleMouseMove**

**Change lines 276-283 from:**
```typescript
    } else if (selectionRef.current?.start) {
      const currentPos = getCanvasPos(e);
      selectionRef.current.end = currentPos;
      const x = Math.min(selectionRef.current.start[0], currentPos[0]);
      const y = Math.min(selectionRef.current.start[1], currentPos[1]);
      const w = Math.abs(currentPos[0] - selectionRef.current.start[0]);
      const h = Math.abs(currentPos[1] - selectionRef.current.start[1]);
      setSelectionRect({ x, y, w, h });
    }
```
**To:**
```typescript
    }
```

- [ ] **Step 5: Remove selection logic from handleMouseUp**

**Change lines 328-341 from:**
```typescript
    } else if (selectionRef.current) {
      const start = selectionRef.current.start;
      const end = selectionRef.current.end;
      if (Math.abs(end[0] - start[0]) > 5 || Math.abs(end[1] - start[1]) > 5) {
        const ids = selectBodiesInRect(start, end, setup.camera, canvasRef.current!);
        setSelectedBodyIds(ids);
        setBodyHighlight(ids, true);
      } else {
        setSelectedBodyIds([]);
        setBodyHighlight(selectedBodyIds, false);
      }
      selectionRef.current = null;
      setSelectionRect(null);
    }
```
**To:**
```typescript
    }
```

Also update the handleMouseUp dependency array — remove `selectedBodyIds` and `setSelectedBodyIds` since they are no longer referenced:

**Change line 342 from:**
```typescript
  }, [isPlacing, selectedToolId, placeBody, setIsPlacing, setSelectedTool, selectedBodyIds, setSelectedBodyIds, showHint, hintIndex, setHint, setPreviewSpeedStore]);
```
**To:**
```typescript
  }, [isPlacing, selectedToolId, placeBody, setIsPlacing, setSelectedTool, showHint, hintIndex, setHint, setPreviewSpeedStore]);
```

- [ ] **Step 6: Remove selection-rect from JSX**

**Change lines 347-349 from:**
```typescript
      {selectionRect && (
        <div className="selection-rect" style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h }} />
      )}
```
**To:** (remove the block entirely)

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/Canvas3D.tsx
git commit -m "feat: remove box-select functionality from Canvas3D"
```

---

### Task 4: Remove selection-rect CSS styles

**Files:**
- Modify: `src/components/canvas/Canvas3D.css:17-23`

- [ ] **Step 1: Remove .selection-rect styles**

**Remove lines 17-23:**
```css
.selection-rect {
  position: absolute;
  border: 1px solid #4488ff;
  background: rgba(68, 136, 255, 0.1);
  pointer-events: none;
  z-index: 5;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/Canvas3D.css
git commit -m "feat: remove selection-rect CSS styles"
```

---

### Task 5: Remove selectBodiesInRect from interaction.ts

**Files:**
- Modify: `src/rendering/interaction.ts:23-51`

- [ ] **Step 1: Remove selectBodiesInRect function**

**Remove lines 23-51:**
```typescript
export function selectBodiesInRect(
  start: [number, number],
  end: [number, number],
  camera: THREE.Camera,
  canvas: HTMLCanvasElement
): string[] {
  const rect = canvas.getBoundingClientRect();
  const minX = Math.min(start[0], end[0]);
  const maxX = Math.max(start[0], end[0]);
  const minY = Math.min(start[1], end[1]);
  const maxY = Math.max(start[1], end[1]);

  const selected: string[] = [];
  const tempVec = new THREE.Vector3();

  for (const [id, bm] of bodyMeshMap) {
    bm.group.getWorldPosition(tempVec);
    const projected = tempVec.clone().project(camera);

    const screenX = (projected.x + 1) / 2 * rect.width;
    const screenY = (-projected.y + 1) / 2 * rect.height;

    if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
      selected.push(id);
    }
  }

  return selected;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/rendering/interaction.ts
git commit -m "feat: remove selectBodiesInRect function"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run typecheck one final time**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: Run dev server for manual verification**

```bash
npm run dev
```

Manual checks:
1. Open the app, place the sun → panel shows "太阳" with speed
2. Place a planet (e.g. earth) → panel shows "地球" with distance, angle, speed
3. Click on a body in the panel → body gets selected, emissive highlight in 3D
4. Click again → deselected
5. While simulation running → distance/angle/speed update in real-time
6. Drag on canvas with no tool selected → nothing happens (box-select is removed)
7. Place a moon without its parent → distance and angle show "-"
