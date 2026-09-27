# Prompt 基础指令与动态上下文分层实施计划

- [x] //TODO 1. 接入动态 Section 注册与固定指令分层

  - 实现目标：在 Agent 建立显式 `DynamicSectionRegistry`，注册首版五个 section，并将其状态投影移出固定 system 渲染路径。
  - 成功判据：改变 Run 模式、任务、GoalPlan、授权工具或 Working Memory 时，同阶段固定 system 文本不变；section 来源、角色和顺序稳定；测试注册的第六个 section 无需修改通用投影入口。
  - 验证方式：待实现的 `packages/agent/test/dynamic-section-registry.test.ts`；现有 `packages/agent/test/prompting-default-bundles.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 2. 扩充冻结 Prompt 与阶段行为说明

  - 实现目标：更新 Bundle v1 固定模板和 Think/Decide 阶段说明，保留冻结 Profile 与来源权限，并为参考场景建立真实 `o200k_base` 计数检查。
  - 成功判据：两阶段固定文本各为 2,000–3,000 tokens，所需行为主题完整且无冲突；动态文本和 Shape Guide 不参与计数；模板变量不二次执行。
  - 验证方式：待实现的 `packages/agent/test/fixed-instructions.test.ts`；现有 `packages/agent/test/prompting-renderer.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5), [1.6](./requirements.md#req-1-6), [2.2](./requirements.md#req-2-2)_

- [ ] //TODO 3. 保存模型可见 Section Frame 与提交边界

  - 实现目标：扩展当前 Trajectory/Snapshot 编解码及提交路径，在成功模型响应后记录带结构化投影和实际更新消息的阶段 frame。
  - 成功判据：恢复只读取 Snapshot 边界内的 frame；未提交 tail、未知 section ID 和身份不符的记录不能成为比较基线；真实 Conversation/Trajectory 事实不被改写。
  - 验证方式：待实现的 `packages/runtime/test/model-context-frame.test.ts` 与 `packages/storage/test/model-context-frame-store.test.ts`；现有 `packages/runtime/test/trajectory-checkpoint-committer.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [3.5](./requirements.md#req-3-5), [3.7](./requirements.md#req-3-7), [4.2](./requirements.md#req-4-2)_

- [ ] //TODO 4. 按 Section 生成替换与失效更新

  - 实现目标：让通用 Planner 依据同阶段保留 frame 的模型可见投影进行 diff，并以整段替换实现首版五个 section。
  - 成功判据：首次完整注入、未变不追加、仅未投影字段变化不追加、变化整段替换、移除发 tombstone；Working Memory 独立于 GoalPlan 更新。
  - 验证方式：待实现的 `packages/agent/test/dynamic-section-diff.test.ts`；现有 `packages/agent/test/render.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.6](./requirements.md#req-3-6)_

- [ ] //TODO 5. 接入阶段历史、Epoch 裁剪与请求预算

  - 实现目标：将 section frame 纳入现有上下文组装和裁剪，按阶段实际保留历史确定基线，并继续逐请求附带 Step 输入及原生工具 schema。
  - 成功判据：裁剪或 Epoch 切换后补齐丢失的当前 section；Think 与 Decide 不共享隐式基线；相同提交边界重建相同请求，必需内容放不下时调用前失败。
  - 验证方式：待实现的 `packages/agent/test/section-context-recovery.test.ts`；现有 `packages/agent/test/trajectory-model-context-assembler.test.ts` 和 `packages/agent/test/prompt-cache-alignment.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [2.4](./requirements.md#req-2-4), [4.1](./requirements.md#req-4-1), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 建立阶段专用模型绑定与直接 Decide 路径

  - 实现目标：将模型绑定改为同一 provider/model 的 Think 和 Decide Adapter，并使阶段执行器在直接 Decide 时保持现有本地决策校验。
  - 成功判据：支持原生 strict 的供应商在 Decide 使用严格约束，其余供应商使用 Shape Guide 与同一本地校验；直接有效决策只调用一次模型并按原 Runtime 规则推进。
  - 验证方式：待实现的 `packages/agent/test/stage-model-binding.test.ts`；现有 `packages/agent/test/llm-step-executor.test.ts` 与 `packages/llm/test/two-stage-config.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [5.2](./requirements.md#req-5-2), [6.1](./requirements.md#req-6-1)_

- [ ] //TODO 7. 接入模型驱动 Think 循环与中间检查点

  - 实现目标：在 Contracts/Agent/Runner 接入带目标的 `request_think`、`prompt_only` Think 和后续 Decide；每次 Think 输出先经 Trajectory/Snapshot 提交，再调用下一次 Decide。
  - 成功判据：直接 Decide 和同一 Step 连续三次请求 Think 后的 Decide 均可结束 Step；每轮 Think 目标明确并传入请求；不设置额外循环上限，Think 不增加 `stepCount`、不执行 Tool，最终决策才进入授权转换。
  - 验证方式：待实现的 `packages/runtime/test/think-decision-loop.test.ts` 与 `packages/contracts/test/request-think-contract.test.ts`；现有 `packages/runtime/test/model-output-runtime-boundary.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5)_

- [ ] //TODO 8. 完成 Think 链恢复与阶段失败处理

  - 实现目标：从已提交的 `pendingThink` 和 Think 事实恢复当前 Step，区分未提交调用、提交失败、Decide 失败与取消。
  - 成功判据：已提交 Think 后只重试对应 Decide；未提交输出和跨 Goal/Run/Step/模型输入的链被拒绝；任一阶段失败都不伪造有效决策或执行 Tool。
  - 验证方式：待实现的 `packages/runtime/test/think-decision-recovery.test.ts`；现有 `packages/runtime/test/trajectory-failure.test.ts` 和 `packages/storage/test/goal-snapshot-current.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 9. 验证完整授权、审批与证据链

  - 实现目标：为直接 Decide、多轮 Think、两类供应商 Decide 和分层上下文添加组合场景回归测试。
  - 成功判据：Plan Run 未获批时仍按 Prompt 先提案且不新增业务工具硬门控；Tool 授权、输出契约、GoalPlan/完成证据以及缺失上下文的 fail-closed 行为保持有效。
  - 验证方式：待实现的 `packages/runtime/test/prompt-context-integration.test.ts`；现有 `packages/agent/test/prompt.test.ts`、`packages/runtime/test/model-output-runtime-boundary.test.ts`，使用 `npx tsx --test`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4) | 变更动态状态或阶段不改写共享固定文本，冻结 Profile/Bundle 仍生效 | 固定模板与请求快照测试（待实现） |
| [1.5](./requirements.md#req-1-5), [1.6](./requirements.md#req-1-6) | 两阶段固定指令各在 2,000–3,000 `o200k_base` tokens，覆盖指定行为且无填充或冲突 | 真实 tokenizer 计数及逐主题断言（待实现） |
| [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3) | section 身份、来源、角色、顺序稳定；测试注册第六个 section 仍走通用流程 | Section Registry 测试（待实现） |
| [2.2](./requirements.md#req-2-2) | Tool/Lookup 文本和模型 Think 不进入固定指令，模板变量不二次执行 | 来源与注入边界测试（待实现） |
| [2.4](./requirements.md#req-2-4) | Step、pending Action、checkpoint、Hot/Warm、Lookup 等本轮输入每次请求均存在 | 逐请求组装测试（待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 首次完整、未变省略、未投影字段变化省略、投影变化追加更新 | Section diff 测试（待实现） |
| [3.4](./requirements.md#req-3-4), [3.6](./requirements.md#req-3-6) | section 移除发失效消息；Working Memory 整段替换且与 GoalPlan 分开 | Section diff 测试（待实现） |
| [3.5](./requirements.md#req-3-5), [3.7](./requirements.md#req-3-7) | 原始事实不被改写，比较投影、可见更新、已提交 frame 各司其职 | Trajectory frame 与历史测试（待实现） |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 裁剪、Epoch 切换或重启后补齐当前状态，未提交 tail 不提供基线 | Epoch/恢复测试（待实现） |
| [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4) | 相同提交输入重建同字节请求，各阶段只用实际可见基线并显式交接 Think | 请求确定性与跨阶段测试（待实现） |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | 未授权 Tool、无证据完成和非法 GoalPlan 更新被现有 Runtime/Contracts 拒绝 | Runtime 集成与输出契约测试（待实现） |
| [5.3](./requirements.md#req-5-3) | 未知 Bundle、缺失状态、未知 section 或超预算在请求前失败 | fail-closed 故障注入测试（待实现） |
| [5.4](./requirements.md#req-5-4) | Plan Run 未批准时模型收到先提案指令，Runtime 业务 Tool 权限仍按既有规则处理 | Plan Run 集成测试（待实现） |
| [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2) | 直接 Decide、多轮带目标 Think 和两类供应商 Decide 均通过对应输出与来源校验 | 阶段执行器、Contracts、Provider 测试（待实现） |
| [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4) | 中止/失败不提交假决策；已提交 Think 恢复只重试 Decide，失配链拒绝 | Runner/Storage 故障注入测试（待实现） |
| [6.5](./requirements.md#req-6-5) | Think 循环不增加 Step 或执行 Tool，有效 Decide 才推进 | Runner 阶段集成测试（待实现） |
| 全链路与风险 | 多轮 Think、历史裁剪、授权 Tool、恢复串联后结果正确；额外模型调用次数和 Context 溢出边界可观察 | `npm test`、类型与依赖检查，以及定向端到端故障测试；无需人工付费调用 |

### Latest Result

未执行。实施后按已提交代码状态和各验收结果记录实际检查、证据、整体状态与时效。
