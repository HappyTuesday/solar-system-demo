# 画布触摸屏交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Three.js 画布添加触摸屏手势支持：单指旋转（无选中工具时）、双指缩放、双指平移。

**Architecture:** 新增 `src/rendering/touchInteraction.ts` 纯逻辑模块处理原生 Touch 事件，在 `Canvas3D.tsx` 生命周期中挂载/卸载。扩展 `setup.ts` 新增 `setZoomDirect` 和 `panCamera` 两个导出函数。

**Tech Stack:** TypeScript + Three.js 0.184 + Zustand 5

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/rendering/setup.ts` | 新增 `setZoomDirect()`, `panCamera()` |
| Create | `src/rendering/touchInteraction.ts` | Touch 事件监听、手势识别、调用 camera 操作 |
| Modify | `src/components/canvas/Canvas3D.tsx` | 挂载/卸载触摸监听 |

---

### Task 1: Add `setZoomDirect` and `panCamera` to setup.ts

**Files:**
- Modify: `src/rendering/setup.ts:1-3`

- [ ] **Step 1: Add imports and new functions**

In `src/rendering/setup.ts`, change the import line and add two new exports after `resetZoom` (line 126):

```ts
// Change line 2 from:
import { getZoom, setZoom } from './cameraRef';
// To:
import { getZoom, setZoom, getSharedCamera, getSharedCanvas, getCurrentLookAt, setCurrentLookAt } from './cameraRef';
```

Add the following after `resetZoom` function (after line 126):

```ts
export function setZoomDirect(newZoom: number): void {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  setZoom(zoom);
  const camera = getSharedCamera();
  const canvas = getSharedCanvas();
  if (!camera || !canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  applyZoom(camera, parent.clientWidth, parent.clientHeight, zoom);
}

export function panCamera(dx: number, dy: number): void {
  const camera = getSharedCamera();
  if (!camera) return;
  const z = getZoom();

  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  const rx = m[0], ry = m[1], rz = m[2];
  const ux = m[4], uy = m[5], uz = m[6];

  const scale = 1 / z;
  const moveX = (rx * dx + ux * dy) * scale;
  const moveY = (ry * dx + uy * dy) * scale;
  const moveZ = (rz * dx + uz * dy) * scale;

  camera.position.x -= moveX;
  camera.position.y -= moveY;
  camera.position.z -= moveZ;

  const [lx, ly, lz] = getCurrentLookAt();
  setCurrentLookAt([lx - moveX, ly - moveY, lz - moveZ]);
  camera.lookAt(lx - moveX, ly - moveY, lz - moveZ);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS (no new errors from these additions)

---

### Task 2: Create `touchInteraction.ts`

**Files:**
- Create: `src/rendering/touchInteraction.ts`

- [ ] **Step 1: Create the file**

Create `src/rendering/touchInteraction.ts` with this content:

```ts
import * as THREE from 'three';
import {
  getSharedCamera, getZoom, getCurrentLookAt, setCurrentLookAt,
} from './cameraRef';
import {
  setZoomDirect, panCamera, rotateCameraHorizontal, rotateCameraVertical,
} from './setup';
import { useUIStore } from '../stores/uiStore';

const ROTATE_SENSITIVITY = 0.004;
const ZOOM_SENSITIVITY = 0.001;

let _canvas: HTMLCanvasElement | null = null;
let rotationActive = false;
let lastRotationX = 0;
let lastRotationY = 0;
let pinchActive = false;
let lastPinchDistance = 0;
let lastMidX = 0;
let lastMidY = 0;
const activeTouches: Map<number, { x: number; y: number }> = new Map();

function handleTouchStart(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (e.touches.length === 1) {
    const selectedTool = useUIStore.getState().selectedToolId;
    if (!selectedTool) {
      e.preventDefault();
      lastRotationX = e.touches[0].clientX;
      lastRotationY = e.touches[0].clientY;
      rotationActive = true;
    }
  } else if (e.touches.length === 2) {
    e.preventDefault();
    rotationActive = false;
    pinchActive = true;
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    lastPinchDistance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    lastMidX = (t0.clientX + t1.clientX) / 2;
    lastMidY = (t0.clientY + t1.clientY) / 2;
  } else if (e.touches.length >= 3) {
    e.preventDefault();
  }
}

function handleTouchMove(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
  }

  if (rotationActive && e.touches.length === 1) {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastRotationX;
    const dy = t.clientY - lastRotationY;
    lastRotationX = t.clientX;
    lastRotationY = t.clientY;

    const camera = getSharedCamera();
    if (camera) {
      const [lx, ly, lz] = getCurrentLookAt();
      const target = new THREE.Vector3(lx, ly, lz);
      rotateCameraHorizontal(camera, -dx * ROTATE_SENSITIVITY, target);
      rotateCameraVertical(camera, -dy * ROTATE_SENSITIVITY, target);
      const newLookAt = getCurrentLookAt();
      setCurrentLookAt([newLookAt[0], newLookAt[1], newLookAt[2]]);
    }
  } else if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    if (lastPinchDistance > 0) {
      const distDelta = dist - lastPinchDistance;
      const prevZ = getZoom();
      const newZ = prevZ * (1 + distDelta * ZOOM_SENSITIVITY);
      setZoomDirect(newZ);
    }

    const dx = midX - lastMidX;
    const dy = midY - lastMidY;
    panCamera(dx, dy);

    lastPinchDistance = dist;
    lastMidX = midX;
    lastMidY = midY;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  if (e.touches.length < 2) {
    pinchActive = false;
  }
  if (e.touches.length === 0) {
    rotationActive = false;
  }
}

export function initTouchInteraction(canvas: HTMLCanvasElement): void {
  _canvas = canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);
}

export function destroyTouchInteraction(): void {
  if (!_canvas) return;
  _canvas.removeEventListener('touchstart', handleTouchStart);
  _canvas.removeEventListener('touchmove', handleTouchMove);
  _canvas.removeEventListener('touchend', handleTouchEnd);
  _canvas.removeEventListener('touchcancel', handleTouchEnd);
  _canvas = null;
  rotationActive = false;
  pinchActive = false;
  activeTouches.clear();
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 3: Integrate into Canvas3D.tsx

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx:1-16`

- [ ] **Step 1: Add import**

In `src/components/canvas/Canvas3D.tsx`, add the touch interaction import (line 16 area):

```ts
// Add after line 16:
import { initTouchInteraction, destroyTouchInteraction } from '../../rendering/touchInteraction';
```

- [ ] **Step 2: Add mount/unmount effect**

In `Canvas3D.tsx`, add a new `useEffect` right after the existing init effect (after line 197, before the `// Auto-place sun` effect). Insert:

```ts
  // Touch interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initTouchInteraction(canvas);
    return () => destroyTouchInteraction();
  }, []);
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 4: Final verification

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: PASS, zero errors

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: PASS, no build errors
