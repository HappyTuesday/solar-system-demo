# 搭建模式专用天体数据设计

**日期**: 2026-06-21
**状态**: 已确认
**关联**: 搭建太阳系页面 (BuilderPage)

---

## 1. 目标

为「搭建太阳系」页面设计独立的天体数据清单，对天体半径、公转半径、公转速度进行优化，使渲染空间中天体分布更均匀、尺寸更易辨识，降低搭建难度，提升趣味性。

- 新数据仅用于搭建页面（渲染、评分、自动搭建参考）
- 探索页面、地月页面继续使用 `REAL_DATA`，不受影响
- 页面标注「数据已校正，与真实值有出入」

---

## 2. 调整算法

### 2.1 参数约定

- `linearScale = 1e-8`（默认值，渲染位置缩放）  
- `sizeMultiplier = 1`（不使用放大倍数，直接设计 vr1）
- 默认 zoom = 0.5，像素换算：1 渲染单位 = 0.5 px

### 2.2 轨道半径 vR1

1. 从 `REAL_DATA` 取各行星真实半长轴 `R0`，计算 `vR0 = R0 * linearScale`
2. 在渲染空间中用幂律压缩（p=0.85）使分布更均匀：
   - `ratio[i] = vR0[i] / vR0[neptune]`
   - `ratioAdj[i] = ratio[i] ^ 0.85`
   - 还原：`vR1[i] = ratioAdj[i] * target_max`
3. 整体缩放，target_max = 2000（海王星距日 1000px）
4. 水星和海王星两端固定，保留原有排序规律

### 2.3 天体半径 vr1

1. 取 `REAL_DATA` 中真实物理半径，取对数 `logRadius = ln(radius_real)`
2. 将对数值线性映射到 [10, 70] 渲染区间
3. 映射保留真实尺寸排名：太阳 > 木星 > 土星 > 天王星 > 海王星 > 地球 > 金星 > 火星 > 水星
4. 约束：任意相邻天体的 `vr1[i] + vr1[i+1] < vR1[i+1] - vR1[i]`（天体不跨越轨道）

### 2.4 物理反推

- 轨道：`R1_physical = vR1 / linearScale`
- 天体半径：`r1_physical = vr1 / linearScale`
  - 渲染时走 `physicalRadiusToRender(r1_physical)` 得到 vr1

### 2.5 公转速度

使用圆轨道公式计算初速度：

```
v1 = √(G * Msun / R1_physical)
```

太阳质量不变（`G=6.674e-11`，`Msun=1.989e30`）。

### 2.6 质量

保持不变，与 `REAL_DATA` 一致，用于评分中的质量维度对比。

---

## 3. 最终数据

### 3.1 公转半径

| 天体 | R1 物理 (m) | vR1 渲染 | 像素(距日) |
|------|-------------|----------|------------|
| 水星 | 5.2e9 | 52 | 26 |
| 金星 | 8.8e9 | 88 | 44 |
| 地球 | 1.25e10 | 125 | 63 |
| 火星 | 1.70e10 | 170 | 85 |
| 木星 | 4.70e10 | 470 | 235 |
| 土星 | 7.80e10 | 780 | 390 |
| 天王星 | 1.40e11 | 1396 | 698 |
| 海王星 | 2.00e11 | 2000 | 1000 |

### 3.2 天体半径

| 天体 | r1 物理 (m) | vr1 渲染 | 像素 |
|------|-------------|----------|------|
| 太阳 | 7.0e9 | 70 | 35 |
| 木星 | 4.0e9 | 40 | 20 |
| 土星 | 3.5e9 | 35 | 18 |
| 天王星 | 2.8e9 | 28 | 14 |
| 海王星 | 2.6e9 | 26 | 13 |
| 地球 | 1.6e9 | 16 | 8 |
| 金星 | 1.4e9 | 14 | 7 |
| 火星 | 1.1e9 | 11 | 6 |
| 水星 | 1.0e9 | 10 | 5 |

邻星约束验证（最严格的三组）：
- 水星(10)+金星(14)=24 < 36（轨道间距 88-52）✓
- 金星(14)+地球(16)=30 < 37 ✓
- 地球(16)+火星(11)=27 < 45 ✓

### 3.3 公转速度

| 天体 | v1 (m/s) |
|------|----------|
| 水星 | 159,800 |
| 金星 | 122,800 |
| 地球 | 103,100 |
| 火星 | 88,300 |
| 木星 | 53,200 |
| 土星 | 41,300 |
| 天王星 | 30,800 |
| 海王星 | 25,800 |

### 3.4 质量

保持与 `REAL_DATA` 中 8 颗行星质量一致（不变）。

---

## 4. 架构设计

### 4.1 新增模块

**`src/engine/buildData.ts`** — 搭建模式专用数据模块（纯 engine 层，无 React/Three.js 依赖）

```typescript
interface BuildBodyData {
  id: CelestialBodyId;
  name: string;
  type: CelestialBodyType;       // 'star' | 'planet'
  mass: number;                  // 物理质量 kg
  radius: number;                // 调整后物理半径 m
  semiMajorAxis: number;         // 调整后轨道半长轴 m
  orbitalSpeed: number;          // 调整后公转速度 m/s
  displayRadius: number;         // 渲染空间天体半径 vr1
  displayOrbit: number;          // 渲染空间轨道半径 vR1
  textureUrl: string;
  isAdjusted: true;
}
```

导出：
- `BUILD_DATA: Record<CelestialBodyId, BuildBodyData>` — 8 行星 + 太阳
- `BUILD_TEMPLATES: CelestialBodyTemplate[]` — 搭建页面工具栏模板

### 4.2 数据流

```
buildData.ts
├── 工具栏: CelestialToolbar — 显示天体卡片（名称、vr1 尺寸、vR1 轨道）
├── 渲染: createBodyMesh — 使用 buildData.radius 计算 mesh 大小
├── 评分: scoreBuild — 使用 buildData 做评分参考
└── 自动搭建: autoBuild — 使用 buildData 初始化位置/速度
```

### 4.3 修改范围

| 文件 | 变更 |
|------|------|
| `src/engine/buildData.ts` | **新增** - 预处理数据 |
| `src/engine/constants.ts` | 新增 `BUILD_CELESTIAL_TEMPLATES` 导出 |
| `src/engine/scoring.ts` | 增加 `scoreBuild` 的重载/参数，接受 buildData 参考值 |
| `src/engine/autoBuild.ts` | 增加基于 buildData 的自动搭建路径 |
| `src/rendering/threejs/bodies.ts` | `createBodyMesh` 增加可选 radius 参数，搭建模式传入 buildData.radius |
| `src/components/builder/CelestialToolbar.tsx` | 使用 buildData 显示，加校正标注 |
| `src/components/builder/BodyStatusPanel.tsx` | 监督模式显示校正后参考值 |
| `src/components/builder/ScoreModal.tsx` | 顶部加校正提示 |

### 4.4 不修改范围

- `REAL_DATA` — 探索/地月页面继续使用
- `physics.ts` — N 体模拟引擎不变
- `coordinateTransform.ts` — 渲染变换不变
- 探索页面、地月页面零改动

### 4.5 UI 标注

- 工具栏：每个天体卡片底部灰色小字 `※ 数据已校正`
- 评分弹窗：标题下方提示 `※ 评分标准为校正后数据，与真实值有出入`

---

## 5. 评分影响

- **轨道半径评分**：对比 placed 天体的轨道半径与 `buildData.semiMajorAxis`，允许 5% 误差
- **质量评分**：对比 placed 质量与 `buildData.mass`（与真实值一致，无变化）
- **速度评分**：对比 placed 速度与 `buildData.orbitalSpeed`
- **顺序评分**：不变

由于 R1 比真实值缩小约 100 倍，用户放置天体时更容易命中参考轨道半径（因为渲染空间分布更均匀，视觉反馈更友好）。

---

## 6. 验证标准

1. `npm run typecheck` 通过
2. 搭建页面显示 9 个天体（太阳 + 8 行星），卡片带校正标注
3. 天体放置后渲染尺寸与工具栏图标一致
4. 自动搭建后行星在新轨道上做稳定圆轨道运动（轨道不变形）
5. 评分使用 buildData 参考值，得分在合理范围
6. 探索页面不受影响
