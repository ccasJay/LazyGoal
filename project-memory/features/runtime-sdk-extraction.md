---
feature: runtime-sdk-extraction
status: active
summary: "将 goal-server 的执行装配与实例生命周期提炼为可独立注入、可恢复的运行时组件，本轮不新增 SDK 包"
source_spec: specs/runtime-sdk-extraction/
distilled_at: 2026-10-17
reviewed_at: 2026-10-17
tags: [runtime, execution-composition, lifecycle, managed-resource, shutdown, dependency-injection, recovery]
authorities: [apps/goal-server/src/runtime/execution-composition.ts, apps/goal-server/src/runtime/composition.ts, apps/goal-server/src/runtime/index.ts, packages/runtime/src/lifecycle/runtime-lifecycle.ts, packages/runtime/src/lifecycle/managed-resources.ts, apps/goal-server/src/process-exit.ts, scripts/check-dependencies.mjs]
---

# Runtime SDK Extraction

## Purpose

- 将 `goal-server` 组合根中耦合的执行装配、实例生命周期与调用接口提炼为可独立调用的组件：调用方注入现有 Port 即可推进 Goal、关闭实例并在重建后恢复同一 Run；`goal-server` 作为本轮唯一生产消费者验证行为保持，本轮不新建 SDK 包，也不构成对外发布承诺。 [S1, S2]

## Durable Decisions

- D1 — 执行装配 `createExecutionComponents` 位于 `apps/goal-server/src/runtime/execution-composition.ts`：接收现有 StepExecutor、Profile Registry、Store、工具与可选 Port，组合 Launcher、Runner、InlineScheduler、共享检查点提交器与 GoalCoordinator；相同依赖只注入一次，三个执行对象共用同一 Store、Trajectory 与提交边界，保存顺序、累计预算、协议与授权规则不变。 [S1, S2, S3]
- D2 — 执行装配不解析应用配置、不创建模型供应商或默认文件存储、不启动 HTTP、不注册进程信号、不退出进程；应用默认依赖装配归 `runtime/composition.ts` 的 `createRuntimeComposition`，HTTP、路由与浏览器访问控制留在外层宿主，服务不得为绕过组件另起执行链，也不保留第二套关闭算法。 [S1, S3, S4]
- D3 — 实例生命周期 `RuntimeLifecycle` 位于 `packages/runtime/src/lifecycle/runtime-lifecycle.ts`，状态为 open → closing → closed：首次 `close()` 立即拒绝新执行与写控制、冻结 Checkpoint Gate、中止实例控制器，随后执行正常与强制两阶段有界清理（各以 `gracePeriodMs`，默认 2000ms 为上限）；重复 close 返回同一结果。 [S1, S2, S5]
- D4 — 只有已受理操作、已进入保存边界的写入与自有资源全部结算才报告关闭成功；未结算产生携带类别（operations / writes / resources）与原因的 `RuntimeLifecycleIncompleteError`，失败时保持 closing 且不可重新受理。关闭不创建用户 Interrupt、失败或取消终态，不伪造 Observation，也不声称未知副作用已回滚或同一持久化位置可立即安全重用。 [S1, S2, S5, S8]
- D5 — 资源所有权边界：实例自有的 AbortController、Checkpoint Gate 与 ManagedResource 集合由所有者创建并明确交付关闭；成功、拒绝与未完成分别表示已结算、清理失败与尚未确认，未完成资源仍可被强制升级，通用生命周期只消费该契约、不读取具体进程内部状态。宿主借出的 Adapter、Registry、Store 与信号不因注入自动转移所有权。 [S1, S2, S5, S6]
- D6 — ExitPort / ProcessExitPort、SIGINT 退出码与退出决策归 `goal-server`（`apps/goal-server/src/process-exit.ts` 与 `cli.ts`）：`HostShutdownCoordinator` 调用唯一关闭核心并并发清理应用自有 HTTP 等资源，无论实例关闭是否完整都请求退出，正常退出与 SIGINT 共用同一实例关闭能力。 [S1, S4, S7]
- D7 — 控制接口只返回消费者需要的 `commands`（launch / advance / resume / continue / steer / interrupt / enterPlanMode 与权限委派），不返回 Runner、提交器或整个 Coordinator；等待不报告为完成，终态后 `continue` 创建后继 Run；等待后重建实例须提交匹配交互才恢复同一 Run，身份失配、损坏数据或缺失实现沿用既有拒绝边界。 [S1, S2, S3, S9, S10, S11]
- D8 — 机器约束由 `scripts/check-dependencies.mjs` 的定向规则持有：组件目录不得反向导入宿主入口、Browser / HTTP 实现或直接使用进程退出 / 信号 API，生产代码跨目录须走目录入口，禁止跨目录穿透与项目内 dist / lib / build 产物导入；检查覆盖 import / export、侧效与字面量动态导入。 [S1, S2, S12]

## Guardrails

- 严禁以注入空 ExitPort、第二套关闭顺序或保留旧 shutdown 包装代替职责分离；迁移后删除已迁职责与陈旧导出，不留重复关闭逻辑。 [S1, S2]
- 严禁把领域规则、授权与持久化协议复制进组件，或以隐藏引用声称形成安全沙箱；调用方提供的存储仍归调用方所有。 [S1, S3]
- 关闭超时不得报告成功或允许实例重新受理；HTTP / SSE 断开、退订与订阅故障不得取消已受理执行或改变提交结果。 [S1, S2, S9]
- 不新增多实例、跨进程锁、任务队列或自动后继 Run；Benchmark 本轮不迁移其 Runtime 装配。 [S1, S2]

## Revisit When

- 出现独立消费、依赖安装、运行环境或发布需求，需要把执行装配提升为 package 时。
- 需要多实例并发、跨进程锁或把服务能力整合为 SDK 操作组时。
- Runtime 生命周期契约、ManagedResource 结算语义或宿主退出策略变化时。

## Sources

- S1: `specs/runtime-sdk-extraction/spec.md`
- S2: `specs/runtime-sdk-extraction/plan.md`
- S3: `apps/goal-server/src/runtime/execution-composition.ts`
- S4: `apps/goal-server/src/runtime/composition.ts`
- S5: `packages/runtime/src/lifecycle/runtime-lifecycle.ts`
- S6: `packages/runtime/src/lifecycle/managed-resources.ts`
- S7: `apps/goal-server/src/process-exit.ts`
- S8: `packages/runtime/test/runtime-lifecycle.test.ts`
- S9: `apps/goal-server/test/execution-composition.test.ts`
- S10: `apps/goal-server/test/runtime-composition.integration.test.ts`
- S11: `apps/goal-server/test/runtime-recovery.integration.test.ts`
- S12: `scripts/check-dependencies.mjs`
