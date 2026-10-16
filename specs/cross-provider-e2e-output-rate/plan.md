# 跨 Provider 端到端输出速率实施计划

## 任务清单

- [x] //TODO 1. 在通用模型调用边界记录并持久化端到端请求耗时
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[5.1](./spec.md#spec-req-5-1)
  - 实施目标：先扩展 Agent 指标测试，证明 `.stream()` 与 `.generate()` 都记录从 Provider 调用到响应完整消费的有效耗时，且失败请求仍能记录已观测耗时；再在模型调用完成事实加入可选 `requestDurationMs`，由 JSONL Store 严格校验并往返保存。保留没有该字段的历史事实可读，并同步更新公开 TypeScript 契约 TSDoc。
  - 验证手段：`npx tsx --test packages/agent/test/llm-step-executor-metrics.test.ts packages/storage/test/session-metrics-store.test.ts`；断言两种调用方式产生有限正耗时、失败事实仍可读、历史 JSONL 缺少该字段仍能恢复，且无效计时值不能进入持久化事实。

- [x] //TODO 2. 依据 Provider 用量和请求耗时投影速率并在调用完成后刷新
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)
  - 实施目标：先扩展 Session Metrics 测试，覆盖加权聚合、缺失 Provider 用量或请求耗时、失败调用、旧解码耗时不回退、不可用结果和单次调用完成后的实时快照；再将投影改为成功调用 Provider 输出 token 总和除以对应请求耗时总和。速率测量数和排除数独立于 token 用量覆盖；现有 DTO 字段保持形状但更新语义 TSDoc。
  - 验证手段：`npx tsx --test packages/session-metrics/test/session-metrics-service.test.ts packages/web-contracts/test/web-contracts.test.ts`；使用至少两条耗时不同的有效调用验证总 token／总耗时结果，确认运行中调用完成事实写入前不计入、写入后即更新，缺少请求耗时的历史调用保持排除。

- [x] //TODO 3. 在看板各指标位置以端到端输出速率替换 Generation
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)
  - 实施目标：先扩展 Goal Board 可见 E2E，验证 Goal 卡片、摘要栏和详情弹窗显示新标签与 `tok/s`，保留测量／排除调用数；再移除这些位置的 Generation 标签，说明端到端边界，并验证不可用值及既有 token、缓存、上下文和覆盖信息没有改变。用指标 SSE 完成调用前后的快照验证运行期间刷新。
  - 验证手段：`npm run build:web`、`npm run test:web-e2e`；在确定性 E2E 模拟的指标响应与 SSE 更新中断言旧 Generation 文案消失、每次完成调用后展示刷新、详情说明包含等待和传输范围。

- [x] //TODO 4. 同步指标架构文档并完成跨模块回归
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[2.1](./spec.md#spec-req-2-1)、[3.1](./spec.md#spec-req-3-1)、[4.3](./spec.md#spec-req-4-3)、[5.2](./spec.md#spec-req-5-2)
  - 实施目标：更新 Runtime、Storage、Session Metrics、Web Contracts 与 Goal Board 的受影响 `notes/overview.md`、`notes/semantics.md` 和公开 TSDoc；核对历史事实、流式与非流式 Provider、指标投影、SSE 和界面说明使用同一计时及覆盖口径。运行完整回归，处理本功能导致的问题，不改写无关工作区变更。
  - 验证手段：`npm run check:docs`、`npm test`、`git diff --check`；文档检查和全量回归通过，差异检查无空白错误。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 统一请求计时与持久化 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5) | `.stream()` 与 `.generate()` 的耗时覆盖适配器调用至完整响应消费，不包含本地准备和后处理；失败调用可记录已观测时间，但不成为成功速率样本。 | Agent 与 Storage 定向测试；检查完成事实字段和值。 |
| Provider 用量纳入与加权投影 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5) | Provider 确认用量且请求成功、耗时有效的调用才纳入；结果等于输出 token 总和／耗时总和。缺失用量、缺失耗时和失败调用被排除；无样本时速率不可用；覆盖计数不与 token 覆盖混淆。 | `npx tsx --test packages/session-metrics/test/session-metrics-service.test.ts packages/web-contracts/test/web-contracts.test.ts`。 |
| 运行中完成调用后的刷新 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3) | 当前调用完成事实写入前不显示该调用的临时用量或速率；写入后立即刷新；Run 结束的最终值与同一组已完成事实的投影相同。 | Session Metrics watch 测试和看板确定性 E2E 的 SSE 快照断言。 |
| 看板替换、解释和其余指标语义 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | Goal 卡片、摘要栏和详情弹窗均显示端到端输出速率、单位、测量／排除数；旧 Generation 展示消失；详情说明其计时边界；token、缓存、上下文与用量覆盖保持原值。 | `npm run build:web`、`npm run test:web-e2e`，检查三个界面位置及 SSE 更新。 |
| 历史记录不回填 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3) | 不含请求耗时的既有 JSONL 仍能读取，但其调用不计入速率；旧 Trace 和 `decodeDurationMs` 不会回填或成为回退来源。 | Storage 兼容读取测试、Session Metrics 排除测试。 |
| 文档与完整回归 | [1.1](./spec.md#spec-req-1-1)、[2.1](./spec.md#spec-req-2-1)、[3.1](./spec.md#spec-req-3-1)、[4.3](./spec.md#spec-req-4-3)、[5.2](./spec.md#spec-req-5-2) | 所有模块文档对事实字段、聚合口径、刷新行为和界面说明一致；受影响源、Web 构建、E2E、依赖和文档检查通过。 | `npm run check:docs`、`npm test`、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-15 09:23 CST（Asia/Shanghai）
- 测试 Git 状态：分支 `codex/cross-provider-e2e-output-rate`，HEAD `a7bc93f9e362f391502c06dd49b4b8603764d679`；未创建提交。
- 相关未提交实现范围：`packages/agent/src/llm-step-executor.ts`、`packages/agent/test/llm-step-executor-metrics.test.ts`、`packages/runtime/src/model-call-metrics.ts`、`packages/storage/src/json-file-metrics-store.ts`、`packages/storage/test/session-metrics-store.test.ts`、`packages/session-metrics/src/session-metrics-service.ts`、`packages/session-metrics/test/session-metrics-service.test.ts`、`packages/web-contracts/src/metrics.ts`、`apps/goal-board/src/components/GoalCard.tsx`、`apps/goal-board/src/components/SessionMetricsBar.tsx`、`apps/goal-board/e2e/board.test.mjs`，以及 Runtime、Storage、Session Metrics、Web Contracts、Goal Board 的 `notes/overview.md` 与 `notes/semantics.md`。这些文件按路径和内容拼接后的 SHA-256：`7255585e6bc01292d7448d68a75c4675789032bb9e3818f0ddc4b4d98c07956d`；验收契约 `spec.md` SHA-256：`cb2e3add82f0c743f649a75a4305e6f7043c6143efa3646bfa0b9813b46e19dc`。
- 模型调用计时、持久化与投影：`npx tsx --test packages/agent/test/llm-step-executor-metrics.test.ts packages/storage/test/session-metrics-store.test.ts` 通过（8/8）；`npx tsx --test packages/session-metrics/test/session-metrics-service.test.ts packages/web-contracts/test/web-contracts.test.ts` 通过（18/18）。覆盖流式与非流式请求计时、失败调用、旧事实读取、有效样本加权、缺失计时排除及完成后快照更新。
- 看板：`npm run build:web` 通过；`node --test apps/goal-board/e2e/board.test.mjs` 通过（1/1），覆盖 Goal 卡片、摘要栏、详情说明和 SSE 更新。首次并行 `npm run test:web-e2e` 有 3 项通过、`run-input-control.test.mjs` 因 HTTP 409 失败；该用例独立重跑通过，之后 `npm run test:e2e --prefix apps/goal-board` 串行完整运行通过（4/4），包含相同用例及本次指标 E2E。串行重跑作为并行脚本的等价完整覆盖。
- 文档与全量回归：`npm run check:docs` 通过（30 个模块、115 份说明），最终交付记录更新后再次通过；`npm test` 通过，包括 198 项 GEPA 测试、1797 项主测试和 33 项脚本测试，零失败；该回归还执行了类型检查、依赖边界检查。最终交付记录更新后 `git diff --check` 通过。
- 构建提示：Vite 对大于 500 KB 的 chunk 发出既有体积提示，构建成功；与本次指标变更无关。
- 未解决问题：无。
