# 行星运动轨迹渲染 — 设计文档

**日期**：2026-06-16
**状态**：已确认

## 概述

为运行中的行星添加运动轨迹（尾迹）可视化，帮助用户观察天体运动路径。轨迹为单色实线，基于轨道比例控制长度，支持开关和长度调节。

## 设计决策

| 维度 | 决策 |
|------|------|
| 渲染方式 | 单色实线（THREE.Line），方案 A |
| 适用范围 | 仅行星（mercury ~ neptune），太阳和卫星不显示 |
| 长度策略 | 基于当前轨道周长比例（slider 0.1 ~ 1.0，默认 0.5） |
| 颜色 | 天体同色 + 半透明（`opacity: 0.4`） |
| 线宽 | 1px 默认细线 |
| 可控性 | 开关 + 长度滑块，位于 ControlPanel |
| 性能策略 | TrailManager 模块 + 预分配 BufferGeometry + 原地更新 |

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/rendering/trails.ts` | **新增** | 轨迹渲染模块，导出 TrailManager |
| `src/stores/uiStore.ts` | 修改 | 新增 `showTrails`、`trailLength` 状态 |
| `src/components/controls/ControlPanel.tsx` | 修改 | 新增开关 + 滑块 UI |
| `src/components/canvas/Canvas3D.tsx` | 修改 | 动画循环中集成 TrailManager |

## 模块设计

### `src/rendering/trails.ts` — TrailManager

核心职责：管理所有行星轨迹的创建、更新、销毁。

**数据结构：**

```typescript
interface TrailEntry {
  line: THREE.Line;                          // 轨迹线对象
  positions: Float32Array;                   // 环形缓冲区 (maxPoints * 3)
  writeIndex: number;                        // 环形写指针
  activeCount: number;                       // 当前有效点数
  margin: number;                            // 最小采样间距（渲染空间）
}
```

**接口：**

```typescript
class TrailManager {
  constructor(scene: THREE.Scene, maxPoints?: number);

  // 生命周期
  addTrail(bodyId: string, color: number): void;
  removeTrail(bodyId: string): void;
  clearAll(): void;

  // 每帧更新 —— 使用物理坐标采样，内部转换为渲染坐标
  updateTrails(bodies: CelestialBody[]): void;

  // 可见性控制
  setVisible(visible: boolean): void;

  // 长度调节 —— 接收物理空间的轨道比例 (0.1 ~ 1.0)
  setLengthProportion(proportion: number): void;

  // 销毁所有资源
  dispose(): void;
}
```

**采样策略（距离驱动）：**

- 每个天体维护一个 `margin` —— 当前轨迹的**物理空间**最小采样间距
- 计算公式：`margin = orbitPhysCircumference * proportion / maxPoints`
- `orbitPhysCircumference = 2 * π * |position|`（物理空间，相对于太阳即原点）
- 当天体位移超过 `margin` 时才追加新采样点到环形缓冲区
- 采样点存储**渲染坐标**（内部调用 `physicalToRender`）

**顶点更新流程（每帧）：**

1. 遍历所有活跃轨迹，检查是否需要追加采样点（累计位移 > margin）
2. 将环形缓冲区中 active 段按顺序拷贝到 `geometry.attributes.position.array` 的前 `activeCount * 3` 个位置
3. 设置 `geometry.attributes.position.needsUpdate = true`
4. 设置 `geometry.setDrawRange(0, activeCount)`

**环形缓冲区写满时的处理：**

- `writeIndex` 循环覆盖最旧数据
- `activeCount` 不变（= maxPoints）
- 拷贝到 geometry 时从 `writeIndex` 开始循环读取

## 状态变更

### uiStore 新增字段

```typescript
// 轨迹控制
showTrails: boolean;        // 默认 true
trailLength: number;        // 轨道比例，范围 0.1 ~ 1.0，默认 0.5
setShowTrails: (v: boolean) => void;
setTrailLength: (v: number) => void;
```

## UI 变更

### ControlPanel 新增控件

在控制面板底部（暂停/播放/评分区域下方）增加：

```
[ √ 显示轨迹 ]    [ 轨迹长度  ▬▬▬▬▬○ 0.5 ]
   开关              滑块 (0.1 ~ 1.0，步长 0.1)
```

- 开关关闭：`TrailManager.setVisible(false)`，不清空数据
- 滑块拖动：`TrailManager.setLengthProportion(v)`，立即生效
- 滑块样式：使用现有 CSS 变量体系

## 集成点

### Canvas3D 动画循环

在 `animate()` 中，`updateBodyMeshes()` 之后插入：

```typescript
if (showTrails && isRunning) {
  trailManagerRef.current.updateTrails(bodies);
}
```

### 天体生命周期同步

- **创建**：`syncBodies()` 中，当行星被添加到场景时调用 `addTrail()`
- **销毁**：`syncBodies()` 中，当行星从 store 移除时调用 `removeTrail()`
- **重置**：`resetBuild()` 时调用 `clearAll()`

### 初始化

在 `initScene` 回调中创建 TrailManager 实例，存储在 ref 中。

## 边界情况

| 场景 | 行为 |
|------|------|
| 模拟暂停 | 停止采样，轨迹保留在暂停位置 |
| 模拟恢复 | 从当前位置继续采样，轨迹连续 |
| 滑块减小 | 立即裁剪 active 范围，`setDrawRange` 调整 |
| 滑块增大 | 保留已有数据，新采样自然扩展 |
| 关闭开关 | 所有 Line `visible = false`，不清数据 |
| 行星碰撞合并 | 旧两条销毁，新合并体无轨迹（新天体） |
| 环形缓冲区写满 | 覆盖最旧数据，`setDrawRange` 配合循环偏移 |
| 太阳被放置 | 不会触发 `addTrail`（仅行星显示） |
| 卫星轨迹 | 不会触发（仅行星显示） |

## 性能估算

- 最多 8 个行星 × 500 点 × 3 float = ~48KB GPU vertex buffer 更新每帧
- 8 个额外 draw call（8 条 Line）
- 每帧一次 memcpy（~6KB 内），零 GC
- 不影响现有渲染管线
