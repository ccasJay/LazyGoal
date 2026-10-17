# Decide 接受语义与多调用顺序执行 执行计划

## 任务清单

- [x] //TODO 1. 零调用正文合法化与分类：Agent 契约、分类枚举、pi-ai 适配器接受
  - 落实标准：[1.1](./spec.md#spec-req-1-1), [1.3](./spec.md#spec-req-1-3), [1.5](./spec.md#spec-req-1-5), [5.1](./spec.md#spec-req-5-1), [5.3](./spec.md#spec-req-5-3)
  - 实施目标：`LLMStepExecutor` 的 Decide 输出从"必须恰好一个 tool call"改为分级接受：零调用且正文非空 → 合法的 `assistant_message` 结果；仅 reasoning 或空内容 → `no_usable_result`；单调用保持现有解析、授权与执行路径不变。为该结果定义可区分的分类标识进入 `LLMResponseProtocolError` 之外的新通道（不再复用 `missing_tool_call`）。`PiAiAdapter.toResponse` 在携带工具集合、`stopReason` 合法且仅返回文本时不得再抛 `PiAiProviderError`。
  - 验证手段：`packages/agent/test/llm-step-executor.test.ts` 新增"零调用 + 非空正文被接受为 assistant_message 且不产生 Tool 副作用""仅 reasoning/空内容归为 no_usable_result""单调用路径行为不变"三组断言；`packages/llm/test/pi-ai-adapter.test.ts` 新增"工具集合 + 零调用 + stopReason=stop 不抛错"断言；Red 先行。

- [x] //TODO 2. Runner 有界继续生成、越界禁止与计数归属
  - 落实标准：[1.2](./spec.md#spec-req-1-2), [2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2), [2.3](./spec.md#spec-req-2-3), [2.4](./spec.md#spec-req-2-4), [3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3)
  - 实施目标：Runner 对 `assistant_message` 与 `no_usable_result` 采用独立的有界计数（与 `request_think` 循环、临时故障重试、Tool 输入纠错的预算相互独立，含首次最多三次模型调用）；该计数用尽时以稳定原因明确失败，保留每次失败原因与该次 Assistant 文本并可在界面查看。继续执行只能由 Runner 决定，模型文本不得使 Goal 进入 completed；纠错与继续重试期间不得重复增加 `stepCount`；有效 `request_think` 结束当前链后计数重新开始。
  - 验证手段：`packages/runtime/test/runner-*.test.ts` 新增"零调用文本三次后 INVALID_AGENT_DECISION 且保留每次文本""零调用文本不产生 completed""stepCount 不因继续重试增加""request_think 后计数重新开始"断言；Red 先行。

- [x] //TODO 3. 多调用批次的持久化模型与恢复指针（**与 TODO 4 合并为一次交付**）
  - 落实标准：[4.3](./spec.md#spec-req-4-3), [4.6](./spec.md#spec-req-4-6), [6.2](./spec.md#spec-req-6-2)
  - 合并理由：本 TODO 引入的批次状态没有任何生产者——`classifyDecideResponse` 仍拒多调用，Runner 永远看不到 N>1，
    单独提交将得到无当前需求支撑的死状态。因此批次持久化模型必须与 TODO4 的"多调用暴露 + 逐个推进"同批落地。
  - 实施目标：Run 状态引入批次维度：批次身份、模型返回顺序、每个调用保留模型返回的 `callId`、已提交进度指针；Snapshot 编解码携带该维度且不回放已提交结果的 Action。恢复指针携带分类、计数与批次进度；身份或阶段输入不匹配时失败，不用旧反馈污染新 Step。
  - 验证手段：`packages/runtime/test/` 与 `packages/storage/test/` 新增"批次快照往返保留顺序、callId 与进度""身份/阶段不匹配时恢复失败""已提交 Action 不重放"断言；Red 先行。

- [x] //TODO 4. 多调用批次的判断、执行与 Observation 归属
  - 落实标准：[1.4](./spec.md#spec-req-1-4), [1.6](./spec.md#spec-req-1-6), [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2), [4.4](./spec.md#spec-req-4-4), [4.5](./spec.md#spec-req-4-5), [4.7](./spec.md#spec-req-4-7)
  - 实施目标：Runner 对多调用批次按模型返回顺序逐个执行：每个 Action 执行前独立通过 Tool 可用性、输入 Contract、执行策略与授权检查；需要审批的 Action 单独进入审批，不互相放大授权；每个 Action 成功执行结果各计一次 Step，判断与审批等待不计步；每个 Action 的 Observation 独立归属；某 Action 需人工等待或遇不可纠正故障时停止执行后续 Action 并保存可恢复等待或明确失败，已执行结果不回滚、不改写、不隐藏；一个批次至多一个结构化控制请求且必须是最后一个，其后的调用不得执行。严禁并发与乱序重排。
  - 验证手段：`packages/runtime/test/` 新增"未通过判断的 Action 不执行且不放行""审批不扩大到同批其它 Action""中途等待时后续停止且已执行结果保留""控制请求必须是最后一个且其后的调用不执行""每个 Action 各计一次 Step""Observation 独立归属"断言；Red 先行。

- [ ] //TODO 5. 批次执行中的恢复与取消
  - 落实标准：[4.3](./spec.md#spec-req-4-3), [6.1](./spec.md#spec-req-6-1)
  - 实施目标：在批次执行、继续生成、纠错或审批等待过程中中断并恢复时，依据已可靠提交的状态与尝试计数继续或明确失败；未提交的 Assistant 文本、模型决策与 Action 结果不得视为已生效；取消信号必须能打断批次中尚未开始的 Action，且不留下半提交状态。
  - 验证手段：`packages/runtime/test/` 新增"批次中断后从第一个未提交 Action 继续""取消后不执行后续 Action 且状态可恢复"断言；Red 先行。

- [ ] //TODO 6. 诊断与界面可区分的执行事实
  - 落实标准：[5.2](./spec.md#spec-req-5-2), [5.4](./spec.md#spec-req-5-4)
  - 实施目标：多调用不再报 `INVALID_LLM_RESPONSE` 的 `multiple_tool_calls` 协议错误，改为"多调用批次"事件；Trajectory、Diagnostic Trace、浏览器与 TUI 必须能区分"已接受的 Assistant 文本消息""多调用批次""无可用结果重试"三类事实；错误码、反馈与诊断文本可定位且不含明文凭据或 Provider 原始响应。
  - 验证手段：`packages/runtime/test/`、浏览器契约测试与 TUI 投影测试新增分类断言；`npm run check:docs` 通过；Red 先行。

- [x] //TODO 7. 全量回归、文档同步与 Spec 收口
  - 落实标准：本 Spec 全部验收标准的回归覆盖
  - 实施目标：跑既有全量测试与构建，确认既有单调用路径、快照回放、授权与证据校验未被破坏；更新受影响模块的 `notes/overview.md` 与 `notes/semantics.md`（`packages/agent`、`packages/runtime`、`packages/llm`、`packages/storage` 及浏览器/TUI 侧受影响读者）；按需追加 Learning Candidates。
  - 验证手段：`npm test`、`npm run check:docs`、`npm run check:dependencies`、`npx tsc --noEmit -p apps/goal-board/tsconfig.json`、`npm run build:web`、`git diff --check`。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 零调用正文被接受且不推进 Step | [1.1](./spec.md#spec-req-1-1) | 模型只返回非空正文；系统接受为 Assistant 消息并进入 Trajectory，不执行任何 Tool，`stepCount` 不变 | `npx tsx --test packages/agent/test/llm-step-executor.test.ts` |
| 零调用文本不产生完成语义 | [1.2](./spec.md#spec-req-1-2), [2.2](./spec.md#spec-req-2-2) | 连续零调用输出后 Goal 不得进入 completed；失败时保留每次文本 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 单调用路径不变 | [1.3](./spec.md#spec-req-1-3) | 恰好一个 tool call 时解析、授权、执行与既有用例完全一致 | 既有 `packages/agent`、`packages/runtime` 相关用例 |
| 多调用顺序执行且不并发 | [1.4](./spec.md#spec-req-1-4), [4.7](./spec.md#spec-req-4-7) | 三个调用按返回顺序执行，Observation 各自归属，无重排 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 仅 reasoning / 空输出 | [1.5](./spec.md#spec-req-1-5) | 只返回 reasoning 或空内容时归为无可用结果，不产生 Assistant 消息 | `npx tsx --test packages/agent/test/llm-step-executor.test.ts` |
| 控制请求唯一且最后 | [1.6](./spec.md#spec-req-1-6) | 批次含 `complete` 且其后仍有调用时，其后调用不执行；批次含两个控制请求必须被拒绝 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 继续决策归 Runner | [2.1](./spec.md#spec-req-2-1) | 模型文本自行宣告完成，Goal 不进入终态 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 有界计数与越界失败 | [2.3](./spec.md#spec-req-2-3), [2.4](./spec.md#spec-req-2-4), [3.1](./spec.md#spec-req-3-1) | 零调用文本连续三次后以稳定原因明确失败，保留每次原因与文本，界面可查看 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 计数独立与重新开始 | [3.2](./spec.md#spec-req-3-2) | 有效 `request_think` 结束后同一链计数归零 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| Step 计数归属 | [3.3](./spec.md#spec-req-3-3), [4.5](./spec.md#spec-req-4-5) | 判断、审批等待不计步；每个成功 Action 各计一次 Step | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 批次判断与授权隔离 | [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2) | 未通过判断的 Action 不执行；批准一条不放行同批其它 Action | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 中途停止与不回滚 | [4.4](./spec.md#spec-req-4-4) | 第二个 Action 需要审批时第三个不执行，前两个结果保留 | `npx tsx --test packages/runtime/test/runner-*.test.ts` |
| 批次身份与恢复 | [4.3](./spec.md#spec-req-4-3), [4.6](./spec.md#spec-req-4-6), [6.1](./spec.md#spec-req-6-1), [6.2](./spec.md#spec-req-6-2) | 快照往返保留顺序、`callId` 与进度；中断后从第一个未提交 Action 继续，已提交不重放；身份不匹配失败 | `npx tsx --test packages/storage/test/*.test.ts` 与 `packages/runtime/test/` |
| 分类与诊断不泄密 | [5.1](./spec.md#spec-req-5-1), [5.2](./spec.md#spec-req-5-2), [5.4](./spec.md#spec-req-5-4) | 零调用文本不再报 `missing_tool_call`；多调用不再报 `multiple_tool_calls`；三类事实可区分且不含凭据 | Trajectory/Diagnostic Trace 断言 + `npx tsx --test packages/runtime/test/` |
| pi-ai 路径接受零调用 | [5.3](./spec.md#spec-req-5-3) | prompt_only + 工具集合 + 零调用 + 合法 stopReason 不抛 Provider 错误 | `npx tsx --test packages/llm/test/pi-ai-adapter.test.ts` |
| 全量回归与文档 | 全部 | 既有用例全绿、文档检查与依赖边界通过 | `npm test`、`npm run check:docs`、`npm run check:dependencies`、`npm run build:web`、`git diff --check` |

### Latest Result

- 状态：passed（自动化范围内）
- 新鲜度：current
- 验证时间：2026-10-17（CST）
- 测试 Git 状态：分支 `codex/decide-stage-acceptance-semantics`，HEAD `dc025dda` 之后的文档提交；工作区干净。
- 全量回归：`npm test` 全部通过（类型检查、包内文档检查、依赖边界检查、GEPA adapter、**1928 项 TS 测试**、33 项 scripts，0 失败）。
- 定向证据：
  - `packages/agent/test/llm-step-executor.test.ts`：零调用正文接受为 Assistant 消息且不推进 Step；无可用结果分类；单调用路径不变；多调用批次按 `callId` 顺序解码；批次顺序执行且各计一次 Step、Observation 独立归属；批次中途需审批时停止后续执行并保留已执行结果与剩余队列；重复 `actionId` 被有界拒绝而非重放。
  - `packages/agent/test/native-model-history.test.ts`：原生 Decide 的多调用成为有序批次。
  - `packages/storage/test/goal-snapshot-current.test.ts`：`pendingActionBatch` 往返保留身份、顺序与剩余项；`pendingModelRepair` 两级计数往返。
  - `apps/goal-server/test/prompt-bundle-integration.test.ts`：非法 wire 文本返回时仍不产生任何 Tool 副作用，终态原因对齐零调用正文语义。
- 未覆盖（不在本轮证据范围）：R4-1/R4-2 的"批准不得把授权范围扩大到同批其它 Action"缺少直接断言；R4-3/R6-2 的"恢复后不重放"目前由"重复 actionId 被拒绝"间接覆盖，缺少独立的中断-恢复用例；TODO 5 的取消与恢复用例、TODO 6 的界面分类断言尚未编写。
- 待人工验证：真实多调用批次的端到端体验（费用、延迟、UI 呈现）需人工确认，未运行前不得宣称端到端通过。
