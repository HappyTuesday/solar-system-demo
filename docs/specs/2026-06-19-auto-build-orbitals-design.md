# 自动搭建重构 — 真实轨道初始化设计

> 日期: 2026-06-19
> 状态: 设计中

---

## 1. 目标

将"自动搭建"功能从「硬编码 XY 平面均匀分布的位置」重构为「基于开普勒轨道根数计算当前时刻真实太阳系状态」，包括：

- 各天体真实 3D 位置（非仅 XY 平面）
- 公转相位（轨道上当前位置）
- 自转相位（初始自转角度）
- 黄赤交角（自转轴倾斜）

放置完成后，模拟按现有 N 体物理（RK4）自由演进，不持续绑定真实数据。

---

## 2. 数据模型变更

### 2.1 CelestialBody 新增字段

```typescript
interface CelestialBody {
  // ... 现有字段不变
  rotationPhase: number;  // 初始自转相位角（rad），mesh.rotation.y 的初始值
}
```

### 2.2 REAL_DATA 扩展：OrbitalElements

在 `src/engine/constants.ts` 的 `REAL_DATA` 中为每个天体新增以下轨道参数：

```typescript
{
  // 轨道根数（开普勒六要素，参考 J2000.0 黄道面）
  eccentricity: number;            // 偏心率 e
  inclination: number;             // 轨道倾角 i（rad，行星相对黄道面，卫星相对母星赤道面）
  longitudeAscendingNode: number;  // 升交点经度 Ω（rad）
  argumentOfPeriapsis: number;     // 近日点角距 ω（rad）
  meanAnomalyAtEpoch: number;      // 历元平近点角 M₀（rad），J2000.0 = JD 2451545.0
  epoch: number;                   // 历元时刻（JD），固定 2451545.0

  // 自转参数
  axialTilt: number;              // 黄赤交角（rad），自转轴相对轨道面法线倾角
  rotationPeriod: number;          // 恒星自转周期（秒）
  rotationPhaseAtEpoch: number;    // 历元时刻本初子午线经度（rad）
}
```

### 2.3 AutoBuildStep 新增字段

```typescript
interface AutoBuildStep {
  // ... 现有字段
  rotationPhase: number;  // 初始自转相位
}
```

---

## 3. 新增模块：`src/engine/orbital.ts`

纯逻辑层模块（无 React / Three.js 依赖），提供轨道计算函数。

### 3.1 函数接口

```
julianDate(unixMs: number): number
  将 Unix 时间戳（ms）转换为 Julian Date

solveKepler(M: number, e: number, tolerance: number): number
  用牛顿迭代法解开普勒方程 M = E - e·sin(E)，返回偏近点角 E

trueAnomaly(E: number, e: number): number
  E → ν：tan(ν/2) = √((1+e)/(1-e)) · tan(E/2)

meanAnomalyAtTime(M0: number, T: number, epoch: number, targetTime: number): number
  M(t) = M₀ + 2π · (t - epoch) / T

stateVectors(
  a: number, e: number, i: number, Ω: number, ω: number, ν: number, μ: number
): { position: [number, number, number]; velocity: [number, number, number] }
  轨道根数 → 笛卡尔位置/速度（heliocentric 或 planetocentric）

computeRotationPhase(
  phaseAtEpoch: number, period: number, epoch: number, targetTime: number
): number
  当前自转相位 = (phaseAtEpoch + 2π · (t - epoch) / period) mod 2π
```

### 3.2 伪代码

```
solveKepler(M, e):
  E = M
  for 20 iterations:
    dE = (M - E + e * sin(E)) / (1 - e * cos(E))
    E += dE
    if |dE| < 1e-12: break
  return E

stateVectors(a, e, i, Ω, ω, ν, μ):
  r = a * (1 - e²) / (1 + e * cos(ν))
  // 轨道面内位置
  x_orb = r * cos(ν)
  y_orb = r * sin(ν)
  // 轨道面内速度
  vx_orb = -sqrt(μ / a / (1 - e²)) * sin(ν)
  vy_orb = sqrt(μ / a / (1 - e²)) * (e + cos(ν))
  // 旋转到 3D（按 i, Ω, ω 旋转矩阵）
  → return { position: [x,y,z], velocity: [vx,vy,vz] }
```

---

## 4. 引擎层变更

### 4.1 `src/engine/autoBuild.ts` 重写

```
computeAutoBuildPlan(timestamp?: number): AutoBuildStep[]
  time = timestamp ?? Date.now()
  jd = julianDate(time)

  plan = []

  // 1. 太阳
  plan.push({ sun: position [0,0,0], velocity [0,0,0], ... })

  // 2. 8 个行星
  planetStates = {}  // 记录行星的状态供卫星使用
  for each planet:
    el = REAL_DATA[planet].orbitalElements
    M = el.M₀ + 2π * (jd - el.epoch) / el.period  // 平近点角
    E = solveKepler(M % (2π), el.e)
    ν = trueAnomaly(E, el.e)
    { pos, vel } = stateVectors(el.a, el.e, el.i, el.Ω, el.ω, ν, μ_sun)
    rotPhase = computeRotationPhase(el.phaseAtEpoch, el.rotationPeriod, el.epoch, jd)
    rotSpeed = 2π * timeScale / el.rotationPeriod  // 按真实周期缩放
    plan.push({ planet, pos, vel, mass, rotSpeed, rotPhase })
    planetStates[planet.id] = { pos, vel }

  // 3. 8 个卫星
  for each moon:
    parent = planetStates[moon.parentId]
    el = REAL_DATA[moon].orbitalElements
    M = el.M₀ + 2π * (jd - el.epoch) / el.period
    E = solveKepler(M % (2π), el.e)
    ν = trueAnomaly(E, el.e)
    { dPos, dVel } = stateVectors(el.a, el.e, el.i, el.Ω, el.ω, ν, μ_parent)
    pos = parent.pos + dPos
    vel = parent.vel + dVel
    plan.push({ moon, pos, vel, mass, rotSpeed, rotPhase })

  return plan
```

### 4.2 `src/engine/physics.ts` — mergeBodies

`mergeBodies` 返回的对象需包含 `rotationPhase: 0`。

### 4.3 `src/engine/constants.ts`

扩展 `REAL_DATA`，每个天体新增上述轨道根数字段。数据来源：
- 行星：JPL/Standish 平轨道根数（J2000.0 黄道面）
- 卫星：各行星卫星平均轨道根数（J2000.0）

---

## 5. 渲染层变更：`src/rendering/bodies.ts`

### 5.1 轴倾角

- 删除局部 `AXIAL_TILTS` 常量
- `createBodyMesh` 中 tilt 从 `REAL_DATA[body.templateId].axialTilt` 读取

### 5.2 初始自转相位

```
createBodyMesh(body):
  ...
  mesh.rotation.y = body.rotationPhase ?? 0  // 设置初始相位
  ...
```

### 5.3 旋转速度统一

`rotationSpeed` 在 auto-build 中按真实自转周期 × timeScale 计算，映射到视觉合理范围。保持 `updateBodyMeshes` 中 `bm.mesh.rotation.y += body.rotationSpeed * dt` 不变。

---

## 6. 状态层变更：`src/stores/buildStore.ts`

### 6.1 placeBody 签名

```typescript
placeBody(
  templateId: string,
  position: [number, number, number],
  velocity: [number, number, number],
  mass: number,
  rotationSpeed?: number,
  rotationPhase?: number,  // 新增
): void
```

在 `CelestialBody` 创建时设置 `rotationPhase: rotationPhase ?? 0`。

---

## 7. Hook 层变更：`src/hooks/useAutoBuild.ts`

- 调用 `computeAutoBuildPlan()` 时传入 `Date.now()`
- `placeBody` 调用增加 `rotationPhase` 参数

---

## 8. 不动项

- 评分逻辑不变（仍基于半长轴、质量、速度、顺序比较）
- 物理引擎不变（RK4 + N 体引力）
- UI 布局和交互流程不变
- 手动放置天体流程不变

---

## 9. 影响文件清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/types/index.ts` | 修改 | `CelestialBody` + `rotationPhase`；`AutoBuildStep` + `rotationPhase` |
| `src/engine/constants.ts` | 修改 | `REAL_DATA` 扩展 17 组轨道根数 |
| `src/engine/orbital.ts` | **新建** | 开普勒方程求解 + 轨道→笛卡尔转换 |
| `src/engine/autoBuild.ts` | 重写 | 用轨道计算替代硬编码 XY 平面位置 |
| `src/engine/physics.ts` | 微调 | `mergeBodies` 增加 `rotationPhase` |
| `src/rendering/bodies.ts` | 修改 | 从 constants 读取 tilt；使用 `rotationPhase` |
| `src/stores/buildStore.ts` | 修改 | `placeBody` 支持 `rotationPhase` |
| `src/hooks/useAutoBuild.ts` | 修改 | 传入当前时间戳 |
| `docs/specs/2026-06-14-solar-system-demo-design.md` | 更新 | 同步自动搭建描述 |
