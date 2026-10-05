# Agent 完成判断与最终交付优化实施记录

用户明确授权实施上述完整方案；以下 TODO 是已批准方案的实施拆分，不增加产品范围。

- [x] //TODO 1. 定义必需的完成审查接口、封闭输出契约和当前持久化标签

  对应 [R2](./requirements.md#r2-审查职责与输入)、[R5](./requirements.md#r5-诊断与质量验证) 与 [审查请求与契约](./design.md#审查请求与契约)。所有 Executor 和测试桩显式实现审查，没有默认放行；native/text 输出只接受审查结果，拒绝空反馈；Storage 读取保留 completion_review。

- [x] //TODO 2. 接入完成门控、反馈纠错、恢复和原文提交

  对应 [R1](./requirements.md#r1-完成门控)、[R3](./requirements.md#r3-纠错与恢复)、[R4](./requirements.md#r4-最终交付) 与 [完成流程](./design.md#完成流程)、[纠错、恢复与取消](./design.md#纠错恢复与取消)。两种 Run 都先校验证据再审查；拒绝不提交终态、回复或 Patch，补充调查后可重审；三次耗尽、取消恢复和保存失败均有测试。

- [x] //TODO 3. 更新完成说明、审查诊断与指标集成

  对应 [R4](./requirements.md#r4-最终交付)、[R5](./requirements.md#r5-诊断与质量验证) 与 [诊断所有权](./design.md#诊断所有权)。summary 明确为完整回复，审查独立 callId 与输入标签，成本纳入指标，内部审查文本和函数参数不进入公开流，相关契约和架构文档同步。

- [x] //TODO 4. 运行固定模型评测、受影响检查和全量回归并记录结果

  对应全部验收条件与 [验证与限制](./design.md#验证与限制)。8 个正反场景各重复三次，记录错误完成、误拒绝、独立调用与令牌变化；运行受影响测试、类型、依赖和 npm test，不用单元测试替代真实模型证据。

## Feature Verification

### Planned Checks

| 范围 | 场景及预期 | 验证入口 |
|---|---|---|
| R1、R3、R4 | normal/plan 拒绝后补充源码；回复、终态和 Patch 提交隔离；原文保存 | runtime/test/completion-review.test.ts |
| R1、R3 | 非法引用先拒绝，共用三次纠错上限，耗尽不完成 | runtime/test/completion-review.test.ts |
| R3 | 审查取消、反馈恢复、传输重试、完成保存失败 | runtime/test/completion-review.test.ts |
| R2 | native/text 封闭契约、非法/多个调用/空反馈、必要输入超限不调用模型 | agent/test/completion-review.test.ts |
| R4、R5 | 独立调用身份、用途标签和 metrics；公开流无审查文本或参数 | agent/test/completion-review.test.ts；session-metrics/test/session-metrics.integration.test.ts |
| R5 | JSONL manifest 重建保持 completion_review | storage/test/model-input-store.test.ts |
| R4、R5 | 浏览器列表与详情读取审查记录，真实普通/Plan 流程原文展示 | browser/test/browser-model-input.test.ts；apps/goal-board/test/model-input-api.test.ts；apps/goal-board/e2e/runtime.test.mjs |
| R1、R5 | 模型绑定、审批、工具与 Benchmark 权威评分保持有效 | TUI、LLM、Runtime、Headless/ALFWorld/SWE-bench 相关回归 |
| R2、R5 | 8 个固定正反候选各三次，零错误放行与无故拒绝 | npm run llm:decision-eval -- --completion-review |
| 全部 | 类型、依赖、全仓回归与文档检查 | npm test；git diff --check |

### Latest Result

状态：**passed**；freshness：**current**；验证时间：2026-10-05T14:32:49+00:00。全部 4 个 TODO 完成，无未解决验收问题。

被测状态：基于 `0d718dec` 的 `codex/completion-delivery-review` 工作树，本轮改动尚未提交时完成验证。变更范围为 packages 的 Runtime/Agent/Contracts/Storage、相关测试桩与指标集成，apps/goal-board 的输入标签和测试，以及相关架构文档。按非 Spec 变更路径排序，用 `path + NUL + content + NUL` 汇总的 SHA-256 为 `49ba74aa636336e9cc382af17f91adc7cde0d7df531fb9159da5050d6d792932`（66 个文件）。需求内容 SHA-256：`80f6f5d90720f227e9c820424f0bc13240e833b20476146012aced6f94b0bde3`；设计内容 SHA-256：`6efbf4947a20d9b334ba2c4e016d1e7ef63a8cd4bb2801603f72d504044c685e`。Spec 验证记录的更新不改变被测实现。

| 验收范围 | 实际结果与证据 |
|---|---|
| R1、R3、R4 | [Runtime 审查测试](../../packages/runtime/test/completion-review.test.ts) 7/7：normal/plan 的首次拒绝不保存回复、终态或候选 Patch；补充源码后重审并原文提交；非法引用先拒绝且共用三次纠错上限；取消恢复与保存失败保留提交边界；传输失败重试同一候选。 |
| R2、R5 | [Agent 审查测试](../../packages/agent/test/completion-review.test.ts) 10/10：native/text 契约、非法/空白/多调用、业务工具隔离、必要输入超预算先失败；输入 callId 与指标配对；generate 与 stream 的审查文本、reasoning 和函数参数均无公开事件。 |
| R4、R5 | [Storage 重建](../../packages/storage/test/model-input-store.test.ts)、[浏览器投影](../../packages/browser/test/browser-model-input.test.ts)、[前端 wire 读取](../../apps/goal-board/test/model-input-api.test.ts) 与 [指标集成](../../packages/session-metrics/test/session-metrics.integration.test.ts) 通过；审查调用计入用量，第三标签重启后可读。 |
| R1、R4、R5 组合流 | `npm --prefix apps/goal-board run test:e2e` 2/2、页面构建与前端单测 4/4 通过。[真实本机服务 E2E](../../apps/goal-board/e2e/runtime.test.mjs) 验证恢复审批、普通 Run、继续任务和 Plan Run 完成；独立审查记录可查，提交回复与候选原文一致。 |
| 全部确定性回归 | `npm test` 通过类型、226 个源文件的依赖检查、198 项 Python GEPA 测试、1,760 项 TypeScript 测试及 14 项脚本测试。末轮精简两处未使用的 Headless 假响应后，相关 15/15 再次通过；仅移除不可达测试桩分支，其他回归证据保持有效。`git diff --check` 通过；已核对相关架构与公开契约。 |

真实模型质量与确定性回归分别记录：

- 模型：Google `gemini-3.1-flash-lite`，使用现有本机代理；原 `/v1` 返回 404，临时覆盖 `LLM_BASE_URL=http://127.0.0.1:8317/v1beta` 后执行 `npm run llm:decision-eval -- --completion-review`，未修改环境文件。调用失败的首轮标记为 incomplete，不计为通过。
- 8 个固定候选各重复 3 次：24/24 passed。状态概述、目录判断、未验证改动、漏交付条件均拒绝（12/12）；充分分析、问候、已提供源码和已验证改动均接受（12/12）。旧结构/引用门控配对放行的错误候选为 12，新审查误放行 0、误拒绝 0。
- 新增 24 次模型调用，输入 18,585 tokens、输出 1,045 tokens，无缺失用量；均值约 1,543 ms/次。基线仅做候选结构/引用校验，额外模型调用及 tokens 均为 0；共同候选生成不计入比较。
- [本机模型报告](../../build/completion-review/2026-10-05T14-17-11-844Z/summary.json) 与同目录 results.jsonl 保存逐次反馈、调用身份、完整输入、用量和耗时。results SHA-256：`9cd8f83cf62289b4206fa1f34d14aa7b671bb386ad386f1e05baf29723bb72c6`；审查 Prompt SHA-256：`1dc87476f301dd17070ad609086004ef3f84fa7f4874136bb85dd60bbe5971bc`。报告目录为被忽略的本机验证产物；本表保留可提交的结果摘要。

限制：此结果验证固定候选的完成审查，不估计长任务端到端成功率，也不代表所有模型均有相同表现。每个候选通常增加一次模型调用，恢复未完成审查可能再调用；模型仍可能误判。必要输入超预算时失败，不通过裁剪掩盖缺口。


## Learning Candidates

- 完成候选的语义审查应位于证据引用校验之后、终态和候选 Patch 提交之前；单纯加强 summary 的 Prompt 说明无法建立提交门控。候选依据：本 Spec 及 completion-review.test.ts，尚未写入长期 Memory。
- 新增内部模型调用必须单独考虑公开流隔离、诊断身份和成本；复用 Decide 控制阶段不等于复用同一 callId。候选依据：Agent 审查诊断测试与 session-metrics 集成测试。

现有 Memory 影响候选（仅索引检查，未修改）：goal-driven-workflow-prompt、verifiable-completion-evidence、native-tool-calling-architecture 和 browser-trajectory。新增门控补充了完成条件和内部调用记录，Decide 单次调用语义仍保持。
