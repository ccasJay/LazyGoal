# 多 Spec 编排

## 编排目标

在同一 Goal 和 Run 统一生命周期中，先完成 Run 内阶段定义、阶段审查与上下文投影去重（基石能力），再在其交付的阶段身份、修订与提交事实之上，实现跨 Run 的 Goal 阶段与决策索引构建、分层检索与模型导航，使 Agent 具备自主阶段推进审查与跨 Run 历史高效回溯能力。

## 涉及的 Spec

| Spec | 路径 | 批准状态 | 完成条件 |
|---|---|---|---|
| Run 内阶段审查与上下文投影优化（Spec A） | [specs/run-stage-review-and-context-projection/](specs/run-stage-review-and-context-projection/) | 已批准 | 全部 7 个 TODO 完成，Feature Verification passed（单元测试、Agent 审查回归及 Context Benchmark 验证通过） |
| Goal 阶段与决策索引及分层检索（Spec B） | [specs/goal-context-index-and-retrieval/](specs/goal-context-index-and-retrieval/) | 已批准 | 全部 7 个 TODO 完成，Feature Verification passed（索引构建/重建、检索展开、模型导航及 Benchmark 质量验证通过） |

## 依赖关系与执行顺序

`Spec A → Spec B`。

Spec B 明确且强依赖 Spec A：
1. Spec B 的阶段目录汇总、阶段历史投影以及模型导航能力，直接以 Spec A 引入的 Run 阶段身份（stageId）、阶段修订（stageRevision）、阶段提交事实（StageAccepted / StageRejected）及提交边界作为事实源。
2. 若 Spec A 尚未完成并落地权威阶段事实，Spec B 将缺少核心数据结构与提交语义支持。
3. 执行顺序：先执行并通过 Spec A 的全部实现与 Feature Verification，再在其基础上执行 Spec B。

## 可并行执行的部分

无。Spec B 在领域契约、模型输出 AST、执行提交事实与存储结构上强依赖 Spec A，两个 Spec 不具备并行实施条件，必须串行推进。

## 分支与合并策略

按逻辑依赖采用堆叠分支策略：
1. **基准分支**：以当前代码状态为基准（保留当前工作树未提交修改与隔离测试环境）。
2. **Spec A 开发分支**：基于基准分支创建 `codex/run-stage-review-and-context-projection`，按其 `plan.md` 逐任务实现并完成 Feature Verification。
3. **Spec B 堆叠分支**：在 Spec A 验证通过的提交上创建 `codex/goal-context-index-and-retrieval` 分支，执行 Spec B 的 `plan.md` 并完成 Feature Verification。
4. **集成与合入**：完成跨 Spec 集成验证后，按 `Spec A → Spec B` 的顺序依次合并回目标基准分支。

## 跨 Spec 协调约束

1. **权威边界与职责划分**：
   - 权威事实统一归属于 Goal Snapshot 与 Trajectory 事件流；
   - Spec A 负责阶段定义、修订与审查接受/拒绝事实的持久化与 checkpoint 提交；
   - Spec B 仅作为消费者读取已提交的权威事实，派生只读索引缓存（`context-sidecars/<encoded-goal-id>/goal-index.json`），缓存失效或丢失时必须能从 Spec A 的轨迹权威重建，不建立第二份权威状态。
2. **模型契约与输出统一**：
   - Spec A 引入 `run_stage_update` / `run_stage_complete` 及对应的系统工具声明；
   - Spec B 引入 `contextNotes`（重要决策与用户强调信息提议）并扩展 `context_lookup`；
   - 两者均基于不可变 Contract AST 统一构建 Wire 与 Provider Schema，严禁手工复制或破坏 AST 契约一致性。
3. **Prompt 拓扑与预算协同**：
   - Spec A 负责消除重复动作参数与原生工具 Schema 投影冗余；
   - Spec B 负责在 Step 请求中注入有界 `goal_context_navigation` 动态 Section；
   - 两者须共同维持 Goal-stable → Epoch-stable → Step-dynamic 请求拓扑，末尾严格保留 `runtime_feedback`，固定预算不超限。
4. **不越界与 Gap 处理原则**：
   - 本编排仅治理 Spec 级别的执行顺序、依赖与集成策略，绝不介入或修改单个 Spec 内部 tasks 的具体执行方式；
   - 若实施过程中发现两 Spec 之间存在接口或行为不一致的 Gap，须回到受影响 Spec 的 `spec.md` 或 `plan.md` 进行修订和审批，严禁在编排文件中补丁式定义新行为。

## 跨 Spec 集成验证

在 Spec B 实施完成后，执行以下跨 Spec 集成验证场景：

| 场景 | 预期结果 | 检查方式 |
|---|---|---|
| 多阶段执行与审查事实进入索引目录 | Run 内发生的阶段更新、审查拒绝及接受事实在提交后，被索引派生模块准确捕获；目录区分已接受 vs 执行中，未通过阶段不误判为完成 | 运行阶段执行与索引构建联合测试，断言目录项状态与 Trajectory 事实一致 |
| 跨 Run 阶段历史索引与分层检索 | 前序 Run 经历多阶段交付后，后续新 Run 能够通过 `goal_context_navigation` 看到前序阶段导航，并通过 `context_lookup` 分页查询并直接展开阶段详情与决策原文 | 运行跨 Run 恢复与 Lookup 集成测试，验证导航投影与来源展开正确性 |
| 索引缓存失效从轨迹安全重建 | 删除或损坏 `goal-index.json` 侧车缓存后发起查询，系统能够从权威 Trajectory 完整重建索引，结果与缓存一致，无副作用且不推进 Step/Memory 边界 | 运行重建与容灾断言测试，比对重建前后内容摘要完全一致 |
| Prompt 预算与上下文协同 | 在启用 Spec A 的重复动作去重与 Spec B 的阶段导航 Section 时，请求 Section 拓扑正确，缓存前缀稳定，固定预算未超限，`runtime_feedback` 保持在末尾 | 运行 Agent 请求组装与 Prompt 拓扑回归测试，验证输入 Token 预算合规 |
| 全量回归与代码文档契约一致性 | 相关 packages（`runtime`、`model-contracts`、`agent`、`storage`、`context-retrieval` 等）及 benchmarks 均通过类型检查、测试与依赖边界核查 | 执行 `npm test`、`npm run check:dependencies`、`npm run check:docs` |

## 生命周期状态

- [x] 编排已获用户批准
- [x] 各 Spec Feature Verification 全部 passed
- [x] 跨 Spec Integration Verification passed
- [x] Memory 沉淀门完成（需要的写入已获批准并完成，或用户明确确认无需沉淀）
- [x] 用户确认最终交付
- [ ] 已删除 orchestration.md
