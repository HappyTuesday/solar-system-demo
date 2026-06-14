# 相机追踪功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将任意天体设为"观测目标"后，正交相机自动将该天体保持画面中央，默认追踪太阳（原点）。

**Architecture:** 在 `uiStore` 和 `cameraRef` 中维护 `observationTargetId` 状态，在 `setup.ts` 中修改旋转/复位函数支持围绕任意目标点而非硬编码原点，在 `Canvas3D.tsx` 动画循环中根据 target 的渲染位置调整相机 position 和 lookAt，`CameraControls.tsx` 读取当前 lookAt 位置传给旋转函数，`ControlPanel.tsx` 增加「设为观测目标」按钮。

**Tech Stack:** TypeScript, Three.js (OrthographicCamera), React, Zustand

**Design Doc:** `docs/specs/2026-06-14-camera-tracking-design.md`

---

### Task 1: 扩展类型定义 — UIState 新增 observationTargetId

**Files:**
- Modify: `src/types/index.ts:86-99`

- [ ] **Step 1: 在 UIState 接口中添加 observationTargetId 字段**

在 `UIState` 接口的 `supervisionMode` 之后添加：

```ts
observationTargetId: string | null;
```

完整接口：

```ts
export interface UIState {
  selectedToolId: CelestialBodyId | null;
  selectedBodyIds: string[];
  supervisionMode: boolean;
  observationTargetId: string | null;
  showHint: boolean;
  isPlacing: boolean;
  hintIndex: number;
  showScoreModal: boolean;
  previewPosition: [number, number, number] | null;
  previewSpeed: number;
  mouseCanvasPos: [number, number] | null;
  mouseRenderPos: [number, number, number] | null;
  mousePhysicalPos: [number, number, number] | null;
}
```

- [ ] **Step 2: 运行类型检查确认编译通过**

```bash
npm run typecheck
```

Expected: 会报 `uiStore.ts` 缺少 `observationTargetId` 字段，这是因为 Task 2 才会补上（后续任务解决）。

---

### Task 2: 扩展 uiStore — 新增 observationTargetId 状态和 setter

**Files:**
- Modify: `src/stores/uiStore.ts`

- [ ] **Step 1: 添加 observationTargetId 到初始状态和 UIStore 接口**

将 `UIStore` 接口改为：

```ts
interface UIStore extends UIState {
  setSelectedTool: (id: string | null) => void;
  setSelectedBodyIds: (ids: string[]) => void;
  toggleSupervision: () => void;
  setObservationTargetId: (id: string | null) => void;
  setHint: (show: boolean) => void;
  setIsPlacing: (placing: boolean) => void;
  advanceHint: () => void;
  setShowScoreModal: (show: boolean) => void;
  setPreviewPosition: (pos: [number, number, number] | null) => void;
  setPreviewSpeed: (speed: number) => void;
  setMousePositions: (canvasPos: [number, number] | null, renderPos: [number, number, number] | null, physicalPos: [number, number, number] | null) => void;
  resetUI: () => void;
}
```

初始状态中添加 `observationTargetId: null`（在 `supervisionMode: false` 之后）：

```ts
export const useUIStore = create<UIStore>((set) => ({
  selectedToolId: null,
  selectedBodyIds: [],
  supervisionMode: false,
  observationTargetId: null,
  showHint: false,
  ...
```

setter 中添加（在 `toggleSupervision` 之后）：

```ts
setObservationTargetId: (id) => set({ observationTargetId: id }),
```

`resetUI` 中添加重置：

```ts
resetUI: () => set({
  ...
  observationTargetId: null,
  ...
}),
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 3: 扩展 cameraRef — 新增 observationTargetId 和 currentLookAt

**Files:**
- Modify: `src/rendering/cameraRef.ts`

- [ ] **Step 1: 添加 observationTargetId 状态变量和接口**

在现有 `_zoom` 变量之后添加：

```ts
let _observationTargetId: string | null = null;
```

在现有导出函数之后、文件末尾之前添加：

```ts
export function getObservationTargetId(): string | null {
  return _observationTargetId;
}

export function setObservationTargetId(id: string | null): void {
  _observationTargetId = id;
}
```

- [ ] **Step 2: 添加 currentLookAt 位置状态和接口**

继续添加：

```ts
let _currentLookAt: [number, number, number] = [0, 0, 0];

export function getCurrentLookAt(): [number, number, number] {
  return _currentLookAt;
}

export function setCurrentLookAt(pos: [number, number, number]): void {
  _currentLookAt = pos;
}
```

- [ ] **Step 3: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 4: 修改 setup.ts — 旋转/复位函数支持可选目标点

**Files:**
- Modify: `src/rendering/setup.ts:74-104`

- [ ] **Step 1: 修改 rotateCameraHorizontal 支持 target 参数**

将第 75-82 行的 `rotateCameraHorizontal` 改为：

```ts
export function rotateCameraHorizontal(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const currentAngle = Math.atan2(dy, dx);
  const newAngle = currentAngle + angle;
  camera.position.x = target.x + radius * Math.cos(newAngle);
  camera.position.y = target.y + radius * Math.sin(newAngle);
  camera.lookAt(target);
}
```

- [ ] **Step 2: 修改 rotateCameraVertical 支持 target 参数**

将第 85-99 行的 `rotateCameraVertical` 改为：

```ts
export function rotateCameraVertical(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const dz = camera.position.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const currentZenith = Math.acos(dz / dist);
  let newZenith = currentZenith + angle;
  newZenith = Math.max(0.05, Math.min(Math.PI - 0.05, newZenith));

  const azimuth = Math.atan2(dy, dx);
  const horizontalDist = dist * Math.sin(newZenith);
  camera.position.z = target.z + dist * Math.cos(newZenith);
  camera.position.x = target.x + horizontalDist * Math.cos(azimuth);
  camera.position.y = target.y + horizontalDist * Math.sin(azimuth);
  camera.lookAt(target);
}
```

- [ ] **Step 3: 修改 resetCamera 支持 target 参数**

将第 101-104 行的 `resetCamera` 改为：

```ts
export function resetCamera(camera: THREE.OrthographicCamera, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  camera.position.set(target.x, target.y, target.z + 100);
  camera.lookAt(target);
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 5: 修改 Canvas3D — 动画循环中实现相机追踪

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx`

- [ ] **Step 1: 更新导入**

在 `Canvas3D.tsx` 顶部导入区，`setSharedCamera, setSharedCanvas` 改为：

```ts
import { setSharedCamera, setSharedCanvas, setObservationTargetId, setCurrentLookAt } from '../../rendering/cameraRef';
```

同时添加 `physicalToRender` 导入（在 `coordinateTransform` 导入行追加）：

```ts
import { physicalRadiusToRender, physicalDistanceToRender, renderToPhysical, renderVelocityToPhysical, physicalVelocityToRender, physicalToRender } from '../../engine/coordinateTransform';
```

- [ ] **Step 2: 订阅 observationTargetId**

在 `Canvas3D` 组件的 store 订阅区域，添加：

```ts
const observationTargetId = useUIStore(s => s.observationTargetId);
```

- [ ] **Step 3: 在动画循环中添加相机追踪逻辑**

在动画循环 `animate` 函数中，`updateBodyMeshes(bodies, dt)` 之后、`renderer.render(scene, camera)` 之前添加：

```ts
// Camera tracking: center on observation target
if (observationTargetId) {
  const targetBody = bodies.find(b => b.id === observationTargetId);
  if (targetBody) {
    const targetRenderPos = physicalToRender(targetBody.position);
    const targetVec = new THREE.Vector3(targetRenderPos[0], targetRenderPos[1], targetRenderPos[2]);

    // Compute offset once per target change (offset = camera.pos - lookAt)
    // We use cameraRef to check if target changed
    let offset = new THREE.Vector3().subVectors(camera.position, camera.position.clone().set(targetRenderPos[0], targetRenderPos[1], camera.position.z));
    // Actually, simpler: offset = camera.position - currentLookAt
    // But currentLookAt is updated each frame, so offset stays constant after first frame

    // Position camera centered on target, preserving viewing offset
    camera.position.x = targetRenderPos[0] + (camera.position.x - targetRenderPos[0]);
    camera.position.y = targetRenderPos[1] + (camera.position.y - targetRenderPos[1]);
    camera.lookAt(targetVec);

    setCurrentLookAt(targetRenderPos);
  } else {
    // Target body no longer exists (collision), reset
    useUIStore.getState().setObservationTargetId(null);
    setObservationTargetId(null);
    setCurrentLookAt([0, 0, 0]);
  }
} else {
  setCurrentLookAt([0, 0, 0]);
}
```

Wait, the offset computation above is wrong. Let me think again...

The offset should be:
- When observationTargetId changes (detected by callback), compute: offset = camera.position - (previous target render position or origin)
- Each frame: camera.position = targetRenderPos + offset, camera.lookAt(targetRenderPos)

Since the camera position was already set to be centered on the target in the previous frame, and target moved by delta:
- camera.position.x - targetRenderPos.x (from last frame) = offset
- So setting camera.position.x = targetRenderPos.x + offset is identity... 

No wait. In frame N-1, camera.position = targetRenderPos_{N-1} + offset, and camera looksAt targetRenderPos_{N-1}.
In frame N, target is at targetRenderPos_N. I want the camera at targetRenderPos_N + offset.

The issue is that in the code, I'm computing offset = camera.position - currentLookAt, but at the start of frame N, camera.position = targetRenderPos_{N-1} + offset, and currentLookAt from last frame = targetRenderPos_{N-1}. So offset = (targetRenderPos_{N-1} + offset) - targetRenderPos_{N-1} = offset. Which is the original offset. 

But I can't use `camera.position.z` in the offset because the Z is part of the viewing angle. The offset should be a 3D vector.

Actually, let me simplify. The offset should be computed ONCE when the observation target changes, and stored. Then each frame, camera.position = targetRenderPos + offset, camera.lookAt(targetRenderPos).

I should store the offset in the cameraRef. Let me add a `setTrackingOffset` / `getTrackingOffset` to cameraRef, or use a ref in Canvas3D.

Actually, the cleanest approach:

1. When `observationTargetId` changes (detected via useEffect or comparison):
   - Compute offset = camera.position - currentLookAtPosition
   - Store offset in a ref

2. Each frame:
   - Find target body's render position
   - camera.position = targetRenderPos + offset
   - camera.lookAt(targetRenderPos)

Let me use a useRef for the offset:

```ts
const trackingOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 100));
```

And use a useEffect to compute offset when observationTargetId changes:

```ts
useEffect(() => {
  const camera = setupRef.current?.camera;
  if (!camera) return;
  const currentLookAt = getCurrentLookAt();
  trackingOffsetRef.current = new THREE.Vector3(
    camera.position.x - currentLookAt[0],
    camera.position.y - currentLookAt[1],
    camera.position.z - currentLookAt[2]
  );
}, [observationTargetId]);
```

Hmm, but `observationTargetId` is in the dependency array of the animation loop effect... Actually it's not currently. Let me check:

```ts
useEffect(() => {
  ...
  const animate = (time: number) => { ... };
  ...
  return () => cancelAnimationFrame(animFrameRef.current);
}, [isRunning, bodies, startedAt, syncBodies, advanceSim, removeBody, placeBody, updateBuildElapsed]);
```

`observationTargetId` is NOT in the dependency array. Since the values are read from closures, I can read them directly from the store inside the animation closure. But since Zustand selectors create subscriptions, the component re-renders and the effect re-runs. However, the animation loop is started in a useEffect that doesn't depend on `observationTargetId`.

I have two options:
1. Add `observationTargetId` to the dependency array of the animation loop effect
2. Read from `useUIStore.getState()` inside the animation closure

Option 2 is better because it doesn't restart the animation loop when the target changes:

```ts
const animate = (time: number) => {
  ...
  // Camera tracking
  const targetId = useUIStore.getState().observationTargetId;
  ...
};
```

But then I need a ref for tracking offset.

Actually, let me think about this differently. The simplest approach:

In the animation loop, at the beginning:
1. Read observationTargetId from store
2. If targetId is set:
   a. Find target body
   b. Get render position
   c. Compute camera position = renderPos + offset
   d. Set camera position and lookAt
   e. Update stored lookAt position

The offset: I'll compute it as `camera.position - currentStoredLookAt` each frame. After the first frame of tracking, this stabilizes to the original offset.

Wait no - let me think again more carefully.

Frame 0 (tracking starts):
- observationTargetId changes from null to "bodyX"
- I compute offset = camera.position - (0,0,0) since previous lookAt was (0,0,0)  
  Actually wait, I need to know the previous lookAt. When untracked, the camera looks at the origin.
  But what if the user had rotated the camera? Then `camera.position - (0,0,0)` gives us the full camera position as offset, which is correct.

Let me just do:
```ts
// In the animation loop, read the offset from a ref.
// The offset is initialized to (0, 0, 100) - the default camera position.
// When observationTargetId changes, compute new offset = camera.position - old lookAt.

const trackingOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 100));
const prevTargetIdRef = useRef<string | null>(null);

// In animate():
const targetId = useUIStore.getState().observationTargetId;
if (targetId !== prevTargetIdRef.current) {
  // Target changed, recompute offset
  const prevLookAt = getCurrentLookAt();
  trackingOffsetRef.current = new THREE.Vector3(
    camera.position.x - prevLookAt[0],
    camera.position.y - prevLookAt[1],
    camera.position.z - prevLookAt[2]
  );
  prevTargetIdRef.current = targetId;
}
```

Then each frame:
```ts
if (targetId) {
  const targetBody = bodies.find(b => b.id === targetId);
  if (targetBody) {
    const rp = physicalToRender(targetBody.position);
    camera.position.set(
      rp[0] + trackingOffsetRef.current.x,
      rp[1] + trackingOffsetRef.current.y,
      rp[2] + trackingOffsetRef.current.z
    );
    camera.lookAt(new THREE.Vector3(rp[0], rp[1], rp[2]));
    setCurrentLookAt(rp);
  }
}
```

This is clean. The offset stays constant until the user changes the target. The rotation functions in CameraControls orbit around the current lookAt point.

OK, but I realize the `bodies` in the animation loop is a closure variable from the effect. Since the effect depends on `bodies`, this should be fine.

Let me now write the actual plan steps with correct code.

Actually, wait - there's another issue. The animation loop reads `bodies` from the closure. When bodies change, the effect restarts (because `bodies` is in the dependency array). But inside the animation, I should use the store's current bodies for finding the target body. Let me use `useBuildStore.getState().bodies`.

Let me finalize the plan and write it clearly. I realize I'm overcomplicating this. Let me just write the plan.

For Task 5, the key steps are:
1. Add imports
2. Add refs for tracking offset and prev target ID
3. Add camera tracking code in the animation loop
4. Sync observationTargetId between store and cameraRef

Let me also add a useEffect to sync the store's observationTargetId to cameraRef.

OK let me write the plan file now.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write">
<｜｜DSML｜｜parameter name="content" string="true"># 相机追踪功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将任意天体设为观测目标后，正交相机自动将该天体保持画面中央（默认追踪太阳/原点），仅影响渲染空间。

**Architecture:** `uiStore` 和 `cameraRef` 同步维护 `observationTargetId` 状态；`setup.ts` 旋转/复位函数支持可选 target 参数（默认原点保持向后兼容）；`Canvas3D` 动画循环每帧根据目标渲染位置 + 固定偏移量调整相机 position 和 lookAt；`CameraControls` 读取当前 lookAt 位置传给旋转函数实现围绕目标旋转；`ControlPanel` 在选中天体区域添加按钮。

**Tech Stack:** TypeScript, Three.js (OrthographicCamera), React, Zustand

**Design Doc:** `docs/specs/2026-06-14-camera-tracking-design.md`

---

### Task 1: 扩展类型定义 — UIState 新增 observationTargetId

**Files:**
- Modify: `src/types/index.ts:86-99`

- [ ] **Step 1: 在 UIState 接口中添加 observationTargetId 字段**

在 `supervisionMode: boolean;` 之后插入一行：

```ts
observationTargetId: string | null;
```

- [ ] **Step 2: 运行类型检查（预期会报 uiStore 缺少该字段，后续任务修复）**

```bash
npm run typecheck
```

---

### Task 2: 扩展 uiStore — 新增 observationTargetId 状态和 setter

**Files:**
- Modify: `src/stores/uiStore.ts`

- [ ] **Step 1: 在 UIStore 接口中添加 setter 声明**

在 `toggleSupervision` 之后添加：

```ts
setObservationTargetId: (id: string | null) => void;
```

- [ ] **Step 2: 在初始状态中添加字段**

在 `supervisionMode: false,` 之后添加：

```ts
observationTargetId: null,
```

- [ ] **Step 3: 在 create 回调中添加 setter 实现**

在 `toggleSupervision: () => set(s => ({ supervisionMode: !s.supervisionMode })),` 之后添加：

```ts
setObservationTargetId: (id) => set({ observationTargetId: id }),
```

- [ ] **Step 4: 在 resetUI 中添加重置**

在 `resetUI` 返回对象中添加：

```ts
observationTargetId: null,
```

- [ ] **Step 5: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 3: 扩展 cameraRef — 新增 observationTargetId 和 currentLookAt

**Files:**
- Modify: `src/rendering/cameraRef.ts`

- [ ] **Step 1: 添加观测目标 ID 状态和接口**

在 `_zoom` 变量之后添加：

```ts
let _observationTargetId: string | null = null;
```

在文件末尾追加：

```ts
export function getObservationTargetId(): string | null {
  return _observationTargetId;
}

export function setObservationTargetId(id: string | null): void {
  _observationTargetId = id;
}
```

- [ ] **Step 2: 添加 currentLookAt 位置状态和接口**

继续添加：

```ts
let _currentLookAt: [number, number, number] = [0, 0, 0];

export function getCurrentLookAt(): [number, number, number] {
  return _currentLookAt;
}

export function setCurrentLookAt(pos: [number, number, number]): void {
  _currentLookAt = pos;
}
```

- [ ] **Step 3: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 4: 修改 setup.ts — 旋转/复位函数支持可选 target 参数

**Files:**
- Modify: `src/rendering/setup.ts:74-104`

- [ ] **Step 1: 修改 rotateCameraHorizontal**

将原有函数替换为以下实现（使用相对于 target 的球坐标旋转）：

```ts
export function rotateCameraHorizontal(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const currentAngle = Math.atan2(dy, dx);
  const newAngle = currentAngle + angle;
  camera.position.x = target.x + radius * Math.cos(newAngle);
  camera.position.y = target.y + radius * Math.sin(newAngle);
  camera.lookAt(target);
}
```

- [ ] **Step 2: 修改 rotateCameraVertical**

将原有函数替换为：

```ts
export function rotateCameraVertical(camera: THREE.OrthographicCamera, angle: number, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const dz = camera.position.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const currentZenith = Math.acos(dz / dist);
  let newZenith = currentZenith + angle;
  newZenith = Math.max(0.05, Math.min(Math.PI - 0.05, newZenith));

  const azimuth = Math.atan2(dy, dx);
  const horizontalDist = dist * Math.sin(newZenith);
  camera.position.z = target.z + dist * Math.cos(newZenith);
  camera.position.x = target.x + horizontalDist * Math.cos(azimuth);
  camera.position.y = target.y + horizontalDist * Math.sin(azimuth);
  camera.lookAt(target);
}
```

- [ ] **Step 3: 修改 resetCamera**

将原有函数替换为：

```ts
export function resetCamera(camera: THREE.OrthographicCamera, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
  camera.position.set(target.x, target.y, target.z + 100);
  camera.lookAt(target);
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 5: 修改 Canvas3D — 动画循环中实现相机追踪

**Files:**
- Modify: `src/components/canvas/Canvas3D.tsx`

- [ ] **Step 1: 更新导入**

在 cameraRef 导入行末尾添加 `setObservationTargetId, setCurrentLookAt, getCurrentLookAt`：

```ts
import { setSharedCamera, setSharedCanvas, setObservationTargetId, setCurrentLookAt, getCurrentLookAt } from '../../rendering/cameraRef';
```

在 coordinateTransform 导入行末尾添加 `physicalToRender`：

```ts
import { physicalRadiusToRender, physicalDistanceToRender, renderToPhysical, renderVelocityToPhysical, physicalVelocityToRender, physicalToRender } from '../../engine/coordinateTransform';
```

- [ ] **Step 2: 添加追踪相关 ref**

在其他 ref 声明（`dragStartRef` 之后）添加：

```ts
const trackingOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 100));
const prevTargetIdRef = useRef<string | null>(null);
```

- [ ] **Step 3: 在动画循环末尾（renderer.render 之前）添加相机追踪逻辑**

在 `updateBodyMeshes(bodies, dt);` 之后、`renderer.render(scene, camera);` 之前插入：

```ts
// Camera tracking: center on observation target
const targetId = useUIStore.getState().observationTargetId;
if (targetId !== prevTargetIdRef.current) {
  // Target changed — recompute offset from camera position relative to old lookAt
  prevTargetIdRef.current = targetId;
  const prevLookAt = getCurrentLookAt();
  trackingOffsetRef.current.set(
    camera.position.x - prevLookAt[0],
    camera.position.y - prevLookAt[1],
    camera.position.z - prevLookAt[2]
  );
}

if (targetId) {
  const targetBody = bodies.find(b => b.id === targetId);
  if (targetBody) {
    const rp = physicalToRender(targetBody.position);
    camera.position.set(
      rp[0] + trackingOffsetRef.current.x,
      rp[1] + trackingOffsetRef.current.y,
      rp[2] + trackingOffsetRef.current.z
    );
    camera.lookAt(new THREE.Vector3(rp[0], rp[1], rp[2]));
    setCurrentLookAt(rp);
    setObservationTargetId(targetId);
  } else {
    // Target body deleted (collision) — reset to origin tracking
    useUIStore.getState().setObservationTargetId(null);
    setObservationTargetId(null);
    setCurrentLookAt([0, 0, 0]);
  }
} else {
  setCurrentLookAt([0, 0, 0]);
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 6: 修改 CameraControls — 旋转时传入观测目标位置

**Files:**
- Modify: `src/components/canvas/CameraControls.tsx`

- [ ] **Step 1: 更新导入**

在 cameraRef 导入行末尾添加 `getCurrentLookAt`：

```ts
import { getSharedCamera, getSharedCanvas, getCurrentLookAt } from '../../rendering/cameraRef';
```

- [ ] **Step 2: 修改 startRotate 函数，旋转时传入目标点**

将 `startRotate` 函数中的 switch 分支改为传入当前 lookAt 目标点：

```ts
const startRotate = (direction: 'up' | 'down' | 'left' | 'right') => {
  if (intervalRef.current) return;
  intervalRef.current = setInterval(() => {
    const camera = getSharedCamera();
    if (!camera) return;
    const step = CAMERA_ROTATE_STEP * 0.5;
    const lookAt = getCurrentLookAt();
    const target = new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]);
    switch (direction) {
      case 'up': rotateCameraVertical(camera, -step, target); break;
      case 'down': rotateCameraVertical(camera, step, target); break;
      case 'left': rotateCameraHorizontal(camera, -step, target); break;
      case 'right': rotateCameraHorizontal(camera, step, target); break;
    }
  }, 50);
};
```

- [ ] **Step 3: 修改 handleReset 函数**

```ts
const handleReset = () => {
  const camera = getSharedCamera();
  const canvas = getSharedCanvas();
  if (!camera || !canvas) return;
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : canvas.clientWidth;
  const h = parent ? parent.clientHeight : canvas.clientHeight;
  const lookAt = getCurrentLookAt();
  const target = new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]);
  resetCamera(camera, target);
  resetZoom(camera, w, h);
};
```

- [ ] **Step 4: 在文件顶部添加 THREE 导入**

```ts
import * as THREE from 'three';
```

- [ ] **Step 5: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 7: 修改 ControlPanel — 添加「设为观测目标」按钮

**Files:**
- Modify: `src/components/controls/ControlPanel.tsx:249-282`

- [ ] **Step 1: 在选中天体信息区域添加按钮**

在 `selectedBody` 条件渲染块中，「删除天体」按钮上方添加：

```tsx
<button
  className="ctrl-btn"
  onClick={() => {
    if (uiStore.observationTargetId === selectedBody.id) {
      uiStore.setObservationTargetId(null);
    } else {
      uiStore.setObservationTargetId(selectedBody.id);
    }
  }}
  disabled={isAutoBuilding}
>
  {uiStore.observationTargetId === selectedBody.id ? '取消观测目标' : '设为观测目标'}
</button>
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS

---

### Task 8: 更新设计文档（同步）

**Files:**
- Modify: `docs/specs/2026-06-14-solar-system-demo-design.md`

- [ ] **Step 1: 在相机控制章节补充追踪能力说明**

找到相机控制相关描述，在适当位置补充：

```md
### 相机追踪

相机支持将任意天体设为观测目标，跟踪期间该天体始终保持画面中央。默认追踪太阳（原点）。

- 选中天体后，在控制面板点击「设为观测目标」
- 相机控制面板的旋转和复位操作围绕当前观测目标执行
- 天体被碰撞销毁后自动取消追踪
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-06-14-solar-system-demo-design.md
git commit -m "docs: update design doc for camera tracking"
```

---

### Task 9: 验证

- [ ] **Step 1: 运行类型检查**

```bash
npm run typecheck
```

Expected: PASS，无任何错误。

- [ ] **Step 2: 启动开发服务器手动验证**

```bash
npm run dev
```

验证清单：
1. 放置太阳后用自动搭建放置几个行星
2. 在画布右下角 BodyStatusPanel 点击某一颗行星 → 右侧控制面板出现该天体的编辑区域
3. 点击「设为观测目标」按钮 → 画布相机应将该天体居中显示
4. 运行模拟 → 相机应持续追踪该天体运动
5. 使用方向键旋转视角 → 旋转应围绕该天体执行（而非原点）
6. 点击 ↻ 复位 → 相机应复位到正上方俯瞰追踪的天体
7. 再次点击同一按钮（变为「取消观测目标」）→ 相机恢复追踪原点（太阳）
8. 选中另一个天体并设为观测目标 → 相机切换到新目标，保持当前视角偏移

- [ ] **Step 3: 最终 commit**

```bash
git add -A
git commit -m "feat: add camera tracking with observation target"
```
