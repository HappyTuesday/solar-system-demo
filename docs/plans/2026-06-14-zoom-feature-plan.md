# 画布缩放功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在相机控制面板中增加缩放 +/- 按钮，支持 0.5x ~ 3.0x 范围的正交相机缩放。

**Architecture:** 在 `cameraRef.ts` 中维护 zoom 状态和 canvas 引用，在 `setup.ts` 中增加纯缩放计算函数，`CameraControls.tsx` 增加两个按钮及对应交互事件。与旋转逻辑正交，互不影响。

**Tech Stack:** TypeScript, Three.js (OrthographicCamera), React, CSS Grid

**Design Doc:** `docs/specs/2026-06-14-zoom-feature-design.md`

---

### Task 1: 扩展 cameraRef.ts — 增加 zoom 状态和 canvas 引用

**Files:**
- Modify: `src/rendering/cameraRef.ts`

- [ ] **Step 1: 添加 zoom 状态、canvas 引用及相关接口**

```ts
import type * as THREE from 'three';

let _camera: THREE.OrthographicCamera | null = null;
let _zoom = 1.0;
let _canvas: HTMLCanvasElement | null = null;

export function setSharedCamera(camera: THREE.OrthographicCamera | null): void {
  _camera = camera;
}

export function getSharedCamera(): THREE.OrthographicCamera | null {
  return _camera;
}

export function setSharedCanvas(canvas: HTMLCanvasElement | null): void {
  _canvas = canvas;
}

export function getSharedCanvas(): HTMLCanvasElement | null {
  return _canvas;
}

export function getZoom(): number {
  return _zoom;
}

export function setZoom(zoom: number): void {
  _zoom = zoom;
}
```

- [ ] **Step 2: 运行类型检查验证无编译错误**

```bash
npm run typecheck
```

Expected: PASS（若有新增未使用导出的 warning 可忽略，后续步骤会使用）

- [ ] **Step 3: Commit**

```bash
git add src/rendering/cameraRef.ts
git commit -m "feat: add zoom state and canvas ref to cameraRef"
```

---

### Task 2: 扩展 setup.ts — 增加缩放函数，修改 handleResize 和 resetCamera

**Files:**
- Modify: `src/rendering/setup.ts`

- [ ] **Step 1: 在 setup.ts 顶部添加导入和常量**

在文件顶部 `import * as THREE from 'three';` 之后添加：

```ts
import { getZoom, setZoom } from './cameraRef';
```

在 `CAMERA_ROTATE_STEP` 之后添加缩放常量：

```ts
export const ZOOM_STEP = 0.15;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
```

- [ ] **Step 2: 添加 applyZoom 函数**

在 `CAMERA_ROTATE_STEP` 之后、`rotateCameraHorizontal` 之前添加：

```ts
export function applyZoom(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number, zoom: number): void {
  const fw = containerWidth / zoom;
  const fh = containerHeight / zoom;
  camera.left = -fw / 2;
  camera.right = fw / 2;
  camera.top = fh / 2;
  camera.bottom = -fh / 2;
  camera.updateProjectionMatrix();
}
```

- [ ] **Step 3: 添加 zoomIn/zoomOut/resetZoom 函数**

在 `resetCamera` 函数之后添加：

```ts
export function zoomIn(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  const z = Math.min(getZoom() + ZOOM_STEP, ZOOM_MAX);
  setZoom(z);
  applyZoom(camera, containerWidth, containerHeight, z);
}

export function zoomOut(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  const z = Math.max(getZoom() - ZOOM_STEP, ZOOM_MIN);
  setZoom(z);
  applyZoom(camera, containerWidth, containerHeight, z);
}

export function resetZoom(camera: THREE.OrthographicCamera, containerWidth: number, containerHeight: number): void {
  setZoom(1.0);
  applyZoom(camera, containerWidth, containerHeight, 1.0);
}
```

- [ ] **Step 4: 修改 handleResize 以使用 applyZoom**

将 `handleResize` 函数中设置 `camera.left/right/top/bottom` 的部分替换为 `applyZoom` 调用：

```ts
export function handleResize(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera
): void {
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;
  if (Math.abs(renderer.domElement.width - w) > 2 || Math.abs(renderer.domElement.height - h) > 2) {
    renderer.setSize(w, h, false);
    applyZoom(camera, w, h, getZoom());
  }
}
```

- [ ] **Step 5: 修改 resetCamera 保持简洁**

`resetCamera` 只负责重置相机位置，zoom 重置由 `resetZoom` 独立处理（在 CameraControls 的 `handleReset` 中同时调用两者）：

```ts
export function resetCamera(camera: THREE.OrthographicCamera): void {
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
}
```

- [ ] **Step 6: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/rendering/setup.ts
git commit -m "feat: add zoom functions to setup.ts"
```

---

### Task 3: 修改 CameraControls.tsx — 增加缩放按钮和交互

**Files:**
- Modify: `src/components/canvas/CameraControls.tsx`

- [ ] **Step 1: 更新导入**

将现有的 import 块替换为：

```ts
import { useRef, useEffect } from 'react';
import {
  rotateCameraHorizontal,
  rotateCameraVertical,
  resetCamera,
  CAMERA_ROTATE_STEP,
  zoomIn,
  zoomOut,
  resetZoom,
} from '../../rendering/setup';
import { getSharedCamera, getSharedCanvas } from '../../rendering/cameraRef';
import './CameraControls.css';
```

- [ ] **Step 2: 添加 startZoom 函数和更新 handleReset**

在 `stopRotate` 函数之后、`useEffect` 之前添加：

```ts
const startZoom = (direction: 'in' | 'out') => {
  if (intervalRef.current) return;
  intervalRef.current = setInterval(() => {
    const camera = getSharedCamera();
    const canvas = getSharedCanvas();
    if (!camera || !canvas) return;
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : canvas.clientWidth;
    const h = parent ? parent.clientHeight : canvas.clientHeight;
    if (direction === 'in') {
      zoomIn(camera, w, h);
    } else {
      zoomOut(camera, w, h);
    }
  }, 50);
};
```

更新 `handleReset`：

```ts
const handleReset = () => {
  const camera = getSharedCamera();
  const canvas = getSharedCanvas();
  if (!camera || !canvas) return;
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;
  resetCamera(camera);
  resetZoom(camera, w, h);
};
```

- [ ] **Step 3: 添加缩放按钮到 JSX**

在现有 `</div>` 之前、`↓` 按钮之后插入两个缩放按钮：

```tsx
<button
  className="camera-btn zoom-out"
  onMouseDown={() => startZoom('out')}
  onMouseUp={stopRotate}
  onMouseLeave={stopRotate}
>−</button>
<button
  className="camera-btn zoom-in"
  onMouseDown={() => startZoom('in')}
  onMouseUp={stopRotate}
  onMouseLeave={stopRotate}
>+</button>
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/CameraControls.tsx
git commit -m "feat: add zoom buttons to camera controls"
```

---

### Task 4: 更新 CameraControls.css — 调整 grid 布局

**Files:**
- Modify: `src/components/canvas/CameraControls.css`

- [ ] **Step 1: 更新 grid 模板为 4 行**

将第 11 行：
```css
  grid-template-rows: 30px 30px 30px;
```
改为：
```css
  grid-template-rows: 30px 30px 30px 30px;
```

- [ ] **Step 2: 添加 zoom 按钮定位样式**

在文件末尾追加：

```css
.camera-btn.zoom-out {
  grid-column: 1;
  grid-row: 4;
}

.camera-btn.zoom-in {
  grid-column: 3;
  grid-row: 4;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/CameraControls.css
git commit -m "feat: update camera controls grid for zoom buttons"
```

---

### Task 5: Canvas3D 注册 canvas 引用

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx`

在 Canvas3D.tsx 中找到 `setSharedCamera` 的调用位置（约第 121 行），在同一位置附近注册 canvas：

- [ ] **Step 1: 更新导入**

在 Canvas3D.tsx 顶部，将：
```ts
import { setSharedCamera, getSharedCamera } from '../../rendering/cameraRef';
```
改为：
```ts
import { setSharedCamera, getSharedCamera, setSharedCanvas } from '../../rendering/cameraRef';
```

- [ ] **Step 2: 在组件挂载时注册 canvas**

在 `setSharedCamera(setup.camera)` 调用之后添加 `setSharedCanvas(canvasRef.current)`。

在组件卸载时的清理代码中（`setSharedCamera(null)` 附近）添加 `setSharedCanvas(null)`。

- [ ] **Step 3: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/Canvas3D.tsx
git commit -m "feat: register shared canvas ref for zoom support"
```

---

### Task 6: 更新设计文档

**Files:**
- Modify: `docs/specs/2026-06-14-solar-system-demo-design.md`

- [ ] **Step 1: 更新相机控制面板描述**

找到 section 4.3 中 "不支持滚轮缩放，不支持画布拖拽" 的文本，改为：
"支持方向键旋转视角和 +/- 按钮缩放（0.5x ~ 3.0x），不支持画布拖拽"

- [ ] **Step 2: 更新相机控制流程描述**

找到 section 5.2 的相机控制流程，补充缩放操作说明。

- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-06-14-solar-system-demo-design.md
git commit -m "docs: update design doc for zoom feature"
```

---

### Task 7: 验证

- [ ] **Step 1: 运行开发服务器**

```bash
npm run dev
```

手动验证：
1. 打开浏览器，确认相机控制面板底部出现 `−` 和 `+` 按钮
2. 点击 `+` 按钮：视角应放大（天体变大），连续点击应持续放大到 3.0x 上限
3. 点击 `−` 按钮：视角应缩小，连续点击应持续缩小到 0.5x 下限
4. 长按 `+`/`−`：应连续缩放（类似方向键长按效果）
5. 点击 ↻ 重置按钮：视角和缩放应恢复到初始状态
6. 调整浏览器窗口大小：缩放倍率应保持不变

- [ ] **Step 2: 最终类型检查**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit（如有修改）**

```bash
git add -A
git commit -m "chore: final verification for zoom feature"
```
