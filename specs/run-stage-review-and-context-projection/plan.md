# Run 内阶段审查与上下文投影优化执行计划

## 执行边界

[Spec](./spec.md) 已在当前会话明确批准。风险及否定性保证以 [Spec 风险章节](./spec.md#风险与否定性保证) 为准。本 Plan 不改变 Run 创建、额度、工具、沙箱或模型权限边界，不新增 Task 聚合或阶段调度器。

按 TODO 顺序执行，每项先建立可观察失败断言，再实现与验证；完成只修改 checkbox，保留原 TODO 文本。下文标注“待新增”的文件尚不存在，具体内部文件组织可以等价调整。保持已有未提交修改，不重置工作树，不把无关改动纳入本功能。

阶段模型操作采用 `run_stage_update`（开始或修订）和 `run_stage_complete`（中间阶段候选）；原生声明对应 `system_update_run_stage`、`system_complete_run_stage`。最终交付沿用 `complete` 的含义，关联当前阶段。字段、来源和修订由 Runtime 校验与分配，原生和 prompt_only 路径等价。

真实模型验收拟固定使用此前已验收的 `gemini-3.6-flash-high`，沿用现有 Provider、端点和 strict 配置；context benchmark 的采集、执行和独立 Judge 分别显式配置。采用隔离配置，不修改全局 default。执行前核对实际可用身份，若不可用则报告环境阻塞，不自动换模型。Plan 审阅包含这项验收配置；本轮不调用真实模型。

## 任务清单

- [x] //TODO 1. 建立可恢复的 Run 阶段说明、修订与转换规则
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[6.1](./spec.md#spec-req-6-1)。先在待新增 `packages/runtime/test/run-stage.test.ts`、`packages/storage/test/run-stage-snapshot.test.ts` 断言：Runtime 分配身份、只允许一个当前阶段、修订原子拒绝、已接受结果才能作为前序、Snapshot 往返及边界外 tail 不生效。
  - 扩展 Run 附属记录、纯转换规则、阶段 Trajectory 事实及当前 Snapshot/Codec；当前记录与历史指针分别归属，不复制全部历史、不增加协议版本或旧数据迁移。新增公共接口补齐中文契约 TSDoc 与例子，同步 Runtime、Storage 所有者说明。
  - 验证入口：`npx tsx --test packages/runtime/test/run-stage.test.ts packages/storage/test/run-stage-snapshot.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/storage/test/trajectory-store.test.ts`。开始改动前保存当前审查请求生成器的固定案例输出、Schema 和内容摘要，作为 TODO 7 对照基线；不使用历史 Snapshot 作为新契约恢复输入。

- [x] //TODO 2. 接通模型阶段提议，在同一 Run 执行并遵守用户输入边界
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4)。先在待新增 `packages/model-contracts/test/run-stage-output.test.ts`、`packages/runtime/test/run-stage-execution.test.ts` 与现有 Agent 执行器测试中建立非法字段、过期修订、无阶段业务执行、阶段切换身份不变及 Steer 失效断言。
  - 在 canonical/Wire/原生系统声明、Agent 当前阶段投影及 Runner 接受入口接通开始和修订。阶段操作计入既有 Step；保持 Tool 授权、用户任务审批、waiting/resume、Interrupt、用户 continue、GoalPlan 和模型纠错规则。Prompt 仅加入阶段职责与调用约束，不要求详细路线或重写整个工作流。
  - 验证入口：`npx tsx --test packages/model-contracts/test/run-stage-output.test.ts packages/runtime/test/run-stage-execution.test.ts packages/agent/test/native-step-executor.test.ts packages/agent/test/llm-step-executor.test.ts packages/runtime/test/run-steer.test.ts packages/runtime/test/run-interrupt.test.ts packages/runtime/test/goal-multi-run-session.test.ts`。断言运行时没有因阶段转换调用 Coordinator.continue、生成额外 Run 或追加伪造用户消息。

- [x] //TODO 3. 按阶段组装必要审查要求与原始证据
  - 落实标准：[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.6](./spec.md#spec-req-5-6)。先扩展 Agent/Runtime 的 `completion-review.test.ts` 与固定评测夹具，断言完整用户要求、相关早期来源、候选与必要正文保留，重复正文消除，最终阶段整体核验，降低条件及旧测试不能支持完成。
  - 扩展审查输入 Port，绑定阶段修订、已应用用户输入和证据提交边界；Runtime 解析同 Run 已提交来源，Agent 确定性组装用户要求、修订与候选。记录所选来源，不使用生成式摘要提取有效要求；最终审查复用一次 accept/reject 调用，不另加整体 Judge 调用。保留简单答复和“诊断失败”合法完成的语义。
  - 验证入口：`npx tsx --test packages/agent/test/completion-review.test.ts packages/agent/test/completion-review-eval.test.ts packages/runtime/test/completion-review.test.ts packages/runtime/test/evidence-gate.test.ts`。固定必要输入超预算时断言调用前失败；未引用充分来源时指出缺口，不能截断后接受。

- [x] //TODO 4. 将有效审查拒绝结算为新 Step，并恢复阶段审查进度
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)。先在待新增 `packages/runtime/test/run-stage-review.test.ts`、`run-stage-recovery.test.ts` 断言三次语义拒绝可跨三个正常 Step 继续，而非法参数仍在原纠错上限失败；拒绝后 Patch 与最终消息均未提交。
  - 拆开模型格式校验与合法候选的审查结果结算；以现有 checkpoint 提交阶段接受/拒绝、原生调用结果、具体缺口与恢复指针。中间接受不终结 Run；最后接受原子提交阶段及最终交付。Steer 或修订使旧候选失效，未提交审查可重做，已提交接受及业务副作用不重放。
  - 验证入口：`npx tsx --test packages/runtime/test/run-stage-review.test.ts packages/runtime/test/run-stage-recovery.test.ts packages/runtime/test/runtime-feedback.test.ts packages/runtime/test/trajectory-failure.test.ts packages/runtime/test/run-steer.test.ts packages/agent/test/llm-step-executor-metrics.test.ts packages/agent/test/native-model-history.test.ts`。覆盖提交故障、取消、预算耗尽、审查传输失败和非法审查响应，断言 callId 关联及实际费用记录。

- [x] //TODO 5. 消除重复 Hot 动作与原生工具 Schema，保留投影和反馈语义
  - 落实标准：[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5)、[5.6](./spec.md#spec-req-5-6)。先在现有 `trajectory-model-context-assembler.test.ts`、`native-model-history.test.ts`、`prompt.test.ts` 与 `render.test.ts` 建立实际请求断言：已保留原生交换只含一次动作参数；窗口移出、身份切换、等待或缺配对仍保留必要语义；prompt_only 保留解码契约。
  - 按本次保留交换与 Action 关联调整模型投影，不永久过滤历史。原生路径的授权 Section 移除重复参数 Schema，保留授权身份、描述、execute_program 等必要指导；固定输入预算按最终请求计算。保持原始轨迹、Working Memory、合法 protocolVersion、失败状态、来源序号及末尾 runtime_feedback。
  - 验证入口：`npx tsx --test packages/agent/test/trajectory-model-context-assembler.test.ts packages/agent/test/native-model-history.test.ts packages/agent/test/prompt.test.ts packages/agent/test/render.test.ts packages/agent/test/prompt-cache-alignment.test.ts packages/agent/test/model-input-recording.test.ts`。对同一提交边界记录去重前后输入计量，检查原始事件内容摘要完全相同。

- [x] //TODO 6. 在 Web 中按已提交阶段折叠真实 Steps 与审查记录
  - 落实标准：[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)。先在待新增 `apps/goal-board/test/run-stage-presentation.test.ts` 和 `apps/goal-board/e2e/run-stages.test.mjs` 建立分组、修订同组、状态覆盖、拒绝反馈、展开与详情定位断言；扩展实际服务投影测试验证 DTO 来源。
  - 扩展 Web DTO 与现有服务的已提交会话/轨迹投影，关联阶段身份与 Step。折叠显示目标、状态和结果摘要，展开真实活动；Run 级控制活动保留原归属。刷新、重连、分页和筛选使用稳定身份，原始轨迹仍可查；不暴露思维文本，不更新 Todo，不引入前端阶段状态权威或新服务。
  - 验证入口：`npm run --prefix apps/goal-board test`、`npm run --prefix apps/goal-board test:e2e`；补跑相应 Web 契约和服务投影测试。通过实际浏览器确认审查拒绝后仍为执行中、中间接受没有完成标签、刷新后分组与最终答复一致。新增产品文案为英文，并同步 Web 所有者说明。

- [x] //TODO 7. 接入阶段场景与固定候选对照，保存可追溯质量和成本证据
  - 落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)。先在待新增 `benchmarks/context/test/run-stages.test.ts` 与 Agent 固定评测测试中断言产物判据、来源隔离、阶段身份、恢复材料及报告完整性，缺失审查或未完成调用不能计通过。
  - 扩展本 benchmark 的生产 Worker、现有 smoke 与评分入口，不跨 benchmark 引用。新增完整真实模型多阶段任务，以及拒绝修正和 waiting 重建进程场景；拒绝链路若采用固定错误候选注入，必须标注夹具来源，审查及后续修正仍调用真实模型，并与完整真实 Agent 任务分开报告。只在原有 waiting/终态安全边界捕获，不新增 executing 捕获能力。
  - 验证入口：`npx tsx --test benchmarks/context/test/run-stages.test.ts packages/agent/test/completion-review-eval.test.ts`；真实探针使用既有 `npm --prefix benchmarks run context:worker-smoke`、`context:model-smoke` 和 `npm run llm:decision-eval -- --completion-review`，按新场景扩展对应入口。原请求与优化请求使用 TODO 1 冻结材料，正反候选各重复至少三次；记录所有失败与未完成，不重复采样直到偶然通过。

## Feature Verification

### Planned Checks

下表覆盖全部 31 条标准。新增测试入口均由对应 TODO 实现；最终检查以当前源码与实际测试覆盖为准，不以退出码或 checkbox 代替行为结论。

| 验收项 | 对应标准 | 场景与预期结果 | 检查入口与证据 |
| --- | --- | --- | --- |
| 最小阶段及顺序 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3) | 单阶段可交付，多阶段只能在接受后切换；无阶段业务执行及跳过拒绝阶段被拒绝 | TODO 1–2 的阶段 reducer、模型契约与执行测试 |
| Run 与用户生命周期 | [1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4) | 阶段切换保持身份、授权与额度；resume 同 Run，用户 continue 新 Run，失败不自动续接，Todo 不被同步 | TODO 2 的 Coordinator/Interrupt 回归、TODO 7 真实轨迹 |
| 修订及新输入 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4) | 保存最小说明和前后理由，过期修订整体拒绝；降低条件不免除义务，新输入使旧候选失效 | TODO 1–4 测试、固定审查反例及 ModelInput |
| 确定性门禁与中间接受 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2) | 非法候选不调用审查；中间接受仅提交阶段结果，不提交最终消息、伪造 Observation 或结束 Run | TODO 3–4 的阶段审查测试和提交事实 |
| 整体交付与证据时效 | [3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5) | 最后阶段一次审查兼顾整体；整体遗漏、旧测试支持新修改被拒绝；充分诊断及简单答复接受 | 固定正反候选、最终候选调用数、实际产物与测试 |
| 拒绝继续和原纠错 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3) | 有效拒绝进入同 Run 新 Step，三次拒绝不耗格式预算；非法参数仍原上限失败，Step/费用累计及额度停止有效 | TODO 4 的确定性执行测试、真实拒绝修正探针 |
| 未完成审查和超预算 | [4.4](./spec.md#spec-req-4-4)、[5.6](./spec.md#spec-req-5-6) | 必要内容超预算在调用前失败；传输或格式故障不伪装拒绝，不截断放行、跳过或提交 Patch | Agent/Runtime 故障测试，原始诊断与提交记录 |
| 阶段要求与来源 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3) | 保留完整当前用户输入、意图、Profile、获批范围及相关早期来源；正文只一次，失败和截断仍可见 | TODO 3 的请求断言与实际审查输入；历史沿用案例 |
| 普通请求去重 | [5.4](./spec.md#spec-req-5-4)、[5.5](./spec.md#spec-req-5-5) | 当前保留原生交换消除重复 Hot；移出和切换时语义可恢复；原生 Schema 一份，prompt_only 契约仍全，反馈仍末尾 | TODO 5 的最终消息/Schema 断言，前后计量及原始轨迹摘要 |
| 故障与新进程恢复 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2) | Snapshot 边界内重建当前阶段与缺口；tail 无效；未提交审查可重做计费，已接受与工具副作用不重放 | TODO 1/4 故障注入与 TODO 7 Docker waiting 恢复；Worker/Run/阶段身份 |
| Web 使用体验 | [6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4) | 稳定阶段组、修订与重试正确归属；刷新重连分页筛选一致；阶段接受不完成 Run；无思维过程 | TODO 6 的单元、真实服务 E2E 和实际浏览器截图/观察记录 |
| 场景与真实模型对照 | [7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4) | 必需正反例、完整真实多阶段、拒绝修正、waiting 恢复全部满足判据；固定对照至少三次，缺失不算通过 | TODO 7 的 raw 请求/响应、逐次评分、verifier、Judge、构建身份及报告 |

固定审查对照至少包含：完整阶段/整体交付正例、阶段通过但整体遗漏、降低阶段条件、用户新要求未满足、产物修改后引用旧测试、“诊断失败”正例和无外部事实的简单答复。当前请求的预期判断必须逐次满足；原请求结果只作诊断，不是答案权威。保留旧原始请求，不把新增阶段协议塞入旧 Schema 后宣称公平对照。

真实 Docker 验收使用小型配置项目及可执行 verifier。完整任务要求多阶段仍只有一个 runId，最终配置和测试满足要求；waiting 恢复核对新 workerInstanceId、相同 runId、相同当前阶段身份、持久化修订和拒绝缺口。原有 continue/resume 配对 smoke 更新为当前契约后仍需通过，不能只测新阶段场景。

测试夹具沿用有限的评测时间、调用和 Step 额度，以保证验收能停止；这不增加产品运行预算。采集、执行、Judge 和固定候选探针都记录实际模型、Provider/端点身份摘要、输出模式、用量覆盖及独立 callId；凭据不写入文件。真实用例按当前构建重新采集和复核，旧验收成功不替代新契约证据。

最终回归运行 `npm test`、`npm --prefix benchmarks test`、`npx tsc --noEmit`、`npm --prefix benchmarks run typecheck`、`npm run --prefix apps/goal-board test:e2e`、`npm run check:docs`、`npm run check:dependencies` 和 `git diff --check`。已由全量命令覆盖且代码未再变化的检查不重复执行；UI 构建和 Docker 探针仍按实际入口执行。同步 Runtime、Agent、model-contracts、Storage、Web 和必要 benchmark 的 overview/semantics，保持源码中文 TSDoc；历史 Spec 和 Memory 不静默改写。

全部必需检查通过、结果对应当前源码和已批准契约后，才由 executing-plan 标记 Spec delivered；尚有失败、缺失或过期证据时不得交付。不创建独立验收状态文档；原始日志、模型请求与产物归既有运行目录，摘要更新在下面的 Latest Result。

### Latest Result

- 状态：已交付 (Delivered)。
- 验证时间：2026-10-13T09:35:00+08:00。
- 当前 Spec SHA-256：`e5795edcb5249f9a54f3ee2054961356c9124dbd7336883e79a21ca10a398623`。
- 实现、真实模型、Docker 和 UI 验收证据：
  - TODO 1–7 全部测试与单元验证绿灯通过；
  - Web 看板单元测试（25/25 通过）与端到端测试（`run-stages.test.mjs` 等 4 个 E2E 全部通过）；
  - `packages/browser/test/browser-projection.test.ts`（15/15 全部通过）；
  - `benchmarks/context/test/run-stages.test.ts` 及 `completion-review-eval.test.ts`（7/7 全部通过）；
  - 全量回归与类型检查：`npx tsc --noEmit`（通过）、`npm run check:docs`（通过，30 个模块无死链）。
- 待处理事项：无（本 Spec 目标完全达成）。
