# 空间比例控制设计

## 背景

搭建页面右侧控制面板当前缺少对物理空间到渲染空间比例（`linearScale`）的可视化控制。底层 `coordinateTransform.ts` 已实现 `scaleUp()`/`scaleDown()` 函数，`uiStore` 已暴露 `linearScale` 状态和 `setLinearScaleValue()` 方法，CSS 中也预留了 `.scale-slider-row` 等样式，仅需在 `ControlPanel` 中增加对应的 UI 控件。

## 目标

在控制面板中新增「空间比例」行，显示当前 `linearScale` 值（科学计数法），并提供 `−`/`+` 按钮供用户手动调整物理到渲染的缩放比例。

## 设计

### UI 布局

在现有「速度倍率」行下方插入「空间比例」行，水平排列格式与速度倍率行一致：

```
速度倍率    [−]  10万×  [+]
空间比例    [−] 1.0×10⁻⁸ [+]
```

- **标签**：`空间比例`
- **− 按钮**：调用 `scaleDown()`——减小 `linearScale`（1 渲染单位对应更多物理米 → 缩小，看到更大范围）
- **值显示**：科学计数法格式，如 `1.0×10⁻⁸`、`5.0×10⁻⁸`、`1.0×10⁻⁷`
- **+ 按钮**：调用 `scaleUp()`——增大 `linearScale`（1 渲染单位对应更少物理米 → 放大，看到更多细节）

### 数据流

```
ControlPanel (React)
  │
  ├─ 读取: useUIStore(s => s.linearScale)
  │
  ├─ − 按钮: scaleDown() → 返回新值 → uiStore.setLinearScaleValue(newValue)
  ├─ + 按钮: scaleUp() → 返回新值 → uiStore.setLinearScaleValue(newValue)
  │
  └─ uiStore.setLinearScaleValue(v)
       ├─ setLinearScale(v)           // 更新 coordinateTransform 模块级变量
       └─ set({ linearScale: v })     // 更新 Zustand 状态 → React 重新渲染
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/components/builder/ControlPanel.tsx` | 新增「空间比例」行 JSX |
| `src/components/builder/ControlPanel.css` | 复用或新增空间比例相关样式 |
| `src/engine/coordinateTransform.ts` | 无需改动 |
| `src/stores/uiStore.ts` | 无需改动 |

### 比例值格式化

```typescript
function formatLinearScale(s: number): string {
  const exp = Math.floor(Math.log10(s));
  const mantissa = s / Math.pow(10, exp);
  // 将指数转为上标 Unicode: 1.0×10⁻⁸
  const superscripts: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³',
    '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  const expStr = String(exp);
  const supExp = expStr.split('').map(c => superscripts[c]).join('');
  return `${mantissa.toFixed(1)}×10${supExp}`;
}
```

### 缩放步进逻辑（已有，无需修改）

`scaleUp()`/`scaleDown()` 按尾数序列 `[1, 2, 4, 5, 6, 8] × 10ⁿ` 步进，提供合适的视觉缩放粒度。

### 边界条件

- `linearScale` 无上下限硬约束，但极小值（如 `1e-15`）会导致渲染异常，极大值（如 `1e-3`）会导致天体过大
- 不在 UI 层添加限制，依赖 `coordinateTransform.ts` 中 `decompose()` 函数的边界处理（`n > -15` 时调整尾数）

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-20 | 初始设计 |
