# Explore Mars Navigation Directive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Explore page's mixed static/live Mars guidance with a realtime navigation directive layer that does not treat `jumpTime` as a required navigation action.

**Architecture:** Add an engine-level `marsMissionNavigator` module that emits a single current `NavigationDirective` from current physical state. Update store adapters and `PhaseGuide` to consume directives for user-equivalent operations only. Keep time jumping as an independent time-control tool, not part of navigation actions.

**Tech Stack:** React 19, TypeScript strict, Zustand, Vite, Vitest, Three.js rendering kept outside engine.

---

### Task 1: Add NavigationDirective Engine API

**Files:**
- Create: `src/engine/marsMissionNavigator.ts`
- Test: `src/engine/__tests__/marsMissionNavigator.test.ts`

- [ ] **Step 1: Write failing tests** covering waiting-window output without `jumpTime`, Earth escape transfer coast, Mars far approach, stable Mars orbit arrival.
- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/marsMissionNavigator.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal engine API**

Create `NavigationDirective`, `computeMarsMissionDirective`, and helper conversion from existing live guidance, mapping `jumpTime` to `wait`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/marsMissionNavigator.test.ts`

Expected: PASS.

### Task 2: Migrate Guidance Control Adapters

**Files:**
- Modify: `src/stores/guidanceControls.ts`
- Test: `src/stores/__tests__/guidanceControls.test.ts`

- [ ] **Step 1: Update tests** to use `NavigationDirective` and verify direction/throttle/time-scale adapters do not change position, velocity, or time.
- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/stores/__tests__/guidanceControls.test.ts`

Expected: FAIL until adapters accept directives.

- [ ] **Step 3: Update adapters** to accept `NavigationDirective | PhaseGuidance` during migration.
- [ ] **Step 4: Run tests**

Run: `npx vitest run src/stores/__tests__/guidanceControls.test.ts`

Expected: PASS.

### Task 3: Migrate PhaseGuide UI

**Files:**
- Modify: `src/components/explore/PhaseGuide.tsx`
- Modify: `src/components/explore/PhaseGuide.css`
- Test: `src/components/explore/__tests__/PhaseGuide.test.ts`

- [ ] **Step 1: Update component test** to assert no `快进到发射窗口` navigation action is rendered and directive buttons remain visible.
- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/explore/__tests__/PhaseGuide.test.ts`

Expected: FAIL while old fast-forward control exists.

- [ ] **Step 3: Update PhaseGuide** to call `computeMarsMissionDirective`, remove navigation-owned `timeJump`, and render wait/coast conditions from the directive.
- [ ] **Step 4: Run component test**

Run: `npx vitest run src/components/explore/__tests__/PhaseGuide.test.ts`

Expected: PASS.

### Task 4: Update Guided Flight Integration

**Files:**
- Modify: `src/stores/__tests__/exploreMarsGuidedFlight.test.ts`

- [ ] **Step 1: Replace old phase `expectedWaitDays` jump logic** with directive-only operation plus time-scale application.
- [ ] **Step 2: Add assertion** that the no-`timeJump` simulation path can progress using guidance time scales and still reach stable Mars orbit within test limits.
- [ ] **Step 3: Run integration test**

Run: `npx vitest run src/stores/__tests__/exploreMarsGuidedFlight.test.ts`

Expected: PASS.

### Task 5: Full Verification And Browser Check

**Files:**
- No planned code changes.

- [ ] **Step 1: Run targeted tests**

Run: `npx vitest run src/engine/__tests__/marsMissionNavigator.test.ts src/engine/__tests__/navigation.test.ts src/stores/__tests__/guidanceControls.test.ts src/stores/__tests__/exploreMarsGuidedFlight.test.ts src/components/explore/__tests__/PhaseGuide.test.ts`

Expected: PASS.

- [ ] **Step 2: Run lint/build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Browser verification**

Use the in-app browser on `http://localhost:5175/explore`: select Mars, follow directive buttons only, do not use navigation jump controls, and confirm guidance progresses through wait, burn, coast, Mars approach/capture, and stable orbit.
