# 探索页面 —— 飞船稳定绕飞设计

**日期**: 2026-06-21
**状态**: 已确认
**关联**: 探索太阳系页面 (ExplorePage)

---

## 1. 目标

第一阶段：飞船（SpaceX Dragon 2）能够在近地轨道（LEO）上稳定绕地球飞行，像人造卫星一样保持轨道长期稳定，无需持续推力修正。

第二阶段（预留）：飞船通过变轨/加减速进入其他天体的绕行轨道。

---

## 2. 飞船选型

### 2.1 Dragon 2 物理参数

| 参数 | 值 | 说明 |
|------|----|-----|
| 高度 | 8.1 m | 含货舱 |
| 直径 | 4.0 m | 最大直径 |
| 干质量 | 10,500 kg | 含货舱，取整 |
| 碰撞半径（AU） | 5.4e-8 | ≈ 8 km，含安全余量 |
| 最大推力（AU/s²） | 1.5e-7 | ≈ 2.3g，保留现有值 |

### 2.2 LEO 轨道参数（默认）

| 参数 | 值 | 单位 |
|------|----|-----|
| 轨道高度 | 400 | km |
| 半长轴 a | 6,771,000 | m |
| 偏心率 e | 0 | 圆轨道 |
| 倾角 i | 51.6° (0.9006 rad) | ISS 倾角 |
| 升交点赤经 Ω | 0 | rad（可随机） |
| 近地点幅角 ω | 0 | rad（圆轨道） |
| 真近点角 ν | 0 | rad（可随机） |
| 轨道速度 | 7,673 | m/s |

### 2.3 多型号扩展模式

每个飞船型号独立定义物理参数常量，`SPACECRAFT_CONFIG` 指向当前选定型号：

```typescript
// 型号常量
export const SPACECRAFT_DRAGON2 = { mass: 10500, length: 8.1, diameter: 4.0, ... };
export const SPACECRAFT_STARSHIP = { mass: 120000, length: 52.1, diameter: 9.0, ... }; // 预留

// 当前配置
export const SPACECRAFT_CONFIG = SPACECRAFT_DRAGON2;
```

后续增加飞船型号只需新增常量，修改引用即可。

---

## 3. 轨道注入算法

### 3.1 核心思路

不再硬编码飞船初始位置/速度。通过 Kepler 轨道要素计算飞船相对于目标天体的笛卡尔状态，再叠加天体的日心状态，得到飞船的日心状态。

### 3.2 算法流程

```
输入: targetBodyId ('earth'), orbitElements (可选覆盖)
输出: SpaceshipState (日心坐标)

Step 1: 获取目标天体实时状态
  earthPos, earthVel = keplerState(targetBodyId, now)

Step 2: Kepler → 相对笛卡尔状态（以目标天体为中心）
  r_rel, v_rel = keplerToCartesian(orbitElements, μ_target)
  其中 μ_target = G * REAL_DATA[targetBodyId].mass

Step 3: 叠加天体运动 → 日心状态
  shipPos = earthPos + r_rel
  shipVel = earthVel + v_rel

Step 4: 坐标缩放（m → AU）
  shipPos_AU = shipPos / AU_TO_M
  shipVel_AU = shipVel / AU_TO_M

Step 5: 方向初始化
  direction = normalize(v_rel)（飞船头朝速度方向）
```

其中 `keplerToCartesian` 复用 `src/engine/orbital.ts` 的 `stateVectors()`，入参 μ 从 `MU_SUN` 改为 `μ_target`。

### 3.3 目标天体参数化

```typescript
function createSpaceshipState(
  targetBodyId: string = 'earth',
  orbitOverrides?: Partial<OrbitElements>,
  now?: number
): SpaceshipState
```

可扩展到任意天体（火星、木星等），第二阶段只需改动入参，底层代码不变。

---

## 4. 架构设计

### 4.1 新增模块

**`src/engine/orbitalInjection.ts`** — 轨道注入模块（纯 engine 层）

```typescript
interface OrbitElements {
  semiMajorAxis: number;     // m
  eccentricity: number;      // [0, 1)
  inclination: number;       // rad
  raan: number;              // rad (Ω)
  argPeriapsis: number;      // rad (ω)
  trueAnomaly: number;       // rad (ν)
}

// Kepler 轨道要素 → 相对笛卡尔状态
function keplerToRelativeState(elements: OrbitElements, mu: number): {
  position: [number, number, number];
  velocity: [number, number, number];
};

// 计算飞船日心初始状态
// 支持任意 targetBodyId 和轨道参数覆盖
function createSpaceshipState(
  targetBodyId?: string,
  orbitOverrides?: Partial<OrbitElements>,
  now?: number
): SpaceshipState;
```

依赖关系：
- `orbital.ts` — 复用 `stateVectors()` Kepler 求解器
- `constants.ts` — 读取 `REAL_DATA`, `SPACECRAFT_CONFIG`, `G`, `AU_TO_M`

### 4.2 修改模块

| 文件 | 变更 |
|------|------|
| `src/engine/orbitalInjection.ts` | **新增** - 轨道注入算法 |
| `src/engine/constants.ts` | 新增飞船型号常量 + `SPACECRAFT_CONFIG` |
| `src/engine/spaceship.ts` | `createSpaceshipState` 改为调用 `orbitalInjection` |
| `src/stores/spaceshipStore.ts` | 无需改动（接口不变） |
| `src/components/explore/*.tsx` | 无需改动 |
| `src/types/index.ts` | 可选新增 `OrbitElements` 类型 |

### 4.3 不修改范围

- `ExploreCanvas.tsx` — 渲染循环不变
- `Dashboard.tsx` — 仪表盘不变
- `MiniMap.tsx` — 导航图不变
- 推力系统完全保留（`applyThrustInBodyFrame`, `rk4StepSpaceship`）
- 天体渲染和轨道线不变
- 搭建页面、地月页面零改动

---

## 5. 数据流

```
constants.ts                         orbitalInjection.ts
  ├── SPACECRAFT_CONFIG (Dragon 2)     ├── createSpaceshipState('earth', override?)
  ├── REAL_DATA.earth (质量)    →     │     ├── computeBodyState('earth') [Kepler]
  └── G, AU_TO_M                      │     ├── keplerToRelativeState(elements, μ_earth)
                                       │     └── 叠加 → 日心状态 → 缩放 AU
                                       │
spaceshipStore.ts                     ↓
  reset() → createSpaceshipState() → SpaceshipState { position, velocity, direction, ... }
                                       │
ExploreCanvas.tsx                     ↓
  animate() → rk4StepSpaceship() → 飞船在 N 体引力场中运动
             └── 若无推力干扰，绕地轨道自然稳定
```

---

## 6. 推力系统 → 变轨预留

推力系统（`applyThrustInBodyFrame` + `rk4StepSpaceship`）完全保留，作为后续变轨的基础：

- **当前**：推力作为可选的扰动源，第一阶段以「无推力稳定绕飞」为验证目标
- **第二阶段**：推力用于变轨机动（加速/减速/转向），飞船可脱离地球轨道，进入火星、木星等天体的引力影响区，实现行星际转移
- N 体 RK4 积分器天然支持多天体引力场切换，无需额外架构

---

## 7. 验证标准

1. `npm run typecheck` 通过
2. 飞船初始状态下（无推力），在地球附近以圆轨道稳定绕行至少 100 个轨道周期（约 6.5 天模拟时间），轨道高度偏差 < 5%
3. 推力介入后飞船能加速/减速/转向（现有功能不受影响）
4. 飞船碰撞检测正常（撞地球即终止）
5. Dashboard 显示的距地距离、飞行速度与轨道参数一致
6. MiniMap 中飞船绕地球轨迹为闭合圆
