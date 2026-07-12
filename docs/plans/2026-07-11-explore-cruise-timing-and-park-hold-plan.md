# 探索模式巡航计时与 P 档日心保持实施计划

## 目标

优化探索页巡航：取消高倍率连续物理步进，改为按 `7天 → 24h → 12h → 6h → 3h → 1h → 30m → 10m → 1m` 逐级逼近 P 档制动窗口的时间跳跃，跳后检查 T 档和 P 档制动窗口；不限制现实完成时长。巡航仅在 `abs(切向速度) / 径向速度 >= 0.01` 时挂 T，且仅负责在正确时刻挂 P，随后立即结束。飞船进入 `NAVIGATION_CONFIG.arrivalDistanceAU` 后由独立导航检测完成汇合并隐藏汇合点，同时持续显示相对目标的飞行参数。P 档在日心速度过零后持续抵消实时合引力和残余速度，不回 N、不吸附位置、不直接清零速度。

## 范围与约束

- 引擎计算一律使用 AU、AU/s、秒；显示层仅负责现有中文文案和事件转发。
- 到达范围固定复用 `NAVIGATION_CONFIG.arrivalDistanceAU`（当前为 0.05 AU）。
- 时间跳跃之间至少留出 200 ms 现实渲染间隔；巡航不承诺现实完成时长。
- P 档保持推力必须进入现有 RK4 物理积分器，不得通过重写位置或速度制造静止。
- 巡航执行中用户切换 D/R、取消目标、关闭巡航、发生碰撞时中止巡航时间控制并恢复原时间倍率；但在启用瞬间 D/R 不再是前置限制，而是自动切回 N 后进入巡航。用户主动离开 P 档才停止保持。

## 文件与职责

| 文件 | 改动 |
|---|---|
| `src/engine/cruise.ts` | 新增单次跳跃长度纯函数与分级跳跃常量。 |
| `src/engine/__tests__/cruise.test.ts` | 覆盖分级跳跃、1 分钟内不跳和 T 档阈值。 |
| `src/engine/navigation.ts` | 新增不依赖汇合计划的目标相对状态纯函数。 |
| `src/engine/__tests__/navigation.test.ts` | 覆盖到达后目标距离、相对速度、Hill 范围和捕获状态。 |
| `src/engine/spaceship.ts` | 提取不含推力的合引力计算，并生成 P 档保持目标。 |
| `src/engine/__tests__/spaceship.test.ts` | 覆盖合引力方向、保持推力限幅与阻尼。 |
| `src/stores/spaceshipStore.ts` | 保存 P 档子阶段与巡航计时状态；实现保持、独立到达完成检测和倍率恢复。 |
| `src/stores/__tests__/spaceshipStore.test.ts` | 覆盖 1 天跳跃、T 档阻断跳跃、制动窗口触发、到达范围完成但不改写运动状态、P 档保持。 |
| `src/components/explore/ExploreCanvas.tsx` | 向 P 档和巡航动作传入实时天体状态与单调计时。 |
| `src/components/explore/Dashboard.tsx` | 更新巡航和 P 档中文提示，并在汇合完成后显示目标相对参数。 |
| `docs/specs/2026-07-05-explore-park-gear-design.md` | 记录 P 档从一次性制动到持续物理保持的行为变化。 |
| `docs/specs/2026-07-07-explore-cruise-mode-design.md` | 记录 1 天跳跃循环、到达范围完成导航和 P 档保持的协作规则。 |

## 实施步骤

1. 在 `cruise.test.ts` 先替换时间控制测试：制动窗口外返回 86400 秒；20 小时余量返回 43200 秒；8 小时余量返回 21600 秒；不足 60 秒、已到制动窗口或径向速度非正时返回 0。运行测试确认旧的单日上限 API 不满足断言。
2. 在 `cruise.ts` 实现 `CRUISE_TIME_JUMP_STEPS_SECONDS = [86400, 43200, 21600, 10800, 3600, 1800, 600, 60]` 和 `computeCruiseJumpSeconds(guidance)`。它仅根据制动窗口距离与径向速度选取不超过余量的最大档位，不读取 UI 倍率；返回 0 表示改由常规物理推进。运行测试确认通过。
3. 在 `spaceship.test.ts` 先新增合引力和 P 档保持的失败测试：给定单个质量体，保持目标方向必须反向于引力；带正日心速度时目标推力含反向阻尼；超过最大推力时推力大小限为 100 MN。运行测试确认因 API 缺失而失败。
4. 在 `spaceship.ts` 新增 `computeGravityAcceleration` 与 `parkHoldSnapshot`。前者重用现有软化引力公式但不加入飞船推力；后者计算 `-a_gravity - velocity / PARK_HOLD_VELOCITY_DAMPING_SECONDS`，归一化为船身前向，推力大小按 `SPACECRAFT_CONFIG.maxThrustAU` 转为 0-100 MN 并限幅。运行测试确认通过。
5. 在 store 测试中先写 P 档状态机失败用例：速度过零后仍为 `gear='P'` 且 `parkPhase='holding'`；保持阶段使用传入的天体状态生成前向推力；手动离开 P 档清空保持状态。运行测试确认失败。
6. 在 `spaceshipStore.ts` 添加 `ParkPhase`、`parkPhase` 和 `updateParkGear(bodies)`。`setGear('P')` 在低速时直接进入 `holding`，否则进入 `braking`；`braking` 完成后切换而不是回 N；`holding` 调用 `parkHoldSnapshot`。运行 P 档相关测试确认通过。
7. 在 store 测试中先替换巡航失败用例：启用巡航时记录原倍率并强制 1×；从 D/R 启用时先进入 N 档、清除手动推力并调整为指向汇合点姿态；每轮按分级最大档跳跃；跳后在 `abs(切向速度) / 径向速度 >= 0.01` 时挂 T（恰为 0.01 也触发）；T 档活动时不跳；不足 1 分钟时保持 `cruiseActive=true` 且不跳跃；进入制动窗口挂 P、立即令 `cruiseActive=false` 并恢复原倍率。保留独立到达检测用例。运行确认失败。
8. 在 `spaceshipStore.ts` 用 `cruiseNextJumpAtMs` 替换 60 秒字段；将 `toggleCruise(nowMs)` 与 `updateCruise(nowMs)` 接入 `computeCruiseJumpSeconds`。启用时仅要求存在汇合点且径向速度为正；当前 D/R 时先调用 `setGear('N')`。仅在可传播、达到 200 ms 跳跃间隔并且 `jumpSeconds >= 60` 时调用已有 `timeJump()`；`jumpSeconds < 60` 时不退出巡航。每次目标不超过当前汇合时刻。新增 `maybeCompleteRendezvous()` 在物理步进后清计划，不改写物理状态。运行巡航相关测试确认通过。
9. 修改 `ExploreCanvas.tsx`：使用该帧 `computeExploreBodyStates(store.simulatedTime, allIds)` 调用 `updateParkGear`，并以 `performance.now()` 调用 `updateCruise`。确保控制发生在物理步进之前。
10. 在 `navigation.test.ts` 先写 `computeTargetStatusParams` 失败测试，锁定目标距离、相对总速度、带符号径向/切向速度、Hill 范围、捕获状态及恒速近似下预计进入 Hill 半径的时间；再在 `navigation.ts` 实现纯函数。新增当前导航目标状态和解析：成功规划时写入汇合点，到达汇合点时切换为目的地天体。修改 `Dashboard.tsx`：计划存在时显示汇合参数；计划清除且仍选择目标时显示目标相对参数和预计进入目标引力范围时间，并在 `currentNavigationTarget` 存在时显示 T 档。更新巡航 tooltip 为分级跳跃语义，不把物理计算放入 `.tsx`。
11. 运行受影响的 Vitest 文件、受影响 TypeScript/TSX 的 ESLint、`npm run build`。若现有全仓 lint 仍有不相关报错，只报告它们并以受影响文件检查为准。

## 验收条件

- 巡航不使用高倍率连续步进；每轮按分级最大档跳跃，跳后检查 T/P；仅在切向/径向速度比不小于 0.01 时挂 T；不足 1 分钟后继续以 1x 物理推进。达到制动窗口即挂 P 并结束巡航。
- 汇合点在飞船进入 0.05 AU 后消失，导航完成并挂入 P 档；飞船的位置和速度保持由积分器产生的值，完成判定不依赖巡航是否活跃。
- P 档日心速度过零后仍维持 P 档，实时反向抵消合引力，并包含残余速度阻尼。
- P 档保持和巡航完成的所有关键状态变化均有 unit test；`npm run build` 成功。

## 实施结果

- 2026-07-11：实施完成。根据高倍率轨迹抖动反馈，巡航推进已替换为受控 1 天时间跳跃循环，取消 60 秒高倍率方案；P 档保持和独立汇合完成检测保持不变。
- 2026-07-11：已实施增量。将单日跳跃替换为制动窗口分级逼近，锁定 T 档切向/径向速度比 `0.01` 门槛，并在汇合计划清除后保留目标相对飞行参数。
- 2026-07-11：已实施增量。巡航从 D/R 启用时自动切 N、清除推力并指向汇合点；引擎启用判定不再读取手动推力状态。到达后目标参数新增恒速近似下预计进入目标 Hill 半径的时间。
- 2026-07-11：待实施增量。导航系统显式规划汇合点、目标 Hill 引力边界、目的地天体中心三个阶段；维护当前阶段索引和当前导航目标。T 档与巡航使用该阶段目标，阶段完成后切到下一阶段。
