# 探索模式当前目标解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以独立的全局当前目标替换导航计划与巡航/T 档之间的直接耦合，使三阶段导航可以连续推进、时间跳跃不重置后续阶段，并在第三阶段交接至绕飞插入。

**Architecture:** 新建纯引擎 `currentTarget.ts`，负责定义和实时解析静态点、天体相对球壳和绕飞插入目标；新建独立 Zustand store 保存目标定义和 revision。导航仍在 `spaceshipStore` 中维护目的地、汇合计划和阶段，但只通过当前目标 store 发布状态；巡航、T 档、目标姿态、Dashboard 和 MiniMap 只消费目标解析结果。

**Tech Stack:** React 19、TypeScript strict、Zustand 5、Vitest、Three.js。引擎层使用 AU / AU/s / 秒，TSX 层仅做展示和事件转发。

**Design:** `docs/specs/2026-07-12-explore-current-target-decoupling-design.md`

---

## File Structure

- Create: `src/engine/bodyState.ts` - 目标天体位置、速度、Hill 半径和安全绕飞半径的纯查询。
- Create: `src/engine/currentTarget.ts` - `CurrentTarget`、`ResolvedCurrentTarget` 与实时解析函数。
- Create: `src/engine/__tests__/currentTarget.test.ts` - 三类目标解析与退化几何测试。
- Create: `src/stores/currentTargetStore.ts` - 当前目标全局 Zustand state、revision 和公开 API。
- Create: `src/stores/__tests__/currentTargetStore.test.ts` - 设置、替换、清理和 revision 测试。
- Modify: `src/engine/navigation.ts` - 改用 body state 工具；导航阶段使用 `CurrentTarget` 语义，保留兼容的展示/相对状态函数。
- Modify: `src/engine/cruise.ts` - 输入与命名改为通用 `ResolvedCurrentTarget`。
- Modify: `src/engine/__tests__/navigation.test.ts` - 更新 body state 导入，并增加轨道插入完成条件测试。
- Modify: `src/engine/__tests__/cruise.test.ts` - 从汇合点计划测试迁移为当前目标解析结果测试。
- Modify: `src/types/index.ts` - 用 `'current-target'` 取代 `'rendezvous'` 姿态模式。
- Modify: `src/stores/spaceshipStore.ts` - 导航设置目标、阶段推进、重规划收紧、巡航/T 档只读取目标 store、时间跳跃不重置阶段。
- Modify: `src/stores/__tests__/spaceshipStore.test.ts` - 覆盖三阶段、时间跳跃、P 档解耦、巡航/T 档目标读取。
- Modify: `src/components/explore/ExploreCanvas.tsx` - 用当前目标控制姿态，物理步进和时间跳跃后统一更新导航。
- Modify: `src/components/explore/Dashboard.tsx` - 基于当前目标启用巡航/T 档，改为“指向当前目标”。
- Modify: `src/components/explore/MiniMap.tsx` - 用当前目标解析结果绘制当前导航标记，保留静态汇合点的脉冲样式。
- Modify: `docs/specs/2026-07-06-explore-rendezvous-only-navigation-design.md` - 以本设计替换已过时的 current target/P 档语义。
- Modify: `docs/specs/2026-07-07-explore-cruise-mode-design.md` - 更新巡航的目标来源、连续推进和阶段 3 绕飞交接。

## Task 1: Extract Body-State Dependencies

**Files:**
- Create: `src/engine/bodyState.ts`
- Modify: `src/engine/navigation.ts`
- Modify: `src/engine/__tests__/navigation.test.ts`

- [ ] **Step 1: Write failing body-state tests**

Create `src/engine/__tests__/bodyState.test.ts` with the following assertions:

```ts
import { describe, expect, it } from 'vitest';
import { AU_TO_KM, REAL_DATA } from '../constants';
import {
  computeBodyState,
  hillRadiusForBody,
  safeOrbitRadiusForBody,
} from '../bodyState';

describe('bodyState helpers', () => {
  it('propagates Mars to a finite heliocentric state', () => {
    const state = computeBodyState('mars', 2461172.5);
    expect(state).not.toBeNull();
    expect(state?.position.every(Number.isFinite)).toBe(true);
    expect(state?.velocity.every(Number.isFinite)).toBe(true);
  });

  it('returns the Hill radius and safe orbit radius in AU', () => {
    expect(hillRadiusForBody('mars')).toBeGreaterThan(0);
    expect(safeOrbitRadiusForBody('mars')).toBeCloseTo(
      REAL_DATA.mars.radius + 20_000 / AU_TO_KM,
      12,
    );
  });

  it('handles the Sun and unknown body IDs explicitly', () => {
    expect(hillRadiusForBody('sun')).toBe(Infinity);
    expect(hillRadiusForBody('unknown')).toBe(0);
    expect(safeOrbitRadiusForBody('unknown')).toBe(0);
    expect(computeBodyState('unknown', 2461172.5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test to verify failure**

Run: `npm test -- --run src/engine/__tests__/bodyState.test.ts`

Expected: FAIL because `../bodyState` does not exist.

- [ ] **Step 3: Create the pure body-state module**

Move the existing Kepler propagation implementation from `navigation.ts` into `src/engine/bodyState.ts`. Export exactly:

```ts
export function computeBodyState(
  templateId: string,
  jd: number,
): { position: [number, number, number]; velocity: [number, number, number] } | null;

export function hillRadiusForBody(bodyId: string): number;

export function safeOrbitRadiusForBody(bodyId: string): number;
```

Keep the existing formulas unchanged: Kepler propagation must use `MU_SUN_AU`; Hill radius must use `a * cbrt(m / (3 * M_sun))`; safe orbit radius must be physical radius plus `20_000 / AU_TO_KM`. Update `navigation.ts` imports and re-export these three functions from `navigation.ts` during this migration so existing callers and tests remain source-compatible.

- [ ] **Step 4: Run focused engine tests**

Run: `npm test -- --run src/engine/__tests__/bodyState.test.ts src/engine/__tests__/navigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the extracted dependency**

```bash
git add src/engine/bodyState.ts src/engine/__tests__/bodyState.test.ts src/engine/navigation.ts src/engine/__tests__/navigation.test.ts
git commit -m "refactor: extract exploration body state helpers"
```

## Task 2: Add Current-Target Engine Contract and Store

**Files:**
- Create: `src/engine/currentTarget.ts`
- Create: `src/engine/__tests__/currentTarget.test.ts`
- Create: `src/stores/currentTargetStore.ts`
- Create: `src/stores/__tests__/currentTargetStore.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `src/engine/__tests__/currentTarget.test.ts` with static point, shell and orbit insertion cases:

```ts
import { describe, expect, it } from 'vitest';
import { computeBodyState } from '../bodyState';
import {
  resolveCurrentTarget,
  type CurrentTarget,
} from '../currentTarget';

const context = {
  shipPositionAU: [1, 0, 0] as [number, number, number],
  simulatedTime: Date.UTC(2027, 4, 13, 6),
};

describe('resolveCurrentTarget', () => {
  it('resolves a static point with zero velocity', () => {
    const target: CurrentTarget = {
      kind: 'static-point', positionAU: [2, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue',
    };
    const resolved = resolveCurrentTarget(target, context);
    expect(resolved?.positionAU).toEqual([2, 0, 0]);
    expect(resolved?.velocityAUPerSec).toEqual([0, 0, 0]);
    expect(resolved?.distanceAU).toBeCloseTo(1, 12);
  });

  it('resolves a body-relative shell at the near-side radial intersection', () => {
    const state = computeBodyState('mars', 2461172.5);
    expect(state).not.toBeNull();
    if (!state) return;
    const target: CurrentTarget = {
      kind: 'body-relative-shell', bodyId: 'mars', radiusAU: 0.01, arrivalRadiusAU: 0.001, arrivalPolicy: 'continue',
    };
    const resolved = resolveCurrentTarget(target, {
      shipPositionAU: [state.position[0] + 0.02, state.position[1], state.position[2]],
      simulatedTime: Date.UTC(2027, 4, 13, 6),
    });
    expect(resolved?.positionAU[0]).toBeCloseTo(state.position[0] + 0.01, 12);
    expect(resolved?.velocityAUPerSec).toEqual(state.velocity);
  });

  it('preserves orbit-insertion metadata while resolving the same shell position', () => {
    const target: CurrentTarget = {
      kind: 'orbit-insertion', bodyId: 'mars', radiusAU: 0.01, arrivalRadiusAU: 0.001, arrivalPolicy: 'orbit-insertion',
    };
    expect(resolveCurrentTarget(target, context)?.source.kind).toBe('orbit-insertion');
  });
});
```

- [ ] **Step 2: Run the resolver test to verify failure**

Run: `npm test -- --run src/engine/__tests__/currentTarget.test.ts`

Expected: FAIL because `currentTarget.ts` does not exist.

- [ ] **Step 3: Implement types and resolution**

Create `src/engine/currentTarget.ts` with these public types and functions:

```ts
export type TargetArrivalPolicy = 'continue' | 'orbit-insertion';

export type CurrentTarget =
  | { kind: 'static-point'; positionAU: [number, number, number]; arrivalRadiusAU: number; arrivalPolicy: 'continue' }
  | { kind: 'body-relative-shell'; bodyId: string; radiusAU: number; arrivalRadiusAU: number; arrivalPolicy: 'continue' }
  | { kind: 'orbit-insertion'; bodyId: string; radiusAU: number; arrivalRadiusAU: number; arrivalPolicy: 'orbit-insertion' };

export interface CurrentTargetContext {
  shipPositionAU: [number, number, number];
  simulatedTime: number;
}

export interface ResolvedCurrentTarget {
  source: CurrentTarget;
  positionAU: [number, number, number];
  velocityAUPerSec: [number, number, number];
  directionFromShip: [number, number, number];
  distanceAU: number;
}

export function resolveCurrentTarget(
  target: CurrentTarget | null,
  context: CurrentTargetContext,
): ResolvedCurrentTarget | null;
```

Use `computeBodyState` from `bodyState.ts`; return `null` for unavailable body state or zero-length ship-to-target direction. The shell point must use the outward vector from body center to ship, multiplied by `radiusAU`.

- [ ] **Step 4: Write failing current-target store tests**

Create `src/stores/__tests__/currentTargetStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useCurrentTargetStore } from '../currentTargetStore';

describe('currentTargetStore', () => {
  beforeEach(() => useCurrentTargetStore.getState().reset());

  it('sets a target and increments revision for every replacement', () => {
    const store = useCurrentTargetStore.getState();
    store.setCurrentTarget({ kind: 'static-point', positionAU: [1, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' });
    const firstRevision = useCurrentTargetStore.getState().revision;
    useCurrentTargetStore.getState().setCurrentTarget({ kind: 'static-point', positionAU: [2, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' });
    expect(useCurrentTargetStore.getState().revision).toBe(firstRevision + 1);
    expect(useCurrentTargetStore.getState().target?.kind).toBe('static-point');
  });

  it('clears the target without resetting the revision', () => {
    useCurrentTargetStore.getState().setCurrentTarget({ kind: 'static-point', positionAU: [1, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' });
    const revision = useCurrentTargetStore.getState().revision;
    useCurrentTargetStore.getState().clearCurrentTarget();
    expect(useCurrentTargetStore.getState().target).toBeNull();
    expect(useCurrentTargetStore.getState().revision).toBe(revision + 1);
  });
});
```

- [ ] **Step 5: Implement the target store**

Create `src/stores/currentTargetStore.ts` following `exploreStore.ts` conventions. Store `{ target: CurrentTarget | null, revision: number }`, expose `setCurrentTarget`, `clearCurrentTarget`, `resolve(context)` and `reset`. `setCurrentTarget` and `clearCurrentTarget` must increment `revision`; `resolve` must call the pure `resolveCurrentTarget` function and must not cache resolved positions.

- [ ] **Step 6: Run target tests and commit**

Run: `npm test -- --run src/engine/__tests__/currentTarget.test.ts src/stores/__tests__/currentTargetStore.test.ts`

Expected: PASS.

```bash
git add src/engine/currentTarget.ts src/engine/__tests__/currentTarget.test.ts src/stores/currentTargetStore.ts src/stores/__tests__/currentTargetStore.test.ts
git commit -m "feat: add global exploration current target"
```

## Task 3: Move Navigation to Target Publication and Three-Stage Transitions

**Files:**
- Modify: `src/engine/navigation.ts`
- Modify: `src/stores/spaceshipStore.ts`
- Modify: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: Write failing navigation lifecycle tests**

Add these tests to `src/stores/__tests__/spaceshipStore.test.ts`:

```ts
it('moves from rendezvous to the Hill shell without engaging P when the ship arrives first', () => {
  const plan = makeDirectPlan([1.04, 0, 0]);
  useSpaceshipStore.setState({
    navigationPlan: plan, currentNavigationStageIndex: 0, targetBodyId: 'mars',
    position: [1, 0, 0], velocity: [1e-6, 0, 0], gear: 'N',
    simulatedTime: plan.plannedAt,
  });
  useSpaceshipStore.getState().updateNavigation();
  expect(useSpaceshipStore.getState().currentNavigationStageIndex).toBe(1);
  expect(useSpaceshipStore.getState().gear).toBe('N');
  expect(useCurrentTargetStore.getState().target).toMatchObject({ kind: 'body-relative-shell', bodyId: 'mars' });
});

it('moves directly to orbit insertion when ship and destination arrive in the same update', () => {
  const plan = makeDirectPlan([1.04, 0, 0]);
  plan.rendezvous!.rendezvousTime = plan.plannedAt;
  useSpaceshipStore.setState({ navigationPlan: plan, currentNavigationStageIndex: 0, targetBodyId: 'mars', position: [1, 0, 0] });
  useSpaceshipStore.getState().updateNavigation();
  expect(useSpaceshipStore.getState().currentNavigationStageIndex).toBe(2);
  expect(useCurrentTargetStore.getState().target?.kind).toBe('orbit-insertion');
});

it('keeps the stage-two shell target across a time jump', () => {
  const now = Date.UTC(2027, 4, 13, 6);
  const mars = computeBodyState('mars', julianDate(now));
  expect(mars).not.toBeNull();
  if (!mars) return;
  const plan = makeDirectPlan([2, 0, 0]);
  useSpaceshipStore.setState({
    navigationPlan: {
      destinationId: plan.destinationId,
      plannedAt: plan.plannedAt,
      stages: plan.stages,
    },
    currentNavigationStageIndex: 1,
    targetBodyId: 'mars', simulatedTime: now, orbitingBodyId: 'sun',
    position: [mars.position[0] + 0.02, mars.position[1], mars.position[2]],
    velocity: mars.velocity, gear: 'N',
  });
  useCurrentTargetStore.getState().setCurrentTarget({
    kind: 'body-relative-shell', bodyId: 'mars', radiusAU: hillRadiusForBody('mars'),
    arrivalRadiusAU: Math.max(10_000 / AU_TO_KM, hillRadiusForBody('mars') * 0.05),
    arrivalPolicy: 'continue',
  });
  useSpaceshipStore.getState().timeJump(useSpaceshipStore.getState().simulatedTime + 3600_000);
  expect(useSpaceshipStore.getState().currentNavigationStageIndex).toBe(1);
  expect(useCurrentTargetStore.getState().target?.kind).toBe('body-relative-shell');
});
```

- [ ] **Step 2: Run the lifecycle tests to verify failure**

Run: `npm test -- --run src/stores/__tests__/spaceshipStore.test.ts`

Expected: FAIL because `updateNavigation` and `useCurrentTargetStore` integration do not exist, and existing stage completion engages P.

- [ ] **Step 3: Replace navigation target state with current-target publication**

In `navigation.ts`, replace `NavigationTarget` stage target fields with `CurrentTarget` definitions. Keep `NavigationPlan` responsible for `destinationId`, `plannedAt`, `rendezvous` and `stages`; remove `resolveCurrentNavigationTarget` and `navigationTargetArrivalDistanceAU` after all consumers migrate.

In `spaceshipStore.ts`:

1. Remove `currentNavigationTarget` from `SpaceshipStore`, initial state, reset and tests.
2. Add `updateNavigation(): void` to perform all stage transitions after each physical advance or time jump.
3. Have `setTargetBody` and `replanNavigation` publish the stage-one static target.
4. When stage one completes before `rendezvousTime`, publish a `body-relative-shell` using `hillRadiusForBody(destinationId)` and increment the stage index; do not call `setGear('P')`.
5. When stage one completes at or after `rendezvousTime`, publish `orbit-insertion` using `safeOrbitRadiusForBody(destinationId)` and set stage index 2.
6. When stage two completes, publish the same `orbit-insertion` target and set stage index 2.
7. Restrict re-planning to `currentNavigationStageIndex === 0`, a static target, an expired rendezvous time, no ship arrival, and no destination capture.
8. Make `timeJump` update only ship state and simulation time, then call `updateNavigation`; remove the branch that creates a fresh plan when `plan.rendezvous` is absent.

Use a single helper to construct each stage target so `setTargetBody`, `replanNavigation` and `updateNavigation` cannot disagree on target radius or arrival policy.

- [ ] **Step 4: Add stage-three completion test and implementation**

Add a test in `spaceshipStore.test.ts` that resolves Mars at a fixed `simulatedTime`, creates a ship position at `safeOrbitRadiusForBody('mars')`, and sets its velocity to Mars velocity plus `sqrt(G_AU * marsMass / safeOrbitRadius)` along the local tangent. Confirm `orbitInsertSnapshot(shipPosition, shipVelocity, marsBody, marsState.velocity).converged === true`, then set the stage-three `orbit-insertion` target and `orbitingBodyId: 'mars'`. Invoke `updateNavigation()` and assert `currentNavigationStageIndex === null` and `useCurrentTargetStore.getState().target === null`.

Update `updateNavigation` to check stage-three completion with the existing O-stage convergence calculation and clear the target only after it converges. Do not clear `targetBodyId`; Dashboard must continue to show target-relative status.

- [ ] **Step 5: Run navigation store tests and commit**

Run: `npm test -- --run src/stores/__tests__/spaceshipStore.test.ts src/engine/__tests__/navigation.test.ts`

Expected: PASS, including stage one -> two, same-update one -> three, stage two -> three, stage-three completion and stage-two time-jump retention.

```bash
git add src/engine/navigation.ts src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts src/engine/__tests__/navigation.test.ts
git commit -m "feat: drive exploration navigation through current targets"
```

## Task 4: Decouple Cruise and T Gear From Navigation

**Files:**
- Modify: `src/engine/cruise.ts`
- Modify: `src/engine/__tests__/cruise.test.ts`
- Modify: `src/stores/spaceshipStore.ts`
- Modify: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: Write failing generic-target cruise tests**

Replace direct-plan helpers in `src/engine/__tests__/cruise.test.ts` with:

```ts
const target: ResolvedCurrentTarget = {
  source: { kind: 'static-point', positionAU: [2, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' },
  positionAU: [2, 0, 0], velocityAUPerSec: [0, 0, 0],
  directionFromShip: [1, 0, 0], distanceAU: 1,
};

it('enables cruise from any resolvable current target with positive radial speed', () => {
  expect(canEnableCruise([1, 0, 0], [1e-6, 0, 0], target)).toBe(true);
});

it('computes shell-target relative velocity using target velocity', () => {
  const movingTarget: ResolvedCurrentTarget = {
    source: target.source,
    positionAU: [2, 0, 0],
    velocityAUPerSec: [5e-7, 0, 0],
    directionFromShip: [1, 0, 0],
    distanceAU: 1,
  };
  expect(computeCruiseGuidance([1, 0, 0], [1e-6, 0, 0], movingTarget).radialSpeedAUPerSec).toBeCloseTo(5e-7, 12);
});
```

- [ ] **Step 2: Run the cruise test to verify failure**

Run: `npm test -- --run src/engine/__tests__/cruise.test.ts`

Expected: FAIL until cruise APIs accept `ResolvedCurrentTarget`.

- [ ] **Step 3: Generalize cruise engine names and inputs**

Change `computeCruiseGuidance` and `canEnableCruise` to accept `ResolvedCurrentTarget | null` only. Rename all public `rendezvous` fields in `CruiseGuidance` to `target` equivalents:

```ts
targetDirection: [number, number, number];
distanceToTargetAU: number;
```

Keep the current stop-distance, T-ratio and time-jump mathematics unchanged. The function must use `velocity - target.velocityAUPerSec` for all radial/tangential values.

- [ ] **Step 4: Migrate store consumers and target revision handling**

In `spaceshipStore.ts`, resolve the target only through `useCurrentTargetStore.getState().resolve({ shipPositionAU: position, simulatedTime })`.

Add `cruiseTargetRevision: number | null` to cruise state. On enabling cruise, record the current target revision and set attitude to `'current-target'`. In `updateCruise`, if the revision differs, clear the old next-jump time, retain cruise only when the new resolved target has `arrivalPolicy: 'continue'`, and recompute from the new target. If the target has `arrivalPolicy: 'orbit-insertion'`, end cruise and request O gear only when the ship is inside the destination Hill range; otherwise leave the gear unchanged and let the user begin O manually.

Update `directTangentialSpeedSnapshot` to accept `ResolvedCurrentTarget`, and make T gear return to N when the current target is absent. It must not read `NavigationPlan`, `targetBodyId` or the stage index.

- [ ] **Step 5: Add store regressions and run tests**

Add tests proving:

```ts
it('recomputes cruise after the current target revision changes without entering P', () => {
  useSpaceshipStore.setState({
    position: [1, 0, 0], velocity: [1e-6, 0, 0], gear: 'N', cruiseActive: true,
    cruisePhase: 'coasting', cruiseNextJumpAtMs: 0, orbitingBodyId: 'sun',
  });
  useCurrentTargetStore.getState().setCurrentTarget({
    kind: 'static-point', positionAU: [2, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue',
  });
  useSpaceshipStore.setState({ cruiseTargetRevision: useCurrentTargetStore.getState().revision });
  useCurrentTargetStore.getState().setCurrentTarget({
    kind: 'body-relative-shell', bodyId: 'mars', radiusAU: 0.01,
    arrivalRadiusAU: 0.001, arrivalPolicy: 'continue',
  });
  useSpaceshipStore.getState().updateCruise(2_000);
  expect(useSpaceshipStore.getState().gear).not.toBe('P');
  expect(useSpaceshipStore.getState().cruiseTargetRevision).toBe(useCurrentTargetStore.getState().revision);
});

it('uses the current target store for T gear after navigation plan data is removed', () => {
  useSpaceshipStore.setState({ navigationPlan: null, position: [1, 0, 0], velocity: [0, 1e-6, 0], gear: 'N' });
  useCurrentTargetStore.getState().setCurrentTarget({ kind: 'static-point', positionAU: [2, 0, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' });
  useSpaceshipStore.getState().setGear('T');
  useSpaceshipStore.getState().updateTangentialCorrectionGear();
  expect(useSpaceshipStore.getState().gear).toBe('T');
});
```

Run: `npm test -- --run src/engine/__tests__/cruise.test.ts src/stores/__tests__/spaceshipStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit control decoupling**

```bash
git add src/engine/cruise.ts src/engine/__tests__/cruise.test.ts src/stores/spaceshipStore.ts src/stores/__tests__/spaceshipStore.test.ts
git commit -m "refactor: decouple cruise and T gear from navigation"
```

## Task 5: Migrate Target Attitude, Dashboard and MiniMap

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/explore/ExploreCanvas.tsx`
- Modify: `src/components/explore/Dashboard.tsx`
- Modify: `src/components/explore/MiniMap.tsx`

- [ ] **Step 1: Write failing current-target attitude tests**

Add a unit test for a pure helper exported from `currentTarget.ts`:

```ts
it('returns the resolved target direction for attitude holding', () => {
  const resolved = resolveCurrentTarget(
    { kind: 'static-point', positionAU: [2, 3, 0], arrivalRadiusAU: 0.01, arrivalPolicy: 'continue' },
    { shipPositionAU: [1, 1, 0], simulatedTime: 0 },
  );
  expect(resolved?.directionFromShip).toEqual([Math.SQRT1_2, Math.SQRT1_2, 0]);
});
```

- [ ] **Step 2: Implement the attitude migration**

Replace `'rendezvous'` with `'current-target'` in `src/types/index.ts`. In `ExploreCanvas.tsx`, replace the branch that calls `computeRendezvousDirection` with a branch that resolves the target store using the current post-physics ship position and simulated time, then applies `directionFromShip` when non-null. Call `updateNavigation()` immediately after `updatePhysics()` and after a successful `timeJump()` path; do this before calculating the next-frame target attitude.

- [ ] **Step 3: Update Dashboard controls**

In `Dashboard.tsx`:

1. Resolve the target through `useCurrentTargetStore`; use the result to enable cruise and T.
2. Remove `currentNavigationTarget` reads from `useSpaceshipStore`.
3. Replace the conditional `指向汇合点` button with `指向当前目标` when a target definition exists.
4. Keep the stage label from navigation state as presentation-only text.
5. Render stage-one rendezvous metrics only when the current target is a static point and a rendezvous plan exists; otherwise keep the target-relative status panel.

- [ ] **Step 4: Update MiniMap rendering**

Use the current target store resolution at the current ship position/time. Draw the target marker and dashed line for all resolvable targets. Preserve the existing pulsing rings only for `static-point`; use a single non-pulsing marker for shell and orbit-insertion targets. Draw the legend whenever a current target exists instead of testing `navigationPlan`.

- [ ] **Step 5: Run typecheck, focused lint and tests**

Run:

```bash
npm test -- --run src/engine/__tests__/currentTarget.test.ts src/engine/__tests__/cruise.test.ts src/stores/__tests__/currentTargetStore.test.ts src/stores/__tests__/spaceshipStore.test.ts
npx eslint src/types/index.ts src/components/explore/ExploreCanvas.tsx src/components/explore/Dashboard.tsx src/components/explore/MiniMap.tsx src/stores/spaceshipStore.ts src/stores/currentTargetStore.ts src/engine/currentTarget.ts src/engine/cruise.ts
npm run build
```

Expected: all tests pass, lint exits 0 for touched files, and the build completes with at most the known bundle-size warning.

- [ ] **Step 6: Commit UI integration**

```bash
git add src/types/index.ts src/components/explore/ExploreCanvas.tsx src/components/explore/Dashboard.tsx src/components/explore/MiniMap.tsx src/engine/currentTarget.ts src/engine/__tests__/currentTarget.test.ts src/stores/currentTargetStore.ts src/stores/__tests__/currentTargetStore.test.ts
git commit -m "feat: connect exploration UI to current targets"
```

## Task 6: Synchronize Existing Specifications and Final Verification

**Files:**
- Modify: `docs/specs/2026-07-06-explore-rendezvous-only-navigation-design.md`
- Modify: `docs/specs/2026-07-07-explore-cruise-mode-design.md`
- Test: `src/engine/__tests__/currentTarget.test.ts`
- Test: `src/engine/__tests__/bodyState.test.ts`
- Test: `src/engine/__tests__/navigation.test.ts`
- Test: `src/engine/__tests__/cruise.test.ts`
- Test: `src/stores/__tests__/currentTargetStore.test.ts`
- Test: `src/stores/__tests__/spaceshipStore.test.ts`

- [ ] **Step 1: Update the navigation specification**

Replace all statements saying that `currentNavigationTarget` is stored in `spaceshipStore` with the independent current target store API. Replace the second-stage “gravity-boundary” target type with `body-relative-shell`; replace the third-stage “destination center” target with `orbit-insertion`; remove the statement that stage-one completion automatically engages P.

- [ ] **Step 2: Update the cruise specification**

Replace `navigationPlan.rendezvous` as cruise input with `ResolvedCurrentTarget`. State that stages one and two carry `arrivalPolicy: 'continue'`, so target replacement causes a cruise recalculation rather than P braking. State that stage three ends cruise and hands control to O gear; P remains manually controlled.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: test suite passes; lint/build results are recorded exactly; `git diff --check` produces no output. If full-repository lint has pre-existing errors outside touched files, record those paths and rerun ESLint for only the files listed in Tasks 1-5.

- [ ] **Step 4: Commit documentation and verification-ready changes**

```bash
git add docs/specs/2026-07-06-explore-rendezvous-only-navigation-design.md docs/specs/2026-07-07-explore-cruise-mode-design.md
git commit -m "docs: align exploration navigation with current targets"
```

## Plan Review Checklist

- [ ] Static, shell and orbit-insertion target types are implemented by Tasks 1-2.
- [ ] Navigation owns only destination, plan and stage; it publishes targets in Task 3.
- [ ] Cruise/T gear use only resolved targets in Task 4.
- [ ] Target attitude, Dashboard and MiniMap are migrated in Task 5.
- [ ] Stage 1/2 continuous behavior, stage-3 O handoff, and no-replan time jumps are covered by Task 3 tests.
- [ ] Existing specifications are updated before the final verification in Task 6.
