# 搭建模式专用天体数据 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建搭建模式专用天体数据模块，所有行星尺寸和轨道半径经预处理优化后呈现于页面，降低搭建难度。探索页面不受影响。

**Architecture:** 新增 `src/engine/buildData.ts` 存放预处理数据；渲染层通过可选参数接收 buildData 半径；评分和自动搭建适配新数据；工具栏和状态面板显示校正标注。

**Tech Stack:** React 18 + TypeScript (strict) + Three.js + Vite + Zustand

---

### Task 1: 创建 `src/engine/buildData.ts` — 预处理天体数据

**Files:**
- Create: `src/engine/buildData.ts`

- [ ] **Step 1: 写入完整 buildData 模块**

```typescript
import { REAL_DATA, PHYSICAL_CONSTANTS } from './constants';
import type { CelestialBodyTemplate, CelestialBodyId, CelestialBodyType } from '../types';

const G = PHYSICAL_CONSTANTS.G;
const MSUN = PHYSICAL_CONSTANTS.sunMass;
const LINEAR_SCALE = 1e-8;

export interface BuildBodyData {
  id: CelestialBodyId;
  name: string;
  type: CelestialBodyType;
  mass: number;
  radius: number;
  semiMajorAxis: number;
  orbitalSpeed: number;
  displayRadius: number;
  displayOrbit: number;
  textureUrl: string;
  isAdjusted: true;
}

function computeOrbitalSpeed(semiMajorAxis: number): number {
  return Math.sqrt((G * MSUN) / semiMajorAxis);
}

const raw: Omit<BuildBodyData, 'orbitalSpeed' | 'isAdjusted'>[] = [
  {
    id: 'sun',
    name: '太阳',
    type: 'star',
    mass: REAL_DATA.sun.mass,
    radius: 7.0e9,
    semiMajorAxis: 0,
    displayRadius: 70,
    displayOrbit: 0,
    textureUrl: '/textures/sun.jpg',
  },
  {
    id: 'mercury',
    name: '水星',
    type: 'planet',
    mass: REAL_DATA.mercury.mass,
    radius: 1.0e9,
    semiMajorAxis: 5.2e9,
    displayRadius: 10,
    displayOrbit: 52,
    textureUrl: '/textures/mercury.jpg',
  },
  {
    id: 'venus',
    name: '金星',
    type: 'planet',
    mass: REAL_DATA.venus.mass,
    radius: 1.4e9,
    semiMajorAxis: 8.8e9,
    displayRadius: 14,
    displayOrbit: 88,
    textureUrl: '/textures/venus.jpg',
  },
  {
    id: 'earth',
    name: '地球',
    type: 'planet',
    mass: REAL_DATA.earth.mass,
    radius: 1.6e9,
    semiMajorAxis: 1.25e10,
    displayRadius: 16,
    displayOrbit: 125,
    textureUrl: '/textures/earth.jpg',
  },
  {
    id: 'mars',
    name: '火星',
    type: 'planet',
    mass: REAL_DATA.mars.mass,
    radius: 1.1e9,
    semiMajorAxis: 1.70e10,
    displayRadius: 11,
    displayOrbit: 170,
    textureUrl: '/textures/mars.jpg',
  },
  {
    id: 'jupiter',
    name: '木星',
    type: 'planet',
    mass: REAL_DATA.jupiter.mass,
    radius: 4.0e9,
    semiMajorAxis: 4.70e10,
    displayRadius: 40,
    displayOrbit: 470,
    textureUrl: '/textures/jupiter.jpg',
  },
  {
    id: 'saturn',
    name: '土星',
    type: 'planet',
    mass: REAL_DATA.saturn.mass,
    radius: 3.5e9,
    semiMajorAxis: 7.80e10,
    displayRadius: 35,
    displayOrbit: 780,
    textureUrl: '/textures/saturn.jpg',
  },
  {
    id: 'uranus',
    name: '天王星',
    type: 'planet',
    mass: REAL_DATA.uranus.mass,
    radius: 2.8e9,
    semiMajorAxis: 1.40e11,
    displayRadius: 28,
    displayOrbit: 1396,
    textureUrl: '/textures/uranus.jpg',
  },
  {
    id: 'neptune',
    name: '海王星',
    type: 'planet',
    mass: REAL_DATA.neptune.mass,
    radius: 2.6e9,
    semiMajorAxis: 2.00e11,
    displayRadius: 26,
    displayOrbit: 2000,
    textureUrl: '/textures/neptune.jpg',
  },
];

export const BUILD_DATA: Record<string, BuildBodyData> = {};
for (const item of raw) {
  BUILD_DATA[item.id] = {
    ...item,
    orbitalSpeed: item.semiMajorAxis > 0 ? computeOrbitalSpeed(item.semiMajorAxis) : 0,
    isAdjusted: true as const,
  };
}

export const BUILD_CELESTIAL_TEMPLATES: CelestialBodyTemplate[] = raw.map(item => ({
  id: item.id,
  name: item.name,
  type: item.type,
  parentId: item.type === 'planet' ? 'sun' : undefined,
  mass: item.mass,
  radius: item.displayRadius,
  textureUrl: item.textureUrl,
  semiMajorAxis: item.displayOrbit > 0 ? item.semiMajorAxis : undefined,
  orbitalSpeed: item.semiMajorAxis > 0 ? computeOrbitalSpeed(item.semiMajorAxis) : undefined,
}));
```

- [ ] **Step 2: 验证 TypeScript 类型检查通过**

```bash
npx tsc --noEmit src/engine/buildData.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/buildData.ts
git commit -m "feat: add buildData module with adjusted celestial body parameters"
```

---

### Task 2: 修改 `src/engine/constants.ts` — 导出 BUILD_CELESTIAL_TEMPLATES

**Files:**
- Modify: `src/engine/constants.ts:447`

- [ ] **Step 1: 添加导出**

在文件末尾 `export const MU_SUN = ...` 之后添加：

```typescript
export { BUILD_CELESTIAL_TEMPLATES } from './buildData';
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/constants.ts
git commit -m "feat: re-export BUILD_CELESTIAL_TEMPLATES from constants"
```

---

### Task 3: 修改 `src/rendering/threejs/bodies.ts` — 支持可选半径覆盖

**Files:**
- Modify: `src/rendering/threejs/bodies.ts:86-88`

- [ ] **Step 1: 为 createBodyMesh 添加可选 radius 参数**

将 `createBodyMesh` 签名从：
```typescript
export function createBodyMesh(
  body: CelestialBody,
  scene: THREE.Scene
): BodyMesh | null {
```
改为：
```typescript
export function createBodyMesh(
  body: CelestialBody,
  scene: THREE.Scene,
  overrideRadius?: number,
): BodyMesh | null {
```

将第 87 行：
```typescript
  const renderRadius = physicalRadiusToRender(data.radius);
```
改为：
```typescript
  const renderRadius = overrideRadius ?? physicalRadiusToRender(data.radius);
```

- [ ] **Step 2: Commit**

```bash
git add src/rendering/threejs/bodies.ts
git commit -m "feat: add optional overrideRadius parameter to createBodyMesh"
```

---

### Task 4: 修改 `src/engine/scoring.ts` — 评分使用 buildData 参考值

**Files:**
- Modify: `src/engine/scoring.ts:1-88`

- [ ] **Step 1: 重构 scoreBuild 接受可选参考数据**

将 `scoreBuild` 函数改为接受第二个可选参数。改动如下：

替换 imports（第1-3行）：
```typescript
import type { CelestialBody, ScoringResult, SingleScore } from '../types';
import { REAL_DATA, PLANET_ORDER, SCORING_CONFIG } from './constants';
import { BUILD_DATA } from './buildData';
import { vec3Length } from './physics';
```

修改 `scoreBuild` 签名和内部逻辑（第13-88行），将所有 `REAL_DATA[body.templateId]` 替换为从 reference map 中取：

```typescript
export function scoreBuild(
  bodies: CelestialBody[],
  referenceData?: Record<string, { mass: number; semiMajorAxis?: number; orbitalSpeed?: number; name: string; type: string }>,
): ScoringResult {
  const refData = referenceData ?? REAL_DATA;
  const config = SCORING_CONFIG;
  const sun = bodies.find(b => b.templateId === 'sun');
  const sunPos = sun?.position;

  const planetBodies = bodies.filter(b => {
    const data = refData[b.templateId];
    return data && data.type === 'planet';
  });

  const sortedPlaced = [...planetBodies].sort(
    (a, b) => orbitRadius(a, sunPos) - orbitRadius(b, sunPos)
  );

  const refPlanets = PLANET_ORDER
    .filter(id => id !== 'sun' && refData[id]?.type === 'planet')
    .map(id => refData[id]);

  const planetScores: Record<string, SingleScore> = {};
  let totalWeightedSum = 0;
  let count = 0;

  for (let i = 0; i < Math.min(sortedPlaced.length, refPlanets.length); i++) {
    const placed = sortedPlaced[i];
    const ref = refPlanets[i];
    const data = refData[placed.templateId];

    const actualR = orbitRadius(placed, sunPos);
    let orbitRadiusScore = 0;
    if (ref.semiMajorAxis && actualR > 0) {
      const radiusError = Math.abs(actualR - (ref.semiMajorAxis ?? 0)) / (ref.semiMajorAxis ?? 1) * 100;
      orbitRadiusScore = Math.max(0, config.orbitRadiusWeight
        * Math.max(0, 1 - radiusError / config.allowedErrorPercent));
    }

    const massError = Math.abs(placed.mass - ref.mass) / ref.mass * 100;
    const massScore = Math.max(0, config.massWeight
      * Math.max(0, 1 - massError / config.allowedErrorPercent));

    const actualSpeed = vec3Length(placed.velocity);
    let velocityScore = 0;
    if (ref.orbitalSpeed) {
      const speedError = Math.abs(actualSpeed - ref.orbitalSpeed) / ref.orbitalSpeed * 100;
      velocityScore = Math.max(0, config.velocityWeight
        * Math.max(0, 1 - speedError / config.allowedErrorPercent));
    }

    const expectedId = PLANET_ORDER[i + 1];
    const orderCorrect = placed.templateId === expectedId;
    const orderScore = orderCorrect ? config.orderWeight : 0;

    const total = (orbitRadiusScore + massScore + velocityScore + orderScore)
      / (config.orbitRadiusWeight + config.massWeight + config.velocityWeight + config.orderWeight);

    planetScores[placed.id] = {
      name: data?.name ?? placed.templateId,
      orbitRadiusScore: Math.round(orbitRadiusScore * 1000) / 1000,
      massScore: Math.round(massScore * 1000) / 1000,
      velocityScore: Math.round(velocityScore * 1000) / 1000,
      orderScore: Math.round(orderScore * 1000) / 1000,
      total: Math.round(total * 1000) / 1000,
    };

    totalWeightedSum += total;
    count++;
  }

  const missingCount = Math.max(0, refPlanets.length - sortedPlaced.length);
  const effectiveCount = count + missingCount;
  const penaltyFactor = effectiveCount > 0 ? count / effectiveCount : 0;
  const totalScore = count > 0
    ? Math.round(Math.max(0, Math.min(100, (totalWeightedSum / count) * 100 * penaltyFactor)))
    : 0;

  return { totalScore, planetScores };
}
```

同样修改 `calculateErrors` 函数（第90-124行），接受可选参考数据：

```typescript
export function calculateErrors(
  bodies: CelestialBody[],
  referenceData?: Record<string, { mass: number; semiMajorAxis?: number; orbitalSpeed?: number; name: string; type: string }>,
): Record<string, {
  name: string;
  orbitRadiusError: number;
  massError: number;
  speedError: number;
}> {
  const refData = referenceData ?? REAL_DATA;
  const sun = bodies.find(b => b.templateId === 'sun');
  const sunPos = sun?.position;
  const errors: Record<string, ReturnType<typeof calculateErrors>[string]> = {};

  for (const body of bodies) {
    const data = refData[body.templateId];
    if (!data || data.type === 'star') continue;

    const actualR = orbitRadius(body, sunPos);
    const actualSpeed = vec3Length(body.velocity);

    const orbitRadiusError = data.semiMajorAxis
      ? Math.abs(actualR - data.semiMajorAxis) / data.semiMajorAxis * 100
      : 0;
    const massError = Math.abs(body.mass - data.mass) / data.mass * 100;
    const speedError = data.orbitalSpeed
      ? Math.abs(actualSpeed - data.orbitalSpeed) / data.orbitalSpeed * 100
      : 0;

    errors[body.id] = {
      name: data.name,
      orbitRadiusError: Math.round(orbitRadiusError * 100) / 100,
      massError: Math.round(massError * 100) / 100,
      speedError: Math.round(speedError * 100) / 100,
    };
  }

  return errors;
}
```

- [ ] **Step 2: 验证 TypeScript 类型检查**

```bash
npx tsc --noEmit src/engine/scoring.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/scoring.ts
git commit -m "feat: scoring functions accept optional reference data parameter"
```

---

### Task 5: 修改 `src/stores/buildStore.ts` — completeBuild 传入 BUILD_DATA

**Files:**
- Modify: `src/stores/buildStore.ts:1-4, 79-89`

- [ ] **Step 1: 添加 BUILD_DATA 导入并在 completeBuild 中使用**

第1-3行，添加 buildData import：
```typescript
import { create } from 'zustand';
import type { BuildState, CelestialBody } from '../types';
import { scoreBuild } from '../engine/scoring';
import { BUILD_DATA } from '../engine/buildData';
import { advanceSimulation as engineAdvanceSimulation } from '../engine/physics';
import { PHYSICAL_CONSTANTS } from '../engine/constants';
```

第84行 `completeBuild` 中，将：
```typescript
    const result = scoreBuild(state.bodies);
```
改为：
```typescript
    const result = scoreBuild(state.bodies, BUILD_DATA);
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/buildStore.ts
git commit -m "feat: completeBuild uses BUILD_DATA as scoring reference"
```

---

### Task 6: 修改 `src/components/builder/ScoreModal.tsx` — 导入 buildData 并显示标注

**Files:**
- Modify: `src/components/builder/ScoreModal.tsx:1-5, 15, 28-31`

- [ ] **Step 1: 更新 ScoreModal**

第3行，将 `scoreBuild` 导入保持不变（仍从 scoring 导入），添加 BUILD_DATA 导入：
```typescript
import { useUIStore } from '../../stores/uiStore';
import { useBuildStore } from '../../stores/buildStore';
import { scoreBuild } from '../../engine/scoring';
import { BUILD_DATA } from '../../engine/buildData';
import './ScoreModal.css';
```

第15行，将：
```typescript
  const result = scoreBuild(bodies);
```
改为：
```typescript
  const result = scoreBuild(bodies, BUILD_DATA);
```

在 `<h2>` 标题下方添加校正提示（第31行之后插入）：
```tsx
        <h2>搭建完成！{scoreEmoji}</h2>
        <p className="score-adjusted-note">※ 评分标准为校正后数据，与真实值有出入</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/ScoreModal.tsx
git commit -m "feat: ScoreModal uses BUILD_DATA and shows adjusted data note"
```

---

### Task 7: 修改 `src/components/builder/ControlPanel.tsx` — 监督模式使用 BUILD_DATA

**Files:**
- Modify: `src/components/builder/ControlPanel.tsx:1-6, 78-80`

- [ ] **Step 1: 更新监督模式**

第5行添加导入：
```typescript
import { BUILD_DATA } from '../../engine/buildData';
```

第78-80行，将：
```typescript
  const errors = uiStore.supervisionMode
    ? calculateErrors(buildStore.bodies)
    : null;
```
改为：
```typescript
  const errors = uiStore.supervisionMode
    ? calculateErrors(buildStore.bodies, BUILD_DATA)
    : null;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/ControlPanel.tsx
git commit -m "feat: supervision mode uses BUILD_DATA as reference"
```

---

### Task 8: 修改 `src/components/builder/CelestialToolbar.tsx` — 使用 BUILD_CELESTIAL_TEMPLATES

**Files:**
- Modify: `src/components/builder/CelestialToolbar.tsx:1-5`

- [ ] **Step 1: 使用 buildData 模板并添加校正标注**

第4行，将：
```typescript
import { CELESTIAL_TEMPLATES } from '../../engine/constants';
```
改为：
```typescript
import { BUILD_CELESTIAL_TEMPLATES } from '../../engine/constants';
```

将所有 `CELESTIAL_TEMPLATES` 引用改为 `BUILD_CELESTIAL_TEMPLATES`（出现在第50-52行、第67行）。

在 ToolbarItem 的 `.item-name` 后面添加校正标注。找到第44行：
```tsx
      <span className="item-name">{template.name}</span>
```
改为：
```tsx
      <span className="item-name">{template.name}</span>
      <span className="item-adjusted-note">※校正</span>
```

在 toolbar-header 下方添加全局标注。找到第80行：
```tsx
      <div className="toolbar-header">天体工具栏</div>
```
改为：
```tsx
      <div className="toolbar-header">天体工具栏</div>
      <div className="toolbar-adjusted-tip">※ 数据已校正，便于搭建</div>
```

- [ ] **Step 2: 添加 CSS 样式**

Read `src/components/builder/CelestialToolbar.css` 后在末尾添加：

```css
.toolbar-adjusted-tip {
  font-size: 10px;
  color: #888;
  padding: 4px 8px 6px;
  text-align: center;
}

.item-adjusted-note {
  font-size: 9px;
  color: #999;
  margin-left: auto;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/builder/CelestialToolbar.tsx src/components/builder/CelestialToolbar.css
git commit -m "feat: CelestialToolbar uses BUILD_CELESTIAL_TEMPLATES with adjusted note"
```

---

### Task 9: 修改 `src/engine/autoBuild.ts` — 添加基于 buildData 的自动搭建

**Files:**
- Modify: `src/engine/autoBuild.ts:1-81`

- [ ] **Step 1: 在文件顶部添加 BUILD_DATA 导入**

将第1行：
```typescript
import { REAL_DATA, MU_SUN } from './constants';
```
改为：
```typescript
import { REAL_DATA, MU_SUN } from './constants';
import { BUILD_DATA } from './buildData';
```

- [ ] **Step 2: 在文件末尾添加 computeAutoBuildPlanForBuild 函数**

在文件末尾 `return plan;` 之后添加：

```typescript
export function computeAutoBuildPlanForBuild(): AutoBuildStep[] {
  const plan: AutoBuildStep[] = [];

  const sunData = BUILD_DATA.sun;
  plan.push({
    templateId: 'sun',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    mass: sunData.mass,
    rotationSpeed: 0,
    rotationPhase: 0,
  });

  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  for (let i = 0; i < planetIds.length; i++) {
    const id = planetIds[i];
    const data = BUILD_DATA[id];
    if (!data || data.semiMajorAxis <= 0) continue;

    const angle = (i / planetIds.length) * Math.PI * 2;
    const x = data.semiMajorAxis * Math.cos(angle);
    const y = data.semiMajorAxis * Math.sin(angle);

    const tangentAngle = angle + Math.PI / 2;
    const vx = data.orbitalSpeed * Math.cos(tangentAngle);
    const vy = data.orbitalSpeed * Math.sin(tangentAngle);

    plan.push({
      templateId: id,
      position: [x, y, 0],
      velocity: [vx, vy, 0],
      mass: data.mass,
      rotationSpeed: 0,
      rotationPhase: 0,
    });
  }

  return plan;
}
```

- [ ] **Step 3: 验证 TypeScript**

```bash
npx tsc --noEmit src/engine/autoBuild.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/autoBuild.ts
git commit -m "feat: add computeAutoBuildPlanForBuild using buildData"
```

---

### Task 10: 修改 `src/hooks/useRestore.ts` — 使用 buildData 自动搭建

**Files:**
- Modify: `src/hooks/useRestore.ts:1-5, 16`

- [ ] **Step 1: 切换 automatic build 函数**

第4行，将：
```typescript
import { computeAutoBuildPlan } from '../engine/autoBuild';
```
改为：
```typescript
import { computeAutoBuildPlanForBuild } from '../engine/autoBuild';
```

第16行，将：
```typescript
    const plan = computeAutoBuildPlan(Date.now());
```
改为：
```typescript
    const plan = computeAutoBuildPlanForBuild();
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useRestore.ts
git commit -m "feat: useRestore uses computeAutoBuildPlanForBuild"
```

---

### Task 11: 修改 `src/components/builder/BuilderCanvas.tsx` — 渲染和预览使用 buildData

**Files:**
- Modify: `src/components/builder/BuilderCanvas.tsx:1-14, 57-64, 74, 143, 222, 278-297, 332, 370-401`

- [ ] **Step 1: 添加 buildData 导入**

在 imports 中添加（紧接第6行 `REAL_DATA` import 之后）：
```typescript
import { BUILD_DATA } from '../../engine/buildData';
```

- [ ] **Step 2: 参考轨道的添加改为使用 buildData**

第57-64行，将 REAL_DATA 的轨道圈改为 BUILD_DATA：
```typescript
    const ls = getLinearScale();
    for (const [, data] of Object.entries(BUILD_DATA)) {
      if (data.semiMajorAxis && data.semiMajorAxis > 0) {
        addOrbitRing(scene, data.semiMajorAxis * ls, 0x334455);
      }
    }
```

- [ ] **Step 3: 初始化 body mesh 时传入 buildData 半径**

第74行，将：
```typescript
      createBodyMesh(body, scene);
```
改为：
```typescript
      createBodyMesh(body, scene, BUILD_DATA[body.templateId]?.displayRadius);
```

- [ ] **Step 4: 运行时添加 body mesh 时传入半径**

第143行，将：
```typescript
        createBodyMesh(body, scene);
```
改为：
```typescript
        createBodyMesh(body, scene, BUILD_DATA[body.templateId]?.displayRadius);
```

- [ ] **Step 5: 漂浮预览使用 buildData 半径**

第332行，将 `REAL_DATA[selectedToolId]` 改为 `BUILD_DATA[selectedToolId]`：
```typescript
            const data = selectedToolId ? BUILD_DATA[selectedToolId] : null;
```

第334行，将 `data.radius` 改为 `data.displayRadius`：
```typescript
              const renderRadius = data.displayRadius;
```

- [ ] **Step 6: 放置时质量取 buildData**

第222-223行，将：
```typescript
    const data = REAL_DATA[toolId];
    const buildState = useBuildStore.getState();
    buildState.placeBody(toolId, [px, py, pz], vel, data?.mass ?? 1e24);
```
改为：
```typescript
    const data = BUILD_DATA[toolId];
    const buildState = useBuildStore.getState();
    buildState.placeBody(toolId, [px, py, pz], vel, data?.mass ?? 1e24);
```

- [ ] **Step 7: 预览弹窗信息使用 buildData**

第278-297行，将 `computeOrbitPrediction` 中 `REAL_DATA` 引用改为 `BUILD_DATA`：

第282行改为：
```typescript
    const data = BUILD_DATA[selectedToolId];
```

第370-401行预览弹窗中的 `REAL_DATA` 引用，将：
```tsx
            {REAL_DATA[selectedToolId]?.name ?? selectedToolId}
```
改为：
```tsx
            {BUILD_DATA[selectedToolId]?.name ?? selectedToolId}
```

将：
```tsx
            <span>{selectedToolId && REAL_DATA[selectedToolId]?.orbitalSpeed ? ... }</span>
```
改为：
```tsx
            <span>{selectedToolId && BUILD_DATA[selectedToolId]?.orbitalSpeed ? (BUILD_DATA[selectedToolId]!.orbitalSpeed / 1000).toFixed(1) + ' km/s' : '-'}</span>
```

- [ ] **Step 8: Commit**

```bash
git add src/components/builder/BuilderCanvas.tsx
git commit -m "feat: BuilderCanvas uses BUILD_DATA for rendering, orbit rings, preview and placement"
```

---

### Task 12: 修改 `src/components/builder/BodyStatusPanel.tsx` — 使用 BUILD_CELESTIAL_TEMPLATES

**Files:**
- Modify: `src/components/builder/BodyStatusPanel.tsx:1-5`

- [ ] **Step 1: 将模板引用切换到 BUILD_CELESTIAL_TEMPLATES**

第4行，将：
```typescript
import { CELESTIAL_TEMPLATES } from '../../engine/constants';
```
改为：
```typescript
import { BUILD_CELESTIAL_TEMPLATES } from '../../engine/constants';
```

将所有 `CELESTIAL_TEMPLATES` 引用改为 `BUILD_CELESTIAL_TEMPLATES`（第21行）。

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/BodyStatusPanel.tsx
git commit -m "feat: BodyStatusPanel uses BUILD_CELESTIAL_TEMPLATES"
```

---

### Task 13: 运行 typecheck 验证全部修改

- [ ] **Step 1: 全量类型检查**

```bash
npm run typecheck
```

Expected: 无错误通过。

- [ ] **Step 2: 运行构建验证**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: typecheck and build verification"
```

---

### Task 14: 给 ScoreModal 校正提示添加 CSS 样式

**Files:**
- Modify: `src/components/builder/ScoreModal.css`

- [ ] **Step 1: 检查并添加样式**

Read `src/components/builder/ScoreModal.css` 后在末尾添加：

```css
.score-adjusted-note {
  text-align: center;
  font-size: 11px;
  color: #999;
  margin: -8px 0 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/ScoreModal.css
git commit -m "style: add adjusted note styling to ScoreModal"
```
