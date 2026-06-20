# sql.js → localStorage 迁移设计

> 版本: 1.0
> 日期: 2026-06-19
> 状态: 待实施

---

## 1. 背景与动机

当前项目使用 sql.js（SQLite 编译到 WebAssembly）进行搭建历史记录的持久化。sql.js 引入了以下问题：

- **WASM 依赖**：需要加载约 1MB+ 的 `sql-wasm.wasm` 文件，增加首屏加载时间
- **异步初始化**：`initDatabase()` 必须在应用渲染前完成，阻塞 React 挂载
- **过度设计**：实际只存储一种数据（`BuildRecord` 数组），无需关系型数据库
- **内存数据库**：sql.js 使用内存数据库，页面刷新后数据丢失（除非手动导出），与 localStorage 一样是"非持久化"的

替换为 localStorage 可以简化架构、消除 WASM 依赖、减少包体积、去除异步初始化阻塞。

---

## 2. 设计目标

- 移除 sql.js 依赖，使用原生 `localStorage` 存储搭建历史
- API 接口保持向后兼容（`repository.ts` 的函数签名不变）
- 最多保留 20 条历史记录，超出自动删除最旧记录
- 初始化同步完成，无需阻塞应用渲染
- 对核心功能无影响：存储失败时静默处理

---

## 3. 架构变更

### 3.1 存储层重设计

```
persistence/
├── db.ts           → 删除（WASM 加载 / 数据库初始化 / 建表）
└── repository.ts   → 重写（使用 localStorage）
```

### 3.2 安装前的存储结构

```
localStorage["solar_build_records"] = JSON.stringify([
  {
    id: "build-xxx-1",
    createdAt: 1718800000000,
    completedAt: 1718800120000,
    status: "completed",
    score: 85.3,
    buildTimeMs: 120000,
    snapshot: "{...BuildState JSON...}"
  },
  ...
])
```

- Key 名称：`solar_build_records`
- 值类型：`BuildRecord[]` JSON 数组（最多 20 条）
- 数组顺序：按 `createdAt` 降序排列（最新在前）

### 3.3 Repository API（签名不变）

```typescript
export function saveRecord(record: BuildRecord): void
export function loadRecord(id: string): BuildRecord | null
export function listRecords(): BuildRecord[]
export function deleteRecord(id: string): void
export function getBestScores(limit?: number): BuildRecord[]
```

### 3.4 saveRecord 逻辑

```
1. 从 localStorage 读取"solar_build_records"
2. JSON.parse → BuildRecord[]（解析失败则返回 []）
3. 查找是否已有同 ID 记录：
   - 存在 → 替换该位置
   - 不存在 → unshift 到数组头部
4. 截断数组到 MAX_RECORDS (20) 条
5. JSON.stringify → 写入 localStorage
6. 写入失败（QuotaExceededError）→ 静默忽略
```

### 3.5 被删除的文件

| 文件 | 说明 |
|------|------|
| `src/persistence/db.ts` | 不再需要 WASM 加载和建表 |
| `src/types/sql.js.d.ts` | sql.js 模块声明，不再需要 |

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/persistence/db.ts` | 删除 | 移除整个文件 |
| `src/persistence/repository.ts` | 重写 | localStorage 实现 |
| `src/types/sql.js.d.ts` | 删除 | 移除类型声明 |
| `src/main.tsx` | 修改 | 移除 `initDatabase()` 调用，直接渲染 |
| `package.json` | 修改 | 移除 `sql.js` 依赖 |
| `vite.config.ts` | 修改 | 移除 `assetsInclude: ['**/*.wasm']`（sql.js 专用配置） |
| `docs/specs/2026-06-14-solar-system-demo-design.md` | 修改 | 更新数据持久化章节 |

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|----------|
| localStorage 不可用（隐私模式等） | 静默降级，所有读操作返回 `null` 或 `[]`，写操作无操作 |
| JSON 解析失败（数据损坏） | 覆盖恢复为空数组 |
| 写入时 QuotaExceededError | 静默忽略，不影响当前功能 |
| 旧 sql.js 内存数据 | 页面刷新后自然丢失，无需迁移逻辑 |

---

## 6. 限制

- localStorage 同步阻塞主线程，但 20 条记录序列化/反序列化耗时在毫秒级，不影响用户体验
- 浏览器隐私模式下 localStorage 可能不可用，历史功能静默降级

---

## 7. 非功能性

- **初始化**：无需异步加载，应用可立即渲染
- **包体积**：移除 sql.js (~1.5MB gzip)，减小构建产物
- **兼容性**：所有支持 WebGL 的现代浏览器均支持 localStorage
