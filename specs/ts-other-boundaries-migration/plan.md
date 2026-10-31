# 其他数据边界契约迁移执行计划

本计划已完成执行，以[Spec](./spec.md)划分的剩余边界为范围，不重复拥有其他领域的迁移。

## 任务清单

- [x] //TODO 1. 核实剩余 AST 消费者与领域归属
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：对照 Catalog、生产导入、装配和跨进程入口，为每个剩余消费者记录信任边界与负责 Spec，区别 AST 与通用 JSON 工具。
  - 基本验证：抽查 Runtime、Worker 和外部适配边界的源码到消费链。
  - 执行记录：见 [inventory.md](./inventory.md)。Catalog `durable` 边界无 `contract-ast` 条目；生产 AST 使用点全部归属工具线、模型线、Web 线或 Storage 线，测试夹具单独列示；本线边界已核对源码到消费链。
- [x] //TODO 2. 迁移本线所属真实边界
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：使用 TS 类型和生成绑定替换各边界 AST；跨进程和外部输入验证，保留原有身份、错误、取消与恢复语义；对已分配其他 Spec 的引用只记录依赖。
  - 基本验证：运行真实 Worker 或进程的合法、非法和身份不匹配场景，并扫描本线遗留 AST。
  - 执行记录：本线边界不存在可替换的 Contract AST（见 [inventory.md](./inventory.md)），因此不伪造迁移；新增真实子进程回归 [`real-process-rpc.integration.test.ts`](../../benchmarks/test/real-process-rpc.integration.test.ts)，覆盖 LLM RPC 合法/协议拒绝/取消、Tool RPC 合法/缺失 Goal-Run 身份/未知工具/重复 Action/取消，并验证取消后可继续服务。生成能力基线已足够，不需要堆叠生成能力分支。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 边界归属与覆盖 | [1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4) | 所有剩余引用有本线完成或其他 Spec 归属证据；通用 JSON 原语单独列示。 | Catalog 与源码、注册/装配清单核对及 AST 引用扫描。 |
| 实际进程与恢复 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 跨进程、Worker、外部与 Runtime 实际链路合法及错误场景符合原边界，不添加同进程多余校验。 | 真实进程与 Worker 集成、失败/取消/恢复测试。 |
| 集成回归 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 实际生成制品与各边界集成通过，本线无旧 AST 生产消费。 | `npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31 13:46 CST
- 验证提交：`c0698316`（本记录更新不改变被验证代码）；工作树 `feat/ts-other-boundaries-migration`，共同基线 `e3926377`，未堆叠生成能力分支（本线无新增生成制品依赖）。
- 边界归属与覆盖：passed。[inventory.md](./inventory.md) 对照 Catalog `durable` 边界与生产导入；`jq` 核对 `durable` 无 `contract-ast` 条目，源码扫描确认本线无旧 AST 构造/解析。生产 AST 使用点全部归属工具线、模型线、Web 线或 Storage 线；测试夹具单独列示；`canonicalJson`、`isRecord`、`deepFreeze`、`compareCodeUnits` 与 JSON 类型列为通用原语。
- 实际进程与恢复：passed。
  - 新增真实子进程回归 [`real-process-rpc.integration.test.ts`](../../benchmarks/test/real-process-rpc.integration.test.ts)：6/6 通过，覆盖 LLM RPC 合法/协议拒绝/取消、Tool RPC 合法/缺失 Goal-Run 身份/未知工具/重复 Action/取消，并验证取消后继续服务。
  - 真实 Worker 打包与脱离源码模板的确定性会话 [`agent-components-worker.integration.test.ts`](../../benchmarks/test/agent-components-worker.integration.test.ts)：2/2 通过。
  - 定向边界套件（Mux、Tool RPC、LLM RPC、ALFWorld sidecar、Bench Worker metadata、Session 输入、Process Session）93/93 通过。
  - Runtime/Storage 恢复子集（Plan/Run/Program 中断、Session 恢复、跨进程 GoalStore、PTC 恢复、进程会话）73/73 通过；其中跨 tsx 进程与 killed host 场景通过。
- 集成回归：分段等价验证通过。
  - `npx tsc --noEmit`：通过。
  - `npm run contracts:generate -- --check`：`Contract artifacts are current.`
  - `npm run check:dependencies`：`依赖边界验证通过：320 个源文件`。
  - `npm run check:docs`：`文档检查通过：47 个模块，169 份当前说明。`
  - `npm run build:web`：通过（Vite 构建成功，仅有既有 chunk 大小警告）。
  - `git diff --check`：通过。
  - 全量 TypeScript 测试（回归入口同源发现，446 个测试文件）：2699/2699 通过，19 个 suite，耗时约 333 秒。
  - `node --test scripts/*.test.mjs`：98/98 通过。
  - `npm run test:gepa-adapter`：198/198 通过（冷环境首次整跑受计时断言影响，单独复跑及本机安静时复跑均通过）。
- `npm test` 整跑记录：两次整跑均被并发负载下的环境敏感用例打断，未得到单次绿色结果；等价分段验证已全部通过。
  - 第一次：GEPA `test_start_spawns_detached_worker_and_returns_immediately` 断言 `elapsed < 2.0` 实际 4.64 秒；该用例单独运行为 0.65 秒通过，`test_lifecycle_controller` 模块 17/17 通过，GEPA 全套复跑 198/198 通过。
  - 第二次：TS 全套 2696/2699，通过项之外 3 项为 `isolated-environment.test.ts` 的 forceSignal 预算用例与 `packages/tools/test/bash.test.ts` 的超时清理/head_tail 断言行用例；三者单独运行的文件 39/39 通过。运行时系统负载约 21（其他执行者并发整跑 Web 测试）。
- 未解决问题：本线无代码阻塞。工具线/模型线在集成 worktree 切换 `runtime/src/runner.ts`、`runtime/src/tool.ts`、`benchmarks/src/tool-rpc.ts`、`remote-tool-registry.ts`、Benchmark 工具清单与 `model-context` 投影后，协调者需复核本清单归属仍成立；若出现新的本线 AST 消费者，按 Spec 1.2 补充迁移。建议在系统负载正常时由集成环境重跑一次 `npm test`，以留下单次绿色整跑证据。
